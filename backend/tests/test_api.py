import os
import tempfile
import unittest

from fastapi.testclient import TestClient


class ApiSmokeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        os.environ.update({
            "DATABASE_PATH": os.path.join(cls.temp.name, "test.db"),
            "APP_LOGIN_ID": "tester",
            "APP_LOGIN_PASSWORD": "strong-test-password",
            "APP_SECRET": "test-secret-that-is-long-and-stable",
            "COOKIE_SECURE": "false",
        })
        from app.main import app
        cls.client = TestClient(app)
        cls.client.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.client.__exit__(None, None, None)
        cls.temp.cleanup()

    def test_login_and_core_crud(self):
        response = self.client.post("/api/auth/login", json={"user_id": "tester", "password": "strong-test-password"})
        self.assertEqual(response.status_code, 200)
        created = self.client.post("/api/work_logs", json={"content": "상업용 QA 완료", "log_date": "2026-07-06"})
        self.assertEqual(created.status_code, 200)
        item_id = created.json()["id"]
        updated = self.client.patch(f"/api/work_logs/{item_id}", json={"content": "QA 수정 완료"})
        self.assertEqual(updated.json()["content"], "QA 수정 완료")
        self.assertEqual(self.client.delete(f"/api/work_logs/{item_id}").status_code, 200)

    def test_diagnostics_are_authenticated_and_secret_free(self):
        self.client.post("/api/auth/login", json={"user_id": "tester", "password": "strong-test-password"})
        ai_status = self.client.get("/api/ai/status")
        self.assertEqual(ai_status.status_code, 200)
        self.assertNotIn("API_KEY", ai_status.text)
        google_status = self.client.get("/api/google/status")
        self.assertEqual(google_status.status_code, 200)
        self.assertFalse(google_status.json()["connected"])


if __name__ == "__main__":
    unittest.main()
