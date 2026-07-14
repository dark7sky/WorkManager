import asyncio
import os
import tempfile
import unittest
from datetime import date, timedelta
from unittest.mock import patch

from app import ai


class RuleParserTests(unittest.TestCase):
    def test_korean_event_has_iso_range(self):
        result = ai.rule_parse("내일 오후 3시 고객 회의")
        self.assertEqual(result["entity"], "event")
        self.assertEqual(result["data"]["start_at"][:10], (date.today() + timedelta(days=1)).isoformat())
        self.assertIn("15:00", result["data"]["start_at"])

    def test_rule_parse_multi_splits_multiline_input_into_one_item_per_line(self):
        result = ai.rule_parse_multi("내일 오후 3시 고객 회의\n오늘 한 일: 배포 완료")
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]["entity"], "event")
        self.assertEqual(result[1]["entity"], "work_log")

    def test_rule_parse_multi_single_line_returns_one_item(self):
        result = ai.rule_parse_multi("업무 #7 진행률 50%")
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["action"], "update")

    def test_rule_parse_multi_caps_at_max_batch_items(self):
        text = "\n".join(f"할 일 {i} 처리" for i in range(15))
        result = ai.rule_parse_multi(text)
        self.assertEqual(len(result), ai.MAX_BATCH_ITEMS)

    def test_rule_parse_multi_splits_numbered_list_in_one_line(self):
        result = ai.rule_parse_multi("오늘해야할일 1.AAA 2. BBB 3. CCC")
        self.assertEqual(len(result), 3)
        self.assertTrue(all(item["entity"] == "todo" for item in result))
        self.assertEqual([item["data"]["title"] for item in result], ["AAA", "BBB", "CCC"])
        self.assertTrue(all(item["data"]["todo_date"] == date.today().isoformat() for item in result))

    def test_rule_parse_multi_numbered_list_matches_existing_tags(self):
        context = [{"title": "결제 시스템 개선", "tags": ["결제", "백엔드"]}]
        result = ai.rule_parse_multi("오늘해야할일 1.결제 점검 2. 기타 업무", context)
        self.assertEqual(result[0]["data"]["tags"], ["결제", "백엔드"])
        self.assertEqual(result[1]["data"]["tags"], [])

    def test_rule_parse_multi_single_numbered_item_is_not_split(self):
        result = ai.rule_parse_multi("1. 보고서 작성")
        self.assertEqual(len(result), 1)

    def test_parse_text_without_api_key_returns_items_list(self):
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, {"DATABASE_PATH": os.path.join(folder, "test.db")}):
            from app.db import init_db
            init_db()
            result = asyncio.run(ai.parse_text("내일 오후 3시 고객 회의\n오늘 한 일: 배포 완료", user_id="__legacy__"))
        self.assertEqual(len(result["items"]), 2)
        self.assertEqual(result["items"][0]["entity"], "event")
        self.assertEqual(result["items"][1]["entity"], "work_log")

    def test_progress_update_is_clamped(self):
        result = ai.rule_parse("업무 #42 진행률 130%")
        self.assertEqual(result["action"], "update")
        self.assertEqual(result["id"], 42)
        self.assertEqual(result["data"]["progress"], 100)
        self.assertEqual(result["data"]["status"], "done")

    def test_invalid_calendar_date_does_not_crash(self):
        result = ai.rule_parse("2월 31일 보고서 제출")
        self.assertEqual(result["entity"], "task")
        self.assertEqual(result["data"]["due_date"], date.today().isoformat())

    def test_work_log_detection(self):
        result = ai.rule_parse("오늘 한 일: 운영 서버 점검")
        self.assertEqual(result["entity"], "work_log")
        self.assertTrue(result["data"]["content"])

    def test_explicit_month_day_before_today_rolls_to_next_year(self):
        result = ai.rule_parse("1월 5일 신년 계획 보고서 제출")
        self.assertEqual(result["entity"], "task")
        due = date.fromisoformat(result["data"]["due_date"])
        self.assertGreaterEqual(due, date.today())
        self.assertEqual((due.month, due.day), (1, 5))

    def test_event_extracts_color_and_link(self):
        result = ai.rule_parse("내일 오후 3시 고객 회의 빨간색으로 표시, 링크는 https://zoom.us/j/123")
        self.assertEqual(result["entity"], "event")
        self.assertEqual(result["data"]["color"], "red")
        self.assertEqual(result["data"]["link_url"], "https://zoom.us/j/123")
        self.assertNotIn("https://", result["data"]["title"])
        self.assertNotIn("빨간색", result["data"]["title"])

    def test_todo_extracts_time_priority_and_color(self):
        result = ai.rule_parse("오늘 오후 5시 긴급 보고서 초록색 해야함")
        self.assertEqual(result["entity"], "todo")
        self.assertEqual(result["data"]["todo_time"], "17:00")
        self.assertEqual(result["data"]["priority"], "high")
        self.assertEqual(result["data"]["color"], "green")

    def test_task_without_color_or_link_omits_those_keys(self):
        result = ai.rule_parse("분기 보고서 작성")
        self.assertNotIn("color", result["data"])
        self.assertNotIn("link_url", result["data"])

    def test_work_log_extracts_link(self):
        result = ai.rule_parse("오늘 한 일: 배포 완료 https://github.com/org/repo/pull/1")
        self.assertEqual(result["entity"], "work_log")
        self.assertEqual(result["data"]["link_url"], "https://github.com/org/repo/pull/1")


