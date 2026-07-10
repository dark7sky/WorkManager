"""AI adapter with validated output and a deterministic private fallback."""

import base64
import hashlib
import json
import os
import re
from datetime import date, datetime, timedelta
from typing import Any

import httpx
from cryptography.fernet import Fernet, InvalidToken

ENTITIES = {"task", "event", "todo", "work_log"}
ACTIONS = {"create", "update"}
SUPPORTED_PROVIDERS = {"openai", "gemini"}
DEFAULT_PROVIDER = "openai"
DEFAULT_BASE_URLS = {
    "openai": "https://api.openai.com/v1",
    "gemini": "https://generativelanguage.googleapis.com/v1beta/openai/",
}
DEFAULT_MODELS = {
    "openai": "gpt-5-mini",
    "gemini": "gemini-3.5-flash",
}
AI_SETTING_KEYS = {
    "selected_provider": "ai_provider",
    "api_key": "ai_api_key",
    "base_url": "ai_base_url",
    "model": "ai_model",
}


def _fernet():
    secret = os.getenv("APP_SECRET", "")
    if not secret:
        raise RuntimeError("APP_SECRET is required for AI settings storage")
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(secret.encode()).digest()))


def _enc(value: str | None):
    return _fernet().encrypt(value.encode()).decode() if value else None


def _dec(value: str | None):
    if not value:
        return None
    try:
        return _fernet().decrypt(value.encode()).decode()
    except InvalidToken as exc:
        raise RuntimeError("Stored AI settings cannot be decrypted. Check APP_SECRET.") from exc


def _normalize_provider(value: str | None):
    provider = (value or DEFAULT_PROVIDER).strip().lower()
    return provider if provider in SUPPORTED_PROVIDERS else DEFAULT_PROVIDER


def _default_base_url(provider: str):
    return DEFAULT_BASE_URLS.get(provider, DEFAULT_BASE_URLS[DEFAULT_PROVIDER])


def _default_model(provider: str):
    return DEFAULT_MODELS.get(provider, DEFAULT_MODELS[DEFAULT_PROVIDER])


def _provider_setting_key(provider: str, field: str):
    return f"ai_{provider}_{field}"


def _load_provider_settings(user_id: str, provider: str):
    provider = _normalize_provider(provider)
    selected_provider = _normalize_provider(_load_setting(user_id, AI_SETTING_KEYS["selected_provider"]) or os.getenv("AI_PROVIDER") or DEFAULT_PROVIDER)
    legacy_provider = selected_provider
    stored_api_key = _dec(_load_setting(user_id, _provider_setting_key(provider, "api_key")))
    stored_base_url = (_load_setting(user_id, _provider_setting_key(provider, "base_url")) or "").strip()
    stored_model = (_load_setting(user_id, _provider_setting_key(provider, "model")) or "").strip()
    legacy_api_key = _dec(_load_setting(user_id, AI_SETTING_KEYS["api_key"])) if provider == legacy_provider else None
    legacy_base_url = (_load_setting(user_id, AI_SETTING_KEYS["base_url"]) or "").strip() if provider == legacy_provider else ""
    legacy_model = (_load_setting(user_id, AI_SETTING_KEYS["model"]) or "").strip() if provider == legacy_provider else ""
    env_provider = _normalize_provider(os.getenv("AI_PROVIDER") or DEFAULT_PROVIDER)
    env_api_key = os.getenv("AI_API_KEY", "").strip() if provider == env_provider else ""
    env_base_url = os.getenv("AI_BASE_URL", "").strip() if provider == env_provider else ""
    env_model = os.getenv("AI_MODEL", "").strip() if provider == env_provider else ""
    effective_api_key = stored_api_key or legacy_api_key or env_api_key
    effective_base_url = stored_base_url or legacy_base_url or env_base_url or _default_base_url(provider)
    effective_model = stored_model or legacy_model or env_model or _default_model(provider)
    has_user_settings = bool(stored_api_key or stored_base_url or stored_model or legacy_api_key or legacy_base_url or legacy_model)
    api_key_source = "user" if stored_api_key or legacy_api_key else "environment" if env_api_key else None
    return {
        "provider": provider,
        "api_key": effective_api_key,
        "base_url": effective_base_url,
        "model": effective_model,
        "has_user_settings": has_user_settings,
        "stored_api_key": stored_api_key,
        "stored_base_url": stored_base_url,
        "stored_model": stored_model,
        "legacy_api_key": legacy_api_key,
        "legacy_base_url": legacy_base_url,
        "legacy_model": legacy_model,
        "api_key_set": bool(effective_api_key),
        "api_key_source": api_key_source,
    }
