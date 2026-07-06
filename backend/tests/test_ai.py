import os
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


class ValidationAndStatusTests(unittest.TestCase):
    def test_rejects_unknown_entity(self):
        with self.assertRaises(ValueError):
            ai._normalize({"action": "create", "entity": "mail", "data": {}})

    def test_update_requires_integer_id(self):
        with self.assertRaises(ValueError):
            ai._normalize({"action": "update", "entity": "task", "id": "1", "data": {}})

    def test_status_does_not_expose_api_key(self):
        with patch.dict(os.environ, {"AI_API_KEY": "super-secret", "AI_MODEL": "test-model"}):
            result = ai.status()
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


if __name__ == "__main__":
    unittest.main()
