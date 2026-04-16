# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

TaskFlow is a local todo management + Gantt chart app for small teams (3-5 people). Japanese UI throughout.
Extensions can be added by placing packages inside the `extensions/` folder.

## Running the App

```bash
# Activate venv and install dependencies
source venv/Scripts/activate   # Windows Git Bash
pip install -r requirements.txt

# Start the server (serves on http://localhost:5050)
python app.py
# or: python -m taskflow
```

There are no tests, linters, or build steps configured.

## Project Structure

```
app.py                        # Thin launcher (5 lines) — do not add logic here
requirements.txt              # flask only
taskflow/                     # Python package (core)
  __init__.py                 # create_app() factory — extension loading happens here
  __main__.py                 # python -m taskflow entry point
  core/
    database.py               # DB connection, init_db(), migrations
    models.py                 # TASK_SELECT, TASK_FIELDS constants
    routes.py                 # All core API routes wrapped in register_routes(app)
  extensions/
    __init__.py               # discover_extensions(), register_extensions()
    base.py                   # TaskFlowExtension base class
  static/
    app.jsx                   # All React components + TaskFlow extension registry
    style.css                 # All CSS (light theme, CSS custom properties)
  templates/
    index.html                # HTML shell — dynamically loads extension CSS/JSX
extensions/                   # User extension packages (git-ignored per extension)
  README.md                   # How to write an extension
  example_labels/             # Example extension (labels feature)
tasks.db                      # SQLite DB (auto-created, git-ignored)
```

## Architecture

**Backend** (`taskflow/`): Flask app factory pattern. SQLite via Flask `g`. WAL mode + foreign keys. Core tables: `users`, `tasks`. Extensions add their own `ext_*` tables via `init_db()`.

**Frontend** (`taskflow/static/app.jsx`): SPA using React 18 + Babel standalone (CDN, no build step). `templates/index.html` dynamically loads extension CSS then JSX, then calls `TaskFlow._boot()` to render.

**Extension system**: Drop a Python package into `extensions/`. It is auto-discovered on startup. Backend extensions implement `TaskFlowExtension`; frontend extensions call `TaskFlow.registerExtension()`.

## Key React Components (in `taskflow/static/app.jsx`)

- `TaskFlow` — global registry object; holds `_tabs`, `_formFields`, `_columns`, `_headerActions`, `_hooks`
- `App` — root component; renders extension tabs, emits `task:created/updated/deleted` hooks
- `TaskListView` — table with extension column support via `TaskFlow.columns`
- `GanttChart` — day grid, task bars, today line; progress edited via click popover
- `TaskFormModal` — create/edit form; extension fields injected via `TaskFlow.formFields`
- `UserManagerModal` — add/remove team members

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/api/tasks` | List / create tasks |
| PUT/DELETE | `/api/tasks/<id>` | Update / delete task |
| GET/POST | `/api/users` | List / create users |
| DELETE | `/api/users/<id>` | Delete user (nullifies task assignments) |
| GET | `/api/extensions` | List loaded extensions with static file URLs |

## Data Model

- `tasks`: title, description, assignee_id (FK → users), start_date, estimated_hours (REAL, work hours), progress (0-100), priority (low/medium/high), status (todo/in_progress/done), parent_id (self-referential, unused in UI), sort_order
- `users`: name (unique), color (hex)
- `end_date` is **not stored in DB** — it is computed on the frontend from `start_date` + `estimated_hours` + `holidayMode` (skipping weekends and optionally Japanese public holidays). 1 day = 8 hours.

## Conventions

- All user-facing strings are in Japanese
- The frontend `api` helper object wraps fetch for GET/POST/PUT/DELETE — use it for API calls
- `TaskFlow.api` exposes the same helper to extensions
- Progress updates from the Gantt chart auto-set status: 0% → todo, 1-99% → in_progress, 100% → done
- `TASK_SELECT` and `TASK_FIELDS` constants in `taskflow/core/models.py` are shared across endpoints — update them when modifying the tasks schema
- Holiday mode (`weekends` / `weekends_holidays`) is stored in localStorage and applied globally to all end_date calculations via `enrichTasks()`
- Extension DB tables **must** use `ext_` prefix (e.g., `ext_labels`) and `CREATE TABLE IF NOT EXISTS`
- Extension JSX files **must** wrap code in an IIFE: `(() => { ... })()`

## Extension Quick Reference

**Backend** (`extensions/my_ext/__init__.py`):
```python
from taskflow.extensions.base import TaskFlowExtension
class Extension(TaskFlowExtension):
    name = 'my_ext'; label = 'サンプル'; version = '1.0'
    def get_blueprint(self): ...   # Flask Blueprint or None
    def init_db(self, db): ...     # CREATE TABLE IF NOT EXISTS ext_*
    def get_static_files(self): return {'jsx': ['my.jsx'], 'css': []}
```

**Frontend** (`extensions/my_ext/static/my.jsx`):
```js
(() => {
  TaskFlow.registerExtension({
    name: 'my_ext', label: 'サンプル',
    tabs: [{ id: 'my_ext', label: 'タブ名', icon: '🔧', component: MyView }],
    formFields: [{ component: MyFormField }],
    columns: [{ header: '列名', width: 80, render: (task) => <span/> }],
    headerActions: [{ component: MyButton }],
    hooks: { 'task:created': (d) => {}, 'task:updated': (d) => {}, 'task:deleted': (d) => {} },
  });
})();
```
