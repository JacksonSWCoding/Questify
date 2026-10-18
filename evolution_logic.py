"""Category Evolution System: per-category XP, gear unlocks, and dominant trait."""

import re
import threading

CATEGORIES = ("fitness", "coding", "creative", "general")

UNLOCK_THRESHOLDS = {
    "fitness": [(10, "black_shoes"), (30, "headband"), (60, "dagger")],
    "coding": [(10, "glasses"), (30, "cape"), (60, "wand")],
    "creative": [(10, "cap"), (30, "bauldron"), (60, "crystal")],
}

CATEGORY_KEYWORDS = {
    "fitness": [
        "gym", "run", "running", "jog", "jogging", "workout", "exercise",
        "lift", "lifting", "pushups", "pushup", "squats", "yoga", "cardio",
        "swim", "swimming", "bike", "cycling", "walk", "hike", "stretch",
        "sport", "basketball", "soccer", "train", "training", "steps",
    ],
    "coding": [
        "code", "coding", "program", "programming", "debug", "bug", "bugs",
        "commit", "deploy", "api", "python", "javascript", "java", "html",
        "css", "flask", "react", "leetcode", "algorithm", "github", "git",
        "refactor", "backend", "frontend", "app", "script", "hackathon",
    ],
    "creative": [
        "draw", "drawing", "paint", "painting", "sketch", "art", "design",
        "write", "writing", "poem", "story", "music", "song", "guitar",
        "piano", "sing", "compose", "photo", "photography", "film", "video",
        "edit", "craft", "knit", "doodle", "animate", "animation",
    ],
}

DEMO_XP_PRESETS = {
    "reset": {"fitness": 0, "coding": 0, "creative": 0, "general": 0},
    "demo": {"fitness": 50, "coding": 20, "creative": 0, "general": 5},
    "max": {"fitness": 60, "coding": 60, "creative": 60, "general": 0},
}

_KEYWORD_PATTERNS = {
    category: re.compile(r"\b(?:" + "|".join(map(re.escape, words)) + r")\b")
    for category, words in CATEGORY_KEYWORDS.items()
}

_lock = threading.Lock()
_state = {
    "xp": dict(DEMO_XP_PRESETS["reset"]),
    "unlocked_items": [],
    "dominant_trait": "general",
}


def auto_detect_category(task_title, selected_category):
    """Return the selected category, or guess one from the title when it's "general"."""
    category = (selected_category or "general").strip().lower()
    if category not in CATEGORIES:
        category = "general"
    if category != "general":
        return category

    title = (task_title or "").lower()
    best_category, best_hits = "general", 0
    for candidate, pattern in _KEYWORD_PATTERNS.items():
        hits = len(pattern.findall(title))
        if hits > best_hits:
            best_category, best_hits = candidate, hits
    return best_category


def _compute_dominant_trait(xp):
    best_category, best_xp = "general", 0
    for category in CATEGORIES:
        if xp[category] > best_xp:
            best_category, best_xp = category, xp[category]
    return best_category


def _snapshot(newly_unlocked):
    return {
        "xp": dict(_state["xp"]),
        "unlocked_items": list(_state["unlocked_items"]),
        "newly_unlocked": list(newly_unlocked),
        "dominant_trait": _state["dominant_trait"],
    }


def get_character_state():
    with _lock:
        return _snapshot([])


def process_task_completion(category, task_title="", xp_amount=10):
    """Award XP for a completed task and return the evolution state payload."""
    category = auto_detect_category(task_title, category)
    xp_amount = max(int(xp_amount), 0)

    with _lock:
        _state["xp"][category] += xp_amount
        new_total = _state["xp"][category]

        newly_unlocked = []
        for threshold, item_id in UNLOCK_THRESHOLDS.get(category, []):
            if new_total >= threshold and item_id not in _state["unlocked_items"]:
                _state["unlocked_items"].append(item_id)
                newly_unlocked.append(item_id)

        _state["dominant_trait"] = _compute_dominant_trait(_state["xp"])
        return _snapshot(newly_unlocked)


def reset_or_demo_state(mode="reset"):
    """Load an XP preset ("reset", "demo", or "max") and rebuild unlocks from it."""
    if mode not in DEMO_XP_PRESETS:
        raise ValueError(f"Unknown mode {mode!r}; expected one of {sorted(DEMO_XP_PRESETS)}")

    with _lock:
        _state["xp"] = dict(DEMO_XP_PRESETS[mode])
        _state["unlocked_items"] = [
            item_id
            for category, tiers in UNLOCK_THRESHOLDS.items()
            for threshold, item_id in tiers
            if _state["xp"][category] >= threshold
        ]
        _state["dominant_trait"] = _compute_dominant_trait(_state["xp"])
        return _snapshot([])