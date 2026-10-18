import sqlite3
from contextlib import closing
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

SHOP_ITEMS = [
    {
        "id": 1,
        "name": "Wizard Hat",
        "price": 50,
        "category": "accessories",
        "requires": None
    },
    {
        "id": 2,
        "name": "Knight Armor",
        "price": 100,
        "category": "clothes",
        "requires": None
    },
    {
        "id": 3,
        "name": "Forest Background",
        "price": 150,
        "category": "backgrounds",
        "requires": None
    },
    {
        "id": 4,
        "name": "Red Beret",
        "price": 50,
        "category": "accessories",
        "requires": "beret"
    },
    {
        "id": 5,
        "name": "Purple Beret",
        "price": 75,
        "category": "accessories",
        "requires": "beret"
    },
    {
        "id": 6,
        "name": "Blue Hoodie",
        "price": 80,
        "category": "clothes",
        "requires": "hoodie"
    },
    {
        "id": 7,
        "name": "Black Hoodie",
        "price": 100,
        "category": "clothes",
        "requires": "hoodie"
    },
    {
        "id": 8,
        "name": "Castle Background",
        "price": 150,
        "category": "backgrounds",
        "requires": None
    }
]

GEAR_REQUIREMENTS = {
    "beret": ("creative", 10),
    "hoodie": ("coding", 30)
}

EQUIPMENT_REWARDS = {
    "wizard_hat": ("general", 30),
    "black_shoes": ("fitness", 10),
    "headband": ("fitness", 30),
    "dagger": ("fitness", 60),
    "glasses": ("coding", 10),
    "cape": ("coding", 30),
    "wand": ("coding", 60),
    "cap": ("creative", 10),
    "bauldron": ("creative", 30),
    "crystal": ("creative", 60)
}

EQUIPMENT_SLOTS = {
    "wizard_hat": "head",
    "headband": "head",
    "cap": "head",
    "glasses": "face",
    "black_shoes": "feet",
    "cape": "back",
    "bauldron": "shoulders",
    "dagger": "hand",
    "wand": "hand",
    "crystal": "hand"
}


def shop_progress(connection):
    return dict(connection.execute(
        "SELECT category, xp FROM category_progress"
    ).fetchall())


def shop_item_unlocked(item, progress):
    requirement = item["requires"]

    if requirement is None:
        return True

    category, threshold = GEAR_REQUIREMENTS[requirement]
    return progress.get(category, 0) >= threshold


def available_equipment(progress):
    return [
        item
        for item, (category, threshold) in EQUIPMENT_REWARDS.items()
        if progress.get(category, 0) >= threshold
    ]


def saved_equipment(connection):
    equipped = []
    occupied_slots = set()

    rows = connection.execute(
        "SELECT item_id FROM equipped_gear ORDER BY item_id"
    )

    for row in rows:
        item_id = row[0]
        slot = EQUIPMENT_SLOTS.get(item_id)

        if slot is not None and slot not in occupied_slots:
            equipped.append(item_id)
            occupied_slots.add(slot)

    return equipped


def init_db():
    with closing(sqlite3.connect(DATABASE)) as connection, connection:
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

        columns = {
            row[1]
            for row in connection.execute("PRAGMA table_info(player)")
        }

        if "coins" not in columns:
            connection.execute(
                "ALTER TABLE player ADD COLUMN coins "
                "INTEGER NOT NULL DEFAULT 0 CHECK (coins >= 0)"
            )

        if "character_model" not in columns:
            connection.execute(
                "ALTER TABLE player ADD COLUMN character_model "
                "TEXT NOT NULL DEFAULT 'male' "
                "CHECK (character_model IN ('male', 'female'))"
            )

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
            "INSERT OR IGNORE INTO category_progress "
            "(category, xp) VALUES (?, 0)",
            [
                ("general",),
                ("fitness",),
                ("coding",),
                ("creative",)
            ]
        )

        connection.execute("""
            CREATE TABLE IF NOT EXISTS equipped_gear (
                item_id TEXT PRIMARY KEY
            )
        """)

        connection.execute("""
            CREATE TABLE IF NOT EXISTS inventory (
                item_id INTEGER PRIMARY KEY,
                purchased_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """)


@app.get("/")
def index():
    return send_from_directory(
        str(PROJECT_ROOT / "layout"),
        "index.html"
    )


@app.get("/api/health")
def health():
    return jsonify({
        "status": "ok",
        "message": "Backend is running!"
    })


@app.get("/api/tasks")
def get_tasks():
    with closing(sqlite3.connect(DATABASE)) as connection, connection:
        connection.row_factory = sqlite3.Row

        rows = connection.execute(
            "SELECT id, title, category, completed FROM tasks ORDER BY id"
        ).fetchall()

    return jsonify([
        {
            "id": row["id"],
            "title": row["title"],
            "category": row["category"],
            "completed": bool(row["completed"])
        }
        for row in rows
    ])


