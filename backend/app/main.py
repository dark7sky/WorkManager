import json
import os
import secrets
import time
from datetime import date, datetime
from urllib.parse import urlencode

import httpx
from fastapi import Body, Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from . import ai, google_calendar
from .auth import create_session, require_user, verify_credentials
from .db import connection, init_db, row_dict

app = FastAPI(title="WorkManager API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=[x for x in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if x],
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
def startup():
    if os.getenv("COOKIE_SECURE", "false").lower() == "true":
        if os.getenv("APP_SECRET", "development-secret-change-me") == "development-secret-change-me":
            raise RuntimeError("Production requires a strong APP_SECRET")
        if os.getenv("APP_LOGIN_PASSWORD", "change-me-now") == "change-me-now":
            raise RuntimeError("Production requires a non-default APP_LOGIN_PASSWORD")
    init_db()


class Login(BaseModel):
    user_id: str
    password: str


def now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def rows(table: str, where: str = "", args=()):
    with connection() as c:
        return [row_dict(r) for r in c.execute(f"SELECT * FROM {table} {where}", args).fetchall()]


@app.get("/api/health")
def health(): return {"ok": True}


_login_attempts: dict[str, list[float]] = {}


@app.post("/api/auth/login")
def login(payload: Login, request: Request, response: Response):
    client = request.client.host if request.client else "unknown"
    cutoff = time.monotonic() - 300
    attempts = [stamp for stamp in _login_attempts.get(client, []) if stamp > cutoff]
    if len(attempts) >= 8:
        raise HTTPException(429, "로그인 시도가 너무 많습니다. 5분 후 다시 시도하세요")
    if not verify_credentials(payload.user_id, payload.password):
        attempts.append(time.monotonic())
        _login_attempts[client] = attempts
        raise HTTPException(401, "아이디 또는 비밀번호가 올바르지 않습니다")
    _login_attempts.pop(client, None)
    response.set_cookie("wm_session", create_session(payload.user_id), httponly=True, samesite="lax", secure=os.getenv("COOKIE_SECURE", "false").lower() == "true", max_age=1209600)
    return {"user": {"id": payload.user_id}}


@app.post("/api/auth/logout")
def logout(response: Response):
    response.delete_cookie("wm_session")
    return {"ok": True}


@app.get("/api/auth/me")
def me(user=Depends(require_user)): return {"user": {"id": user}}


@app.get("/api/auth/config")
def auth_config():
    return {"google_enabled": bool(os.getenv("GOOGLE_CLIENT_ID") and os.getenv("GOOGLE_CLIENT_SECRET"))}


@app.get("/api/auth/google/start")
def google_start(request: Request):
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    if not client_id: raise HTTPException(404, "Google 로그인이 설정되지 않았습니다")
    state = secrets.token_urlsafe(24)
    redirect_uri = os.getenv("GOOGLE_REDIRECT_URI", str(request.url_for("google_callback")))
    url = "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode({"client_id": client_id, "redirect_uri": redirect_uri, "response_type": "code", "scope": "openid email profile https://www.googleapis.com/auth/calendar", "state": state, "prompt": "consent select_account", "access_type": "offline", "include_granted_scopes": "true"})
    response = RedirectResponse(url)
    response.set_cookie("google_oauth_state", state, httponly=True, samesite="lax",
                        secure=os.getenv("COOKIE_SECURE", "false").lower() == "true", max_age=600)
    return response


@app.get("/api/auth/google/callback", name="google_callback")
async def google_callback(request: Request, code: str, state: str):
    if not secrets.compare_digest(state, request.cookies.get("google_oauth_state", "")):
        raise HTTPException(400, "OAuth state가 올바르지 않습니다")
    redirect_uri = os.getenv("GOOGLE_REDIRECT_URI", str(request.url_for("google_callback")))
    async with httpx.AsyncClient(timeout=20) as client:
        token = await client.post("https://oauth2.googleapis.com/token", data={"code": code, "client_id": os.getenv("GOOGLE_CLIENT_ID"), "client_secret": os.getenv("GOOGLE_CLIENT_SECRET"), "redirect_uri": redirect_uri, "grant_type": "authorization_code"})
        if token.is_error: raise HTTPException(401, "Google 토큰 교환에 실패했습니다")
        info = await client.get("https://openidconnect.googleapis.com/v1/userinfo", headers={"Authorization": f"Bearer {token.json()['access_token']}"})
        if info.is_error: raise HTTPException(401, "Google 사용자 확인에 실패했습니다")
    email = info.json().get("email", "")
    allowed = {x.strip().lower() for x in os.getenv("GOOGLE_ALLOWED_EMAIL", "").split(",") if x.strip()}
    google_token_payload = token.json()
    if not allowed or email.lower() not in allowed: raise HTTPException(403, "허용되지 않은 Google 계정입니다")
    google_calendar.save_tokens(email, google_token_payload)
    response = RedirectResponse(os.getenv("FRONTEND_URL", "/"))
    response.set_cookie("wm_session", create_session(email), httponly=True, samesite="lax", secure=os.getenv("COOKIE_SECURE", "false").lower() == "true", max_age=1209600)
    response.delete_cookie("google_oauth_state")
    return response


CONFIG = {
    "tasks": ({"title", "description", "status", "priority", "progress", "start_date", "due_date", "tags"}, "updated_at"),
    "events": ({"title", "description", "start_at", "end_at", "location"}, "updated_at"),
    "todos": ({"title", "todo_date", "completed"}, None),
    "work_logs": ({"content", "log_date", "task_id"}, None),
}


def normalize(table, data):
    result = {k: v for k, v in data.items() if k in CONFIG[table][0]}
    if "tags" in result: result["tags"] = json.dumps(result["tags"], ensure_ascii=False)
    if "completed" in result: result["completed"] = int(bool(result["completed"]))
    if "progress" in result: result["progress"] = max(0, min(100, int(result["progress"])))
    return result


def create_item(table, data):
    data = normalize(table, data); timestamp = now()
    if table in ("tasks", "events"): data.update(created_at=timestamp, updated_at=timestamp)
    else: data["created_at"] = timestamp
    required = {"tasks": "title", "events": "title", "todos": "title", "work_logs": "content"}[table]
    if not data.get(required): raise HTTPException(422, f"{required} is required")
    if table == "events" and (not data.get("start_at") or not data.get("end_at")): raise HTTPException(422, "start_at and end_at are required")
    if table == "todos" and not data.get("todo_date"): data["todo_date"] = date.today().isoformat()
    if table == "work_logs" and not data.get("log_date"): data["log_date"] = date.today().isoformat()
    cols = list(data)
    with connection() as c:
        cur = c.execute(f"INSERT INTO {table} ({','.join(cols)}) VALUES ({','.join('?' for _ in cols)})", [data[x] for x in cols])
        item = row_dict(c.execute(f"SELECT * FROM {table} WHERE id=?", (cur.lastrowid,)).fetchone())
    if table == "events" and google_calendar.token_status()["connected"] and google_calendar.selected_calendar():
        try:
            google_calendar.push_event(item)
            item = rows("events", "WHERE id=?", (item["id"],))[0]
        except HTTPException:
            item["sync_pending"] = True
    return item


def update_item(table, item_id, data):
    data = normalize(table, data)
    if CONFIG[table][1]: data[CONFIG[table][1]] = now()
    if not data: raise HTTPException(422, "변경할 값이 없습니다")
    with connection() as c:
        if not c.execute(f"SELECT 1 FROM {table} WHERE id=?", (item_id,)).fetchone(): raise HTTPException(404, "항목을 찾을 수 없습니다")
        c.execute(f"UPDATE {table} SET {','.join(f'{x}=?' for x in data)} WHERE id=?", [*data.values(), item_id])
        item = row_dict(c.execute(f"SELECT * FROM {table} WHERE id=?", (item_id,)).fetchone())
    if table == "events" and google_calendar.token_status()["connected"] and google_calendar.selected_calendar():
        try:
            google_calendar.push_event(item)
            item = rows("events", "WHERE id=?", (item_id,))[0]
        except HTTPException:
            item["sync_pending"] = True
    return item


for _table in CONFIG:
    def list_endpoint(table=_table, user=Depends(require_user)):
        order = "start_at" if table == "events" else ("todo_date" if table == "todos" else ("log_date" if table == "work_logs" else "created_at"))
        return rows(table, f"ORDER BY {order} DESC")
    def get_endpoint(item_id: int, table=_table, user=Depends(require_user)):
        items = rows(table, "WHERE id=?", (item_id,))
        if not items: raise HTTPException(404, "항목을 찾을 수 없습니다")
        return items[0]
    def post_endpoint(payload: dict = Body(...), table=_table, user=Depends(require_user)): return create_item(table, payload)
    def patch_endpoint(item_id: int, payload: dict = Body(...), table=_table, user=Depends(require_user)): return update_item(table, item_id, payload)
    def delete_endpoint(item_id: int, table=_table, user=Depends(require_user)):
        remote_event = None
        with connection() as c:
            existing = c.execute(f"SELECT * FROM {table} WHERE id=?", (item_id,)).fetchone()
            if table == "events" and existing and existing["google_event_id"] and existing["google_calendar_id"]:
                remote_event = (existing["google_event_id"], existing["google_calendar_id"])
                c.execute("INSERT OR IGNORE INTO deleted_google_events(google_event_id,calendar_id,created_at) VALUES(?,?,?)", (existing["google_event_id"], existing["google_calendar_id"], now()))
            if not c.execute(f"DELETE FROM {table} WHERE id=?", (item_id,)).rowcount: raise HTTPException(404, "항목을 찾을 수 없습니다")
        sync_pending = False
        if remote_event:
            try: google_calendar.delete_event(*remote_event)
            except HTTPException: sync_pending = True
        return {"ok": True, "sync_pending": sync_pending}
    app.add_api_route(f"/api/{_table}", list_endpoint, methods=["GET"], name=f"list_{_table}")
    app.add_api_route(f"/api/{_table}/{{item_id}}", get_endpoint, methods=["GET"], name=f"get_{_table}")
    app.add_api_route(f"/api/{_table}", post_endpoint, methods=["POST"], name=f"create_{_table}")
    app.add_api_route(f"/api/{_table}/{{item_id}}", patch_endpoint, methods=["PATCH", "PUT"], name=f"update_{_table}")
    app.add_api_route(f"/api/{_table}/{{item_id}}", delete_endpoint, methods=["DELETE"], name=f"delete_{_table}")


@app.get("/api/google/status")
def google_status(user=Depends(require_user)):
    return {**google_calendar.token_status(), "selected_calendar_id": google_calendar.selected_calendar()}


@app.get("/api/google/calendars")
def google_calendars(user=Depends(require_user)):
    return {"items": google_calendar.list_calendars(), "selected_calendar_id": google_calendar.selected_calendar()}


@app.post("/api/google/select")
def google_select(payload: dict = Body(...), user=Depends(require_user)):
    calendar_id = str(payload.get("calendar_id", "")).strip()
    if not calendar_id: raise HTTPException(422, "calendar_id is required")
    google_calendar.select_calendar(calendar_id)
    return {"ok": True, "selected_calendar_id": calendar_id}


@app.post("/api/google/sync")
def google_sync(user=Depends(require_user)):
    return google_calendar.sync()


@app.get("/api/today")
def today(user=Depends(require_user)):
    day = date.today().isoformat()
    return {"date": day, "tasks": rows("tasks", "WHERE start_date<=? AND (due_date IS NULL OR due_date>=?) AND status!='done' ORDER BY priority,due_date", (day, day)),
            "events": rows("events", "WHERE date(start_at)=? ORDER BY start_at", (day,)),
            "todos": rows("todos", "WHERE todo_date=? ORDER BY completed,id", (day,)),
            "work_logs": rows("work_logs", "WHERE log_date=? ORDER BY created_at DESC", (day,))}


@app.post("/api/ai/parse")
async def ai_parse(payload: dict = Body(...), user=Depends(require_user)):
    text = str(payload.get("text", "")).strip()
    if not text: raise HTTPException(422, "text is required")
    context = rows("tasks", "WHERE status!='done' ORDER BY updated_at DESC LIMIT 20")
    return await ai.parse_text(text, context)


@app.get("/api/ai/status")
def ai_status(user=Depends(require_user)):
    return ai.status()


@app.post("/api/ai/apply")
def ai_apply(payload: dict = Body(...), user=Depends(require_user)):
    entity = payload.get("entity"); table = {"task": "tasks", "event": "events", "todo": "todos", "work_log": "work_logs"}.get(entity)
    if not table: raise HTTPException(422, "지원하지 않는 entity입니다")
    if payload.get("action") == "update": return update_item(table, int(payload.get("id", 0)), payload.get("data") or {})
    if payload.get("action") == "create": return create_item(table, payload.get("data") or {})
    raise HTTPException(422, "지원하지 않는 action입니다")


@app.get("/api/ai/recommendations")
def ai_recommendations(limit: int = 5, user=Depends(require_user)):
    return {"items": ai.recommendations(rows("tasks"), rows("work_logs", "ORDER BY created_at DESC LIMIT 30"), max(1, min(limit, 20))), "source": "local-rules"}
