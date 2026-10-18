import json
import os
import tempfile
import threading

from flask import Flask, jsonify, request, send_from_directory

import evolution_logic
import nessie_service

app = Flask(__name__, static_folder="static")

# ---------------------------------------------------------------------------
# Tasks + player choices (saved to a small JSON file so they survive restarts)
# ---------------------------------------------------------------------------
DATA_FILE = os.path.join(app.root_path, "questify_data.json")
TASK_CATEGORIES = ("general", "fitness", "coding", "creative")
CHARACTER_MODELS = ("male", "female")
TASK_XP = 10
MAX_TITLE_LENGTH = 200

_data_lock = threading.Lock()


def _default_data():
    return {"tasks": [], "next_task_id": 1, "character_model": "male"}


def _load_data():
    """Read the data file. Caller must hold _data_lock."""
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as handle:
            data = json.load(handle)
    except (FileNotFoundError, json.JSONDecodeError):
        return _default_data()
    merged = _default_data()
    merged.update(data if isinstance(data, dict) else {})
    return merged


def _save_data(data):
    """Write the data file atomically. Caller must hold _data_lock."""
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


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _with_wallet(state):
    try:
        state.update(nessie_service.wallet_snapshot())
    except nessie_service.NessieError as exc:
        state["wallet_error"] = str(exc)
    return state


def _award_task(category, title, xp_amount=TASK_XP):
    """Give XP (and the coin reward) for a finished task; returns the full state payload."""
    state = evolution_logic.process_task_completion(
        category,
        task_title=title,
        xp_amount=xp_amount,
    )
    try:
        state["coins"] = nessie_service.deposit_task_reward(title)
        state["owned_cosmetics"] = nessie_service.wallet_snapshot()["owned_cosmetics"]
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


# Always answer API problems with JSON (never an HTML error page) so the page can
# show a readable message instead of "Unexpected token '<'".
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


# ---------------------------------------------------------------------------
# Tasks
# ---------------------------------------------------------------------------
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


# ---------------------------------------------------------------------------
# Player (character choice)
# ---------------------------------------------------------------------------
@app.get("/api/player")
def get_player():
    with _data_lock:
        data = _load_data()
    return jsonify({"character_model": data["character_model"]})


@app.patch("/api/player/customization")
def update_customization():
    body = request.get_json(silent=True) or {}
    model = body.get("character_model")
    if model not in CHARACTER_MODELS:
        return jsonify({"error": f"character_model must be one of {', '.join(CHARACTER_MODELS)}"}), 400

    with _data_lock:
        data = _load_data()
        data["character_model"] = model
        _save_data(data)
    return jsonify({"character_model": model})


# ---------------------------------------------------------------------------
# Evolution state, shop, reset (unchanged behaviour)
# ---------------------------------------------------------------------------
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
    try:
        wallet = nessie_service.wallet_snapshot()
    except nessie_service.NessieError as exc:
        return jsonify({"error": str(exc)}), 503

    owned_ids = set(wallet["owned_cosmetics"])

    categories = {
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
            "category": categories[item_id],
            "requires": item["requires"],
            "owned": item_id in owned_ids,
        }
        for item_id, item in nessie_service.SHOP_ITEMS.items()
    ]

    return jsonify({
        "coins": wallet["coins"],
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
    data = request.get_json(silent=True) or {}
    mode = data.get("mode", "reset")
    try:
        state = evolution_logic.reset_or_demo_state(mode)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    if mode == "reset":
        try:
            state.update(nessie_service.reset_wallet())
        except nessie_service.NessieError as exc:
            state["wallet_error"] = str(exc)
    return jsonify(state)


if __name__ == "__main__":
    app.run(debug=True)