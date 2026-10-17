import sqlite3
from pathlib import Path

from flask import Flask, jsonify, request

app = Flask(__name__, instance_relative_config=True)

#this stores the database in backend/instance
Path(app.instance_path).mkdir(parents=True, exist_ok=True)
DATABASE = Path(app.instance_path) / "tasks.db"

def init_db():
    with sqlite3.connect(DATABASE) as connection:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                category TEXT NOT NULL DEFAULT 'general',
                completed INTEGER NOT NULL DEFAULT 0
            )
        """)

        connection.execute("""
            CREATE TABLE IF NOT EXISTS player (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                xp INTEGER NOT NULL DEFAULT 0
            )
        """)

        connection.execute("""
            INSERT OR IGNORE INTO player (id, xp)
            VALUES (1, 0)
        """)

@app.get("/api/health")
def health():
    return jsonify({
        "status": "ok",
        "message": "Backend is running!"
    })


@app.get("/api/tasks")
def get_tasks():
    with sqlite3.connect(DATABASE) as connection:
        connection.row_factory = sqlite3.Row
        rows = connection.execute(
            "SELECT id, title, category, completed FROM tasks ORDER BY id"
        ).fetchall()

    tasks = [
        {
            "id": row["id"],
            "title": row["title"],
            "category": row["category"],
            "completed": bool(row["completed"])
        }
        for row in rows
    ]

    return jsonify(tasks)

@app.post("/api/tasks")
def create_task():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "Send a JSON object"}), 400

    title = data.get("title")

    if not isinstance(title, str) or not title.strip():
        return jsonify({"error": "Task title is required"}), 400

    title = title.strip()

    with sqlite3.connect(DATABASE) as connection:
        cursor = connection.execute("INSERT INTO tasks (title) VALUES (?)", (title,))

        task_id = cursor.lastrowid

    return jsonify({
        "id": task_id,
        "title": title,
        "category": "general",
        "completed": False
    }), 201

@app.post("/api/tasks/<int:task_id>/complete")
def complete_task(task_id):
    with sqlite3.connect(DATABASE) as connection:
        connection.row_factory = sqlite3.Row

        # Only update a task if it is still unfinished.
        result = connection.execute(
            "UPDATE tasks SET completed = 1 WHERE id = ? AND completed = 0",
            (task_id,)
        )

        xp_awarded = 10 if result.rowcount == 1 else 0

        task = connection.execute(
            "SELECT * FROM tasks WHERE id = ?",
            (task_id,)
        ).fetchone()

        if task is None:
            return jsonify({"error": "Task not found"}), 404

        connection.execute(
            "UPDATE player SET xp = xp + ? WHERE id = 1",
            (xp_awarded,)
        )

        player = connection.execute(
            "SELECT xp FROM player WHERE id = 1"
        ).fetchone()

        total_xp = player["xp"]

    return jsonify({
        "task": {
            "id": task["id"],
            "title": task["title"],
            "category": task["category"],
            "completed": bool(task["completed"])
        },
        "xp_awarded": xp_awarded,
        "xp": total_xp,
        "level": 1 + total_xp // 30
    })

@app.get("/api/player")
def get_player():
    with sqlite3.connect(DATABASE) as connection:
        connection.row_factory = sqlite3.Row
        player = connection.execute(
            "SELECT xp FROM player WHERE id = 1"
        ).fetchone()

    xp = player["xp"]
    level = 1 + xp // 30

    gear_rewards = [
        {"id": "hat", "required_level": 2},
        {"id": "sunglasses", "required_level": 3},
        {"id": "jacket", "required_level": 4}
    ]

    unlocked_gear = [
        gear["id"]
        for gear in gear_rewards
        if level >= gear["required_level"]
    ]

    return jsonify({
        "xp": xp,
        "level": level,
        "xp_into_level": xp % 30,
        "xp_per_level": 30,
        "unlocked_gear": unlocked_gear
    })


init_db()

if __name__ == '__main__':
    app.run(debug=True)