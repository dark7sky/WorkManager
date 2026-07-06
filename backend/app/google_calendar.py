"""Small Google Calendar REST client and single-user token store."""
import base64, hashlib, os
from datetime import datetime, timedelta, timezone

import httpx
from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException

from .db import connection

API = "https://www.googleapis.com/calendar/v3"
TOKEN_URL = "https://oauth2.googleapis.com/token"

def _fernet():
    secret = os.getenv("APP_SECRET", "")
    if not secret:
        raise RuntimeError("APP_SECRET is required for Google token storage")
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(secret.encode()).digest()))

def _enc(value): return _fernet().encrypt(value.encode()).decode() if value else None
def _dec(value):
    if not value: return None
    try: return _fernet().decrypt(value.encode()).decode()
    except InvalidToken: raise HTTPException(500, "Stored Google credentials cannot be decrypted; APP_SECRET may have changed")

def save_tokens(email, token):
    expires = datetime.now(timezone.utc) + timedelta(seconds=int(token.get("expires_in", 3600)))
    with connection() as c:
        old = c.execute("SELECT refresh_token FROM oauth_tokens WHERE provider='google'").fetchone()
        refresh = token.get("refresh_token") or (_dec(old["refresh_token"]) if old else None)
        c.execute("""INSERT INTO oauth_tokens(provider,user_email,access_token,refresh_token,expires_at,scope,updated_at)
          VALUES('google',?,?,?,?,?,?) ON CONFLICT(provider) DO UPDATE SET user_email=excluded.user_email,
          access_token=excluded.access_token,refresh_token=excluded.refresh_token,expires_at=excluded.expires_at,
          scope=excluded.scope,updated_at=excluded.updated_at""",
          (email,_enc(token.get("access_token")),_enc(refresh),expires.isoformat(),token.get("scope", ""),datetime.now(timezone.utc).isoformat()))

def token_status():
    with connection() as c: row=c.execute("SELECT user_email,refresh_token,expires_at,scope FROM oauth_tokens WHERE provider='google'").fetchone()
    return {"connected": bool(row), "email": row["user_email"] if row else None,
            "has_refresh_token": bool(row and row["refresh_token"]), "scope": row["scope"] if row else ""}

def access_token():
    with connection() as c: row=c.execute("SELECT * FROM oauth_tokens WHERE provider='google'").fetchone()
    if not row: raise HTTPException(409, "Google Calendar is not connected. Sign in with Google again.")
    expires = datetime.fromisoformat(row["expires_at"]) if row["expires_at"] else datetime.min.replace(tzinfo=timezone.utc)
    if expires.tzinfo is None: expires=expires.replace(tzinfo=timezone.utc)
    if expires > datetime.now(timezone.utc)+timedelta(seconds=60): return _dec(row["access_token"])
    refresh=_dec(row["refresh_token"])
    if not refresh: raise HTTPException(409, "Google did not issue a refresh token. Reconnect and grant Calendar access.")
    try:
        r=httpx.post(TOKEN_URL,data={"client_id":os.getenv("GOOGLE_CLIENT_ID"),"client_secret":os.getenv("GOOGLE_CLIENT_SECRET"),"refresh_token":refresh,"grant_type":"refresh_token"},timeout=20)
        r.raise_for_status()
    except httpx.HTTPError as e: raise HTTPException(502, f"Google token refresh failed: {e}")
    data=r.json(); data["refresh_token"]=refresh; save_tokens(row["user_email"],data); return data["access_token"]

def _request(method,path,**kwargs):
    try:
        r=httpx.request(method,API+path,headers={"Authorization":f"Bearer {access_token()}"},timeout=25,**kwargs)
        if r.status_code == 404: return None
        r.raise_for_status(); return r.json() if r.content else {}
    except httpx.HTTPStatusError as e:
        detail=e.response.text[:500]
        raise HTTPException(502,f"Google Calendar API error ({e.response.status_code}): {detail}")
    except httpx.HTTPError as e: raise HTTPException(502,f"Google Calendar is unavailable: {e}")

def list_calendars():
    items=[]; token=None
    while True:
        data=_request("GET","/users/me/calendarList",params={"maxResults":250,**({"pageToken":token} if token else {})})
        items += [{"id":x["id"],"summary":x.get("summary",x["id"]),"primary":x.get("primary",False),"access_role":x.get("accessRole"),"background_color":x.get("backgroundColor")} for x in data.get("items",[]) if x.get("accessRole") in ("owner","writer")]
        token=data.get("nextPageToken")
        if not token: return items

