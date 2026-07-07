import os
import tempfile
import unittest
from unittest.mock import patch


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


if __name__ == "__main__":
    unittest.main()
