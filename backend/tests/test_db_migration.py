import os
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from app.db import init_db, upsert_google_user


class LegacyMigrationTests(unittest.TestCase):
    def test_single_user_database_is_claimed_once(self):
        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, "legacy.db")
            c = sqlite3.connect(path)
            c.executescript("""
            CREATE TABLE tasks(id INTEGER PRIMARY KEY,title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'todo',priority TEXT NOT NULL DEFAULT 'normal',progress INTEGER NOT NULL DEFAULT 0,start_date TEXT,due_date TEXT,tags TEXT NOT NULL DEFAULT '[]',created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
            CREATE TABLE events(id INTEGER PRIMARY KEY,title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',start_at TEXT NOT NULL,end_at TEXT NOT NULL,location TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL);
            CREATE TABLE todos(id INTEGER PRIMARY KEY,title TEXT NOT NULL,todo_date TEXT NOT NULL,completed INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
            CREATE TABLE work_logs(id INTEGER PRIMARY KEY,content TEXT NOT NULL,log_date TEXT NOT NULL,task_id INTEGER,created_at TEXT NOT NULL);
            CREATE TABLE app_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL);
            CREATE TABLE oauth_tokens(provider TEXT PRIMARY KEY,user_email TEXT NOT NULL,access_token TEXT,refresh_token TEXT,expires_at TEXT,scope TEXT,updated_at TEXT NOT NULL);
            CREATE TABLE deleted_google_events(google_event_id TEXT NOT NULL,calendar_id TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(google_event_id,calendar_id));
            INSERT INTO tasks VALUES(1,'legacy','','todo','normal',0,NULL,NULL,'[]','2026-01-01','2026-01-01');
            """)
            c.commit(); c.close()
            with patch.dict(os.environ, {"DATABASE_PATH": path, "LEGACY_OWNER_EMAIL": "owner@example.com"}):
                init_db()
                user_id = upsert_google_user("google-sub", "owner@example.com")
                init_db()  # migrations are idempotent across restarts
            c = sqlite3.connect(path)
            owner = c.execute("SELECT user_id FROM tasks WHERE id=1").fetchone()[0]
            claim_count = c.execute("SELECT COUNT(*) FROM migration_state WHERE key='legacy_owner_claimed'").fetchone()[0]
            c.close()
            self.assertEqual(user_id, "google-sub")
            self.assertEqual(owner, "google-sub")
            self.assertEqual(claim_count, 1)

    def test_legacy_data_is_not_claimed_without_explicit_owner(self):
        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, "fresh.db")
            with patch.dict(os.environ, {"DATABASE_PATH": path, "LEGACY_OWNER_EMAIL": ""}):
                init_db()
                with sqlite3.connect(path) as c:
                    c.execute("INSERT INTO tasks(user_id,title,created_at,updated_at) VALUES('__legacy__','private','x','x')")
                upsert_google_user("other-sub", "other@example.com")
            with sqlite3.connect(path) as c:
                self.assertEqual(c.execute("SELECT user_id FROM tasks WHERE title='private'").fetchone()[0], "__legacy__")


if __name__ == "__main__":
    unittest.main()
