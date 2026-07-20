import base64
import json
import os
import secrets
import time
import uuid
import calendar as month_calendar
from datetime import date, datetime, timedelta
from typing import Literal
from urllib.parse import urlencode

import httpx
from fastapi import Body, Cookie, Depends, FastAPI, File, HTTPException, Query, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

from . import ai, google_calendar
from .auth import DEMO_SESSION_TTL, _hash, create_session, list_sessions, require_user, revoke_session, revoke_session_by_id, session_user_id
from .db import DEMO_USER_ID, connection, decode_json_array, init_db, row_dict, upsert_google_user

app = FastAPI(title="WorkManager API", version="2.0.0")
origins = [x.rstrip("/") for x in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if x]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])


@app.middleware("http")
async def verify_request_origin(request: Request, call_next):
    if request.method in {"POST", "PUT", "PATCH", "DELETE"} and os.getenv("COOKIE_SECURE", "false").lower() == "true":
        if request.url.path.startswith("/api/admin/") and request.headers.get("authorization", "").startswith("Bearer "):
            return await call_next(request)
        allowed = set(origins) | {os.getenv("FRONTEND_URL", "").rstrip("/")}
        if request.headers.get("origin", "").rstrip("/") not in allowed:
            return Response(status_code=403, content="Invalid request origin")
    return await call_next(request)


DEMO_WRITE_EXEMPT_PATHS = {"/api/auth/logout", "/api/auth/demo"}


@app.middleware("http")
async def enforce_demo_read_only(request: Request, call_next):
    if (request.method in {"POST", "PUT", "PATCH", "DELETE"} and request.url.path.startswith("/api/")
            and request.url.path not in DEMO_WRITE_EXEMPT_PATHS
            and session_user_id(request.cookies.get("wm_session")) == DEMO_USER_ID):
        return Response(status_code=403,
                        content=json.dumps({"detail": "체험 계정은 읽기 전용입니다. Google 로그인으로 실제 계정을 사용해 주세요."}, ensure_ascii=False),
                        media_type="application/json")
    return await call_next(request)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    summary = f"{type(exc).__name__}: {exc}"[:500]
    with connection() as c:
        c.execute("INSERT INTO error_logs(method,path,summary,created_at) VALUES(?,?,?,?)",
                  (request.method, request.url.path, summary, now()))
    return JSONResponse(status_code=500, content={"detail": "Internal Server Error"})


@app.on_event("startup")
def startup():
    if os.getenv("COOKIE_SECURE", "false").lower() == "true" and os.getenv("APP_SECRET", "development-secret-change-me") == "development-secret-change-me":
        raise RuntimeError("Production requires a strong APP_SECRET")
    init_db()


def now():
    return datetime.now().isoformat(timespec="seconds")


def rows(table, user_id, where="", args=(), tags=None):
    suffix = ""
    if where.startswith("WHERE "):
        suffix = " AND " + where[6:]
    elif where:
        suffix = " " + where
    if table in CONFIG and "deleted_at" not in where:
        suffix = " AND deleted_at IS NULL" + suffix
    if table == "events" and "google_is_series_master" not in where:
        suffix = " AND google_is_series_master=0" + suffix
    with connection() as c:
        items = [row_dict(r) for r in c.execute(
            f"SELECT * FROM {table} WHERE user_id=?{suffix}", (user_id, *args)).fetchall()]
    requested = {x.strip().lower() for x in (tags or []) if x.strip()}
    if requested:
        items = [item for item in items if requested.issubset({str(x).lower() for x in item.get("tags", [])})]
    return items


def audit(user_id, action, entity_type, entity_id=None, metadata=None):
    with connection() as c:
        c.execute("INSERT INTO audit_logs(user_id,action,entity_type,entity_id,metadata,created_at) VALUES(?,?,?,?,?,?)",
                  (user_id, action, entity_type, str(entity_id) if entity_id is not None else None,
                   json.dumps(metadata or {}, ensure_ascii=False), now()))


def load_approval_workflow_setting(user_id):
    with connection() as c:
        row = c.execute("SELECT value FROM app_settings WHERE user_id=? AND key=?", (user_id, "approval_workflow")).fetchone()
    return row["value"] == "on" if row else False


def load_billing_hourly_rate_setting(user_id):
    with connection() as c:
        row = c.execute("SELECT value FROM app_settings WHERE user_id=? AND key=?", (user_id, "billing_hourly_rate")).fetchone()
    return float(row["value"]) if row else None


def load_billing_client_name_setting(user_id):
    with connection() as c:
        row = c.execute("SELECT value FROM app_settings WHERE user_id=? AND key=?", (user_id, "billing_client_name")).fetchone()
    return row["value"] if row else None


def _ics_escape(value):
    return str(value or "").replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def _ics_fold(line):
    if len(line) <= 75: return line
    chunks, rest = [], line
    while len(rest) > 75:
        chunks.append(rest[:75]); rest = " " + rest[75:]
    chunks.append(rest)
    return "\r\n".join(chunks)


def _ics_datetime(value):
    return datetime.fromisoformat(value).strftime("%Y%m%dT%H%M%S")


def build_calendar_feed(user_id):
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//WorkManager//Calendar Feed//KO", "CALSCALE:GREGORIAN"]
    for e in rows("events", user_id):
        if not e.get("start_at") or not e.get("end_at"): continue
        lines += ["BEGIN:VEVENT", f"UID:event-{e['id']}@workmanager", f"DTSTAMP:{_ics_datetime(now())}",
                  f"DTSTART:{_ics_datetime(e['start_at'])}", f"DTEND:{_ics_datetime(e['end_at'])}",
                  f"SUMMARY:{_ics_escape(e['title'])}"]
        if e.get("description"): lines.append(f"DESCRIPTION:{_ics_escape(e['description'])}")
        if e.get("location"): lines.append(f"LOCATION:{_ics_escape(e['location'])}")
        lines.append("END:VEVENT")
    for t in rows("tasks", user_id):
        if not t.get("due_date"): continue
        if t.get("due_time"):
            due_datetime = f"{t['due_date']}T{t['due_time']}:00"
            dtstart = f"DTSTART:{_ics_datetime(due_datetime)}"
        else:
            dtstart = f"DTSTART;VALUE=DATE:{t['due_date'].replace('-', '')}"
        lines += ["BEGIN:VEVENT", f"UID:task-{t['id']}@workmanager", f"DTSTAMP:{_ics_datetime(now())}",
                  dtstart,
                  f"SUMMARY:{_ics_escape('[업무] ' + t['title'])}"]
        if t.get("description"): lines.append(f"DESCRIPTION:{_ics_escape(t['description'])}")
        lines.append("END:VEVENT")
    lines.append("END:VCALENDAR")
    return "\r\n".join(_ics_fold(line) for line in lines)


_rate_buckets = {}
_rate_last_cleanup = 0.0
def enforce_rate(user_id, bucket, limit, window_seconds):
    global _rate_last_cleanup
    current = time.monotonic()
    if current - _rate_last_cleanup > 300:
        for old_key, old_stamps in list(_rate_buckets.items()):
            fresh = [stamp for stamp in old_stamps if stamp > current - 3600]
            if fresh: _rate_buckets[old_key] = fresh
            else: _rate_buckets.pop(old_key, None)
        _rate_last_cleanup = current
    key = (user_id, bucket)
    stamps = [x for x in _rate_buckets.get(key, []) if x > current - window_seconds]
    if len(stamps) >= limit:
        retry = max(1, int(window_seconds - (current - stamps[0])))
        raise HTTPException(429, "요청이 너무 많습니다. 잠시 후 다시 시도하세요.", headers={"Retry-After": str(retry)})
    stamps.append(current)
    _rate_buckets[key] = stamps


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/ready")
def ready():
    try:
        with connection() as c:
            version = c.execute("SELECT value FROM migration_state WHERE key='schema_version'").fetchone()
            if not version or int(version["value"]) < 5:
                raise RuntimeError("schema migration is incomplete")
            c.execute("BEGIN IMMEDIATE")
            c.execute("UPDATE migration_state SET value=value WHERE key='schema_version'")
            c.rollback()
        return {"ok": True, "database": "ready", "schema_version": int(version["value"])}
    except Exception:
        raise HTTPException(503, "Database is not ready")


@app.post("/api/auth/logout")
def logout(response: Response, wm_session: str | None = Cookie(default=None)):
    revoke_session(wm_session)
    response.delete_cookie("wm_session", path="/")
    return {"ok": True}


@app.get("/api/auth/me")
def me(user=Depends(require_user)):
    with connection() as c:
        row = c.execute("SELECT id,email,display_name,picture_url FROM users WHERE id=?", (user,)).fetchone()
    return {"user": dict(row) if row else {"id": user}}


@app.get("/api/auth/sessions")
def sessions(user=Depends(require_user), wm_session: str | None = Cookie(default=None)):
    return {"sessions": list_sessions(user, wm_session)}


@app.delete("/api/auth/sessions/{session_id}")
def revoke_session_endpoint(session_id: str, user=Depends(require_user), wm_session: str | None = Cookie(default=None)):
    if wm_session and _hash(wm_session) == session_id:
        raise HTTPException(400, "현재 세션은 로그아웃 기능을 사용하세요")
    if not revoke_session_by_id(user, session_id):
        raise HTTPException(404, "세션을 찾을 수 없습니다")
    audit(user, "delete", "session", session_id, {})
    return {"ok": True}


@app.get("/api/auth/config")
def auth_config():
    return {"google_enabled": bool(os.getenv("GOOGLE_CLIENT_ID") and os.getenv("GOOGLE_CLIENT_SECRET"))}


@app.post("/api/auth/demo")
def start_demo(request: Request, response: Response):
    enforce_rate(request.client.host if request.client else "unknown", "demo-login", 20, 3600)
    response.set_cookie("wm_session", create_session(DEMO_USER_ID, ttl=DEMO_SESSION_TTL), httponly=True, samesite="lax",
                        secure=os.getenv("COOKIE_SECURE", "false").lower() == "true",
                        max_age=DEMO_SESSION_TTL, path="/")
    return {"ok": True}


@app.get("/api/auth/google/start")
def google_start(request: Request):
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    if not client_id:
        raise HTTPException(404, "Google login is not configured")
    state = secrets.token_urlsafe(24)
    redirect_uri = os.getenv("GOOGLE_REDIRECT_URI", str(request.url_for("google_callback")))
    url = "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode({
        "client_id": client_id, "redirect_uri": redirect_uri, "response_type": "code",
        "scope": "openid email profile https://www.googleapis.com/auth/calendar", "state": state,
        "prompt": "consent select_account", "access_type": "offline", "include_granted_scopes": "true"})
    response = RedirectResponse(url)
    response.set_cookie("google_oauth_state", state, httponly=True, samesite="lax",
                        secure=os.getenv("COOKIE_SECURE", "false").lower() == "true", max_age=600, path="/")
    return response


@app.get("/api/auth/google/callback", name="google_callback")
async def google_callback(request: Request, code: str, state: str):
    if not secrets.compare_digest(state, request.cookies.get("google_oauth_state", "")):
        raise HTTPException(400, "Invalid OAuth state")
    redirect_uri = os.getenv("GOOGLE_REDIRECT_URI", str(request.url_for("google_callback")))
    async with httpx.AsyncClient(timeout=20) as client:
        token = await client.post("https://oauth2.googleapis.com/token", data={
            "code": code, "client_id": os.getenv("GOOGLE_CLIENT_ID"),
            "client_secret": os.getenv("GOOGLE_CLIENT_SECRET"), "redirect_uri": redirect_uri,
            "grant_type": "authorization_code"})
        if token.is_error:
            raise HTTPException(401, "Google token exchange failed")
        info = await client.get("https://openidconnect.googleapis.com/v1/userinfo",
                                headers={"Authorization": f"Bearer {token.json()['access_token']}"})
        if info.is_error:
            raise HTTPException(401, "Google user verification failed")
    profile = info.json()
    email = str(profile.get("email", "")).lower()
    if not profile.get("email_verified") or not profile.get("sub"):
        raise HTTPException(403, "A verified Google account is required")
    allowed = {x.strip().lower() for x in os.getenv("GOOGLE_ALLOWED_EMAIL", "").split(",") if x.strip()}
    if not allowed or email not in allowed:
        raise HTTPException(403, "This Google account is not allowed")
    user_id = upsert_google_user(str(profile["sub"]), email, profile.get("name", ""), profile.get("picture"))
    google_calendar.save_tokens(user_id, email, token.json())
    response = RedirectResponse(os.getenv("FRONTEND_URL", "/"))
    response.set_cookie("wm_session", create_session(user_id), httponly=True, samesite="lax",
                        secure=os.getenv("COOKIE_SECURE", "false").lower() == "true",
                        max_age=1209600, path="/")
    response.delete_cookie("google_oauth_state", path="/")
    return response


class StrictPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")


def _clean_links(value):
    if value is None:
        return value
    cleaned = []
    for item in value:
        url = str(item.get("url", "")).strip()[:2000]
        if not (url.startswith("http://") or url.startswith("https://")):
            continue
        label = str(item.get("label", "")).strip()[:200]
        cleaned.append({"id": str(item.get("id") or uuid.uuid4()), "url": url, "label": label})
    return cleaned


def _clean_checklist(value):
    if value is None:
        return value
    cleaned = []
    for item in value:
        text = str(item.get("text", "")).strip()[:300]
        if not text:
            continue
        cleaned.append({"id": str(item.get("id") or uuid.uuid4()), "text": text, "done": bool(item.get("done"))})
    return cleaned


def _reset_checklist(value):
    return [{**item, "done": False} for item in (value or [])]


