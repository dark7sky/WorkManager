"""Google Calendar client with per-user tokens and resilient incremental sync."""
import base64
import hashlib
import json
import os
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import quote
from zoneinfo import ZoneInfo

import httpx
from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException

from .db import connection, row_dict

API = "https://www.googleapis.com/calendar/v3"
TOKEN_URL = "https://oauth2.googleapis.com/token"
DEFAULT_TZ = os.getenv("TZ", "Asia/Seoul")


class RemoteConflict(Exception):
    """The remote object changed since our last read (HTTP 412)."""


class RemoteAlreadyExists(Exception):
    """A deterministic Google event id already exists (HTTP 409)."""


def _fernet():
    secret = os.getenv("APP_SECRET", "")
    if not secret:
        raise RuntimeError("APP_SECRET is required for Google token storage")
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(secret.encode()).digest()))


def _enc(value):
    return _fernet().encrypt(value.encode()).decode() if value else None


def _dec(value):
    if not value:
        return None
    try:
        return _fernet().decrypt(value.encode()).decode()
    except InvalidToken:
        raise HTTPException(500, "저장된 Google 인증 정보를 복호화할 수 없습니다. APP_SECRET 변경 여부를 확인하세요.")


def save_tokens(user_id, email, token):
    expires = datetime.now(timezone.utc) + timedelta(seconds=int(token.get("expires_in", 3600)))
    with connection() as c:
        old = c.execute("SELECT refresh_token FROM oauth_tokens WHERE provider='google' AND user_id=?", (user_id,)).fetchone()
        refresh = token.get("refresh_token") or (_dec(old["refresh_token"]) if old else None)
        c.execute("""INSERT INTO oauth_tokens(provider,user_id,user_email,access_token,refresh_token,expires_at,scope,updated_at)
          VALUES('google',?,?,?,?,?,?,?) ON CONFLICT(provider,user_id) DO UPDATE SET user_email=excluded.user_email,
          access_token=excluded.access_token,refresh_token=excluded.refresh_token,expires_at=excluded.expires_at,
          scope=excluded.scope,updated_at=excluded.updated_at""",
          (user_id, email, _enc(token.get("access_token")), _enc(refresh), expires.isoformat(), token.get("scope", ""), datetime.now(timezone.utc).isoformat()))


def token_status(user_id):
    with connection() as c:
        row = c.execute("SELECT user_email,refresh_token,expires_at,scope FROM oauth_tokens WHERE provider='google' AND user_id=?", (user_id,)).fetchone()
    return {"connected": bool(row), "email": row["user_email"] if row else None,
            "has_refresh_token": bool(row and row["refresh_token"]), "scope": row["scope"] if row else ""}


def access_token(user_id):
    with connection() as c:
        row = c.execute("SELECT * FROM oauth_tokens WHERE provider='google' AND user_id=?", (user_id,)).fetchone()
    if not row:
        raise HTTPException(409, "Google Calendar가 연결되지 않았습니다. Google로 다시 로그인하세요.")
    expires = datetime.fromisoformat(row["expires_at"]) if row["expires_at"] else datetime.min.replace(tzinfo=timezone.utc)
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires > datetime.now(timezone.utc) + timedelta(seconds=60):
        return _dec(row["access_token"])
    refresh = _dec(row["refresh_token"])
    if not refresh:
        raise HTTPException(409, "Google refresh token이 없습니다. 캘린더 권한을 허용해 다시 연결하세요.")
    try:
        r = httpx.post(TOKEN_URL, data={"client_id": os.getenv("GOOGLE_CLIENT_ID"), "client_secret": os.getenv("GOOGLE_CLIENT_SECRET"),
                                      "refresh_token": refresh, "grant_type": "refresh_token"}, timeout=20)
        r.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(502, f"Google token 갱신 실패: {exc}")
    data = r.json()
    data["refresh_token"] = refresh
    save_tokens(user_id, row["user_email"], data)
    return data["access_token"]


