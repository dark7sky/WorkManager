"""End-to-end smoke test: login bypassed via a directly-minted session token
(the same mechanism the app itself issues after Google OIDC), then a full
create/read/update/delete/restore round trip across every core entity type.
"""
import os
import tempfile
import unittest

from fastapi.testclient import TestClient

PAYLOADS = {
    "tasks": {"title": "Smoke task", "status": "todo", "priority": "normal", "progress": 0},
    "events": {"title": "Smoke event", "start_at": "2026-07-10T09:00:00", "end_at": "2026-07-10T10:00:00"},
    "todos": {"title": "Smoke todo", "todo_date": "2026-07-10"},
    "work_logs": {"content": "Smoke log entry", "log_date": "2026-07-10"},
}

PATCHES = {
    "tasks": {"title": "Smoke task (updated)", "progress": 50},
    "events": {"title": "Smoke event (updated)"},
    "todos": {"completed": True},
    "work_logs": {"content": "Smoke log entry (updated)"},
}


class SmokeE2ETests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        os.environ.update({"DATABASE_PATH": os.path.join(cls.temp.name, "smoke.db"),
                           "APP_SECRET": "test-secret-that-is-long-and-stable", "COOKIE_SECURE": "false",
                           "CODEX_ADMIN_TOKEN": "test-codex-admin-token"})
        from app.main import app
        from app.auth import create_session
        from app.db import connection, init_db
        init_db()
        with connection() as c:
            c.execute("INSERT INTO users(id,google_sub,email,display_name,created_at,updated_at) VALUES(?,?,?,?,?,?)",
                      ("sub-smoke", "sub-smoke", "smoke@example.com", "Smoke User", "2026-01-01", "2026-01-01"))
        cls.client = TestClient(app)
        cls.client.cookies.set("wm_session", create_session("sub-smoke"))

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def test_session_login_bypass_authenticates(self):
        response = self.client.get("/api/auth/me")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["user"]["email"], "smoke@example.com")

    def test_core_crud_round_trip_for_every_table(self):
        for table, payload in PAYLOADS.items():
            with self.subTest(table=table):
                created = self.client.post(f"/api/{table}", json=payload)
                self.assertEqual(created.status_code, 200, created.text)
                item_id = created.json()["id"]

                listed = self.client.get(f"/api/{table}")
                self.assertIn(item_id, [row["id"] for row in listed.json()])

                fetched = self.client.get(f"/api/{table}/{item_id}")
                self.assertEqual(fetched.status_code, 200)

                patched = self.client.patch(f"/api/{table}/{item_id}", json=PATCHES[table])
                self.assertEqual(patched.status_code, 200, patched.text)
                for key, value in PATCHES[table].items():
                    self.assertEqual(patched.json()[key], value)

                deleted = self.client.delete(f"/api/{table}/{item_id}")
                self.assertEqual(deleted.status_code, 200, deleted.text)
                self.assertEqual(self.client.get(f"/api/{table}/{item_id}").status_code, 404)

                trashed = self.client.get("/api/trash").json()[table]
                self.assertIn(item_id, [row["id"] for row in trashed])

                restored = self.client.post(f"/api/{table}/{item_id}/restore")
                self.assertEqual(restored.status_code, 200, restored.text)
                self.assertEqual(self.client.get(f"/api/{table}/{item_id}").status_code, 200)

    def test_audit_log_recorded_the_round_trip(self):
        created = self.client.post("/api/tasks", json={"title": "Audited task", "status": "todo", "progress": 0})
        item_id = created.json()["id"]
        self.client.patch(f"/api/tasks/{item_id}", json={"title": "Audited task (updated)"})
        self.client.delete(f"/api/tasks/{item_id}")
        self.client.post(f"/api/tasks/{item_id}/restore")

        actions = [row["action"] for row in self.client.get("/api/audit-logs").json()["items"]
                   if row["entity_type"] == "tasks" and row["entity_id"] == str(item_id)]
        for expected in ("create", "update", "delete", "restore"):
            self.assertIn(expected, actions)


if __name__ == "__main__":
    unittest.main()
