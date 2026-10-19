import json
import os
import tempfile
import threading
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

import evolution_logic
import nessie_service

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent / ".env")
except ImportError:
    pass

app = Flask(__name__, static_folder="static")

DATA_DIR = "/tmp" if os.environ.get("VERCEL") else app.root_path
DATA_FILE = os.path.join(DATA_DIR, "questify_data.json")
TASK_CATEGORIES = ("general", "fitness", "coding", "creative")
CHARACTER_MODELS = ("male", "female")
TASK_XP = 10
MAX_TITLE_LENGTH = 200

_data_lock = threading.Lock()


def _default_data():
    return {"tasks": [], "next_task_id": 1, "character_model": "male"}


def _load_data():
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as handle:
            data = json.load(handle)
    except (FileNotFoundError, json.JSONDecodeError):
        return _default_data()
    merged = _default_data()
    merged.update(data if isinstance(data, dict) else {})
    return merged


def _save_data(data):
    directory = os.path.dirname(DATA_FILE) or "."
    fd, tmp_path = tempfile.mkstemp(dir=directory, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(data, handle, indent=2)
        os.replace(tmp_path, DATA_FILE)
    except Exception:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise


def _find_task(data, task_id):
    return next((task for task in data["tasks"] if task["id"] == task_id), None)


def _with_wallet(state):
    try:
        state.update(nessie_service.wallet_snapshot())
    except nessie_service.NessieError as exc:
        state["coins"] = 0
        state["owned_cosmetics"] = []
        state["wallet_error"] = str(exc)
    return state


def _award_task(category, title, xp_amount=TASK_XP):
    """Give XP and scale coin rewards as the character levels up and unlocks gear."""
    state = evolution_logic.process_task_completion(
        category,
        task_title=title,
        xp_amount=xp_amount,
    )
    level = state.get("level", 1)
    levels_gained = state.get("levels_gained", 0)
    newly_unlocked = state.get("newly_unlocked", [])

    # Coins start at 0 and scale up with character level + level-up/unlock bonuses
    reward_coins = (
        nessie_service.TASK_REWARD
        + (level - 1) * 5
        + (levels_gained * nessie_service.LEVEL_UP_BONUS)
        + (len(newly_unlocked) * nessie_service.LEVEL_UP_BONUS)
    )
    try:
        state["coins"] = nessie_service.deposit_task_reward(title, amount=reward_coins)
        snap = nessie_service.wallet_snapshot()
        state["owned_cosmetics"] = snap["owned_cosmetics"]
        state["equipped_cosmetics"] = snap["equipped_cosmetics"]
        state["coins_awarded"] = reward_coins
    except nessie_service.NessieError as exc:
        state["wallet_error"] = str(exc)
    return state


def _purchase(item_id):
    unlocked = evolution_logic.get_character_state()["unlocked_items"]
    try:
        result = nessie_service.purchase_shop_item(item_id, unlocked)
    except nessie_service.NessieError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(result)


@app.errorhandler(404)
def not_found(error):
    if request.path.startswith("/api/"):
        return jsonify({"error": f"No such API route: {request.method} {request.path}"}), 404
    return error


@app.errorhandler(405)
def method_not_allowed(error):
    if request.path.startswith("/api/"):
        return jsonify({"error": f"{request.method} is not allowed for {request.path}"}), 405
    return error


@app.errorhandler(500)
def server_error(error):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Server error. Check the Flask terminal for details."}), 500
    return error


@app.route("/")
def index():
    return send_from_directory("layout", "index.html")


@app.get("/favicon.ico")
def favicon():
    return send_from_directory("static", "favicon.svg", mimetype="image/svg+xml")


@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "message": "Questify API is running"})


@app.get("/api/tasks")
def list_tasks():
    with _data_lock:
        data = _load_data()
    return jsonify(data["tasks"])


@app.post("/api/tasks")
def create_task():
    body = request.get_json(silent=True) or {}
    title = str(body.get("title", "")).strip()
    category = str(body.get("category", "general")).strip().lower() or "general"

    if not title:
        return jsonify({"error": "title is required"}), 400
    if len(title) > MAX_TITLE_LENGTH:
        return jsonify({"error": f"title must be {MAX_TITLE_LENGTH} characters or fewer"}), 400
    if category not in TASK_CATEGORIES:
        return jsonify({"error": f"category must be one of {', '.join(TASK_CATEGORIES)}"}), 400

    with _data_lock:
        data = _load_data()
        task = {
            "id": data["next_task_id"],
            "title": title,
            "category": category,
            "completed": False,
        }
        data["next_task_id"] += 1
        data["tasks"].append(task)
        _save_data(data)
    return jsonify(task), 201


@app.patch("/api/tasks/<int:task_id>")
def edit_task(task_id):
    body = request.get_json(silent=True) or {}
    title = str(body.get("title", "")).strip()
    category = str(body.get("category", "general")).strip().lower()

    if not title:
        return jsonify({"error": "Task title is required"}), 400
    if category not in TASK_CATEGORIES:
        return jsonify({"error": "Invalid category"}), 400

    with _data_lock:
        data = _load_data()
        task = _find_task(data, task_id)
        if task is None:
            return jsonify({"error": "Task not found"}), 404
        if task.get("completed"):
            return jsonify({"error": "Completed tasks cannot be edited"}), 409
        task["title"] = title
        task["category"] = category
        _save_data(data)
    return jsonify(task)