def _request(user_id, method, path, *, allow_gone=False, allow_exists=False, **kwargs):
    headers = {**kwargs.pop("headers", {}), "Authorization": f"Bearer {access_token(user_id)}"}
    try:
        r = httpx.request(method, API + path, headers=headers, timeout=25, **kwargs)
        if r.status_code == 404:
            return None
        if r.status_code == 410 and allow_gone:
            return {"_gone": True}
        if r.status_code == 409 and allow_exists:
            raise RemoteAlreadyExists()
        if r.status_code == 412:
            raise RemoteConflict()
        r.raise_for_status()
        return r.json() if r.content else {}
    except (RemoteConflict, RemoteAlreadyExists):
        raise
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text[:500]
        raise HTTPException(502, f"Google Calendar API 오류 ({exc.response.status_code}): {detail}")
    except httpx.HTTPError as exc:
        raise HTTPException(502, f"Google Calendar에 연결할 수 없습니다: {exc}")


def list_calendars(user_id):
    items, page = [], None
    while True:
        data = _request(user_id, "GET", "/users/me/calendarList", params={"maxResults": 250, **({"pageToken": page} if page else {})}) or {}
        items.extend({"id": x["id"], "summary": x.get("summary", x["id"]), "primary": x.get("primary", False),
                      "access_role": x.get("accessRole"), "background_color": x.get("backgroundColor")}
                     for x in data.get("items", []) if x.get("accessRole") in ("owner", "writer"))
        page = data.get("nextPageToken")
        if not page:
            return items


def selected_calendar(user_id):
    with connection() as c:
        row = c.execute("SELECT value FROM app_settings WHERE user_id=? AND key='google_calendar_id'", (user_id,)).fetchone()
    return row["value"] if row else None


def last_sync_at(user_id, calendar_id):
    if not calendar_id:
        return None
    with connection() as c:
        row = c.execute("SELECT updated_at FROM google_sync_state WHERE user_id=? AND calendar_id=?", (user_id, calendar_id)).fetchone()
    return row["updated_at"] if row else None


def select_calendar(user_id, calendar_id, policy="keep"):
    """Select destination for *new* events. Existing mappings stay on their calendar.

    ``keep`` is intentionally the only automatic policy: silently copying/moving
    existing mappings creates duplicates. A future explicit migration can be a
    separate, resumable operation.
    """
    if policy != "keep":
        raise HTTPException(422, "지원하지 않는 캘린더 전환 정책입니다. 기존 일정 유지(keep)만 사용할 수 있습니다.")
    if calendar_id not in {x["id"] for x in list_calendars(user_id)}:
        raise HTTPException(422, "캘린더가 없거나 쓰기 권한이 없습니다")
    previous = selected_calendar(user_id)
    with connection() as c:
        c.execute("""INSERT INTO app_settings(user_id,key,value,updated_at) VALUES(?,'google_calendar_id',?,?)
          ON CONFLICT(user_id,key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at""",
                  (user_id, calendar_id, datetime.now(timezone.utc).isoformat()))
    return {"selected_calendar_id": calendar_id, "previous_calendar_id": previous, "policy": "keep"}


def _local_datetime(value):
    """Normalize RFC3339 into configured wall time so SQLite/browser dates agree."""
    if not value:
        return value
    if len(value) == 10:  # all-day Google date
        return value + "T00:00:00"
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo:
            parsed = parsed.astimezone(ZoneInfo(DEFAULT_TZ)).replace(tzinfo=None)
        return parsed.isoformat(timespec="seconds")
    except (ValueError, TypeError):
        return value


def event_local_date(event, field="start_at"):
    """Date key used by /today; exported to keep timezone rules in one place."""
    return (_local_datetime(event.get(field)) or "")[:10]