@app.post("/api/tasks")
def create_task():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "Send a JSON object"}), 400

    title = data.get("title")
    category = data.get("category", "general")

    if not isinstance(title, str) or not title.strip():
        return jsonify({"error": "Task title is required"}), 400

    if category not in ("general", "fitness", "coding", "creative"):
        return jsonify({"error": "Invalid category"}), 400

    title = title.strip()

    with closing(sqlite3.connect(DATABASE)) as connection, connection:
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
    with closing(sqlite3.connect(DATABASE)) as connection, connection:
        connection.row_factory = sqlite3.Row

        result = connection.execute(
            "UPDATE tasks SET completed = 1 "
            "WHERE id = ? AND completed = 0",
            (task_id,)
        )

        xp_awarded = 10 if result.rowcount == 1 else 0
        coins_awarded = 10 if result.rowcount == 1 else 0

        task = connection.execute(
            "SELECT * FROM tasks WHERE id = ?",
            (task_id,)
        ).fetchone()

        if task is None:
            return jsonify({"error": "Task not found"}), 404

        connection.execute(
            "UPDATE player SET xp = xp + ?, coins = coins + ? WHERE id = 1",
            (xp_awarded, coins_awarded)
        )

        connection.execute(
            "UPDATE category_progress SET xp = xp + ? WHERE category = ?",
            (xp_awarded, task["category"])
        )

        player = connection.execute(
            "SELECT xp, coins FROM player WHERE id = 1"
        ).fetchone()

    return jsonify({
        "task": {
            "id": task["id"],
            "title": task["title"],
            "category": task["category"],
            "completed": bool(task["completed"])
        },
        "xp_awarded": xp_awarded,
        "coins_awarded": coins_awarded,
        "coins": player["coins"],
        "xp": player["xp"],
        "level": 1 + player["xp"] // 30
    })


@app.patch("/api/tasks/<int:task_id>")
def edit_task(task_id):
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "Send a JSON object"}), 400

    title = data.get("title")
    category = data.get("category")

    if not isinstance(title, str) or not title.strip():
        return jsonify({"error": "Task title is required"}), 400

    if category not in ("general", "fitness", "coding", "creative"):
        return jsonify({"error": "Invalid category"}), 400

    title = title.strip()

    with closing(sqlite3.connect(DATABASE)) as connection, connection:
        result = connection.execute(
            """
            UPDATE tasks
            SET title = ?, category = ?
            WHERE id = ? AND completed = 0
            """,
            (title, category, task_id)
        )

        if result.rowcount == 0:
            task = connection.execute(
                "SELECT id FROM tasks WHERE id = ?",
                (task_id,)
            ).fetchone()

            if task is None:
                return jsonify({"error": "Task not found"}), 404

            return jsonify({
                "error": "Completed tasks cannot be edited"
            }), 409

    return jsonify({
        "id": task_id,
        "title": title,
        "category": category,
        "completed": False
    })


@app.delete("/api/tasks/<int:task_id>")
def delete_task(task_id):
    with closing(sqlite3.connect(DATABASE)) as connection, connection:
        result = connection.execute(
            "DELETE FROM tasks WHERE id = ? AND completed = 0",
            (task_id,)
        )

        if result.rowcount == 0:
            task = connection.execute(
                "SELECT id FROM tasks WHERE id = ?",
                (task_id,)
            ).fetchone()

            if task is None:
                return jsonify({"error": "Task not found"}), 404

            return jsonify({
                "error": "Completed tasks cannot be deleted"
            }), 409

    return jsonify({
        "message": "Task deleted",
        "id": task_id
    })


@app.get("/api/player")
def get_player():
    with closing(sqlite3.connect(DATABASE)) as connection, connection:
        connection.row_factory = sqlite3.Row

        player = connection.execute(
            "SELECT xp, coins, character_model FROM player WHERE id = 1"
        ).fetchone()

        equipped = saved_equipment(connection)

    xp = player["xp"]
    level = 1 + xp // 30

    gear_rewards = [
        {"id": "hat", "required_level": 2},
        {"id": "sunglasses", "required_level": 3},
        {"id": "jacket", "required_level": 4}
    ]

    return jsonify({
        "xp": xp,
        "coins": player["coins"],
        "character_model": player["character_model"],
        "equipped_items": equipped,
        "level": level,
        "xp_into_level": xp % 30,
        "xp_per_level": 30,
        "unlocked_gear": [
            gear["id"]
            for gear in gear_rewards
            if level >= gear["required_level"]
        ]
    })


