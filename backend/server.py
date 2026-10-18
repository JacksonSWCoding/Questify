import json
import os
import sqlite3
from contextlib import closing
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

PROJECT_ROOT = Path(__file__).resolve().parent.parent

try:
    from dotenv import load_dotenv
    load_dotenv(PROJECT_ROOT / ".env")
except ImportError:
    pass

INSTANCE_DIR = "/tmp/instance" if os.environ.get("VERCEL") else str(PROJECT_ROOT / "instance")

app = Flask(
    __name__,
    instance_path=INSTANCE_DIR,
    instance_relative_config=True,
    static_folder=str(PROJECT_ROOT / "static"),
    static_url_path="/static"
)

Path(app.instance_path).mkdir(parents=True, exist_ok=True)
DATABASE = Path(app.instance_path) / "tasks.db"

SHOP_ITEMS = [
    {"id": "red_hat", "name": "Red Hat", "price": 50, "category": "accessories", "requires": "cap"},
    {"id": "blue_hat", "name": "Blue Hat", "price": 75, "category": "accessories", "requires": "cap"},
    {"id": "blue_hoodie", "name": "Blue Hoodie", "price": 80, "category": "clothes", "requires": "cape"},
    {"id": "black_hoodie", "name": "Black Hoodie", "price": 100, "category": "clothes", "requires": "cape"},
    {"id": "forest_background", "name": "Forest Background", "price": 100, "category": "backgrounds", "requires": None},
    {"id": "castle_background", "name": "Castle Background", "price": 150, "category": "backgrounds", "requires": None},
]

SHOP_ITEM_ALIASES = {
    "red_beret": "red_hat",
    "purple_beret": "blue_hat",
}

SHOP_BY_ID = {item["id"]: item for item in SHOP_ITEMS}
COSMETIC_SLOTS = ("accessories", "clothes", "backgrounds")
DEFAULT_EQUIPPED_COSMETICS = {slot: None for slot in COSMETIC_SLOTS}

