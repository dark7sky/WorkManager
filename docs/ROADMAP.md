# WorkManager Roadmap

Last updated: 2026-07-10

See docs/IMPROVEMENT_PLAN.md for the current real-use readiness plan (Wave 1: P0-P4, done; Wave 2: AI summary evidence, polish, in progress; team/assignee feature removal, done).

## Real-Use Readiness (2026-07-10)

- [x] Repair mojibake in AI settings UI and backend AI status strings; align PUT /api/settings/ai response with GET.
- [x] Optional per-user approval workflow toggle so personal use skips self-approval of completed work and schedule changes.
- [x] Today screen: completion toggle limited to the check icon to prevent accidental taps marking tasks done.
- [x] Local state updates for todo/work-log mutations instead of full refetch (P2).
- [x] Calendar week view with month/week switcher (P2).
- [x] Performance report presets and Markdown export (P3).
- [x] Work log to task linking UI on the Today screen (P3).
- [x] Backup verification script (scripts/verify_backup.py) and app version display in Settings (P4).
- [x] E2e smoke test: login-bypass session token exercising full create/read/update/delete/restore round trip for every core entity (P4).
- [x] AI performance summary shows a structured evidence list (which logs/tasks/events it used), not just prose (Wave 2).

## Task Management & Reporting

- [x] Fix user-reported task edit save failure: saving changes from the 업무/Tasks screen currently shows an error and must be diagnosed, covered by a regression test, and fixed before adding more task-editing features.
- [x] Add Gantt-style task hierarchy editing: tasks must support parent/child placement, moving existing tasks under another task, promoting a child back to top level, and safely preventing invalid cycles.
- [x] Basic dependency blocker visibility in the task management screen.
- [x] Overdue task visibility in the task management screen.
- [x] Basic approval workflow for completed work in the task management screen.
- [x] Basic approval workflow for schedule changes.
- [x] Approval queue filters for completed-work and schedule-change review.
- [x] Repo-root backend regression coverage for task edit save flows.
- [x] Basic reminder rules for upcoming and overdue work in the task management screen.
- [x] Basic priority filtering in the task management screen.
- [x] Basic CSV task export for customer and management reporting.
- [x] PDF reporting exports for customer and management reporting.
- [x] Audit log browsing and filtering in the app UI.
- [x] Feature request status management in the Changelog screen for the Codex improvement loop.

## Removed (2026-07-10): Team/Assignee Features

WorkManager is a single-user personal tool; the team roster, per-member capacity, workload/reassignment UI, and mandatory task ownership built up over earlier iterations didn't fit that scope and were removed at the user's request (see docs/IMPROVEMENT_PLAN.md Wave 2 item 21). Assignee/collaborator info now goes in a task's memo or tags instead of a dedicated field. This removed everything previously listed here: team/member assignment and workload ownership, per-member daily capacity limits, quick reassignment, team roster management, assignee-required validation on active/done tasks, assignee reuse suggestions, assignee workload filtering, unassigned-task alerts, assignee load/capacity previews, and role-based permissions for managers/members/viewers (the last was never implemented, and is now explicitly out of scope — see the plan's "범위 밖" section).
