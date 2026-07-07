import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


class TaskUpdateValidationTests(unittest.TestCase):
    def test_normalized_task_edit_keeps_json_fields_valid_for_merged_validation(self):
        from app.main import MODELS, merged_resource_for_validation, normalize

        existing = {
            "title": "legacy edit",
            "description": "",
            "status": "in_progress",
            "priority": "medium",
            "progress": 40,
            "start_date": "2026-07-07",
            "due_date": "2026-07-09",
            "assignee_name": "",
            "tags": '["운영"]',
            "recurrence_rule": None,
            "parent_id": None,
            "dependency_ids": "[]",
        }
        payload = {
            "title": "legacy edit saved",
            "description": "",
            "assignee_name": "",
            "start_date": "2026-07-07",
            "due_date": "2026-07-09",
            "status": "in_progress",
            "priority": "medium",
            "progress": 40,
            "recurrence_rule": None,
            "tags": ["운영", "보고"],
            "dependency_ids": [],
        }

        data = normalize("tasks", payload)
        merged = merged_resource_for_validation("tasks", existing, data)

        MODELS["tasks"].model_validate(merged)
        self.assertEqual(merged["status"], "doing")
        self.assertEqual(merged["priority"], "normal")
        self.assertEqual(merged["tags"], ["운영", "보고"])
        self.assertEqual(merged["dependency_ids"], [])

    def test_task_edit_empty_clearable_fields_normalize_to_null(self):
        from app.main import normalize

        data = normalize("tasks", {
            "title": "clear schedule",
            "start_date": "",
            "due_date": "",
            "recurrence_rule": "",
        })

        self.assertIsNone(data["start_date"])
        self.assertIsNone(data["due_date"])
        self.assertIsNone(data["recurrence_rule"])

    def test_task_parent_can_move_and_promote_to_top_level(self):
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, {"DATABASE_PATH": os.path.join(folder, "test.db")}):
            from app.db import connection, init_db
            from app.main import create_item, update_item

            init_db()
            with connection() as c:
                c.execute("INSERT INTO users(id,email,display_name,created_at,updated_at) VALUES(?,?,?,?,?)",
                          ("sub-a", "a@example.com", "A", "2026-07-07", "2026-07-07"))

            first_parent = create_item("tasks", {"title": "first parent"}, "sub-a")
            second_parent = create_item("tasks", {"title": "second parent"}, "sub-a")
            child = create_item("tasks", {"title": "child", "parent_id": first_parent["id"]}, "sub-a")

            moved = update_item("tasks", child["id"], {"parent_id": second_parent["id"]}, "sub-a")
            self.assertEqual(moved["parent_id"], second_parent["id"])

            promoted = update_item("tasks", child["id"], {"parent_id": None}, "sub-a")
            self.assertIsNone(promoted["parent_id"])

    def test_completed_task_approval_flow_is_persisted(self):
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, {"DATABASE_PATH": os.path.join(folder, "test.db")}):
            from app.db import connection, init_db
            from app.main import create_item, update_item

            init_db()
            with connection() as c:
                c.execute("INSERT INTO users(id,email,display_name,created_at,updated_at) VALUES(?,?,?,?,?)",
                          ("sub-a", "a@example.com", "A", "2026-07-07", "2026-07-07"))

            task = create_item("tasks", {"title": "reviewable work"}, "sub-a")
            completed = update_item("tasks", task["id"], {"status": "done"}, "sub-a")
            self.assertEqual(completed["approval_status"], "pending")

            approved = update_item("tasks", task["id"], {"approval_status": "approved"}, "sub-a")
            self.assertEqual(approved["approval_status"], "approved")

            reopened = update_item("tasks", task["id"], {"status": "doing", "progress": 90}, "sub-a")
            self.assertEqual(reopened["approval_status"], "none")

            with self.assertRaisesRegex(Exception, "approval_status requires a completed task"):
                update_item("tasks", task["id"], {"approval_status": "approved"}, "sub-a")

    def test_task_schedule_change_requires_review(self):
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, {"DATABASE_PATH": os.path.join(folder, "test.db")}):
            from app.db import connection, init_db
            from app.main import create_item, update_item

            init_db()
            with connection() as c:
                c.execute("INSERT INTO users(id,email,display_name,created_at,updated_at) VALUES(?,?,?,?,?)",
                          ("sub-a", "a@example.com", "A", "2026-07-08", "2026-07-08"))

            task = create_item("tasks", {"title": "scheduled work", "start_date": "2026-07-08", "due_date": "2026-07-10"}, "sub-a")
            self.assertEqual(task["schedule_approval_status"], "none")

            changed = update_item("tasks", task["id"], {"due_date": "2026-07-11"}, "sub-a")
            self.assertEqual(changed["due_date"], "2026-07-11")
            self.assertEqual(changed["schedule_approval_status"], "pending")

            approved = update_item("tasks", task["id"], {"schedule_approval_status": "approved"}, "sub-a")
            self.assertEqual(approved["schedule_approval_status"], "approved")

            title_only = update_item("tasks", task["id"], {"title": "scheduled work updated"}, "sub-a")
            self.assertEqual(title_only["schedule_approval_status"], "approved")

    def test_merged_task_validation_treats_blank_approval_fields_as_none(self):
        from app.main import MODELS, merged_resource_for_validation

        existing = {
            "title": "legacy approval state",
            "description": "",
            "status": "doing",
            "priority": "normal",
            "progress": 20,
            "start_date": None,
            "due_date": None,
            "assignee_name": "담당자",
            "approval_status": "",
            "schedule_approval_status": "",
            "tags": "[]",
            "recurrence_rule": None,
            "parent_id": None,
            "dependency_ids": "[]",
        }

        merged = merged_resource_for_validation("tasks", existing, {"title": "legacy approval state updated"})

        MODELS["tasks"].model_validate(merged)
        self.assertEqual(merged["approval_status"], "none")
        self.assertEqual(merged["schedule_approval_status"], "none")

    def test_update_item_repairs_blank_approval_fields_on_legacy_task_edit(self):
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, {"DATABASE_PATH": os.path.join(folder, "test.db")}):
            from app.db import connection, init_db
            from app.main import update_item

            init_db()
            with connection() as c:
                c.execute("INSERT INTO users(id,email,display_name,created_at,updated_at) VALUES(?,?,?,?,?)",
                          ("sub-a", "a@example.com", "A", "2026-07-08", "2026-07-08"))
                cur = c.execute("""INSERT INTO tasks(user_id,title,description,status,priority,progress,start_date,due_date,
                    assignee_name,approval_status,schedule_approval_status,tags,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    ("sub-a", "legacy approval edit", "", "doing", "normal", 25, None, None,
                     "Dana", "", "", "[]", "2026-07-08T06:14:27", "2026-07-08T06:14:27"))
                task_id = cur.lastrowid

            updated = update_item("tasks", task_id, {"title": "legacy approval edit saved"}, "sub-a")

            self.assertEqual(updated["title"], "legacy approval edit saved")
            self.assertEqual(updated["approval_status"], "none")
            self.assertEqual(updated["schedule_approval_status"], "none")

    def test_update_item_repairs_invalid_legacy_task_enums_on_edit(self):
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, {"DATABASE_PATH": os.path.join(folder, "test.db")}):
            from app.db import connection, init_db
            from app.main import update_item

            init_db()
            with connection() as c:
                c.execute("INSERT INTO users(id,email,display_name,created_at,updated_at) VALUES(?,?,?,?,?)",
                          ("sub-a", "a@example.com", "A", "2026-07-08", "2026-07-08"))
                cur = c.execute("""INSERT INTO tasks(user_id,title,description,status,priority,progress,start_date,due_date,
                    assignee_name,approval_status,schedule_approval_status,tags,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    ("sub-a", "legacy enum edit", "", "", "", 0, None, None,
                     "", "", "", "[]", "2026-07-08T06:21:55", "2026-07-08T06:21:55"))
                task_id = cur.lastrowid

            updated = update_item("tasks", task_id, {"title": "legacy enum edit saved"}, "sub-a")

            self.assertEqual(updated["title"], "legacy enum edit saved")
            self.assertEqual(updated["status"], "todo")
            self.assertEqual(updated["priority"], "normal")
            self.assertEqual(updated["approval_status"], "none")
            self.assertEqual(updated["schedule_approval_status"], "none")


if __name__ == "__main__":
    unittest.main()
