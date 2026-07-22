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

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_list_endpoint_supports_limit_and_offset(self, *_):
        a = self.client(self.token_a)
        titles = [f"paginated todo {i}" for i in range(5)]
        for title in titles:
            self.assertEqual(a.post("/api/todos", json={"title": title, "todo_date": "2026-08-01"}).status_code, 200)
        full = a.get("/api/todos").json()
        self.assertGreaterEqual(len(full), 5)
        page = a.get("/api/todos?limit=2&offset=1").json()
        self.assertEqual(len(page), 2)
        self.assertEqual(page, full[1:3])
        self.assertEqual(a.get("/api/todos?limit=0").status_code, 422)

    def test_local_password_login_is_removed(self):
        response = TestClient(self.app).post("/api/auth/login", json={"user_id": "admin", "password": "password"})
        self.assertEqual(response.status_code, 404)

    def test_demo_login_grants_read_only_session_with_seeded_data(self):
        from app.db import DEMO_USER_ID
        started = TestClient(self.app).post("/api/auth/demo")
        self.assertEqual(started.status_code, 200, started.text)
        token = started.cookies.get("wm_session")
        self.assertTrue(token)
        demo = self.client(token)
        me = demo.get("/api/auth/me")
        self.assertEqual(me.status_code, 200, me.text)
        self.assertEqual(me.json()["user"]["id"], DEMO_USER_ID)
        self.assertTrue(demo.get("/api/tasks").json())
        self.assertTrue(demo.get("/api/events").json())
        blocked = demo.post("/api/tasks", json={"title": "should be blocked"})
        self.assertEqual(blocked.status_code, 403, blocked.text)
        self.assertIn("읽기 전용", blocked.json()["detail"])
        existing_task_id = demo.get("/api/tasks").json()[0]["id"]
        self.assertEqual(demo.patch(f"/api/tasks/{existing_task_id}", json={"progress": 99}).status_code, 403)
        self.assertEqual(demo.delete(f"/api/tasks/{existing_task_id}").status_code, 403)
        self.assertEqual(demo.post("/api/auth/logout").status_code, 200)

    def test_demo_session_bypasses_google_allowlist(self):
        from app.auth import create_session
        from app.db import DEMO_USER_ID
        token = create_session(DEMO_USER_ID)
        with patch.dict(os.environ, {"GOOGLE_ALLOWED_EMAIL": "someone-else@example.com"}):
            self.assertEqual(self.client(token).get("/api/auth/me").status_code, 200)

    def test_google_callback_is_rate_limited(self):
        client = TestClient(self.app)
        for _ in range(20):
            response = client.get("/api/auth/google/callback", params={"code": "x", "state": "bad"}, follow_redirects=False)
            self.assertEqual(response.status_code, 400, response.text)
        limited = client.get("/api/auth/google/callback", params={"code": "x", "state": "bad"}, follow_redirects=False)
        self.assertEqual(limited.status_code, 429, limited.text)
        self.assertIn("Retry-After", limited.headers)

    def test_ai_recommendations_endpoint_is_rate_limited(self):
        from app.auth import create_session
        from app.db import connection
        with connection() as c:
            c.execute("INSERT OR IGNORE INTO users(id,google_sub,email,display_name,created_at,updated_at) VALUES(?,?,?,?,?,?)",
                       ("sub-rl", "sub-rl", "rl@example.com", "rl@example.com", "2026-01-01", "2026-01-01"))
        client = self.client(create_session("sub-rl"))
        for _ in range(20):
            self.assertEqual(client.get("/api/ai/recommendations").status_code, 200)
        limited = client.get("/api/ai/recommendations")
        self.assertEqual(limited.status_code, 429, limited.text)
        self.assertIn("Retry-After", limited.headers)

    def test_attachment_upload_is_rate_limited(self):
        from app.auth import create_session
        from app.db import connection
        with connection() as c:
            c.execute("INSERT OR IGNORE INTO users(id,google_sub,email,display_name,created_at,updated_at) VALUES(?,?,?,?,?,?)",
                       ("sub-rl-attach", "sub-rl-attach", "rl-attach@example.com", "rl-attach@example.com", "2026-01-01", "2026-01-01"))
        a = self.client(create_session("sub-rl-attach"))
        for _ in range(30):
            task = a.post("/api/tasks", json={"title": "rate limited attachments"}).json()
            ok = a.post(f"/api/tasks/{task['id']}/attachments", files={"file": ("a.txt", b"hi", "text/plain")})
            self.assertEqual(ok.status_code, 200, ok.text)
        task = a.post("/api/tasks", json={"title": "rate limited attachments"}).json()
        limited = a.post(f"/api/tasks/{task['id']}/attachments", files={"file": ("a.txt", b"hi", "text/plain")})
        self.assertEqual(limited.status_code, 429, limited.text)
        self.assertIn("Retry-After", limited.headers)

    def test_validation_rejects_bad_domain_values(self):
        a = self.client(self.token_a)
        self.assertEqual(a.post("/api/tasks", json={"title": "x", "status": "invalid"}).status_code, 422)
        self.assertEqual(a.post("/api/events", json={"title": "x", "start_at": "2026-07-06T12:00:00", "end_at": "2026-07-06T11:00:00"}).status_code, 422)
        self.assertEqual(a.post("/api/todos", json={"title": "x", "unexpected": True}).status_code, 422)
        self.assertEqual(a.post("/api/tasks", json={"title": "   "}).status_code, 422)
        self.assertEqual(a.post("/api/work_logs", json={"content": "\t "}).status_code, 422)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_empty_patch_body_is_rejected_for_every_table(self, *_):
        a = self.client(self.token_a)
        task = a.post("/api/tasks", json={"title": "empty patch task"}).json()
        event = a.post("/api/events", json={"title": "empty patch event", "start_at": "2026-07-06T12:00:00", "end_at": "2026-07-06T13:00:00"}).json()
        todo = a.post("/api/todos", json={"title": "empty patch todo"}).json()
        log = a.post("/api/work_logs", json={"content": "empty patch log"}).json()
        self.assertEqual(a.patch(f"/api/tasks/{task['id']}", json={}).status_code, 422)
        self.assertEqual(a.patch(f"/api/events/{event['id']}", json={}).status_code, 422)
        self.assertEqual(a.patch(f"/api/todos/{todo['id']}", json={}).status_code, 422)
        self.assertEqual(a.patch(f"/api/work_logs/{log['id']}", json={}).status_code, 422)

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

    def test_sessions_lists_and_revokes_other_sessions_only(self):
        from app.auth import create_session
        from app.db import connection
        with connection() as c:
            c.execute("INSERT INTO users(id,google_sub,email,display_name,created_at,updated_at) VALUES(?,?,?,?,?,?)",
                      ("sub-sessions", "sub-sessions", "sessions@example.com", "sessions@example.com", "2026-01-01", "2026-01-01"))
        token_1, token_2 = create_session("sub-sessions"), create_session("sub-sessions")
        client_1, client_2 = self.client(token_1), self.client(token_2)
        listing = client_1.get("/api/auth/sessions").json()["sessions"]
        self.assertEqual(len(listing), 2)
        current = next(s for s in listing if s["current"])
        other = next(s for s in listing if not s["current"])
        self.assertEqual(client_1.delete(f"/api/auth/sessions/{current['id']}").status_code, 400)
        self.assertEqual(client_1.delete(f"/api/auth/sessions/{other['id']}").status_code, 200)
        self.assertEqual(client_2.get("/api/auth/me").status_code, 401)
        self.assertEqual(client_1.get("/api/auth/me").status_code, 200)

    def test_sessions_include_parsed_device_label(self):
        from app.auth import create_session
        from app.db import connection
        with connection() as c:
            c.execute("INSERT INTO users(id,google_sub,email,display_name,created_at,updated_at) VALUES(?,?,?,?,?,?)",
                      ("sub-device", "sub-device", "device@example.com", "device@example.com", "2026-01-01", "2026-01-01"))
        token = create_session("sub-device", user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0 Safari/537.36")
        listing = self.client(token).get("/api/auth/sessions").json()["sessions"]
        self.assertEqual(listing[0]["device"], "Chrome · Windows")

    def test_session_without_user_agent_has_no_device_label(self):
        from app.auth import create_session
        from app.db import connection
        with connection() as c:
            c.execute("INSERT INTO users(id,google_sub,email,display_name,created_at,updated_at) VALUES(?,?,?,?,?,?)",
                      ("sub-no-device", "sub-no-device", "nodevice@example.com", "nodevice@example.com", "2026-01-01", "2026-01-01"))
        token = create_session("sub-no-device")
        listing = self.client(token).get("/api/auth/sessions").json()["sessions"]
        self.assertIsNone(listing[0]["device"])

    def test_revoke_other_sessions_keeps_current_only(self):
        from app.auth import create_session
        from app.db import connection
        with connection() as c:
            c.execute("INSERT INTO users(id,google_sub,email,display_name,created_at,updated_at) VALUES(?,?,?,?,?,?)",
                      ("sub-revoke-others", "sub-revoke-others", "revoke-others@example.com", "revoke-others@example.com", "2026-01-01", "2026-01-01"))
        token_1, token_2, token_3 = (create_session("sub-revoke-others") for _ in range(3))
        client_1, client_2, client_3 = self.client(token_1), self.client(token_2), self.client(token_3)
        res = client_1.post("/api/auth/sessions/revoke-others")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["count"], 2)
        self.assertEqual(client_1.get("/api/auth/me").status_code, 200)
        self.assertEqual(client_2.get("/api/auth/me").status_code, 401)
        self.assertEqual(client_3.get("/api/auth/me").status_code, 401)
        remaining = client_1.get("/api/auth/sessions").json()["sessions"]
        self.assertEqual(len(remaining), 1)
        self.assertTrue(remaining[0]["current"])

    def test_sessions_are_scoped_per_user(self):
        from app.auth import _hash
        b_session_id = self.client(self.token_b).get("/api/auth/sessions").json()["sessions"][0]["id"]
        self.assertEqual(b_session_id, _hash(self.token_b))
        self.assertEqual(self.client(self.token_a).delete(f"/api/auth/sessions/{b_session_id}").status_code, 404)
        self.assertEqual(self.client(self.token_b).get("/api/auth/me").status_code, 200)

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

    def test_responses_include_security_headers(self):
        response = TestClient(self.app).get("/api/ready")
        self.assertEqual(response.headers["X-Content-Type-Options"], "nosniff")
        self.assertEqual(response.headers["X-Frame-Options"], "DENY")
        self.assertEqual(response.headers["Referrer-Policy"], "strict-origin-when-cross-origin")
        self.assertIn("geolocation=()", response.headers["Permissions-Policy"])
        self.assertIn("default-src 'none'", response.headers["Content-Security-Policy"])

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
    def test_purge_trash_supports_custom_retention_days(self, *_):
        from datetime import datetime, timedelta
        from app.db import connection
        a = self.client(self.token_a)
        old_item = a.post("/api/todos", json={"title": "old", "todo_date": "2026-07-06"}).json()
        recent_item = a.post("/api/todos", json={"title": "recent", "todo_date": "2026-07-06"}).json()
        self.assertEqual(a.delete(f"/api/todos/{old_item['id']}").status_code, 200)
        self.assertEqual(a.delete(f"/api/todos/{recent_item['id']}").status_code, 200)
        ten_days_ago = (datetime.now() - timedelta(days=10)).isoformat(timespec="seconds")
        with connection() as c:
            c.execute("UPDATE todos SET deleted_at=? WHERE id=?", (ten_days_ago, old_item["id"]))
        result = a.delete("/api/trash?older_than_days=7")
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(result.json()["purged"]["todos"], 1)
        trash_ids = [x["id"] for x in a.get("/api/trash").json()["todos"]]
        self.assertNotIn(old_item["id"], trash_ids)
        self.assertIn(recent_item["id"], trash_ids)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_purge_single_trash_item_is_immediate_and_user_scoped(self, *_):
        a, b = self.client(self.token_a), self.client(self.token_b)
        item = a.post("/api/todos", json={"title": "purge me", "todo_date": "2026-07-06"}).json()
        self.assertEqual(a.delete(f"/api/todos/{item['id']}").status_code, 200)
        self.assertEqual(b.delete(f"/api/trash/todos/{item['id']}").status_code, 404)
        result = a.delete(f"/api/trash/todos/{item['id']}")
        self.assertEqual(result.status_code, 200, result.text)
        trash_ids = [x["id"] for x in a.get("/api/trash").json()["todos"]]
        self.assertNotIn(item["id"], trash_ids)
        self.assertEqual(a.delete(f"/api/trash/todos/{item['id']}").status_code, 404)

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
    def test_recurring_task_biweekly_spawns_fourteen_days_later(self, *_):
        a = self.client(self.token_a)
        task = a.post("/api/tasks", json={"title": "biweekly sync", "start_date": "2026-07-06",
                                           "due_date": "2026-07-06", "recurrence_rule": "biweekly"}).json()
        first = a.patch(f"/api/tasks/{task['id']}", json={"status": "done", "progress": 100}).json()
        self.assertIn("next_recurrence_id", first)
        children = [x for x in a.get("/api/tasks").json() if x.get("parent_id") == task["id"]]
        self.assertEqual(len(children), 1)
        self.assertEqual(children[0]["due_date"], "2026-07-20")

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_recurring_task_weekdays_skips_weekend(self, *_):
        a = self.client(self.token_a)
        task = a.post("/api/tasks", json={"title": "standup", "start_date": "2026-07-10",
                                           "due_date": "2026-07-10", "recurrence_rule": "weekdays"}).json()
        first = a.patch(f"/api/tasks/{task['id']}", json={"status": "done", "progress": 100}).json()
        self.assertIn("next_recurrence_id", first)
        children = [x for x in a.get("/api/tasks").json() if x.get("parent_id") == task["id"]]
        self.assertEqual(len(children), 1)
        self.assertEqual(children[0]["due_date"], "2026-07-13")

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_recurring_task_yearly_spawns_one_year_later(self, *_):
        a = self.client(self.token_a)
        task = a.post("/api/tasks", json={"title": "annual review", "start_date": "2026-07-06",
                                           "due_date": "2026-07-06", "recurrence_rule": "yearly"}).json()
        first = a.patch(f"/api/tasks/{task['id']}", json={"status": "done", "progress": 100}).json()
        self.assertIn("next_recurrence_id", first)
        children = [x for x in a.get("/api/tasks").json() if x.get("parent_id") == task["id"]]
        self.assertEqual(len(children), 1)
        self.assertEqual(children[0]["due_date"], "2027-07-06")

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_recurring_task_stops_spawning_past_recurrence_end_date(self, *_):
        a = self.client(self.token_a)
        task = a.post("/api/tasks", json={"title": "weekly review", "start_date": "2026-07-06",
                                           "due_date": "2026-07-06", "recurrence_rule": "weekly",
                                           "recurrence_end_date": "2026-07-10"}).json()
        done = a.patch(f"/api/tasks/{task['id']}", json={"status": "done", "progress": 100}).json()
        self.assertNotIn("next_recurrence_id", done)
        children = [x for x in a.get("/api/tasks").json() if x.get("parent_id") == task["id"]]
        self.assertEqual(len(children), 0)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_edit_form_resave_self_heals_stale_recurrence_end_date(self, *_):
        # Regression: editing a recurring task and pushing due_date past its unchanged
        # recurrence_end_date must not 422 (the edit form always resubmits recurrence_end_date).
        a = self.client(self.token_a)
        task = a.post("/api/tasks", json={"title": "weekly review", "start_date": "2026-07-25",
                                           "due_date": "2026-07-25", "recurrence_rule": "weekly",
                                           "recurrence_end_date": "2026-08-01"}).json()
        updated = a.patch(f"/api/tasks/{task['id']}", json={
            "due_date": "2026-08-05", "recurrence_end_date": "2026-08-01"}).json()
        self.assertEqual(updated["due_date"], "2026-08-05")
        self.assertIsNone(updated["recurrence_end_date"])

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_recurring_task_spawn_carries_estimate_link_color_checklist_and_resets_checklist(self, *_):
        a = self.client(self.token_a)
        task = a.post("/api/tasks", json={
            "title": "weekly review", "start_date": "2026-07-06", "due_date": "2026-07-06",
            "recurrence_rule": "weekly", "estimated_minutes": 45, "link_url": "https://example.com",
            "color": "purple", "links": [{"url": "https://example.com/doc", "label": "doc"}],
            "checklist": [{"text": "prep agenda", "done": True}],
        }).json()
        a.patch(f"/api/tasks/{task['id']}", json={"status": "done", "progress": 100})
        child = next(x for x in a.get("/api/tasks").json() if x.get("parent_id") == task["id"])
        self.assertEqual(child["estimated_minutes"], 45)
        self.assertEqual(child["link_url"], "https://example.com")
        self.assertEqual(child["color"], "purple")
        self.assertEqual(len(child["links"]), 1)
        self.assertEqual(child["links"][0]["url"], "https://example.com/doc")
        self.assertEqual(len(child["checklist"]), 1)
        self.assertFalse(child["checklist"][0]["done"])

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_reopening_a_done_task_is_not_reverted_by_stale_progress_field(self, *_):
        a = self.client(self.token_a)
        task = a.post("/api/tasks", json={"title": "finished task"}).json()
        done = a.patch(f"/api/tasks/{task['id']}", json={"status": "done", "progress": 100}).json()
        self.assertEqual(done["status"], "done")
        # The edit form always resends both fields; a user reopening a done task via the
        # status dropdown may leave the stale progress=100 value untouched in the same request.
        reopened = a.patch(f"/api/tasks/{task['id']}", json={"status": "todo", "progress": 100}).json()
        self.assertEqual(reopened["status"], "todo", reopened)
        self.assertEqual(reopened["progress"], 0)
        self.assertEqual(reopened["approval_status"], "none")

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_task_links_cannot_cross_users(self, *_):
        a, b = self.client(self.token_a), self.client(self.token_b)
        private = a.post("/api/tasks", json={"title": "private dependency"}).json()
        self.assertEqual(b.post("/api/tasks", json={"title": "bad link", "dependency_ids": [private["id"]]}).status_code, 422)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_editing_a_task_drops_a_stale_deleted_parent_and_dependency(self, *_):
        a = self.client(self.token_a)
        parent = a.post("/api/tasks", json={"title": "old parent"}).json()
        dep = a.post("/api/tasks", json={"title": "old dependency"}).json()
        child = a.post("/api/tasks", json={"title": "child", "parent_id": parent["id"], "dependency_ids": [dep["id"]]}).json()
        a.delete(f"/api/tasks/{parent['id']}")
        a.delete(f"/api/tasks/{dep['id']}")
        updated = a.patch(f"/api/tasks/{child['id']}", json={
            "title": "child edited", "parent_id": parent["id"], "dependency_ids": [dep["id"]]})
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertIsNone(updated.json()["parent_id"])
        self.assertEqual(updated.json()["dependency_ids"], [])

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_task_share_link_exposes_read_only_view_and_can_be_revoked(self, *_):
        a, b = self.client(self.token_a), self.client(self.token_b)
        task = a.post("/api/tasks", json={"title": "shared plan", "description": "secret-ish detail", "link_url": "https://example.com/spec"}).json()
        no_auth = TestClient(self.app)
        self.assertEqual(no_auth.get("/api/public/tasks/does-not-exist").status_code, 404)
        shared = a.post(f"/api/tasks/{task['id']}/share")
        self.assertEqual(shared.status_code, 200, shared.text)
        token = shared.json()["public_token"]
        self.assertTrue(token)
        public = no_auth.get(f"/api/public/tasks/{token}")
        self.assertEqual(public.status_code, 200, public.text)
        self.assertEqual(public.json()["title"], "shared plan")
        self.assertEqual(public.json()["link_url"], "https://example.com/spec")
        self.assertNotIn("user_id", public.json())
        self.assertNotIn("assignee_name", public.json())
        self.assertEqual(b.get(f"/api/public/tasks/{token}").status_code, 200)
        revoked = a.delete(f"/api/tasks/{task['id']}/share")
        self.assertEqual(revoked.status_code, 200, revoked.text)
        self.assertEqual(no_auth.get(f"/api/public/tasks/{token}").status_code, 404)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_task_share_link_can_expire(self, *_):
        a = self.client(self.token_a)
        task = a.post("/api/tasks", json={"title": "expiring plan"}).json()
        no_auth = TestClient(self.app)
        rejected = a.post(f"/api/tasks/{task['id']}/share", params={"expires_in_days": 0})
        self.assertEqual(rejected.status_code, 422, rejected.text)
        shared = a.post(f"/api/tasks/{task['id']}/share", params={"expires_in_days": 7})
        self.assertEqual(shared.status_code, 200, shared.text)
        self.assertTrue(shared.json()["public_token_expires_at"])
        token = shared.json()["public_token"]
        self.assertEqual(no_auth.get(f"/api/public/tasks/{token}").status_code, 200)
        from app.db import connection
        with connection() as c:
            c.execute("UPDATE tasks SET public_token_expires_at=? WHERE id=?", ("2000-01-01T00:00:00", task["id"]))
        self.assertEqual(no_auth.get(f"/api/public/tasks/{token}").status_code, 404)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_event_share_link_exposes_read_only_view_and_can_be_revoked(self, *_):
        a, b = self.client(self.token_a), self.client(self.token_b)
        event = a.post("/api/events", json={
            "title": "client kickoff", "start_at": "2025-01-01T10:00:00", "end_at": "2025-01-01T11:00:00",
            "location": "meeting room", "link_url": "https://example.com/agenda"}).json()
        no_auth = TestClient(self.app)
        self.assertEqual(no_auth.get("/api/public/events/does-not-exist").status_code, 404)
        shared = a.post(f"/api/events/{event['id']}/share")
        self.assertEqual(shared.status_code, 200, shared.text)
        token = shared.json()["public_token"]
        self.assertTrue(token)
        public = no_auth.get(f"/api/public/events/{token}")
        self.assertEqual(public.status_code, 200, public.text)
        self.assertEqual(public.json()["title"], "client kickoff")
        self.assertEqual(public.json()["link_url"], "https://example.com/agenda")
        self.assertNotIn("user_id", public.json())
        self.assertEqual(b.get(f"/api/public/events/{token}").status_code, 200)
        revoked = a.delete(f"/api/events/{event['id']}/share")
        self.assertEqual(revoked.status_code, 200, revoked.text)
        self.assertEqual(no_auth.get(f"/api/public/events/{token}").status_code, 404)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_todo_share_link_exposes_read_only_view_and_can_be_revoked(self, *_):
        a, b = self.client(self.token_a), self.client(self.token_b)
        todo = a.post("/api/todos", json={"title": "pick up dry cleaning", "todo_date": "2026-08-01", "link_url": "https://example.com/store"}).json()
        no_auth = TestClient(self.app)
        self.assertEqual(no_auth.get("/api/public/todos/does-not-exist").status_code, 404)
        shared = a.post(f"/api/todos/{todo['id']}/share")
        self.assertEqual(shared.status_code, 200, shared.text)
        token = shared.json()["public_token"]
        self.assertTrue(token)
        public = no_auth.get(f"/api/public/todos/{token}")
        self.assertEqual(public.status_code, 200, public.text)
        self.assertEqual(public.json()["title"], "pick up dry cleaning")
        self.assertEqual(public.json()["link_url"], "https://example.com/store")
        self.assertNotIn("user_id", public.json())
        self.assertEqual(b.get(f"/api/public/todos/{token}").status_code, 200)
        revoked = a.delete(f"/api/todos/{todo['id']}/share")
        self.assertEqual(revoked.status_code, 200, revoked.text)
        self.assertEqual(no_auth.get(f"/api/public/todos/{token}").status_code, 404)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_work_log_share_link_exposes_read_only_view_and_can_be_revoked(self, *_):
        a, b = self.client(self.token_a), self.client(self.token_b)
        log = a.post("/api/work_logs", json={"content": "wrote release notes", "log_date": "2026-07-21", "link_url": "https://example.com/notes"}).json()
        no_auth = TestClient(self.app)
        self.assertEqual(no_auth.get("/api/public/work_logs/does-not-exist").status_code, 404)
        shared = a.post(f"/api/work_logs/{log['id']}/share")
        self.assertEqual(shared.status_code, 200, shared.text)
        token = shared.json()["public_token"]
        self.assertTrue(token)
        public = no_auth.get(f"/api/public/work_logs/{token}")
        self.assertEqual(public.status_code, 200, public.text)
        self.assertEqual(public.json()["content"], "wrote release notes")
        self.assertEqual(public.json()["link_url"], "https://example.com/notes")
        self.assertNotIn("user_id", public.json())
        self.assertEqual(b.get(f"/api/public/work_logs/{token}").status_code, 200)
        revoked = a.delete(f"/api/work_logs/{log['id']}/share")
        self.assertEqual(revoked.status_code, 200, revoked.text)
        self.assertEqual(no_auth.get(f"/api/public/work_logs/{token}").status_code, 404)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_task_rejects_unknown_assignee_field(self, *_):
        a = self.client(self.token_a)
        created = a.post("/api/tasks", json={"title": "handoff", "assignee_name": "Dana"})
        self.assertEqual(created.status_code, 422, created.text)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_task_can_become_active_without_an_owner_field(self, *_):
        a = self.client(self.token_a)
        created = a.post("/api/tasks", json={"title": "no owner needed"})
        self.assertEqual(created.status_code, 200, created.text)

        updated = a.patch(f"/api/tasks/{created.json()['id']}", json={"progress": 40})
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["progress"], 40)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_overdue_task_is_auto_escalated_to_high_priority_on_list(self, *_):
        a = self.client(self.token_a)
        overdue = a.post("/api/tasks", json={"title": "way overdue", "due_date": "2020-01-01", "priority": "normal"}).json()
        due_soon = a.post("/api/tasks", json={"title": "due today", "due_date": "2026-07-21", "priority": "normal"}).json()
        already_high = a.post("/api/tasks", json={"title": "already urgent", "due_date": "2020-01-01", "priority": "high"}).json()
        listing = {item["id"]: item for item in a.get("/api/tasks").json()}
        self.assertEqual(listing[overdue["id"]]["priority"], "high")
        self.assertEqual(listing[due_soon["id"]]["priority"], "normal")
        self.assertEqual(listing[already_high["id"]]["priority"], "high")
        audit = a.get("/api/audit-logs").json()["items"]
        self.assertTrue(any(e["action"] == "auto_escalate" and e["entity_id"] == str(overdue["id"]) for e in audit))

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
        task = a.post("/api/tasks", json={"title": "audited task"}).json()
        updated = a.patch(f"/api/tasks/{task['id']}", json={"progress": 40})
        self.assertEqual(updated.status_code, 200, updated.text)
        logs = a.get("/api/audit-logs?limit=10")
        self.assertEqual(logs.status_code, 200, logs.text)
        self.assertTrue(any(x["action"] == "update" and x["entity_type"] == "tasks" and "progress" in x["metadata"].get("fields", []) for x in logs.json()["items"]))
        self.assertEqual(b.get("/api/audit-logs?limit=10").json()["items"], [])

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_audit_log_update_records_before_after_diff(self, *_):
        a = self.client(self.token_a)
        task = a.post("/api/tasks", json={"title": "diffable task", "priority": "normal"}).json()
        updated = a.patch(f"/api/tasks/{task['id']}", json={"title": "diffable task renamed", "priority": "high"})
        self.assertEqual(updated.status_code, 200, updated.text)
        logs = a.get("/api/audit-logs?limit=10").json()["items"]
        entry = next(x for x in logs if x["action"] == "update" and x["entity_type"] == "tasks" and x["entity_id"] == str(task["id"]))
        changes = entry["metadata"]["changes"]
        self.assertEqual(changes["title"], {"before": "diffable task", "after": "diffable task renamed"})
        self.assertEqual(changes["priority"], {"before": "normal", "after": "high"})
        self.assertNotIn("updated_at", changes)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_audit_logs_filter_by_date_range(self, *_):
        from app.db import connection
        a = self.client(self.token_a)
        task = a.post("/api/tasks", json={"title": "date filtered audit"}).json()
        with connection() as c:
            c.execute("UPDATE audit_logs SET created_at=? WHERE user_id='sub-a' AND entity_type='tasks' AND entity_id=?",
                      ("2020-01-01T10:00:00", str(task["id"])))
        in_range = a.get("/api/audit-logs?limit=50&start=2019-12-31&end=2020-01-02")
        self.assertEqual(in_range.status_code, 200, in_range.text)
        self.assertTrue(any(x["entity_id"] == str(task["id"]) for x in in_range.json()["items"]))
        out_of_range = a.get("/api/audit-logs?limit=50&start=2021-01-01")
        self.assertFalse(any(x["entity_id"] == str(task["id"]) for x in out_of_range.json()["items"]))

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_audit_logs_support_offset_pagination(self, *_):
        a = self.client(self.token_a)
        for i in range(3):
            a.post("/api/tasks", json={"title": f"paged task {i}"})
        first_page = a.get("/api/audit-logs?limit=2&offset=0")
        self.assertEqual(first_page.status_code, 200, first_page.text)
        self.assertEqual(len(first_page.json()["items"]), 2)
        second_page = a.get("/api/audit-logs?limit=2&offset=2")
        self.assertEqual(second_page.status_code, 200, second_page.text)
        first_ids = {x["id"] for x in first_page.json()["items"]}
        second_ids = {x["id"] for x in second_page.json()["items"]}
        self.assertTrue(second_ids)
        self.assertFalse(first_ids & second_ids)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_task_comments_are_user_scoped_and_persisted(self, *_):
        a, b = self.client(self.token_a), self.client(self.token_b)
        task = a.post("/api/tasks", json={"title": "task with comments"}).json()
        empty = a.get(f"/api/tasks/{task['id']}/comments")
        self.assertEqual(empty.status_code, 200, empty.text)
        self.assertEqual(empty.json()["items"], [])
        self.assertEqual(b.get(f"/api/tasks/{task['id']}/comments").status_code, 404)
        created = a.post(f"/api/tasks/{task['id']}/comments", json={"body": "  진행 상황 공유합니다.  "})
        self.assertEqual(created.status_code, 200, created.text)
        self.assertEqual(created.json()["body"], "진행 상황 공유합니다.")
        self.assertEqual(b.post(f"/api/tasks/{task['id']}/comments", json={"body": "몰래"}).status_code, 404)
        blank = a.post(f"/api/tasks/{task['id']}/comments", json={"body": "   "})
        self.assertEqual(blank.status_code, 422)
        listed = a.get(f"/api/tasks/{task['id']}/comments")
        self.assertEqual(len(listed.json()["items"]), 1)
        comment_id = created.json()["id"]
        self.assertEqual(b.patch(f"/api/tasks/{task['id']}/comments/{comment_id}", json={"body": "몰래 수정"}).status_code, 404)
        edited = a.patch(f"/api/tasks/{task['id']}/comments/{comment_id}", json={"body": "  수정된 내용입니다.  "})
        self.assertEqual(edited.status_code, 200, edited.text)
        self.assertEqual(edited.json()["body"], "수정된 내용입니다.")
        self.assertIsNotNone(edited.json()["edited_at"])
        blank_edit = a.patch(f"/api/tasks/{task['id']}/comments/{comment_id}", json={"body": "   "})
        self.assertEqual(blank_edit.status_code, 422)
        self.assertEqual(b.delete(f"/api/tasks/{task['id']}/comments/{comment_id}").status_code, 404)
        deleted = a.delete(f"/api/tasks/{task['id']}/comments/{comment_id}")
        self.assertEqual(deleted.status_code, 200, deleted.text)
        self.assertEqual(a.get(f"/api/tasks/{task['id']}/comments").json()["items"], [])
        logs = a.get("/api/audit-logs?limit=500").json()["items"]
        self.assertTrue(any(x["entity_type"] == "task_comment" and x["action"] == "delete" and x["entity_id"] == str(comment_id) for x in logs))

    def test_task_list_includes_comment_count(self, *_):
        a, b = self.client(self.token_a), self.client(self.token_b)
        with_comments = a.post("/api/tasks", json={"title": "task with comments"}).json()
        without_comments = a.post("/api/tasks", json={"title": "task without comments"}).json()
        a.post(f"/api/tasks/{with_comments['id']}/comments", json={"body": "댓글1"})
        a.post(f"/api/tasks/{with_comments['id']}/comments", json={"body": "댓글2"})
        listed = {t["id"]: t for t in a.get("/api/tasks").json()}
        self.assertEqual(listed[with_comments["id"]]["comment_count"], 2)
        self.assertIsNotNone(listed[with_comments["id"]]["latest_comment_at"])
        self.assertEqual(listed[without_comments["id"]]["comment_count"], 0)
        self.assertIsNone(listed[without_comments["id"]]["latest_comment_at"])
        b_task = b.post("/api/tasks", json={"title": "other user task"}).json()
        b.post(f"/api/tasks/{b_task['id']}/comments", json={"body": "몰래"})
        self.assertNotIn(b_task["id"], {t["id"] for t in a.get("/api/tasks").json()})

    def test_todo_and_work_log_and_event_list_include_comment_count(self, *_):
        a = self.client(self.token_a)
        todo = a.post("/api/todos", json={"title": "todo with comments"}).json()
        a.post(f"/api/todos/{todo['id']}/comments", json={"body": "댓글1"})
        listed_todos = {t["id"]: t for t in a.get("/api/todos").json()}
        self.assertEqual(listed_todos[todo["id"]]["comment_count"], 1)
        log = a.post("/api/work_logs", json={"content": "log with comments"}).json()
        a.post(f"/api/work_logs/{log['id']}/comments", json={"body": "댓글1"})
        a.post(f"/api/work_logs/{log['id']}/comments", json={"body": "댓글2"})
        listed_logs = {l["id"]: l for l in a.get("/api/work_logs").json()}
        self.assertEqual(listed_logs[log["id"]]["comment_count"], 2)
        event = a.post("/api/events", json={"title": "event with comments", "start_at": "2026-08-01T10:00:00", "end_at": "2026-08-01T11:00:00"}).json()
        listed_events = {e["id"]: e for e in a.get("/api/events").json()}
        self.assertEqual(listed_events[event["id"]]["comment_count"], 0)

    def test_task_todo_work_log_event_list_include_attachment_count(self, *_):
        a, b = self.client(self.token_a), self.client(self.token_b)
        with_attachment = a.post("/api/tasks", json={"title": "task with attachment"}).json()
        without_attachment = a.post("/api/tasks", json={"title": "task without attachment"}).json()
        a.post(f"/api/tasks/{with_attachment['id']}/attachments", files={"file": ("a.txt", b"hi", "text/plain")})
        listed_tasks = {t["id"]: t for t in a.get("/api/tasks").json()}
        self.assertEqual(listed_tasks[with_attachment["id"]]["attachment_count"], 1)
        self.assertEqual(listed_tasks[with_attachment["id"]]["attachment_names"], ["a.txt"])
        self.assertEqual(listed_tasks[without_attachment["id"]]["attachment_count"], 0)
        self.assertEqual(listed_tasks[without_attachment["id"]]["attachment_names"], [])
        b_task = b.post("/api/tasks", json={"title": "other user task"}).json()
        b.post(f"/api/tasks/{b_task['id']}/attachments", files={"file": ("a.txt", b"hi", "text/plain")})
        self.assertNotIn(b_task["id"], {t["id"] for t in a.get("/api/tasks").json()})

        todo = a.post("/api/todos", json={"title": "todo with attachment"}).json()
        a.post(f"/api/todos/{todo['id']}/attachments", files={"file": ("a.txt", b"hi", "text/plain")})
        listed_todos = {t["id"]: t for t in a.get("/api/todos").json()}
        self.assertEqual(listed_todos[todo["id"]]["attachment_count"], 1)

        log = a.post("/api/work_logs", json={"content": "log with attachments"}).json()
        a.post(f"/api/work_logs/{log['id']}/attachments", files={"file": ("a.txt", b"hi", "text/plain")})
        a.post(f"/api/work_logs/{log['id']}/attachments", files={"file": ("b.txt", b"hi", "text/plain")})
        listed_logs = {l["id"]: l for l in a.get("/api/work_logs").json()}
        self.assertEqual(listed_logs[log["id"]]["attachment_count"], 2)
        self.assertCountEqual(listed_logs[log["id"]]["attachment_names"], ["a.txt", "b.txt"])

        event = a.post("/api/events", json={"title": "event with attachment", "start_at": "2026-08-01T10:00:00", "end_at": "2026-08-01T11:00:00"}).json()
        a.post(f"/api/events/{event['id']}/attachments", files={"file": ("a.txt", b"hi", "text/plain")})
        listed_events = {e["id"]: e for e in a.get("/api/events").json()}
        self.assertEqual(listed_events[event["id"]]["attachment_count"], 1)

    def test_task_attachments_upload_download_delete_and_size_limit(self, *_):
        a, b = self.client(self.token_a), self.client(self.token_b)
        task = a.post("/api/tasks", json={"title": "task with attachments"}).json()
        empty = a.get(f"/api/tasks/{task['id']}/attachments")
        self.assertEqual(empty.status_code, 200, empty.text)
        self.assertEqual(empty.json()["items"], [])
        self.assertEqual(b.get(f"/api/tasks/{task['id']}/attachments").status_code, 404)

        uploaded = a.post(f"/api/tasks/{task['id']}/attachments",
                           files={"file": ("notes.txt", b"hello world", "text/plain")})
        self.assertEqual(uploaded.status_code, 200, uploaded.text)
        item = uploaded.json()
        self.assertEqual(item["filename"], "notes.txt")
        self.assertEqual(item["size_bytes"], 11)
        self.assertNotIn("data_base64", item)

        self.assertEqual(b.post(f"/api/tasks/{task['id']}/attachments",
                                 files={"file": ("sneaky.txt", b"x", "text/plain")}).status_code, 404)

        listed = a.get(f"/api/tasks/{task['id']}/attachments")
        self.assertEqual(len(listed.json()["items"]), 1)

        attachment_id = item["id"]
        self.assertEqual(b.get(f"/api/tasks/{task['id']}/attachments/{attachment_id}/download").status_code, 404)
        downloaded = a.get(f"/api/tasks/{task['id']}/attachments/{attachment_id}/download")
        self.assertEqual(downloaded.status_code, 200, downloaded.text)
        self.assertEqual(downloaded.content, b"hello world")

        too_big = a.post(f"/api/tasks/{task['id']}/attachments",
                          files={"file": ("big.bin", b"0" * (5 * 1024 * 1024 + 1), "application/octet-stream")})
        self.assertEqual(too_big.status_code, 422)

        empty_file = a.post(f"/api/tasks/{task['id']}/attachments", files={"file": ("empty.txt", b"", "text/plain")})
        self.assertEqual(empty_file.status_code, 422)

        self.assertEqual(b.delete(f"/api/tasks/{task['id']}/attachments/{attachment_id}").status_code, 404)
        deleted = a.delete(f"/api/tasks/{task['id']}/attachments/{attachment_id}")
        self.assertEqual(deleted.status_code, 200, deleted.text)
        self.assertEqual(a.get(f"/api/tasks/{task['id']}/attachments").json()["items"], [])
        logs = a.get("/api/audit-logs?limit=500").json()["items"]
        self.assertTrue(any(x["entity_type"] == "task_attachment" and x["action"] == "delete" and x["entity_id"] == str(attachment_id) for x in logs))

    def test_event_attachments_upload_download_delete_and_size_limit(self, *_):
        a, b = self.client(self.token_a), self.client(self.token_b)
        event = a.post("/api/events", json={"title": "event with attachments", "start_at": "2026-06-01T09:00:00", "end_at": "2026-06-01T10:00:00"}).json()
        empty = a.get(f"/api/events/{event['id']}/attachments")
        self.assertEqual(empty.status_code, 200, empty.text)
        self.assertEqual(empty.json()["items"], [])
        self.assertEqual(b.get(f"/api/events/{event['id']}/attachments").status_code, 404)

        uploaded = a.post(f"/api/events/{event['id']}/attachments",
                           files={"file": ("agenda.txt", b"hello world", "text/plain")})
        self.assertEqual(uploaded.status_code, 200, uploaded.text)
        item = uploaded.json()
        self.assertEqual(item["filename"], "agenda.txt")
        self.assertEqual(item["size_bytes"], 11)
        self.assertNotIn("data_base64", item)

        self.assertEqual(b.post(f"/api/events/{event['id']}/attachments",
                                 files={"file": ("sneaky.txt", b"x", "text/plain")}).status_code, 404)

        listed = a.get(f"/api/events/{event['id']}/attachments")
        self.assertEqual(len(listed.json()["items"]), 1)

        attachment_id = item["id"]
        self.assertEqual(b.get(f"/api/events/{event['id']}/attachments/{attachment_id}/download").status_code, 404)
        downloaded = a.get(f"/api/events/{event['id']}/attachments/{attachment_id}/download")
        self.assertEqual(downloaded.status_code, 200, downloaded.text)
        self.assertEqual(downloaded.content, b"hello world")

        too_big = a.post(f"/api/events/{event['id']}/attachments",
                          files={"file": ("big.bin", b"0" * (5 * 1024 * 1024 + 1), "application/octet-stream")})
        self.assertEqual(too_big.status_code, 422)

        empty_file = a.post(f"/api/events/{event['id']}/attachments", files={"file": ("empty.txt", b"", "text/plain")})
        self.assertEqual(empty_file.status_code, 422)

        self.assertEqual(b.delete(f"/api/events/{event['id']}/attachments/{attachment_id}").status_code, 404)
        deleted = a.delete(f"/api/events/{event['id']}/attachments/{attachment_id}")
        self.assertEqual(deleted.status_code, 200, deleted.text)
        self.assertEqual(a.get(f"/api/events/{event['id']}/attachments").json()["items"], [])
        logs = a.get("/api/audit-logs?limit=500").json()["items"]
        self.assertTrue(any(x["entity_type"] == "event_attachment" and x["action"] == "delete" and x["entity_id"] == str(attachment_id) for x in logs))

    def test_todo_attachments_upload_download_delete_and_size_limit(self, *_):
        a, b = self.client(self.token_a), self.client(self.token_b)
        todo = a.post("/api/todos", json={"title": "todo with attachments"}).json()
        empty = a.get(f"/api/todos/{todo['id']}/attachments")
        self.assertEqual(empty.status_code, 200, empty.text)
        self.assertEqual(empty.json()["items"], [])
        self.assertEqual(b.get(f"/api/todos/{todo['id']}/attachments").status_code, 404)

        uploaded = a.post(f"/api/todos/{todo['id']}/attachments",
                           files={"file": ("notes.txt", b"hello world", "text/plain")})
        self.assertEqual(uploaded.status_code, 200, uploaded.text)
        item = uploaded.json()
        self.assertEqual(item["filename"], "notes.txt")
        self.assertEqual(item["size_bytes"], 11)
        self.assertNotIn("data_base64", item)

        self.assertEqual(b.post(f"/api/todos/{todo['id']}/attachments",
                                 files={"file": ("sneaky.txt", b"x", "text/plain")}).status_code, 404)

        listed = a.get(f"/api/todos/{todo['id']}/attachments")
        self.assertEqual(len(listed.json()["items"]), 1)

        attachment_id = item["id"]
        self.assertEqual(b.get(f"/api/todos/{todo['id']}/attachments/{attachment_id}/download").status_code, 404)
        downloaded = a.get(f"/api/todos/{todo['id']}/attachments/{attachment_id}/download")
        self.assertEqual(downloaded.status_code, 200, downloaded.text)
        self.assertEqual(downloaded.content, b"hello world")

        too_big = a.post(f"/api/todos/{todo['id']}/attachments",
                          files={"file": ("big.bin", b"0" * (5 * 1024 * 1024 + 1), "application/octet-stream")})
        self.assertEqual(too_big.status_code, 422)

        empty_file = a.post(f"/api/todos/{todo['id']}/attachments", files={"file": ("empty.txt", b"", "text/plain")})
        self.assertEqual(empty_file.status_code, 422)

        self.assertEqual(b.delete(f"/api/todos/{todo['id']}/attachments/{attachment_id}").status_code, 404)
        deleted = a.delete(f"/api/todos/{todo['id']}/attachments/{attachment_id}")
        self.assertEqual(deleted.status_code, 200, deleted.text)
        self.assertEqual(a.get(f"/api/todos/{todo['id']}/attachments").json()["items"], [])
        logs = a.get("/api/audit-logs?limit=500").json()["items"]
        self.assertTrue(any(x["entity_type"] == "todo_attachment" and x["action"] == "delete" and x["entity_id"] == str(attachment_id) for x in logs))

    def test_work_log_attachments_upload_download_delete_and_size_limit(self, *_):
        a, b = self.client(self.token_a), self.client(self.token_b)
        log = a.post("/api/work_logs", json={"content": "log with attachments"}).json()
        empty = a.get(f"/api/work_logs/{log['id']}/attachments")
        self.assertEqual(empty.status_code, 200, empty.text)
        self.assertEqual(empty.json()["items"], [])
        self.assertEqual(b.get(f"/api/work_logs/{log['id']}/attachments").status_code, 404)

        uploaded = a.post(f"/api/work_logs/{log['id']}/attachments",
                           files={"file": ("notes.txt", b"hello world", "text/plain")})
        self.assertEqual(uploaded.status_code, 200, uploaded.text)
        item = uploaded.json()
        self.assertEqual(item["filename"], "notes.txt")
        self.assertEqual(item["size_bytes"], 11)
        self.assertNotIn("data_base64", item)

        self.assertEqual(b.post(f"/api/work_logs/{log['id']}/attachments",
                                 files={"file": ("sneaky.txt", b"x", "text/plain")}).status_code, 404)

        listed = a.get(f"/api/work_logs/{log['id']}/attachments")
        self.assertEqual(len(listed.json()["items"]), 1)

        attachment_id = item["id"]
        self.assertEqual(b.get(f"/api/work_logs/{log['id']}/attachments/{attachment_id}/download").status_code, 404)
        downloaded = a.get(f"/api/work_logs/{log['id']}/attachments/{attachment_id}/download")
        self.assertEqual(downloaded.status_code, 200, downloaded.text)
        self.assertEqual(downloaded.content, b"hello world")

        too_big = a.post(f"/api/work_logs/{log['id']}/attachments",
                          files={"file": ("big.bin", b"0" * (5 * 1024 * 1024 + 1), "application/octet-stream")})
        self.assertEqual(too_big.status_code, 422)

        empty_file = a.post(f"/api/work_logs/{log['id']}/attachments", files={"file": ("empty.txt", b"", "text/plain")})
        self.assertEqual(empty_file.status_code, 422)

        self.assertEqual(b.delete(f"/api/work_logs/{log['id']}/attachments/{attachment_id}").status_code, 404)
        deleted = a.delete(f"/api/work_logs/{log['id']}/attachments/{attachment_id}")
        self.assertEqual(deleted.status_code, 200, deleted.text)
        self.assertEqual(a.get(f"/api/work_logs/{log['id']}/attachments").json()["items"], [])
        logs = a.get("/api/audit-logs?limit=500").json()["items"]
        self.assertTrue(any(x["entity_type"] == "work_log_attachment" and x["action"] == "delete" and x["entity_id"] == str(attachment_id) for x in logs))

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_event_comments_are_user_scoped_and_persisted(self, *_):
        a, b = self.client(self.token_a), self.client(self.token_b)
        event = a.post("/api/events", json={"title": "event with comments", "start_at": "2026-08-01T09:00:00", "end_at": "2026-08-01T10:00:00"}).json()
        empty = a.get(f"/api/events/{event['id']}/comments")
        self.assertEqual(empty.status_code, 200, empty.text)
        self.assertEqual(empty.json()["items"], [])
        self.assertEqual(b.get(f"/api/events/{event['id']}/comments").status_code, 404)
        created = a.post(f"/api/events/{event['id']}/comments", json={"body": "  회의 준비물 확인.  "})
        self.assertEqual(created.status_code, 200, created.text)
        self.assertEqual(created.json()["body"], "회의 준비물 확인.")
        self.assertEqual(b.post(f"/api/events/{event['id']}/comments", json={"body": "몰래"}).status_code, 404)
        blank = a.post(f"/api/events/{event['id']}/comments", json={"body": "   "})
        self.assertEqual(blank.status_code, 422)
        listed = a.get(f"/api/events/{event['id']}/comments")
        self.assertEqual(len(listed.json()["items"]), 1)
        comment_id = created.json()["id"]
        self.assertEqual(b.patch(f"/api/events/{event['id']}/comments/{comment_id}", json={"body": "몰래 수정"}).status_code, 404)
        edited = a.patch(f"/api/events/{event['id']}/comments/{comment_id}", json={"body": "  수정된 내용입니다.  "})
        self.assertEqual(edited.status_code, 200, edited.text)
        self.assertEqual(edited.json()["body"], "수정된 내용입니다.")
        self.assertIsNotNone(edited.json()["edited_at"])
        blank_edit = a.patch(f"/api/events/{event['id']}/comments/{comment_id}", json={"body": "   "})
        self.assertEqual(blank_edit.status_code, 422)
        self.assertEqual(b.delete(f"/api/events/{event['id']}/comments/{comment_id}").status_code, 404)
        deleted = a.delete(f"/api/events/{event['id']}/comments/{comment_id}")
        self.assertEqual(deleted.status_code, 200, deleted.text)
        self.assertEqual(a.get(f"/api/events/{event['id']}/comments").json()["items"], [])
        logs = a.get("/api/audit-logs?limit=500").json()["items"]
        self.assertTrue(any(x["entity_type"] == "event_comment" and x["action"] == "delete" and x["entity_id"] == str(comment_id) for x in logs))

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_event_series_update_applies_to_future_occurrences_only(self, *_):
        b, a = self.client(self.token_b), self.client(self.token_a)
        group_id = "rec-test-group-1"
        occurrences = []
        for day in ("2026-09-01", "2026-09-08", "2026-09-15"):
            created = b.post("/api/events", json={
                "title": "주간 회의", "start_at": f"{day}T09:00:00", "end_at": f"{day}T10:00:00",
                "recurrence_group_id": group_id})
            self.assertEqual(created.status_code, 200, created.text)
            occurrences.append(created.json())
        past = b.post("/api/events", json={"title": "지난 회의", "start_at": "2026-08-25T09:00:00", "end_at": "2026-08-25T10:00:00", "recurrence_group_id": group_id})
        self.assertEqual(past.status_code, 200, past.text)
        other_user_conflict = a.patch(f"/api/events/series/{group_id}?from_start_at=2026-09-01T09:00:00", json={"title": "몰래 변경"})
        self.assertEqual(other_user_conflict.status_code, 404)
        response = b.patch(f"/api/events/series/{group_id}?from_start_at=2026-09-01T09:00:00", json={"title": "주간 회의 (변경)", "location": "3층 회의실", "start_at": "1999-01-01T00:00:00"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["updated"], 3)
        for occurrence in occurrences:
            refreshed = b.get(f"/api/events/{occurrence['id']}").json()
            self.assertEqual(refreshed["title"], "주간 회의 (변경)")
            self.assertEqual(refreshed["location"], "3층 회의실")
            self.assertEqual(refreshed["start_at"], occurrence["start_at"])
        untouched = b.get(f"/api/events/{past.json()['id']}").json()
        self.assertEqual(untouched["title"], "지난 회의")
        no_op = b.patch(f"/api/events/series/{group_id}?from_start_at=2026-09-01T09:00:00", json={"start_at": "1999-01-01T00:00:00"})
        self.assertEqual(no_op.status_code, 422)
        missing_group = b.patch("/api/events/series/does-not-exist?from_start_at=2026-09-01T09:00:00", json={"title": "x"})
        self.assertEqual(missing_group.status_code, 404)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_event_series_get_lists_all_occurrences_and_rejects_other_users(self, *_):
        b, a = self.client(self.token_b), self.client(self.token_a)
        group_id = "rec-test-group-history"
        occurrences = []
        for day in ("2026-11-01", "2026-11-08", "2026-11-15"):
            created = b.post("/api/events", json={
                "title": "월간 점검", "start_at": f"{day}T09:00:00", "end_at": f"{day}T10:00:00",
                "recurrence_group_id": group_id})
            self.assertEqual(created.status_code, 200, created.text)
            occurrences.append(created.json())
        series = b.get(f"/api/events/{occurrences[0]['id']}/series")
        self.assertEqual(series.status_code, 200, series.text)
        self.assertEqual([item["id"] for item in series.json()["items"]], [o["id"] for o in occurrences])
        self.assertEqual(a.get(f"/api/events/{occurrences[0]['id']}/series").status_code, 404)
        self.assertEqual(b.get("/api/events/999999/series").status_code, 404)
        solo = b.post("/api/events", json={"title": "단독 일정", "start_at": "2026-11-20T09:00:00", "end_at": "2026-11-20T10:00:00"})
        self.assertEqual(solo.status_code, 200, solo.text)
        solo_series = b.get(f"/api/events/{solo.json()['id']}/series")
        self.assertEqual(len(solo_series.json()["items"]), 1)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_event_series_delete_removes_only_future_occurrences(self, *_):
        b, a = self.client(self.token_b), self.client(self.token_a)
        group_id = "rec-test-group-2"
        occurrences = []
        for day in ("2026-10-01", "2026-10-08", "2026-10-15"):
            created = b.post("/api/events", json={
                "title": "격주 점검", "start_at": f"{day}T09:00:00", "end_at": f"{day}T10:00:00",
                "recurrence_group_id": group_id})
            self.assertEqual(created.status_code, 200, created.text)
            occurrences.append(created.json())
        past = b.post("/api/events", json={"title": "지난 점검", "start_at": "2026-09-24T09:00:00", "end_at": "2026-09-24T10:00:00", "recurrence_group_id": group_id})
        self.assertEqual(past.status_code, 200, past.text)
        other_user_denied = a.delete(f"/api/events/series/{group_id}?from_start_at=2026-10-01T09:00:00")
        self.assertEqual(other_user_denied.status_code, 404)
        response = b.delete(f"/api/events/series/{group_id}?from_start_at=2026-10-01T09:00:00")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["deleted"], 3)
        for occurrence in occurrences:
            self.assertEqual(b.get(f"/api/events/{occurrence['id']}").status_code, 404)
        untouched = b.get(f"/api/events/{past.json()['id']}")
        self.assertEqual(untouched.status_code, 200, untouched.text)
        missing_group = b.delete("/api/events/series/does-not-exist?from_start_at=2026-10-01T09:00:00")
        self.assertEqual(missing_group.status_code, 404)

    def test_todo_comments_are_user_scoped_and_persisted(self):
        a, b = self.client(self.token_a), self.client(self.token_b)
        todo = a.post("/api/todos", json={"title": "todo with comments", "todo_date": "2026-08-01"}).json()
        empty = a.get(f"/api/todos/{todo['id']}/comments")
        self.assertEqual(empty.status_code, 200, empty.text)
        self.assertEqual(empty.json()["items"], [])
        self.assertEqual(b.get(f"/api/todos/{todo['id']}/comments").status_code, 404)
        created = a.post(f"/api/todos/{todo['id']}/comments", json={"body": "  담당자에게 확인 요청.  "})
        self.assertEqual(created.status_code, 200, created.text)
        self.assertEqual(created.json()["body"], "담당자에게 확인 요청.")
        self.assertEqual(b.post(f"/api/todos/{todo['id']}/comments", json={"body": "몰래"}).status_code, 404)
        blank = a.post(f"/api/todos/{todo['id']}/comments", json={"body": "   "})
        self.assertEqual(blank.status_code, 422)
        listed = a.get(f"/api/todos/{todo['id']}/comments")
        self.assertEqual(len(listed.json()["items"]), 1)
        comment_id = created.json()["id"]
        self.assertEqual(b.patch(f"/api/todos/{todo['id']}/comments/{comment_id}", json={"body": "몰래 수정"}).status_code, 404)
        edited = a.patch(f"/api/todos/{todo['id']}/comments/{comment_id}", json={"body": "  수정된 내용입니다.  "})
        self.assertEqual(edited.status_code, 200, edited.text)
        self.assertEqual(edited.json()["body"], "수정된 내용입니다.")
        self.assertIsNotNone(edited.json()["edited_at"])
        blank_edit = a.patch(f"/api/todos/{todo['id']}/comments/{comment_id}", json={"body": "   "})
        self.assertEqual(blank_edit.status_code, 422)
        self.assertEqual(b.delete(f"/api/todos/{todo['id']}/comments/{comment_id}").status_code, 404)
        deleted = a.delete(f"/api/todos/{todo['id']}/comments/{comment_id}")
        self.assertEqual(deleted.status_code, 200, deleted.text)
        self.assertEqual(a.get(f"/api/todos/{todo['id']}/comments").json()["items"], [])
        logs = a.get("/api/audit-logs?limit=500").json()["items"]
        self.assertTrue(any(x["entity_type"] == "todo_comment" and x["action"] == "delete" and x["entity_id"] == str(comment_id) for x in logs))

    def test_work_log_comments_are_user_scoped_and_persisted(self):
        a, b = self.client(self.token_a), self.client(self.token_b)
        log = a.post("/api/work_logs", json={"content": "log with comments", "log_date": "2026-08-01"}).json()
        empty = a.get(f"/api/work_logs/{log['id']}/comments")
        self.assertEqual(empty.status_code, 200, empty.text)
        self.assertEqual(empty.json()["items"], [])
        self.assertEqual(b.get(f"/api/work_logs/{log['id']}/comments").status_code, 404)
        created = a.post(f"/api/work_logs/{log['id']}/comments", json={"body": "  후속 조치 필요.  "})
        self.assertEqual(created.status_code, 200, created.text)
        self.assertEqual(created.json()["body"], "후속 조치 필요.")
        self.assertEqual(b.post(f"/api/work_logs/{log['id']}/comments", json={"body": "몰래"}).status_code, 404)
        blank = a.post(f"/api/work_logs/{log['id']}/comments", json={"body": "   "})
        self.assertEqual(blank.status_code, 422)
        listed = a.get(f"/api/work_logs/{log['id']}/comments")
        self.assertEqual(len(listed.json()["items"]), 1)
        comment_id = created.json()["id"]
        self.assertEqual(b.patch(f"/api/work_logs/{log['id']}/comments/{comment_id}", json={"body": "몰래 수정"}).status_code, 404)
        edited = a.patch(f"/api/work_logs/{log['id']}/comments/{comment_id}", json={"body": "  수정된 내용입니다.  "})
        self.assertEqual(edited.status_code, 200, edited.text)
        self.assertEqual(edited.json()["body"], "수정된 내용입니다.")
        self.assertIsNotNone(edited.json()["edited_at"])
        blank_edit = a.patch(f"/api/work_logs/{log['id']}/comments/{comment_id}", json={"body": "   "})
        self.assertEqual(blank_edit.status_code, 422)
        self.assertEqual(b.delete(f"/api/work_logs/{log['id']}/comments/{comment_id}").status_code, 404)
        deleted = a.delete(f"/api/work_logs/{log['id']}/comments/{comment_id}")
        self.assertEqual(deleted.status_code, 200, deleted.text)
        self.assertEqual(a.get(f"/api/work_logs/{log['id']}/comments").json()["items"], [])
        logs = a.get("/api/audit-logs?limit=500").json()["items"]
        self.assertTrue(any(x["entity_type"] == "work_log_comment" and x["action"] == "delete" and x["entity_id"] == str(comment_id) for x in logs))

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

    def test_duplicate_feature_request_content_is_not_requeued(self):
        a = self.client(self.token_a)
        first = a.post("/api/feature-requests", json={"content": "하위 업무 표시를 줄여주세요", "source": "public_changelog"})
        self.assertEqual(first.status_code, 200, first.text)
        resubmitted = a.post("/api/feature-requests", json={"content": "하위 업무 표시를 줄여주세요", "source": "public_changelog"})
        self.assertEqual(resubmitted.status_code, 200, resubmitted.text)
        self.assertEqual(resubmitted.json()["id"], first.json()["id"])
        self.assertEqual(len(a.get("/api/feature-requests").json()["items"]), 1)

        headers = {"Authorization": "Bearer test-codex-admin-token"}
        anonymous = TestClient(self.app)
        completed = anonymous.patch(f"/api/admin/feature-requests/{first.json()['id']}", headers=headers,
                                    json={"status": "done", "description": "이미 반영되었습니다."})
        self.assertEqual(completed.status_code, 200, completed.text)
        resubmitted_after_done = a.post("/api/feature-requests", json={"content": "하위 업무 표시를 줄여주세요", "source": "public_changelog"})
        self.assertEqual(resubmitted_after_done.status_code, 200, resubmitted_after_done.text)
        self.assertEqual(resubmitted_after_done.json()["id"], first.json()["id"])
        self.assertEqual(resubmitted_after_done.json()["status"], "done")

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

    def test_public_changelog_summary_groups_aged_entries_with_local_rules_fallback(self):
        anonymous = TestClient(self.app)
        response = anonymous.post("/api/public/changelog-summary", json={"groups": [
            {"period": "2026-06", "entries": [{"description": "칸반 보드 추가"}, {"description": "모바일 성능 개선"}]},
        ]})
        self.assertEqual(response.status_code, 200, response.text)
        periods = response.json()["periods"]
        self.assertEqual(len(periods), 1)
        self.assertEqual(periods[0]["period"], "2026-06")
        self.assertEqual(periods[0]["count"], 2)
        self.assertEqual(periods[0]["source"], "private-rules")
        self.assertIn("칸반 보드 추가", periods[0]["summary"])

    def test_public_changelog_summary_rejects_empty_or_oversized_groups(self):
        anonymous = TestClient(self.app)
        self.assertEqual(anonymous.post("/api/public/changelog-summary", json={"groups": []}).status_code, 422)
        self.assertEqual(anonymous.post("/api/public/changelog-summary",
                         json={"groups": [{"period": "2026-06", "entries": []}]}).status_code, 422)
        self.assertEqual(anonymous.post("/api/public/changelog-summary",
                         json={"groups": [{"period": "", "entries": [{"description": "x"}]}]}).status_code, 422)

    def test_ai_settings_are_user_specific_and_support_gemini(self):
        from app import ai

        saved = ai.save_user_config("sub-a", {
            "provider": "gemini",
            "api_key": "gemini-secret",
            "model": "gemini-2.5-flash",
        })
        self.assertEqual(saved["provider"], "gemini")
        self.assertEqual(saved["provider_name"], "Gemini")
        self.assertTrue(saved["api_key_set"])
        self.assertIn("Gemini · gemini-2.5-flash", saved["binding_label"])
        self.assertEqual(saved["binding"]["provider"], "gemini")
        self.assertEqual(saved["binding"]["provider_name"], "Gemini")
        self.assertEqual(saved["binding"]["model"], "gemini-2.5-flash")
        self.assertTrue(saved["binding"]["api_key_set"])

        status = ai.status("sub-a", "gemini")
        self.assertEqual(status["provider"], "gemini")
        self.assertTrue(status["configured"])
        self.assertTrue(status["saved_api_key"])
        self.assertEqual(status["binding"]["label"], "Gemini · gemini-2.5-flash · 키 저장됨")

        updated = ai.save_user_config("sub-a", {
            "provider": "gemini",
            "model": "gemini-3.5-flash",
            "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
        })
        self.assertTrue(updated["api_key_set"])
        self.assertEqual(updated["model"], "gemini-3.5-flash")
        self.assertIn("Gemini · gemini-3.5-flash", updated["binding_label"])

        switched = ai.save_user_config("sub-a", {
            "provider": "openai",
            "api_key": "openai-secret",
            "model": "gpt-5-mini",
        })
        self.assertEqual(switched["provider"], "openai")
        self.assertIn("OpenAI · gpt-5-mini", switched["binding_label"])

        gemini = ai.status("sub-a", "gemini")
        self.assertEqual(gemini["provider"], "gemini")
        self.assertTrue(gemini["api_key_set"])
        self.assertIn("Gemini · gemini-3.5-flash", gemini["binding_label"])

        other = ai.status("sub-b")
        self.assertNotEqual(other["provider"], "gemini")

    def test_ai_settings_reject_model_provider_mismatch(self):
        from app import ai

        with self.assertRaises(ValueError):
            ai.save_user_config("sub-mismatch", {
                "provider": "openai",
                "api_key": "openai-secret",
                "model": "gemini-2.5-pro",
            })
        with self.assertRaises(ValueError):
            ai.save_user_config("sub-mismatch", {
                "provider": "gemini",
                "api_key": "gemini-secret",
                "model": "gpt-4.1-mini",
            })

    def test_ai_settings_reject_base_url_provider_mismatch(self):
        from app import ai

        with self.assertRaises(ValueError):
            ai.save_user_config("sub-mismatch-url", {
                "provider": "openai",
                "api_key": "openai-secret",
                "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
            })
        with self.assertRaises(ValueError):
            ai.save_user_config("sub-mismatch-url", {
                "provider": "gemini",
                "api_key": "gemini-secret",
                "base_url": "https://api.openai.com/v1",
            })

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
    def test_achievement_report_includes_tag_breakdown(self, *_):
        a = self.client(self.token_a)
        task = a.post("/api/tasks", json={"title": "tagged task", "tags": ["Reporting"], "estimated_minutes": 30})
        self.assertEqual(task.status_code, 200, task.text)
        done = a.patch(f"/api/tasks/{task.json()['id']}", json={"status": "done", "progress": 100})
        self.assertEqual(done.status_code, 200, done.text)
        a.post("/api/work_logs", json={"content": "reporting work", "log_date": "2026-07-06", "duration_minutes": 60, "tags": ["Reporting"]})
        a.post("/api/work_logs", json={"content": "untagged work", "log_date": "2026-07-06", "duration_minutes": 15})
        report = a.get("/api/achievements?start_date=2026-01-01&end_date=2026-12-31")
        self.assertEqual(report.status_code, 200, report.text)
        breakdown = {row["tag"]: row for row in report.json()["tag_breakdown"]}
        self.assertIn("Reporting", breakdown)
        self.assertEqual(breakdown["Reporting"]["tracked_minutes"], 60)
        self.assertGreaterEqual(breakdown["Reporting"]["completed_tasks"], 1)
        self.assertIn("(태그 없음)", breakdown)
        self.assertEqual(breakdown["(태그 없음)"]["tracked_minutes"], 15)
        timeline_task = next(x for x in report.json()["timeline"] if x["type"] == "task" and x["title"] == "tagged task")
        self.assertEqual(timeline_task["estimated_minutes"], 30)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_achievement_report_includes_client_breakdown(self, *_):
        a = self.client(self.token_a)
        a.post("/api/work_logs", json={"content": "client work", "log_date": "2026-07-06", "duration_minutes": 90,
                                        "client_name": "Acme Corp", "billable": True, "hourly_rate_override": 60,
                                        "tags": ["ClientBreakdownTest"]})
        a.post("/api/work_logs", json={"content": "no client", "log_date": "2026-07-06", "duration_minutes": 20,
                                        "tags": ["ClientBreakdownTest"]})
        report = a.get("/api/achievements?start_date=2026-01-01&end_date=2026-12-31")
        self.assertEqual(report.status_code, 200, report.text)
        breakdown = {row["client_name"]: row for row in report.json()["client_breakdown"]}
        self.assertIn("Acme Corp", breakdown)
        self.assertEqual(breakdown["Acme Corp"]["tracked_minutes"], 90)
        self.assertEqual(breakdown["Acme Corp"]["billable_minutes"], 90)
        self.assertEqual(breakdown["Acme Corp"]["billable_amount"], 90.0)
        self.assertIn("(고객 없음)", breakdown)
        self.assertEqual(breakdown["(고객 없음)"]["tracked_minutes"], 20)
        self.assertEqual(breakdown["(고객 없음)"]["billable_minutes"], 0)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_achievement_summary_excludes_archived_tasks_from_active_count(self, *_):
        a = self.client(self.token_a)
        report_before = a.get("/api/achievements?start_date=2026-01-01&end_date=2026-12-31")
        active_before = report_before.json()["summary"]["active_tasks"]
        task = a.post("/api/tasks", json={"title": "stale unfinished project", "progress": 40}).json()
        report_with_task = a.get("/api/achievements?start_date=2026-01-01&end_date=2026-12-31")
        self.assertEqual(report_with_task.json()["summary"]["active_tasks"], active_before + 1)
        a.post(f"/api/tasks/{task['id']}/archive")
        report_after_archive = a.get("/api/achievements?start_date=2026-01-01&end_date=2026-12-31")
        self.assertEqual(report_after_archive.json()["summary"]["active_tasks"], active_before)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_work_log_duration_minutes_is_persisted_and_summed_in_report(self, *_):
        a = self.client(self.token_a)
        log = a.post("/api/work_logs", json={"content": "focused work", "log_date": "2026-07-06", "duration_minutes": 90})
        self.assertEqual(log.status_code, 200, log.text)
        self.assertEqual(log.json()["duration_minutes"], 90)
        second = a.post("/api/work_logs", json={"content": "more work", "log_date": "2026-07-06", "duration_minutes": 30})
        self.assertEqual(second.status_code, 200, second.text)
        report = a.get("/api/achievements?start_date=2026-07-01&end_date=2026-07-31")
        self.assertEqual(report.status_code, 200, report.text)
        self.assertGreaterEqual(report.json()["summary"]["tracked_minutes"], 120)
        patched = a.patch(f"/api/work_logs/{log.json()['id']}", json={"duration_minutes": 45})
        self.assertEqual(patched.status_code, 200, patched.text)
        self.assertEqual(patched.json()["duration_minutes"], 45)
        self.assertEqual(a.post("/api/work_logs", json={"content": "too long", "duration_minutes": 1441}).status_code, 422)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_work_log_link_url_is_persisted_and_validated(self, *_):
        a = self.client(self.token_a)
        log = a.post("/api/work_logs", json={"content": "shipped PR", "log_date": "2026-07-06", "link_url": "https://example.com/pr/1"})
        self.assertEqual(log.status_code, 200, log.text)
        self.assertEqual(log.json()["link_url"], "https://example.com/pr/1")
        self.assertEqual(a.post("/api/work_logs", json={"content": "bad link", "link_url": "not-a-url"}).status_code, 422)
        patched = a.patch(f"/api/work_logs/{log.json()['id']}", json={"link_url": ""})
        self.assertEqual(patched.status_code, 200, patched.text)
        self.assertIsNone(patched.json()["link_url"])

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_work_log_links_are_persisted_and_invalid_urls_dropped(self, *_):
        a = self.client(self.token_a)
        log = a.post("/api/work_logs", json={"content": "shipped PR", "log_date": "2026-07-06", "links": [
            {"id": "1", "url": "https://example.com/pr/1", "label": " 리뷰 링크 "},
            {"id": "2", "url": "not-a-url", "label": "bad"},
        ]})
        self.assertEqual(log.status_code, 200, log.text)
        links = log.json()["links"]
        self.assertEqual(len(links), 1)
        self.assertEqual(links[0]["url"], "https://example.com/pr/1")
        self.assertEqual(links[0]["label"], "리뷰 링크")
        log_id = log.json()["id"]
        updated = a.patch(f"/api/work_logs/{log_id}", json={"links": []})
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["links"], [])

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_work_log_color_is_persisted_and_validated(self, *_):
        a = self.client(self.token_a)
        log = a.post("/api/work_logs", json={"content": "shipped PR", "log_date": "2026-07-06", "color": "purple"})
        self.assertEqual(log.status_code, 200, log.text)
        self.assertEqual(log.json()["color"], "purple")
        cleared = a.patch(f"/api/work_logs/{log.json()['id']}", json={"color": ""})
        self.assertEqual(cleared.status_code, 200, cleared.text)
        self.assertIsNone(cleared.json()["color"])
        self.assertEqual(a.post("/api/work_logs", json={"content": "bad color", "log_date": "2026-07-06", "color": "not-a-color"}).status_code, 422)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_work_log_priority_is_persisted_and_validated(self, *_):
        a = self.client(self.token_a)
        log = a.post("/api/work_logs", json={"content": "urgent fix", "log_date": "2026-07-06", "priority": "high"})
        self.assertEqual(log.status_code, 200, log.text)
        self.assertEqual(log.json()["priority"], "high")
        cleared = a.patch(f"/api/work_logs/{log.json()['id']}", json={"priority": ""})
        self.assertEqual(cleared.status_code, 200, cleared.text)
        self.assertIsNone(cleared.json()["priority"])
        default = a.post("/api/work_logs", json={"content": "no priority set", "log_date": "2026-07-06"})
        self.assertEqual(default.status_code, 200, default.text)
        self.assertIsNone(default.json()["priority"])
        self.assertEqual(a.post("/api/work_logs", json={"content": "bad priority", "log_date": "2026-07-06", "priority": "urgent"}).status_code, 422)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_work_log_billable_is_persisted_and_included_in_achievements_summary(self, *_):
        a = self.client(self.token_a)
        billable = a.post("/api/work_logs", json={"content": "client work", "log_date": "2026-07-06", "duration_minutes": 90, "billable": True})
        self.assertEqual(billable.status_code, 200, billable.text)
        self.assertTrue(billable.json()["billable"])
        non_billable = a.post("/api/work_logs", json={"content": "internal work", "log_date": "2026-07-06", "duration_minutes": 30})
        self.assertEqual(non_billable.status_code, 200, non_billable.text)
        self.assertFalse(non_billable.json()["billable"])
        cleared = a.patch(f"/api/work_logs/{billable.json()['id']}", json={"billable": False})
        self.assertEqual(cleared.status_code, 200, cleared.text)
        self.assertFalse(cleared.json()["billable"])
        recreated = a.post("/api/work_logs", json={"content": "client work again", "log_date": "2026-07-06", "duration_minutes": 45, "billable": True})
        self.assertEqual(recreated.status_code, 200, recreated.text)
        summary = a.get("/api/achievements", params={"start_date": "2026-07-06", "end_date": "2026-07-06"})
        self.assertEqual(summary.status_code, 200, summary.text)
        self.assertEqual(summary.json()["summary"]["billable_minutes"], 45)
        self.assertIsNone(summary.json()["summary"]["billable_amount"])

    def test_work_log_hourly_rate_override_computes_amount_without_global_rate(self, *_):
        a = self.client(self.token_a)
        log = a.post("/api/work_logs", json={"content": "premium client", "log_date": "2026-07-08", "duration_minutes": 60, "billable": True, "hourly_rate_override": 100000})
        self.assertEqual(log.status_code, 200, log.text)
        self.assertEqual(log.json()["hourly_rate_override"], 100000)
        summary = a.get("/api/achievements", params={"start_date": "2026-07-08", "end_date": "2026-07-08"})
        self.assertEqual(summary.status_code, 200, summary.text)
        self.assertEqual(summary.json()["summary"]["billable_amount"], 100000.0)
        cleared = a.patch(f"/api/work_logs/{log.json()['id']}", json={"hourly_rate_override": None})
        self.assertEqual(cleared.status_code, 200, cleared.text)
        self.assertIsNone(cleared.json()["hourly_rate_override"])
        summary_after_clear = a.get("/api/achievements", params={"start_date": "2026-07-08", "end_date": "2026-07-08"})
        self.assertIsNone(summary_after_clear.json()["summary"]["billable_amount"])
        self.assertEqual(a.post("/api/work_logs", json={"content": "bad rate", "log_date": "2026-07-08", "hourly_rate_override": -1}).status_code, 422)

    def test_work_log_client_name_is_persisted_and_clearable(self, *_):
        a = self.client(self.token_a)
        log = a.post("/api/work_logs", json={"content": "client billing", "log_date": "2026-07-08", "duration_minutes": 60, "billable": True, "client_name": "Acme Corp"})
        self.assertEqual(log.status_code, 200, log.text)
        self.assertEqual(log.json()["client_name"], "Acme Corp")
        fetched = a.get("/api/work_logs")
        self.assertEqual(next(x for x in fetched.json() if x["id"] == log.json()["id"])["client_name"], "Acme Corp")
        cleared = a.patch(f"/api/work_logs/{log.json()['id']}", json={"client_name": None})
        self.assertEqual(cleared.status_code, 200, cleared.text)
        self.assertIsNone(cleared.json()["client_name"])
        emptied = a.patch(f"/api/work_logs/{log.json()['id']}", json={"client_name": ""})
        self.assertEqual(emptied.status_code, 200, emptied.text)
        self.assertIsNone(emptied.json()["client_name"])

    def test_work_log_invoiced_at_is_persisted_and_clearable(self, *_):
        a = self.client(self.token_a)
        log = a.post("/api/work_logs", json={"content": "client work", "log_date": "2026-07-06", "duration_minutes": 90, "billable": True})
        self.assertEqual(log.status_code, 200, log.text)
        self.assertIsNone(log.json()["invoiced_at"])
        marked = a.patch(f"/api/work_logs/{log.json()['id']}", json={"invoiced_at": "2026-07-21T12:00:00"})
        self.assertEqual(marked.status_code, 200, marked.text)
        self.assertTrue(marked.json()["invoiced_at"])
        fetched = a.get("/api/work_logs")
        self.assertTrue(next(x for x in fetched.json() if x["id"] == log.json()["id"])["invoiced_at"])
        cleared = a.patch(f"/api/work_logs/{log.json()['id']}", json={"invoiced_at": None})
        self.assertEqual(cleared.status_code, 200, cleared.text)
        self.assertIsNone(cleared.json()["invoiced_at"])

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_billing_hourly_rate_setting_computes_billable_amount(self, *_):
        a = self.client(self.token_b)
        self.assertIsNone(a.get("/api/settings/workflow").json()["billing_hourly_rate"])
        saved = a.put("/api/settings/workflow", json={"billing_hourly_rate": 60000})
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual(saved.json()["billing_hourly_rate"], 60000)
        log = a.post("/api/work_logs", json={"content": "client work", "log_date": "2026-09-01", "duration_minutes": 90, "billable": True})
        self.assertEqual(log.status_code, 200, log.text)
        summary = a.get("/api/achievements", params={"start_date": "2026-09-01", "end_date": "2026-09-01"})
        self.assertEqual(summary.status_code, 200, summary.text)
        self.assertEqual(summary.json()["summary"]["billable_amount"], 90000.0)
        cleared = a.put("/api/settings/workflow", json={"billing_hourly_rate": None})
        self.assertEqual(cleared.status_code, 200, cleared.text)
        self.assertIsNone(cleared.json()["billing_hourly_rate"])
        self.assertEqual(a.put("/api/settings/workflow", json={"billing_hourly_rate": -1}).status_code, 422)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_billing_client_name_setting_persists_and_appears_in_achievements(self, *_):
        a = self.client(self.token_b)
        self.assertIsNone(a.get("/api/settings/workflow").json()["billing_client_name"])
        saved = a.put("/api/settings/workflow", json={"billing_client_name": "  Acme Corp  "})
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual(saved.json()["billing_client_name"], "Acme Corp")
        summary = a.get("/api/achievements", params={"start_date": "2026-09-01", "end_date": "2026-09-01"})
        self.assertEqual(summary.json()["summary"]["billing_client_name"], "Acme Corp")
        cleared = a.put("/api/settings/workflow", json={"billing_client_name": "   "})
        self.assertEqual(cleared.status_code, 200, cleared.text)
        self.assertIsNone(cleared.json()["billing_client_name"])

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_billing_biz_reg_number_setting_persists_and_appears_in_achievements(self, *_):
        a = self.client(self.token_b)
        self.assertIsNone(a.get("/api/settings/workflow").json()["billing_biz_reg_number"])
        saved = a.put("/api/settings/workflow", json={"billing_biz_reg_number": "  123-45-67890  "})
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual(saved.json()["billing_biz_reg_number"], "123-45-67890")
        summary = a.get("/api/achievements", params={"start_date": "2026-09-01", "end_date": "2026-09-01"})
        self.assertEqual(summary.json()["summary"]["billing_biz_reg_number"], "123-45-67890")
        cleared = a.put("/api/settings/workflow", json={"billing_biz_reg_number": "   "})
        self.assertEqual(cleared.status_code, 200, cleared.text)
        self.assertIsNone(cleared.json()["billing_biz_reg_number"])

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_billing_vat_included_setting_persists_and_appears_in_achievements(self, *_):
        a = self.client(self.token_b)
        self.assertFalse(a.get("/api/settings/workflow").json()["billing_vat_included"])
        saved = a.put("/api/settings/workflow", json={"billing_vat_included": True})
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertTrue(saved.json()["billing_vat_included"])
        summary = a.get("/api/achievements", params={"start_date": "2026-09-01", "end_date": "2026-09-01"})
        self.assertTrue(summary.json()["summary"]["billing_vat_included"])
        cleared = a.put("/api/settings/workflow", json={"billing_vat_included": False})
        self.assertEqual(cleared.status_code, 200, cleared.text)
        self.assertFalse(cleared.json()["billing_vat_included"])

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_work_log_time_is_persisted_validated_and_orders_today_endpoint(self, *_):
        from datetime import date
        a = self.client(self.token_a)
        today = date.today().isoformat()
        log = a.post("/api/work_logs", json={"content": "timed log", "log_date": today, "log_time": "09:30"})
        self.assertEqual(log.status_code, 200, log.text)
        self.assertEqual(log.json()["log_time"], "09:30")
        earlier = a.post("/api/work_logs", json={"content": "earlier log", "log_date": today, "log_time": "08:00"})
        self.assertEqual(earlier.status_code, 200, earlier.text)
        ordered = [x["content"] for x in a.get("/api/today").json()["work_logs"] if x["content"] in ("timed log", "earlier log")]
        self.assertEqual(ordered, ["earlier log", "timed log"])
        cleared = a.patch(f"/api/work_logs/{log.json()['id']}", json={"log_time": ""})
        self.assertEqual(cleared.status_code, 200, cleared.text)
        self.assertIsNone(cleared.json()["log_time"])
        self.assertEqual(a.post("/api/work_logs", json={"content": "bad time", "log_date": today, "log_time": "25:99"}).status_code, 422)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_task_estimated_minutes_is_persisted_and_summed_for_completed_tasks(self, *_):
        a = self.client(self.token_a)
        task = a.post("/api/tasks", json={"title": "estimate me", "estimated_minutes": 90})
        self.assertEqual(task.status_code, 200, task.text)
        self.assertEqual(task.json()["estimated_minutes"], 90)
        patched = a.patch(f"/api/tasks/{task.json()['id']}", json={"estimated_minutes": 45})
        self.assertEqual(patched.status_code, 200, patched.text)
        self.assertEqual(patched.json()["estimated_minutes"], 45)
        done = a.patch(f"/api/tasks/{task.json()['id']}", json={"status": "done", "progress": 100})
        self.assertEqual(done.status_code, 200, done.text)
        report = a.get("/api/achievements?start_date=2026-01-01&end_date=2026-12-31")
        self.assertEqual(report.status_code, 200, report.text)
        self.assertGreaterEqual(report.json()["summary"]["estimated_minutes"], 45)
        self.assertEqual(a.post("/api/tasks", json={"title": "too long", "estimated_minutes": 100001}).status_code, 422)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_task_link_url_is_persisted_and_validated(self, *_):
        a = self.client(self.token_a)
        task = a.post("/api/tasks", json={"title": "with link", "link_url": "https://example.com/doc"})
        self.assertEqual(task.status_code, 200, task.text)
        self.assertEqual(task.json()["link_url"], "https://example.com/doc")
        cleared = a.patch(f"/api/tasks/{task.json()['id']}", json={"link_url": ""})
        self.assertEqual(cleared.status_code, 200, cleared.text)
        self.assertIsNone(cleared.json()["link_url"])
        self.assertEqual(a.post("/api/tasks", json={"title": "bad link", "link_url": "not-a-url"}).status_code, 422)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_task_start_time_and_due_time_are_persisted_and_validated(self, *_):
        a = self.client(self.token_a)
        task = a.post("/api/tasks", json={"title": "timed task", "start_date": "2026-07-06", "due_date": "2026-07-06",
                                           "start_time": "09:00", "due_time": "18:30"})
        self.assertEqual(task.status_code, 200, task.text)
        self.assertEqual(task.json()["start_time"], "09:00")
        self.assertEqual(task.json()["due_time"], "18:30")
        cleared = a.patch(f"/api/tasks/{task.json()['id']}", json={"due_time": ""})
        self.assertEqual(cleared.status_code, 200, cleared.text)
        self.assertIsNone(cleared.json()["due_time"])
        self.assertEqual(a.post("/api/tasks", json={"title": "bad time", "due_time": "25:00"}).status_code, 422)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_event_link_url_is_persisted_and_validated(self, *_):
        a = self.client(self.token_a)
        event = a.post("/api/events", json={"title": "with link", "start_at": "2026-07-06T12:00:00", "end_at": "2026-07-06T13:00:00", "link_url": "https://example.com/agenda"})
        self.assertEqual(event.status_code, 200, event.text)
        self.assertEqual(event.json()["link_url"], "https://example.com/agenda")
        cleared = a.patch(f"/api/events/{event.json()['id']}", json={"link_url": ""})
        self.assertEqual(cleared.status_code, 200, cleared.text)
        self.assertIsNone(cleared.json()["link_url"])
        self.assertEqual(a.post("/api/events", json={"title": "bad link", "start_at": "2026-07-06T12:00:00", "end_at": "2026-07-06T13:00:00", "link_url": "not-a-url"}).status_code, 422)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_event_color_is_persisted_and_validated(self, *_):
        a = self.client(self.token_a)
        event = a.post("/api/events", json={"title": "colored", "start_at": "2026-07-06T12:00:00", "end_at": "2026-07-06T13:00:00", "color": "red"})
        self.assertEqual(event.status_code, 200, event.text)
        self.assertEqual(event.json()["color"], "red")
        cleared = a.patch(f"/api/events/{event.json()['id']}", json={"color": ""})
        self.assertEqual(cleared.status_code, 200, cleared.text)
        self.assertIsNone(cleared.json()["color"])
        self.assertEqual(a.post("/api/events", json={"title": "bad color", "start_at": "2026-07-06T12:00:00", "end_at": "2026-07-06T13:00:00", "color": "not-a-color"}).status_code, 422)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_event_priority_is_persisted_and_validated(self, *_):
        a = self.client(self.token_a)
        event = a.post("/api/events", json={"title": "urgent meeting", "start_at": "2026-07-06T12:00:00", "end_at": "2026-07-06T13:00:00", "priority": "high"})
        self.assertEqual(event.status_code, 200, event.text)
        self.assertEqual(event.json()["priority"], "high")
        cleared = a.patch(f"/api/events/{event.json()['id']}", json={"priority": ""})
        self.assertEqual(cleared.status_code, 200, cleared.text)
        self.assertIsNone(cleared.json()["priority"])
        self.assertEqual(a.post("/api/events", json={"title": "bad priority", "start_at": "2026-07-06T12:00:00", "end_at": "2026-07-06T13:00:00", "priority": "urgent"}).status_code, 422)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_event_links_are_persisted_and_invalid_urls_dropped(self, *_):
        a = self.client(self.token_a)
        event = a.post("/api/events", json={"title": "with links", "start_at": "2026-07-06T12:00:00", "end_at": "2026-07-06T13:00:00", "links": [
            {"id": "1", "url": "https://example.com/agenda", "label": " 회의 안건 "},
            {"id": "2", "url": "not-a-url", "label": "bad"},
        ]})
        self.assertEqual(event.status_code, 200, event.text)
        links = event.json()["links"]
        self.assertEqual(len(links), 1)
        self.assertEqual(links[0]["url"], "https://example.com/agenda")
        self.assertEqual(links[0]["label"], "회의 안건")
        event_id = event.json()["id"]
        updated = a.patch(f"/api/events/{event_id}", json={"links": []})
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["links"], [])

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_event_estimated_minutes_is_persisted_and_validated(self, *_):
        a = self.client(self.token_a)
        event = a.post("/api/events", json={"title": "planning", "start_at": "2026-07-06T12:00:00", "end_at": "2026-07-06T13:00:00", "estimated_minutes": 90})
        self.assertEqual(event.status_code, 200, event.text)
        self.assertEqual(event.json()["estimated_minutes"], 90)
        cleared = a.patch(f"/api/events/{event.json()['id']}", json={"estimated_minutes": ""})
        self.assertEqual(cleared.status_code, 200, cleared.text)
        self.assertIsNone(cleared.json()["estimated_minutes"])
        self.assertEqual(a.post("/api/events", json={"title": "bad estimate", "start_at": "2026-07-06T12:00:00", "end_at": "2026-07-06T13:00:00", "estimated_minutes": -5}).status_code, 422)

    def test_work_log_estimated_minutes_is_persisted_and_validated(self):
        a = self.client(self.token_a)
        log = a.post("/api/work_logs", json={"content": "planning review", "log_date": "2026-07-06", "estimated_minutes": 45})
        self.assertEqual(log.status_code, 200, log.text)
        self.assertEqual(log.json()["estimated_minutes"], 45)
        patched = a.patch(f"/api/work_logs/{log.json()['id']}", json={"estimated_minutes": 30})
        self.assertEqual(patched.status_code, 200, patched.text)
        self.assertEqual(patched.json()["estimated_minutes"], 30)
        cleared = a.patch(f"/api/work_logs/{log.json()['id']}", json={"estimated_minutes": ""})
        self.assertEqual(cleared.status_code, 200, cleared.text)
        self.assertIsNone(cleared.json()["estimated_minutes"])
        self.assertEqual(a.post("/api/work_logs", json={"content": "bad estimate", "log_date": "2026-07-06", "estimated_minutes": -5}).status_code, 422)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_ai_apply_expands_recurring_event_into_one_row_per_occurrence(self, *_):
        a = self.client(self.token_a)
        result = a.post("/api/ai/apply", json={"action": "create", "entity": "event", "data": {
            "title": "정기 회의", "start_at": "2026-07-06T10:00:00", "end_at": "2026-07-06T11:00:00",
            "recurrence_rule": "weekly", "recurrence_end_date": "2026-07-20",
        }})
        self.assertEqual(result.status_code, 200, result.text)
        items = result.json()
        self.assertEqual([item["start_at"] for item in items],
                          ["2026-07-06T10:00:00", "2026-07-13T10:00:00", "2026-07-20T10:00:00"])
        self.assertTrue(all(item["title"] == "정기 회의" for item in items))

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_ai_apply_event_without_recurrence_end_date_creates_single_event(self, *_):
        a = self.client(self.token_a)
        result = a.post("/api/ai/apply", json={"action": "create", "entity": "event", "data": {
            "title": "단발 회의", "start_at": "2026-07-06T10:00:00", "end_at": "2026-07-06T11:00:00",
        }})
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(result.json()["title"], "단발 회의")

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_ai_apply_records_audit_log_with_ai_reason(self, *_):
        a = self.client(self.token_a)
        task = a.post("/api/tasks", json={"title": "ai audited task", "progress": 0}).json()
        result = a.post("/api/ai/apply", json={
            "action": "update", "entity": "task", "id": task["id"],
            "data": {"progress": 50}, "reason": "최근 작업 기록을 근거로 진행률을 갱신했습니다.",
        })
        self.assertEqual(result.status_code, 200, result.text)
        logs = a.get("/api/audit-logs?limit=10").json()["items"]
        entry = next(x for x in logs if x["action"] == "update" and x["entity_id"] == str(task["id"]))
        self.assertEqual(entry["metadata"]["source"], "ai")
        self.assertEqual(entry["metadata"]["ai_reason"], "최근 작업 기록을 근거로 진행률을 갱신했습니다.")
        self.assertIn("progress", entry["metadata"]["fields"])

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_task_checklist_is_persisted_and_sanitized(self, *_):
        a = self.client(self.token_a)
        task = a.post("/api/tasks", json={"title": "with checklist", "checklist": [
            {"id": "1", "text": " 초안 작성 ", "done": False},
            {"id": "2", "text": "", "done": True},
        ]})
        self.assertEqual(task.status_code, 200, task.text)
        checklist = task.json()["checklist"]
        self.assertEqual(len(checklist), 1)
        self.assertEqual(checklist[0]["text"], "초안 작성")
        self.assertFalse(checklist[0]["done"])
        task_id = task.json()["id"]
        checked = a.patch(f"/api/tasks/{task_id}", json={"checklist": [{"id": checklist[0]["id"], "text": "초안 작성", "done": True}]})
        self.assertEqual(checked.status_code, 200, checked.text)
        self.assertTrue(checked.json()["checklist"][0]["done"])

    def test_task_checklist_item_due_date_is_kept_when_valid_and_dropped_when_malformed(self, *_):
        a = self.client(self.token_a)
        task = a.post("/api/tasks", json={"title": "with checklist due", "checklist": [
            {"id": "1", "text": "초안 작성", "done": False, "due": "2026-08-01"},
            {"id": "2", "text": "검토", "done": False, "due": "not-a-date"},
        ]})
        self.assertEqual(task.status_code, 200, task.text)
        checklist = task.json()["checklist"]
        self.assertEqual(checklist[0]["due"], "2026-08-01")
        self.assertNotIn("due", checklist[1])

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_event_checklist_is_persisted_and_sanitized(self, *_):
        a = self.client(self.token_a)
        event = a.post("/api/events", json={
            "title": "with checklist", "start_at": "2026-07-06T10:00:00", "end_at": "2026-07-06T11:00:00",
            "checklist": [
                {"id": "1", "text": " 자료 준비 ", "done": False},
                {"id": "2", "text": "", "done": True},
            ],
        })
        self.assertEqual(event.status_code, 200, event.text)
        checklist = event.json()["checklist"]
        self.assertEqual(len(checklist), 1)
        self.assertEqual(checklist[0]["text"], "자료 준비")
        self.assertFalse(checklist[0]["done"])
        event_id = event.json()["id"]
        checked = a.patch(f"/api/events/{event_id}", json={"checklist": [{"id": checklist[0]["id"], "text": "자료 준비", "done": True}]})
        self.assertEqual(checked.status_code, 200, checked.text)
        self.assertTrue(checked.json()["checklist"][0]["done"])

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_task_links_are_persisted_and_invalid_urls_dropped(self, *_):
        a = self.client(self.token_a)
        task = a.post("/api/tasks", json={"title": "with links", "links": [
            {"id": "1", "url": "https://example.com/spec", "label": " 기획서 "},
            {"id": "2", "url": "not-a-url", "label": "bad"},
        ]})
        self.assertEqual(task.status_code, 200, task.text)
        links = task.json()["links"]
        self.assertEqual(len(links), 1)
        self.assertEqual(links[0]["url"], "https://example.com/spec")
        self.assertEqual(links[0]["label"], "기획서")
        task_id = task.json()["id"]
        updated = a.patch(f"/api/tasks/{task_id}", json={"links": []})
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["links"], [])

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_task_custom_fields_are_persisted_and_blank_labels_dropped(self, *_):
        a = self.client(self.token_a)
        task = a.post("/api/tasks", json={"title": "with custom fields", "custom_fields": [
            {"id": "1", "label": " 고객사 ", "value": " Acme "},
            {"id": "2", "label": "   ", "value": "ignored"},
        ]})
        self.assertEqual(task.status_code, 200, task.text)
        fields = task.json()["custom_fields"]
        self.assertEqual(len(fields), 1)
        self.assertEqual(fields[0]["label"], "고객사")
        self.assertEqual(fields[0]["value"], "Acme")
        task_id = task.json()["id"]
        updated = a.patch(f"/api/tasks/{task_id}", json={"custom_fields": []})
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["custom_fields"], [])

    def test_todo_custom_fields_are_persisted_and_blank_labels_dropped(self):
        a = self.client(self.token_a)
        todo = a.post("/api/todos", json={"title": "with custom fields", "custom_fields": [
            {"id": "1", "label": " 고객사 ", "value": " Acme "},
            {"id": "2", "label": "   ", "value": "ignored"},
        ]})
        self.assertEqual(todo.status_code, 200, todo.text)
        fields = todo.json()["custom_fields"]
        self.assertEqual(len(fields), 1)
        self.assertEqual(fields[0]["label"], "고객사")
        self.assertEqual(fields[0]["value"], "Acme")
        todo_id = todo.json()["id"]
        updated = a.patch(f"/api/todos/{todo_id}", json={"custom_fields": []})
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["custom_fields"], [])

    def test_work_log_custom_fields_are_persisted_and_blank_labels_dropped(self):
        a = self.client(self.token_a)
        log = a.post("/api/work_logs", json={"content": "with custom fields", "custom_fields": [
            {"id": "1", "label": " 고객사 ", "value": " Acme "},
            {"id": "2", "label": "   ", "value": "ignored"},
        ]})
        self.assertEqual(log.status_code, 200, log.text)
        fields = log.json()["custom_fields"]
        self.assertEqual(len(fields), 1)
        self.assertEqual(fields[0]["label"], "고객사")
        self.assertEqual(fields[0]["value"], "Acme")
        log_id = log.json()["id"]
        updated = a.patch(f"/api/work_logs/{log_id}", json={"custom_fields": []})
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["custom_fields"], [])

    def test_event_custom_fields_are_persisted_and_blank_labels_dropped(self):
        a = self.client(self.token_a)
        event = a.post("/api/events", json={"title": "with custom fields", "start_at": "2026-08-01T10:00:00", "end_at": "2026-08-01T11:00:00", "custom_fields": [
            {"id": "1", "label": " 고객사 ", "value": " Acme "},
            {"id": "2", "label": "   ", "value": "ignored"},
        ]})
        self.assertEqual(event.status_code, 200, event.text)
        fields = event.json()["custom_fields"]
        self.assertEqual(len(fields), 1)
        self.assertEqual(fields[0]["label"], "고객사")
        self.assertEqual(fields[0]["value"], "Acme")
        event_id = event.json()["id"]
        updated = a.patch(f"/api/events/{event_id}", json={"custom_fields": []})
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["custom_fields"], [])

    def test_reminder_minutes_before_is_persisted_and_validated_on_task_event_todo(self):
        a = self.client(self.token_a)
        task = a.post("/api/tasks", json={"title": "reminder task", "reminder_minutes_before": 45})
        self.assertEqual(task.status_code, 200, task.text)
        self.assertEqual(task.json()["reminder_minutes_before"], 45)
        cleared = a.patch(f"/api/tasks/{task.json()['id']}", json={"reminder_minutes_before": ""})
        self.assertEqual(cleared.status_code, 200, cleared.text)
        self.assertIsNone(cleared.json()["reminder_minutes_before"])
        invalid_task = a.post("/api/tasks", json={"title": "bad reminder", "reminder_minutes_before": 1441})
        self.assertEqual(invalid_task.status_code, 422)

        event = a.post("/api/events", json={"title": "reminder event", "start_at": "2026-08-01T10:00:00", "end_at": "2026-08-01T11:00:00", "reminder_minutes_before": 20})
        self.assertEqual(event.status_code, 200, event.text)
        self.assertEqual(event.json()["reminder_minutes_before"], 20)

        todo = a.post("/api/todos", json={"title": "reminder todo", "todo_date": "2026-08-01", "reminder_minutes_before": 10})
        self.assertEqual(todo.status_code, 200, todo.text)
        self.assertEqual(todo.json()["reminder_minutes_before"], 10)

        log = a.post("/api/work_logs", json={"content": "reminder log", "log_date": "2026-08-01", "reminder_minutes_before": 25})
        self.assertEqual(log.status_code, 200, log.text)
        self.assertEqual(log.json()["reminder_minutes_before"], 25)
        cleared_log = a.patch(f"/api/work_logs/{log.json()['id']}", json={"reminder_minutes_before": ""})
        self.assertEqual(cleared_log.status_code, 200, cleared_log.text)
        self.assertIsNone(cleared_log.json()["reminder_minutes_before"])
        invalid_log = a.post("/api/work_logs", json={"content": "bad reminder log", "log_date": "2026-08-01", "reminder_minutes_before": 1441})
        self.assertEqual(invalid_log.status_code, 422)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_task_color_is_persisted_and_validated(self, *_):
        a = self.client(self.token_a)
        task = a.post("/api/tasks", json={"title": "colored task", "color": "green"})
        self.assertEqual(task.status_code, 200, task.text)
        self.assertEqual(task.json()["color"], "green")
        cleared = a.patch(f"/api/tasks/{task.json()['id']}", json={"color": ""})
        self.assertEqual(cleared.status_code, 200, cleared.text)
        self.assertIsNone(cleared.json()["color"])
        self.assertEqual(a.post("/api/tasks", json={"title": "bad color task", "color": "not-a-color"}).status_code, 422)

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
    def test_editing_task_unaffected_by_unrelated_legacy_dependency_cycle(self, *_):
        import json
        from app.db import connection
        a = self.client(self.token_a)
        x = a.post("/api/tasks", json={"title": "x"}).json()
        y = a.post("/api/tasks", json={"title": "y"}).json()
        with connection() as c:
            c.execute("UPDATE tasks SET dependency_ids=? WHERE id=?", (json.dumps([y["id"]]), x["id"]))
            c.execute("UPDATE tasks SET dependency_ids=? WHERE id=?", (json.dumps([x["id"]]), y["id"]))
        z = a.post("/api/tasks", json={"title": "z", "dependency_ids": [x["id"]]}).json()
        other = a.post("/api/tasks", json={"title": "other"}).json()
        response = a.patch(f"/api/tasks/{z['id']}", json={"title": "z edited", "dependency_ids": [x["id"], other["id"]]})
        self.assertEqual(response.status_code, 200, response.text)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_editing_task_unaffected_by_unrelated_legacy_parent_cycle(self, *_):
        from app.db import connection
        a = self.client(self.token_a)
        x = a.post("/api/tasks", json={"title": "x"}).json()
        y = a.post("/api/tasks", json={"title": "y"}).json()
        with connection() as c:
            c.execute("UPDATE tasks SET parent_id=? WHERE id=?", (y["id"], x["id"]))
            c.execute("UPDATE tasks SET parent_id=? WHERE id=?", (x["id"], y["id"]))
        z = a.post("/api/tasks", json={"title": "z", "parent_id": x["id"]}).json()
        response = a.patch(f"/api/tasks/{z['id']}", json={"title": "z edited", "parent_id": x["id"]})
        self.assertEqual(response.status_code, 200, response.text)

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

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_completing_recurring_todo_spawns_next_occurrence(self, *_):
        a = self.client(self.token_a)
        todo = a.post("/api/todos", json={"title": "water plants", "todo_date": "2026-07-06", "recurrence_rule": "daily"}).json()
        completed = a.patch(f"/api/todos/{todo['id']}", json={"completed": True}).json()
        self.assertIn("next_recurrence_id", completed)
        next_todo = a.get("/api/todos").json()
        spawned = next(t for t in next_todo if t["id"] == completed["next_recurrence_id"])
        self.assertEqual(spawned["todo_date"], "2026-07-07")
        self.assertEqual(spawned["recurrence_rule"], "daily")
        self.assertFalse(spawned["completed"])
        # Re-patching an already-completed todo must not spawn a second occurrence.
        recompleted = a.patch(f"/api/todos/{todo['id']}", json={"completed": True})
        self.assertEqual(recompleted.status_code, 200, recompleted.text)
        self.assertNotIn("next_recurrence_id", recompleted.json())

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_recurring_todo_stops_spawning_past_recurrence_end_date(self, *_):
        a = self.client(self.token_a)
        todo = a.post("/api/todos", json={"title": "water plants until end date", "todo_date": "2026-07-06",
                                           "recurrence_rule": "daily", "recurrence_end_date": "2026-07-06"}).json()
        completed = a.patch(f"/api/todos/{todo['id']}", json={"completed": True}).json()
        self.assertNotIn("next_recurrence_id", completed)
        children = [t for t in a.get("/api/todos").json() if t["title"] == "water plants until end date" and t["id"] != todo["id"]]
        self.assertEqual(len(children), 0)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_skip_todo_recurrence_advances_date_without_completing_or_spawning(self, *_):
        a = self.client(self.token_a)
        todo = a.post("/api/todos", json={"title": "water ferns", "todo_date": "2026-07-06", "recurrence_rule": "daily"}).json()
        skipped = a.post(f"/api/todos/{todo['id']}/skip-recurrence").json()
        self.assertEqual(skipped["id"], todo["id"])
        self.assertEqual(skipped["todo_date"], "2026-07-07")
        self.assertFalse(skipped["completed"])
        siblings = [t for t in a.get("/api/todos").json() if t["title"] == "water ferns"]
        self.assertEqual(len(siblings), 1)
        # Skipping again advances further, staying idempotent-safe (not a completion event).
        skipped_again = a.post(f"/api/todos/{todo['id']}/skip-recurrence").json()
        self.assertEqual(skipped_again["todo_date"], "2026-07-08")

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_skip_todo_recurrence_rejects_non_recurring_or_past_end_date(self, *_):
        a = self.client(self.token_a)
        plain = a.post("/api/todos", json={"title": "one-off", "todo_date": "2026-07-06"}).json()
        self.assertEqual(a.post(f"/api/todos/{plain['id']}/skip-recurrence").status_code, 422)
        ending = a.post("/api/todos", json={"title": "ends soon", "todo_date": "2026-07-06",
                                             "recurrence_rule": "daily", "recurrence_end_date": "2026-07-06"}).json()
        self.assertEqual(a.post(f"/api/todos/{ending['id']}/skip-recurrence").status_code, 422)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_skip_task_recurrence_advances_dates_without_completing_or_spawning(self, *_):
        a = self.client(self.token_a)
        task = a.post("/api/tasks", json={"title": "water ferns", "start_date": "2026-07-06",
                                           "due_date": "2026-07-06", "recurrence_rule": "daily"}).json()
        skipped = a.post(f"/api/tasks/{task['id']}/skip-recurrence").json()
        self.assertEqual(skipped["id"], task["id"])
        self.assertEqual(skipped["start_date"], "2026-07-07")
        self.assertEqual(skipped["due_date"], "2026-07-07")
        self.assertNotEqual(skipped["status"], "done")
        siblings = [t for t in a.get("/api/tasks").json() if t["title"] == "water ferns"]
        self.assertEqual(len(siblings), 1)
        skipped_again = a.post(f"/api/tasks/{task['id']}/skip-recurrence").json()
        self.assertEqual(skipped_again["due_date"], "2026-07-08")

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_skip_task_recurrence_rejects_non_recurring_done_or_past_end_date(self, *_):
        a = self.client(self.token_a)
        plain = a.post("/api/tasks", json={"title": "one-off", "due_date": "2026-07-06"}).json()
        self.assertEqual(a.post(f"/api/tasks/{plain['id']}/skip-recurrence").status_code, 422)
        ending = a.post("/api/tasks", json={"title": "ends soon", "due_date": "2026-07-06",
                                             "recurrence_rule": "daily", "recurrence_end_date": "2026-07-06"}).json()
        self.assertEqual(a.post(f"/api/tasks/{ending['id']}/skip-recurrence").status_code, 422)
        done = a.post("/api/tasks", json={"title": "done task", "due_date": "2026-07-06",
                                           "recurrence_rule": "daily", "status": "done", "progress": 100}).json()
        self.assertEqual(a.post(f"/api/tasks/{done['id']}/skip-recurrence").status_code, 422)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_task_series_links_completed_occurrences_to_the_newly_spawned_one(self, *_):
        a = self.client(self.token_a)
        task = a.post("/api/tasks", json={"title": "series check review", "start_date": "2026-07-06",
                                           "due_date": "2026-07-06", "recurrence_rule": "weekly"}).json()
        self.assertEqual(a.get(f"/api/tasks/{task['id']}/series").json()["items"], [
            {"id": task["id"], "title": "series check review", "start_date": "2026-07-06", "due_date": "2026-07-06", "status": "todo", "progress": 0}])
        a.patch(f"/api/tasks/{task['id']}", json={"status": "done", "progress": 100})
        next_task = next(t for t in a.get("/api/tasks").json() if t["id"] != task["id"] and t["title"] == "series check review")
        series = a.get(f"/api/tasks/{next_task['id']}/series").json()["items"]
        self.assertEqual([item["id"] for item in series], [task["id"], next_task["id"]])
        self.assertEqual(a.get(f"/api/tasks/{task['id']}/series").json()["items"], series)

    def test_task_series_rejects_missing_or_other_users_task(self, *_):
        a, b = self.client(self.token_a), self.client(self.token_b)
        task = a.post("/api/tasks", json={"title": "solo"}).json()
        self.assertEqual(a.get("/api/tasks/999999/series").status_code, 404)
        self.assertEqual(b.get(f"/api/tasks/{task['id']}/series").status_code, 404)

    def test_task_series_update_applies_to_future_occurrences_only(self):
        from app.db import connection
        b, a = self.client(self.token_b), self.client(self.token_a)
        group_id = "task-rec-test-group-1"
        occurrences = []
        for day in ("2026-09-01", "2026-09-08", "2026-09-15"):
            created = b.post("/api/tasks", json={"title": "주간 보고", "due_date": day})
            self.assertEqual(created.status_code, 200, created.text)
            occurrences.append(created.json())
        past = b.post("/api/tasks", json={"title": "지난 보고", "due_date": "2026-08-25"})
        self.assertEqual(past.status_code, 200, past.text)
        with connection() as c:
            c.execute("UPDATE tasks SET recurrence_group_id=? WHERE id IN (?,?,?,?)",
                       (group_id, *[o["id"] for o in occurrences], past.json()["id"]))
        other_user_conflict = a.patch(f"/api/tasks/series/{group_id}?from_date=2026-09-01", json={"title": "몰래 변경"})
        self.assertEqual(other_user_conflict.status_code, 404)
        response = b.patch(f"/api/tasks/series/{group_id}?from_date=2026-09-01", json={"title": "주간 보고 (변경)", "priority": "high", "due_date": "1999-01-01"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["updated"], 3)
        for occurrence in occurrences:
            refreshed = b.get("/api/tasks").json()
            match = next(t for t in refreshed if t["id"] == occurrence["id"])
            self.assertEqual(match["title"], "주간 보고 (변경)")
            self.assertEqual(match["priority"], "high")
            self.assertEqual(match["due_date"], occurrence["due_date"])
        untouched = next(t for t in b.get("/api/tasks").json() if t["id"] == past.json()["id"])
        self.assertEqual(untouched["title"], "지난 보고")
        no_op = b.patch(f"/api/tasks/series/{group_id}?from_date=2026-09-01", json={"due_date": "1999-01-01"})
        self.assertEqual(no_op.status_code, 422)
        missing_group = b.patch("/api/tasks/series/does-not-exist?from_date=2026-09-01", json={"title": "x"})
        self.assertEqual(missing_group.status_code, 404)

    def test_task_series_delete_removes_only_future_occurrences(self):
        from app.db import connection
        b, a = self.client(self.token_b), self.client(self.token_a)
        group_id = "task-rec-test-group-2"
        occurrences = []
        for day in ("2026-09-01", "2026-09-08", "2026-09-15"):
            created = b.post("/api/tasks", json={"title": "주간 보고", "due_date": day})
            self.assertEqual(created.status_code, 200, created.text)
            occurrences.append(created.json())
        past = b.post("/api/tasks", json={"title": "지난 보고", "due_date": "2026-08-25"})
        self.assertEqual(past.status_code, 200, past.text)
        child = b.post("/api/tasks", json={"title": "하위 업무", "parent_id": occurrences[0]["id"]})
        self.assertEqual(child.status_code, 200, child.text)
        with connection() as c:
            c.execute("UPDATE tasks SET recurrence_group_id=? WHERE id IN (?,?,?,?)",
                       (group_id, *[o["id"] for o in occurrences], past.json()["id"]))
        other_user_denied = a.delete(f"/api/tasks/series/{group_id}?from_date=2026-09-01")
        self.assertEqual(other_user_denied.status_code, 404)
        response = b.delete(f"/api/tasks/series/{group_id}?from_date=2026-09-01")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["deleted"], 3)
        for occurrence in occurrences:
            self.assertEqual(b.get(f"/api/tasks/{occurrence['id']}").status_code, 404)
        untouched = b.get(f"/api/tasks/{past.json()['id']}")
        self.assertEqual(untouched.status_code, 200, untouched.text)
        promoted = b.get(f"/api/tasks/{child.json()['id']}")
        self.assertEqual(promoted.status_code, 200, promoted.text)
        self.assertIsNone(promoted.json()["parent_id"])
        missing_group = b.delete("/api/tasks/series/does-not-exist?from_date=2026-09-01")
        self.assertEqual(missing_group.status_code, 404)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_todo_series_links_completed_occurrences_to_the_newly_spawned_one(self, *_):
        a = self.client(self.token_a)
        todo = a.post("/api/todos", json={"title": "series check ferns", "todo_date": "2026-07-06", "recurrence_rule": "daily"}).json()
        self.assertEqual(a.get(f"/api/todos/{todo['id']}/series").json()["items"], [
            {"id": todo["id"], "title": "series check ferns", "todo_date": "2026-07-06", "completed": False}])
        a.patch(f"/api/todos/{todo['id']}", json={"completed": True})
        next_todo = next(t for t in a.get("/api/todos").json() if t["id"] != todo["id"] and t["title"] == "series check ferns")
        series = a.get(f"/api/todos/{next_todo['id']}/series").json()["items"]
        self.assertEqual([item["id"] for item in series], [todo["id"], next_todo["id"]])
        self.assertEqual(a.get(f"/api/todos/{todo['id']}/series").json()["items"], series)

    def test_todo_series_update_applies_to_future_occurrences_only(self):
        from app.db import connection
        b, a = self.client(self.token_b), self.client(self.token_a)
        group_id = "todo-rec-test-group-1"
        occurrences = []
        for day in ("2026-09-01", "2026-09-08", "2026-09-15"):
            created = b.post("/api/todos", json={"title": "주간 정리", "todo_date": day})
            self.assertEqual(created.status_code, 200, created.text)
            occurrences.append(created.json())
        past = b.post("/api/todos", json={"title": "지난 정리", "todo_date": "2026-08-25"})
        self.assertEqual(past.status_code, 200, past.text)
        with connection() as c:
            c.execute("UPDATE todos SET recurrence_group_id=? WHERE id IN (?,?,?,?)",
                       (group_id, *[o["id"] for o in occurrences], past.json()["id"]))
        other_user_conflict = a.patch(f"/api/todos/series/{group_id}?from_todo_date=2026-09-01", json={"title": "몰래 변경"})
        self.assertEqual(other_user_conflict.status_code, 404)
        response = b.patch(f"/api/todos/series/{group_id}?from_todo_date=2026-09-01", json={"title": "주간 정리 (변경)", "memo": "새 메모", "todo_date": "1999-01-01"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["updated"], 3)
        for occurrence in occurrences:
            refreshed = b.get("/api/todos").json()
            match = next(t for t in refreshed if t["id"] == occurrence["id"])
            self.assertEqual(match["title"], "주간 정리 (변경)")
            self.assertEqual(match["memo"], "새 메모")
            self.assertEqual(match["todo_date"], occurrence["todo_date"])
        untouched = next(t for t in b.get("/api/todos").json() if t["id"] == past.json()["id"])
        self.assertEqual(untouched["title"], "지난 정리")
        no_op = b.patch(f"/api/todos/series/{group_id}?from_todo_date=2026-09-01", json={"todo_date": "1999-01-01"})
        self.assertEqual(no_op.status_code, 422)
        missing_group = b.patch("/api/todos/series/does-not-exist?from_todo_date=2026-09-01", json={"title": "x"})
        self.assertEqual(missing_group.status_code, 404)

    def test_todo_series_delete_removes_only_future_occurrences(self):
        from app.db import connection
        b, a = self.client(self.token_b), self.client(self.token_a)
        group_id = "todo-rec-test-group-2"
        occurrences = []
        for day in ("2026-09-01", "2026-09-08", "2026-09-15"):
            created = b.post("/api/todos", json={"title": "주간 정리", "todo_date": day})
            self.assertEqual(created.status_code, 200, created.text)
            occurrences.append(created.json())
        past = b.post("/api/todos", json={"title": "지난 정리", "todo_date": "2026-08-25"})
        self.assertEqual(past.status_code, 200, past.text)
        with connection() as c:
            c.execute("UPDATE todos SET recurrence_group_id=? WHERE id IN (?,?,?,?)",
                       (group_id, *[o["id"] for o in occurrences], past.json()["id"]))
        other_user_denied = a.delete(f"/api/todos/series/{group_id}?from_todo_date=2026-09-01")
        self.assertEqual(other_user_denied.status_code, 404)
        response = b.delete(f"/api/todos/series/{group_id}?from_todo_date=2026-09-01")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["deleted"], 3)
        for occurrence in occurrences:
            self.assertEqual(b.get(f"/api/todos/{occurrence['id']}").status_code, 404)
        untouched = b.get(f"/api/todos/{past.json()['id']}")
        self.assertEqual(untouched.status_code, 200, untouched.text)
        missing_group = b.delete("/api/todos/series/does-not-exist?from_todo_date=2026-09-01")
        self.assertEqual(missing_group.status_code, 404)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_archive_task_hides_from_list_and_unarchive_restores_it(self, *_):
        a = self.client(self.token_a)
        task = a.post("/api/tasks", json={"title": "stale project"}).json()
        archived = a.post(f"/api/tasks/{task['id']}/archive").json()
        self.assertIsNotNone(archived["archived_at"])
        self.assertNotIn(task["id"], [t["id"] for t in a.get("/api/tasks").json()])
        self.assertIn(task["id"], [t["id"] for t in a.get("/api/tasks/archived").json()])
        self.assertEqual(a.post(f"/api/tasks/{task['id']}/archive").status_code, 404)
        unarchived = a.post(f"/api/tasks/{task['id']}/unarchive").json()
        self.assertIsNone(unarchived["archived_at"])
        self.assertIn(task["id"], [t["id"] for t in a.get("/api/tasks").json()])
        self.assertNotIn(task["id"], [t["id"] for t in a.get("/api/tasks/archived").json()])
        self.assertEqual(a.post(f"/api/tasks/{task['id']}/unarchive").status_code, 404)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_archived_tasks_list_supports_limit_and_offset(self, *_):
        a = self.client(self.token_a)
        before = len(a.get("/api/tasks/archived").json())
        ids = []
        for i in range(3):
            task = a.post("/api/tasks", json={"title": f"stale project {i}"}).json()
            a.post(f"/api/tasks/{task['id']}/archive")
            ids.append(task["id"])
        full = a.get("/api/tasks/archived").json()
        self.assertEqual(len(full), before + 3)
        new_ordered = [t["id"] for t in full if t["id"] in ids]
        page1 = a.get(f"/api/tasks/archived?limit={before + 2}&offset=0").json()
        page2 = a.get(f"/api/tasks/archived?limit={before + 2}&offset={before + 2}").json()
        combined_new = [t["id"] for t in page1 + page2 if t["id"] in ids]
        self.assertEqual(combined_new, new_ordered)
        self.assertLessEqual(len(page1), before + 2)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_archive_todo_hides_from_list_and_unarchive_restores_it(self, *_):
        a = self.client(self.token_a)
        todo = a.post("/api/todos", json={"title": "stale idea"}).json()
        archived = a.post(f"/api/todos/{todo['id']}/archive").json()
        self.assertIsNotNone(archived["archived_at"])
        self.assertNotIn(todo["id"], [t["id"] for t in a.get("/api/todos").json()])
        self.assertIn(todo["id"], [t["id"] for t in a.get("/api/todos/archived").json()])
        self.assertEqual(a.post(f"/api/todos/{todo['id']}/archive").status_code, 404)
        unarchived = a.post(f"/api/todos/{todo['id']}/unarchive").json()
        self.assertIsNone(unarchived["archived_at"])
        self.assertIn(todo["id"], [t["id"] for t in a.get("/api/todos").json()])
        self.assertNotIn(todo["id"], [t["id"] for t in a.get("/api/todos/archived").json()])
        self.assertEqual(a.post(f"/api/todos/{todo['id']}/unarchive").status_code, 404)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_archive_event_hides_from_list_and_unarchive_restores_it(self, *_):
        a = self.client(self.token_a)
        event = a.post("/api/events", json={"title": "stale event", "start_at": "2026-07-06T12:00:00", "end_at": "2026-07-06T13:00:00"}).json()
        archived = a.post(f"/api/events/{event['id']}/archive").json()
        self.assertIsNotNone(archived["archived_at"])
        self.assertNotIn(event["id"], [e["id"] for e in a.get("/api/events").json()])
        self.assertIn(event["id"], [e["id"] for e in a.get("/api/events/archived").json()])
        self.assertEqual(a.post(f"/api/events/{event['id']}/archive").status_code, 404)
        unarchived = a.post(f"/api/events/{event['id']}/unarchive").json()
        self.assertIsNone(unarchived["archived_at"])
        self.assertIn(event["id"], [e["id"] for e in a.get("/api/events").json()])
        self.assertNotIn(event["id"], [e["id"] for e in a.get("/api/events/archived").json()])
        self.assertEqual(a.post(f"/api/events/{event['id']}/unarchive").status_code, 404)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_archive_work_log_hides_from_list_and_unarchive_restores_it(self, *_):
        a = self.client(self.token_a)
        log = a.post("/api/work_logs", json={"content": "stale log"}).json()
        archived = a.post(f"/api/work_logs/{log['id']}/archive").json()
        self.assertIsNotNone(archived["archived_at"])
        self.assertNotIn(log["id"], [l["id"] for l in a.get("/api/work_logs").json()])
        self.assertIn(log["id"], [l["id"] for l in a.get("/api/work_logs/archived").json()])
        self.assertEqual(a.post(f"/api/work_logs/{log['id']}/archive").status_code, 404)
        unarchived = a.post(f"/api/work_logs/{log['id']}/unarchive").json()
        self.assertIsNone(unarchived["archived_at"])
        self.assertIn(log["id"], [l["id"] for l in a.get("/api/work_logs").json()])
        self.assertNotIn(log["id"], [l["id"] for l in a.get("/api/work_logs/archived").json()])
        self.assertEqual(a.post(f"/api/work_logs/{log['id']}/unarchive").status_code, 404)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_archived_items_are_excluded_from_today_endpoint(self, *_):
        from datetime import date
        a = self.client(self.token_a)
        today = date.today().isoformat()
        task = a.post("/api/tasks", json={"title": "archived today task", "due_date": today}).json()
        todo = a.post("/api/todos", json={"title": "archived today todo", "todo_date": today}).json()
        event = a.post("/api/events", json={"title": "archived today event",
                                             "start_at": f"{today}T09:00:00", "end_at": f"{today}T10:00:00"}).json()
        log = a.post("/api/work_logs", json={"content": "archived today log", "log_date": today}).json()
        before = a.get("/api/today").json()
        self.assertIn(task["id"], [t["id"] for t in before["tasks"]])
        self.assertIn(todo["id"], [t["id"] for t in before["todos"]])
        self.assertIn(event["id"], [e["id"] for e in before["events"]])
        self.assertIn(log["id"], [l["id"] for l in before["work_logs"]])
        a.post(f"/api/tasks/{task['id']}/archive")
        a.post(f"/api/todos/{todo['id']}/archive")
        a.post(f"/api/events/{event['id']}/archive")
        a.post(f"/api/work_logs/{log['id']}/archive")
        after = a.get("/api/today").json()
        self.assertNotIn(task["id"], [t["id"] for t in after["tasks"]])
        self.assertNotIn(todo["id"], [t["id"] for t in after["todos"]])
        self.assertNotIn(event["id"], [e["id"] for e in after["events"]])
        self.assertNotIn(log["id"], [l["id"] for l in after["work_logs"]])

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_todo_priority_defaults_and_carries_to_recurrence_spawn(self, *_):
        a = self.client(self.token_a)
        default_todo = a.post("/api/todos", json={"title": "default priority"}).json()
        self.assertEqual(default_todo["priority"], "normal")
        high = a.post("/api/todos", json={"title": "water plants", "todo_date": "2026-07-06", "recurrence_rule": "daily", "priority": "high"}).json()
        self.assertEqual(high["priority"], "high")
        completed = a.patch(f"/api/todos/{high['id']}", json={"completed": True}).json()
        spawned = next(t for t in a.get("/api/todos").json() if t["id"] == completed["next_recurrence_id"])
        self.assertEqual(spawned["priority"], "high")
        lowered = a.patch(f"/api/todos/{high['id']}", json={"priority": "low"}).json()
        self.assertEqual(lowered["priority"], "low")

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_todo_link_url_is_persisted_validated_and_carries_to_recurrence_spawn(self, *_):
        a = self.client(self.token_a)
        todo = a.post("/api/todos", json={"title": "with link", "todo_date": "2026-07-06", "recurrence_rule": "daily", "link_url": "https://example.com/doc"})
        self.assertEqual(todo.status_code, 200, todo.text)
        self.assertEqual(todo.json()["link_url"], "https://example.com/doc")
        completed = a.patch(f"/api/todos/{todo.json()['id']}", json={"completed": True}).json()
        spawned = next(t for t in a.get("/api/todos").json() if t["id"] == completed["next_recurrence_id"])
        self.assertEqual(spawned["link_url"], "https://example.com/doc")
        cleared = a.patch(f"/api/todos/{todo.json()['id']}", json={"link_url": ""})
        self.assertEqual(cleared.status_code, 200, cleared.text)
        self.assertIsNone(cleared.json()["link_url"])
        self.assertEqual(a.post("/api/todos", json={"title": "bad link", "link_url": "not-a-url"}).status_code, 422)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_todo_links_are_persisted_and_invalid_urls_dropped(self, *_):
        a = self.client(self.token_a)
        todo = a.post("/api/todos", json={"title": "with links", "todo_date": "2026-07-06", "links": [
            {"id": "1", "url": "https://example.com/doc", "label": " 참고 문서 "},
            {"id": "2", "url": "not-a-url", "label": "bad"},
        ]})
        self.assertEqual(todo.status_code, 200, todo.text)
        links = todo.json()["links"]
        self.assertEqual(len(links), 1)
        self.assertEqual(links[0]["url"], "https://example.com/doc")
        self.assertEqual(links[0]["label"], "참고 문서")
        todo_id = todo.json()["id"]
        updated = a.patch(f"/api/todos/{todo_id}", json={"links": []})
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["links"], [])

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_todo_checklist_is_persisted_and_sanitized(self, *_):
        a = self.client(self.token_a)
        todo = a.post("/api/todos", json={"title": "with checklist", "todo_date": "2026-07-06", "checklist": [
            {"id": "1", "text": " 우유 사기 ", "done": False},
            {"id": "2", "text": "", "done": True},
        ]})
        self.assertEqual(todo.status_code, 200, todo.text)
        checklist = todo.json()["checklist"]
        self.assertEqual(len(checklist), 1)
        self.assertEqual(checklist[0]["text"], "우유 사기")
        self.assertFalse(checklist[0]["done"])
        todo_id = todo.json()["id"]
        checked = a.patch(f"/api/todos/{todo_id}", json={"checklist": [{"id": checklist[0]["id"], "text": "우유 사기", "done": True}]})
        self.assertEqual(checked.status_code, 200, checked.text)
        self.assertTrue(checked.json()["checklist"][0]["done"])

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_work_log_checklist_is_persisted_and_sanitized(self, *_):
        a = self.client(self.token_a)
        log = a.post("/api/work_logs", json={"content": "with checklist", "checklist": [
            {"id": "1", "text": " 코드리뷰 ", "done": False},
            {"id": "2", "text": "", "done": True},
        ]})
        self.assertEqual(log.status_code, 200, log.text)
        checklist = log.json()["checklist"]
        self.assertEqual(len(checklist), 1)
        self.assertEqual(checklist[0]["text"], "코드리뷰")
        self.assertFalse(checklist[0]["done"])
        log_id = log.json()["id"]
        checked = a.patch(f"/api/work_logs/{log_id}", json={"checklist": [{"id": checklist[0]["id"], "text": "코드리뷰", "done": True}]})
        self.assertEqual(checked.status_code, 200, checked.text)
        self.assertTrue(checked.json()["checklist"][0]["done"])

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_completing_monthly_todo_spawns_next_month_occurrence(self, *_):
        a = self.client(self.token_a)
        todo = a.post("/api/todos", json={"title": "monthly report", "todo_date": "2026-07-15", "recurrence_rule": "monthly"}).json()
        completed = a.patch(f"/api/todos/{todo['id']}", json={"completed": True}).json()
        self.assertIn("next_recurrence_id", completed)
        spawned = next(t for t in a.get("/api/todos").json() if t["id"] == completed["next_recurrence_id"])
        self.assertEqual(spawned["todo_date"], "2026-08-15")
        self.assertEqual(spawned["recurrence_rule"], "monthly")

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_month_end_monthly_todo_returns_to_month_end(self, *_):
        a = self.client(self.token_a)
        todo = a.post("/api/todos", json={"title": "month end todo", "todo_date": "2027-01-31", "recurrence_rule": "monthly"}).json()
        feb = a.patch(f"/api/todos/{todo['id']}", json={"completed": True}).json()
        feb_todo = a.get("/api/todos").json()
        spawned = next(t for t in feb_todo if t["id"] == feb["next_recurrence_id"])
        self.assertEqual(spawned["todo_date"], "2027-02-28")

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_todo_memo_is_persisted_and_carries_to_recurrence_spawn(self, *_):
        a = self.client(self.token_a)
        todo = a.post("/api/todos", json={"title": "with memo", "todo_date": "2026-07-06", "recurrence_rule": "daily", "memo": "3층 회의실 참고"})
        self.assertEqual(todo.status_code, 200, todo.text)
        self.assertEqual(todo.json()["memo"], "3층 회의실 참고")
        completed = a.patch(f"/api/todos/{todo.json()['id']}", json={"completed": True}).json()
        spawned = next(t for t in a.get("/api/todos").json() if t["id"] == completed["next_recurrence_id"])
        self.assertEqual(spawned["memo"], "3층 회의실 참고")
        cleared = a.patch(f"/api/todos/{todo.json()['id']}", json={"memo": ""})
        self.assertEqual(cleared.status_code, 200, cleared.text)
        self.assertIsNone(cleared.json()["memo"])

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_todo_color_is_persisted_and_validated(self, *_):
        a = self.client(self.token_a)
        todo = a.post("/api/todos", json={"title": "colored todo", "todo_date": "2026-07-06", "color": "purple"})
        self.assertEqual(todo.status_code, 200, todo.text)
        self.assertEqual(todo.json()["color"], "purple")
        cleared = a.patch(f"/api/todos/{todo.json()['id']}", json={"color": ""})
        self.assertEqual(cleared.status_code, 200, cleared.text)
        self.assertIsNone(cleared.json()["color"])
        self.assertEqual(a.post("/api/todos", json={"title": "bad color", "todo_date": "2026-07-06", "color": "not-a-color"}).status_code, 422)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_todo_time_is_persisted_validated_and_carries_to_recurrence_spawn(self, *_):
        a = self.client(self.token_a)
        todo = a.post("/api/todos", json={"title": "timed todo", "todo_date": "2026-07-06", "recurrence_rule": "daily", "todo_time": "14:30"})
        self.assertEqual(todo.status_code, 200, todo.text)
        self.assertEqual(todo.json()["todo_time"], "14:30")
        completed = a.patch(f"/api/todos/{todo.json()['id']}", json={"completed": True}).json()
        spawned = next(t for t in a.get("/api/todos").json() if t["id"] == completed["next_recurrence_id"])
        self.assertEqual(spawned["todo_time"], "14:30")
        cleared = a.patch(f"/api/todos/{todo.json()['id']}", json={"todo_time": ""})
        self.assertEqual(cleared.status_code, 200, cleared.text)
        self.assertIsNone(cleared.json()["todo_time"])
        self.assertEqual(a.post("/api/todos", json={"title": "bad time", "todo_date": "2026-07-06", "todo_time": "25:99"}).status_code, 422)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_todo_estimated_minutes_is_persisted_validated_and_carries_to_recurrence_spawn(self, *_):
        a = self.client(self.token_a)
        todo = a.post("/api/todos", json={"title": "estimated todo", "todo_date": "2026-07-06", "recurrence_rule": "daily", "estimated_minutes": 45})
        self.assertEqual(todo.status_code, 200, todo.text)
        self.assertEqual(todo.json()["estimated_minutes"], 45)
        completed = a.patch(f"/api/todos/{todo.json()['id']}", json={"completed": True}).json()
        spawned = next(t for t in a.get("/api/todos").json() if t["id"] == completed["next_recurrence_id"])
        self.assertEqual(spawned["estimated_minutes"], 45)
        cleared = a.patch(f"/api/todos/{todo.json()['id']}", json={"estimated_minutes": ""})
        self.assertEqual(cleared.status_code, 200, cleared.text)
        self.assertIsNone(cleared.json()["estimated_minutes"])
        self.assertEqual(a.post("/api/todos", json={"title": "bad estimate", "todo_date": "2026-07-06", "estimated_minutes": -5}).status_code, 422)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_recurring_todo_spawn_carries_color_links_and_resets_checklist(self, *_):
        a = self.client(self.token_a)
        todo = a.post("/api/todos", json={
            "title": "recurring todo", "todo_date": "2026-07-06", "recurrence_rule": "daily",
            "color": "green", "links": [{"url": "https://example.com/doc", "label": "doc"}],
            "checklist": [{"text": "step one", "done": True}],
        }).json()
        completed = a.patch(f"/api/todos/{todo['id']}", json={"completed": True}).json()
        spawned = next(t for t in a.get("/api/todos").json() if t["id"] == completed["next_recurrence_id"])
        self.assertEqual(spawned["color"], "green")
        self.assertEqual(len(spawned["links"]), 1)
        self.assertEqual(spawned["links"][0]["url"], "https://example.com/doc")
        self.assertEqual(len(spawned["checklist"]), 1)
        self.assertFalse(spawned["checklist"][0]["done"])

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_approval_workflow_defaults_off_and_can_be_enabled_per_user(self, *_):
        a = self.client(self.token_a)
        personal_task = a.post("/api/tasks", json={"title": "personal mode task", "status": "done"}).json()
        self.assertEqual(personal_task["approval_status"], "none")
        self.assertEqual(a.get("/api/settings/workflow").json()["approval_workflow"], False)
        task_for_schedule_test = a.post("/api/tasks", json={"title": "schedule test", "due_date": "2026-07-10"}).json()
        self.assertEqual(task_for_schedule_test["schedule_approval_status"], "none")
        updated = a.patch(f"/api/tasks/{task_for_schedule_test['id']}", json={"due_date": "2026-07-15"}).json()
        self.assertEqual(updated["schedule_approval_status"], "none")
        updated_status = a.patch(f"/api/tasks/{personal_task['id']}", json={"status": "doing", "progress": 50}).json()
        self.assertEqual(updated_status["approval_status"], "none")
        self.assertEqual(updated_status["status"], "doing")
        enabled = a.put("/api/settings/workflow", json={"approval_workflow": True})
        self.assertEqual(enabled.status_code, 200, enabled.text)
        self.assertEqual(enabled.json()["approval_workflow"], True)
        self.assertEqual(a.get("/api/settings/workflow").json()["approval_workflow"], True)
        enabled_task = a.post("/api/tasks", json={"title": "enabled workflow task", "status": "done"}).json()
        self.assertEqual(enabled_task["approval_status"], "pending")

    def test_unhandled_exception_is_logged_and_visible_in_diagnostics(self):
        a = self.client(self.token_a)
        crashing_client = TestClient(self.app, raise_server_exceptions=False)
        crashing_client.cookies.set("wm_session", self.token_a)
        with patch("app.main.rows", side_effect=RuntimeError("boom-diagnostics")):
            response = crashing_client.get("/api/tasks")
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.json()["detail"], "Internal Server Error")
        errors = a.get("/api/diagnostics/errors?limit=5")
        self.assertEqual(errors.status_code, 200, errors.text)
        items = errors.json()["items"]
        self.assertTrue(any("boom-diagnostics" in item["summary"] and item["path"] == "/api/tasks" for item in items))

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_export_import_round_trip_preserves_hierarchy_and_links(self, *_):
        a = self.client(self.token_a)
        parent = a.post("/api/tasks", json={"title": "복원 부모", "status": "todo", "progress": 0}).json()
        child = a.post("/api/tasks", json={"title": "복원 자식", "status": "todo", "progress": 0,
                                           "parent_id": parent["id"], "dependency_ids": [parent["id"]]}).json()
        a.post("/api/events", json={"title": "복원 일정", "start_at": "2026-08-01T10:00:00", "end_at": "2026-08-01T11:00:00"})
        a.post("/api/todos", json={"title": "복원 할 일", "todo_date": "2026-08-01"})
        a.post("/api/work_logs", json={"content": "복원 기록", "log_date": "2026-08-01", "task_id": child["id"]})
        a.post(f"/api/tasks/{child['id']}/comments", json={"body": "복원 댓글"})
        a.post(f"/api/tasks/{child['id']}/attachments", files={"file": ("note.txt", b"backup me", "text/plain")})
        exported = a.get("/api/export").json()
        self.assertEqual(len(exported["task_comments"]), 1)
        self.assertEqual(len(exported["task_attachments"]), 1)

        preview = a.post("/api/import/preview", json=exported)
        self.assertEqual(preview.status_code, 200, preview.text)
        self.assertGreaterEqual(preview.json()["importable"]["tasks"], 2)
        self.assertEqual(preview.json()["importable"]["task_comments"], 1)

        result = a.post("/api/import", json={"mode": "replace", "data": exported})
        self.assertEqual(result.status_code, 200, result.text)
        self.assertGreaterEqual(result.json()["imported"]["tasks"], 2)
        self.assertEqual(result.json()["imported"]["task_comments"], 1)
        self.assertEqual(result.json()["imported"]["task_attachments"], 1)

        tasks = {t["title"]: t for t in a.get("/api/tasks").json()}
        restored_parent, restored_child = tasks["복원 부모"], tasks["복원 자식"]
        self.assertNotEqual(restored_parent["id"], parent["id"])  # replace re-created rows
        self.assertEqual(restored_child["parent_id"], restored_parent["id"])
        self.assertEqual(restored_child["dependency_ids"], [restored_parent["id"]])
        logs = a.get("/api/work_logs").json()
        self.assertEqual(logs[0]["task_id"], restored_child["id"])
        events = a.get("/api/events").json()
        self.assertEqual(events[0]["title"], "복원 일정")
        restored_comments = a.get(f"/api/tasks/{restored_child['id']}/comments").json()["items"]
        self.assertEqual(restored_comments[0]["body"], "복원 댓글")
        restored_attachments = a.get(f"/api/tasks/{restored_child['id']}/attachments").json()["items"]
        self.assertEqual(restored_attachments[0]["filename"], "note.txt")

        merged = a.post("/api/import", json={"mode": "merge", "data": exported})
        self.assertEqual(merged.status_code, 200, merged.text)
        self.assertEqual(len([t for t in a.get("/api/tasks").json() if t["title"] == "복원 부모"]), 2)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_tag_usage_and_bulk_rename_across_tables(self, *_):
        b = self.client(self.token_b)
        b.post("/api/tasks", json={"title": "태그 업무", "status": "todo", "progress": 0, "tags": ["보고", "긴급"]})
        b.post("/api/todos", json={"title": "태그 할 일", "todo_date": "2026-08-01", "tags": ["보고"]})
        b.post("/api/work_logs", json={"content": "태그 기록", "log_date": "2026-08-01", "tags": ["보고", "회의"]})

        usage = b.get("/api/tags").json()["items"]
        top = usage[0]
        self.assertEqual(top["tag"], "보고")
        self.assertEqual(top["total"], 3)
        self.assertEqual(top["tables"]["tasks"], 1)

        renamed = b.post("/api/tags/rename", json={"from": "보고", "to": "주간보고"}).json()
        self.assertEqual(renamed["changed"], 3)
        tags_now = {item["tag"] for item in b.get("/api/tags").json()["items"]}
        self.assertIn("주간보고", tags_now)
        self.assertNotIn("보고", tags_now)

        # merging into an existing tag deduplicates instead of doubling
        b.post("/api/tags/rename", json={"from": "긴급", "to": "회의"})
        task_tags = b.get("/api/tasks").json()[-1]["tags"]
        self.assertEqual(task_tags.count("회의"), 1)

        # empty target removes the tag entirely
        removed = b.post("/api/tags/rename", json={"from": "회의", "to": ""}).json()
        self.assertGreaterEqual(removed["changed"], 1)
        self.assertNotIn("회의", {item["tag"] for item in b.get("/api/tags").json()["items"]})
        self.assertEqual(b.post("/api/tags/rename", json={"to": "x"}).status_code, 422)

    def test_tag_color_set_get_and_clear(self, *_):
        b = self.client(self.token_b)
        b.post("/api/tasks", json={"title": "색상 태그 업무", "status": "todo", "progress": 0, "tags": ["긴급색"]})

        set_resp = b.put("/api/tags/color", json={"tag": "긴급색", "color": "#ff0000"})
        self.assertEqual(set_resp.status_code, 200)
        self.assertEqual(set_resp.json()["color"], "#ff0000")

        usage = {item["tag"]: item for item in b.get("/api/tags").json()["items"]}
        self.assertEqual(usage["긴급색"]["color"], "#ff0000")

        self.assertEqual(b.put("/api/tags/color", json={"tag": "긴급색", "color": "not-a-color"}).status_code, 422)
        self.assertEqual(b.put("/api/tags/color", json={"color": "#ff0000"}).status_code, 422)

        clear_resp = b.put("/api/tags/color", json={"tag": "긴급색", "color": None})
        self.assertIsNone(clear_resp.json()["color"])
        usage_after = {item["tag"]: item for item in b.get("/api/tags").json()["items"]}
        self.assertIsNone(usage_after["긴급색"]["color"])

    def test_import_rejects_unknown_version_and_bad_mode(self):
        a = self.client(self.token_a)
        self.assertEqual(a.post("/api/import/preview", json={"version": 2}).status_code, 422)
        self.assertEqual(a.post("/api/import", json={"mode": "wipe", "data": {"version": 1}}).status_code, 422)
        bad = a.post("/api/import", json={"mode": "merge", "data": {"version": 1, "tasks": [{"title": ""}]}})
        self.assertEqual(bad.status_code, 422)

    def test_wipe_requires_confirmation_and_deletes_only_own_data(self):
        a, b = self.client(self.token_a), self.client(self.token_b)
        task = a.post("/api/tasks", json={"title": "지울 업무", "status": "todo", "progress": 0}).json()
        a.post(f"/api/tasks/{task['id']}/comments", json={"body": "지울 댓글"})
        a.post("/api/events", json={"title": "지울 일정", "start_at": "2026-08-01T10:00:00", "end_at": "2026-08-01T11:00:00"})
        a.post("/api/todos", json={"title": "지울 할 일", "todo_date": "2026-08-01"})
        a.post("/api/work_logs", json={"content": "지울 기록", "log_date": "2026-08-01"})
        other_task = b.post("/api/tasks", json={"title": "다른 사용자 업무", "status": "todo", "progress": 0}).json()

        self.assertEqual(a.post("/api/data/wipe", json={}).status_code, 422)
        self.assertEqual(a.post("/api/data/wipe", json={"confirm": "delete"}).status_code, 422)

        result = a.post("/api/data/wipe", json={"confirm": "DELETE"})
        self.assertEqual(result.status_code, 200, result.text)
        deleted = result.json()["deleted"]
        self.assertGreaterEqual(deleted["tasks"], 1)
        self.assertGreaterEqual(deleted["events"], 1)
        self.assertGreaterEqual(deleted["todos"], 1)
        self.assertGreaterEqual(deleted["work_logs"], 1)

        self.assertEqual(a.get("/api/tasks").json(), [])
        self.assertEqual(a.get("/api/events").json(), [])
        self.assertEqual(a.get("/api/todos").json(), [])
        self.assertEqual(a.get("/api/work_logs").json(), [])
        self.assertEqual(a.get(f"/api/tasks/{task['id']}/comments").status_code, 404)  # cascaded away with the task
        self.assertEqual(a.get("/api/export").json()["task_comments"], [])
        # other users' data is untouched
        self.assertIn(other_task["id"], {t["id"] for t in b.get("/api/tasks").json()})

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_calendar_feed_rotate_serves_ics_and_old_token_is_invalidated(self, *_):
        a, b = self.client(self.token_a), self.client(self.token_b)
        self.assertEqual(a.get("/api/settings/calendar-feed").json(), {"enabled": False})
        a.post("/api/tasks", json={"title": "feed task", "due_date": "2026-07-20"})
        a.post("/api/events", json={"title": "feed event", "start_at": "2026-07-21T10:00:00",
                                    "end_at": "2026-07-21T11:00:00"})
        a.post("/api/todos", json={"title": "feed todo", "todo_date": "2026-07-22"})
        first = a.post("/api/settings/calendar-feed/rotate")
        self.assertEqual(first.status_code, 200, first.text)
        first_url = first.json()["feed_url"]
        self.assertTrue(first_url.startswith("http"))
        self.assertEqual(a.get("/api/settings/calendar-feed").json(), {"enabled": True})
        path = "/" + first_url.split("/", 3)[3]
        feed = TestClient(self.app).get(path)
        self.assertEqual(feed.status_code, 200, feed.text)
        self.assertIn("text/calendar", feed.headers["content-type"])
        self.assertIn("SUMMARY:feed event", feed.text)
        self.assertIn("SUMMARY:[업무] feed task", feed.text)
        self.assertIn("SUMMARY:[할 일] feed todo", feed.text)
        self.assertEqual(TestClient(self.app).get("/api/calendar-feed/not-a-real-token.ics").status_code, 404)
        second = a.post("/api/settings/calendar-feed/rotate").json()
        self.assertNotEqual(second["feed_url"], first_url)
        self.assertEqual(TestClient(self.app).get(path).status_code, 404)
        self.assertEqual(b.get("/api/settings/calendar-feed").json(), {"enabled": False})
        self.assertEqual(a.delete("/api/settings/calendar-feed").json(), {"enabled": False})
        second_path = "/" + second["feed_url"].split("/", 3)[3]
        self.assertEqual(TestClient(self.app).get(second_path).status_code, 404)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_calendar_feed_includes_valarm_for_items_with_reminder_lead(self, *_):
        a = self.client(self.token_a)
        a.post("/api/tasks", json={"title": "reminded task", "due_date": "2026-07-20", "due_time": "09:00",
                                    "reminder_minutes_before": 30})
        a.post("/api/tasks", json={"title": "no-time task", "due_date": "2026-07-20", "reminder_minutes_before": 30})
        a.post("/api/events", json={"title": "reminded event", "start_at": "2026-07-21T10:00:00",
                                     "end_at": "2026-07-21T11:00:00", "reminder_minutes_before": 15})
        a.post("/api/todos", json={"title": "reminded todo", "todo_date": "2026-07-22", "todo_time": "08:00",
                                    "reminder_minutes_before": 5})
        feed_url = a.post("/api/settings/calendar-feed/rotate").json()["feed_url"]
        path = "/" + feed_url.split("/", 3)[3]
        text = TestClient(self.app).get(path).text
        self.assertIn("TRIGGER:-PT30M", text)
        self.assertIn("TRIGGER:-PT15M", text)
        self.assertIn("TRIGGER:-PT5M", text)
        # all-day task with no due_time has no meaningful alert moment, so no VALARM for it
        self.assertEqual(text.count("BEGIN:VALARM"), 3)
        a.delete("/api/settings/calendar-feed")

    @patch("app.main.google_calendar.selected_calendar", return_value="cal-1")
    @patch("app.main.google_calendar.token_status", return_value={"connected": True})
    def test_google_status_reports_last_sync_at(self, *_):
        from app.db import connection
        a = self.client(self.token_a)
        self.assertIsNone(a.get("/api/google/status").json()["last_sync_at"])
        with connection() as c:
            c.execute("INSERT INTO google_sync_state(user_id,calendar_id,sync_token,updated_at) VALUES(?,?,?,?)",
                      ("sub-a", "cal-1", "token-x", "2026-07-16T12:00:00+00:00"))
        self.assertEqual(a.get("/api/google/status").json()["last_sync_at"], "2026-07-16T12:00:00+00:00")


if __name__ == "__main__":
    unittest.main()
