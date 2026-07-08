import os
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient


class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        os.environ.update({"DATABASE_PATH": os.path.join(cls.temp.name, "test.db"),
                           "APP_SECRET": "test-secret-that-is-long-and-stable", "COOKIE_SECURE": "false",
                           "CODEX_ADMIN_TOKEN": "test-codex-admin-token"})
        from app.main import app
        from app.auth import create_session
        from app.db import connection, init_db
        init_db()
        with connection() as c:
            for uid, email in (("sub-a", "a@example.com"), ("sub-b", "b@example.com")):
                c.execute("INSERT INTO users(id,google_sub,email,display_name,created_at,updated_at) VALUES(?,?,?,?,?,?)",
                          (uid, uid, email, email, "2026-01-01", "2026-01-01"))
        cls.app = app
        cls.token_a, cls.token_b = create_session("sub-a"), create_session("sub-b")

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def client(self, token):
        client = TestClient(self.app)
        client.cookies.set("wm_session", token)
        return client

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_crud_is_strictly_isolated(self, *_):
        a, b = self.client(self.token_a), self.client(self.token_b)
        created = a.post("/api/tasks", json={"title": "A private task", "status": "todo", "progress": 0})
        self.assertEqual(created.status_code, 200, created.text)
        item_id = created.json()["id"]
        self.assertEqual(b.get("/api/tasks").json(), [])
        self.assertEqual(b.get(f"/api/tasks/{item_id}").status_code, 404)
        self.assertEqual(b.patch(f"/api/tasks/{item_id}", json={"title": "stolen"}).status_code, 404)
        self.assertEqual(b.delete(f"/api/tasks/{item_id}").status_code, 404)
        self.assertEqual(a.get(f"/api/tasks/{item_id}").json()["title"], "A private task")

    def test_local_password_login_is_removed(self):
        response = TestClient(self.app).post("/api/auth/login", json={"user_id": "admin", "password": "password"})
        self.assertEqual(response.status_code, 404)

    def test_validation_rejects_bad_domain_values(self):
        a = self.client(self.token_a)
        self.assertEqual(a.post("/api/tasks", json={"title": "x", "status": "invalid"}).status_code, 422)
        self.assertEqual(a.post("/api/events", json={"title": "x", "start_at": "2026-07-06T12:00:00", "end_at": "2026-07-06T11:00:00"}).status_code, 422)
        self.assertEqual(a.post("/api/todos", json={"title": "x", "unexpected": True}).status_code, 422)
        self.assertEqual(a.post("/api/tasks", json={"title": "   "}).status_code, 422)
        self.assertEqual(a.post("/api/work_logs", json={"content": "\t "}).status_code, 422)

    def test_logout_revokes_server_session(self):
        from app.auth import create_session
        token = create_session("sub-a")
        client = self.client(token)
        self.assertEqual(client.get("/api/auth/me").status_code, 200)
        self.assertEqual(client.post("/api/auth/logout").status_code, 200)
        other = self.client(token)
        self.assertEqual(other.get("/api/auth/me").status_code, 401)

    def test_allowlist_removal_revokes_existing_session(self):
        from app.auth import create_session
        token = create_session("sub-a")
        with patch.dict(os.environ, {"GOOGLE_ALLOWED_EMAIL": "b@example.com"}):
            self.assertEqual(self.client(token).get("/api/auth/me").status_code, 403)
        self.assertEqual(self.client(token).get("/api/auth/me").status_code, 401)

    def test_expired_session_is_deleted_persistently(self):
        import hashlib
        from app.auth import create_session
        from app.db import connection
        token = create_session("sub-a")
        with connection() as c:
            c.execute("UPDATE sessions SET expires_at=0 WHERE token_hash=?",
                      (hashlib.sha256(token.encode()).hexdigest(),))
        self.assertEqual(self.client(token).get("/api/auth/me").status_code, 401)
        with connection() as c:
            self.assertIsNone(c.execute("SELECT 1 FROM sessions WHERE token_hash=?",
                                        (hashlib.sha256(token.encode()).hexdigest(),)).fetchone())

    def test_readiness_checks_database(self):
        self.assertEqual(TestClient(self.app).get("/api/ready").json()["database"], "ready")

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_soft_delete_trash_restore_is_isolated(self, *_):
        a, b = self.client(self.token_a), self.client(self.token_b)
        item = a.post("/api/todos", json={"title": "recover me", "todo_date": "2026-07-06"}).json()
        self.assertEqual(a.delete(f"/api/todos/{item['id']}").status_code, 200)
        self.assertNotIn(item["id"], [x["id"] for x in a.get("/api/todos").json()])
        self.assertIn(item["id"], [x["id"] for x in a.get("/api/trash").json()["todos"]])
        self.assertEqual(b.post(f"/api/todos/{item['id']}/restore").status_code, 404)
        restored = a.post(f"/api/todos/{item['id']}/restore")
        self.assertEqual(restored.status_code, 200, restored.text)
        self.assertEqual(restored.json()["title"], "recover me")

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_recurring_task_completion_spawns_once(self, *_):
        a = self.client(self.token_a)
        task = a.post("/api/tasks", json={"title": "weekly review", "assignee_name": "Dana", "start_date": "2026-07-06",
                                           "due_date": "2026-07-06", "recurrence_rule": "weekly"}).json()
        first = a.patch(f"/api/tasks/{task['id']}", json={"status": "done", "progress": 100}).json()
        self.assertIn("next_recurrence_id", first)
        second = a.patch(f"/api/tasks/{task['id']}", json={"status": "done"}).json()
        self.assertNotIn("next_recurrence_id", second)
        children = [x for x in a.get("/api/tasks").json() if x.get("parent_id") == task["id"]]
        self.assertEqual(len(children), 1)
        self.assertEqual(children[0]["due_date"], "2026-07-13")

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_task_links_cannot_cross_users(self, *_):
        a, b = self.client(self.token_a), self.client(self.token_b)
        private = a.post("/api/tasks", json={"title": "private dependency"}).json()
        self.assertEqual(b.post("/api/tasks", json={"title": "bad link", "dependency_ids": [private["id"]]}).status_code, 422)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_task_assignee_is_persisted_and_trimmed(self, *_):
        a = self.client(self.token_a)
        created = a.post("/api/tasks", json={"title": "handoff", "assignee_name": "  Dana  "})
        self.assertEqual(created.status_code, 200, created.text)
        self.assertEqual(created.json()["assignee_name"], "Dana")
        updated = a.patch(f"/api/tasks/{created.json()['id']}", json={"assignee_name": " Lee "})
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(a.get(f"/api/tasks/{created.json()['id']}").json()["assignee_name"], "Lee")

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_unassigned_task_cannot_become_active_via_patch_without_owner(self, *_):
        a = self.client(self.token_a)
        created = a.post("/api/tasks", json={"title": "owner needed"})
        self.assertEqual(created.status_code, 200, created.text)

        updated = a.patch(f"/api/tasks/{created.json()['id']}", json={"progress": 40})

        self.assertEqual(updated.status_code, 422, updated.text)
        self.assertIn("require an assignee", updated.text)

        fresh = a.get(f"/api/tasks/{created.json()['id']}").json()
        self.assertEqual(fresh["status"], "todo")
        self.assertEqual(fresh["progress"], 0)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_legacy_task_values_do_not_break_edit_save(self, *_):
        from app.db import connection
        with connection() as c:
            cur = c.execute("""INSERT INTO tasks(user_id,title,description,status,priority,progress,start_date,due_date,
                assignee_name,tags,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
                ("sub-a", "legacy edit", "", "in_progress", "medium", 40, "2026-07-07", "2026-07-09",
                 "", "[]", "2026-07-07T17:15:59", "2026-07-07T17:15:59"))
            task_id = cur.lastrowid
        payload = {
            "title": "legacy edit saved",
            "description": "",
            "assignee_name": "",
            "start_date": "2026-07-07",
            "due_date": "2026-07-09",
            "status": "in_progress",
            "priority": "medium",
            "progress": 40,
            "recurrence_rule": None,
            "tags": [],
        }
        updated = self.client(self.token_a).patch(f"/api/tasks/{task_id}", json=payload)
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["title"], "legacy edit saved")
        self.assertEqual(updated.json()["status"], "doing")
        self.assertEqual(updated.json()["priority"], "normal")

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_blank_legacy_task_dates_do_not_break_edit_save(self, *_):
        from app.db import connection
        with connection() as c:
            cur = c.execute("""INSERT INTO tasks(user_id,title,description,status,priority,progress,start_date,due_date,
                assignee_name,tags,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
                ("sub-a", "legacy blank dates", "", "doing", "normal", 25, "", "",
                 "Dana", "[]", "2026-07-08T10:22:56", "2026-07-08T10:22:56"))
            task_id = cur.lastrowid

        updated = self.client(self.token_a).patch(f"/api/tasks/{task_id}", json={"title": "legacy blank dates saved"})

        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["title"], "legacy blank dates saved")
        self.assertIsNone(updated.json()["start_date"])
        self.assertIsNone(updated.json()["due_date"])

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_audit_logs_are_user_scoped_and_include_metadata(self, *_):
        a, b = self.client(self.token_a), self.client(self.token_b)
        task = a.post("/api/tasks", json={"title": "audited task", "assignee_name": "Ava"}).json()
        updated = a.patch(f"/api/tasks/{task['id']}", json={"progress": 40})
        self.assertEqual(updated.status_code, 200, updated.text)
        logs = a.get("/api/audit-logs?limit=10")
        self.assertEqual(logs.status_code, 200, logs.text)
        self.assertTrue(any(x["action"] == "update" and x["entity_type"] == "tasks" and "progress" in x["metadata"].get("fields", []) for x in logs.json()["items"]))
        self.assertEqual(b.get("/api/audit-logs?limit=10").json()["items"], [])

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_feature_requests_are_user_scoped_and_status_managed(self, *_):
        a, b = self.client(self.token_a), self.client(self.token_b)
        created = a.post("/api/feature-requests", json={"content": "  칸반 보드가 필요합니다.  ", "source": "customer"})
        self.assertEqual(created.status_code, 200, created.text)
        self.assertEqual(created.json()["content"], "칸반 보드가 필요합니다.")
        self.assertEqual(created.json()["status"], "pending")
        self.assertEqual(b.get("/api/feature-requests").json()["items"], [])
        self.assertEqual(b.patch(f"/api/feature-requests/{created.json()['id']}", json={"status": "done"}).status_code, 404)
        updated = a.patch(f"/api/feature-requests/{created.json()['id']}", json={"status": "in_progress"})
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["status"], "in_progress")
        pending = a.get("/api/feature-requests?status=pending")
        self.assertEqual(pending.status_code, 200, pending.text)
        self.assertEqual(pending.json()["items"], [])

    def test_public_improvement_queue_and_codex_completion_changelog(self):
        a, b = self.client(self.token_a), self.client(self.token_b)
        first = a.post("/api/feature-requests", json={"content": "계층형 보드를 개선해 주세요"}).json()
        second = b.post("/api/feature-requests", json={"content": "모바일 보기를 개선해 주세요"}).json()
        anonymous = TestClient(self.app)

        public = anonymous.get("/api/public/changelog")
        self.assertEqual(public.status_code, 200, public.text)
        visible_ids = {item["id"] for item in public.json()["requests"]}
        self.assertTrue({first["id"], second["id"]}.issubset(visible_ids))
        self.assertNotIn("user_id", next(item for item in public.json()["requests"] if item["id"] == first["id"]))

        denied = anonymous.patch(f"/api/admin/feature-requests/{first['id']}", json={"status": "in_progress"})
        self.assertEqual(denied.status_code, 403)
        headers = {"Authorization": "Bearer test-codex-admin-token"}
        started = anonymous.patch(f"/api/admin/feature-requests/{first['id']}", headers=headers,
                                  json={"status": "in_progress"})
        self.assertEqual(started.status_code, 200, started.text)
        self.assertEqual(started.json()["status"], "in_progress")

        missing_note = anonymous.patch(f"/api/admin/feature-requests/{first['id']}", headers=headers,
                                       json={"status": "done"})
        self.assertEqual(missing_note.status_code, 422)
        completed = anonymous.patch(f"/api/admin/feature-requests/{first['id']}", headers=headers,
                                    json={"status": "done", "description": "계층 이동과 표시를 개선했습니다."})
        self.assertEqual(completed.status_code, 200, completed.text)

        after = anonymous.get("/api/public/changelog").json()
        self.assertNotIn(first["id"], {item["id"] for item in after["requests"]})
        self.assertIn(second["id"], {item["id"] for item in after["requests"]})
        entry = next(item for item in after["entries"] if item["feature_request_id"] == first["id"])
        self.assertEqual(entry["request_content"], "계층형 보드를 개선해 주세요")

    def test_ai_settings_are_user_specific_and_support_gemini(self):
        a, b = self.client(self.token_a), self.client(self.token_b)
        saved = a.put("/api/settings/ai", json={
            "provider": "gemini",
            "api_key": "gemini-secret",
            "model": "gemini-2.5-flash",
        })
        self.assertEqual(saved.status_code, 200, saved.text)
        body = saved.json()
        self.assertEqual(body["provider"], "gemini")
        self.assertEqual(body["provider_name"], "Gemini")
        self.assertTrue(body["api_key_set"])
        self.assertNotIn("gemini-secret", saved.text)

        status = a.get("/api/settings/ai?provider=gemini")
        self.assertEqual(status.status_code, 200, status.text)
        self.assertEqual(status.json()["provider"], "gemini")
        self.assertTrue(status.json()["configured"])
        self.assertTrue(status.json()["saved_api_key"])

        updated = a.put("/api/settings/ai", json={
            "provider": "gemini",
            "model": "gemini-3.5-flash",
            "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
        })
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertTrue(updated.json()["api_key_set"])
        self.assertEqual(updated.json()["model"], "gemini-3.5-flash")

        switched = a.put("/api/settings/ai", json={
            "provider": "openai",
            "api_key": "openai-secret",
            "model": "gpt-5-mini",
        })
        self.assertEqual(switched.status_code, 200, switched.text)
        self.assertEqual(switched.json()["provider"], "openai")

        gemini = a.get("/api/settings/ai?provider=gemini")
        self.assertEqual(gemini.status_code, 200, gemini.text)
        self.assertEqual(gemini.json()["provider"], "gemini")
        self.assertTrue(gemini.json()["api_key_set"])

        other = b.get("/api/settings/ai")
        self.assertEqual(other.status_code, 200, other.text)
        self.assertNotEqual(other.json()["provider"], "gemini")

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_common_tags_filter_and_achievement_report(self, *_):
        a = self.client(self.token_a)
        todo = a.post("/api/todos", json={"title": "tagged", "completed": True, "todo_date": "2026-07-06", "tags": [" Project-X ", "project-x"]})
        self.assertEqual(todo.status_code, 200, todo.text)
        self.assertEqual(todo.json()["tags"], ["Project-X"])
        a.post("/api/work_logs", json={"content": "shipped", "log_date": "2026-07-06", "tags": ["Project-X"]})
        self.assertTrue(any(x["id"] == todo.json()["id"] for x in a.get("/api/todos?tags=project-x").json()))
        report = a.get("/api/achievements?start_date=2026-07-01&end_date=2026-07-31&tags=Project-X")
        self.assertEqual(report.status_code, 200, report.text)
        self.assertGreaterEqual(report.json()["summary"]["completed_todos"], 1)
        self.assertGreaterEqual(report.json()["summary"]["work_logs"], 1)
        self.assertIn("Project-X", report.json()["tags"])
        self.assertTrue(any(x["type"] == "work_log" and x["content"] == "shipped" for x in report.json()["timeline"]))

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_dependency_cycle_is_rejected(self, *_):
        a = self.client(self.token_a)
        first = a.post("/api/tasks", json={"title": "first"}).json()
        second = a.post("/api/tasks", json={"title": "second", "dependency_ids": [first["id"]]}).json()
        self.assertEqual(a.patch(f"/api/tasks/{first['id']}", json={"dependency_ids": [second["id"]]}).status_code, 422)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_parent_hierarchy_cycle_is_rejected(self, *_):
        a = self.client(self.token_a)
        parent = a.post("/api/tasks", json={"title": "parent"}).json()
        child = a.post("/api/tasks", json={"title": "child", "parent_id": parent["id"]}).json()
        response = a.patch(f"/api/tasks/{parent['id']}", json={"parent_id": child["id"]})
        self.assertEqual(response.status_code, 422, response.text)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_month_end_recurrence_returns_to_month_end(self, *_):
        a = self.client(self.token_a)
        task = a.post("/api/tasks", json={"title": "month end", "assignee_name": "Dana", "start_date": "2027-01-31", "due_date": "2027-01-31", "recurrence_rule": "monthly"}).json()
        feb = a.patch(f"/api/tasks/{task['id']}", json={"status": "done"}).json()
        feb_task = a.get(f"/api/tasks/{feb['next_recurrence_id']}").json()
        self.assertEqual(feb_task["due_date"], "2027-02-28")
        mar = a.patch(f"/api/tasks/{feb_task['id']}", json={"status": "done"}).json()
        self.assertEqual(a.get(f"/api/tasks/{mar['next_recurrence_id']}").json()["due_date"], "2027-03-31")


if __name__ == "__main__":
    unittest.main()
