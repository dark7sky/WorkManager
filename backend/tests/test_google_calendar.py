import unittest
import re
from unittest.mock import patch

from app import google_calendar as gc


class GoogleCalendarHelpersTests(unittest.TestCase):
    def test_event_datetime_is_normalized_to_configured_wall_time(self):
        with patch.object(gc, "DEFAULT_TZ", "Asia/Seoul"):
            self.assertEqual(gc._local_datetime("2026-07-06T00:30:00+09:00"), "2026-07-06T00:30:00")
            self.assertEqual(gc._local_datetime("2026-07-05T15:30:00Z"), "2026-07-06T00:30:00")

    def test_all_day_payload_preserves_exclusive_end_date(self):
        event = {"title": "휴무", "description": "", "location": "", "start_at": "2026-07-06T00:00:00",
                 "end_at": "2026-07-08T00:00:00", "google_is_all_day": 1}
        body = gc._google_body(event)
        self.assertEqual(body["start"], {"date": "2026-07-06"})
        self.assertEqual(body["end"], {"date": "2026-07-08"})

    def test_occurrence_patch_never_sends_series_recurrence(self):
        event = {"title": "주간 회의", "description": "", "location": "", "start_at": "2026-07-06T09:00:00",
                 "end_at": "2026-07-06T10:00:00", "google_recurring_event_id": "series-1",
                 "recurrence": '["RRULE:FREQ=WEEKLY"]'}
        self.assertNotIn("recurrence", gc._google_body(event))

    def test_series_rule_is_fetched_once_per_sync(self):
        cache = {}
        with patch.object(gc, "_request", return_value={"recurrence": ["RRULE:FREQ=WEEKLY"]}) as request:
            first = gc._series_recurrence("user", "work", "series-1", cache)
            second = gc._series_recurrence("user", "work", "series-1", cache)
        self.assertEqual(first, ["RRULE:FREQ=WEEKLY"])
        self.assertEqual(second, first)
        request.assert_called_once()

    def test_deterministic_google_id_alphabet(self):
        # Google accepts base32hex ids (0-9, a-v); UUID hex is a safe subset.
        uid = "d9428888-122b-11e1-b85c-61cd3cbb3210"
        google_id = gc._google_insert_id(uid)
        self.assertTrue(re.fullmatch(r"[0-9a-v]{5,1024}", google_id))
        self.assertEqual(google_id, gc._google_insert_id(uid))

    def test_private_uid_is_sent_for_pull_deduplication(self):
        event = {"title": "회의", "description": "", "location": "", "start_at": "2026-07-06T09:00:00",
                 "end_at": "2026-07-06T10:00:00", "local_uid": "abc123"}
        body = gc._google_body(event)
        self.assertEqual(body["extendedProperties"]["private"]["workmanager_uid"], "abc123")

    def test_remote_uid_is_preserved_or_generated(self):
        tagged = {"extendedProperties": {"private": {"workmanager_uid": "origin-uid"}}}
        self.assertEqual(gc._remote_local_uid(tagged), "origin-uid")
        generated = gc._remote_local_uid({})
        self.assertTrue(generated)
        self.assertNotEqual(generated, gc._remote_local_uid({}))

    def test_remote_snapshot_preserves_conflict_fields(self):
        remote = {"status": "confirmed", "summary": "원격 제목", "etag": "v2", "updated": "2026-07-06T00:00:00Z",
                  "start": {"dateTime": "2026-07-06T09:00:00+09:00"}, "end": {"dateTime": "2026-07-06T10:00:00+09:00"}}
        snapshot = gc._remote_snapshot(remote)
        self.assertEqual(snapshot["title"], "원격 제목")
        self.assertEqual(snapshot["etag"], "v2")
        self.assertEqual(snapshot["start_at"], "2026-07-06T09:00:00")

    def test_remote_event_pagination_keeps_final_sync_token(self):
        responses = [
            {"items": [{"id": "one"}], "nextPageToken": "page-2"},
            {"items": [{"id": "two"}], "nextSyncToken": "sync-next"},
        ]
        with patch.object(gc, "_request", side_effect=responses) as request:
            pages, token, gone = gc._fetch_remote_pages("user", "/calendar", "sync-old")
        self.assertEqual([[x["id"] for x in page] for page in pages], [["one"], ["two"]])
        self.assertEqual(token, "sync-next")
        self.assertFalse(gone)
        self.assertEqual(request.call_args_list[1].kwargs["params"]["pageToken"], "page-2")

    def test_expired_sync_token_requests_full_resync(self):
        with patch.object(gc, "_request", return_value={"_gone": True}):
            pages, token, gone = gc._fetch_remote_pages("user", "/calendar", "expired")
        self.assertEqual(pages, [])
        self.assertIsNone(token)
        self.assertTrue(gone)


