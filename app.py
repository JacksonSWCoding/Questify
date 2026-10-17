from flask import Flask, jsonify, request, send_from_directory

import evolution_logic

app = Flask(__name__, static_folder="static")


@app.route("/")
def index():
    return send_from_directory("layout", "index.html")


@app.get("/api/character-state")
def character_state():
    return jsonify(evolution_logic.get_character_state())


@app.post("/api/complete-task")
def complete_task():
    data = request.get_json(silent=True) or {}
    try:
        xp_amount = int(data.get("xp", 10))
    except (TypeError, ValueError):
        return jsonify({"error": "xp must be an integer"}), 400

    state = evolution_logic.process_task_completion(
        data.get("category", "general"),
        task_title=data.get("title", ""),
        xp_amount=xp_amount,
    )
    return jsonify(state)


@app.post("/api/reset-state")
def reset_state():
    data = request.get_json(silent=True) or {}
    try:
        state = evolution_logic.reset_or_demo_state(data.get("mode", "reset"))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(state)


if __name__ == "__main__":
    app.run(debug=True)
