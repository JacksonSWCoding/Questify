# sqlite saves tasks and player progress in a local database file
import sqlite3

# pathlib helps us create folders and build file paths
from pathlib import Path

# flask runs the server
# jsonify turns Python data into a JSON response
# request gives us access to data sent by the frontend
from flask import Flask, jsonify, request


# create the Flask application with a project-specific instance folder
app = Flask(__name__, instance_relative_config=True)

# create backend/instance if it does not already exist
Path(app.instance_path).mkdir(parents=True, exist_ok=True)

# set the location of our SQLite database file
DATABASE = Path(app.instance_path) / "tasks.db"


# create the database tables and starting player record
def init_db():
    # connect to SQLite and create the database file if needed
    # commit changes on success or roll them back on error
    with sqlite3.connect(DATABASE) as connection:
        # each task has a unique ID, title, category, and completion status
        # completed uses 0 for unfinished and 1 for finished
        # existing tables and data are preserved on later runs
        connection.execute("""
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                category TEXT NOT NULL DEFAULT 'general',
                completed INTEGER NOT NULL DEFAULT 0
            )
        """)

        # this MVP has one shared player profile, always with ID 1
        # the primary key and CHECK rule restrict the table to that profile
        connection.execute("""
            CREATE TABLE IF NOT EXISTS player (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                xp INTEGER NOT NULL DEFAULT 0
            )
        """)

        # start the player at 0 XP only if the profile does not exist
        # existing XP is preserved when the server restarts
        connection.execute("""
            INSERT OR IGNORE INTO player (id, xp)
            VALUES (1, 0)
        """)


# get requests read information
# this endpoint checks that the server is responding
@app.get("/api/health")
def health():
    return jsonify({
        "status": "ok",
        "message": "Backend is running!"
    })


# return all tasks, including completed ones
@app.get("/api/tasks")
def get_tasks():
    with sqlite3.connect(DATABASE) as connection:
        # allow access by column name, such as row["title"]
        connection.row_factory = sqlite3.Row

        # read every task, ordered by its ID
        rows = connection.execute(
            "SELECT id, title, category, completed FROM tasks ORDER BY id"
        ).fetchall()

    # convert database rows into dictionaries Flask can send as JSON
    tasks = [
        {
            "id": row["id"],
            "title": row["title"],
            "category": row["category"],
            # convert the database's 0/1 value into false/true
            "completed": bool(row["completed"])
        }
        for row in rows
    ]

    return jsonify(tasks)


# post requests send data or trigger changes
# this endpoint creates a task from JSON such as {"title": "Study"}
@app.post("/api/tasks")
def create_task():
    # read the JSON body, returning None for invalid or missing JSON
    data = request.get_json(silent=True)

    # require a JSON object, with status 400 indicating an invalid request
    if not isinstance(data, dict):
        return jsonify({"error": "Send a JSON object"}), 400

    title = data.get("title")

    # reject missing titles, non-text values, and whitespace-only titles
    if not isinstance(title, str) or not title.strip():
        return jsonify({"error": "Task title is required"}), 400

    # remove extra spaces from the beginning and end
    title = title.strip()

    with sqlite3.connect(DATABASE) as connection:
        # pass the title separately through a ? placeholder for safe SQL
        # the database defaults category to "general" and completed to 0
        cursor = connection.execute(
            "INSERT INTO tasks (title) VALUES (?)",
            (title,)
        )

        # get the unique ID assigned to the new task
        task_id = cursor.lastrowid

    # return the created task, with status 201 indicating successful creation
    return jsonify({
        "id": task_id,
        "title": title,
        "category": "general",
        "completed": False
    }), 201


# take the task ID from the URL, such as /api/tasks/2/complete
@app.post("/api/tasks/<int:task_id>/complete")
def complete_task(task_id):
    # complete the task and award XP in one transaction
    # both changes are saved together when this block succeeds
    with sqlite3.connect(DATABASE) as connection:
        connection.row_factory = sqlite3.Row

        # only change a task if it is still unfinished
        # repeating the request will not update an already-completed task
        result = connection.execute(
            "UPDATE tasks SET completed = 1 WHERE id = ? AND completed = 0",
            (task_id,)
        )

        # award 10 XP only if this request changed one unfinished task
        xp_awarded = 10 if result.rowcount == 1 else 0

        # read the task's updated details
        task = connection.execute(
            "SELECT * FROM tasks WHERE id = ?",
            (task_id,)
        ).fetchone()

        # return status 404 if no task exists with that ID
        if task is None:
            return jsonify({"error": "Task not found"}), 404

        # add the reward to the player's saved XP
        connection.execute(
            "UPDATE player SET xp = xp + ? WHERE id = 1",
            (xp_awarded,)
        )

        # read the updated total so the frontend can display it
        player = connection.execute(
            "SELECT xp FROM player WHERE id = 1"
        ).fetchone()

        total_xp = player["xp"]

    # return the completed task, this request's reward, and total progress
    return jsonify({
        "task": {
            "id": task["id"],
            "title": task["title"],
            "category": task["category"],
            "completed": bool(task["completed"])
        },
        "xp_awarded": xp_awarded,
        "xp": total_xp,
        # start at level 1 and gain a level for every full 30 XP
        "level": 1 + total_xp // 30
    })


# return player progress and available gear for the character display
@app.get("/api/player")
def get_player():
    with sqlite3.connect(DATABASE) as connection:
        connection.row_factory = sqlite3.Row

        player = connection.execute(
            "SELECT xp FROM player WHERE id = 1"
        ).fetchone()

    xp = player["xp"]

    # use integer division so 30 XP gives level 2 and 60 XP gives level 3
    level = 1 + xp // 30

    # define which level unlocks each item
    # these IDs must match the names used by the frontend
    gear_rewards = [
        {"id": "hat", "required_level": 2},
        {"id": "sunglasses", "required_level": 3},
        {"id": "jacket", "required_level": 4}
    ]

    # include every item whose required level the player has reached
    # the frontend decides how to display the unlocked items
    unlocked_gear = [
        gear["id"]
        for gear in gear_rewards
        if level >= gear["required_level"]
    ]

    return jsonify({
        "xp": xp,
        "level": level,
        # use the remainder so 40 total XP means 10 into this level
        "xp_into_level": xp % 30,
        "xp_per_level": 30,
        "unlocked_gear": unlocked_gear
    })


# ensure the database is ready when this module loads
init_db()

# start the server when this file is run directly
if __name__ == '__main__':
    # debug mode reloads saved changes and shows detailed errors
    # use it for local development only
    app.run(debug=True)