class GoogleCalendarHistoryWindowTests(unittest.TestCase):
    def test_history_days_defaults_to_90_and_clamps(self):
        import os
        from unittest.mock import patch as env_patch
        with env_patch.dict(os.environ, {}, clear=False):
            os.environ.pop("GOOGLE_CALENDAR_HISTORY_DAYS", None)
            self.assertEqual(gc._history_days(), 90)
        with env_patch.dict(os.environ, {"GOOGLE_CALENDAR_HISTORY_DAYS": "1"}):
            self.assertEqual(gc._history_days(), 7)
        with env_patch.dict(os.environ, {"GOOGLE_CALENDAR_HISTORY_DAYS": "not-a-number"}):
            self.assertEqual(gc._history_days(), 90)

    def test_initial_fetch_limits_history_with_time_min(self):
        with patch.object(gc, "_request", return_value={"items": [], "nextSyncToken": "s"}) as request:
            gc._fetch_remote_pages("user", "/calendar", None)
        params = request.call_args.kwargs["params"]
        self.assertIn("timeMin", params)
        self.assertNotIn("syncToken", params)

    def test_prune_removes_only_old_synced_google_mirrors(self):
        import os
        import tempfile
        from datetime import date, timedelta
        from unittest.mock import patch as env_patch
        with tempfile.TemporaryDirectory() as folder, env_patch.dict(os.environ, {"DATABASE_PATH": os.path.join(folder, "t.db")}):
            from app.db import connection, init_db
            init_db()
            old_day = (date.today() - timedelta(days=400)).isoformat()
            recent_day = (date.today() - timedelta(days=3)).isoformat()
            rows = [
                # (title, end date, google_event_id, sync_state, conflict)
                ("old google", old_day, "g-old", "synced", None),          # pruned
                ("recent google", recent_day, "g-new", "synced", None),    # kept: inside window
                ("old local", old_day, None, "clean", None),               # kept: not a Google mirror
                ("old dirty", old_day, "g-dirty", "dirty", None),          # kept: unpushed local edits
                ("old conflict", old_day, "g-conf", "synced", "{}"),       # kept: unresolved conflict
            ]
            with connection() as c:
                c.execute("INSERT INTO users(id,email,created_at,updated_at) VALUES('u','u@example.com','2026-01-01','2026-01-01')")
                for title, day, gid, state, conflict in rows:
                    c.execute("""INSERT INTO events(user_id,title,start_at,end_at,tags,created_at,sync_state,
                      google_event_id,google_calendar_id,conflict_remote_json)
                      VALUES('u',?,?,?,'[]','2026-01-01',?,?,?,?)""",
                              (title, f"{day}T10:00:00", f"{day}T11:00:00", state, gid, "cal" if gid else None, conflict))
            pruned = gc._prune_history("u")
            self.assertEqual(pruned, 1)
            with connection() as c:
                titles = {r["title"] for r in c.execute("SELECT title FROM events WHERE user_id='u'").fetchall()}
            self.assertEqual(titles, {"recent google", "old local", "old dirty", "old conflict"})


if __name__ == "__main__":
    unittest.main()