@app.post("/api/tasks/<int:task_id>/complete")
def complete_task_by_id(task_id):
    with _data_lock:
        data = _load_data()
        task = _find_task(data, task_id)
        if task is None:
            return jsonify({"error": "Task not found"}), 404
        if task["completed"]:
            return jsonify({"error": "Task is already completed"}), 409
        task["completed"] = True
        _save_data(data)
        title, category = task["title"], task["category"]

    state = _award_task(category, title)
    state["xp_awarded"] = TASK_XP
    state["task"] = task
    return jsonify(state)


@app.delete("/api/tasks/<int:task_id>")
def delete_task(task_id):
    with _data_lock:
        data = _load_data()
        task = _find_task(data, task_id)
        if task is None:
            return jsonify({"error": "Task not found"}), 404
        data["tasks"] = [t for t in data["tasks"] if t["id"] != task_id]
        _save_data(data)
    return jsonify({"deleted": task_id})


@app.get("/api/player")
def get_player():
    with _data_lock:
        data = _load_data()
    char_state = evolution_logic.get_character_state()
    wallet = nessie_service.wallet_snapshot()
    return jsonify({
        "character_model": data["character_model"],
        "equipped_items": char_state["equipped_items"],
        "coins": wallet["coins"],
        "xp": char_state["total_xp"],
        "level": char_state["level"],
    })


@app.patch("/api/player/customization")
def update_customization():
    body = request.get_json(silent=True) or {}
    model = body.get("character_model")
    if model not in CHARACTER_MODELS:
        return jsonify({"error": f"character_model must be one of {', '.join(CHARACTER_MODELS)}"}), 400

    equipped_items = body.get("equipped_items")
    if isinstance(equipped_items, list):
        saved_equipped = evolution_logic.set_equipped_items(equipped_items)
    else:
        saved_equipped = evolution_logic.get_character_state()["equipped_items"]

    with _data_lock:
        data = _load_data()
        data["character_model"] = model
        _save_data(data)
    return jsonify({
        "character_model": model,
        "equipped_items": saved_equipped,
    })


@app.patch("/api/player/shop-equipment")
def update_shop_equipment():
    body = request.get_json(silent=True) or {}
    try:
        equipped = nessie_service.update_equipped_cosmetics(body)
    except nessie_service.NessieError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(equipped)


@app.get("/api/character-state")
def character_state():
    return jsonify(_with_wallet(evolution_logic.get_character_state()))


@app.post("/api/complete-task")
def complete_task():
    data = request.get_json(silent=True) or {}
    try:
        xp_amount = int(data.get("xp", TASK_XP))
    except (TypeError, ValueError):
        return jsonify({"error": "xp must be an integer"}), 400

    state = _award_task(data.get("category", "general"), data.get("title", ""), xp_amount)
    return jsonify(state)


@app.get("/api/shop")
def get_shop():
    wallet = nessie_service.wallet_snapshot()
    owned_ids = set(wallet["owned_cosmetics"])
    unlocked_ids = set(evolution_logic.get_character_state()["unlocked_items"])

    categories = {
        "red_hat": "accessories",
        "blue_hat": "accessories",
        "red_beret": "accessories",
        "purple_beret": "accessories",
        "blue_hoodie": "clothes",
        "black_hoodie": "clothes",
        "forest_background": "backgrounds",
        "castle_background": "backgrounds",
    }

    items = [
        {
            "id": item_id,
            "name": item["name"],
            "price": item["price"],
            "category": categories.get(item_id, "accessories"),
            "requires": item["requires"],
            "owned": item_id in owned_ids,
            "unlocked": item["requires"] is None or item["requires"] in unlocked_ids,
        }
        for item_id, item in nessie_service.SHOP_ITEMS.items()
    ]

    return jsonify({
        "coins": wallet["coins"],
        "equipped_cosmetics": wallet["equipped_cosmetics"],
        "items": items,
    })


@app.post("/api/shop/buy")
def buy_shop_item():
    data = request.get_json(silent=True) or {}
    return _purchase(data.get("item_id"))


@app.post("/api/shop/<item_id>/purchase")
def purchase_shop_item_by_id(item_id):
    return _purchase(item_id)


@app.post("/api/reset-state")
def reset_state():
    if os.environ.get("VERCEL") and os.environ.get("RESET_DISABLED", "").lower() in (
        "1",
        "true",
        "yes",
    ):
        return jsonify({"error": "Reset is disabled on this deployment"}), 403

    data = request.get_json(silent=True) or {}
    mode = data.get("mode", "reset")
    try:
        state = evolution_logic.reset_or_demo_state(mode)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    if mode == "reset":
        state.update(nessie_service.reset_wallet())
    else:
        state = _with_wallet(state)
    return jsonify(state)


if __name__ == "__main__":
    app.run(debug=True)