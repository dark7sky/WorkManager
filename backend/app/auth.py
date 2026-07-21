import hashlib
import os
import secrets
import time

from fastapi import Cookie, HTTPException

from .db import DEMO_USER_ID, connection

SESSION_TTL = 60 * 60 * 24 * 14
DEMO_SESSION_TTL = 60 * 60 * 6
LAST_SEEN_WRITE_INTERVAL = 300


def _hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


def _describe_user_agent(user_agent):
    if not user_agent:
        return None
    ua = user_agent.lower()
    if "iphone" in ua:
        os_label = "iPhone"
    elif "ipad" in ua:
        os_label = "iPad"
    elif "android" in ua:
        os_label = "Android"
    elif "windows" in ua:
        os_label = "Windows"
    elif "mac os x" in ua or "macintosh" in ua:
        os_label = "Mac"
    elif "linux" in ua:
        os_label = "Linux"
    else:
        os_label = None
    if "edg/" in ua:
        browser_label = "Edge"
    elif "opr/" in ua or "opera" in ua:
        browser_label = "Opera"
    elif "chrome" in ua or "crios" in ua:
        browser_label = "Chrome"
    elif "firefox" in ua or "fxios" in ua:
        browser_label = "Firefox"
    elif "safari" in ua:
        browser_label = "Safari"
    else:
        browser_label = None
    if browser_label and os_label:
        return f"{browser_label} · {os_label}"
    return browser_label or os_label


def create_session(user_id, ttl=SESSION_TTL, user_agent=None):
    token = secrets.token_urlsafe(48)
    now = int(time.time())
    with connection() as c:
        c.execute("DELETE FROM sessions WHERE expires_at<?", (now,))
        c.execute("INSERT INTO sessions(token_hash,user_id,expires_at,created_at,last_seen_at,user_agent) VALUES(?,?,?,?,?,?)",
                  (_hash(token), user_id, now + ttl, now, now, (user_agent or "")[:300]))
    return token


def session_user_id(token):
    """Lightweight lookup used by the read-only-demo middleware; no allowlist/expiry side effects."""
    if not token:
        return None
    with connection() as c:
        row = c.execute("SELECT user_id,expires_at FROM sessions WHERE token_hash=?", (_hash(token),)).fetchone()
    if not row or row["expires_at"] < int(time.time()):
        return None
    return row["user_id"]


def revoke_session(token):
    if token:
        with connection() as c:
            c.execute("DELETE FROM sessions WHERE token_hash=?", (_hash(token),))


def list_sessions(user_id, current_token):
    current_hash = _hash(current_token) if current_token else None
    with connection() as c:
        rows = c.execute("""SELECT token_hash,created_at,last_seen_at,expires_at,user_agent FROM sessions
          WHERE user_id=? ORDER BY last_seen_at DESC""", (user_id,)).fetchall()
    return [{"id": row["token_hash"], "created_at": row["created_at"], "last_seen_at": row["last_seen_at"],
             "expires_at": row["expires_at"], "current": row["token_hash"] == current_hash,
             "device": _describe_user_agent(row["user_agent"])} for row in rows]


def revoke_session_by_id(user_id, session_id):
    with connection() as c:
        cur = c.execute("DELETE FROM sessions WHERE token_hash=? AND user_id=?", (session_id, user_id))
    return cur.rowcount > 0


def revoke_other_sessions(user_id, current_token):
    current_hash = _hash(current_token) if current_token else None
    with connection() as c:
        cur = c.execute("DELETE FROM sessions WHERE user_id=? AND token_hash!=?", (user_id, current_hash))
    return cur.rowcount


def require_user(wm_session: str | None = Cookie(default=None)) -> str:
    if not wm_session:
        raise HTTPException(401, "로그인이 필요합니다")
    now = int(time.time())
    with connection() as c:
        row = c.execute("""SELECT sessions.user_id,sessions.expires_at,sessions.last_seen_at,users.email
          FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token_hash=?""",
                        (_hash(wm_session),)).fetchone()
        if not row or row["expires_at"] < now:
            if row:
                c.execute("DELETE FROM sessions WHERE token_hash=?", (_hash(wm_session),))
                c.commit()
            raise HTTPException(401, "세션이 만료되었습니다")
        if row["user_id"] != DEMO_USER_ID:
            allowed = {value.strip().casefold() for value in os.getenv("GOOGLE_ALLOWED_EMAIL", "").split(",") if value.strip()}
            if allowed and str(row["email"]).casefold() not in allowed:
                c.execute("DELETE FROM sessions WHERE token_hash=?", (_hash(wm_session),))
                c.commit()
                raise HTTPException(403, "This Google account is no longer allowed")
        if row["last_seen_at"] < now - LAST_SEEN_WRITE_INTERVAL:
            c.execute("UPDATE sessions SET last_seen_at=? WHERE token_hash=?", (now, _hash(wm_session)))
        return row["user_id"]
