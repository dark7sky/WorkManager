# WorkManager Roadmap

Last updated: 2026-07-08T00:00:26+09:00

## Commercial Schedule Management Gaps

- [x] Fix user-reported task edit save failure: saving changes from the 업무/Tasks screen currently shows an error and must be diagnosed, covered by a regression test, and fixed before adding more task-editing features.
- [x] Add Gantt-style task hierarchy editing: tasks must support parent/child placement, moving existing tasks under another task, promoting a child back to top level, and safely preventing invalid cycles.
- [x] Basic dependency blocker visibility in the task management screen.
- [x] Overdue task visibility in the task management screen.
- [ ] Team/member assignment and workload ownership.
- [x] Basic assignee reuse suggestions in the task create/edit form to reduce owner name drift.
- [x] Basic task assignee name persisted and visible in task management.
- [x] Basic assignee workload filtering and summary in task management.
- [x] Basic unassigned-task ownership gap alert and quick filter.
- [x] Inline assignee load preview while creating or editing a task.
- [ ] Role-based permissions for managers, members, and viewers.
- [x] Basic approval workflow for completed work in the task management screen.
- [ ] Approval workflow for schedule changes.
- [x] Basic capacity planning across team members and date ranges.
- [x] Basic reminder rules for upcoming and overdue work in the task management screen.
- [x] Basic priority filtering in the task management screen.
- [x] Basic CSV task export for customer and management reporting.
- [x] PDF reporting exports for customer and management reporting.
- [x] Audit log browsing and filtering in the app UI.
- [x] Feature request status management in the Changelog screen for the Codex improvement loop.