def selected_calendar():
    with connection() as c: row=c.execute("SELECT value FROM app_settings WHERE key='google_calendar_id'").fetchone()
    return row["value"] if row else None

def select_calendar(calendar_id):
    if calendar_id not in {x["id"] for x in list_calendars()}: raise HTTPException(422,"Calendar not found or is read-only")
    with connection() as c: c.execute("INSERT INTO app_settings(key,value,updated_at) VALUES('google_calendar_id',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",(calendar_id,datetime.now(timezone.utc).isoformat()))

def _google_body(event):
    return {"summary":event["title"],"description":event.get("description") or "","location":event.get("location") or "",
            "start":{"dateTime":event["start_at"],"timeZone":os.getenv("TZ","Asia/Seoul")},
            "end":{"dateTime":event["end_at"],"timeZone":os.getenv("TZ","Asia/Seoul")}}

def push_event(event):
    cal=selected_calendar()
    if not cal: return event
    from urllib.parse import quote
    base=f"/calendars/{quote(cal,safe='')}/events"
    if event.get("google_event_id") and event.get("google_calendar_id")==cal:
        data=_request("PUT",base+"/"+quote(event["google_event_id"],safe=""),json=_google_body(event))
        if data is None: data=_request("POST",base,json=_google_body(event))
    else: data=_request("POST",base,json=_google_body(event))
    with connection() as c: c.execute("UPDATE events SET google_event_id=?,google_calendar_id=?,updated_at=? WHERE id=?",(data["id"],cal,datetime.now().isoformat(timespec="seconds"),event["id"]))
    return data

def delete_event(google_event_id, calendar_id):
    from urllib.parse import quote
    _request("DELETE", f"/calendars/{quote(calendar_id,safe='')}/events/{quote(google_event_id,safe='')}")
    with connection() as c:
        c.execute("DELETE FROM deleted_google_events WHERE google_event_id=? AND calendar_id=?", (google_event_id, calendar_id))

def sync():
    cal=selected_calendar()
    if not cal: raise HTTPException(409,"Select a Google Calendar first")
    from urllib.parse import quote
    base=f"/calendars/{quote(cal,safe='')}/events"
    # Propagate explicit local deletions first.
    with connection() as c: deleted=c.execute("SELECT * FROM deleted_google_events WHERE calendar_id=?",(cal,)).fetchall()
    for x in deleted:
        _request("DELETE",base+"/"+quote(x["google_event_id"],safe=""))
        with connection() as c: c.execute("DELETE FROM deleted_google_events WHERE google_event_id=? AND calendar_id=?",(x["google_event_id"],cal))
    params={"singleEvents":"true","showDeleted":"true","maxResults":2500,"timeMin":(datetime.now(timezone.utc)-timedelta(days=365)).isoformat()}
    data=_request("GET",base,params=params); imported=updated=0
    with connection() as c:
        for x in data.get("items",[]):
            if x.get("status") == "cancelled":
                c.execute("DELETE FROM events WHERE google_calendar_id=? AND google_event_id=?", (cal, x["id"]))
                continue
            start=x.get("start",{}).get("dateTime") or x.get("start",{}).get("date")+"T00:00:00"
            end=x.get("end",{}).get("dateTime") or x.get("end",{}).get("date")+"T00:00:00"
            existing=c.execute("SELECT id FROM events WHERE google_calendar_id=? AND google_event_id=?",(cal,x["id"])).fetchone()
            vals=(x.get("summary") or "(제목 없음)",x.get("description") or "",start,end,x.get("location") or "",datetime.now().isoformat(timespec="seconds"))
            if existing:
                c.execute("UPDATE events SET title=?,description=?,start_at=?,end_at=?,location=?,updated_at=? WHERE id=?",(*vals,existing["id"])); updated+=1
            else:
                c.execute("INSERT INTO events(title,description,start_at,end_at,location,created_at,updated_at,google_event_id,google_calendar_id) VALUES(?,?,?,?,?,?,?,?,?)",(*vals,vals[-1],x["id"],cal)); imported+=1
    # Unlinked local events are new and should be created remotely. Mapped events
    # are updated immediately by the CRUD path, while remote edits above win here.
    with connection() as c: local=[dict(x) for x in c.execute("SELECT * FROM events WHERE google_calendar_id IS NULL").fetchall()]
    pushed=0
    for event in local:
        push_event(event); pushed+=1
    return {"ok":True,"pushed":pushed,"imported":imported,"updated":updated}
