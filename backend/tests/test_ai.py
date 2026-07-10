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
