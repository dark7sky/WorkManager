import base64, hashlib, hmac, json, os, time
from fastapi import Cookie, HTTPException

LOGIN_ID = os.getenv("APP_LOGIN_ID", "admin")
LOGIN_PASSWORD = os.getenv("APP_LOGIN_PASSWORD", "change-me-now")
SECRET = os.getenv("APP_SECRET", "development-secret-change-me").encode()

def verify_credentials(user_id: str, password: str) -> bool:
    return hmac.compare_digest(user_id, LOGIN_ID) and hmac.compare_digest(password, LOGIN_PASSWORD)

def create_session(subject: str = LOGIN_ID) -> str:
    raw = json.dumps({"sub": subject, "exp": int(time.time()) + 1209600}).encode()
    payload = base64.urlsafe_b64encode(raw).decode()
    signature = hmac.new(SECRET, payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{signature}"

def require_user(wm_session: str | None = Cookie(default=None)) -> str:
    try:
        payload, signature = (wm_session or "").rsplit(".", 1)
        expected = hmac.new(SECRET, payload.encode(), hashlib.sha256).hexdigest()
        data = json.loads(base64.urlsafe_b64decode(payload))
        if not hmac.compare_digest(signature, expected) or data["exp"] < time.time(): raise ValueError
        return data["sub"]
    except Exception:
        raise HTTPException(401, "로그인이 필요합니다.")
