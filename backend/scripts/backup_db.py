"""Create consistent SQLite backups and prune old files."""

import os
import sqlite3
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path


SOURCE = Path(os.getenv("DATABASE_PATH", "/data/workmanager.db"))
DESTINATION = Path(os.getenv("BACKUP_PATH", "/backups"))
RETENTION_DAYS = max(1, int(os.getenv("BACKUP_RETENTION_DAYS", "30")))
INTERVAL_SECONDS = max(0, int(os.getenv("BACKUP_INTERVAL_SECONDS", "21600")))


def backup_once() -> Path | None:
    if not SOURCE.exists():
        print(f"Database does not exist yet: {SOURCE}", flush=True)
        return None
    DESTINATION.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    target = DESTINATION / f"workmanager-{timestamp}.db"
    fd, temporary = tempfile.mkstemp(prefix=".workmanager-", suffix=".db", dir=DESTINATION)
    os.close(fd)
    try:
        with sqlite3.connect(f"file:{SOURCE.resolve()}?mode=ro", uri=True) as source, sqlite3.connect(temporary) as destination:
            source.backup(destination)
            result = destination.execute("PRAGMA integrity_check").fetchone()
            if not result or result[0] != "ok":
                raise RuntimeError(f"Backup integrity check failed: {result}")
        os.replace(temporary, target)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    cutoff = time.time() - RETENTION_DAYS * 86400
    for candidate in DESTINATION.glob("workmanager-*.db"):
        if candidate.stat().st_mtime < cutoff:
            candidate.unlink()
    print(f"Created verified backup: {target}", flush=True)
    return target


if __name__ == "__main__":
    while True:
        try:
            backup_once()
        except Exception as exc:
            print(f"Backup failed: {type(exc).__name__}: {exc}", flush=True)
        if not INTERVAL_SECONDS:
            break
        time.sleep(INTERVAL_SECONDS)