def _selected_provider(user_id: str):
    stored = _load_setting(user_id, AI_SETTING_KEYS["selected_provider"])
    if stored:
        return _normalize_provider(stored)
    return _normalize_provider(os.getenv("AI_PROVIDER") or DEFAULT_PROVIDER)


def _load_setting(user_id: str, key: str):
    from .db import connection
    with connection() as c:
        row = c.execute("SELECT value FROM app_settings WHERE user_id=? AND key=?", (user_id, key)).fetchone()
    return row["value"] if row else None


def _store_settings(user_id: str, values: dict[str, str | None]):
    from .db import connection
    timestamp = datetime.now().isoformat(timespec="seconds")
    with connection() as c:
        for key, value in values.items():
            if value is None:
                c.execute("DELETE FROM app_settings WHERE user_id=? AND key=?", (user_id, key))
            else:
                c.execute("""INSERT INTO app_settings(user_id,key,value,updated_at) VALUES(?,?,?,?)
                  ON CONFLICT(user_id,key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at""",
                          (user_id, key, value, timestamp))


def get_user_config(user_id: str, provider: str | None = None):
    provider = _normalize_provider(provider or _selected_provider(user_id))
    user_settings = _load_provider_settings(user_id, provider)
    api_key = user_settings["api_key"]
    base_url = user_settings["base_url"]
    model = user_settings["model"]
    source = "user" if user_settings["has_user_settings"] else "environment"
    return {
        "provider": provider,
        "api_key": api_key,
        "base_url": base_url,
        "model": model,
        "source": source,
        "configured": bool(api_key),
        "api_key_set": bool(api_key),
        "saved_api_key": bool(user_settings["stored_api_key"] or user_settings["legacy_api_key"]),
        "has_user_settings": user_settings["has_user_settings"],
        "selected_provider": _selected_provider(user_id),
    }


def save_user_config(user_id: str, payload: dict[str, Any]):
    current = get_user_config(user_id, payload.get("provider"))
    provider = current["provider"]
    provider_settings = _load_provider_settings(user_id, provider)
    selected_provider = _normalize_provider(payload.get("provider") or provider)
    updates: dict[str, str | None] = {AI_SETTING_KEYS["selected_provider"]: selected_provider}

    api_key = str(payload.get("api_key") or "").strip() if "api_key" in payload else ""
    if api_key:
        updates[_provider_setting_key(provider, "api_key")] = _enc(api_key)
    elif provider_settings["stored_api_key"]:
        updates[_provider_setting_key(provider, "api_key")] = _enc(provider_settings["stored_api_key"])
    elif provider_settings["legacy_api_key"]:
        updates[_provider_setting_key(provider, "api_key")] = _enc(provider_settings["legacy_api_key"])
    elif current["configured"]:
        updates[_provider_setting_key(provider, "api_key")] = None
    else:
        raise ValueError("API key is required")

    if "base_url" in payload:
        base_url = str(payload.get("base_url") or "").strip() or _default_base_url(provider)
        updates[_provider_setting_key(provider, "base_url")] = base_url
    elif provider_settings["stored_base_url"]:
        updates[_provider_setting_key(provider, "base_url")] = provider_settings["stored_base_url"]
    elif provider_settings["legacy_base_url"]:
        updates[_provider_setting_key(provider, "base_url")] = provider_settings["legacy_base_url"]
    else:
        updates[_provider_setting_key(provider, "base_url")] = _default_base_url(provider)

    if "model" in payload:
        model = str(payload.get("model") or "").strip() or _default_model(provider)
        updates[_provider_setting_key(provider, "model")] = model
    elif provider_settings["stored_model"]:
        updates[_provider_setting_key(provider, "model")] = provider_settings["stored_model"]
    elif provider_settings["legacy_model"]:
        updates[_provider_setting_key(provider, "model")] = provider_settings["legacy_model"]
    else:
        updates[_provider_setting_key(provider, "model")] = _default_model(provider)

    _store_settings(user_id, updates)
    return status(user_id, provider)