GEAR_REQUIREMENTS = {
    "cap": ("creative", 10),
    "cape": ("coding", 30),
    "beret": ("creative", 10),
    "hoodie": ("coding", 30),
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


def normalize_shop_item_id(item_id):
    return SHOP_ITEM_ALIASES.get(item_id, item_id)


def load_equipped_cosmetics(connection):
    row = connection.execute(
        "SELECT equipped_cosmetics FROM player WHERE id = 1"
    ).fetchone()

    if row is None or not row[0]:
        return dict(DEFAULT_EQUIPPED_COSMETICS)

    try:
        data = json.loads(row[0])
    except (TypeError, json.JSONDecodeError):
        return dict(DEFAULT_EQUIPPED_COSMETICS)

    if not isinstance(data, dict):
        return dict(DEFAULT_EQUIPPED_COSMETICS)

    payload = dict(DEFAULT_EQUIPPED_COSMETICS)
    for slot in COSMETIC_SLOTS:
        value = data.get(slot)
        if value is None:
            continue
        if not isinstance(value, str):
            return dict(DEFAULT_EQUIPPED_COSMETICS)
        item_id = normalize_shop_item_id(value)
        item = SHOP_BY_ID.get(item_id)
        if item is None or item["category"] != slot:
            return dict(DEFAULT_EQUIPPED_COSMETICS)
        payload[slot] = item_id

    return payload


def parse_equipped_cosmetics_payload(data):
    if not isinstance(data, dict):
        return None

    payload = dict(DEFAULT_EQUIPPED_COSMETICS)
    for slot in COSMETIC_SLOTS:
        value = data.get(slot)
        if value is None:
            continue
        if not isinstance(value, str):
            return None
        item_id = normalize_shop_item_id(value)
        item = SHOP_BY_ID.get(item_id)
        if item is None or item["category"] != slot:
            return None
        payload[slot] = item_id

    return payload


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
    rows = connection.execute("SELECT item_id FROM equipped_gear ORDER BY item_id")
    for row in rows:
        item_id = row[0]
        slot = EQUIPMENT_SLOTS.get(item_id)
        if slot is not None and slot not in occupied_slots:
            equipped.append(item_id)
            occupied_slots.add(slot)
    return equipped


def dominant_trait_for(xp):
    dominant = "general"
    highest = 0
    for category in ("fitness", "coding", "creative", "general"):
        if xp.get(category, 0) > highest:
            dominant = category
            highest = xp[category]
    return dominant


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
        columns = {row[1] for row in connection.execute("PRAGMA table_info(player)")}
        if "coins" not in columns:
            connection.execute(
                "ALTER TABLE player ADD COLUMN coins INTEGER NOT NULL DEFAULT 0 CHECK (coins >= 0)"
            )
        if "character_model" not in columns:
            connection.execute(
                "ALTER TABLE player ADD COLUMN character_model TEXT NOT NULL DEFAULT 'male' "
                "CHECK (character_model IN ('male', 'female'))"
            )
        if "equipped_cosmetics" not in columns:
            connection.execute("ALTER TABLE player ADD COLUMN equipped_cosmetics TEXT")

        connection.execute("INSERT OR IGNORE INTO player (id, xp) VALUES (1, 0)")
        connection.execute("""
            CREATE TABLE IF NOT EXISTS category_progress (
                category TEXT PRIMARY KEY,
                xp INTEGER NOT NULL DEFAULT 0
            )
        """)
        connection.executemany(
            "INSERT OR IGNORE INTO category_progress (category, xp) VALUES (?, 0)",
            [("general",), ("fitness",), ("coding",), ("creative",)]
        )
        connection.execute("CREATE TABLE IF NOT EXISTS equipped_gear (item_id TEXT PRIMARY KEY)")
        connection.execute("""
            CREATE TABLE IF NOT EXISTS inventory (
                item_id TEXT PRIMARY KEY,
                purchased_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """)


@app.get("/")
def index():
    return send_from_directory(str(PROJECT_ROOT / "layout"), "index.html")


@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "message": "Backend is running!"})


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
        task = connection.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if task is None:
            return jsonify({"error": "Task not found"}), 404

        before_progress = shop_progress(connection)
        before_unlocked = set(available_equipment(before_progress))
        old_player = connection.execute("SELECT xp, coins FROM player WHERE id = 1").fetchone()
        old_level = 1 + (old_player["xp"] // 30)

        result = connection.execute(
            "UPDATE tasks SET completed = 1 WHERE id = ? AND completed = 0",
            (task_id,)
        )

        xp_awarded = 10 if result.rowcount == 1 else 0
        if xp_awarded > 0:
            connection.execute(
                "UPDATE category_progress SET xp = xp + ? WHERE category = ?",
                (xp_awarded, task["category"])
            )

        after_progress = shop_progress(connection)
        after_unlocked = available_equipment(after_progress)
        newly_unlocked = [i for i in after_unlocked if i not in before_unlocked]

        # Auto-equip newly unlocked items into their slot
        if newly_unlocked:
            current_equipped = saved_equipment(connection)
            for new_item in newly_unlocked:
                new_slot = EQUIPMENT_SLOTS.get(new_item)
                current_equipped = [
                    i for i in current_equipped if EQUIPMENT_SLOTS.get(i) != new_slot
                ]
                current_equipped.append(new_item)
            connection.execute("DELETE FROM equipped_gear")
            connection.executemany(
                "INSERT INTO equipped_gear (item_id) VALUES (?)",
                [(i,) for i in current_equipped]
            )

        new_total_xp = old_player["xp"] + xp_awarded
        new_level = 1 + (new_total_xp // 30)
        levels_gained = max(0, new_level - old_level)

        coins_awarded = (
            (10 + (new_level - 1) * 5 + levels_gained * 15 + len(newly_unlocked) * 15)
            if xp_awarded > 0 else 0
        )

        connection.execute(
            "UPDATE player SET xp = xp + ?, coins = coins + ? WHERE id = 1",
            (xp_awarded, coins_awarded)
        )

        player = connection.execute("SELECT xp, coins FROM player WHERE id = 1").fetchone()
        equipped = saved_equipment(connection)

    return jsonify({
        "task": {
            "id": task["id"],
            "title": task["title"],
            "category": task["category"],
            "completed": True
        },
        "xp_awarded": xp_awarded,
        "coins_awarded": coins_awarded,
        "coins": player["coins"],
        "xp": after_progress,
        "total_xp": player["xp"],
        "level": new_level,
        "unlocked_items": after_unlocked,
        "available_equipment": after_unlocked,
        "equipped_items": equipped,
        "newly_unlocked": newly_unlocked,
        "dominant_trait": dominant_trait_for(after_progress),
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
            "UPDATE tasks SET title = ?, category = ? WHERE id = ? AND completed = 0",
            (title, category, task_id)
        )
        if result.rowcount == 0:
            task = connection.execute("SELECT id FROM tasks WHERE id = ?", (task_id,)).fetchone()
            if task is None:
                return jsonify({"error": "Task not found"}), 404
            return jsonify({"error": "Completed tasks cannot be edited"}), 409
    return jsonify({"id": task_id, "title": title, "category": category, "completed": False})


@app.delete("/api/tasks/<int:task_id>")
def delete_task(task_id):
    with closing(sqlite3.connect(DATABASE)) as connection, connection:
        result = connection.execute(
            "DELETE FROM tasks WHERE id = ? AND completed = 0",
            (task_id,)
        )
        if result.rowcount == 0:
            task = connection.execute("SELECT id FROM tasks WHERE id = ?", (task_id,)).fetchone()
            if task is None:
                return jsonify({"error": "Task not found"}), 404
            return jsonify({"error": "Completed tasks cannot be deleted"}), 409
    return jsonify({"message": "Task deleted", "id": task_id})


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
    return jsonify({
        "xp": xp,
        "coins": player["coins"],
        "character_model": player["character_model"],
        "equipped_items": equipped,
        "level": level,
        "xp_into_level": xp % 30,
        "xp_per_level": 30,
    })


@app.patch("/api/player/customization")
def update_customization():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Send a JSON object"}), 400
    character_model = data.get("character_model")
    if character_model not in ("male", "female"):
        return jsonify({"error": "Character model must be male or female"}), 400
    equipment = data.get("equipped_items")
    with closing(sqlite3.connect(DATABASE)) as connection, connection:
        connection.execute("BEGIN IMMEDIATE")
        if isinstance(equipment, list):
            allowed = set(available_equipment(shop_progress(connection)))
            valid_items = [i for i in equipment if i in allowed and i in EQUIPMENT_SLOTS]
            connection.execute("DELETE FROM equipped_gear")
            connection.executemany(
                "INSERT INTO equipped_gear (item_id) VALUES (?)",
                [(item,) for item in sorted(set(valid_items))]
            )
        connection.execute(
            "UPDATE player SET character_model = ? WHERE id = 1",
            (character_model,)
        )
        equipped = saved_equipment(connection)
    return jsonify({"character_model": character_model, "equipped_items": equipped})


@app.get("/api/character-state")
def character_state():
    with closing(sqlite3.connect(DATABASE)) as connection, connection:
        connection.execute("BEGIN")
        xp = shop_progress(connection)
        equipped = saved_equipment(connection)
        coins = connection.execute("SELECT coins FROM player WHERE id = 1").fetchone()[0]
        owned_ids = [
            normalize_shop_item_id(row[0])
            for row in connection.execute("SELECT item_id FROM inventory").fetchall()
        ]
    unlocked_items = available_equipment(xp)
    return jsonify({
        "xp": xp,
        "unlocked_items": unlocked_items,
        "available_equipment": unlocked_items,
        "equipped_items": equipped,
        "owned_cosmetics": owned_ids,
        "coins": coins,
        "newly_unlocked": [],
        "dominant_trait": dominant_trait_for(xp)
    })


@app.post("/api/reset-state")
def reset_state():
    with closing(sqlite3.connect(DATABASE)) as connection, connection:
        connection.execute(
            "UPDATE player SET xp = 0, coins = 0, equipped_cosmetics = NULL WHERE id = 1"
        )
        connection.execute("UPDATE category_progress SET xp = 0")
        connection.execute("DELETE FROM equipped_gear")
        connection.execute("DELETE FROM inventory")
    return character_state()


@app.get("/api/shop")
def get_shop():
    with closing(sqlite3.connect(DATABASE)) as connection, connection:
        connection.execute("BEGIN")
        coins = connection.execute("SELECT coins FROM player WHERE id = 1").fetchone()[0]
        owned_ids = {
            normalize_shop_item_id(row[0])
            for row in connection.execute("SELECT item_id FROM inventory").fetchall()
        }
        progress = shop_progress(connection)
        equipped_cosmetics = load_equipped_cosmetics(connection)
    return jsonify({
        "coins": coins,
        "equipped_cosmetics": equipped_cosmetics,
        "items": [
            {
                **item,
                "owned": item["id"] in owned_ids,
                "unlocked": shop_item_unlocked(item, progress)
            }
            for item in SHOP_ITEMS
        ]
    })


@app.patch("/api/player/shop-equipment")
def update_shop_equipment():
    payload = parse_equipped_cosmetics_payload(request.get_json(silent=True))
    if payload is None:
        return jsonify({"error": "Invalid shop equipment payload"}), 400
    with closing(sqlite3.connect(DATABASE)) as connection, connection:
        connection.execute("BEGIN IMMEDIATE")
        owned_ids = {
            normalize_shop_item_id(row[0])
            for row in connection.execute("SELECT item_id FROM inventory").fetchall()
        }
        for slot in COSMETIC_SLOTS:
            item_id = payload[slot]
            if item_id is not None and item_id not in owned_ids:
                return jsonify({"error": f"You do not own {item_id}"}), 403
        connection.execute(
            "UPDATE player SET equipped_cosmetics = ? WHERE id = 1",
            (json.dumps(payload),)
        )
    return jsonify(payload)


@app.post("/api/shop/<item_id>/purchase")
def purchase_item(item_id):
    item_id = normalize_shop_item_id(item_id)
    item = next((i for i in SHOP_ITEMS if i["id"] == item_id), None)
    if item is None:
        return jsonify({"error": "Item not found"}), 404
    with closing(sqlite3.connect(DATABASE)) as connection, connection:
        connection.execute("BEGIN IMMEDIATE")
        owned = connection.execute(
            "SELECT item_id FROM inventory WHERE item_id = ?", (item_id,)
        ).fetchone()
        if owned is not None:
            return jsonify({"error": "You already own this item"}), 409
        if not shop_item_unlocked(item, shop_progress(connection)):
            return jsonify({"error": f"Unlock {item['requires']} before purchasing this item"}), 403
        result = connection.execute(
            "UPDATE player SET coins = coins - ? WHERE id = 1 AND coins >= ?",
            (item["price"], item["price"])
        )
        if result.rowcount == 0:
            return jsonify({"error": "Not enough coins"}), 409
        connection.execute("INSERT INTO inventory (item_id) VALUES (?)", (item_id,))
        coins = connection.execute("SELECT coins FROM player WHERE id = 1").fetchone()[0]
    return jsonify({"message": "Item purchased", "item": item, "coins": coins}), 201


init_db()

if __name__ == "__main__":
    app.run(debug=True)