def _google_body(event):
    common = {"summary": event["title"], "description": event.get("description") or "", "location": event.get("location") or ""}
    if event.get("local_uid"):
        common["extendedProperties"] = {"private": {"workmanager_uid": event["local_uid"]}}
    if event.get("google_is_all_day"):
        # Google all-day end dates are exclusive; retain that representation.
        body = {**common, "start": {"date": event["start_at"][:10]}, "end": {"date": event["end_at"][:10]}}
    else:
        body = {**common, "start": {"dateTime": event["start_at"], "timeZone": DEFAULT_TZ},
                "end": {"dateTime": event["end_at"], "timeZone": DEFAULT_TZ}}
    # PATCH deliberately omits recurrence for expanded occurrences. Google owns
    # the series rule; sending an empty/stale value can truncate the whole series.
    if not event.get("google_recurring_event_id"):
        recurrence = event.get("recurrence") or []
        if isinstance(recurrence, str):
            try:
                recurrence = json.loads(recurrence)
            except (TypeError, ValueError):
                recurrence = []
        if recurrence:
            body["recurrence"] = recurrence
    return body


def _series_recurrence(user_id, calendar_id, recurring_id, cache):
    """Fetch a series master once and preserve its RRULE on occurrences."""
    if not recurring_id:
        return []
    if recurring_id not in cache:
        master = _request(user_id, "GET", f"/calendars/{quote(calendar_id, safe='')}/events/{quote(recurring_id, safe='')}") or {}
        cache[recurring_id] = master.get("recurrence") or []
    return cache[recurring_id]


def _remote_snapshot(remote):
    if not remote:
        return None
    start, end = remote.get("start", {}), remote.get("end", {})
    return {"status": remote.get("status"), "title": remote.get("summary") or "(제목 없음)", "description": remote.get("description") or "",
            "location": remote.get("location") or "", "start_at": _local_datetime(start.get("dateTime") or start.get("date")),
            "end_at": _local_datetime(end.get("dateTime") or end.get("date")), "google_is_all_day": bool(start.get("date")),
            "recurrence": remote.get("recurrence") or [], "etag": remote.get("etag"), "updated": remote.get("updated")}


def _remote_local_uid(remote):
    return (remote.get("extendedProperties", {}).get("private", {}) or {}).get("workmanager_uid") or str(uuid.uuid4())


def _store_conflict(user_id, event, remote=None):
    if remote is None and event.get("google_event_id") and event.get("google_calendar_id"):
        remote = _request(user_id, "GET", f"/calendars/{quote(event['google_calendar_id'], safe='')}/events/{quote(event['google_event_id'], safe='')}", allow_gone=True)
        if remote and (remote.get("_gone") or remote.get("status") == "cancelled"):
            remote = None
    with connection() as c:
        c.execute("UPDATE events SET sync_state='conflict',conflict_remote_json=?,conflict_detected_at=? WHERE id=? AND user_id=?",
                  (json.dumps(_remote_snapshot(remote), ensure_ascii=False) if remote else None,
                   datetime.now(timezone.utc).isoformat(), event["id"], user_id))


def _mark_event(event_id, state, *, google_id=None, calendar_id=None, etag=None, google_updated=None):
    fields, values = ["sync_state=?"], [state]
    for name, value in (("google_event_id", google_id), ("google_calendar_id", calendar_id),
                        ("google_etag", etag), ("google_updated_at", google_updated)):
        if value is not None:
            fields.append(f"{name}=?")
            values.append(value)
    with connection() as c:
        c.execute(f"UPDATE events SET {','.join(fields)} WHERE id=?", (*values, event_id))


def _ensure_local_uid(event):
    uid = event.get("local_uid")
    if uid:
        return uid
    # UUID hex is accepted by Google's base32hex event-id alphabet and makes a
    # retried INSERT address the same remote resource.
    uid = uuid.uuid4().hex
    with connection() as c:
        c.execute("UPDATE events SET local_uid=? WHERE id=? AND user_id=?", (uid, event["id"], event["user_id"]))
    event["local_uid"] = uid
    return uid


def _google_insert_id(local_uid):
    # App UUIDs may contain hyphens, which Google's event-id alphabet rejects.
    # A stable hex digest is valid base32hex and remains deterministic on retry.
    return hashlib.sha256(local_uid.encode()).hexdigest()[:32]