class TaskPayload(StrictPayload):
    title: str | None = Field(None, min_length=1, max_length=300)
    description: str | None = Field(None, max_length=20000)
    status: Literal["todo", "doing", "done"] | None = None
    priority: Literal["low", "normal", "high"] | None = None
    progress: int | None = Field(None, ge=0, le=100)
    start_date: date | None = None
    due_date: date | None = None
    start_time: str | None = Field(None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    due_time: str | None = Field(None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    approval_status: Literal["none", "pending", "approved", "rejected"] | None = None
    schedule_approval_status: Literal["none", "pending", "approved", "rejected"] | None = None
    tags: list[str] | None = Field(None, max_length=50)
    recurrence_rule: Literal["daily", "weekly", "biweekly", "monthly"] | None = None
    recurrence_end_date: date | None = None
    parent_id: int | None = Field(None, ge=1)
    dependency_ids: list[int] | None = Field(None, max_length=100)
    estimated_minutes: int | None = Field(None, ge=0, le=100000)
    link_url: str | None = Field(None, max_length=2000)
    checklist: list[dict] | None = Field(None, max_length=200)
    links: list[dict] | None = Field(None, max_length=50)
    color: str | None = None

    @field_validator("checklist")
    @classmethod
    def checklist_items_well_formed(cls, value):
        return _clean_checklist(value)

    @field_validator("links")
    @classmethod
    def links_well_formed(cls, value):
        return _clean_links(value)

    @field_validator("start_date", "due_date", "start_time", "due_time", "recurrence_rule", "recurrence_end_date", "parent_id", "estimated_minutes", "link_url", "color", mode="before")
    @classmethod
    def empty_clearable_fields_to_null(cls, value):
        return None if value == "" else value

    @field_validator("link_url")
    @classmethod
    def link_url_must_be_http(cls, value):
        if value is not None and not (value.startswith("http://") or value.startswith("https://")):
            raise ValueError("link_url must start with http:// or https://")
        return value

    @field_validator("color")
    @classmethod
    def color_must_be_known(cls, value):
        if value is not None and value not in VALID_EVENT_COLORS:
            raise ValueError(f"color must be one of {sorted(VALID_EVENT_COLORS)}")
        return value

    @field_validator("status", mode="before")
    @classmethod
    def normalize_status_alias(cls, value):
        return "doing" if value == "in_progress" else value

    @field_validator("priority", mode="before")
    @classmethod
    def normalize_priority_alias(cls, value):
        return "normal" if value == "medium" else value

    @model_validator(mode="after")
    def dates_in_order(self):
        if self.start_date and self.due_date and self.due_date < self.start_date:
            raise ValueError("due_date must not be before start_date")
        if self.approval_status not in (None, "none") and self.status not in (None, "done"):
            raise ValueError("approval_status requires a completed task")
        base_date = self.due_date or self.start_date
        if self.recurrence_end_date and base_date and self.recurrence_end_date < base_date:
            raise ValueError("recurrence_end_date must not be before start_date/due_date")
        return self


class EventPayload(StrictPayload):
    title: str | None = Field(None, min_length=1, max_length=300)
    description: str | None = Field(None, max_length=20000)
    start_at: datetime | None = None
    end_at: datetime | None = None
    location: str | None = Field(None, max_length=500)
    google_is_all_day: bool | None = None
    recurrence: list[str] | None = Field(None, max_length=50)
    tags: list[str] | None = Field(None, max_length=50)
    link_url: str | None = Field(None, max_length=2000)
    color: str | None = None
    links: list[dict] | None = Field(None, max_length=50)
    priority: Literal["low", "normal", "high"] | None = None
    recurrence_group_id: str | None = Field(None, max_length=64)
    checklist: list[dict] | None = Field(None, max_length=200)
    estimated_minutes: int | None = Field(None, ge=0, le=100000)

    @field_validator("link_url", "color", "priority", "estimated_minutes", mode="before")
    @classmethod
    def empty_link_url_to_null(cls, value):
        return None if value == "" else value

    @field_validator("link_url")
    @classmethod
    def link_url_must_be_http(cls, value):
        if value is not None and not (value.startswith("http://") or value.startswith("https://")):
            raise ValueError("link_url must start with http:// or https://")
        return value

    @field_validator("color")
    @classmethod
    def color_must_be_known(cls, value):
        if value is not None and value not in VALID_EVENT_COLORS:
            raise ValueError(f"color must be one of {sorted(VALID_EVENT_COLORS)}")
        return value

    @field_validator("links")
    @classmethod
    def links_well_formed(cls, value):
        return _clean_links(value)

    @field_validator("checklist")
    @classmethod
    def checklist_items_well_formed(cls, value):
        return _clean_checklist(value)

    @model_validator(mode="after")
    def times_in_order(self):
        if self.start_at and self.end_at and self.end_at <= self.start_at:
            raise ValueError("end_at must be after start_at")
        return self


class TodoPayload(StrictPayload):
    title: str | None = Field(None, min_length=1, max_length=500)
    todo_date: date | None = None
    completed: bool | None = None
    tags: list[str] | None = Field(None, max_length=50)
    recurrence_rule: Literal["daily", "weekly", "biweekly", "monthly"] | None = None
    recurrence_end_date: date | None = None
    priority: Literal["low", "normal", "high"] | None = None
    link_url: str | None = Field(None, max_length=2000)
    memo: str | None = Field(None, max_length=5000)
    color: str | None = None
    links: list[dict] | None = Field(None, max_length=50)
    todo_time: str | None = Field(None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    checklist: list[dict] | None = Field(None, max_length=200)
    estimated_minutes: int | None = Field(None, ge=0, le=100000)

    @field_validator("recurrence_rule", "recurrence_end_date", "link_url", "memo", "color", "todo_time", "estimated_minutes", mode="before")
    @classmethod
    def empty_clearable_fields_to_null(cls, value):
        return None if value == "" else value

    @field_validator("link_url")
    @classmethod
    def link_url_must_be_http(cls, value):
        if value is not None and not (value.startswith("http://") or value.startswith("https://")):
            raise ValueError("link_url must start with http:// or https://")
        return value

    @field_validator("color")
    @classmethod
    def color_must_be_known(cls, value):
        if value is not None and value not in VALID_EVENT_COLORS:
            raise ValueError(f"color must be one of {sorted(VALID_EVENT_COLORS)}")
        return value

    @field_validator("checklist")
    @classmethod
    def checklist_items_well_formed(cls, value):
        return _clean_checklist(value)

    @field_validator("links")
    @classmethod
    def links_well_formed(cls, value):
        return _clean_links(value)

    @model_validator(mode="after")
    def recurrence_end_after_todo_date(self):
        if self.recurrence_end_date and self.todo_date and self.recurrence_end_date < self.todo_date:
            raise ValueError("recurrence_end_date must not be before todo_date")
        return self


class WorkLogPayload(StrictPayload):
    content: str | None = Field(None, min_length=1, max_length=20000)
    log_date: date | None = None
    task_id: int | None = Field(None, ge=1)
    tags: list[str] | None = Field(None, max_length=50)
    duration_minutes: int | None = Field(None, ge=0, le=1440)
    link_url: str | None = Field(None, max_length=2000)
    links: list[dict] | None = Field(None, max_length=50)
    color: str | None = None
    log_time: str | None = Field(None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    billable: bool | None = None
    checklist: list[dict] | None = Field(None, max_length=200)
    priority: Literal["low", "normal", "high"] | None = None
    estimated_minutes: int | None = Field(None, ge=0, le=100000)

    @field_validator("link_url", "color", "log_time", "priority", "estimated_minutes", mode="before")
    @classmethod
    def empty_link_url_to_null(cls, value):
        return None if value == "" else value

    @field_validator("link_url")
    @classmethod
    def link_url_must_be_http(cls, value):
        if value is not None and not (value.startswith("http://") or value.startswith("https://")):
            raise ValueError("link_url must start with http:// or https://")
        return value

    @field_validator("color")
    @classmethod
    def color_must_be_known(cls, value):
        if value is not None and value not in VALID_EVENT_COLORS:
            raise ValueError(f"color must be one of {sorted(VALID_EVENT_COLORS)}")
        return value

    @field_validator("checklist")
    @classmethod
    def checklist_items_well_formed(cls, value):
        return _clean_checklist(value)

    @field_validator("links")
    @classmethod
    def links_well_formed(cls, value):
        return _clean_links(value)


class FeatureRequestPayload(StrictPayload):
    content: str | None = Field(None, min_length=1, max_length=5000)
    source: str | None = Field("user", max_length=80)


class FeatureRequestStatusPayload(StrictPayload):
    status: Literal["pending", "in_progress", "done", "dismissed"]


class FeatureRequestAdminPayload(StrictPayload):
    status: Literal["pending", "in_progress", "done", "dismissed"]
    description: str | None = Field(None, max_length=10000)


class AISettingsPayload(StrictPayload):
    provider: Literal["openai", "gemini"] | None = None
    api_key: str | None = Field(None, max_length=5000)
    base_url: str | None = Field(None, max_length=2000)
    model: str | None = Field(None, max_length=120)


class WorkflowSettingsPayload(StrictPayload):
    approval_workflow: bool | None = None
    billing_hourly_rate: float | None = Field(None, ge=0, le=1000000)
    billing_client_name: str | None = Field(None, max_length=200)


MODELS = {"tasks": TaskPayload, "events": EventPayload, "todos": TodoPayload, "work_logs": WorkLogPayload}
CONFIG = {
    "tasks": ({"title", "description", "status", "priority", "progress", "start_date", "due_date", "start_time", "due_time", "approval_status", "schedule_approval_status", "tags", "recurrence_rule", "recurrence_end_date", "parent_id", "dependency_ids", "estimated_minutes", "link_url", "checklist", "color", "links"}, "updated_at"),
    "events": ({"title", "description", "start_at", "end_at", "location", "google_is_all_day", "recurrence", "tags", "link_url", "color", "links", "priority", "recurrence_group_id", "checklist", "estimated_minutes"}, "updated_at"),
    "todos": ({"title", "todo_date", "todo_time", "completed", "tags", "recurrence_rule", "recurrence_end_date", "priority", "link_url", "memo", "color", "links", "checklist", "estimated_minutes"}, None),
    "work_logs": ({"content", "log_date", "task_id", "tags", "duration_minutes", "link_url", "links", "color", "log_time", "billable", "checklist", "priority", "estimated_minutes"}, None),
}

VALID_EVENT_COLORS = {"red", "orange", "yellow", "green", "purple", "gray"}
VALID_TASK_STATUSES = {"todo", "doing", "done"}
VALID_TASK_PRIORITIES = {"low", "normal", "high"}
VALID_TASK_APPROVAL_STATES = {"none", "pending", "approved", "rejected"}
VALID_TASK_RECURRENCE_RULES = {"daily", "weekly", "biweekly", "monthly"}
TASK_TEXT_LIMITS = {"title": 300, "description": 20000}
TASK_DEPENDENCY_LIMIT = 100


def normalize_legacy_optional_task_id(value):
    if value in (None, ""):
        return None
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def normalize_legacy_task_field(key, value):
    if key == "status":
        if value == "in_progress":
            return "doing"
        return value if value in VALID_TASK_STATUSES else "todo"
    if key == "priority":
        if value == "medium":
            return "normal"
        return value if value in VALID_TASK_PRIORITIES else "normal"
    if key in {"approval_status", "schedule_approval_status"}:
        return value if value in VALID_TASK_APPROVAL_STATES else "none"
    if key == "recurrence_rule":
        return value if value in VALID_TASK_RECURRENCE_RULES else None
    return value


def normalize_legacy_task_progress(value):
    try:
        number = int(value)
    except (TypeError, ValueError):
        return 0
    return max(0, min(100, number))


def normalize_legacy_task_date(value):
    if value in (None, ""):
        return None
    try:
        return date.fromisoformat(str(value)).isoformat()
    except (TypeError, ValueError):
        return None


def normalize_legacy_task_text(key, value):
    if key not in TASK_TEXT_LIMITS:
        return value
    if value is None:
        return "" if key == "description" else None
    text = str(value).strip()
    return text[:TASK_TEXT_LIMITS[key]]


def normalize_legacy_json_array_field(key, value):
    items = decode_json_array(value)
    if key == "dependency_ids":
        normalized = []
        seen = set()
        for raw in items:
            try:
                number = int(raw)
            except (TypeError, ValueError):
                continue
            if number > 0 and number not in seen:
                seen.add(number)
                normalized.append(number)
                if len(normalized) >= TASK_DEPENDENCY_LIMIT:
                    break
        return sorted(normalized)
    if key == "tags":
        normalized = []
        seen = set()
        for raw in items:
            if not isinstance(raw, str):
                continue
            value = raw.strip()
            tag_key = value.casefold()
            if value and tag_key not in seen:
                seen.add(tag_key)
                normalized.append(value[:50])
                if len(normalized) >= 50:
                    break
        return normalized
    return items


def sanitize_legacy_dependency_ids(value, visible_task_ids, current_id=None):
    sanitized = []
    for dependency_id in normalize_legacy_json_array_field("dependency_ids", value):
        if dependency_id == current_id or dependency_id not in visible_task_ids:
            continue
        sanitized.append(dependency_id)
    return sanitized


def normalize(table, data):
    try:
        model = MODELS[table].model_validate(data)
    except ValidationError as exc:
        raise HTTPException(422, detail=json.loads(exc.json(include_url=False)))
    result = model.model_dump(exclude_unset=True, mode="json")
    text_fields = {
        "tasks": ("title",), "events": ("title", "location"),
        "todos": ("title",), "work_logs": ("content",),
    }[table]
    for key in text_fields:
        if key in result and isinstance(result[key], str):
            result[key] = result[key].strip()
    nullable = {"tasks": {"start_date", "due_date", "start_time", "due_time", "recurrence_rule", "recurrence_end_date", "parent_id", "estimated_minutes", "link_url", "color"},
                "events": {"link_url", "color", "priority", "recurrence_group_id", "estimated_minutes"}, "todos": {"recurrence_rule", "recurrence_end_date", "link_url", "memo", "color", "todo_time", "estimated_minutes"}, "work_logs": {"task_id", "duration_minutes", "link_url", "color", "log_time", "billable", "priority", "estimated_minutes"}}[table]
    invalid_nulls = [key for key, value in result.items() if value is None and key not in nullable]
    if invalid_nulls:
        raise HTTPException(422, f"Fields cannot be null: {', '.join(sorted(invalid_nulls))}")
    if table == "tasks":
        status_sent = "status" in result
        if result.get("status") == "done" or (not status_sent and result.get("progress") == 100):
            result.update(status="done", progress=100)
        elif result.get("status") == "todo":
            result["progress"] = 0
        elif status_sent and result.get("progress", 0) >= 100:
            result["progress"] = 99
        elif not status_sent and "progress" in result:
            result["status"] = "doing" if result["progress"] > 0 else "todo"
        if result.get("status") and result["status"] != "done":
            result["approval_status"] = "none"
    if "tags" in result:
        cleaned, seen = [], set()
        for raw in result["tags"]:
            value = str(raw).strip()
            key = value.casefold()
            if value and key not in seen:
                seen.add(key); cleaned.append(value)
        if any(len(x) > 50 for x in cleaned):
            raise HTTPException(422, "Each tag must be at most 50 characters")
        result["tags"] = json.dumps(cleaned, ensure_ascii=False)
    if "dependency_ids" in result:
        result["dependency_ids"] = json.dumps(sorted(set(result["dependency_ids"])))
    if "recurrence" in result:
        result["recurrence"] = json.dumps(result["recurrence"])
    if "checklist" in result:
        result["checklist"] = json.dumps(result["checklist"], ensure_ascii=False)
    if "links" in result:
        result["links"] = json.dumps(result["links"], ensure_ascii=False)
    if "completed" in result:
        result["completed"] = int(result["completed"])
    if "billable" in result:
        result["billable"] = int(bool(result["billable"]))
    if "google_is_all_day" in result:
        result["google_is_all_day"] = int(result["google_is_all_day"])
    return result


def validate_task_links(data, user_id, current_id=None):
    ids = []
    if data.get("parent_id"):
        ids.append(data["parent_id"])
    if "dependency_ids" in data:
        ids.extend(json.loads(data["dependency_ids"]))
    ids = set(ids)
    if current_id in ids:
        raise HTTPException(422, "A task cannot depend on itself")
    if ids:
        marks = ",".join("?" for _ in ids)
        with connection() as c:
            found = {r["id"] for r in c.execute(
                f"SELECT id FROM tasks WHERE user_id=? AND deleted_at IS NULL AND id IN ({marks})",
                (user_id, *ids)).fetchall()}
        if found != ids:
            raise HTTPException(422, "A linked task does not belong to this user or is deleted")
    if current_id is not None and "dependency_ids" in data:
        proposed = set(json.loads(data["dependency_ids"]))
        with connection() as c:
            graph = {r["id"]: set(normalize_legacy_json_array_field("dependency_ids", r["dependency_ids"])) for r in c.execute(
                "SELECT id,dependency_ids FROM tasks WHERE user_id=? AND deleted_at IS NULL", (user_id,)).fetchall()}
        graph[current_id] = proposed
        visiting, visited = set(), set()
        def visit(node):
            if node in visiting:
                return True
            if node in visited:
                return False
            visiting.add(node)
            if any(visit(child) for child in graph.get(node, set())):
                return True
            visiting.remove(node); visited.add(node)
            return False
        if visit(current_id):
            raise HTTPException(422, "Task dependencies must not contain a cycle")
    if current_id is not None and "parent_id" in data:
        with connection() as c:
            parents = {r["id"]: normalize_legacy_optional_task_id(r["parent_id"]) for r in c.execute(
                "SELECT id,parent_id FROM tasks WHERE user_id=? AND deleted_at IS NULL", (user_id,)).fetchall()}
        parents = {node: (None if parent == node else parent) for node, parent in parents.items()}
        parents[current_id] = data.get("parent_id")
        seen = set()
        node = current_id
        while node is not None:
            if node in seen:
                raise HTTPException(422, "Task parent hierarchy must not contain a cycle")
            seen.add(node)
            node = parents.get(node)


def merged_resource_for_validation(table, existing, data):
    merged = {k: existing[k] for k in CONFIG[table][0] if k in existing.keys()}
    json_fields = {"tags", "dependency_ids", "recurrence", "checklist", "links"}
    for key in json_fields & merged.keys():
        merged[key] = normalize_legacy_json_array_field(key, merged[key])
    merged.update({k: v for k, v in data.items() if k in CONFIG[table][0]})
    for key in json_fields & merged.keys():
        if isinstance(merged[key], str):
            merged[key] = normalize_legacy_json_array_field(key, merged[key])
    if table == "tasks":
        for key in TASK_TEXT_LIMITS:
            merged[key] = normalize_legacy_task_text(key, merged.get(key))
        for key in ("status", "priority", "approval_status", "schedule_approval_status", "recurrence_rule"):
            merged[key] = normalize_legacy_task_field(key, merged.get(key))
        merged["progress"] = normalize_legacy_task_progress(merged.get("progress"))
        for key in ("start_date", "due_date"):
            merged[key] = normalize_legacy_task_date(merged.get(key))
        merged["parent_id"] = normalize_legacy_optional_task_id(merged.get("parent_id"))
    return merged


def next_recurrence_date(value, rule, anchor_day=None, anchor_month_end=False):
    if not value:
        return None
    current = date.fromisoformat(value)
    if rule == "daily":
        return (current + timedelta(days=1)).isoformat()
    if rule == "weekly":
        return (current + timedelta(days=7)).isoformat()
    if rule == "biweekly":
        return (current + timedelta(days=14)).isoformat()
    year, month = current.year + (current.month == 12), 1 if current.month == 12 else current.month + 1
    last_day = month_calendar.monthrange(year, month)[1]
    day = last_day if anchor_month_end else min(int(anchor_day or current.day), last_day)
    return date(year, month, day).isoformat()


def _advance_event_datetime(value, rule):
    if rule == "daily":
        return value + timedelta(days=1)
    if rule == "weekly":
        return value + timedelta(days=7)
    if rule == "biweekly":
        return value + timedelta(days=14)
    year, month = value.year + (value.month == 12), 1 if value.month == 12 else value.month + 1
    day = min(value.day, month_calendar.monthrange(year, month)[1])
    return value.replace(year=year, month=month, day=day)


def expand_recurring_event(data, rule, until, limit=52):
    """Mirror frontend/src/eventRecurrence.js so AI-created recurring events also fan out into one row per occurrence."""
    start = datetime.fromisoformat(data["start_at"])
    end = datetime.fromisoformat(data["end_at"])
    duration = end - start
    until_dt = datetime.combine(date.fromisoformat(until), datetime.max.time())
    occurrences = []
    cursor = start
    while cursor <= until_dt and len(occurrences) < limit:
        occurrences.append({**data, "start_at": cursor.isoformat(timespec="minutes"),
                             "end_at": (cursor + duration).isoformat(timespec="minutes")})
        cursor = _advance_event_datetime(cursor, rule)
    return occurrences or [data]


def spawn_recurring_task(task, user_id):
    rule = task.get("recurrence_rule")
    if not rule or task.get("recurrence_spawned_at"):
        return None
    timestamp = now()
    anchor_day = task.get("recurrence_anchor_day")
    anchor_end = bool(task.get("recurrence_anchor_month_end"))
    start_date = next_recurrence_date(task.get("start_date"), rule, anchor_day, anchor_end)
    due_date = next_recurrence_date(task.get("due_date"), rule, anchor_day, anchor_end)
    end_date = task.get("recurrence_end_date")
    if end_date and (start_date or due_date) and (start_date or due_date) > end_date:
        with connection() as c:
            c.execute("UPDATE tasks SET recurrence_spawned_at=? WHERE id=? AND user_id=? AND recurrence_spawned_at IS NULL",
                      (timestamp, task["id"], user_id))
        return None
    with connection() as c:
        # The conditional marker update makes concurrent completion requests idempotent.
        if not c.execute("UPDATE tasks SET recurrence_spawned_at=? WHERE id=? AND user_id=? AND recurrence_spawned_at IS NULL",
                         (timestamp, task["id"], user_id)).rowcount:
            return None
        cur = c.execute("""INSERT INTO tasks(user_id,title,description,status,priority,progress,start_date,due_date,start_time,due_time,tags,
          recurrence_rule,recurrence_anchor_day,recurrence_anchor_month_end,recurrence_end_date,parent_id,dependency_ids,created_at,updated_at,
          estimated_minutes,link_url,checklist,color,links) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
          (user_id, task["title"], task.get("description", ""), "todo", task.get("priority", "normal"), 0,
           start_date, due_date, task.get("start_time"), task.get("due_time"), json.dumps(task.get("tags") or [], ensure_ascii=False), rule, anchor_day, int(anchor_end), end_date,
           task["id"], json.dumps(task.get("dependency_ids") or []), timestamp, timestamp,
           task.get("estimated_minutes"), task.get("link_url"), json.dumps(_reset_checklist(task.get("checklist")), ensure_ascii=False), task.get("color"), json.dumps(task.get("links") or [], ensure_ascii=False)))
        next_id = cur.lastrowid
    audit(user_id, "recurrence_create", "tasks", next_id, {"source_task_id": task["id"], "rule": rule})
    return next_id


def spawn_recurring_todo(todo, user_id):
    rule = todo.get("recurrence_rule")
    if not rule or todo.get("recurrence_spawned_at"):
        return None
    timestamp = now()
    anchor_day = todo.get("recurrence_anchor_day")
    anchor_end = bool(todo.get("recurrence_anchor_month_end"))
    next_date = next_recurrence_date(todo.get("todo_date"), rule, anchor_day, anchor_end)
    end_date = todo.get("recurrence_end_date")
    if end_date and next_date and next_date > end_date:
        with connection() as c:
            c.execute("UPDATE todos SET recurrence_spawned_at=? WHERE id=? AND user_id=? AND recurrence_spawned_at IS NULL",
                      (timestamp, todo["id"], user_id))
        return None
    with connection() as c:
        # The conditional marker update makes concurrent completion requests idempotent.
        if not c.execute("UPDATE todos SET recurrence_spawned_at=? WHERE id=? AND user_id=? AND recurrence_spawned_at IS NULL",
                         (timestamp, todo["id"], user_id)).rowcount:
            return None
        cur = c.execute("""INSERT INTO todos(user_id,title,todo_date,todo_time,completed,tags,recurrence_rule,recurrence_anchor_day,recurrence_anchor_month_end,recurrence_end_date,priority,link_url,memo,estimated_minutes,created_at,
          checklist,color,links) VALUES(?,?,?,?,0,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
          (user_id, todo["title"], next_date, todo.get("todo_time"), json.dumps(todo.get("tags") or [], ensure_ascii=False), rule, anchor_day, int(anchor_end), end_date, todo.get("priority", "normal"), todo.get("link_url"), todo.get("memo"), todo.get("estimated_minutes"), timestamp,
           json.dumps(_reset_checklist(todo.get("checklist")), ensure_ascii=False), todo.get("color"), json.dumps(todo.get("links") or [], ensure_ascii=False)))
        next_id = cur.lastrowid
    audit(user_id, "recurrence_create", "todos", next_id, {"source_todo_id": todo["id"], "rule": rule})
    return next_id


def create_item(table, data, user_id):
    data = normalize(table, data)
    if table == "tasks":
        validate_task_links(data, user_id)
    timestamp = now()
    if table in ("tasks", "events"):
        data.update(created_at=timestamp, updated_at=timestamp)
    else:
        data["created_at"] = timestamp
    required = {"tasks": "title", "events": "title", "todos": "title", "work_logs": "content"}[table]
    if not data.get(required):
        raise HTTPException(422, f"{required} is required")
    if table == "events" and (not data.get("start_at") or not data.get("end_at")):
        raise HTTPException(422, "start_at and end_at are required")
    if table == "todos" and not data.get("todo_date"):
        data["todo_date"] = date.today().isoformat()
    if table == "work_logs" and not data.get("log_date"):
        data["log_date"] = date.today().isoformat()
    if table == "tasks" and data.get("recurrence_rule") == "monthly":
        anchor_value = data.get("due_date") or data.get("start_date")
        if anchor_value:
            anchor = date.fromisoformat(anchor_value)
            data["recurrence_anchor_day"] = anchor.day
            data["recurrence_anchor_month_end"] = int(anchor.day == month_calendar.monthrange(anchor.year, anchor.month)[1])
    if table == "todos" and data.get("recurrence_rule") == "monthly" and data.get("todo_date"):
        anchor = date.fromisoformat(data["todo_date"])
        data["recurrence_anchor_day"] = anchor.day
        data["recurrence_anchor_month_end"] = int(anchor.day == month_calendar.monthrange(anchor.year, anchor.month)[1])
    if table == "tasks" and data.get("status") == "done":
        data["completed_at"] = timestamp
        approval_workflow_on = load_approval_workflow_setting(user_id)
        data.setdefault("approval_status", "pending" if approval_workflow_on else "none")
    if table == "tasks" and data.get("approval_status") not in (None, "none") and data.get("status") != "done":
        raise HTTPException(422, "approval_status requires a completed task")
    if table == "work_logs" and data.get("task_id"):
        with connection() as c:
            if not c.execute("SELECT 1 FROM tasks WHERE id=? AND user_id=? AND deleted_at IS NULL", (data["task_id"], user_id)).fetchone():
                raise HTTPException(422, "task_id does not belong to this user")
    data["user_id"] = user_id
    if table == "events":
        data["local_uid"] = str(uuid.uuid4())
        data["sync_state"] = "dirty"
    cols = list(data)
    with connection() as c:
        cur = c.execute(f"INSERT INTO {table} ({','.join(cols)}) VALUES ({','.join('?' for _ in cols)})", [data[x] for x in cols])
        item = row_dict(c.execute(f"SELECT * FROM {table} WHERE id=? AND user_id=?", (cur.lastrowid, user_id)).fetchone())
    if table == "events" and google_calendar.token_status(user_id)["connected"] and google_calendar.selected_calendar(user_id):
        try:
            google_calendar.push_event(user_id, item)
            item = rows("events", user_id, "WHERE id=?", (item["id"],))[0]
        except HTTPException:
            item["sync_pending"] = True
    audit(user_id, "create", table, item["id"])
    return item


def update_item(table, item_id, data, user_id):
    became_done = False
    todo_became_done = False
    if table == "tasks" and "start_date" in data and "due_date" in data:
        with connection() as c:
            existing_row = c.execute("SELECT start_date, due_date FROM tasks WHERE id=? AND user_id=? AND deleted_at IS NULL", (item_id, user_id)).fetchone()
        if existing_row and data["start_date"] == existing_row["start_date"] and data["due_date"] == existing_row["due_date"] \
                and data["due_date"] and data["start_date"] and data["due_date"] < data["start_date"]:
            data["start_date"], data["due_date"] = data["due_date"], data["start_date"]
    data = normalize(table, data)
    if table == "tasks":
        validate_task_links(data, user_id, item_id)
    if not data:
        raise HTTPException(422, "No changes provided")
    if CONFIG[table][1]:
        data[CONFIG[table][1]] = now()
    if table == "events":
        data["sync_state"] = "dirty"
    if table == "work_logs" and data.get("task_id"):
        with connection() as c:
            if not c.execute("SELECT 1 FROM tasks WHERE id=? AND user_id=? AND deleted_at IS NULL", (data["task_id"], user_id)).fetchone():
                raise HTTPException(422, "task_id does not belong to this user")
    with connection() as c:
        existing = c.execute(f"SELECT * FROM {table} WHERE id=? AND user_id=? AND deleted_at IS NULL", (item_id, user_id)).fetchone()
        if not existing:
            raise HTTPException(404, "Item not found")
        if table == "todos" and "completed" in data and data["completed"] and not existing["completed"]:
            todo_became_done = True
        if table == "tasks":
            approval_workflow_on = load_approval_workflow_setting(user_id)
            visible_task_ids = None
            for key in TASK_TEXT_LIMITS:
                normalized = normalize_legacy_task_text(key, existing[key])
                if normalized != existing[key] and key not in data:
                    data[key] = normalized
            for key in ("status", "priority", "approval_status", "schedule_approval_status", "recurrence_rule"):
                normalized = normalize_legacy_task_field(key, existing[key])
                if normalized != existing[key] and key not in data:
                    data[key] = normalized
            normalized_progress = normalize_legacy_task_progress(existing["progress"])
            if normalized_progress != existing["progress"] and "progress" not in data:
                data["progress"] = normalized_progress
                if "status" not in data:
                    data["status"] = "done" if normalized_progress == 100 else ("doing" if normalized_progress > 0 else "todo")
            for key in ("start_date", "due_date"):
                normalized = normalize_legacy_task_date(existing[key])
                if normalized != existing[key] and key not in data:
                    data[key] = normalized
            effective_start = data.get("start_date", existing["start_date"])
            effective_due = data.get("due_date", existing["due_date"])
            start_unchanged = data.get("start_date", existing["start_date"]) == existing["start_date"]
            due_unchanged = data.get("due_date", existing["due_date"]) == existing["due_date"]
            if effective_start and effective_due and effective_due < effective_start and start_unchanged and due_unchanged:
                data["start_date"], data["due_date"] = effective_due, effective_start
            effective_recurrence_end = data.get("recurrence_end_date", existing["recurrence_end_date"])
            effective_base_date = data.get("due_date", existing["due_date"]) or data.get("start_date", existing["start_date"])
            if "recurrence_end_date" not in data and effective_recurrence_end and effective_base_date and effective_recurrence_end < effective_base_date:
                data["recurrence_end_date"] = None
            normalized_parent_id = normalize_legacy_optional_task_id(existing["parent_id"])
            if normalized_parent_id != existing["parent_id"] and "parent_id" not in data:
                data["parent_id"] = normalized_parent_id
            if "parent_id" not in data and normalized_parent_id is not None:
                visible_parent = c.execute(
                    "SELECT 1 FROM tasks WHERE id=? AND user_id=? AND deleted_at IS NULL",
                    (normalized_parent_id, user_id),
                ).fetchone()
                if not visible_parent:
                    data["parent_id"] = None
            visible_task_ids = {
                row["id"] for row in c.execute(
                    "SELECT id FROM tasks WHERE user_id=? AND deleted_at IS NULL",
                    (user_id,),
                ).fetchall()
            }
            for key in ("tags", "dependency_ids"):
                normalized = sanitize_legacy_dependency_ids(existing[key], visible_task_ids, item_id) if key == "dependency_ids" else normalize_legacy_json_array_field(key, existing[key])
                normalized_json = json.dumps(normalized, ensure_ascii=False)
                if normalized_json != (existing[key] or "[]") and key not in data:
                    data[key] = normalized_json
            target_status = data.get("status", existing["status"])
            schedule_changed = any(key in data and data[key] != existing[key] for key in ("start_date", "due_date", "start_time", "due_time"))
            if schedule_changed and approval_workflow_on and "schedule_approval_status" not in data:
                data["schedule_approval_status"] = "pending"
            if target_status != "done" and "approval_status" not in data and existing["approval_status"] not in (None, "none"):
                data["approval_status"] = "none"
            if target_status == "done" and existing["status"] != "done":
                became_done = True
                data["completed_at"] = now()
                data.setdefault("approval_status", "pending" if approval_workflow_on else "none")
            elif target_status != "done" and existing["status"] == "done":
                data["completed_at"] = None
                data["approval_status"] = "none"
            if data.get("recurrence_rule") == "monthly" or (data.get("recurrence_rule", existing["recurrence_rule"]) == "monthly" and ("due_date" in data or "start_date" in data)):
                anchor_value = data.get("due_date", existing["due_date"]) or data.get("start_date", existing["start_date"])
                if anchor_value:
                    anchor = date.fromisoformat(anchor_value)
                    data["recurrence_anchor_day"] = anchor.day
                    data["recurrence_anchor_month_end"] = int(anchor.day == month_calendar.monthrange(anchor.year, anchor.month)[1])
        if table == "todos" and (data.get("recurrence_rule") == "monthly" or
                                  (data.get("recurrence_rule", existing["recurrence_rule"]) == "monthly" and "todo_date" in data)):
            anchor_value = data.get("todo_date", existing["todo_date"])
            if anchor_value:
                anchor = date.fromisoformat(anchor_value)
                data["recurrence_anchor_day"] = anchor.day
                data["recurrence_anchor_month_end"] = int(anchor.day == month_calendar.monthrange(anchor.year, anchor.month)[1])
        if table == "todos":
            effective_recurrence_end = data.get("recurrence_end_date", existing["recurrence_end_date"])
            effective_todo_date = data.get("todo_date", existing["todo_date"])
            if "recurrence_end_date" not in data and effective_recurrence_end and effective_todo_date and effective_recurrence_end < effective_todo_date:
                data["recurrence_end_date"] = None
        # Validate cross-field date ordering using the merged resource.
        merged = merged_resource_for_validation(table, existing, data)
        try:
            MODELS[table].model_validate(merged)
        except ValidationError as exc:
            raise HTTPException(422, detail=json.loads(exc.json(include_url=False)))
        c.execute(f"UPDATE {table} SET {','.join(f'{x}=?' for x in data)} WHERE id=? AND user_id=? AND deleted_at IS NULL", [*data.values(), item_id, user_id])
        item = row_dict(c.execute(f"SELECT * FROM {table} WHERE id=? AND user_id=?", (item_id, user_id)).fetchone())
    if table == "events" and google_calendar.token_status(user_id)["connected"] and google_calendar.selected_calendar(user_id):
        try:
            google_calendar.push_event(user_id, item)
            item = rows("events", user_id, "WHERE id=?", (item_id,))[0]
        except HTTPException:
            item["sync_pending"] = True
    audit(user_id, "update", table, item_id, {"fields": sorted(data)})
    if table == "tasks" and became_done:
        next_id = spawn_recurring_task(item, user_id)
        if next_id:
            item["next_recurrence_id"] = next_id
    if table == "todos" and todo_became_done:
        next_id = spawn_recurring_todo(item, user_id)
        if next_id:
            item["next_recurrence_id"] = next_id
    return item


def _soft_delete_event(item_id: int, user: str) -> bool:
    remote = None
    with connection() as c:
        existing = c.execute("SELECT * FROM events WHERE id=? AND user_id=? AND deleted_at IS NULL", (item_id, user)).fetchone()
        if not existing:
            return False
        if existing["google_event_id"] and existing["google_calendar_id"]:
            remote = (existing["google_event_id"], existing["google_calendar_id"])
            c.execute("INSERT OR IGNORE INTO deleted_google_events(user_id,google_event_id,calendar_id,created_at) VALUES(?,?,?,?)", (user, *remote, now()))
        c.execute("UPDATE events SET deleted_at=?,sync_state='deleted' WHERE id=? AND user_id=?", (now(), item_id, user))
    if remote:
        try:
            google_calendar.delete_event(user, *remote)
        except HTTPException:
            return True
    return False


@app.get("/api/tasks/archived")
def archived_tasks(user=Depends(require_user)):
    with connection() as c:
        return [row_dict(r) for r in c.execute(
            "SELECT * FROM tasks WHERE user_id=? AND archived_at IS NOT NULL AND deleted_at IS NULL ORDER BY archived_at DESC", (user,)).fetchall()]


@app.get("/api/todos/archived")
def archived_todos(user=Depends(require_user)):
    with connection() as c:
        return [row_dict(r) for r in c.execute(
            "SELECT * FROM todos WHERE user_id=? AND archived_at IS NOT NULL AND deleted_at IS NULL ORDER BY archived_at DESC", (user,)).fetchall()]


@app.get("/api/events/archived")
def archived_events(user=Depends(require_user)):
    with connection() as c:
        return [row_dict(r) for r in c.execute(
            "SELECT * FROM events WHERE user_id=? AND archived_at IS NOT NULL AND deleted_at IS NULL ORDER BY archived_at DESC", (user,)).fetchall()]


@app.get("/api/work_logs/archived")
def archived_work_logs(user=Depends(require_user)):
    with connection() as c:
        return [row_dict(r) for r in c.execute(
            "SELECT * FROM work_logs WHERE user_id=? AND archived_at IS NOT NULL AND deleted_at IS NULL ORDER BY archived_at DESC", (user,)).fetchall()]


for _table in CONFIG:
    def list_endpoint(tags: str | None = None, limit: int | None = Query(None, ge=1, le=1000), offset: int = Query(0, ge=0), table=_table, user=Depends(require_user)):
        order = "start_at" if table == "events" else ("todo_date" if table == "todos" else ("log_date" if table == "work_logs" else "created_at"))
        where = "WHERE archived_at IS NULL " if table in ("tasks", "todos", "events", "work_logs") else ""
        items = rows(table, user, f"{where}ORDER BY {order} DESC", tags=(tags or "").split(","))
        if limit is not None:
            items = items[offset:offset + limit]
        comment_table = {"tasks": "task_comments", "todos": "todo_comments", "work_logs": "work_log_comments", "events": "event_comments"}.get(table)
        if comment_table and items:
            fk = {"task_comments": "task_id", "todo_comments": "todo_id", "work_log_comments": "work_log_id", "event_comments": "event_id"}[comment_table]
            with connection() as c:
                counts = dict(c.execute(
                    f"SELECT {fk}, COUNT(*) FROM {comment_table} WHERE user_id=? GROUP BY {fk}", (user,)).fetchall())
            for item in items:
                item["comment_count"] = counts.get(item["id"], 0)
        attachment_table = {"tasks": "task_attachments", "todos": "todo_attachments", "work_logs": "work_log_attachments", "events": "event_attachments"}.get(table)
        if attachment_table and items:
            fk = {"task_attachments": "task_id", "todo_attachments": "todo_id", "work_log_attachments": "work_log_id", "event_attachments": "event_id"}[attachment_table]
            with connection() as c:
                counts = dict(c.execute(
                    f"SELECT {fk}, COUNT(*) FROM {attachment_table} WHERE user_id=? GROUP BY {fk}", (user,)).fetchall())
                names = {}
                for row in c.execute(f"SELECT {fk} AS item_id, filename FROM {attachment_table} WHERE user_id=?", (user,)):
                    names.setdefault(row["item_id"], []).append(row["filename"])
            for item in items:
                item["attachment_count"] = counts.get(item["id"], 0)
                item["attachment_names"] = names.get(item["id"], [])
        return items

    def get_endpoint(item_id: int, table=_table, user=Depends(require_user)):
        items = rows(table, user, "WHERE id=?", (item_id,))
        if not items:
            raise HTTPException(404, "Item not found")
        return items[0]

    def post_endpoint(payload: dict = Body(...), table=_table, user=Depends(require_user)):
        return create_item(table, payload, user)

    def patch_endpoint(item_id: int, payload: dict = Body(...), table=_table, user=Depends(require_user)):
        return update_item(table, item_id, payload, user)

    def delete_endpoint(item_id: int, table=_table, user=Depends(require_user)):
        promoted_children = []
        if table == "events":
            existing = rows("events", user, "WHERE id=?", (item_id,))
            if not existing:
                raise HTTPException(404, "Item not found")
            pending = _soft_delete_event(item_id, user)
        else:
            with connection() as c:
                existing = c.execute(f"SELECT * FROM {table} WHERE id=? AND user_id=? AND deleted_at IS NULL", (item_id, user)).fetchone()
                if not existing:
                    raise HTTPException(404, "Item not found")
                c.execute(f"UPDATE {table} SET deleted_at=? WHERE id=? AND user_id=?", (now(), item_id, user))
                if table == "tasks":
                    promoted_children = [r["id"] for r in c.execute(
                        "SELECT id FROM tasks WHERE user_id=? AND parent_id=? AND deleted_at IS NULL", (user, item_id)).fetchall()]
                    if promoted_children:
                        c.execute(f"UPDATE tasks SET parent_id=NULL WHERE user_id=? AND parent_id=?", (user, item_id))
            pending = False
        audit(user, "delete", table, item_id, {"sync_pending": pending})
        for child_id in promoted_children:
            audit(user, "update", "tasks", child_id, {"parent_id": None, "reason": "parent_deleted"})
        return {"ok": True, "sync_pending": pending}

    app.add_api_route(f"/api/{_table}", list_endpoint, methods=["GET"], name=f"list_{_table}")
    app.add_api_route(f"/api/{_table}/{{item_id}}", get_endpoint, methods=["GET"], name=f"get_{_table}")
    app.add_api_route(f"/api/{_table}", post_endpoint, methods=["POST"], name=f"create_{_table}")
    app.add_api_route(f"/api/{_table}/{{item_id}}", patch_endpoint, methods=["PATCH", "PUT"], name=f"update_{_table}")
    app.add_api_route(f"/api/{_table}/{{item_id}}", delete_endpoint, methods=["DELETE"], name=f"delete_{_table}")


@app.get("/api/tasks/{task_id}/comments")
def task_comments_list(task_id: int, user=Depends(require_user)):
    with connection() as c:
        task = c.execute("SELECT id FROM tasks WHERE id=? AND user_id=? AND deleted_at IS NULL", (task_id, user)).fetchone()
        if not task:
            raise HTTPException(404, "Task not found")
        items = [row_dict(r) for r in c.execute(
            "SELECT * FROM task_comments WHERE task_id=? AND user_id=? ORDER BY created_at", (task_id, user)).fetchall()]
    return {"items": items}


@app.post("/api/tasks/{task_id}/comments")
def task_comments_create(task_id: int, payload: dict = Body(...), user=Depends(require_user)):
    body = str(payload.get("body", "")).strip()
    if not body:
        raise HTTPException(422, "댓글 내용을 입력하세요.")
    if len(body) > 2000:
        raise HTTPException(422, "댓글은 2000자 이하로 입력하세요.")
    with connection() as c:
        task = c.execute("SELECT id FROM tasks WHERE id=? AND user_id=? AND deleted_at IS NULL", (task_id, user)).fetchone()
        if not task:
            raise HTTPException(404, "Task not found")
        cur = c.execute("INSERT INTO task_comments(user_id,task_id,body,created_at) VALUES(?,?,?,?)", (user, task_id, body, now()))
        item = row_dict(c.execute("SELECT * FROM task_comments WHERE id=?", (cur.lastrowid,)).fetchone())
    audit(user, "create", "task_comment", item["id"], {"task_id": task_id})
    return item


@app.patch("/api/tasks/{task_id}/comments/{comment_id}")
def task_comments_update(task_id: int, comment_id: int, payload: dict = Body(...), user=Depends(require_user)):
    body = str(payload.get("body", "")).strip()
    if not body:
        raise HTTPException(422, "댓글 내용을 입력하세요.")
    if len(body) > 2000:
        raise HTTPException(422, "댓글은 2000자 이하로 입력하세요.")
    with connection() as c:
        existing = c.execute("SELECT id FROM task_comments WHERE id=? AND task_id=? AND user_id=?", (comment_id, task_id, user)).fetchone()
        if not existing:
            raise HTTPException(404, "Comment not found")
        c.execute("UPDATE task_comments SET body=?, edited_at=? WHERE id=? AND user_id=?", (body, now(), comment_id, user))
        item = row_dict(c.execute("SELECT * FROM task_comments WHERE id=?", (comment_id,)).fetchone())
    audit(user, "update", "task_comment", comment_id, {"task_id": task_id})
    return item


@app.delete("/api/tasks/{task_id}/comments/{comment_id}")
def task_comments_delete(task_id: int, comment_id: int, user=Depends(require_user)):
    with connection() as c:
        existing = c.execute("SELECT id FROM task_comments WHERE id=? AND task_id=? AND user_id=?", (comment_id, task_id, user)).fetchone()
        if not existing:
            raise HTTPException(404, "Comment not found")
        c.execute("DELETE FROM task_comments WHERE id=? AND user_id=?", (comment_id, user))
    audit(user, "delete", "task_comment", comment_id, {"task_id": task_id})
    return {"ok": True}


MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024
MAX_ATTACHMENTS_PER_TASK = 20


@app.get("/api/tasks/{task_id}/attachments")
def task_attachments_list(task_id: int, user=Depends(require_user)):
    with connection() as c:
        task = c.execute("SELECT id FROM tasks WHERE id=? AND user_id=? AND deleted_at IS NULL", (task_id, user)).fetchone()
        if not task:
            raise HTTPException(404, "Task not found")
        items = [row_dict(r) for r in c.execute(
            "SELECT id,user_id,task_id,filename,content_type,size_bytes,created_at FROM task_attachments WHERE task_id=? AND user_id=? ORDER BY created_at",
            (task_id, user)).fetchall()]
    return {"items": items}


@app.post("/api/tasks/{task_id}/attachments")
async def task_attachments_create(task_id: int, file: UploadFile = File(...), user=Depends(require_user)):
    data = await file.read()
    if not data:
        raise HTTPException(422, "빈 파일은 첨부할 수 없습니다.")
    if len(data) > MAX_ATTACHMENT_BYTES:
        raise HTTPException(422, "파일 크기는 5MB 이하만 첨부할 수 있습니다.")
    with connection() as c:
        task = c.execute("SELECT id FROM tasks WHERE id=? AND user_id=? AND deleted_at IS NULL", (task_id, user)).fetchone()
        if not task:
            raise HTTPException(404, "Task not found")
        count = c.execute("SELECT COUNT(*) n FROM task_attachments WHERE task_id=? AND user_id=?", (task_id, user)).fetchone()["n"]
        if count >= MAX_ATTACHMENTS_PER_TASK:
            raise HTTPException(422, f"첨부파일은 최대 {MAX_ATTACHMENTS_PER_TASK}개까지 등록할 수 있습니다.")
        filename = (file.filename or "attachment")[:255]
        content_type = file.content_type or "application/octet-stream"
        cur = c.execute(
            "INSERT INTO task_attachments(user_id,task_id,filename,content_type,size_bytes,data_base64,created_at) VALUES(?,?,?,?,?,?,?)",
            (user, task_id, filename, content_type, len(data), base64.b64encode(data).decode("ascii"), now()))
        item = row_dict(c.execute(
            "SELECT id,user_id,task_id,filename,content_type,size_bytes,created_at FROM task_attachments WHERE id=?",
            (cur.lastrowid,)).fetchone())
    audit(user, "create", "task_attachment", item["id"], {"task_id": task_id, "filename": filename})
    return item


@app.get("/api/tasks/{task_id}/attachments/{attachment_id}/download")
def task_attachments_download(task_id: int, attachment_id: int, user=Depends(require_user)):
    with connection() as c:
        row = c.execute(
            "SELECT * FROM task_attachments WHERE id=? AND task_id=? AND user_id=?", (attachment_id, task_id, user)).fetchone()
        if not row:
            raise HTTPException(404, "Attachment not found")
        item = row_dict(row)
    data = base64.b64decode(item["data_base64"])
    return Response(content=data, media_type=item["content_type"], headers={
        "Content-Disposition": f'attachment; filename="{item["filename"]}"'})


@app.delete("/api/tasks/{task_id}/attachments/{attachment_id}")
def task_attachments_delete(task_id: int, attachment_id: int, user=Depends(require_user)):
    with connection() as c:
        existing = c.execute(
            "SELECT id FROM task_attachments WHERE id=? AND task_id=? AND user_id=?", (attachment_id, task_id, user)).fetchone()
        if not existing:
            raise HTTPException(404, "Attachment not found")
        c.execute("DELETE FROM task_attachments WHERE id=? AND user_id=?", (attachment_id, user))
    audit(user, "delete", "task_attachment", attachment_id, {"task_id": task_id})
    return {"ok": True}


@app.get("/api/events/{event_id}/attachments")
def event_attachments_list(event_id: int, user=Depends(require_user)):
    with connection() as c:
        event = c.execute("SELECT id FROM events WHERE id=? AND user_id=? AND deleted_at IS NULL", (event_id, user)).fetchone()
        if not event:
            raise HTTPException(404, "Event not found")
        items = [row_dict(r) for r in c.execute(
            "SELECT id,user_id,event_id,filename,content_type,size_bytes,created_at FROM event_attachments WHERE event_id=? AND user_id=? ORDER BY created_at",
            (event_id, user)).fetchall()]
    return {"items": items}


@app.post("/api/events/{event_id}/attachments")
async def event_attachments_create(event_id: int, file: UploadFile = File(...), user=Depends(require_user)):
    data = await file.read()
    if not data:
        raise HTTPException(422, "빈 파일은 첨부할 수 없습니다.")
    if len(data) > MAX_ATTACHMENT_BYTES:
        raise HTTPException(422, "파일 크기는 5MB 이하만 첨부할 수 있습니다.")
    with connection() as c:
        event = c.execute("SELECT id FROM events WHERE id=? AND user_id=? AND deleted_at IS NULL", (event_id, user)).fetchone()
        if not event:
            raise HTTPException(404, "Event not found")
        count = c.execute("SELECT COUNT(*) n FROM event_attachments WHERE event_id=? AND user_id=?", (event_id, user)).fetchone()["n"]
        if count >= MAX_ATTACHMENTS_PER_TASK:
            raise HTTPException(422, f"첨부파일은 최대 {MAX_ATTACHMENTS_PER_TASK}개까지 등록할 수 있습니다.")
        filename = (file.filename or "attachment")[:255]
        content_type = file.content_type or "application/octet-stream"
        cur = c.execute(
            "INSERT INTO event_attachments(user_id,event_id,filename,content_type,size_bytes,data_base64,created_at) VALUES(?,?,?,?,?,?,?)",
            (user, event_id, filename, content_type, len(data), base64.b64encode(data).decode("ascii"), now()))
        item = row_dict(c.execute(
            "SELECT id,user_id,event_id,filename,content_type,size_bytes,created_at FROM event_attachments WHERE id=?",
            (cur.lastrowid,)).fetchone())
    audit(user, "create", "event_attachment", item["id"], {"event_id": event_id, "filename": filename})
    return item


@app.get("/api/events/{event_id}/attachments/{attachment_id}/download")
def event_attachments_download(event_id: int, attachment_id: int, user=Depends(require_user)):
    with connection() as c:
        row = c.execute(
            "SELECT * FROM event_attachments WHERE id=? AND event_id=? AND user_id=?", (attachment_id, event_id, user)).fetchone()
        if not row:
            raise HTTPException(404, "Attachment not found")
        item = row_dict(row)
    data = base64.b64decode(item["data_base64"])
    return Response(content=data, media_type=item["content_type"], headers={
        "Content-Disposition": f'attachment; filename="{item["filename"]}"'})


@app.delete("/api/events/{event_id}/attachments/{attachment_id}")
def event_attachments_delete(event_id: int, attachment_id: int, user=Depends(require_user)):
    with connection() as c:
        existing = c.execute(
            "SELECT id FROM event_attachments WHERE id=? AND event_id=? AND user_id=?", (attachment_id, event_id, user)).fetchone()
        if not existing:
            raise HTTPException(404, "Attachment not found")
        c.execute("DELETE FROM event_attachments WHERE id=? AND user_id=?", (attachment_id, user))
    audit(user, "delete", "event_attachment", attachment_id, {"event_id": event_id})
    return {"ok": True}


@app.get("/api/todos/{todo_id}/attachments")
def todo_attachments_list(todo_id: int, user=Depends(require_user)):
    with connection() as c:
        todo = c.execute("SELECT id FROM todos WHERE id=? AND user_id=? AND deleted_at IS NULL", (todo_id, user)).fetchone()
        if not todo:
            raise HTTPException(404, "Todo not found")
        items = [row_dict(r) for r in c.execute(
            "SELECT id,user_id,todo_id,filename,content_type,size_bytes,created_at FROM todo_attachments WHERE todo_id=? AND user_id=? ORDER BY created_at",
            (todo_id, user)).fetchall()]
    return {"items": items}


@app.post("/api/todos/{todo_id}/attachments")
async def todo_attachments_create(todo_id: int, file: UploadFile = File(...), user=Depends(require_user)):
    data = await file.read()
    if not data:
        raise HTTPException(422, "빈 파일은 첨부할 수 없습니다.")
    if len(data) > MAX_ATTACHMENT_BYTES:
        raise HTTPException(422, "파일 크기는 5MB 이하만 첨부할 수 있습니다.")
    with connection() as c:
        todo = c.execute("SELECT id FROM todos WHERE id=? AND user_id=? AND deleted_at IS NULL", (todo_id, user)).fetchone()
        if not todo:
            raise HTTPException(404, "Todo not found")
        count = c.execute("SELECT COUNT(*) n FROM todo_attachments WHERE todo_id=? AND user_id=?", (todo_id, user)).fetchone()["n"]
        if count >= MAX_ATTACHMENTS_PER_TASK:
            raise HTTPException(422, f"첨부파일은 최대 {MAX_ATTACHMENTS_PER_TASK}개까지 등록할 수 있습니다.")
        filename = (file.filename or "attachment")[:255]
        content_type = file.content_type or "application/octet-stream"
        cur = c.execute(
            "INSERT INTO todo_attachments(user_id,todo_id,filename,content_type,size_bytes,data_base64,created_at) VALUES(?,?,?,?,?,?,?)",
            (user, todo_id, filename, content_type, len(data), base64.b64encode(data).decode("ascii"), now()))
        item = row_dict(c.execute(
            "SELECT id,user_id,todo_id,filename,content_type,size_bytes,created_at FROM todo_attachments WHERE id=?",
            (cur.lastrowid,)).fetchone())
    audit(user, "create", "todo_attachment", item["id"], {"todo_id": todo_id, "filename": filename})
    return item


@app.get("/api/todos/{todo_id}/attachments/{attachment_id}/download")
def todo_attachments_download(todo_id: int, attachment_id: int, user=Depends(require_user)):
    with connection() as c:
        row = c.execute(
            "SELECT * FROM todo_attachments WHERE id=? AND todo_id=? AND user_id=?", (attachment_id, todo_id, user)).fetchone()
        if not row:
            raise HTTPException(404, "Attachment not found")
        item = row_dict(row)
    data = base64.b64decode(item["data_base64"])
    return Response(content=data, media_type=item["content_type"], headers={
        "Content-Disposition": f'attachment; filename="{item["filename"]}"'})


@app.delete("/api/todos/{todo_id}/attachments/{attachment_id}")
def todo_attachments_delete(todo_id: int, attachment_id: int, user=Depends(require_user)):
    with connection() as c:
        existing = c.execute(
            "SELECT id FROM todo_attachments WHERE id=? AND todo_id=? AND user_id=?", (attachment_id, todo_id, user)).fetchone()
        if not existing:
            raise HTTPException(404, "Attachment not found")
        c.execute("DELETE FROM todo_attachments WHERE id=? AND user_id=?", (attachment_id, user))
    audit(user, "delete", "todo_attachment", attachment_id, {"todo_id": todo_id})
    return {"ok": True}


@app.get("/api/work_logs/{log_id}/attachments")
def work_log_attachments_list(log_id: int, user=Depends(require_user)):
    with connection() as c:
        log = c.execute("SELECT id FROM work_logs WHERE id=? AND user_id=? AND deleted_at IS NULL", (log_id, user)).fetchone()
        if not log:
            raise HTTPException(404, "Work log not found")
        items = [row_dict(r) for r in c.execute(
            "SELECT id,user_id,work_log_id,filename,content_type,size_bytes,created_at FROM work_log_attachments WHERE work_log_id=? AND user_id=? ORDER BY created_at",
            (log_id, user)).fetchall()]
    return {"items": items}


@app.post("/api/work_logs/{log_id}/attachments")
async def work_log_attachments_create(log_id: int, file: UploadFile = File(...), user=Depends(require_user)):
    data = await file.read()
    if not data:
        raise HTTPException(422, "빈 파일은 첨부할 수 없습니다.")
    if len(data) > MAX_ATTACHMENT_BYTES:
        raise HTTPException(422, "파일 크기는 5MB 이하만 첨부할 수 있습니다.")
    with connection() as c:
        log = c.execute("SELECT id FROM work_logs WHERE id=? AND user_id=? AND deleted_at IS NULL", (log_id, user)).fetchone()
        if not log:
            raise HTTPException(404, "Work log not found")
        count = c.execute("SELECT COUNT(*) n FROM work_log_attachments WHERE work_log_id=? AND user_id=?", (log_id, user)).fetchone()["n"]
        if count >= MAX_ATTACHMENTS_PER_TASK:
            raise HTTPException(422, f"첨부파일은 최대 {MAX_ATTACHMENTS_PER_TASK}개까지 등록할 수 있습니다.")
        filename = (file.filename or "attachment")[:255]
        content_type = file.content_type or "application/octet-stream"
        cur = c.execute(
            "INSERT INTO work_log_attachments(user_id,work_log_id,filename,content_type,size_bytes,data_base64,created_at) VALUES(?,?,?,?,?,?,?)",
            (user, log_id, filename, content_type, len(data), base64.b64encode(data).decode("ascii"), now()))
        item = row_dict(c.execute(
            "SELECT id,user_id,work_log_id,filename,content_type,size_bytes,created_at FROM work_log_attachments WHERE id=?",
            (cur.lastrowid,)).fetchone())
    audit(user, "create", "work_log_attachment", item["id"], {"work_log_id": log_id, "filename": filename})
    return item


@app.get("/api/work_logs/{log_id}/attachments/{attachment_id}/download")
def work_log_attachments_download(log_id: int, attachment_id: int, user=Depends(require_user)):
    with connection() as c:
        row = c.execute(
            "SELECT * FROM work_log_attachments WHERE id=? AND work_log_id=? AND user_id=?", (attachment_id, log_id, user)).fetchone()
        if not row:
            raise HTTPException(404, "Attachment not found")
        item = row_dict(row)
    data = base64.b64decode(item["data_base64"])
    return Response(content=data, media_type=item["content_type"], headers={
        "Content-Disposition": f'attachment; filename="{item["filename"]}"'})


@app.delete("/api/work_logs/{log_id}/attachments/{attachment_id}")
def work_log_attachments_delete(log_id: int, attachment_id: int, user=Depends(require_user)):
    with connection() as c:
        existing = c.execute(
            "SELECT id FROM work_log_attachments WHERE id=? AND work_log_id=? AND user_id=?", (attachment_id, log_id, user)).fetchone()
        if not existing:
            raise HTTPException(404, "Attachment not found")
        c.execute("DELETE FROM work_log_attachments WHERE id=? AND user_id=?", (attachment_id, user))
    audit(user, "delete", "work_log_attachment", attachment_id, {"work_log_id": log_id})
    return {"ok": True}


@app.get("/api/events/{event_id}/comments")
def event_comments_list(event_id: int, user=Depends(require_user)):
    with connection() as c:
        event = c.execute("SELECT id FROM events WHERE id=? AND user_id=? AND deleted_at IS NULL", (event_id, user)).fetchone()
        if not event:
            raise HTTPException(404, "Event not found")
        items = [row_dict(r) for r in c.execute(
            "SELECT * FROM event_comments WHERE event_id=? AND user_id=? ORDER BY created_at", (event_id, user)).fetchall()]
    return {"items": items}


@app.post("/api/events/{event_id}/comments")
def event_comments_create(event_id: int, payload: dict = Body(...), user=Depends(require_user)):
    body = str(payload.get("body", "")).strip()
    if not body:
        raise HTTPException(422, "댓글 내용을 입력하세요.")
    if len(body) > 2000:
        raise HTTPException(422, "댓글은 2000자 이하로 입력하세요.")
    with connection() as c:
        event = c.execute("SELECT id FROM events WHERE id=? AND user_id=? AND deleted_at IS NULL", (event_id, user)).fetchone()
        if not event:
            raise HTTPException(404, "Event not found")
        cur = c.execute("INSERT INTO event_comments(user_id,event_id,body,created_at) VALUES(?,?,?,?)", (user, event_id, body, now()))
        item = row_dict(c.execute("SELECT * FROM event_comments WHERE id=?", (cur.lastrowid,)).fetchone())
    audit(user, "create", "event_comment", item["id"], {"event_id": event_id})
    return item


@app.patch("/api/events/{event_id}/comments/{comment_id}")
def event_comments_update(event_id: int, comment_id: int, payload: dict = Body(...), user=Depends(require_user)):
    body = str(payload.get("body", "")).strip()
    if not body:
        raise HTTPException(422, "댓글 내용을 입력하세요.")
    if len(body) > 2000:
        raise HTTPException(422, "댓글은 2000자 이하로 입력하세요.")
    with connection() as c:
        existing = c.execute("SELECT id FROM event_comments WHERE id=? AND event_id=? AND user_id=?", (comment_id, event_id, user)).fetchone()
        if not existing:
            raise HTTPException(404, "Comment not found")
        c.execute("UPDATE event_comments SET body=?, edited_at=? WHERE id=? AND user_id=?", (body, now(), comment_id, user))
        item = row_dict(c.execute("SELECT * FROM event_comments WHERE id=?", (comment_id,)).fetchone())
    audit(user, "update", "event_comment", comment_id, {"event_id": event_id})
    return item


@app.delete("/api/events/{event_id}/comments/{comment_id}")
def event_comments_delete(event_id: int, comment_id: int, user=Depends(require_user)):
    with connection() as c:
        existing = c.execute("SELECT id FROM event_comments WHERE id=? AND event_id=? AND user_id=?", (comment_id, event_id, user)).fetchone()
        if not existing:
            raise HTTPException(404, "Comment not found")
        c.execute("DELETE FROM event_comments WHERE id=? AND user_id=?", (comment_id, user))
    audit(user, "delete", "event_comment", comment_id, {"event_id": event_id})
    return {"ok": True}


@app.get("/api/todos/{todo_id}/comments")
def todo_comments_list(todo_id: int, user=Depends(require_user)):
    with connection() as c:
        todo = c.execute("SELECT id FROM todos WHERE id=? AND user_id=? AND deleted_at IS NULL", (todo_id, user)).fetchone()
        if not todo:
            raise HTTPException(404, "Todo not found")
        items = [row_dict(r) for r in c.execute(
            "SELECT * FROM todo_comments WHERE todo_id=? AND user_id=? ORDER BY created_at", (todo_id, user)).fetchall()]
    return {"items": items}


@app.post("/api/todos/{todo_id}/comments")
def todo_comments_create(todo_id: int, payload: dict = Body(...), user=Depends(require_user)):
    body = str(payload.get("body", "")).strip()
    if not body:
        raise HTTPException(422, "댓글 내용을 입력하세요.")
    if len(body) > 2000:
        raise HTTPException(422, "댓글은 2000자 이하로 입력하세요.")
    with connection() as c:
        todo = c.execute("SELECT id FROM todos WHERE id=? AND user_id=? AND deleted_at IS NULL", (todo_id, user)).fetchone()
        if not todo:
            raise HTTPException(404, "Todo not found")
        cur = c.execute("INSERT INTO todo_comments(user_id,todo_id,body,created_at) VALUES(?,?,?,?)", (user, todo_id, body, now()))
        item = row_dict(c.execute("SELECT * FROM todo_comments WHERE id=?", (cur.lastrowid,)).fetchone())
    audit(user, "create", "todo_comment", item["id"], {"todo_id": todo_id})
    return item


@app.patch("/api/todos/{todo_id}/comments/{comment_id}")
def todo_comments_update(todo_id: int, comment_id: int, payload: dict = Body(...), user=Depends(require_user)):
    body = str(payload.get("body", "")).strip()
    if not body:
        raise HTTPException(422, "댓글 내용을 입력하세요.")
    if len(body) > 2000:
        raise HTTPException(422, "댓글은 2000자 이하로 입력하세요.")
    with connection() as c:
        existing = c.execute("SELECT id FROM todo_comments WHERE id=? AND todo_id=? AND user_id=?", (comment_id, todo_id, user)).fetchone()
        if not existing:
            raise HTTPException(404, "Comment not found")
        c.execute("UPDATE todo_comments SET body=?, edited_at=? WHERE id=? AND user_id=?", (body, now(), comment_id, user))
        item = row_dict(c.execute("SELECT * FROM todo_comments WHERE id=?", (comment_id,)).fetchone())
    audit(user, "update", "todo_comment", comment_id, {"todo_id": todo_id})
    return item


@app.delete("/api/todos/{todo_id}/comments/{comment_id}")
def todo_comments_delete(todo_id: int, comment_id: int, user=Depends(require_user)):
    with connection() as c:
        existing = c.execute("SELECT id FROM todo_comments WHERE id=? AND todo_id=? AND user_id=?", (comment_id, todo_id, user)).fetchone()
        if not existing:
            raise HTTPException(404, "Comment not found")
        c.execute("DELETE FROM todo_comments WHERE id=? AND user_id=?", (comment_id, user))
    audit(user, "delete", "todo_comment", comment_id, {"todo_id": todo_id})
    return {"ok": True}


@app.get("/api/work_logs/{log_id}/comments")
def work_log_comments_list(log_id: int, user=Depends(require_user)):
    with connection() as c:
        log = c.execute("SELECT id FROM work_logs WHERE id=? AND user_id=? AND deleted_at IS NULL", (log_id, user)).fetchone()
        if not log:
            raise HTTPException(404, "Work log not found")
        items = [row_dict(r) for r in c.execute(
            "SELECT * FROM work_log_comments WHERE work_log_id=? AND user_id=? ORDER BY created_at", (log_id, user)).fetchall()]
    return {"items": items}


@app.post("/api/work_logs/{log_id}/comments")
def work_log_comments_create(log_id: int, payload: dict = Body(...), user=Depends(require_user)):
    body = str(payload.get("body", "")).strip()
    if not body:
        raise HTTPException(422, "댓글 내용을 입력하세요.")
    if len(body) > 2000:
        raise HTTPException(422, "댓글은 2000자 이하로 입력하세요.")
    with connection() as c:
        log = c.execute("SELECT id FROM work_logs WHERE id=? AND user_id=? AND deleted_at IS NULL", (log_id, user)).fetchone()
        if not log:
            raise HTTPException(404, "Work log not found")
        cur = c.execute("INSERT INTO work_log_comments(user_id,work_log_id,body,created_at) VALUES(?,?,?,?)", (user, log_id, body, now()))
        item = row_dict(c.execute("SELECT * FROM work_log_comments WHERE id=?", (cur.lastrowid,)).fetchone())
    audit(user, "create", "work_log_comment", item["id"], {"work_log_id": log_id})
    return item


@app.patch("/api/work_logs/{log_id}/comments/{comment_id}")
def work_log_comments_update(log_id: int, comment_id: int, payload: dict = Body(...), user=Depends(require_user)):
    body = str(payload.get("body", "")).strip()
    if not body:
        raise HTTPException(422, "댓글 내용을 입력하세요.")
    if len(body) > 2000:
        raise HTTPException(422, "댓글은 2000자 이하로 입력하세요.")
    with connection() as c:
        existing = c.execute("SELECT id FROM work_log_comments WHERE id=? AND work_log_id=? AND user_id=?", (comment_id, log_id, user)).fetchone()
        if not existing:
            raise HTTPException(404, "Comment not found")
        c.execute("UPDATE work_log_comments SET body=?, edited_at=? WHERE id=? AND user_id=?", (body, now(), comment_id, user))
        item = row_dict(c.execute("SELECT * FROM work_log_comments WHERE id=?", (comment_id,)).fetchone())
    audit(user, "update", "work_log_comment", comment_id, {"work_log_id": log_id})
    return item


@app.delete("/api/work_logs/{log_id}/comments/{comment_id}")
def work_log_comments_delete(log_id: int, comment_id: int, user=Depends(require_user)):
    with connection() as c:
        existing = c.execute("SELECT id FROM work_log_comments WHERE id=? AND work_log_id=? AND user_id=?", (comment_id, log_id, user)).fetchone()
        if not existing:
            raise HTTPException(404, "Comment not found")
        c.execute("DELETE FROM work_log_comments WHERE id=? AND user_id=?", (comment_id, user))
    audit(user, "delete", "work_log_comment", comment_id, {"work_log_id": log_id})
    return {"ok": True}


@app.post("/api/todos/{item_id}/skip-recurrence")
def skip_todo_recurrence(item_id: int, user=Depends(require_user)):
    with connection() as c:
        existing = c.execute("SELECT * FROM todos WHERE id=? AND user_id=? AND deleted_at IS NULL", (item_id, user)).fetchone()
    if not existing:
        raise HTTPException(404, "Item not found")
    todo = row_dict(existing)
    if not todo.get("recurrence_rule"):
        raise HTTPException(422, "반복 설정이 없는 할 일입니다.")
    next_date = next_recurrence_date(todo.get("todo_date"), todo["recurrence_rule"], todo.get("recurrence_anchor_day"), bool(todo.get("recurrence_anchor_month_end")))
    end_date = todo.get("recurrence_end_date")
    if not next_date or (end_date and next_date > end_date):
        raise HTTPException(422, "다음 회차가 없습니다.")
    return update_item("todos", item_id, {"todo_date": next_date}, user)


@app.post("/api/tasks/{item_id}/skip-recurrence")
def skip_task_recurrence(item_id: int, user=Depends(require_user)):
    with connection() as c:
        existing = c.execute("SELECT * FROM tasks WHERE id=? AND user_id=? AND deleted_at IS NULL", (item_id, user)).fetchone()
    if not existing:
        raise HTTPException(404, "Item not found")
    task = row_dict(existing)
    if not task.get("recurrence_rule"):
        raise HTTPException(422, "반복 설정이 없는 업무입니다.")
    if task.get("status") == "done":
        raise HTTPException(422, "완료된 업무는 건너뛸 수 없습니다.")
    anchor_day, anchor_end = task.get("recurrence_anchor_day"), bool(task.get("recurrence_anchor_month_end"))
    next_start = next_recurrence_date(task.get("start_date"), task["recurrence_rule"], anchor_day, anchor_end)
    next_due = next_recurrence_date(task.get("due_date"), task["recurrence_rule"], anchor_day, anchor_end)
    end_date = task.get("recurrence_end_date")
    if not (next_start or next_due) or (end_date and (next_start or next_due) > end_date):
        raise HTTPException(422, "다음 회차가 없습니다.")
    patch = {}
    if next_start:
        patch["start_date"] = next_start
    if next_due:
        patch["due_date"] = next_due
    return update_item("tasks", item_id, patch, user)


EVENT_SERIES_EDITABLE_FIELDS = {"title", "description", "location", "tags", "link_url", "color", "priority"}


@app.patch("/api/events/series/{group_id}")
def update_event_series(group_id: str, from_start_at: str, payload: dict = Body(...), user=Depends(require_user)):
    data = {k: v for k, v in payload.items() if k in EVENT_SERIES_EDITABLE_FIELDS}
    if not data:
        raise HTTPException(422, "수정할 필드가 없습니다.")
    with connection() as c:
        ids = [r["id"] for r in c.execute(
            "SELECT id FROM events WHERE user_id=? AND recurrence_group_id=? AND start_at>=? AND deleted_at IS NULL ORDER BY start_at",
            (user, group_id, from_start_at)).fetchall()]
    if not ids:
        raise HTTPException(404, "반복 일정을 찾을 수 없습니다.")
    items = [update_item("events", item_id, dict(data), user) for item_id in ids]
    return {"ok": True, "updated": len(items), "items": items}


@app.delete("/api/events/series/{group_id}")
def delete_event_series(group_id: str, from_start_at: str, user=Depends(require_user)):
    with connection() as c:
        ids = [r["id"] for r in c.execute(
            "SELECT id FROM events WHERE user_id=? AND recurrence_group_id=? AND start_at>=? AND deleted_at IS NULL ORDER BY start_at",
            (user, group_id, from_start_at)).fetchall()]
    if not ids:
        raise HTTPException(404, "반복 일정을 찾을 수 없습니다.")
    pending = False
    for item_id in ids:
        if _soft_delete_event(item_id, user):
            pending = True
        audit(user, "delete", "events", item_id, {"sync_pending": pending, "series": True})
    return {"ok": True, "deleted": len(ids), "sync_pending": pending}


@app.get("/api/trash")
def trash(user=Depends(require_user)):
    result = {}
    with connection() as c:
        for table in CONFIG:
            result[table] = [row_dict(r) for r in c.execute(
                f"SELECT * FROM {table} WHERE user_id=? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC", (user,)).fetchall()]
    return result


@app.post("/api/{table}/{item_id}/restore")
def restore_item(table: str, item_id: int, user=Depends(require_user)):
    if table not in CONFIG:
        raise HTTPException(404, "Resource not found")
    if table == "events":
        restored = google_calendar.prepare_restore_event(user, item_id)
        audit(user, "restore", table, item_id, {"google_mapping_reset": True})
        return restored
    with connection() as c:
        item = c.execute(f"SELECT * FROM {table} WHERE id=? AND user_id=? AND deleted_at IS NOT NULL", (item_id, user)).fetchone()
        if not item:
            raise HTTPException(404, "Deleted item not found")
        c.execute(f"UPDATE {table} SET deleted_at=NULL WHERE id=? AND user_id=?", (item_id, user))
    audit(user, "restore", table, item_id)
    return rows(table, user, "WHERE id=?", (item_id,))[0]


@app.delete("/api/trash/{table}/{item_id}")
def purge_trash_item(table: str, item_id: int, user=Depends(require_user)):
    if table not in CONFIG:
        raise HTTPException(404, "Resource not found")
    with connection() as c:
        item = c.execute(f"SELECT id FROM {table} WHERE id=? AND user_id=? AND deleted_at IS NOT NULL", (item_id, user)).fetchone()
        if not item:
            raise HTTPException(404, "Deleted item not found")
        c.execute(f"DELETE FROM {table} WHERE id=? AND user_id=?", (item_id, user))
    audit(user, "purge", table, item_id)
    return {"ok": True}


@app.delete("/api/trash")
def purge_trash(older_than_days: int = 30, user=Depends(require_user)):
    if older_than_days < 1 or older_than_days > 3650:
        raise HTTPException(422, "older_than_days must be between 1 and 3650")
    cutoff = (datetime.now() - timedelta(days=older_than_days)).isoformat(timespec="seconds")
    counts = {}
    with connection() as c:
        # Children/log references are safely detached by their foreign-key policies.
        for table in ("work_logs", "todos", "events", "tasks"):
            cur = c.execute(f"DELETE FROM {table} WHERE user_id=? AND deleted_at IS NOT NULL AND deleted_at<?", (user, cutoff))
            counts[table] = cur.rowcount
    audit(user, "purge", "trash", metadata={"older_than_days": older_than_days, "counts": counts})
    return {"ok": True, "purged": counts}


@app.post("/api/tasks/{item_id}/archive")
def archive_task(item_id: int, user=Depends(require_user)):
    with connection() as c:
        item = c.execute("SELECT id FROM tasks WHERE id=? AND user_id=? AND deleted_at IS NULL AND archived_at IS NULL", (item_id, user)).fetchone()
        if not item:
            raise HTTPException(404, "Item not found")
        c.execute("UPDATE tasks SET archived_at=? WHERE id=? AND user_id=?", (now(), item_id, user))
    audit(user, "archive", "tasks", item_id)
    return rows("tasks", user, "WHERE id=?", (item_id,))[0]


@app.post("/api/tasks/{item_id}/unarchive")
def unarchive_task(item_id: int, user=Depends(require_user)):
    with connection() as c:
        item = c.execute("SELECT id FROM tasks WHERE id=? AND user_id=? AND deleted_at IS NULL AND archived_at IS NOT NULL", (item_id, user)).fetchone()
        if not item:
            raise HTTPException(404, "Archived item not found")
        c.execute("UPDATE tasks SET archived_at=NULL WHERE id=? AND user_id=?", (item_id, user))
    audit(user, "unarchive", "tasks", item_id)
    return rows("tasks", user, "WHERE id=?", (item_id,))[0]


@app.post("/api/todos/{item_id}/archive")
def archive_todo(item_id: int, user=Depends(require_user)):
    with connection() as c:
        item = c.execute("SELECT id FROM todos WHERE id=? AND user_id=? AND deleted_at IS NULL AND archived_at IS NULL", (item_id, user)).fetchone()
        if not item:
            raise HTTPException(404, "Item not found")
        c.execute("UPDATE todos SET archived_at=? WHERE id=? AND user_id=?", (now(), item_id, user))
    audit(user, "archive", "todos", item_id)
    return rows("todos", user, "WHERE id=?", (item_id,))[0]


@app.post("/api/todos/{item_id}/unarchive")
def unarchive_todo(item_id: int, user=Depends(require_user)):
    with connection() as c:
        item = c.execute("SELECT id FROM todos WHERE id=? AND user_id=? AND deleted_at IS NULL AND archived_at IS NOT NULL", (item_id, user)).fetchone()
        if not item:
            raise HTTPException(404, "Archived item not found")
        c.execute("UPDATE todos SET archived_at=NULL WHERE id=? AND user_id=?", (item_id, user))
    audit(user, "unarchive", "todos", item_id)
    return rows("todos", user, "WHERE id=?", (item_id,))[0]


@app.post("/api/events/{item_id}/archive")
def archive_event(item_id: int, user=Depends(require_user)):
    with connection() as c:
        item = c.execute("SELECT id FROM events WHERE id=? AND user_id=? AND deleted_at IS NULL AND archived_at IS NULL", (item_id, user)).fetchone()
        if not item:
            raise HTTPException(404, "Item not found")
        c.execute("UPDATE events SET archived_at=? WHERE id=? AND user_id=?", (now(), item_id, user))
    audit(user, "archive", "events", item_id)
    return rows("events", user, "WHERE id=?", (item_id,))[0]


@app.post("/api/events/{item_id}/unarchive")
def unarchive_event(item_id: int, user=Depends(require_user)):
    with connection() as c:
        item = c.execute("SELECT id FROM events WHERE id=? AND user_id=? AND deleted_at IS NULL AND archived_at IS NOT NULL", (item_id, user)).fetchone()
        if not item:
            raise HTTPException(404, "Archived item not found")
        c.execute("UPDATE events SET archived_at=NULL WHERE id=? AND user_id=?", (item_id, user))
    audit(user, "unarchive", "events", item_id)
    return rows("events", user, "WHERE id=?", (item_id,))[0]


@app.post("/api/work_logs/{item_id}/archive")
def archive_work_log(item_id: int, user=Depends(require_user)):
    with connection() as c:
        item = c.execute("SELECT id FROM work_logs WHERE id=? AND user_id=? AND deleted_at IS NULL AND archived_at IS NULL", (item_id, user)).fetchone()
        if not item:
            raise HTTPException(404, "Item not found")
        c.execute("UPDATE work_logs SET archived_at=? WHERE id=? AND user_id=?", (now(), item_id, user))
    audit(user, "archive", "work_logs", item_id)
    return rows("work_logs", user, "WHERE id=?", (item_id,))[0]


@app.post("/api/work_logs/{item_id}/unarchive")
def unarchive_work_log(item_id: int, user=Depends(require_user)):
    with connection() as c:
        item = c.execute("SELECT id FROM work_logs WHERE id=? AND user_id=? AND deleted_at IS NULL AND archived_at IS NOT NULL", (item_id, user)).fetchone()
        if not item:
            raise HTTPException(404, "Archived item not found")
        c.execute("UPDATE work_logs SET archived_at=NULL WHERE id=? AND user_id=?", (item_id, user))
    audit(user, "unarchive", "work_logs", item_id)
    return rows("work_logs", user, "WHERE id=?", (item_id,))[0]


@app.get("/api/google/status")
def google_status(user=Depends(require_user)):
    calendar_id = google_calendar.selected_calendar(user)
    return {**google_calendar.token_status(user), "selected_calendar_id": calendar_id,
            "last_sync_at": google_calendar.last_sync_at(user, calendar_id)}


@app.get("/api/google/calendars")
def google_calendars(user=Depends(require_user)):
    return {"items": google_calendar.list_calendars(user), "selected_calendar_id": google_calendar.selected_calendar(user)}


@app.post("/api/google/select")
def google_select(payload: dict = Body(...), user=Depends(require_user)):
    calendar_id = str(payload.get("calendar_id", "")).strip()
    if not calendar_id:
        raise HTTPException(422, "calendar_id is required")
    google_calendar.select_calendar(user, calendar_id)
    return {"ok": True, "selected_calendar_id": calendar_id}


@app.post("/api/google/sync")
def google_sync(user=Depends(require_user)):
    enforce_rate(user, "google_sync", 6, 60)
    result = google_calendar.sync(user)
    for event_id in result.get("remote_deleted_ids", []):
        audit(user, "remote_delete", "events", event_id, {"source": "google_calendar"})
    audit(user, "sync", "google_calendar", metadata={k: v for k, v in result.items() if k != "items"})
    return result


@app.post("/api/events/{item_id}/resolve-conflict")
def resolve_event_conflict(item_id: int, payload: dict = Body(...), user=Depends(require_user)):
    strategy = payload.get("strategy")
    if strategy not in {"local", "remote"}:
        raise HTTPException(422, "strategy must be local or remote")
    result = google_calendar.resolve_conflict(user, item_id, strategy)
    audit(user, "resolve_conflict", "events", item_id, {"strategy": strategy})
    return result


CHILD_TABLES = {
    "task_comments": ("tasks", "task_id"), "task_attachments": ("tasks", "task_id"),
    "event_comments": ("events", "event_id"), "event_attachments": ("events", "event_id"),
    "todo_comments": ("todos", "todo_id"), "todo_attachments": ("todos", "todo_id"),
    "work_log_comments": ("work_logs", "work_log_id"), "work_log_attachments": ("work_logs", "work_log_id"),
}


@app.get("/api/export")
def export_data(user=Depends(require_user)):
    data = {"version": 1, "exported_at": now(),
            "tasks": rows("tasks", user), "events": rows("events", user),
            "todos": rows("todos", user), "work_logs": rows("work_logs", user),
            "feature_requests": rows("feature_requests", user)}
    for child_table in CHILD_TABLES:
        data[child_table] = rows(child_table, user)
    return data


IMPORT_TABLES = ("tasks", "events", "todos", "work_logs")


def _import_rows(payload):
    if not isinstance(payload, dict) or payload.get("version") != 1:
        raise HTTPException(422, "지원하지 않는 백업 파일 형식입니다. /api/export로 내려받은 version 1 파일이 필요합니다.")
    result = {}
    for table in (*IMPORT_TABLES, *CHILD_TABLES):
        items = payload.get(table) or []
        if not isinstance(items, list) or not all(isinstance(x, dict) for x in items):
            raise HTTPException(422, f"{table} 항목이 올바른 목록이 아닙니다")
        result[table] = items
    return result


def _normalize_import_row(table, index, raw):
    allowed = CONFIG[table][0]
    try:
        return normalize(table, {k: v for k, v in raw.items() if k in allowed})
    except HTTPException as exc:
        raise HTTPException(422, f"{table} {index + 1}번째 항목: {exc.detail}")


@app.post("/api/import/preview")
def import_preview(payload: dict = Body(...), user=Depends(require_user)):
    data = _import_rows(payload)
    for table in IMPORT_TABLES:
        for i, raw in enumerate(data[table]):
            _normalize_import_row(table, i, raw)
    with connection() as c:
        existing = {t: c.execute(f"SELECT COUNT(*) n FROM {t} WHERE user_id=? AND deleted_at IS NULL", (user,)).fetchone()["n"]
                    for t in IMPORT_TABLES}
    return {"ok": True, "exported_at": payload.get("exported_at"),
            "importable": {t: len(v) for t, v in data.items()}, "existing": existing}


@app.post("/api/import")
def import_data(payload: dict = Body(...), user=Depends(require_user)):
    enforce_rate(user, "import", 6, 60)
    mode = payload.get("mode")
    if mode not in {"merge", "replace"}:
        raise HTTPException(422, "mode must be merge or replace")
    data = _import_rows(payload.get("data") or {})
    timestamp = now()
    normalized = {table: [_normalize_import_row(table, i, raw) for i, raw in enumerate(data[table])]
                  for table in IMPORT_TABLES}
    id_maps = {t: {} for t in IMPORT_TABLES}
    pending_links, counts = [], {t: 0 for t in (*IMPORT_TABLES, *CHILD_TABLES)}
    # One transaction: any bad row rolls the whole import back.
    with connection() as c:
        if mode == "replace":
            for table in IMPORT_TABLES:
                c.execute(f"DELETE FROM {table} WHERE user_id=?", (user,))
        for table in IMPORT_TABLES:
            for i, item in enumerate(normalized[table]):
                raw = data[table][i]
                item["user_id"] = user
                item["created_at"] = raw.get("created_at") or timestamp
                if table in ("tasks", "events"):
                    item["updated_at"] = raw.get("updated_at") or timestamp
                if table == "tasks":
                    links = (item.pop("parent_id", None), item.pop("dependency_ids", None))
                    if item.get("status") == "done":
                        item["completed_at"] = raw.get("completed_at") or timestamp
                    if item.get("recurrence_rule") == "monthly":
                        anchor_value = item.get("due_date") or item.get("start_date")
                        if anchor_value:
                            anchor = date.fromisoformat(anchor_value)
                            item["recurrence_anchor_day"] = anchor.day
                            item["recurrence_anchor_month_end"] = int(anchor.day == month_calendar.monthrange(anchor.year, anchor.month)[1])
                if table == "todos" and item.get("recurrence_rule") == "monthly" and item.get("todo_date"):
                    anchor = date.fromisoformat(item["todo_date"])
                    item["recurrence_anchor_day"] = anchor.day
                    item["recurrence_anchor_month_end"] = int(anchor.day == month_calendar.monthrange(anchor.year, anchor.month)[1])
                if table == "events":
                    # Restored events stay local-only: no Google linkage, no push.
                    item["local_uid"] = str(uuid.uuid4())
                    item["sync_state"] = "clean"
                if table == "work_logs" and item.get("task_id") is not None:
                    item["task_id"] = id_maps["tasks"].get(raw.get("task_id"))
                cols = list(item)
                cur = c.execute(f"INSERT INTO {table} ({','.join(cols)}) VALUES ({','.join('?' for _ in cols)})",
                                [item[x] for x in cols])
                counts[table] += 1
                id_maps[table][raw.get("id")] = cur.lastrowid
                if table == "tasks" and (links[0] is not None or links[1]):
                    pending_links.append((cur.lastrowid, links[0], links[1]))
            if table == "tasks":
                # Second pass: children can precede parents in the export, so
                # remap hierarchy/dependencies only after every task exists.
                task_id_map = id_maps["tasks"]
                for new_id, old_parent, old_deps in pending_links:
                    mapped_parent = task_id_map.get(old_parent)
                    mapped_deps = sorted({task_id_map[d] for d in json.loads(old_deps or "[]") if d in task_id_map})
                    c.execute("UPDATE tasks SET parent_id=?,dependency_ids=? WHERE id=?",
                              (mapped_parent, json.dumps(mapped_deps), new_id))
        for child_table, (parent_table, fk_col) in CHILD_TABLES.items():
            cols = ["body", "created_at", "edited_at"] if child_table.endswith("_comments") else \
                   ["filename", "content_type", "size_bytes", "data_base64", "created_at"]
            for raw in data[child_table]:
                new_parent = id_maps[parent_table].get(raw.get(fk_col))
                if new_parent is None:
                    continue
                values = {k: raw.get(k) for k in cols if k in raw}
                values.setdefault("created_at", timestamp)
                values["user_id"] = user
                values[fk_col] = new_parent
                insert_cols = list(values)
                c.execute(f"INSERT INTO {child_table} ({','.join(insert_cols)}) VALUES ({','.join('?' for _ in insert_cols)})",
                          [values[x] for x in insert_cols])
                counts[child_table] += 1
    audit(user, "import", "backup", metadata={"mode": mode, **counts})
    return {"ok": True, "mode": mode, "imported": counts}


@app.post("/api/data/wipe")
def wipe_data(payload: dict = Body(...), user=Depends(require_user)):
    enforce_rate(user, "wipe", 3, 300)
    if payload.get("confirm") != "DELETE":
        raise HTTPException(422, "confirm 필드에 'DELETE'를 입력해야 합니다")
    with connection() as c:
        counts = {table: c.execute(f"SELECT COUNT(*) n FROM {table} WHERE user_id=?", (user,)).fetchone()["n"]
                  for table in IMPORT_TABLES}
        for table in IMPORT_TABLES:
            c.execute(f"DELETE FROM {table} WHERE user_id=?", (user,))
    audit(user, "wipe", "backup", metadata=counts)
    return {"ok": True, "deleted": counts}


@app.get("/api/tags")
def tag_usage(user=Depends(require_user)):
    counts = {}
    with connection() as c:
        for table in IMPORT_TABLES:
            for row in c.execute(f"SELECT tags FROM {table} WHERE user_id=? AND deleted_at IS NULL AND tags!='[]'", (user,)):
                for tag in json.loads(row["tags"] or "[]"):
                    entry = counts.setdefault(tag, {"tag": tag, "total": 0, "tables": {t: 0 for t in IMPORT_TABLES}})
                    entry["total"] += 1
                    entry["tables"][table] += 1
    items = sorted(counts.values(), key=lambda x: (-x["total"], x["tag"]))
    return {"items": items}


@app.post("/api/tags/rename")
def tag_rename(payload: dict = Body(...), user=Depends(require_user)):
    source = str(payload.get("from") or "").strip()
    target = str(payload.get("to") or "").strip()
    if not source:
        raise HTTPException(422, "바꿀 태그 이름(from)이 필요합니다")
    if len(target) > 50:
        raise HTTPException(422, "태그는 최대 50자입니다")
    timestamp = now()
    changed = 0
    with connection() as c:
        for table in IMPORT_TABLES:
            for row in c.execute(f"SELECT id,tags FROM {table} WHERE user_id=? AND tags!='[]'", (user,)).fetchall():
                tags = json.loads(row["tags"] or "[]")
                if source not in tags:
                    continue
                renamed, seen = [], set()
                for tag in tags:
                    value = target if tag == source else tag
                    if value and value.casefold() not in seen:
                        seen.add(value.casefold()); renamed.append(value)
                c.execute(f"UPDATE {table} SET tags=? WHERE id=? AND user_id=?",
                          (json.dumps(renamed, ensure_ascii=False), row["id"], user))
                changed += 1
    audit(user, "rename", "tags", metadata={"from": source, "to": target, "changed": changed})
    return {"ok": True, "from": source, "to": target, "changed": changed}


@app.get("/api/audit-logs")
def audit_log_list(limit: int = 100, start: str = None, end: str = None, user=Depends(require_user)):
    clauses, args = [], []
    if start:
        clauses.append("created_at>=?"); args.append(start)
    if end:
        clauses.append("created_at<=?"); args.append(end + "T23:59:59")
    where = ("WHERE " + " AND ".join(clauses) + " ") if clauses else ""
    items = rows("audit_logs", user, f"{where}ORDER BY created_at DESC LIMIT ?", (*args, max(1, min(limit, 500))))
    for item in items:
        item["metadata"] = json.loads(item.get("metadata") or "{}")
    return {"items": items}


@app.get("/api/diagnostics/errors")
def diagnostics_errors(limit: int = 20, user=Depends(require_user)):
    with connection() as c:
        items = [row_dict(r) for r in c.execute(
            "SELECT * FROM error_logs ORDER BY id DESC LIMIT ?", (max(1, min(limit, 100)),)).fetchall()]
    return {"items": items}


@app.get("/api/feature-requests")
def feature_request_list(status: Literal["pending", "in_progress", "done", "dismissed", "all"] = "all", limit: int = 100, user=Depends(require_user)):
    where = "ORDER BY created_at DESC LIMIT ?"
    args = (max(1, min(limit, 500)),)
    if status != "all":
        where = "WHERE status=? ORDER BY created_at DESC LIMIT ?"
        args = (status, *args)
    return {"items": rows("feature_requests", user, where, args)}


@app.get("/api/public/changelog")
def public_changelog():
    """Public, read-only product history and the shared open improvement queue."""
    with connection() as c:
        requests = [row_dict(row) for row in c.execute("""SELECT id,content,status,created_at,updated_at
          FROM feature_requests WHERE status IN ('pending','in_progress')
          ORDER BY CASE status WHEN 'in_progress' THEN 0 ELSE 1 END,created_at DESC LIMIT 500""").fetchall()]
        entries = [row_dict(row) for row in c.execute("""SELECT id,feature_request_id,request_content,requested_at,description,released_at
          FROM changelog_entries ORDER BY released_at DESC,id DESC LIMIT 500""").fetchall()]
    return {"requests": requests, "entries": entries}


@app.post("/api/public/changelog-summary")
async def public_changelog_summary(request: Request, payload: dict = Body(...)):
    """Public: AI-assisted (with local-rules fallback) monthly summary for changelog entries older than a week."""
    enforce_rate(request.client.host if request.client else "unknown", "changelog-summary", 20, 60)
    groups = payload.get("groups")
    if not isinstance(groups, list) or not groups or len(groups) > 36:
        raise HTTPException(422, "groups must be a non-empty list of at most 36 items")
    periods = []
    for group in groups:
        if not isinstance(group, dict): raise HTTPException(422, "each group must be an object")
        period = str(group.get("period") or "").strip()
        entries = group.get("entries")
        if not period or len(period) > 20 or not isinstance(entries, list) or not entries or len(entries) > 200:
            raise HTTPException(422, "each group needs a period and 1-200 entries")
        clean_entries = [{"description": str(item.get("description") or "")[:500]} for item in entries if isinstance(item, dict)]
        periods.append(await ai.smart_changelog_summary(period, clean_entries))
    return {"periods": periods}


def require_codex_admin(request: Request):
    enforce_rate(request.client.host if request.client else "unknown", "codex-admin", 30, 60)
    configured = os.getenv("CODEX_ADMIN_TOKEN", "").strip()
    supplied = request.headers.get("authorization", "")
    if not configured or not supplied.startswith("Bearer ") or not secrets.compare_digest(supplied[7:], configured):
        raise HTTPException(403, "Codex admin token is required")


@app.patch("/api/admin/feature-requests/{item_id}")
def feature_request_admin_update(item_id: int, request: Request, payload: dict = Body(...)):
    require_codex_admin(request)
    try:
        model = FeatureRequestAdminPayload.model_validate(payload)
    except ValidationError as exc:
        raise HTTPException(422, detail=json.loads(exc.json(include_url=False)))
    description = (model.description or "").strip()
    if model.status == "done" and not description:
        raise HTTPException(422, "description is required when completing a request")
    timestamp = now()
    with connection() as c:
        existing = c.execute("SELECT * FROM feature_requests WHERE id=?", (item_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "Feature request not found")
        completed_at = timestamp if model.status == "done" else None
        c.execute("UPDATE feature_requests SET status=?,updated_at=?,completed_at=? WHERE id=?",
                  (model.status, timestamp, completed_at, item_id))
        if model.status == "done":
            c.execute("""INSERT INTO changelog_entries(feature_request_id,request_content,requested_at,description,released_at)
              VALUES(?,?,?,?,?) ON CONFLICT(feature_request_id) DO UPDATE SET
              request_content=excluded.request_content,requested_at=excluded.requested_at,
              description=excluded.description,released_at=excluded.released_at""",
                      (item_id, existing["content"], existing["created_at"], description, timestamp))
        item = row_dict(c.execute("SELECT * FROM feature_requests WHERE id=?", (item_id,)).fetchone())
    return item


@app.post("/api/feature-requests")
def feature_request_create(payload: dict = Body(...), user=Depends(require_user)):
    try:
        model = FeatureRequestPayload.model_validate(payload)
    except ValidationError as exc:
        raise HTTPException(422, detail=json.loads(exc.json(include_url=False)))
    content = (model.content or "").strip()
    source = (model.source or "user").strip() or "user"
    if not content:
        raise HTTPException(422, "content is required")
    timestamp = now()
    with connection() as c:
        duplicate = c.execute("""SELECT * FROM feature_requests WHERE user_id=? AND content=?
          AND status IN ('pending','in_progress','done') ORDER BY created_at DESC LIMIT 1""",
                              (user, content)).fetchone()
        if duplicate:
            return row_dict(duplicate)
        cur = c.execute("""INSERT INTO feature_requests(user_id,content,source,status,created_at,updated_at)
          VALUES(?,?,?,?,?,?)""", (user, content, source, "pending", timestamp, timestamp))
        item = row_dict(c.execute("SELECT * FROM feature_requests WHERE id=? AND user_id=?", (cur.lastrowid, user)).fetchone())
    audit(user, "create", "feature_requests", item["id"], {"source": source})
    return item


@app.patch("/api/feature-requests/{item_id}")
def feature_request_update(item_id: int, payload: dict = Body(...), user=Depends(require_user)):
    try:
        model = FeatureRequestStatusPayload.model_validate(payload)
    except ValidationError as exc:
        raise HTTPException(422, detail=json.loads(exc.json(include_url=False)))
    timestamp = now()
    completed_at = timestamp if model.status == "done" else None
    with connection() as c:
        existing = c.execute("SELECT * FROM feature_requests WHERE id=? AND user_id=?", (item_id, user)).fetchone()
        if not existing:
            raise HTTPException(404, "Feature request not found")
        c.execute("UPDATE feature_requests SET status=?,updated_at=?,completed_at=? WHERE id=? AND user_id=?",
                  (model.status, timestamp, completed_at, item_id, user))
        item = row_dict(c.execute("SELECT * FROM feature_requests WHERE id=? AND user_id=?", (item_id, user)).fetchone())
    audit(user, "update", "feature_requests", item_id, {"status": model.status})
    return item


@app.get("/api/today")
def today(tags: str | None = None, user=Depends(require_user)):
    day = date.today().isoformat()
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    wanted = (tags or "").split(",")
    return {"date": day,
            "tasks": rows("tasks", user, "WHERE archived_at IS NULL AND (start_date IS NULL OR start_date<=?) AND (due_date IS NULL OR due_date>=?) AND status!='done' ORDER BY priority,due_date", (day, day), wanted),
            "events": rows("events", user, "WHERE archived_at IS NULL AND start_at<? AND end_at>? ORDER BY start_at", (tomorrow + "T00:00:00", day + "T00:00:00"), wanted),
            "todos": rows("todos", user, "WHERE archived_at IS NULL AND todo_date=? ORDER BY completed,(todo_time IS NULL),todo_time,id", (day,), wanted),
            "work_logs": rows("work_logs", user, "WHERE archived_at IS NULL AND log_date=? ORDER BY (log_time IS NULL),log_time,created_at DESC", (day,), wanted)}


def report_range(start_date, end_date):
    start = date.fromisoformat(start_date) if start_date else date.today().replace(day=1)
    end = date.fromisoformat(end_date) if end_date else date.today()
    if end < start or (end - start).days > 3660:
        raise HTTPException(422, "Invalid report period")
    return start.isoformat(), end.isoformat()


@app.get("/api/achievements")
@app.get("/api/reports/achievements")
def achievements(start_date: str | None = None, end_date: str | None = None,
                 tags: str | None = None, user=Depends(require_user)):
    try:
        start, end = report_range(start_date, end_date)
    except ValueError:
        raise HTTPException(422, "Dates must use YYYY-MM-DD")
    wanted = (tags or "").split(",")
    end_next = (date.fromisoformat(end) + timedelta(days=1)).isoformat()
    tasks = rows("tasks", user, "WHERE status='done' AND date(COALESCE(completed_at,updated_at)) BETWEEN ? AND ? ORDER BY COALESCE(completed_at,updated_at) DESC", (start, end), wanted)
    logs = rows("work_logs", user, "WHERE log_date BETWEEN ? AND ? ORDER BY log_date DESC", (start, end), wanted)
    events = rows("events", user, "WHERE start_at<? AND end_at>? ORDER BY start_at", (end_next + "T00:00:00", start + "T00:00:00"), wanted)
    todos = rows("todos", user, "WHERE completed=1 AND todo_date BETWEEN ? AND ? ORDER BY todo_date DESC", (start, end), wanted)
    all_tasks = rows("tasks", user, tags=wanted)
    active = [x for x in all_tasks if x.get("status") != "done"]
    timeline = []
    timeline.extend({"type": "task", "type_label": "완료 업무", "id": x["id"], "date": (x.get("completed_at") or x.get("updated_at") or "")[:10], "title": x["title"], "tags": x.get("tags", []), "estimated_minutes": x.get("estimated_minutes")} for x in tasks)
    timeline.extend({"type": "work_log", "type_label": "업무 기록", "id": x["id"], "date": x["log_date"], "content": x["content"], "tags": x.get("tags", []), "estimated_minutes": x.get("estimated_minutes")} for x in logs)
    timeline.extend({"type": "event", "type_label": "일정", "id": x["id"], "date": x["start_at"][:10], "title": x["title"], "tags": x.get("tags", []), "estimated_minutes": x.get("estimated_minutes")} for x in events)
    timeline.extend({"type": "todo", "type_label": "완료 Todo", "id": x["id"], "date": x["todo_date"], "title": x["title"], "tags": x.get("tags", []), "estimated_minutes": x.get("estimated_minutes")} for x in todos)
    timeline.sort(key=lambda x: x["date"], reverse=True)
    available_tags = sorted({tag for group in (tasks, logs, events, todos, all_tasks) for item in group for tag in item.get("tags", [])}, key=str.lower)
    by_tag = {}
    for x in tasks:
        for tag in (x.get("tags") or ["(태그 없음)"]):
            entry = by_tag.setdefault(tag, {"tag": tag, "completed_tasks": 0, "tracked_minutes": 0, "estimated_minutes": 0})
            entry["completed_tasks"] += 1
            entry["estimated_minutes"] += int(x.get("estimated_minutes") or 0)
    for x in logs:
        for tag in (x.get("tags") or ["(태그 없음)"]):
            entry = by_tag.setdefault(tag, {"tag": tag, "completed_tasks": 0, "tracked_minutes": 0, "estimated_minutes": 0})
            entry["tracked_minutes"] += int(x.get("duration_minutes") or 0)
    tag_breakdown = sorted(by_tag.values(), key=lambda e: (e["tracked_minutes"], e["completed_tasks"]), reverse=True)
    billable_minutes = sum(int(x.get("duration_minutes") or 0) for x in logs if x.get("billable"))
    hourly_rate = load_billing_hourly_rate_setting(user)
    return {"period": {"start": start, "end": end},
            "summary": {"completed_tasks": len(tasks), "work_logs": len(logs), "events": len(events),
                        "completed_todos": len(todos), "active_tasks": len(active),
                        "tracked_minutes": sum(int(x.get("duration_minutes") or 0) for x in logs),
                        "billable_minutes": billable_minutes,
                        "billing_hourly_rate": hourly_rate,
                        "billing_client_name": load_billing_client_name_setting(user),
                        "billable_amount": round(billable_minutes / 60 * hourly_rate, 2) if hourly_rate is not None else None,
                        "estimated_minutes": sum(int(x.get("estimated_minutes") or 0) for x in tasks),
                        "average_active_progress": round(sum(int(x.get("progress") or 0) for x in active) / len(active), 1) if active else 0},
            "tags": available_tags, "tag_breakdown": tag_breakdown, "timeline": timeline,
            "tasks": tasks, "work_logs": logs, "events": events, "todos": todos}


@app.post("/api/ai/parse")
async def ai_parse(payload: dict = Body(...), user=Depends(require_user)):
    enforce_rate(user, "ai", 20, 60)
    text = str(payload.get("text") or f"{payload.get('title', '')}\n{payload.get('content', '')}").strip()
    if not text or len(text) > 10000:
        raise HTTPException(422, "text is required and must be at most 10000 characters")
    context = rows("tasks", user, "WHERE status!='done' ORDER BY updated_at DESC LIMIT 20")
    return await ai.parse_text(text, context, user)


@app.get("/api/ai/status")
def ai_status(user=Depends(require_user)):
    return ai.status(user)


@app.get("/api/settings/ai")
def ai_settings(provider: Literal["openai", "gemini"] | None = None, user=Depends(require_user)):
    return ai.status(user, provider)


@app.put("/api/settings/ai")
def ai_settings_update(payload: dict = Body(...), user=Depends(require_user)):
    try:
        model = AISettingsPayload.model_validate(payload)
    except ValidationError as exc:
        raise HTTPException(422, detail=json.loads(exc.json(include_url=False)))
    try:
        return ai.save_user_config(user, model.model_dump(exclude_unset=True))
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))


@app.post("/api/settings/ai/test")
async def ai_settings_test(user=Depends(require_user)):
    enforce_rate(user, "ai", 20, 60)
    return await ai.test_connection(user)


@app.get("/api/settings/workflow")
def workflow_settings(user=Depends(require_user)):
    approval_workflow_on = load_approval_workflow_setting(user)
    return {"approval_workflow": approval_workflow_on, "billing_hourly_rate": load_billing_hourly_rate_setting(user), "billing_client_name": load_billing_client_name_setting(user)}


@app.put("/api/settings/workflow")
def workflow_settings_update(payload: dict = Body(...), user=Depends(require_user)):
    try:
        model = WorkflowSettingsPayload.model_validate(payload)
    except ValidationError as exc:
        raise HTTPException(422, detail=json.loads(exc.json(include_url=False)))
    value = model.model_dump(exclude_unset=True)
    if "approval_workflow" in value:
        approval_workflow_on = value["approval_workflow"]
        stored_value = "on" if approval_workflow_on else "off"
        with connection() as c:
            c.execute("""INSERT INTO app_settings(user_id,key,value,updated_at) VALUES(?,?,?,?)
              ON CONFLICT(user_id,key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at""",
                      (user, "approval_workflow", stored_value, now()))
        audit(user, "update", "settings", "approval_workflow", {"approval_workflow": approval_workflow_on})
    if "billing_hourly_rate" in value:
        rate = value["billing_hourly_rate"]
        with connection() as c:
            if rate is None:
                c.execute("DELETE FROM app_settings WHERE user_id=? AND key=?", (user, "billing_hourly_rate"))
            else:
                c.execute("""INSERT INTO app_settings(user_id,key,value,updated_at) VALUES(?,?,?,?)
                  ON CONFLICT(user_id,key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at""",
                          (user, "billing_hourly_rate", str(rate), now()))
        audit(user, "update", "settings", "billing_hourly_rate", {"billing_hourly_rate": rate})
    if "billing_client_name" in value:
        client_name = (value["billing_client_name"] or "").strip() or None
        with connection() as c:
            if client_name is None:
                c.execute("DELETE FROM app_settings WHERE user_id=? AND key=?", (user, "billing_client_name"))
            else:
                c.execute("""INSERT INTO app_settings(user_id,key,value,updated_at) VALUES(?,?,?,?)
                  ON CONFLICT(user_id,key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at""",
                          (user, "billing_client_name", client_name, now()))
        audit(user, "update", "settings", "billing_client_name", {"billing_client_name": client_name})
    return {"approval_workflow": load_approval_workflow_setting(user), "billing_hourly_rate": load_billing_hourly_rate_setting(user), "billing_client_name": load_billing_client_name_setting(user)}


@app.get("/api/settings/calendar-feed")
def calendar_feed_status(user=Depends(require_user)):
    with connection() as c:
        row = c.execute("SELECT value FROM app_settings WHERE user_id=? AND key=?", (user, "calendar_feed_token_hash")).fetchone()
    return {"enabled": row is not None}


@app.post("/api/settings/calendar-feed/rotate")
def calendar_feed_rotate(request: Request, user=Depends(require_user)):
    token = secrets.token_urlsafe(24)
    with connection() as c:
        c.execute("""INSERT INTO app_settings(user_id,key,value,updated_at) VALUES(?,?,?,?)
          ON CONFLICT(user_id,key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at""",
                  (user, "calendar_feed_token_hash", _hash(token), now()))
    audit(user, "update", "settings", "calendar_feed_token", {})
    feed_url = f"{str(request.base_url).rstrip('/')}/api/calendar-feed/{token}.ics"
    return {"enabled": True, "feed_url": feed_url}


@app.delete("/api/settings/calendar-feed")
def calendar_feed_disable(user=Depends(require_user)):
    with connection() as c:
        c.execute("DELETE FROM app_settings WHERE user_id=? AND key=?", (user, "calendar_feed_token_hash"))
    audit(user, "delete", "settings", "calendar_feed_token", {})
    return {"enabled": False}


@app.get("/api/calendar-feed/{token}.ics")
def calendar_feed(token: str):
    with connection() as c:
        row = c.execute("SELECT user_id FROM app_settings WHERE key=? AND value=?",
                        ("calendar_feed_token_hash", _hash(token))).fetchone()
    if not row:
        raise HTTPException(404, "Not found")
    return Response(content=build_calendar_feed(row["user_id"]), media_type="text/calendar; charset=utf-8")


@app.post("/api/ai/tag-recommendations")
async def ai_tag_recommendations(payload: dict = Body(...), user=Depends(require_user)):
    enforce_rate(user, "ai", 20, 60)
    text = str(payload.get("text", "")).strip()
    if not text or len(text) > 10000:
        raise HTTPException(422, "text is required and must be at most 10000 characters")
    existing = []
    for table in CONFIG:
        for item in rows(table, user):
            existing.extend(item.get("tags") or [])
    tags, source = await ai.smart_tag_recommendations(text, list(dict.fromkeys(existing)), user_id=user)
    return {"tags": tags, "preview_only": True, "source": source}


@app.get("/api/ai/period-summary")
async def ai_period_summary(start_date: str | None = None, end_date: str | None = None,
                      tags: str | None = None, user=Depends(require_user)):
    enforce_rate(user, "ai", 20, 60)
    report = achievements(start_date, end_date, tags, user)
    return await ai.smart_period_summary(report, user)


@app.get("/api/ai/project-suggestions")
async def ai_project_suggestions(start_date: str | None = None, end_date: str | None = None,
                                 limit: int = 5, tags: str | None = None, user=Depends(require_user)):
    enforce_rate(user, "ai", 20, 60)
    try:
        start, end = report_range(start_date, end_date)
    except ValueError:
        raise HTTPException(422, "Dates must use YYYY-MM-DD")
    wanted = (tags or "").split(",")
    tasks = rows("tasks", user, tags=wanted)
    logs = rows("work_logs", user, "WHERE log_date BETWEEN ? AND ? ORDER BY created_at DESC LIMIT 200", (start, end), tags=wanted)
    items, source = await ai.smart_project_suggestions(tasks, logs, max(1, min(limit, 20)), user)
    return {"items": items, "preview_only": True, "source": source}


@app.post("/api/ai/apply")
def ai_apply(payload: dict = Body(...), user=Depends(require_user)):
    enforce_rate(user, "ai_apply", 30, 60)
    table = {"task": "tasks", "event": "events", "todo": "todos", "work_log": "work_logs"}.get(payload.get("entity"))
    if not table:
        raise HTTPException(422, "Unsupported entity")
    if payload.get("action") == "update":
        try:
            item_id = int(payload.get("id"))
        except (TypeError, ValueError):
            raise HTTPException(422, "A numeric id is required")
        return update_item(table, item_id, payload.get("data") or {}, user)
    if payload.get("action") == "create":
        data = dict(payload.get("data") or {})
        if table == "events":
            rule, until = data.pop("recurrence_rule", None), data.pop("recurrence_end_date", None)
            if rule and until and data.get("start_at") and data.get("end_at"):
                return [create_item(table, occurrence, user) for occurrence in expand_recurring_event(data, rule, until)]
        return create_item(table, data, user)
    raise HTTPException(422, "Unsupported action")


@app.get("/api/ai/recommendations")
def ai_recommendations(limit: int = 5, user=Depends(require_user)):
    return {"items": ai.recommendations(rows("tasks", user), rows("todos", user), rows("work_logs", user, "ORDER BY created_at DESC LIMIT 30"), rows("events", user), max(1, min(limit, 20))), "source": "local-rules"}
