# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

WorkManager — a personal task/schedule management PWA (tasks, Gantt hierarchy, calendar, todos, work logs) with Google OIDC login, Google Calendar sync, and optional AI assistance. All user-facing copy, README, and docs are in Korean; keep new UI text in Korean.

## Commands

### Backend (FastAPI + SQLite, Python 3.12)
```bash
cd backend
pip install -r requirements.txt
python -m unittest discover -s tests -v          # all tests (what CI runs)
python -m unittest tests.test_api.SomeClass.test_name   # single test
python -m compileall -q app                      # syntax gate (also in CI)
uvicorn app.main:app --reload                    # dev server on :8000
```

### Frontend (React 19 + Vite, Node 22)
```bash
cd frontend
npm ci
npm test                        # node --test src/*.test.js
node --test src/taskState.test.js   # single test file
npm run dev                     # vite dev server; proxies /api to :8000 (override with VITE_PROXY_TARGET)
npm run build
```

### Full stack
```bash
docker compose up -d --build    # web on :8080, api behind nginx /api/ proxy
```
CI (`.github/workflows/ci.yml`) runs frontend test + build, backend unittest + compileall, then `docker compose build`.

## Architecture

### Backend (`backend/app/`, 5 modules, no ORM)

- **`main.py`** — the whole API. The four data tables (`tasks`, `events`, `todos`, `work_logs`) share generated CRUD routes: the `CONFIG` dict maps table → allowed fields, and a `for _table in CONFIG` loop registers `/api/{table}` GET/POST/PATCH/DELETE. Adding a field to an entity means touching `CONFIG`, the Pydantic payload model (`MODELS`), `normalize()`, and the schema in `db.py`.
- Everything is **per-user scoped** (`user_id` column + `require_user` dependency) and **soft-deleted** (`deleted_at`; `/api/trash` + restore endpoints). Every write goes through `audit()` into `audit_logs`.
- **`update_item()` carries the task business rules**: approval workflow (`approval_status` → pending when a task becomes done; `schedule_approval_status` → pending when dates change), recurrence spawning on completion (`spawn_recurring_task`), legacy NULL-field repair, and parent/dependency validation with cycle prevention (`validate_task_links`). Validation runs Pydantic on the *merged* existing+patch resource.
- **`db.py`** — schema via `CREATE TABLE IF NOT EXISTS` plus additive migrations (`_add_column` guarded by `PRAGMA table_info`). SQLite in WAL mode. Never rename/drop columns; add and migrate.
- **`auth.py`** — Google OIDC only, email allowlist (`GOOGLE_ALLOWED_EMAIL`). Session tokens are stored SHA-256-hashed in the `sessions` table; cookie `wm_session`. Legacy single-user data migrates once to the `LEGACY_OWNER_EMAIL` account.
- **`google_calendar.py`** — incremental sync with per-calendar sync tokens and a lease in `google_sync_state`; local deletes tombstoned in `deleted_google_events`; conflicts stored on the event row (`conflict_remote_json`). Refresh tokens are encrypted with a key derived from `APP_SECRET` — changing `APP_SECRET` invalidates stored Google tokens.
- **`ai.py`** — OpenAI-compatible API. Per-user provider settings (`/api/settings/ai`, stored per vendor in `app_settings`) override `.env` defaults; unconfigured accounts fall back to local rule-based parsing (`source: "local-rules"`). All AI writes are two-step: preview (`/api/ai/parse` etc.) then explicit `/api/ai/apply` — never mutate data directly from AI output.
- Feature-request/changelog flow: public unauthenticated `/changelog` page and queue; admin mutations on `/api/admin/feature-requests/*` are gated by the `CODEX_ADMIN_TOKEN` bearer token.

### Frontend (`frontend/src/`)

- **No router.** `App.jsx` owns all server state and switches screens via the `?page=` query param (`screens/` = one component per page); `/changelog` path renders the public changelog. Mutations go through the `mutate(action, successMsg)` helper: run API call → full `refresh()` → toast.
- **`api.js`** is the single fetch wrapper; a 401 dispatches `AUTH_EXPIRED_EVENT` which logs the user out.
- **Pure logic lives in root-level modules** (`taskState.js`, `taskFilters.js`, `taskHierarchy.js`, `taskFormPayload.js`, `teamMemberCapacity.js`, …), each with a sibling `*.test.js` run by `node --test` — no test framework, no DOM. Put new computation there, not in components, so it's testable.
- Team member roster and per-member capacity limits are **localStorage-only** (`teamMembers.js`, `teamMemberCapacity.js`), not server data.
- PWA (`pwa.js` + `public/`): caches app shell only; data operations require the server.

## Conventions

- When shipping a user-visible change, the repo convention is to add an entry to `changelogUpdates` in `frontend/src/data.js` and tick the matching item in `docs/ROADMAP.md` (see git history).
- Dense, compact code style throughout (single-letter loop vars, minimal blank lines, multiple statements per line in JSX handlers) — match it rather than reformatting.
- Required env for a working login: `APP_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_ALLOWED_EMAIL` (see `.env.example`). AI keys are optional; core features work without them.