def status(user_id: str, provider: str | None = None):
    config = get_user_config(user_id, provider)
    provider_name = "OpenAI" if config["provider"] == "openai" else "Gemini"
    binding_label = f"{provider_name} · {config['model']} · {'키 저장됨' if config['api_key_set'] else '키 필요'}"
    return {
        "configured": config["configured"],
        "enabled": config["configured"],
        "mode": "remote-ai" if config["configured"] else "local-rules",
        "provider": config["provider"],
        "provider_name": provider_name,
        "model": config["model"],
        "base_url": config["base_url"],
        "source": config["source"],
        "source_label": "계정 설정" if config["source"] == "user" else "서버 기본값",
        "api_key_set": config["api_key_set"],
        "message": f"{provider_name} 연결됨" if config["configured"] else f"{provider_name} 키 필요",
        "binding_label": binding_label,
        "binding": {
            "provider": config["provider"],
            "provider_name": provider_name,
            "model": config["model"],
            "api_key_set": config["api_key_set"],
            "label": binding_label,
        },
        "selected_provider": config["selected_provider"],
        "saved_api_key": config["saved_api_key"],
        "has_user_settings": config["has_user_settings"],
    }


def _day(text: str, today: date | None = None) -> str:
    today = today or date.today()
    if "모레" in text:
        return (today + timedelta(days=2)).isoformat()
    if "내일" in text:
        return (today + timedelta(days=1)).isoformat()
    if "오늘" in text:
        return today.isoformat()
    match = re.search(r"(\d{4})[./-](\d{1,2})[./-](\d{1,2})", text)
    if match:
        try:
            return date(*map(int, match.groups())).isoformat()
        except ValueError:
            return today.isoformat()
    match = re.search(r"(\d{1,2})\s*월\s*(\d{1,2})\s*일", text)
    if match:
        month, day = int(match.group(1)), int(match.group(2))
        for year in (today.year, today.year + 1):
            try:
                candidate = date(year, month, day)
            except ValueError:
                continue
            if candidate >= today:
                return candidate.isoformat()
    return today.isoformat()


def _time(text: str, default: int = 9) -> tuple[int, int]:
    match = re.search(r"(?:(오전|오후)\s*)?(\d{1,2})(?:\s*시|:)(?:\s*(\d{1,2})\s*분?)?", text)
    if not match:
        return default, 0
    meridiem, hour, minute = match.group(1), int(match.group(2)), int(match.group(3) or 0)
    if meridiem == "오후" and hour < 12:
        hour += 12
    if meridiem == "오전" and hour == 12:
        hour = 0
    return min(hour, 23), min(minute, 59)


def _title(text: str) -> str:
    value = re.sub(r"(?:오늘|내일|모레|\d{4}[./-]\d{1,2}[./-]\d{1,2}|\d{1,2}\s*월\s*\d{1,2}\s*일)", "", text)
    value = re.sub(r"(?:(?:오전|오후)\s*)?\d{1,2}(?:\s*시|:)(?:\s*\d{1,2}\s*분?)?", "", value)
    value = re.sub(r"\s+", " ", value).strip(" ,.-")
    return value[:160] or text.strip()[:160]


def rule_parse(text: str) -> dict[str, Any]:
    """Conservative Korean parser used when no API key is configured."""
    clean = text.strip()
    day, title = _day(clean), _title(clean)
    update = re.search(r"(?:태스크|업무|할\s*일)\s*#?(\d+).*?(?:진행(?:률)?\s*)?(\d{1,3})\s*%", clean)
    if update:
        progress = max(0, min(100, int(update.group(2))))
        return {"action": "update", "entity": "task", "id": int(update.group(1)),
                "data": {"progress": progress, "status": "done" if progress == 100 else "doing"},
                "confidence": 0.94, "source": "local-rules"}
    if any(word in clean for word in ("한 일", "완료 기록", "작업 기록", "처리함")):
        return {"action": "create", "entity": "work_log", "data": {"content": title, "log_date": day},
                "confidence": 0.78, "source": "local-rules"}
    if any(word in clean for word in ("일정", "회의", "미팅", "약속", "방문")):
        hour, minute = _time(clean)
        start = datetime.fromisoformat(day).replace(hour=hour, minute=minute)
        return {"action": "create", "entity": "event", "data": {"title": title, "description": "",
                "start_at": start.isoformat(timespec="minutes"),
                "end_at": (start + timedelta(hours=1)).isoformat(timespec="minutes"), "location": ""},
                "confidence": 0.8, "source": "local-rules"}
    if any(word in clean.lower() for word in ("해야", "체크", "todo", "투두")):
        return {"action": "create", "entity": "todo", "data": {"title": title, "todo_date": day, "completed": False},
                "confidence": 0.76, "source": "local-rules"}
    return {"action": "create", "entity": "task", "data": {"title": title, "description": clean,
            "status": "todo", "priority": "normal", "progress": 0,
            "start_date": date.today().isoformat(), "due_date": day, "tags": []},
            "confidence": 0.58, "source": "local-rules"}


