# WorkManager Roadmap

Last updated: 2026-07-13 (13:44 KST)

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
- [x] Mobile form polish (42): the shared `.form-actions` button row (task/event forms, delete confirm dialogs) let flexbox shrink buttons below their content width on narrow viewports, wrapping Korean labels mid-word (e.g. "휴지통으 로 이동"). Verified with a 390px headless-browser screenshot of the task edit form; fixed by wrapping the row and giving buttons a fixed content-based size (2026-07-12).
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
- [x] Task list sort order: the Gantt/task list only ever sorted siblings by start date. Added a "정렬" dropdown (일정순/우선순위순/진행률순/제목순) on the Tasks screen; hierarchy grouping (parent above children) is unchanged, only sibling order within a group changes (`TASK_SORT_COMPARATORS` in `taskHierarchy.js`, 2026-07-12).
- [x] Filter reset on the Tasks screen: search/status/priority/tag filters each had to be cleared one at a time. A "필터 초기화" button now appears in the toolbar whenever any filter differs from the default and resets all of them at once (`hasActiveTaskFilters`/`DEFAULT_TASK_FILTERS` in `taskFilters.js`, 2026-07-12).
- [x] Calendar ICS export: WorkManager had JSON/CSV/PDF export but no interoperable calendar format, so events couldn't be taken into Google Calendar/Outlook/Apple Calendar. Added a client-side "ICS" button on the Calendar screen toolbar that exports the currently tag-filtered event list as a standard `.ics` file (`eventsToIcs`/`icsFilename` in `frontend/src/ics.js`, wired into `Calendar.jsx`, 2026-07-12).
- [x] AI settings connection test: saving an AI provider/key in Settings gave no feedback on whether the credentials actually worked until the next real AI parse silently fell back to local rules. Added a "연결 테스트" button that makes one minimal live call to the configured provider and reports success or a specific failure reason (bad key vs. server error) (`ai.test_connection` + `POST /api/settings/ai/test` in the backend, wired into `Settings.jsx`, 2026-07-12).
- [x] Saved task filter presets: re-entering the same search/status/priority/tag filter combination on the Tasks screen every session was repetitive. Added "필터 저장" / "저장된 필터" dropdown / "필터 삭제" controls that name and persist the current filter combination to localStorage (same pattern as task templates), so a saved view can be reapplied in one click (`frontend/src/taskFilterPresets.js`, wired into `Tasks.jsx`, 2026-07-13).
- [x] Task duplication: starting a new task similar to an existing one meant retyping title/dates/priority/tags from scratch, since recurrence rules only cover exact repeats. Added a "복제" button on each Gantt row that copies the task (title suffixed "(복사본)", schedule, priority, tags, parent, dependencies) into a new todo with progress/approval state reset (`buildTaskDuplicatePayload` in `frontend/src/taskFormPayload.js`, wired into `Tasks.jsx`/`App.jsx`, 2026-07-12).

