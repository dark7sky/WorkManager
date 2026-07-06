"""AI adapter with validated output and a deterministic private fallback."""

import json
import os
import re
from datetime import date, datetime, timedelta
from typing import Any

import httpx

ENTITIES = {"task", "event", "todo", "work_log"}
ACTIONS = {"create", "update"}


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
        try:
            candidate = date(today.year, int(match.group(1)), int(match.group(2)))
            return candidate.isoformat()
        except ValueError:
            pass
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


def status() -> dict[str, Any]:
    enabled = bool(os.getenv("AI_API_KEY", "").strip())
    return {"configured": enabled, "mode": "remote-ai" if enabled else "local-rules",
            "model": os.getenv("AI_MODEL", "gpt-5-mini") if enabled else None,
            "base_url": os.getenv("AI_BASE_URL", "https://api.openai.com/v1") if enabled else None}


async def parse_text(text: str, context: list[dict] | None = None) -> dict[str, Any]:
    key = os.getenv("AI_API_KEY", "").strip()
    if not key:
        return rule_parse(text)
    system = (
        "You convert Korean work-management commands into exactly one JSON action. "
        "Allowed actions: create, update. Allowed entities: task, event, todo, work_log. "
        "Return keys action, entity, optional integer id, data, confidence. Never invent an id. "
        "Use ISO 8601 dates. Task status is todo|doing|done and priority is low|normal|high. "
        "If the input contains several requests, select the first concrete action and include "
        "a short warning field saying that only one action can be previewed. JSON only."
    )
    prompt = {"today": date.today().isoformat(), "timezone": os.getenv("TZ", "Asia/Seoul"),
              "input": text, "recent_tasks": (context or [])[:20]}
    base = os.getenv("AI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    body = {"model": os.getenv("AI_MODEL", "gpt-5-mini"),
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
        normalized = _normalize(result)
        normalized["source"] = "remote-ai"
        return normalized
    except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError, json.JSONDecodeError) as exc:
        fallback = rule_parse(text)
        fallback["warning"] = f"AI 서비스 응답을 사용할 수 없어 로컬 규칙으로 분석했습니다 ({type(exc).__name__})."
        return fallback


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