MAX_BATCH_ITEMS = 10


def rule_parse_multi(text: str) -> list[dict[str, Any]]:
    """Split multi-line input into one action per non-empty line."""
    segments = [line.strip() for line in text.split("\n") if line.strip()]
    if not segments:
        segments = [text.strip()]
    return [rule_parse(segment) for segment in segments[:MAX_BATCH_ITEMS]]


def _normalize(result: Any) -> dict[str, Any]:
    if not isinstance(result, dict):
        raise ValueError("AI response is not an object")
    action, entity = result.get("action"), result.get("entity")
    if action not in ACTIONS or entity not in ENTITIES:
        raise ValueError("AI response has an unsupported action or entity")
    if action == "update" and not isinstance(result.get("id"), int):
        raise ValueError("AI update is missing a numeric id")
    if not isinstance(result.get("data"), dict):
        raise ValueError("AI response data is not an object")
    confidence = result.get("confidence", 0.5)
    result["confidence"] = max(0.0, min(1.0, float(confidence)))
    return result


async def parse_text(text: str, context: list[dict] | None = None, user_id: str | None = None) -> dict[str, Any]:
    """Returns {"items": [...]}: one action per detected request, up to MAX_BATCH_ITEMS."""
    config = get_user_config(user_id) if user_id else get_user_config("__legacy__")
    key = config["api_key"]
    if not key:
        return {"items": rule_parse_multi(text)}
    system = (
        "You convert Korean work-management commands into JSON actions. "
        "Allowed actions: create, update. Allowed entities: task, event, todo, work_log. "
        'Return {"items": [...]} where each item has keys action, entity, optional integer id, data, confidence. '
        "Never invent an id. Use ISO 8601 dates. Task status is todo|doing|done and priority is low|normal|high. "
        "If the input contains several separate requests (for example one per line), return one item per "
        f"request, up to {MAX_BATCH_ITEMS} items. JSON only."
    )
    prompt = {"today": date.today().isoformat(), "timezone": os.getenv("TZ", "Asia/Seoul"),
              "input": text, "recent_tasks": (context or [])[:20]}
    base = config["base_url"].rstrip("/")
    body = {"model": config["model"],
            "response_format": {"type": "json_object"},
            "messages": [{"role": "system", "content": system},
                         {"role": "user", "content": json.dumps(prompt, ensure_ascii=False, default=str)}]}
    try:
        timeout = float(os.getenv("AI_TIMEOUT_SECONDS", "30"))
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(f"{base}/chat/completions", json=body,
                                         headers={"Authorization": f"Bearer {key}"})
            response.raise_for_status()
        result = json.loads(response.json()["choices"][0]["message"]["content"])
        raw_items = result.get("items")
        if not isinstance(raw_items, list) or not raw_items:
            raise ValueError("AI response is missing a non-empty items list")
        items = [_normalize(item) for item in raw_items[:MAX_BATCH_ITEMS]]
        for item in items:
            item["source"] = "remote-ai"
        return {"items": items}
    except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError, json.JSONDecodeError) as exc:
        items = rule_parse_multi(text)
        items[0]["warning"] = f"AI 서비스 응답을 사용할 수 없어 로컬 규칙으로 분석했습니다 ({type(exc).__name__})."
        return {"items": items}


