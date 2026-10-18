"""Category Evolution System: per-category XP, gear unlocks, and dominant trait."""

import json
import os
from pathlib import Path
import threading

CATEGORIES = ("fitness", "coding", "creative", "general")
INSTANCE_DIR = Path("/tmp/instance") if os.environ.get("VERCEL") else (Path(__file__).resolve().parent / "instance")
STATE_PATH = INSTANCE_DIR / "evolution_state.json"

UNLOCK_THRESHOLDS = {
    "general": [(30, "wizard_hat")],
    "fitness": [(10, "black_shoes"), (30, "headband"), (60, "dagger")],
    "coding": [(10, "glasses"), (30, "cape"), (60, "wand")],
    "creative": [(10, "cap"), (30, "bauldron"), (60, "crystal")],
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
    "crystal": "hand",
}

DEMO_XP_PRESETS = {
    "reset": {"fitness": 0, "coding": 0, "creative": 0, "general": 0},
    "demo": {"fitness": 50, "coding": 20, "creative": 0, "general": 5},
    "max": {"fitness": 60, "coding": 60, "creative": 60, "general": 30},
}

_lock = threading.Lock()


def _compute_dominant_trait(xp):
    best_category, best_xp = "general", 0
    for category in CATEGORIES:
        if xp.get(category, 0) > best_xp:
            best_category, best_xp = category, xp[category]
    return best_category


def _recompute_unlocks(xp):
    return [
        item_id
        for category, tiers in UNLOCK_THRESHOLDS.items()
        for threshold, item_id in tiers
        if xp.get(category, 0) >= threshold
    ]


def _equip_into_slot(equipped_list, item_id):
    slot = EQUIPMENT_SLOTS.get(item_id)
    if not slot:
        return equipped_list
    filtered = [i for i in equipped_list if EQUIPMENT_SLOTS.get(i) != slot]
    filtered.append(item_id)
    return filtered


def _load_state():
    if STATE_PATH.exists():
        try:
            data = json.loads(STATE_PATH.read_text(encoding="utf-8"))
            xp = {c: int(data.get("xp", {}).get(c, 0)) for c in CATEGORIES}
            unlocked = _recompute_unlocks(xp)
            equipped = [
                i for i in data.get("equipped_items", [])
                if i in unlocked and i in EQUIPMENT_SLOTS
            ]
            return {
                "xp": xp,
                "unlocked_items": unlocked,
                "equipped_items": equipped,
                "dominant_trait": _compute_dominant_trait(xp),
            }
        except (OSError, ValueError, TypeError):
            pass
    return {
        "xp": dict(DEMO_XP_PRESETS["reset"]),
        "unlocked_items": [],
        "equipped_items": [],
        "dominant_trait": "general",
    }


def _save_state(state):
    try:
        STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
        STATE_PATH.write_text(json.dumps(state, indent=2), encoding="utf-8")
    except OSError:
        pass


_state = _load_state()


def _snapshot(newly_unlocked):
    unlocked = list(_state["unlocked_items"])
    total_xp = sum(_state["xp"].values())
    return {
        "xp": dict(_state["xp"]),
        "total_xp": total_xp,
        "level": 1 + (total_xp // 30),
        "unlocked_items": unlocked,
        "available_equipment": unlocked,
        "equipped_items": list(_state["equipped_items"]),
        "newly_unlocked": list(newly_unlocked),
        "dominant_trait": _state["dominant_trait"],
    }


def get_character_state():
    with _lock:
        return _snapshot([])


def set_equipped_items(items):
    with _lock:
        unlocked = set(_state["unlocked_items"])
        equipped = []
        occupied_slots = set()
        for item_id in items:
            slot = EQUIPMENT_SLOTS.get(item_id)
            if item_id in unlocked and slot and slot not in occupied_slots:
                equipped.append(item_id)
                occupied_slots.add(slot)
        _state["equipped_items"] = equipped
        _save_state(_state)
        return list(equipped)


def process_task_completion(category, task_title="", xp_amount=10):
    """Award XP to the chosen category, unlock gear, and auto-equip newly unlocked items."""
    category = (category or "general").strip().lower()
    if category not in CATEGORIES:
        category = "general"
    xp_amount = max(int(xp_amount), 0)

    with _lock:
        old_total_xp = sum(_state["xp"].values())
        old_level = 1 + (old_total_xp // 30)

        _state["xp"][category] += xp_amount
        new_cat_xp = _state["xp"][category]

        new_total_xp = sum(_state["xp"].values())
        new_level = 1 + (new_total_xp // 30)

        newly_unlocked = []
        for threshold, item_id in UNLOCK_THRESHOLDS.get(category, []):
            if new_cat_xp >= threshold and item_id not in _state["unlocked_items"]:
                _state["unlocked_items"].append(item_id)
                newly_unlocked.append(item_id)
                _state["equipped_items"] = _equip_into_slot(_state["equipped_items"], item_id)

        _state["dominant_trait"] = _compute_dominant_trait(_state["xp"])
        _save_state(_state)
        snap = _snapshot(newly_unlocked)
        snap["levels_gained"] = max(0, new_level - old_level)
        return snap


def reset_or_demo_state(mode="reset"):
    if mode not in DEMO_XP_PRESETS:
        raise ValueError(f"Unknown mode {mode!r}; expected one of {sorted(DEMO_XP_PRESETS)}")

    with _lock:
        _state["xp"] = dict(DEMO_XP_PRESETS[mode])
        _state["unlocked_items"] = _recompute_unlocks(_state["xp"])
        _state["equipped_items"] = []
        for item_id in _state["unlocked_items"]:
            _state["equipped_items"] = _equip_into_slot(_state["equipped_items"], item_id)
        _state["dominant_trait"] = _compute_dominant_trait(_state["xp"])
        _save_state(_state)
        return _snapshot(_state["unlocked_items"] if mode != "reset" else [])