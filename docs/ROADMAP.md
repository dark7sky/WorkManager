# WorkManager Roadmap

Last updated: 2026-07-12

See docs/IMPROVEMENT_PLAN.md for the current real-use readiness plan (Wave 1: P0-P4, done; Wave 2: AI summary evidence and team/assignee feature removal, done; Wave 3: correctness audit and bug fixes, done; Wave 4: undo-delete toast and a browser-verified layout fix, done; Wave 5: live user feedback queue, done; Wave 6: visual design refresh and dark-mode color fixes, done; Wave 7: stability and feature items 33-46, mostly done — see plan for per-item status).

## Wave 7 highlights (2026-07-11 ~ 2026-07-12)

- [x] Backup restore: /api/import with preview → merge/replace apply, Settings upload UI; restored events never touch Google Calendar.
- [x] Ctrl/⌘+K command palette: unified search over tasks/events/todos/logs plus screen navigation, on top of the existing AI capture.
- [x] Weekly review preset (지난주 리뷰) on the Performance screen reusing summary + Markdown export.
- [x] Event-start notifications 15 minutes ahead while the app is open.
- [x] Tag management in Settings: usage counts, bulk rename/merge/remove across all four tables.
- [x] Compose healthcheck for the api container; audit-log retention (180d default); scheduled backup container with verify (33/35/36, partly via the Codex loop).
- [x] Server error visibility panel (37): Settings shows the last 5 unhandled server errors with a manual 새로고침 button to reload without a full page refresh.
- [x] Gantt bar drag (39), calendar event drag (40, now covers both month and week views — 2026-07-12).
- [ ] Mobile form polish (42).
- [x] Skeleton loading (41): Tasks/Gantt list shows shimmering skeleton rows (reusing the existing `.skeleton` pattern from Settings) instead of the empty-state message while `dataLoading` is true and no tasks have arrived yet.
- [x] Task templates (44): save the current new-task form as a named template (title/priority/recurrence/tags/duration) and prefill a new task from a saved template; localStorage-only (`frontend/src/taskTemplates.js`).

## Real-Use Readiness (2026-07-10)

- [x] Repair mojibake in AI settings UI and backend AI status strings; align PUT /api/settings/ai response with GET.
- [x] Keep AI provider/model/API key drafts matched per provider in the Settings screen so switching vendors does not blend settings.
- [x] Optional per-user approval workflow toggle so personal use skips self-approval of completed work and schedule changes.
- [x] Today screen: completion toggle limited to the check icon to prevent accidental taps marking tasks done.
- [x] Local state updates for todo/work-log mutations instead of full refetch (P2).
- [x] Calendar week view with month/week switcher (P2).
- [x] Performance report presets and Markdown export (P3).
- [x] Work log to task linking UI on the Today screen (P3).
- [x] Backup verification script (scripts/verify_backup.py) and app version display in Settings (P4).
- [x] E2e smoke test: login-bypass session token exercising full create/read/update/delete/restore round trip for every core entity (P4).
- [x] AI performance summary shows a structured evidence list (which logs/tasks/events it used), not just prose (Wave 2).
- [x] Undo action on delete toasts for tasks, events, todos, and work logs (Wave 4).
- [x] Ctrl/Cmd+K quick capture: natural-language entry from any screen via the existing AI preview/apply pipeline (Wave 4).
- [x] AI parse/apply handles multiple actions from one input, previewed and applied one at a time (Wave 5).
- [x] Calendar event end time auto-follows start+1h until manually edited; day-cell events sort chronologically (Wave 5).
- [x] PWA orientation locked to portrait (Wave 5).
- [x] Mobile bottom nav fits its 7-item CSS again — Audit Log moved into a Settings section (Wave 5).
- [x] Read-only sample login ("샘플로 미리 보기") with seeded demo data for pre-signup preview (Wave 5).
- [x] Visual design refresh: consistent radius/shadow/motion tokens across cards, buttons, and inputs; pill-shaped progress bars; fixed six hardcoded-color dark-mode bugs found via screenshot verification (Wave 6).

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
- [x] Audit log retention limit: entries older than a configurable window (default 180 days, `AUDIT_LOG_RETENTION_DAYS`) are pruned on server startup instead of growing unbounded (Wave 7 item 36).
- [x] docker-compose.yml healthcheck for the api container (`/api/ready`), with backup/web waiting on `condition: service_healthy`, matching the existing portainer-stack.yml pattern (Wave 7 item 35).
- [x] Subtask completion summary ("하위 업무 n/m 완료") shown on parent rows in the task list (Wave 7 item 37).
- [x] Gantt task list sorts sibling rows by start date (falling back to due date, then title) instead of alphabetically, so the visible order matches the actual schedule (Wave 8 item 38).
- [x] Task dependency picker in the task form: `dependency_ids` had full backend cycle-prevention and blocker display, but no UI ever let a user set it — the form now includes a "선행 업무" multi-select (Wave 9 item 39).

## Backlog (identified 2026-07-11, not yet implemented)

- [x] Global search across tasks/events/todos/work logs from a single command palette or search box — already covered by the Ctrl/⌘+K command palette (`commandPalette.js` `searchItems`/`searchScreens`, wired into `QuickCapture`), found already implemented while auditing this backlog.
- [x] Bulk task actions: multi-select checkboxes in the Gantt list with a bulk action bar to complete or delete several tasks at once (2026-07-11), plus bulk tag add for selected tasks (2026-07-12).
- [x] Configurable reminder digest: a Settings toggle lets the existing daily device notification widen from "due today only" to "overdue + due within 2 days", stored locally per device (`reminderDigestTasks` in `taskFilters.js`). Server-side scheduled email/push digests remain out of scope (no outbound email infra yet).

## Removed (2026-07-10): Team/Assignee Features

WorkManager is a single-user personal tool; the team roster, per-member capacity, workload/reassignment UI, and mandatory task ownership built up over earlier iterations didn't fit that scope and were removed at the user's request (see docs/IMPROVEMENT_PLAN.md Wave 2 item 21). Assignee/collaborator info now goes in a task's memo or tags instead of a dedicated field. This removed everything previously listed here: team/member assignment and workload ownership, per-member daily capacity limits, quick reassignment, team roster management, assignee-required validation on active/done tasks, assignee reuse suggestions, assignee workload filtering, unassigned-task alerts, assignee load/capacity previews, and role-based permissions for managers/members/viewers (the last was never implemented, and is now explicitly out of scope — see the plan's "범위 밖" section).
