"""Capital One Nessie wallet for quest rewards and shop purchases."""

import json
import os
import threading
from datetime import date
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent
ENV_PATH = ROOT / ".env"
WALLET_DIR = Path("/tmp/instance") if os.environ.get("VERCEL") else (ROOT / "instance")
OWNED_PATH = WALLET_DIR / "owned_cosmetics.json"
BASE_URL = "https://api.nessieisreal.com"
TASK_REWARD = 10
LEVEL_UP_BONUS = 15

SHOP_ITEMS = {
    "red_hat": {"name": "Red Hat", "price": 50, "requires": "cap"},
    "blue_hat": {"name": "Blue Hat", "price": 75, "requires": "cap"},
    "blue_hoodie": {"name": "Blue Hoodie", "price": 80, "requires": "cape"},
    "black_hoodie": {"name": "Black Hoodie", "price": 100, "requires": "cape"},
    "forest_background": {"name": "Forest Background", "price": 100, "requires": None},
    "castle_background": {"name": "Castle Background", "price": 150, "requires": None},
}

COSMETIC_SLOTS = ("accessories", "clothes", "backgrounds")

_lock = threading.Lock()


class NessieError(Exception):
    """Nessie rejected a call or could not be reached."""


def _load_env():
    if not ENV_PATH.exists():
        return
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def _save_env_value(name, value):
    try:
        lines = ENV_PATH.read_text(encoding="utf-8").splitlines() if ENV_PATH.exists() else []
        prefix = f"{name}="
        replaced = False
        updated = []
        for line in lines:
            if line.startswith(prefix):
                updated.append(prefix + value)
                replaced = True
            else:
                updated.append(line)
        if not replaced:
            updated.append(prefix + value)
        ENV_PATH.write_text("\n".join(updated) + "\n", encoding="utf-8")
    except OSError:
        pass
    os.environ[name] = value


def _api_key():
    _load_env()
    return os.environ.get("NESSIE_API_KEY", "").strip()


def _account_id():
    _load_env()
    return os.environ.get("NESSIE_ACCOUNT_ID", "").strip()


def _request(method, path, payload=None):
    key = _api_key()
    if not key:
        return {}
    try:
        response = requests.request(
            method,
            f"{BASE_URL}{path}",
            params={"key": key},
            json=payload,
            timeout=5,
        )
        if response.status_code in (200, 201, 204):
            try:
                return response.json()
            except ValueError:
                return {}
    except requests.RequestException:
        pass
    return {}


def _default_wallet():
    return {
        "coins": 0,
        "owned": [],
        "equipped_cosmetics": {slot: None for slot in COSMETIC_SLOTS},
    }


def _read_wallet():
    if OWNED_PATH.exists():
        try:
            data = json.loads(OWNED_PATH.read_text(encoding="utf-8"))
            if isinstance(data, dict) and "coins" in data:
                coins = max(0, int(data.get("coins", 0)))
                owned = [i for i in data.get("owned", []) if i in SHOP_ITEMS]
                raw_eq = data.get("equipped_cosmetics") or {}
                equipped = {
                    slot: raw_eq.get(slot) if raw_eq.get(slot) in SHOP_ITEMS else None
                    for slot in COSMETIC_SLOTS
                }
                return {
                    "coins": coins,
                    "owned": owned,
                    "equipped_cosmetics": equipped,
                }
        except (OSError, ValueError, TypeError):
            pass

    wallet = _default_wallet()
    _write_wallet(wallet)
    return wallet


def _write_wallet(wallet):
    try:
        OWNED_PATH.parent.mkdir(parents=True, exist_ok=True)
        OWNED_PATH.write_text(json.dumps(wallet, indent=2), encoding="utf-8")
    except OSError:
        pass


def ensure_merchant():
    _load_env()
    existing = os.environ.get("NESSIE_MERCHANT_ID", "").strip()
    if existing:
        return existing

    created = _request("POST", "/merchants", {
        "name": "SwampHacks Character Shop",
        "category": "In-Game Gear",
        "address": {
            "street_number": "1",
            "street_name": "Swamp Way",
            "city": "Gainesville",
            "state": "FL",
            "zip": "32611",
        },
        "geocode": {"lat": 29.64, "lng": -82.34},
    })
    merchant_id = created.get("objectCreated", {}).get("_id") if isinstance(created, dict) else None
    if merchant_id:
        _save_env_value("NESSIE_MERCHANT_ID", merchant_id)
    return merchant_id or "default_merchant"


def get_balance():
    with _lock:
        return _read_wallet()["coins"]


def deposit_task_reward(task_title, amount=TASK_REWARD):
    """Add quest reward coins and sync deposit with Nessie."""
    amount = max(0, int(amount))
    account_id = _account_id()
    if account_id and amount > 0:
        _request("POST", f"/accounts/{account_id}/deposits", {
            "medium": "balance",
            "transaction_date": date.today().isoformat(),
            "status": "completed",
            "amount": amount,
            "description": f"Quest reward: {task_title or 'task'}",
        })

    with _lock:
        wallet = _read_wallet()
        wallet["coins"] = max(0, wallet["coins"] + amount)
        _write_wallet(wallet)
        return wallet["coins"]


def purchase_shop_item(item_id, unlocked_items):
    """Spend the item price and record ownership."""
    item = SHOP_ITEMS.get(item_id)
    if item is None:
        raise NessieError("That shop item does not exist")

    requirement = item["requires"]
    if requirement and requirement not in unlocked_items:
        raise NessieError(f"Unlock {requirement} first before buying {item['name']}")

    with _lock:
        wallet = _read_wallet()
        owned = wallet["owned"]
        if item_id in owned:
            raise NessieError("You already own that item")

        balance = wallet["coins"]
        price = item["price"]
        if balance < price:
            raise NessieError(f"Not enough coins! You have {balance} coins, need {price}.")

        account_id = _account_id()
        if account_id:
            merchant_id = ensure_merchant()
            _request("POST", f"/accounts/{account_id}/purchases", {
                "merchant_id": merchant_id,
                "medium": "balance",
                "purchase_date": date.today().isoformat(),
                "amount": price,
                "status": "completed",
                "description": f"Purchased {item['name']}",
            })

        wallet["coins"] = max(0, balance - price)
        owned.append(item_id)
        wallet["owned"] = owned
        _write_wallet(wallet)
        return {
            "coins": wallet["coins"],
            "owned_cosmetics": owned,
            "equipped_cosmetics": wallet["equipped_cosmetics"],
        }


def update_equipped_cosmetics(payload):
    if not isinstance(payload, dict):
        raise NessieError("Invalid shop equipment payload")

    with _lock:
        wallet = _read_wallet()
        owned = set(wallet["owned"])
        equipped = dict(wallet["equipped_cosmetics"])

        for slot in COSMETIC_SLOTS:
            if slot in payload:
                val = payload[slot]
                if val is not None and val not in owned:
                    raise NessieError(f"You do not own {val}")
                equipped[slot] = val

        wallet["equipped_cosmetics"] = equipped
        _write_wallet(wallet)
        return equipped


def wallet_snapshot():
    with _lock:
        wallet = _read_wallet()
        return {
            "coins": wallet["coins"],
            "owned_cosmetics": wallet["owned"],
            "equipped_cosmetics": wallet["equipped_cosmetics"],
        }


def reset_wallet():
    """Reset coins to 0 and clear purchased shop items."""
    with _lock:
        wallet = _default_wallet()
        _write_wallet(wallet)
        return {
            "coins": 0,
            "owned_cosmetics": [],
            "equipped_cosmetics": wallet["equipped_cosmetics"],
        }