def push_event(user_id, event):
    # A mapped event always stays in its original calendar after selection changes.
    calendar_id = event.get("google_calendar_id") or selected_calendar(user_id)
    if not calendar_id:
        return event
    base = f"/calendars/{quote(calendar_id, safe='')}/events"
    try:
        if event.get("google_event_id"):
            headers = {"If-Match": event["google_etag"]} if event.get("google_etag") else {}
            data = _request(user_id, "PATCH", base + "/" + quote(event["google_event_id"], safe=""),
                            json=_google_body(event), headers=headers)
            if data is None:  # Deleted remotely: recreate only an explicitly dirty local event.
                event["local_uid"] = uuid.uuid4().hex
                with connection() as c:
                    c.execute("UPDATE events SET local_uid=?,google_event_id=NULL,google_etag=NULL WHERE id=? AND user_id=?",
                              (event["local_uid"], event["id"], user_id))
                google_id = _google_insert_id(event["local_uid"])
                try:
                    data = _request(user_id, "POST", base, json={**_google_body(event), "id": google_id}, allow_exists=True)
                except RemoteAlreadyExists:
                    data = _request(user_id, "GET", base + "/" + quote(google_id, safe=""))
                if data is None:
                    raise HTTPException(502, "삭제된 Google 일정의 재생성 결과를 확인할 수 없습니다")
        else:
            uid = _ensure_local_uid(event)
            google_id = _google_insert_id(uid)
            body = {**_google_body(event), "id": google_id}
            try:
                data = _request(user_id, "POST", base, json=body, allow_exists=True)
            except RemoteAlreadyExists:
                # The first POST may have committed while its response was lost.
                data = _request(user_id, "GET", base + "/" + quote(google_id, safe=""))
                if data is None:
                    raise HTTPException(502, "Google 일정 생성 결과를 확인할 수 없습니다")
    except RemoteConflict:
        _store_conflict(user_id, event)
        return {**event, "sync_state": "conflict", "sync_pending": True}
    _mark_event(event["id"], "synced", google_id=data["id"], calendar_id=calendar_id,
                etag=data.get("etag"), google_updated=data.get("updated"))
    return data


def resolve_conflict(user_id, event_id, strategy):
    with connection() as c:
        row = c.execute("SELECT * FROM events WHERE id=? AND user_id=? AND sync_state='conflict' AND deleted_at IS NULL",
                        (event_id, user_id)).fetchone()
    if not row:
        raise HTTPException(404, "해결할 동기화 충돌이 없습니다")
    event = dict(row)
    if strategy == "remote":
        snapshot = json.loads(event.get("conflict_remote_json") or "null")
        if not snapshot:
            raise HTTPException(409, "원격 충돌 스냅샷이 없습니다. 다시 동기화하세요")
        if snapshot.get("status") == "cancelled":
            with connection() as c:
                c.execute("UPDATE events SET deleted_at=?,sync_state='remote_deleted',conflict_remote_json=NULL,conflict_detected_at=NULL WHERE id=? AND user_id=?",
                          (datetime.now().isoformat(timespec="seconds"), event_id, user_id))
            return {"ok": True, "strategy": "remote", "sync_state": "remote_deleted"}
        fields = {k: snapshot.get(k) for k in ("title", "description", "location", "start_at", "end_at", "google_is_all_day")}
        recurrence = snapshot.get("recurrence") or json.loads(event.get("recurrence") or "[]")
        with connection() as c:
            c.execute("""UPDATE events SET title=?,description=?,location=?,start_at=?,end_at=?,google_is_all_day=?,
              recurrence=?,google_etag=?,google_updated_at=?,sync_state='synced',conflict_remote_json=NULL,conflict_detected_at=NULL,updated_at=?
              WHERE id=? AND user_id=?""",
                      (*fields.values(), json.dumps(recurrence, ensure_ascii=False), snapshot.get("etag"), snapshot.get("updated"),
                       datetime.now().isoformat(timespec="seconds"), event_id, user_id))
        return {"ok": True, "strategy": "remote", "sync_state": "synced"}
    if strategy == "local":
        snapshot = json.loads(event.get("conflict_remote_json") or "null") or {}
        with connection() as c:
            c.execute("UPDATE events SET google_etag=?,sync_state='dirty',conflict_remote_json=NULL,conflict_detected_at=NULL WHERE id=? AND user_id=?",
                      (snapshot.get("etag"), event_id, user_id))
            fresh = dict(c.execute("SELECT * FROM events WHERE id=? AND user_id=?", (event_id, user_id)).fetchone())
        result = push_event(user_id, fresh)
        state = "conflict" if result.get("sync_state") == "conflict" else "synced"
        return {"ok": state == "synced", "strategy": "local", "sync_state": state}
    raise HTTPException(422, "strategy는 local 또는 remote여야 합니다")