def recommendations(tasks: list[dict], logs: list[dict], limit: int = 5) -> list[dict]:
    today = date.today().isoformat()
    active = [t for t in tasks if t.get("status") != "done" and int(t.get("progress") or 0) < 100]
    priority = {"high": 0, "normal": 1, "low": 2}
    active.sort(key=lambda t: (t.get("due_date") or "9999-12-31", priority.get(t.get("priority"), 1),
                               -int(t.get("progress") or 0)))
    recent_task_ids = {log.get("task_id") for log in logs[:30] if log.get("task_id")}
    output = []
    for task in active[:max(0, limit)]:
        overdue = bool(task.get("due_date") and task["due_date"] < today)
        if overdue:
            reason = "완료일이 지났습니다"
        elif task.get("due_date") == today:
            reason = "오늘 완료 예정입니다"
        elif task.get("id") in recent_task_ids:
            reason = "최근 작업 기록이 있어 흐름을 이어가기 좋습니다"
        else:
            reason = "완료일과 우선순위를 기준으로 추천했습니다"
        output.append({"task_id": task["id"], "title": task["title"], "reason": reason,
                       "suggested_progress": min(100, int(task.get("progress") or 0) + 15),
                       "due_date": task.get("due_date"),
                       "suggested_due_date": task.get("due_date") or (date.today() + timedelta(days=3)).isoformat()})
    return output


def tag_recommendations(text: str, existing_tags=None, limit: int = 5) -> list[str]:
    """Private deterministic tag suggestions; never mutates user data."""
    clean = text.lower()
    mapping = {
        "회의": ("회의", "미팅", "meeting"), "보고": ("보고", "보고서", "report"),
        "개발": ("개발", "코드", "버그", "배포", "api"), "고객": ("고객", "거래처", "client"),
        "기획": ("기획", "계획", "설계"), "긴급": ("긴급", "급함", "urgent"),
    }
    result = [tag for tag, words in mapping.items() if any(word in clean for word in words)]
    for tag in existing_tags or []:
        value = str(tag).strip()
        if value and value.lower() in clean and value not in result:
            result.append(value)
    return result[:max(1, min(limit, 10))]


def period_summary(report: dict) -> dict:
    summary = report.get("summary", {})
    completed = int(summary.get("completed_tasks", 0))
    logs = int(summary.get("work_logs", 0))
    events = int(summary.get("events", 0))
    active = int(summary.get("active_tasks", 0))
    highlight_items = report.get("timeline", [])[:8]
    highlights = [{"type": item.get("type"), "type_label": item.get("type_label"), "id": item.get("id"),
                   "date": item.get("date"), "title": str(item.get("title") or item.get("content") or "").strip()}
                  for item in highlight_items]
    highlights = [item for item in highlights if item["title"]]
    detail = f" 주요 활동은 {', '.join(item['title'] for item in highlights)}입니다." if highlights else ""
    return {"headline": f"완료 업무 {completed}건 · 업무 기록 {logs}건",
            "narrative": f"선택 기간에 업무 {completed}건을 완료하고 일정 {events}건을 진행했습니다. 현재 진행 중인 업무는 {active}건입니다.{detail}",
            "metrics": summary, "highlights": highlights, "source": "private-rules", "preview_only": True}


def project_progress_suggestions(tasks: list[dict], logs: list[dict], limit: int = 5) -> list[dict]:
    """Return strictly validated preview actions, never apply them."""
    suggestions = []
    recent_ids = {x.get("task_id") for x in logs if x.get("task_id")}
    today = date.today()
    for task in tasks:
        if task.get("status") == "done":
            continue
        data, reason = {}, None
        due = task.get("due_date")
        if due and date.fromisoformat(due) < today:
            data["due_date"] = (today + timedelta(days=3)).isoformat()
            reason = "기한이 지나 현실적인 새 완료일 검토가 필요합니다."
        task_tags = {str(tag).casefold() for tag in task.get("tags") or []}
        tag_activity = any(task_tags & {str(tag).casefold() for tag in log.get("tags") or []} for log in logs)
        if (task.get("id") in recent_ids or tag_activity) and int(task.get("progress") or 0) < 90:
            data["progress"] = min(100, int(task.get("progress") or 0) + 10)
            data["status"] = "doing"
            reason = "선택 기간의 연결된 업무 기록 또는 공통 태그 활동을 근거로 진행률 갱신을 제안합니다."
        if data:
            action = _normalize({"action": "update", "entity": "task", "id": int(task["id"]),
                                 "data": data, "confidence": 0.7})
            action.update(reason=reason, preview_only=True, source="private-rules")
            suggestions.append(action)
        if len(suggestions) >= max(1, min(limit, 20)):
            break
    return suggestions


