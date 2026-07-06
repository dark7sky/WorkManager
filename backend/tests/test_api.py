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
                           "APP_SECRET": "test-secret-that-is-long-and-stable", "COOKIE_SECURE": "false"})
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
        task = a.post("/api/tasks", json={"title": "weekly review", "start_date": "2026-07-06",
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
        task = a.post("/api/tasks", json={"title": "month end", "start_date": "2027-01-31", "due_date": "2027-01-31", "recurrence_rule": "monthly"}).json()
        feb = a.patch(f"/api/tasks/{task['id']}", json={"status": "done"}).json()
        feb_task = a.get(f"/api/tasks/{feb['next_recurrence_id']}").json()
        self.assertEqual(feb_task["due_date"], "2027-02-28")
        mar = a.patch(f"/api/tasks/{feb_task['id']}", json={"status": "done"}).json()
        self.assertEqual(a.get(f"/api/tasks/{mar['next_recurrence_id']}").json()["due_date"], "2027-03-31")


if __name__ == "__main__":
    unittest.main()
