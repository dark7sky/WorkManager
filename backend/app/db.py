import json
import os
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone

LEGACY_USER_ID = "__legacy__"
DEMO_USER_ID = "__demo__"
AUDIT_LOG_RETENTION_DAYS = int(os.getenv("AUDIT_LOG_RETENTION_DAYS", "180"))


def decode_json_array(value):
    if isinstance(value, list):
        return value
    if not value:
        return []
    try:
        parsed = json.loads(value)
    except (TypeError, ValueError, json.JSONDecodeError):
        return []
    return parsed if isinstance(parsed, list) else []


@contextmanager
def connection():
    db_path = os.getenv("DATABASE_PATH", "./data/workmanager.db")
    os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
    conn = sqlite3.connect(db_path, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=15000")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def row_dict(row):
    item = dict(row)
    if "tags" in item:
        item["tags"] = decode_json_array(item["tags"])
    if "dependency_ids" in item:
        item["dependency_ids"] = decode_json_array(item["dependency_ids"])
    if "recurrence" in item:
        item["recurrence"] = decode_json_array(item["recurrence"])
    if "completed" in item:
        item["completed"] = bool(item["completed"])
    return item


def _columns(c, table):
    return {row["name"] for row in c.execute(f"PRAGMA table_info({table})")}


def _add_column(c, table, column, definition):
    if column not in _columns(c, table):
        c.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def _migrate_scoped_kv(c):
    cols = _columns(c, "app_settings")
    if cols and "user_id" not in cols:
        c.executescript("""
        ALTER TABLE app_settings RENAME TO app_settings_legacy;
        CREATE TABLE app_settings(user_id TEXT NOT NULL,key TEXT NOT NULL,value TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(user_id,key),FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
        INSERT INTO app_settings SELECT '__legacy__',key,value,updated_at FROM app_settings_legacy;
        DROP TABLE app_settings_legacy;
        """)
    cols = _columns(c, "oauth_tokens")
    if cols and "user_id" not in cols:
        c.executescript("""
        ALTER TABLE oauth_tokens RENAME TO oauth_tokens_legacy;
        CREATE TABLE oauth_tokens(provider TEXT NOT NULL,user_id TEXT NOT NULL,user_email TEXT NOT NULL,access_token TEXT,refresh_token TEXT,expires_at TEXT,scope TEXT,updated_at TEXT NOT NULL,PRIMARY KEY(provider,user_id),FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
        INSERT INTO oauth_tokens SELECT provider,'__legacy__',user_email,access_token,refresh_token,expires_at,scope,updated_at FROM oauth_tokens_legacy;
        DROP TABLE oauth_tokens_legacy;
        """)
    cols = _columns(c, "deleted_google_events")
    if cols and "user_id" not in cols:
        c.executescript("""
        ALTER TABLE deleted_google_events RENAME TO deleted_google_events_legacy;
        CREATE TABLE deleted_google_events(user_id TEXT NOT NULL,google_event_id TEXT NOT NULL,calendar_id TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(user_id,google_event_id,calendar_id),FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
        INSERT INTO deleted_google_events SELECT '__legacy__',google_event_id,calendar_id,created_at FROM deleted_google_events_legacy;
        DROP TABLE deleted_google_events_legacy;
        """)


def _prune_audit_logs(c):
    # audit_logs.created_at is written via app.main.now(), a naive local isoformat string;
    # the cutoff must match that format for the string comparison to sort correctly.
    cutoff = (datetime.now() - timedelta(days=AUDIT_LOG_RETENTION_DAYS)).isoformat(timespec="seconds")
    c.execute("DELETE FROM audit_logs WHERE created_at<?", (cutoff,))
    c.execute("DELETE FROM error_logs WHERE created_at<?", (cutoff,))


def init_db():
    with connection() as c:
        # WAL is persistent and materially reduces reader/writer contention.
        c.execute("PRAGMA journal_mode=WAL")
        c.execute("PRAGMA synchronous=NORMAL")
        c.executescript("""
        CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,google_sub TEXT UNIQUE,email TEXT NOT NULL UNIQUE,display_name TEXT NOT NULL DEFAULT '',picture_url TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
        INSERT OR IGNORE INTO users(id,google_sub,email,display_name,created_at,updated_at) VALUES('__legacy__',NULL,'legacy@local.invalid','Legacy data','1970-01-01T00:00:00+00:00','1970-01-01T00:00:00+00:00');
        CREATE TABLE IF NOT EXISTS tasks(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT,title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'todo',priority TEXT NOT NULL DEFAULT 'normal',progress INTEGER NOT NULL DEFAULT 0,start_date TEXT,due_date TEXT,assignee_name TEXT NOT NULL DEFAULT '',approval_status TEXT NOT NULL DEFAULT 'none',schedule_approval_status TEXT NOT NULL DEFAULT 'none',tags TEXT NOT NULL DEFAULT '[]',recurrence_rule TEXT,recurrence_anchor_day INTEGER,recurrence_anchor_month_end INTEGER NOT NULL DEFAULT 0,parent_id INTEGER,dependency_ids TEXT NOT NULL DEFAULT '[]',recurrence_spawned_at TEXT,completed_at TEXT,deleted_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,FOREIGN KEY(parent_id) REFERENCES tasks(id) ON DELETE SET NULL);
        CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT,local_uid TEXT,title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',start_at TEXT NOT NULL,end_at TEXT NOT NULL,location TEXT NOT NULL DEFAULT '',tags TEXT NOT NULL DEFAULT '[]',recurrence TEXT NOT NULL DEFAULT '[]',created_at TEXT NOT NULL,updated_at TEXT,deleted_at TEXT,google_event_id TEXT,google_calendar_id TEXT,sync_state TEXT NOT NULL DEFAULT 'clean',google_etag TEXT,google_updated_at TEXT,google_recurring_event_id TEXT,google_original_start TEXT,google_is_all_day INTEGER NOT NULL DEFAULT 0,google_is_series_master INTEGER NOT NULL DEFAULT 0,conflict_remote_json TEXT,conflict_detected_at TEXT,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
        CREATE TABLE IF NOT EXISTS todos(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT,title TEXT NOT NULL,todo_date TEXT NOT NULL,completed INTEGER NOT NULL DEFAULT 0,tags TEXT NOT NULL DEFAULT '[]',deleted_at TEXT,created_at TEXT NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
        CREATE TABLE IF NOT EXISTS work_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT,content TEXT NOT NULL,log_date TEXT NOT NULL,task_id INTEGER,tags TEXT NOT NULL DEFAULT '[]',deleted_at TEXT,created_at TEXT NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE SET NULL);
        CREATE TABLE IF NOT EXISTS app_settings(user_id TEXT NOT NULL,key TEXT NOT NULL,value TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(user_id,key),FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
        CREATE TABLE IF NOT EXISTS oauth_tokens(provider TEXT NOT NULL,user_id TEXT NOT NULL,user_email TEXT NOT NULL,access_token TEXT,refresh_token TEXT,expires_at TEXT,scope TEXT,updated_at TEXT NOT NULL,PRIMARY KEY(provider,user_id),FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
        CREATE TABLE IF NOT EXISTS deleted_google_events(user_id TEXT NOT NULL,google_event_id TEXT NOT NULL,calendar_id TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(user_id,google_event_id,calendar_id),FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
        CREATE TABLE IF NOT EXISTS google_sync_state(user_id TEXT NOT NULL,calendar_id TEXT NOT NULL,sync_token TEXT,lease_owner TEXT,lease_until TEXT,updated_at TEXT NOT NULL,PRIMARY KEY(user_id,calendar_id),FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
        CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL,last_seen_at INTEGER NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
        CREATE TABLE IF NOT EXISTS migration_state(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS audit_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT NOT NULL,action TEXT NOT NULL,entity_type TEXT NOT NULL,entity_id TEXT,metadata TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
        CREATE TABLE IF NOT EXISTS feature_requests(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT NOT NULL,content TEXT NOT NULL,source TEXT NOT NULL DEFAULT 'user',status TEXT NOT NULL DEFAULT 'pending',created_at TEXT NOT NULL,updated_at TEXT NOT NULL,completed_at TEXT,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
        CREATE TABLE IF NOT EXISTS changelog_entries(id INTEGER PRIMARY KEY AUTOINCREMENT,feature_request_id INTEGER UNIQUE,request_content TEXT NOT NULL,requested_at TEXT NOT NULL,description TEXT NOT NULL,released_at TEXT NOT NULL,FOREIGN KEY(feature_request_id) REFERENCES feature_requests(id) ON DELETE SET NULL);
        CREATE TABLE IF NOT EXISTS error_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,method TEXT NOT NULL,path TEXT NOT NULL,summary TEXT NOT NULL,created_at TEXT NOT NULL);
        """)
        for table in ("tasks", "events", "todos", "work_logs"):
            _add_column(c, table, "user_id", "TEXT")
            _add_column(c, table, "deleted_at", "TEXT")
            _add_column(c, table, "tags", "TEXT NOT NULL DEFAULT '[]'")
            c.execute(f"UPDATE {table} SET user_id=? WHERE user_id IS NULL", (LEGACY_USER_ID,))
        _add_column(c, "work_logs", "duration_minutes", "INTEGER")
        for name, definition in {
            "recurrence_rule": "TEXT", "parent_id": "INTEGER", "dependency_ids": "TEXT NOT NULL DEFAULT '[]'",
            "recurrence_spawned_at": "TEXT", "recurrence_anchor_day": "INTEGER",
            "recurrence_anchor_month_end": "INTEGER NOT NULL DEFAULT 0", "completed_at": "TEXT",
            "assignee_name": "TEXT NOT NULL DEFAULT ''", "approval_status": "TEXT NOT NULL DEFAULT 'none'",
            "schedule_approval_status": "TEXT NOT NULL DEFAULT 'none'",
        }.items():
            _add_column(c, "tasks", name, definition)
        for name, definition in {
            "google_event_id": "TEXT", "google_calendar_id": "TEXT", "updated_at": "TEXT",
            "sync_state": "TEXT NOT NULL DEFAULT 'clean'", "google_etag": "TEXT",
            "google_updated_at": "TEXT", "google_recurring_event_id": "TEXT", "google_original_start": "TEXT",
            "google_is_all_day": "INTEGER NOT NULL DEFAULT 0",
            "recurrence": "TEXT NOT NULL DEFAULT '[]'",
            "local_uid": "TEXT", "google_is_series_master": "INTEGER NOT NULL DEFAULT 0",
            "conflict_remote_json": "TEXT", "conflict_detected_at": "TEXT",
        }.items():
            _add_column(c, "events", name, definition)
        c.execute("UPDATE events SET local_uid=lower(hex(randomblob(16))) WHERE local_uid IS NULL")
        for name, definition in {"lease_owner": "TEXT", "lease_until": "TEXT"}.items():
            _add_column(c, "google_sync_state", name, definition)
        _migrate_scoped_kv(c)
        c.execute("CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id)")
        c.execute("CREATE INDEX IF NOT EXISTS idx_tasks_trash ON tasks(user_id,deleted_at)")
        c.execute("CREATE INDEX IF NOT EXISTS idx_events_user_start ON events(user_id,start_at)")
        c.execute("CREATE INDEX IF NOT EXISTS idx_todos_user_date ON todos(user_id,todo_date)")
        c.execute("CREATE INDEX IF NOT EXISTS idx_logs_user_date ON work_logs(user_id,log_date)")
        c.execute("CREATE INDEX IF NOT EXISTS idx_audit_user_created ON audit_logs(user_id,created_at DESC)")
        c.execute("CREATE INDEX IF NOT EXISTS idx_feature_requests_user_status ON feature_requests(user_id,status,created_at DESC)")
        c.execute("CREATE INDEX IF NOT EXISTS idx_feature_requests_public_status ON feature_requests(status,created_at DESC)")
        c.execute("CREATE INDEX IF NOT EXISTS idx_changelog_released ON changelog_entries(released_at DESC)")
        c.execute("CREATE INDEX IF NOT EXISTS idx_error_logs_created ON error_logs(created_at DESC)")
        c.execute("DROP INDEX IF EXISTS idx_events_google")
        duplicate_google = c.execute("""SELECT user_id,google_calendar_id,google_event_id,COUNT(*) n FROM events
          WHERE google_event_id IS NOT NULL GROUP BY user_id,google_calendar_id,google_event_id HAVING COUNT(*)>1 LIMIT 1""").fetchone()
        duplicate_local = c.execute("""SELECT user_id,local_uid,COUNT(*) n FROM events WHERE local_uid IS NOT NULL
          GROUP BY user_id,local_uid HAVING COUNT(*)>1 LIMIT 1""").fetchone()
        if duplicate_google or duplicate_local:
            raise RuntimeError("Duplicate event identities detected; back up the database and resolve duplicates before migration")
        c.execute("CREATE UNIQUE INDEX idx_events_google ON events(user_id,google_calendar_id,google_event_id) WHERE google_event_id IS NOT NULL")
        c.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_events_local_uid ON events(user_id,local_uid) WHERE local_uid IS NOT NULL")
        c.execute("INSERT INTO migration_state(key,value,updated_at) VALUES('schema_version','6',?) ON CONFLICT(key) DO UPDATE SET value='6',updated_at=excluded.updated_at", (datetime.now(timezone.utc).isoformat(),))
        _prune_audit_logs(c)
        _seed_demo_data(c)


def _seed_demo_data(c):
    """Read-only sample account so visitors can try the app before signing in with Google."""
    if c.execute("SELECT 1 FROM users WHERE id=?", (DEMO_USER_ID,)).fetchone():
        return
    now_iso = datetime.now(timezone.utc).isoformat()
    c.execute("INSERT INTO users(id,google_sub,email,display_name,created_at,updated_at) VALUES(?,?,?,?,?,?)",
              (DEMO_USER_ID, None, "demo@workmanager.local", "체험 계정", now_iso, now_iso))
    today = date.today()
    day = lambda offset: (today + timedelta(days=offset)).isoformat()
    for title, description, status, priority, progress, start, due in [
        ("분기 업무 보고서 작성", "지난 분기 실적과 다음 분기 계획을 정리합니다.", "doing", "high", 65, day(-2), day(3)),
        ("신규 프로젝트 요구사항 정리", "이해관계자 인터뷰 내용을 문서로 정리합니다.", "todo", "normal", 0, day(0), day(7)),
        ("지난주 회의록 배포", "참석자에게 회의록을 공유합니다.", "done", "low", 100, day(-6), day(-4)),
    ]:
        c.execute("""INSERT INTO tasks(user_id,title,description,status,priority,progress,start_date,due_date,tags,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?)""", (DEMO_USER_ID, title, description, status, priority, progress, start, due, "[]", now_iso, now_iso))
    for title, start_at, end_at, location in [
        ("주간 팀 회의", f"{day(0)}T10:00:00", f"{day(0)}T11:00:00", "회의실 A"),
        ("고객사 미팅", f"{day(1)}T14:00:00", f"{day(1)}T15:30:00", "온라인"),
    ]:
        c.execute("""INSERT INTO events(user_id,local_uid,title,start_at,end_at,location,tags,created_at,sync_state)
          VALUES(?,?,?,?,?,?,?,?,?)""", (DEMO_USER_ID, str(uuid.uuid4()), title, start_at, end_at, location, "[]", now_iso, "clean"))
    for title, completed in [("오늘 할 일 목록 정리", 0), ("팀원과 1:1 미팅 준비", 1)]:
        c.execute("INSERT INTO todos(user_id,title,todo_date,completed,tags,created_at) VALUES(?,?,?,?,?,?)",
                  (DEMO_USER_ID, title, day(0), completed, "[]", now_iso))
    for content, log_date in [("신규 기능 배포 완료", day(0)), ("고객 피드백 정리", day(-1))]:
        c.execute("INSERT INTO work_logs(user_id,content,log_date,tags,created_at) VALUES(?,?,?,?,?)",
                  (DEMO_USER_ID, content, log_date, "[]", now_iso))


def upsert_google_user(google_sub, email, display_name="", picture_url=None):
    now = datetime.now(timezone.utc).isoformat()
    user_id = google_sub
    with connection() as c:
        c.execute("""INSERT INTO users(id,google_sub,email,display_name,picture_url,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?) ON CONFLICT(google_sub) DO UPDATE SET email=excluded.email,
          display_name=excluded.display_name,picture_url=excluded.picture_url,updated_at=excluded.updated_at""",
          (user_id, google_sub, email.lower(), display_name or email, picture_url, now, now))
        row = c.execute("SELECT id FROM users WHERE google_sub=?", (google_sub,)).fetchone()
        user_id = row["id"]
        # Legacy data is never assigned by login order. Operators must explicitly
        # nominate its owner before starting a multi-user deployment.
        real_users = c.execute("SELECT COUNT(*) n FROM users WHERE id NOT IN (?,?)", (LEGACY_USER_ID, DEMO_USER_ID)).fetchone()["n"]
        claimed = c.execute("SELECT value FROM migration_state WHERE key='legacy_owner_claimed'").fetchone()
        legacy_owner = os.getenv("LEGACY_OWNER_EMAIL", "").strip().lower()
        allowed_emails = [value.strip().lower() for value in os.getenv("GOOGLE_ALLOWED_EMAIL", "").split(",") if value.strip()]
        if not legacy_owner and len(allowed_emails) == 1:
            legacy_owner = allowed_emails[0]
        if real_users == 1 and not claimed and legacy_owner and email.lower() == legacy_owner:
            for table in ("tasks", "events", "todos", "work_logs", "app_settings", "oauth_tokens", "deleted_google_events", "google_sync_state"):
                if "user_id" in _columns(c, table):
                    expected = c.execute(f"SELECT COUNT(*) n FROM {table} WHERE user_id=?", (LEGACY_USER_ID,)).fetchone()["n"]
                    try:
                        changed = c.execute(f"UPDATE {table} SET user_id=? WHERE user_id=?", (user_id, LEGACY_USER_ID)).rowcount
                    except sqlite3.IntegrityError as exc:
                        raise RuntimeError(f"Legacy migration collision in {table}; restore the backup and resolve duplicates") from exc
                    if changed != expected:
                        raise RuntimeError(f"Legacy migration count mismatch in {table}: expected {expected}, moved {changed}")
            c.execute("DELETE FROM users WHERE id=?", (LEGACY_USER_ID,))
            c.execute("INSERT INTO migration_state(key,value,updated_at) VALUES('legacy_owner_claimed',?,?)", (user_id, now))
    return user_id