- [x] Trash search/filter: the 휴지통 (trash) section only ever listed every soft-deleted row with no way to narrow it down, which got unwieldy once several tasks/events/todos/logs were deleted. Added a search box (title/content) and a type filter (업무/일정/오늘 할 일/업무 기록) to `TrashSection.jsx`, backed by a pure `filterTrashItems`/`trashTables` module with tests (`frontend/src/trashFilter.js`, 2026-07-13).
- [x] "Due this week" task status filter: the Tasks screen status filter only had "지연 업무" (overdue) to spot at-risk work, with no quick way to see everything coming due in the next 7 days for weekly planning. Added a `due_this_week` option to the existing status filter (`filterTasks` in `frontend/src/taskFilters.js`, wired into `Tasks.jsx`, 2026-07-13).
- [x] Task sort persistence: the Tasks screen "정렬" dropdown (일정순/우선순위순/진행률순/제목순) reset to 일정순 on every reload/revisit, losing a user's preferred order. Added `loadTaskSort`/`saveTaskSort` (localStorage, same pattern as the existing filter presets) in `frontend/src/taskHierarchy.js`, wired into `Tasks.jsx`, 2026-07-13.
- [x] Performance report CSV export: the 성과 (Performance) screen could only export the period report as Markdown, so pulling the activity timeline into a spreadsheet for management reporting meant retyping it. Added a "CSV 내보내기" button next to the existing Markdown export that downloads the same date/tag-filtered timeline as CSV (`timelineToCsv`/`timelineCsvFilename` in `frontend/src/csv.js`, wired into `Performance.jsx`, 2026-07-13).
- [x] Audit log CSV export: the 감사 로그 screen could only be read on-screen, with no way to pull it out for compliance review or an external auditor. Added a "CSV 내보내기" button that downloads the current search/entity-filtered results (timestamp/action/entity/id/detail) as CSV, reusing the export pattern from Tasks/Performance (`auditLogsToCsv`/`auditLogCsvFilename` in `frontend/src/csv.js`, wired into `AuditLog.jsx`, 2026-07-13).
- [x] AI multi-item parsing only split requests on newlines, so a single-line numbered list like "오늘해야할일 1.AAA 2. BBB 3. CCC" (user request #16) was parsed as one item instead of three. `rule_parse_multi` now also splits numbered list markers (`1.`/`2)`) within a line, and each new task/todo has its tags auto-matched against existing tasks' titles/tags via `_match_tags`; the remote-AI prompt was updated with the same instructions (`backend/app/ai.py`, 2026-07-13).
- [x] Work log time tracking: work logs had no notion of how long a piece of work took, so Performance reports could count activity but not effort. Added an optional `duration_minutes` field to work logs (backend `work_logs` table/`WorkLogPayload`), a minutes input on the Today screen's log entry/edit forms, and a "기록된 소요 시간" total in the Performance screen's stat tiles and Markdown report (`formatDuration` in `frontend/src/performanceReport.js`, 2026-07-13).
- [x] Task CSV import: WorkManager could export tasks to CSV/PDF but had no way to bring a bulk-prepared task list back in, so onboarding a backlog of existing work meant creating each task by hand. Added a "CSV 가져오기" button on the Tasks screen that reads a file in the same column format as the existing export (제목/우선순위/시작일/기한/태그/메모), skips rows without a title, and bulk-creates the rest via the existing `POST /api/tasks` (`parseTasksCsv` in `frontend/src/csv.js`, wired into `Tasks.jsx`/`App.jsx`, 2026-07-13).
- [x] Clear completed todos on the Today screen: the 오늘 할 일 quick-todo list had no bulk cleanup, so completed items had to be deleted one at a time to keep the list tidy. Added a "완료된 항목 정리 (n)" button that appears once at least one visible todo is completed and deletes all of them (reusing the existing delete-confirmation dialog) in one action (`Today.jsx`/`App.jsx`, 2026-07-13).
- [x] Task pinning: the Tasks screen sort dropdown (일정순/우선순위순/진행률순/제목순) always reordered the whole list, so an important task could scroll out of easy reach depending on the chosen sort. Added a "고정" star button on each Gantt row that keeps pinned tasks first among their siblings regardless of `sortBy`, backed by a localStorage set (same pattern as filter presets/task templates) in `frontend/src/taskPins.js`, applied inside `orderTasksHierarchically` in `frontend/src/taskHierarchy.js`, 2026-07-13.
- [x] Task estimated vs. actual time: work logs already tracked `duration_minutes`, but tasks had no planned-effort field to compare it against, so Performance reports could show time spent but never whether it matched the plan. Added a nullable `estimated_minutes` column on tasks (backend `TaskPayload`/`CONFIG`/`db.py` migration), an input on the task form, an "예상 Xh" badge on Gantt rows, and an "완료 업무 예상 소요 시간" stat/report line next to the existing "기록된 소요 시간" total (`backend/app/main.py` achievements summary, `frontend/src/performanceReport.js`, `frontend/src/screens/Performance.jsx`, 2026-07-13).
- [x] Calendar CSV export: the Calendar screen only offered an ICS download; Tasks/Performance/Audit Log all also had a CSV export for spreadsheet/reporting use, but events didn't. Added a "CSV" button next to the existing ICS export that downloads the current tag-filtered event list (제목/시작/종료/종일 여부/장소/태그/메모) as CSV (`eventsToCsv`/`eventCsvFilename` in `frontend/src/csv.js`, wired into `Calendar.jsx`, 2026-07-13).
- [x] Todo carryover: the Today screen's 오늘 할 일 list only ever fetched today's todos, so an incomplete todo from a past date silently disappeared from view instead of rolling forward like it does in other daily planners. Added a banner ("지난 할 일 n개가 남아 있습니다") with a one-click "오늘로 이월" button that bulk-updates those todos' `todo_date` to today (`overdueIncompleteTodos` in `frontend/src/todoCarryover.js`, wired into `Today.jsx`/`App.jsx`, 2026-07-13).
- [x] "No due date" task status filter: tasks left without a start/due date slipped through both the default 진행 업무 view and the 지연 업무 (overdue) filter, so they were easy to forget entirely. Added a `no_due_date` option to the existing status filter (`filterTasks` in `frontend/src/taskFilters.js`, wired into `Tasks.jsx`, 2026-07-13).
- [x] Fix task-delete parent/child data divergence: deleting a task with subtasks only cleared the hierarchy visually (the frontend already treated an orphaned `parent_id` as top-level), but the DB row still pointed `parent_id` at the now-deleted parent, so restoring that parent from trash silently re-nested the children again. `DELETE /api/tasks/{id}` now clears `parent_id` on direct children in the same transaction (audited as an `update`), and the delete-confirmation dialog tells the user how many subtasks will be promoted (`backend/app/main.py` delete_endpoint, `frontend/src/App.jsx`, regression test `test_deleting_parent_task_promotes_children_to_top_level` in `backend/tests/test_e2e_smoke.py`, 2026-07-13).
- [x] Todo recurrence: unlike tasks, the 오늘 할 일 quick-todo list had no repeat option, so daily/weekly chores had to be re-typed every day. Added a nullable `recurrence_rule` (매일/매주) on todos with the same idempotent spawn-on-completion pattern as recurring tasks (`spawn_recurring_todo` in `backend/app/main.py`, `backend/app/db.py` migration), a recurrence dropdown on the Today screen's add/edit todo forms, and a regression test `test_completing_recurring_todo_spawns_next_occurrence` in `backend/tests/test_api.py`, 2026-07-13.

## Removed (2026-07-10): Team/Assignee Features

WorkManager is a single-user personal tool; the team roster, per-member capacity, workload/reassignment UI, and mandatory task ownership built up over earlier iterations didn't fit that scope and were removed at the user's request (see docs/IMPROVEMENT_PLAN.md Wave 2 item 21). Assignee/collaborator info now goes in a task's memo or tags instead of a dedicated field. This removed everything previously listed here: team/member assignment and workload ownership, per-member daily capacity limits, quick reassignment, team roster management, assignee-required validation on active/done tasks, assignee reuse suggestions, assignee workload filtering, unassigned-task alerts, assignee load/capacity previews, and role-based permissions for managers/members/viewers (the last was never implemented, and is now explicitly out of scope — see the plan's "범위 밖" section).