class ValidationAndStatusTests(unittest.TestCase):
    def test_rejects_unknown_entity(self):
        with self.assertRaises(ValueError):
            ai._normalize({"action": "create", "entity": "mail", "data": {}})

    def test_update_requires_integer_id(self):
        with self.assertRaises(ValueError):
            ai._normalize({"action": "update", "entity": "task", "id": "1", "data": {}})

    def test_status_does_not_expose_api_key(self):
        with patch.dict(os.environ, {"AI_API_KEY": "super-secret", "AI_MODEL": "test-model"}):
            with patch('app.ai._load_setting', return_value=None):
                result = ai.status("test_user")
        self.assertTrue(result["configured"])
        self.assertEqual(result["model"], "test-model")
        self.assertNotIn("super-secret", repr(result))

    def test_test_connection_without_api_key_reports_not_configured(self):
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, {"DATABASE_PATH": os.path.join(folder, "test.db"), "AI_API_KEY": ""}):
            from app.db import init_db
            init_db()
            result = asyncio.run(ai.test_connection("__legacy__"))
        self.assertFalse(result["ok"])
        self.assertIn("API 키", result["message"])

    def test_test_connection_reports_success_on_valid_response(self):
        class FakeResponse:
            def raise_for_status(self): pass
            def json(self): return {"choices": [{"message": {"content": '{"ok": true}'}}]}
        class FakeClient:
            async def __aenter__(self): return self
            async def __aexit__(self, *a): return False
            async def post(self, *a, **k): return FakeResponse()
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, {"DATABASE_PATH": os.path.join(folder, "test.db"), "AI_API_KEY": "test-key", "AI_MODEL": "gpt-4o-mini"}):
            from app.db import init_db
            init_db()
            with patch('app.ai.httpx.AsyncClient', return_value=FakeClient()):
                result = asyncio.run(ai.test_connection("__legacy__"))
        self.assertTrue(result["ok"])

    def test_recommendations_prioritize_due_date(self):
        tasks = [
            {"id": 1, "title": "later", "status": "todo", "progress": 0, "priority": "high", "due_date": "2999-01-01"},
            {"id": 2, "title": "overdue", "status": "doing", "progress": 50, "priority": "normal", "due_date": "2000-01-01"},
        ]
        result = ai.recommendations(tasks, [], 1)
        self.assertEqual(result[0]["task_id"], 2)
        self.assertEqual(result[0]["reason"], "완료일이 지났습니다")

    def test_period_summary_includes_real_activity(self):
        report = {"summary": {"completed_tasks": 1, "work_logs": 1, "events": 0, "active_tasks": 0},
                  "timeline": [{"type": "work_log", "type_label": "업무 기록", "id": 5, "date": "2026-07-08", "content": "신규 결제 API 배포"}]}
        result = ai.period_summary(report)
        self.assertIn("신규 결제 API 배포", result["narrative"])
        self.assertEqual(result["highlights"], [{"type": "work_log", "type_label": "업무 기록", "id": 5, "date": "2026-07-08", "title": "신규 결제 API 배포"}])

    def test_project_suggestion_uses_shared_tags_without_task_link(self):
        tasks = [{"id": 7, "title": "결제 개선", "status": "doing", "progress": 20, "tags": ["결제"]}]
        logs = [{"task_id": None, "content": "PG 연동 완료", "log_date": date.today().isoformat(), "tags": ["결제"]}]
        result = ai.project_progress_suggestions(tasks, logs, 5)
        self.assertEqual(result[0]["id"], 7)
        self.assertEqual(result[0]["data"]["progress"], 30)


if __name__ == "__main__":
    unittest.main()