def delete_event(user_id, google_event_id, calendar_id):
    _request(user_id, "DELETE", f"/calendars/{quote(calendar_id, safe='')}/events/{quote(google_event_id, safe='')}")
    with connection() as c:
        c.execute("DELETE FROM deleted_google_events WHERE user_id=? AND google_event_id=? AND calendar_id=?",
                  (user_id, google_event_id, calendar_id))


def prepare_restore_event(user_id, event_id):
    """Cancel deletion outbox and detach deleted remote identity before restore."""
    with connection() as c:
        row = c.execute("SELECT * FROM events WHERE id=? AND user_id=? AND deleted_at IS NOT NULL", (event_id, user_id)).fetchone()
    if not row:
        raise HTTPException(404, "복원할 일정을 찾을 수 없습니다")
    event = dict(row)
    remote = None
    if event.get("google_event_id") and event.get("google_calendar_id"):
        remote = _request(user_id, "GET", f"/calendars/{quote(event['google_calendar_id'], safe='')}/events/{quote(event['google_event_id'], safe='')}")
        if remote and (remote.get("status") == "cancelled" or not remote.get("start") or not remote.get("end")):
            remote = None
    with connection() as c:
        if event.get("google_event_id") and event.get("google_calendar_id"):
            c.execute("DELETE FROM deleted_google_events WHERE user_id=? AND google_event_id=? AND calendar_id=?",
                      (user_id, event["google_event_id"], event["google_calendar_id"]))
        if remote:
            snapshot = _remote_snapshot(remote)
            c.execute("""UPDATE events SET deleted_at=NULL,sync_state='synced',title=?,description=?,location=?,start_at=?,end_at=?,
              google_is_all_day=?,google_etag=?,google_updated_at=?,conflict_remote_json=NULL,conflict_detected_at=NULL WHERE id=? AND user_id=?""",
                      (snapshot["title"], snapshot["description"], snapshot["location"], snapshot["start_at"], snapshot["end_at"],
                       int(snapshot["google_is_all_day"]), snapshot["etag"], snapshot["updated"], event_id, user_id))
        else:
            c.execute("""UPDATE events SET deleted_at=NULL,sync_state='dirty',google_event_id=NULL,google_calendar_id=NULL,
              google_etag=NULL,google_updated_at=NULL,google_recurring_event_id=NULL,google_original_start=NULL,
              google_is_series_master=0,local_uid=?,conflict_remote_json=NULL,conflict_detected_at=NULL WHERE id=? AND user_id=?""",
                      (uuid.uuid4().hex, event_id, user_id))
        return row_dict(c.execute("SELECT * FROM events WHERE id=? AND user_id=?", (event_id, user_id)).fetchone())


def _history_days():
    try:
        days = int(os.getenv("GOOGLE_CALENDAR_HISTORY_DAYS", "90"))
    except ValueError:
        days = 90
    return max(7, min(days, 36500))


def _history_cutoff_date():
    return (datetime.now(timezone.utc) - timedelta(days=_history_days())).date().isoformat()


def _prune_history(user_id):
    """Drop imported mirrors of Google events that ended before the history window.

    Rows are removed directly, never through the tombstone flow, so the
    originals stay untouched in Google Calendar. Dirty or conflicted rows are
    kept until they resolve; purely local events are never pruned.
    """
    cutoff = _history_cutoff_date()
    with connection() as c:
        cur = c.execute("""DELETE FROM events WHERE user_id=? AND google_event_id IS NOT NULL
          AND sync_state!='dirty' AND conflict_remote_json IS NULL AND substr(end_at,1,10)<?""",
                        (user_id, cutoff))
        return cur.rowcount if cur.rowcount and cur.rowcount > 0 else 0


