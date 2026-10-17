# SwampHacks2026

## How to run

The integrated task manager is on the `backend` branch.

### Setup

Install Python, clone this repository, and open a terminal in the
SwampHacks2026 folder.

Switch to the backend branch:

```bash
git fetch origin
git switch backend
git pull --ff-only
```

Create a virtual environment if you don't already have one:

```bash
python -m venv .venv
```

Install dependencies:

**Windows PowerShell**
```powershell
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
```

**macOS / Linux**
```bash
./.venv/bin/python -m pip install -r backend/requirements.txt
```

### Start the app

Run the integrated server:

**Windows PowerShell**
```powershell
.\.venv\Scripts\python.exe backend/server.py
```

**macOS / Linux**
```bash
./.venv/bin/python backend/server.py
```

Open http://127.0.0.1:5000 in your browser.

Use `backend/server.py` for the integrated app. The root-level `app.py`
is the earlier server.

### Features

- Create tasks with General, Fitness, Coding, or Creative categories
- Earn 10 XP when completing a task
- Unlock category-specific character gear
- Save tasks and progress across server restarts
- Prevent duplicate XP for repeated completion requests

### Local data

The SQLite database is created automatically at
`backend/instance/tasks.db` and is excluded from Git.

Each local installation starts with its own empty database.
No PostgreSQL or Docker setup is required.

The server runs in debug mode for local development.
Stop it with Ctrl+C in the terminal.