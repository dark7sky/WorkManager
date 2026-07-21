import asyncio
import os
import tempfile
import unittest
from datetime import date, timedelta
from unittest.mock import patch

import httpx

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

    def test_rule_parse_extracts_task_checklist_from_numbered_steps(self):
        result = ai.rule_parse("보고서 작성 단계: 1. 초안 작성 2. 검토 요청 3. 최종 제출")
        self.assertEqual(result["entity"], "task")
        self.assertEqual(result["data"]["title"], "보고서 작성")
        self.assertEqual(result["data"]["checklist"], [
            {"text": "초안 작성", "done": False},
            {"text": "검토 요청", "done": False},
            {"text": "최종 제출", "done": False},
        ])

    def test_rule_parse_multi_keeps_checklist_text_as_one_task(self):
        result = ai.rule_parse_multi("보고서 작성 단계: 1. 초안 작성 2. 검토 요청")
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["entity"], "task")
        self.assertEqual(len(result[0]["data"]["checklist"]), 2)

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

    def test_event_extracts_priority(self):
        result = ai.rule_parse("내일 오후 3시 긴급 고객 회의")
        self.assertEqual(result["entity"], "event")
        self.assertEqual(result["data"]["priority"], "high")

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

    def test_task_extracts_priority_for_important_keyword(self):
        result = ai.rule_parse("중요 분기 보고서 작성")
        self.assertEqual(result["entity"], "task")
        self.assertEqual(result["data"]["priority"], "high")

    def test_work_log_extracts_link(self):
        result = ai.rule_parse("오늘 한 일: 배포 완료 https://github.com/org/repo/pull/1")
        self.assertEqual(result["entity"], "work_log")
        self.assertEqual(result["data"]["link_url"], "https://github.com/org/repo/pull/1")

    def test_task_extracts_estimated_minutes_from_hours_and_minutes(self):
        result = ai.rule_parse("보고서 작성 예상 2시간 30분")
        self.assertEqual(result["entity"], "task")
        self.assertEqual(result["data"]["estimated_minutes"], 150)

    def test_task_extracts_estimated_minutes_from_minutes_only(self):
        result = ai.rule_parse("보고서 작성 예상 30분")
        self.assertEqual(result["data"]["estimated_minutes"], 30)

    def test_task_without_estimate_omits_estimated_minutes(self):
        result = ai.rule_parse("분기 보고서 작성")
        self.assertNotIn("estimated_minutes", result["data"])

    def test_event_extracts_estimated_minutes(self):
        result = ai.rule_parse("내일 오후 3시 고객 회의 예상 1시간 30분")
        self.assertEqual(result["entity"], "event")
        self.assertEqual(result["data"]["estimated_minutes"], 90)

    def test_todo_extracts_estimated_minutes(self):
        result = ai.rule_parse("오늘 보고서 검토 예상 30분 해야함")
        self.assertEqual(result["entity"], "todo")
        self.assertEqual(result["data"]["estimated_minutes"], 30)

    def test_event_extracts_checklist_from_numbered_steps(self):
        result = ai.rule_parse("회의 단계 1. 자료 취합 2. 슬라이드 작성")
        self.assertEqual(result["entity"], "event")
        self.assertEqual(result["data"]["checklist"], [
            {"text": "자료 취합", "done": False},
            {"text": "슬라이드 작성", "done": False},
        ])

    def test_todo_extracts_checklist_from_numbered_steps(self):
        result = ai.rule_parse("보고서 제출 해야함 단계 1. 초안 작성 2. 최종 검토")
        self.assertEqual(result["entity"], "todo")
        self.assertEqual(result["data"]["checklist"], [
            {"text": "초안 작성", "done": False},
            {"text": "최종 검토", "done": False},
        ])

    def test_work_log_extracts_duration_minutes(self):
        result = ai.rule_parse("오늘 한 일: 미팅 준비 30분 했음")
        self.assertEqual(result["entity"], "work_log")
        self.assertEqual(result["data"]["duration_minutes"], 30)

    def test_work_log_extracts_duration_hours_and_minutes(self):
        result = ai.rule_parse("오늘 한 일: 배포 작업 2시간 소요")
        self.assertEqual(result["data"]["duration_minutes"], 120)

    def test_work_log_extracts_billable_flag(self):
        result = ai.rule_parse("오늘 한 일: 고객 미팅 1시간 했음 청구 대상")
        self.assertEqual(result["data"]["duration_minutes"], 60)
        self.assertTrue(result["data"]["billable"])

    def test_work_log_without_duration_omits_duration_minutes(self):
        result = ai.rule_parse("오늘 한 일: 배포 완료")
        self.assertNotIn("duration_minutes", result["data"])

    def test_task_with_multiple_urls_sets_links_array(self):
        result = ai.rule_parse("분기 보고서 작성 https://docs.example.com/a https://sheet.example.com/b")
        self.assertEqual(result["data"]["link_url"], "https://docs.example.com/a")
        self.assertEqual(result["data"]["links"], [
            {"url": "https://docs.example.com/a", "label": ""},
            {"url": "https://sheet.example.com/b", "label": ""},
        ])

    def test_task_with_single_url_omits_links_array(self):
        result = ai.rule_parse("분기 보고서 작성 https://docs.example.com/a")
        self.assertEqual(result["data"]["link_url"], "https://docs.example.com/a")
        self.assertNotIn("links", result["data"])

    def test_recurring_event_sets_recurrence_rule_and_end_date(self):
        next_year = date.today().year + (date.today().month >= 8)
        result = ai.rule_parse("매주 정기 회의 8월 30일까지")
        self.assertEqual(result["entity"], "event")
        self.assertEqual(result["data"]["recurrence_rule"], "weekly")
        self.assertEqual(result["data"]["recurrence_end_date"], date(next_year, 8, 30).isoformat())
        self.assertNotIn("매주", result["data"]["title"])
        self.assertNotIn("까지", result["data"]["title"])

    def test_biweekly_recurring_event_sets_recurrence_rule(self):
        next_year = date.today().year + (date.today().month >= 8)
        result = ai.rule_parse("격주 정기 회의 8월 30일까지")
        self.assertEqual(result["data"]["recurrence_rule"], "biweekly")
        self.assertEqual(result["data"]["recurrence_end_date"], date(next_year, 8, 30).isoformat())

    def test_event_without_recurrence_keyword_omits_recurrence_fields(self):
        result = ai.rule_parse("내일 오후 3시 고객 회의")
        self.assertNotIn("recurrence_rule", result["data"])
        self.assertNotIn("recurrence_end_date", result["data"])

    def test_recurring_event_without_end_date_omits_recurrence_fields(self):
        result = ai.rule_parse("매일 아침 스탠드업 회의")
        self.assertNotIn("recurrence_rule", result["data"])
        self.assertNotIn("recurrence_end_date", result["data"])


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

    def test_test_connection_reports_rate_limit_message_on_429(self):
        class FakeResponse:
            status_code = 429
            def raise_for_status(self):
                raise httpx.HTTPStatusError("rate limited", request=None, response=self)
        class FakeClient:
            async def __aenter__(self): return self
            async def __aexit__(self, *a): return False
            async def post(self, *a, **k): return FakeResponse()
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, {"DATABASE_PATH": os.path.join(folder, "test.db"), "AI_API_KEY": "test-key", "AI_MODEL": "gpt-4o-mini"}):
            from app.db import init_db
            init_db()
            with patch('app.ai.httpx.AsyncClient', return_value=FakeClient()):
                result = asyncio.run(ai.test_connection("__legacy__"))
        self.assertFalse(result["ok"])
        self.assertIn("잠시 후 다시 시도", result["message"])

    def test_test_connection_reports_model_message_on_404(self):
        class FakeResponse:
            status_code = 404
            def raise_for_status(self):
                raise httpx.HTTPStatusError("not found", request=None, response=self)
        class FakeClient:
            async def __aenter__(self): return self
            async def __aexit__(self, *a): return False
            async def post(self, *a, **k): return FakeResponse()
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, {"DATABASE_PATH": os.path.join(folder, "test.db"), "AI_API_KEY": "test-key", "AI_MODEL": "bad-model"}):
            from app.db import init_db
            init_db()
            with patch('app.ai.httpx.AsyncClient', return_value=FakeClient()):
                result = asyncio.run(ai.test_connection("__legacy__"))
        self.assertFalse(result["ok"])
        self.assertIn("모델 이름을 확인", result["message"])

    def test_recommendations_prioritize_due_date(self):
        tasks = [
            {"id": 1, "title": "later", "status": "todo", "progress": 0, "priority": "high", "due_date": "2999-01-01"},
            {"id": 2, "title": "overdue", "status": "doing", "progress": 50, "priority": "normal", "due_date": "2000-01-01"},
        ]
        result = ai.recommendations(tasks, [], [], [], 1)
        self.assertEqual(result[0]["task_id"], 2)
        self.assertEqual(result[0]["reason"], "완료일이 지났습니다")

    def test_recommendations_include_active_todos_sorted_with_tasks(self):
        tasks = [{"id": 1, "title": "task later", "status": "todo", "progress": 0, "priority": "normal", "due_date": "2999-01-01"}]
        todos = [
            {"id": 5, "title": "overdue todo", "completed": 0, "priority": "normal", "todo_date": "2000-01-01"},
            {"id": 6, "title": "done todo", "completed": 1, "priority": "high", "todo_date": "2000-01-01"},
        ]
        result = ai.recommendations(tasks, todos, [], [], 5)
        self.assertEqual(result[0]["entity"], "todo")
        self.assertEqual(result[0]["todo_id"], 5)
        self.assertEqual(result[0]["reason"], "예정일이 지났습니다")
        self.assertTrue(all(item["todo_id"] != 6 for item in result if item["entity"] == "todo"))
        self.assertEqual(result[1]["entity"], "task")
        self.assertEqual(result[1]["task_id"], 1)

    def test_recommendations_include_upcoming_events(self):
        events = [
            {"id": 9, "title": "today meeting", "priority": "normal", "start_at": f"{date.today().isoformat()}T10:00:00"},
            {"id": 10, "title": "past meeting", "priority": "normal", "start_at": "2000-01-01T10:00:00"},
        ]
        result = ai.recommendations([], [], [], events, 5)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["entity"], "event")
        self.assertEqual(result[0]["event_id"], 9)
        self.assertEqual(result[0]["reason"], "오늘 예정된 일정입니다")

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

    def test_project_suggestion_skips_due_date_before_start_date(self):
        tasks = [{"id": 8, "title": "장기 프로젝트", "status": "doing", "progress": 10,
                  "due_date": (date.today() - timedelta(days=1)).isoformat(),
                  "start_date": (date.today() + timedelta(days=30)).isoformat(), "tags": []}]
        result = ai.project_progress_suggestions(tasks, [], 5)
        self.assertEqual(result, [])

    def test_smart_project_suggestions_skips_remote_due_date_before_start_date(self):
        tasks = [{"id": 1, "title": "A", "status": "doing", "progress": 10,
                  "due_date": None, "start_date": (date.today() + timedelta(days=10)).isoformat(), "tags": []},
                 {"id": 2, "title": "B", "status": "doing", "progress": 20, "due_date": None, "start_date": None, "tags": []}]
        remote_result = {"items": [
            {"action": "update", "entity": "task", "id": 1,
             "data": {"due_date": date.today().isoformat()}, "confidence": 0.9, "reason": "지연 위험"},
            {"action": "update", "entity": "task", "id": 2,
             "data": {"progress": 40}, "confidence": 0.8, "reason": "최근 활동 근거"},
        ]}
        with patch.object(ai, "_remote_json", return_value=remote_result):
            output, source = asyncio.run(ai.smart_project_suggestions(tasks, [], 5, user_id="__legacy__"))
        self.assertEqual(source, "remote-ai")
        self.assertEqual([item["id"] for item in output], [2])

    def test_changelog_period_summary_joins_descriptions_and_counts_extras(self):
        entries = [{"description": f"업데이트 {i}"} for i in range(8)]
        result = ai.changelog_period_summary("2026-06", entries)
        self.assertEqual(result["period"], "2026-06")
        self.assertEqual(result["count"], 8)
        self.assertEqual(result["source"], "private-rules")
        self.assertIn("업데이트 0", result["summary"])
        self.assertIn("외 2건", result["summary"])

    def test_changelog_period_summary_handles_empty_entries(self):
        result = ai.changelog_period_summary("2026-06", [])
        self.assertEqual(result["summary"], "2026-06 업데이트 0건")

    def test_smart_changelog_summary_falls_back_to_local_rules_without_ai_key(self):
        entries = [{"description": "칸반 보드 추가"}]
        result = asyncio.run(ai.smart_changelog_summary("2026-06", entries, user_id="no-such-user"))
        self.assertEqual(result["source"], "private-rules")
        self.assertIn("칸반 보드 추가", result["summary"])


if __name__ == "__main__":
    unittest.main()