def _sync_token(user_id, calendar_id):
    with connection() as c:
        row = c.execute("SELECT sync_token FROM google_sync_state WHERE user_id=? AND calendar_id=?", (user_id, calendar_id)).fetchone()
    return row["sync_token"] if row else None


def _save_sync_token(user_id, calendar_id, token):
    if not token:
        return
    with connection() as c:
        c.execute("""INSERT INTO google_sync_state(user_id,calendar_id,sync_token,updated_at) VALUES(?,?,?,?)
          ON CONFLICT(user_id,calendar_id) DO UPDATE SET sync_token=excluded.sync_token,updated_at=excluded.updated_at""",
                  (user_id, calendar_id, token, datetime.now(timezone.utc).isoformat()))


def _fetch_remote_pages(user_id, base, sync_token=None):
    """Return (pages, next_sync_token, token_gone) without shared state."""
    page, next_sync, pages = None, None, []
    while True:
        params = {"singleEvents": "true", "showDeleted": "true", "maxResults": 2500}
        if sync_token:
            params["syncToken"] = sync_token
        else:
            params["timeMin"] = (datetime.now(timezone.utc) - timedelta(days=_history_days())).isoformat()
        if page:
            params["pageToken"] = page
        data = _request(user_id, "GET", base, params=params, allow_gone=True) or {}
        if data.get("_gone"):
            return [], None, True
        pages.append(data.get("items", []))
        page = data.get("nextPageToken")
        next_sync = data.get("nextSyncToken") or next_sync
        if not page:
            return pages, next_sync, False


