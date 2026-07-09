# WorkManager Roadmap

Last updated: 2026-07-10

See docs/IMPROVEMENT_PLAN.md for the current real-use readiness plan (P0-P4).

## Real-Use Readiness (2026-07-10)

- [x] Repair mojibake in AI settings UI and backend AI status strings; align PUT /api/settings/ai response with GET.
- [x] Optional per-user approval workflow toggle so personal use skips self-approval of completed work and schedule changes.
- [x] Today screen: completion toggle limited to the check icon to prevent accidental taps marking tasks done.
- [x] Local state updates for todo/work-log mutations instead of full refetch (P2).
- [x] Calendar week view with month/week switcher (P2).
- [x] Performance report presets and Markdown export (P3).
- [x] Work log to task linking UI on the Today screen (P3).
- [x] Backup verification script (scripts/verify_backup.py) and app version display in Settings (P4).

## Commercial Schedule Management Gaps

- [x] Fix user-reported task edit save failure: saving changes from the 업무/Tasks screen currently shows an error and must be diagnosed, covered by a regression test, and fixed before adding more task-editing features.
- [x] Add Gantt-style task hierarchy editing: tasks must support parent/child placement, moving existing tasks under another task, promoting a child back to top level, and safely preventing invalid cycles.
- [x] Basic dependency blocker visibility in the task management screen.
- [x] Overdue task visibility in the task management screen.
- [ ] Team/member assignment and workload ownership.
- [x] Saved per-member daily capacity limits for overload detection and assignment planning.
- [x] Quick task reassignment between saved team members from Settings.
- [x] Prevent removing a saved team member while tasks are still assigned to that name.
- [x] Prevent inline task status/progress updates from creating new unassigned active work.
- [x] Saved team roster now shows each member's active, completed, overdue, and 14-day workload summary in Settings.
- [x] Prevent saving in-progress or completed tasks without an assignee from the task create/edit form.
- [x] Local team member roster for reusable task assignee suggestions.
- [x] Basic assignee reuse suggestions in the task create/edit form to reduce owner name drift.
- [x] Basic task assignee name persisted and visible in task management.
- [x] Basic assignee workload filtering and summary in task management.
- [x] Basic unassigned-task ownership gap alert and quick filter.
- [x] Inline assignee load preview while creating or editing a task.
- [x] Inline assignee load preview now shows 14-day schedule pressure and overload risk before reassigning work.
- [ ] Role-based permissions for managers, members, and viewers.
- [x] Basic approval workflow for completed work in the task management screen.
- [x] Basic approval workflow for schedule changes.
- [x] Approval queue filters for completed-work and schedule-change review.
- [x] Repo-root backend regression coverage for task edit save flows.
- [x] Basic capacity planning across team members and date ranges.
- [x] Basic reminder rules for upcoming and overdue work in the task management screen.
- [x] Basic priority filtering in the task management screen.
- [x] Basic CSV task export for customer and management reporting.
- [x] PDF reporting exports for customer and management reporting.
- [x] Audit log browsing and filtering in the app UI.
- [x] Feature request status management in the Changelog screen for the Codex improvement loop.
