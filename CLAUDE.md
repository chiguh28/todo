# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

TaskFlow is a local todo management + Gantt chart app for small teams (3-5 people). Japanese UI throughout.

## Running the App

```bash
# Activate venv and install dependencies
source venv/Scripts/activate   # Windows Git Bash
pip install -r requirements.txt

# Start the server (serves on http://localhost:5000)
python app.py
```

There are no tests, linters, or build steps configured.

## Project Structure

```
app.py                  # Flask backend (API + routing)
templates/index.html    # HTML shell (loads CSS/JS from static/)
static/
  style.css             # All CSS (dark theme, CSS custom properties)
  app.jsx               # All React components (transpiled in-browser by Babel)
tasks.db                # SQLite DB (auto-created on first run)
```

## Architecture

**Backend** (`app.py`): Flask app with SQLite. DB connection managed via Flask's `g` object with `teardown_appcontext`. Two tables: `users` and `tasks`. REST API at `/api/tasks` and `/api/users` (standard CRUD). WAL mode and foreign keys enabled. Default users seeded on first run.

**Frontend** (`static/app.jsx`): SPA using React 18 + Babel standalone (loaded from CDN, no build step). HTML template at `templates/index.html` is a minimal shell that loads the CSS and JSX. Babel transpiles JSX in-browser via `<script type="text/babel" src="...">`.

## Key React Components (in `static/app.jsx`)

- `App` — root component, manages state (tasks, users, filters, modals), two views toggled by `view` state
- `TaskListView` — table display with stats, filtering done at App level via `filteredTasks`
- `GanttChart` — day grid, task bars, today line; progress edited via click popover; sidebar scroll synced with chart
- `TaskFormModal` — create/edit task form
- `UserManagerModal` — add/remove team members

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/api/tasks` | List / create tasks |
| PUT/DELETE | `/api/tasks/<id>` | Update / delete task |
| GET/POST | `/api/users` | List / create users |
| DELETE | `/api/users/<id>` | Delete user (nullifies task assignments) |

## Data Model

- `tasks`: title, description, assignee_id (FK → users), start_date, estimated_hours (REAL, work hours), progress (0-100), priority (low/medium/high), status (todo/in_progress/done), parent_id (self-referential, unused in UI), sort_order
- `users`: name (unique), color (hex)
- `end_date` is **not stored in DB** — it is computed on the frontend from `start_date` + `estimated_hours` + `holidayMode` (skipping weekends and optionally Japanese public holidays). 1 day = 8 hours.

## Conventions

- All user-facing strings are in Japanese
- The frontend `api` helper object wraps fetch for GET/POST/PUT/DELETE — use it for API calls
- Progress updates from the Gantt chart auto-set status: 0% → todo, 1-99% → in_progress, 100% → done
- `TASK_SELECT` and `TASK_FIELDS` constants in `app.py` are shared across multiple endpoints — update them when modifying the tasks schema
- Holiday mode (`weekends` / `weekends_holidays`) is stored in localStorage and applied globally to all end_date calculations via `enrichTasks()`
