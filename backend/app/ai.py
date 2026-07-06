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
    highlights = [str(item.get("title") or item.get("content") or "").strip() for item in report.get("timeline", [])[:8]]
    highlights = [value for value in highlights if value]
    detail = f" 주요 활동은 {', '.join(highlights)}입니다." if highlights else ""
    return {"headline": f"완료 업무 {completed}건 · 업무 기록 {logs}건",
            "narrative": f"선택 기간에 업무 {completed}건을 완료하고 일정 {events}건을 진행했습니다. 현재 진행 중인 업무는 {active}건입니다.{detail}",
            "metrics": summary, "source": "private-rules", "preview_only": True}


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


async def _remote_json(system: str, payload: dict) -> dict:
    key = os.getenv("AI_API_KEY", "").strip()
    if not key:
        raise RuntimeError("AI is not configured")
    body = {"model": os.getenv("AI_MODEL", "gpt-5-mini"), "response_format": {"type": "json_object"},
            "messages": [{"role": "system", "content": system},
                         {"role": "user", "content": json.dumps(payload, ensure_ascii=False)}]}
    async with httpx.AsyncClient(timeout=float(os.getenv("AI_TIMEOUT_SECONDS", "30"))) as client:
        response = await client.post(os.getenv("AI_BASE_URL", "https://api.openai.com/v1").rstrip("/") + "/chat/completions",
                                     json=body, headers={"Authorization": f"Bearer {key}"})
        response.raise_for_status()
    return json.loads(response.json()["choices"][0]["message"]["content"])


async def smart_tag_recommendations(text, existing_tags=None, limit=5):
    fallback = tag_recommendations(text, existing_tags, limit)
    try:
        result = await _remote_json("Suggest concise Korean work tags. Return JSON {tags:[string]}. No other keys.",
                                    {"text": text[:3000], "allowed_existing_tags": list(existing_tags or [])[:100], "limit": limit})
        tags = result.get("tags")
        if not isinstance(tags, list):
            raise ValueError
        clean = list(dict.fromkeys(str(x).strip() for x in tags if str(x).strip()))[:limit]
        if any(len(x) > 50 for x in clean):
            raise ValueError
        return clean, "remote-ai"
    except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError, json.JSONDecodeError, RuntimeError):
        return fallback, "private-rules"


async def smart_period_summary(report):
    fallback = period_summary(report)
    try:
        result = await _remote_json(
            "Summarize Korean work metrics. Return JSON with short headline and narrative strings only.",
            {"period": report.get("period"), "metrics": report.get("summary"),
             "activities": [{"date": item.get("date"), "type": item.get("type"),
                              "text": str(item.get("title") or item.get("content") or "")[:500],
                              "tags": (item.get("tags") or [])[:10]}
                             for item in report.get("timeline", [])[:100]]})
        headline, narrative = result.get("headline"), result.get("narrative")
        if not isinstance(headline, str) or not isinstance(narrative, str) or len(headline) > 200 or len(narrative) > 2000:
            raise ValueError
        return {**fallback, "headline": headline, "narrative": narrative, "source": "remote-ai"}
    except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError, json.JSONDecodeError, RuntimeError):
        return fallback


async def smart_project_suggestions(tasks, logs, limit=5):
    fallback = project_progress_suggestions(tasks, logs, limit)
    allowed = {int(x["id"]) for x in tasks}
    minimal_tasks = [{k: x.get(k) for k in ("id", "title", "status", "progress", "due_date", "priority", "tags")} for x in tasks[:50]]
    try:
        result = await _remote_json(
            "Suggest preview-only task updates. JSON {items:[{action:'update',entity:'task',id:int,data:{progress?,status?,due_date?},confidence:number,reason:string}]}. Never create or delete.",
            {"today": date.today().isoformat(), "tasks": minimal_tasks,
             "recent_activity": [{"task_id": x.get("task_id"), "log_date": x.get("log_date"),
                                  "content": str(x.get("content") or "")[:500], "tags": (x.get("tags") or [])[:10]}
                                 for x in logs[:100]], "limit": limit})
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
