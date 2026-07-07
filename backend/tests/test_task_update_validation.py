import unittest


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
        self.assertEqual(merged["tags"], ["운영", "보고"])
        self.assertEqual(merged["dependency_ids"], [])


if __name__ == "__main__":
    unittest.main()