def _sync_calendar(user_id, calendar_id):
    base = f"/calendars/{quote(calendar_id, safe='')}/events"
    deleted = []
    with connection() as c:
        deleted = [dict(x) for x in c.execute("SELECT * FROM deleted_google_events WHERE user_id=?", (user_id,)).fetchall()]
    delete_pending = 0
    for item in deleted:
        try:
            delete_event(user_id, item["google_event_id"], item["calendar_id"])
        except HTTPException:
            delete_pending += 1  # tombstone remains for next retry

    token = _sync_token(user_id, calendar_id)
    imported = updated = conflicts = 0
    remote_deleted_ids = []
    all_pages, next_token, gone = _fetch_remote_pages(user_id, base, token)
    if gone:
        with connection() as c:
            c.execute("DELETE FROM google_sync_state WHERE user_id=? AND calendar_id=?", (user_id, calendar_id))
        all_pages, next_token, _ = _fetch_remote_pages(user_id, base, None)
        token = None

    # Google only guarantees "cancelled" tombstones for a limited window; a
    # full (non-incremental) fetch can silently omit events deleted earlier.
    # Track everything the listing actually confirmed so stale local mirrors
    # can be reconciled below instead of lingering forever.
    full_resync = token is None
    remote_seen_ids = set()

    recurrence_cache = {}
    for items in all_pages:
        for remote in items:
            remote_id = remote.get("id")
            if full_resync:
                remote_seen_ids.add(remote_id)
            with connection() as c:
                existing = c.execute("SELECT * FROM events WHERE user_id=? AND google_calendar_id=? AND google_event_id=?",
                                     (user_id, calendar_id, remote_id)).fetchone()
                remote_uid = (remote.get("extendedProperties", {}).get("private", {}) or {}).get("workmanager_uid")
                matched_by_uid = False
                if not existing and remote_uid:
                    existing = c.execute("SELECT * FROM events WHERE user_id=? AND local_uid=?", (user_id, remote_uid)).fetchone()
                    matched_by_uid = bool(existing)
                if remote.get("status") == "cancelled":
                    if existing and existing["deleted_at"]:
                        # Keep the local trash copy restorable even after the
                        # corresponding Google event has been deleted.
                        continue
                    if existing and existing["sync_state"] == "dirty":
                        _store_conflict(user_id, dict(existing), remote); conflicts += 1
                    elif existing:
                        c.execute("UPDATE events SET deleted_at=?,sync_state='remote_deleted' WHERE id=?", (datetime.now().isoformat(timespec="seconds"), existing["id"])); updated += 1
                        remote_deleted_ids.append(existing["id"])
                    continue
                start_obj, end_obj = remote.get("start", {}), remote.get("end", {})
                start_raw = start_obj.get("dateTime") or start_obj.get("date")
                end_raw = end_obj.get("dateTime") or end_obj.get("date")
                if not existing and end_raw and end_raw[:10] < _history_cutoff_date():
                    continue  # incremental syncs can still carry edits to ancient events
                is_all_day = int(bool(start_obj.get("date")))
                recurring_id = remote.get("recurringEventId")
                recurrence = _series_recurrence(user_id, calendar_id, recurring_id, recurrence_cache)
                if recurring_id:
                    # Hide a local series master only once at least one expanded
                    # occurrence is present, avoiding a post-create UI gap.
                    c.execute("""UPDATE events SET google_is_series_master=1 WHERE user_id=? AND google_calendar_id=?
                      AND google_event_id=? AND google_recurring_event_id IS NULL""", (user_id, calendar_id, recurring_id))
                values = (remote.get("summary") or "(제목 없음)", remote.get("description") or "",
                          _local_datetime(start_raw), _local_datetime(end_raw), remote.get("location") or "",
                          remote.get("etag"), remote.get("updated"), recurring_id,
                          json.dumps(remote.get("originalStartTime") or {}, ensure_ascii=False),
                          json.dumps(recurrence, ensure_ascii=False), is_all_day, datetime.now().isoformat(timespec="seconds"))
                if existing:
                    # Missing legacy etags are treated conservatively: never overwrite
                    # a dirty local row merely because its remote baseline is unknown.
                    remote_changed = not existing["google_etag"] or remote.get("etag") != existing["google_etag"]
                    if matched_by_uid and not existing["google_event_id"]:
                        # Reconcile a committed POST whose response was lost.
                        c.execute("""UPDATE events SET title=?,description=?,start_at=?,end_at=?,location=?,google_etag=?,
                          google_updated_at=?,google_recurring_event_id=?,google_original_start=?,recurrence=?,google_is_all_day=?,updated_at=?,
                          sync_state='synced',google_event_id=?,google_calendar_id=? WHERE id=?""",
                                  (*values, remote_id, calendar_id, existing["id"])); updated += 1
                    elif existing["sync_state"] == "dirty" and remote_changed:
                        _store_conflict(user_id, dict(existing), remote); conflicts += 1
                    elif existing["sync_state"] != "dirty":
                        c.execute("""UPDATE events SET title=?,description=?,start_at=?,end_at=?,location=?,google_etag=?,
                          google_updated_at=?,google_recurring_event_id=?,google_original_start=?,recurrence=?,google_is_all_day=?,updated_at=?,sync_state='synced' WHERE id=?""",
                                  (*values, existing["id"])); updated += 1
                else:
                    local_uid = _remote_local_uid(remote)
                    c.execute("""INSERT INTO events(user_id,local_uid,title,description,start_at,end_at,location,google_etag,google_updated_at,
                      google_recurring_event_id,google_original_start,recurrence,google_is_all_day,created_at,updated_at,sync_state,google_event_id,google_calendar_id)
                      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                              (user_id, local_uid, *values[:-1], values[-1], values[-1], "synced", remote_id, calendar_id)); imported += 1

    if full_resync:
        cutoff = _history_cutoff_date()
        with connection() as c:
            mirrored = c.execute("""SELECT id,google_event_id FROM events WHERE user_id=? AND google_calendar_id=?
              AND google_event_id IS NOT NULL AND deleted_at IS NULL AND sync_state NOT IN ('dirty','conflict')
              AND google_is_series_master=0 AND substr(end_at,1,10)>=?""",
              (user_id, calendar_id, cutoff)).fetchall()
            stale_ids = [r["id"] for r in mirrored if r["google_event_id"] not in remote_seen_ids]
            if stale_ids:
                marks = ",".join("?" * len(stale_ids))
                c.execute(f"UPDATE events SET deleted_at=?,sync_state='remote_deleted' WHERE id IN ({marks})",
                          (datetime.now().isoformat(timespec="seconds"), *stale_ids))
        remote_deleted_ids.extend(stale_ids)
        updated += len(stale_ids)

    _save_sync_token(user_id, calendar_id, next_token)
    with connection() as c:
        # Soft-deleted, never-uploaded events must not be resurrected remotely.
        dirty = [dict(x) for x in c.execute(
            """SELECT * FROM events WHERE user_id=? AND sync_state='dirty' AND deleted_at IS NULL
               AND (google_calendar_id=? OR (google_calendar_id IS NULL AND ?=(SELECT value FROM app_settings WHERE user_id=? AND key='google_calendar_id')))""",
            (user_id, calendar_id, calendar_id, user_id)).fetchall()]
    pushed = pending = 0
    for event in dirty:
        try:
            result = push_event(user_id, event)
            if result.get("sync_state") == "conflict": conflicts += 1
            else: pushed += 1
        except HTTPException:
            pending += 1  # durable dirty state is retried on the next sync
    return {"ok": not (pending or delete_pending or conflicts), "pushed": pushed, "imported": imported, "updated": updated,
            "conflicts": conflicts, "pending": pending + delete_pending, "incremental": bool(token),
            "remote_deleted_ids": remote_deleted_ids}


def _acquire_sync_lease(user_id, calendar_id, seconds=900):
    owner = uuid.uuid4().hex
    now = datetime.now(timezone.utc)
    expires = now + timedelta(seconds=seconds)
    with connection() as c:
        c.execute("""INSERT OR IGNORE INTO google_sync_state(user_id,calendar_id,sync_token,updated_at,lease_owner,lease_until)
          VALUES(?,?,NULL,?,NULL,NULL)""", (user_id, calendar_id, now.isoformat()))
        cur = c.execute("""UPDATE google_sync_state SET lease_owner=?,lease_until=?,updated_at=?
          WHERE user_id=? AND calendar_id=? AND (lease_owner IS NULL OR lease_until IS NULL OR lease_until<?)""",
                        (owner, expires.isoformat(), now.isoformat(), user_id, calendar_id, now.isoformat()))
    return owner if cur.rowcount else None


def _release_sync_lease(user_id, calendar_id, owner):
    with connection() as c:
        c.execute("UPDATE google_sync_state SET lease_owner=NULL,lease_until=NULL WHERE user_id=? AND calendar_id=? AND lease_owner=?",
                  (user_id, calendar_id, owner))


def sync(user_id):
    selected = selected_calendar(user_id)
    if not selected:
        raise HTTPException(409, "먼저 Google 캘린더를 선택하세요")
    # Keep historically mapped calendars live after the destination changes.
    with connection() as c:
        mapped = {r["google_calendar_id"] for r in c.execute(
            "SELECT DISTINCT google_calendar_id FROM events WHERE user_id=? AND google_calendar_id IS NOT NULL AND deleted_at IS NULL", (user_id,)).fetchall()}
    calendar_ids = [selected, *sorted(x for x in mapped if x != selected)]
    total = {"ok": True, "pushed": 0, "imported": 0, "updated": 0, "conflicts": 0, "pending": 0,
             "remote_deleted_ids": [], "calendars": [], "locked_calendars": []}
    for calendar_id in calendar_ids:
        owner = _acquire_sync_lease(user_id, calendar_id)
        if not owner:
            total["ok"] = False
            total["locked_calendars"].append(calendar_id)
            continue
        try:
            result = _sync_calendar(user_id, calendar_id)
            total["calendars"].append({"calendar_id": calendar_id, **result})
            total["ok"] = total["ok"] and result["ok"]
            for key in ("pushed", "imported", "updated", "conflicts", "pending"):
                total[key] += result[key]
            total["remote_deleted_ids"].extend(result["remote_deleted_ids"])
        except HTTPException as exc:
            total["ok"] = False
            total["pending"] += 1
            total["calendars"].append({"calendar_id": calendar_id, "ok": False, "error": str(exc.detail)})
        finally:
            _release_sync_lease(user_id, calendar_id, owner)
    total["pruned"] = _prune_history(user_id)
    return total
