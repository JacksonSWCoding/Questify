import sqlite3
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory


PROJECT_ROOT = Path(__file__).resolve().parent.parent

app = Flask(
    __name__,
    instance_relative_config=True,
    static_folder=str(PROJECT_ROOT / "static"),
    static_url_path="/static"
)

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

        connection.execute("""
            CREATE TABLE IF NOT EXISTS category_progress (
                category TEXT PRIMARY KEY,
                xp INTEGER NOT NULL DEFAULT 0
            )
        """)

        connection.executemany(
            "INSERT OR IGNORE INTO category_progress (category, xp) VALUES (?, 0)",
            [
                ("general",),
                ("fitness",),
                ("coding",),
                ("creative",)
            ]
        )


@app.get("/")
def index():
    return send_from_directory(str(PROJECT_ROOT / "layout"), "index.html")


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

    category = data.get("category", "general")

    if category not in ("general", "fitness", "coding", "creative"):
        return jsonify({"error": "Invalid category"}), 400

    with sqlite3.connect(DATABASE) as connection:
        cursor = connection.execute(
            "INSERT INTO tasks (title, category) VALUES (?, ?)",
            (title, category)
        )

        task_id = cursor.lastrowid

    return jsonify({
        "id": task_id,
        "title": title,
        "category": category,
        "completed": False
    }), 201


@app.post("/api/tasks/<int:task_id>/complete")
def complete_task(task_id):
    with sqlite3.connect(DATABASE) as connection:
        connection.row_factory = sqlite3.Row

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

        connection.execute(
            "UPDATE category_progress SET xp = xp + ? WHERE category = ?",
            (xp_awarded, task["category"])
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

@app.get("/api/character-state")
def character_state():
    with sqlite3.connect(DATABASE) as connection:
        connection.row_factory = sqlite3.Row
        rows = connection.execute(
            "SELECT category, xp FROM category_progress"
        ).fetchall()

    xp = {row["category"]: row["xp"] for row in rows}

    rewards = {
        "fitness": [
            (10, "headband"),
            (30, "dumbbells"),
            (60, "muscle_upgrade")
        ],
        "coding": [
            (10, "glasses"),
            (30, "hoodie"),
            (60, "computer_desk")
        ],
        "creative": [
            (10, "beret"),
            (30, "paintbrush"),
            (60, "easel")
        ]
    }

    unlocked_items = [
        item
        for category, tiers in rewards.items()
        for threshold, item in tiers
        if xp[category] >= threshold
    ]

    dominant_trait = "general"
    highest_xp = 0

    for category in ("fitness", "coding", "creative", "general"):
        if xp[category] > highest_xp:
            dominant_trait = category
            highest_xp = xp[category]

    return jsonify({
        "xp": xp,
        "unlocked_items": unlocked_items,
        "newly_unlocked": [],
        "dominant_trait": dominant_trait
    })


init_db()

if __name__ == '__main__':
    app.run(debug=True)