@app.patch("/api/player/customization")
def update_customization():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "Send a JSON object"}), 400

    character_model = data.get("character_model")

    if character_model not in ("male", "female"):
        return jsonify({
            "error": "Character model must be male or female"
        }), 400

    equipment = data.get("equipped_items")

    if "equipped_items" in data and (
        not isinstance(equipment, list)
        or len(equipment) > len(EQUIPMENT_REWARDS)
        or any(not isinstance(item, str) for item in equipment)
    ):
        return jsonify({
            "error": "Equipped items must be a list of gear IDs"
        }), 400

    with closing(sqlite3.connect(DATABASE)) as connection, connection:
        connection.execute("BEGIN IMMEDIATE")

        if equipment is not None:
            allowed = set(
                available_equipment(shop_progress(connection))
            )

            if not set(equipment).issubset(allowed):
                return jsonify({
                    "error": "You can only equip unlocked gear"
                }), 403

            selected_items = set(equipment)
            selected_slots = [
                EQUIPMENT_SLOTS[item]
                for item in selected_items
            ]

            if len(selected_slots) != len(set(selected_slots)):
                return jsonify({
                    "error": "Choose only one item per equipment slot"
                }), 400

            connection.execute("DELETE FROM equipped_gear")

            connection.executemany(
                "INSERT INTO equipped_gear (item_id) VALUES (?)",
                [(item,) for item in sorted(set(equipment))]
            )

        connection.execute(
            "UPDATE player SET character_model = ? WHERE id = 1",
            (character_model,)
        )

        equipped = saved_equipment(connection)

    return jsonify({
        "character_model": character_model,
        "equipped_items": equipped
    })


@app.get("/api/character-state")
def character_state():
    with closing(sqlite3.connect(DATABASE)) as connection, connection:
        connection.execute("BEGIN")

        xp = shop_progress(connection)
        equipped = saved_equipment(connection)

        coins = connection.execute(
            "SELECT coins FROM player WHERE id = 1"
        ).fetchone()[0]

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
        if xp.get(category, 0) >= threshold
    ]

    dominant_trait = "general"
    highest_xp = 0

    for category in ("fitness", "coding", "creative", "general"):
        if xp.get(category, 0) > highest_xp:
            dominant_trait = category
            highest_xp = xp[category]

    return jsonify({
        "xp": xp,
        "unlocked_items": unlocked_items,
        "available_equipment": available_equipment(xp),
        "equipped_items": equipped,
        "coins": coins,
        "newly_unlocked": [],
        "dominant_trait": dominant_trait
    })


@app.post("/api/reset-state")
def reset_state():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "Send a JSON object"}), 400

    if data.get("mode") != "reset":
        return jsonify({"error": "Only reset mode is supported"}), 400

    with closing(sqlite3.connect(DATABASE)) as connection, connection:
        connection.execute(
            "UPDATE player SET xp = 0 WHERE id = 1"
        )

        connection.execute(
            "UPDATE category_progress SET xp = 0"
        )

        connection.execute("DELETE FROM equipped_gear")

    return character_state()


@app.get("/api/shop")
def get_shop():
    with closing(sqlite3.connect(DATABASE)) as connection, connection:
        connection.execute("BEGIN")

        coins = connection.execute(
            "SELECT coins FROM player WHERE id = 1"
        ).fetchone()[0]

        owned_ids = {
            row[0]
            for row in connection.execute(
                "SELECT item_id FROM inventory"
            ).fetchall()
        }

        progress = shop_progress(connection)

    return jsonify({
        "coins": coins,
        "items": [
            {
                **item,
                "owned": item["id"] in owned_ids,
                "unlocked": shop_item_unlocked(item, progress)
            }
            for item in SHOP_ITEMS
        ]
    })


@app.post("/api/shop/<int:item_id>/purchase")
def purchase_item(item_id):
    item = next(
        (item for item in SHOP_ITEMS if item["id"] == item_id),
        None
    )

    if item is None:
        return jsonify({"error": "Item not found"}), 404

    with closing(sqlite3.connect(DATABASE)) as connection, connection:
        connection.execute("BEGIN IMMEDIATE")

        owned = connection.execute(
            "SELECT item_id FROM inventory WHERE item_id = ?",
            (item_id,)
        ).fetchone()

        if owned is not None:
            return jsonify({
                "error": "You already own this item"
            }), 409

        if not shop_item_unlocked(item, shop_progress(connection)):
            return jsonify({
                "error": (
                    f"Unlock {item['requires']} "
                    "before purchasing this item"
                )
            }), 403

        result = connection.execute(
            """
            UPDATE player
            SET coins = coins - ?
            WHERE id = 1 AND coins >= ?
            """,
            (item["price"], item["price"])
        )

        if result.rowcount == 0:
            return jsonify({"error": "Not enough coins"}), 409

        connection.execute(
            "INSERT INTO inventory (item_id) VALUES (?)",
            (item_id,)
        )

        coins = connection.execute(
            "SELECT coins FROM player WHERE id = 1"
        ).fetchone()[0]

    return jsonify({
        "message": "Item purchased",
        "item": item,
        "coins": coins
    }), 201


if __name__ == "__main__":
    init_db()
    app.run(debug=True)