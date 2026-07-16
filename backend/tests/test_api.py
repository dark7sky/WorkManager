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
        exported = a.get("/api/export").json()

        preview = a.post("/api/import/preview", json=exported)
        self.assertEqual(preview.status_code, 200, preview.text)
        self.assertGreaterEqual(preview.json()["importable"]["tasks"], 2)

        result = a.post("/api/import", json={"mode": "replace", "data": exported})
        self.assertEqual(result.status_code, 200, result.text)
        self.assertGreaterEqual(result.json()["imported"]["tasks"], 2)

        tasks = {t["title"]: t for t in a.get("/api/tasks").json()}
        restored_parent, restored_child = tasks["복원 부모"], tasks["복원 자식"]
        self.assertNotEqual(restored_parent["id"], parent["id"])  # replace re-created rows
        self.assertEqual(restored_child["parent_id"], restored_parent["id"])
        self.assertEqual(restored_child["dependency_ids"], [restored_parent["id"]])
        logs = a.get("/api/work_logs").json()
        self.assertEqual(logs[0]["task_id"], restored_child["id"])
        events = a.get("/api/events").json()
        self.assertEqual(events[0]["title"], "복원 일정")

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

    def test_import_rejects_unknown_version_and_bad_mode(self):
        a = self.client(self.token_a)
        self.assertEqual(a.post("/api/import/preview", json={"version": 2}).status_code, 422)
        self.assertEqual(a.post("/api/import", json={"mode": "wipe", "data": {"version": 1}}).status_code, 422)
        bad = a.post("/api/import", json={"mode": "merge", "data": {"version": 1, "tasks": [{"title": ""}]}})
        self.assertEqual(bad.status_code, 422)

    @patch("app.main.google_calendar.selected_calendar", return_value=None)
    @patch("app.main.google_calendar.token_status", return_value={"connected": False})
    def test_calendar_feed_rotate_serves_ics_and_old_token_is_invalidated(self, *_):
        a, b = self.client(self.token_a), self.client(self.token_b)
        self.assertEqual(a.get("/api/settings/calendar-feed").json(), {"enabled": False})
        a.post("/api/tasks", json={"title": "feed task", "due_date": "2026-07-20"})
        a.post("/api/events", json={"title": "feed event", "start_at": "2026-07-21T10:00:00",
                                    "end_at": "2026-07-21T11:00:00"})
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
        self.assertEqual(TestClient(self.app).get("/api/calendar-feed/not-a-real-token.ics").status_code, 404)
        second = a.post("/api/settings/calendar-feed/rotate").json()
        self.assertNotEqual(second["feed_url"], first_url)
        self.assertEqual(TestClient(self.app).get(path).status_code, 404)
        self.assertEqual(b.get("/api/settings/calendar-feed").json(), {"enabled": False})
        self.assertEqual(a.delete("/api/settings/calendar-feed").json(), {"enabled": False})
        second_path = "/" + second["feed_url"].split("/", 3)[3]
        self.assertEqual(TestClient(self.app).get(second_path).status_code, 404)

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
