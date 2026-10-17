from flask import Flask, jsonify, request, send_from_directory

import evolution_logic
import nessie_service

app = Flask(__name__, static_folder="static")


def _with_wallet(state):
    try:
        state.update(nessie_service.wallet_snapshot())
    except nessie_service.NessieError as exc:
        state["wallet_error"] = str(exc)
    return state


@app.route("/")
def index():
    return send_from_directory("layout", "index.html")


@app.get("/api/character-state")
def character_state():
    return jsonify(_with_wallet(evolution_logic.get_character_state()))


@app.post("/api/complete-task")
def complete_task():
    data = request.get_json(silent=True) or {}
    try:
        xp_amount = int(data.get("xp", 10))
    except (TypeError, ValueError):
        return jsonify({"error": "xp must be an integer"}), 400

    title = data.get("title", "")
    state = evolution_logic.process_task_completion(
        data.get("category", "general"),
        task_title=title,
        xp_amount=xp_amount,
    )
    try:
        state["coins"] = nessie_service.deposit_task_reward(title)
        state["owned_cosmetics"] = nessie_service.wallet_snapshot()["owned_cosmetics"]
    except nessie_service.NessieError as exc:
        state["wallet_error"] = str(exc)
    return jsonify(state)


@app.post("/api/shop/buy")
def buy_shop_item():
    data = request.get_json(silent=True) or {}
    unlocked = evolution_logic.get_character_state()["unlocked_items"]
    try:
        result = nessie_service.purchase_shop_item(data.get("item_id"), unlocked)
    except nessie_service.NessieError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(result)


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
