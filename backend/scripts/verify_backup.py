"""Verify that the most recent SQLite backup is restorable."""

import glob
import os
import sqlite3
import sys
from datetime import datetime
from pathlib import Path


BACKUP_PATH = Path(os.getenv("BACKUP_PATH", "/backups"))
TABLES = ["users", "tasks", "events", "todos", "work_logs"]


def find_newest_backup(path: str | None) -> Path | None:
    """Find the newest backup file in directory or verify a single file."""
    if path and Path(path).is_file():
        return Path(path)
    backup_dir = Path(path) if path else BACKUP_PATH
    if not backup_dir.exists():
        return None
    candidates = sorted(backup_dir.glob("workmanager-*.db"), key=lambda p: p.stat().st_mtime, reverse=True)
    return candidates[0] if candidates else None


def verify_backup(backup_path: Path) -> bool:
    """Verify backup integrity and return row counts."""
    if not backup_path.exists():
        print(f"Backup file not found: {backup_path}", file=sys.stderr, flush=True)
        return False
    try:
        with sqlite3.connect(f"file:{backup_path.resolve()}?mode=ro", uri=True) as conn:
            result = conn.execute("PRAGMA integrity_check").fetchone()
            if not result or result[0] != "ok":
                print(f"Integrity check failed: {result}", file=sys.stderr, flush=True)
                return False
            stat = backup_path.stat()
            size_mb = stat.st_size / (1024 * 1024)
            mtime = datetime.fromtimestamp(stat.st_mtime).isoformat()
            rows = {}
            for table in TABLES:
                try:
                    count = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
                    rows[table] = count
                except sqlite3.OperationalError:
                    pass
            print(f"OK {backup_path.name} | {mtime} | {size_mb:.1f}MB | {rows}", flush=True)
            return True
    except Exception as exc:
        print(f"Error: {type(exc).__name__}: {exc}", file=sys.stderr, flush=True)
        return False


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else None
    backup = find_newest_backup(path)
    if not backup:
        print(f"No backups found in {path or BACKUP_PATH}", file=sys.stderr, flush=True)
        sys.exit(1)
    if not verify_backup(backup):
        sys.exit(1)