async def _remote_json(system: str, payload: dict, user_id: str | None = None) -> dict:
    config = get_user_config(user_id) if user_id else get_user_config("__legacy__")
    key = config["api_key"]
    if not key:
        raise RuntimeError("AI is not configured")
    body = {"model": config["model"], "response_format": {"type": "json_object"},
            "messages": [{"role": "system", "content": system},
                         {"role": "user", "content": json.dumps(payload, ensure_ascii=False)}]}
    async with httpx.AsyncClient(timeout=float(os.getenv("AI_TIMEOUT_SECONDS", "30"))) as client:
        response = await client.post(config["base_url"].rstrip("/") + "/chat/completions",
                                     json=body, headers={"Authorization": f"Bearer {key}"})
        response.raise_for_status()
    return json.loads(response.json()["choices"][0]["message"]["content"])


async def smart_tag_recommendations(text, existing_tags=None, limit=5, user_id: str | None = None):
    fallback = tag_recommendations(text, existing_tags, limit)
    try:
        result = await _remote_json("Suggest concise Korean work tags. Return JSON {tags:[string]}. No other keys.",
                                    {"text": text[:3000], "allowed_existing_tags": list(existing_tags or [])[:100], "limit": limit},
                                    user_id)
        tags = result.get("tags")
        if not isinstance(tags, list):
            raise ValueError
        clean = list(dict.fromkeys(str(x).strip() for x in tags if str(x).strip()))[:limit]
        if any(len(x) > 50 for x in clean):
            raise ValueError
        return clean, "remote-ai"
    except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError, json.JSONDecodeError, RuntimeError):
        return fallback, "private-rules"


async def smart_period_summary(report, user_id: str | None = None):
    fallback = period_summary(report)
    try:
        result = await _remote_json(
            "Summarize Korean work metrics. Return JSON with short headline and narrative strings only.",
            {"period": report.get("period"), "metrics": report.get("summary"),
             "activities": [{"date": item.get("date"), "type": item.get("type"),
                              "text": str(item.get("title") or item.get("content") or "")[:500],
                              "tags": (item.get("tags") or [])[:10]}
                             for item in report.get("timeline", [])[:100]]},
            user_id)
        headline, narrative = result.get("headline"), result.get("narrative")
        if not isinstance(headline, str) or not isinstance(narrative, str) or len(headline) > 200 or len(narrative) > 2000:
            raise ValueError
        return {**fallback, "headline": headline, "narrative": narrative, "source": "remote-ai"}
    except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError, json.JSONDecodeError, RuntimeError):
        return fallback


async def smart_project_suggestions(tasks, logs, limit=5, user_id: str | None = None):
    fallback = project_progress_suggestions(tasks, logs, limit)
    allowed = {int(x["id"]) for x in tasks}
    minimal_tasks = [{k: x.get(k) for k in ("id", "title", "status", "progress", "due_date", "priority", "tags")} for x in tasks[:50]]
    try:
        result = await _remote_json(
            "Suggest preview-only task updates. JSON {items:[{action:'update',entity:'task',id:int,data:{progress?,status?,due_date?},confidence:number,reason:string}]}. Never create or delete.",
            {"today": date.today().isoformat(), "tasks": minimal_tasks,
             "recent_activity": [{"task_id": x.get("task_id"), "log_date": x.get("log_date"),
                                  "content": str(x.get("content") or "")[:500], "tags": (x.get("tags") or [])[:10]}
                                 for x in logs[:100]], "limit": limit},
            user_id)
        if not isinstance(result.get("items"), list):
            raise ValueError
        output = []
        allowed_fields = {"progress", "status", "due_date"}
        for raw in result["items"][:limit]:
            item = _normalize(raw)
            if item["action"] != "update" or item["entity"] != "task" or item["id"] not in allowed or not set(item["data"]).issubset(allowed_fields):
                raise ValueError
            if "progress" in item["data"] and not 0 <= int(item["data"]["progress"]) <= 100:
                raise ValueError
            if "status" in item["data"] and item["data"]["status"] not in {"todo", "doing", "done"}:
                raise ValueError
            if "due_date" in item["data"]:
                date.fromisoformat(item["data"]["due_date"])
            output.append({"action": "update", "entity": "task", "id": item["id"], "data": item["data"],
                           "confidence": item["confidence"], "preview_only": True, "source": "remote-ai",
                           "reason": str(raw.get("reason", ""))[:500]})
        return output, "remote-ai"
    except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError, json.JSONDecodeError, RuntimeError):
        return fallback, "private-rules"
