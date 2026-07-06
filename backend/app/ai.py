"""AI adapter with a deterministic, private fallback.

The public functions intentionally return plain dictionaries so the API can later
swap OpenAI-compatible cloud AI for an on-device model without changing clients.
"""
import json
import os
import re
from datetime import date, datetime, timedelta

import httpx


def _day(text: str) -> str:
    today = date.today()
    if "모레" in text:
        return (today + timedelta(days=2)).isoformat()
    if "내일" in text:
        return (today + timedelta(days=1)).isoformat()
    match = re.search(r"(\d{4})[./-](\d{1,2})[./-](\d{1,2})", text)
    if match:
        return date(*map(int, match.groups())).isoformat()
    match = re.search(r"(\d{1,2})월\s*(\d{1,2})일", text)
    if match:
        return date(today.year, int(match.group(1)), int(match.group(2))).isoformat()
    return today.isoformat()


def _time(text: str, default: int = 9) -> tuple[int, int]:
    match = re.search(r"(?:(오전|오후)\s*)?(\d{1,2})(?:시|:)(?:\s*(\d{1,2})분?)?", text)
    if not match:
        return default, 0
    meridiem, hour, minute = match.group(1), int(match.group(2)), int(match.group(3) or 0)
    if meridiem == "오후" and hour < 12:
        hour += 12
    if meridiem == "오전" and hour == 12:
        hour = 0
    return min(hour, 23), min(minute, 59)


def rule_parse(text: str) -> dict:
    """Conservative Korean parser used when no API key is configured."""
    clean = text.strip()
    day = _day(clean)
    title = re.sub(r"(?:오늘|내일|모레|\d{4}[./-]\d{1,2}[./-]\d{1,2}|\d{1,2}월\s*\d{1,2}일)", "", clean)
    title = re.sub(r"(?:(?:오전|오후)\s*)?\d{1,2}(?:시|:)(?:\s*\d{1,2}분?)?", "", title)
    title = re.sub(r"\s+", " ", title).strip(" ,.-") or clean

    update = re.search(r"(?:태스크|업무|항목)\s*#?(\d+).*(?:진행(?:률|도)?\s*)(\d{1,3})", clean)
    if update:
        progress = max(0, min(100, int(update.group(2))))
        return {"action": "update", "entity": "task", "id": int(update.group(1)),
                "data": {"progress": progress, "status": "done" if progress == 100 else "doing"},
                "confidence": 0.94, "source": "local-rules"}
    if any(word in clean for word in ("한 일", "완료했", "작업했", "처리했")):
        return {"action": "create", "entity": "work_log", "data": {"content": title, "log_date": day},
                "confidence": 0.75, "source": "local-rules"}
    if any(word in clean for word in ("일정", "회의", "미팅", "약속", "방문")):
        hour, minute = _time(clean)
        start = datetime.fromisoformat(day).replace(hour=hour, minute=minute)
        return {"action": "create", "entity": "event", "data": {"title": title, "description": "",
                "start_at": start.isoformat(timespec="minutes"), "end_at": (start + timedelta(hours=1)).isoformat(timespec="minutes"), "location": ""},
                "confidence": 0.78, "source": "local-rules"}
    if any(word in clean for word in ("할 일", "해야", "체크", "todo", "투두")):
        return {"action": "create", "entity": "todo", "data": {"title": title, "todo_date": day, "completed": False},
                "confidence": 0.76, "source": "local-rules"}
    return {"action": "create", "entity": "task", "data": {"title": title, "description": clean,
            "status": "todo", "priority": "normal", "progress": 0, "start_date": date.today().isoformat(),
            "due_date": day, "tags": []}, "confidence": 0.55, "source": "local-rules"}


async def parse_text(text: str, context: list[dict] | None = None) -> dict:
    key = os.getenv("AI_API_KEY", "")
    if not key:
        return rule_parse(text)
    schema = "Return JSON only: action create|update, entity task|event|todo|work_log, optional id, data, confidence. Dates ISO 8601."
    prompt = f"Today is {date.today().isoformat()}. Korean input: {text}\nContext: {json.dumps(context or [], ensure_ascii=False)[:6000]}"
    base = os.getenv("AI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    body = {"model": os.getenv("AI_MODEL", "gpt-4o-mini"), "temperature": 0.1,
            "response_format": {"type": "json_object"},
            "messages": [{"role": "system", "content": schema}, {"role": "user", "content": prompt}]}
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(f"{base}/chat/completions", json=body,
                                         headers={"Authorization": f"Bearer {key}"})
            response.raise_for_status()
        result = json.loads(response.json()["choices"][0]["message"]["content"])
        result["source"] = "remote-ai"
        return result
    except Exception as exc:
        fallback = rule_parse(text)
        fallback["warning"] = f"AI service unavailable; local rules used ({type(exc).__name__})"
        return fallback


def recommendations(tasks: list[dict], logs: list[dict], limit: int = 5) -> list[dict]:
    today = date.today().isoformat()
    active = [t for t in tasks if t.get("status") != "done" and int(t.get("progress", 0)) < 100]
    priority = {"high": 0, "normal": 1, "low": 2}
    active.sort(key=lambda t: (t.get("due_date") or "9999-12-31", priority.get(t.get("priority"), 1), -int(t.get("progress", 0))))
    output = []
    for task in active[:limit]:
        overdue = bool(task.get("due_date") and task["due_date"] < today)
        reason = "완료일이 지났습니다" if overdue else ("완료일이 가깝습니다" if task.get("due_date") else "진행 중인 업무입니다")
        output.append({"task_id": task["id"], "title": task["title"], "reason": reason,
                       "suggested_progress": min(100, int(task.get("progress", 0)) + 15), "due_date": task.get("due_date")})
    return output
