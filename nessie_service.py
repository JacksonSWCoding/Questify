"""Capital One Nessie wallet for quest rewards and shop purchases.

Uses the savings account already stored in .env. A shop merchant is created
once, then its id is saved beside that account. Balances reported to the app
come from a successful Nessie response.
"""

import json
import os
import threading
from datetime import date
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent
ENV_PATH = ROOT / ".env"
OWNED_PATH = ROOT / "instance" / "owned_cosmetics.json"
BASE_URL = "https://api.nessieisreal.com"
TASK_REWARD = 10

SHOP_ITEMS = {
    "red_beret": {"name": "Red Beret", "price": 50, "requires": "beret"},
    "purple_beret": {"name": "Purple Beret", "price": 75, "requires": "beret"},
    "blue_hoodie": {"name": "Blue Hoodie", "price": 80, "requires": "hoodie"},
    "black_hoodie": {"name": "Black Hoodie", "price": 100, "requires": "hoodie"},
    "forest_background": {"name": "Forest Background", "price": 100, "requires": None},
    "castle_background": {"name": "Castle Background", "price": 150, "requires": None},
}

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
        if updated and updated[-1] != "":
            updated.append(prefix + value)
        else:
            updated.append(prefix + value)
    ENV_PATH.write_text("\n".join(updated) + "\n", encoding="utf-8")
    os.environ[name] = value


def _api_key():
    _load_env()
    key = os.environ.get("NESSIE_API_KEY", "").strip()
    if not key:
        raise NessieError("NESSIE_API_KEY is missing from .env")
    return key


def _account_id():
    _load_env()
    account_id = os.environ.get("NESSIE_ACCOUNT_ID", "").strip()
    if not account_id:
        raise NessieError("NESSIE_ACCOUNT_ID is missing from .env")
    return account_id


def _request(method, path, payload=None):
    try:
        response = requests.request(
            method,
            f"{BASE_URL}{path}",
            params={"key": _api_key()},
            json=payload,
            timeout=8,
        )
    except requests.RequestException as exc:
        raise NessieError(f"Could not reach Nessie: {exc}") from exc

    try:
        body = response.json()
    except ValueError:
        body = {}

    if response.status_code not in (200, 201, 204):
        message = body.get("message") if isinstance(body, dict) else response.text
        raise NessieError(message or f"Nessie returned {response.status_code}")
    return body


def _transactions(kind):
    """Return deposits or purchases. An empty account comes back as 404."""
    account_id = _account_id()
    try:
        response = requests.get(
            f"{BASE_URL}/accounts/{account_id}/{kind}",
            params={"key": _api_key()},
            timeout=8,
        )
    except requests.RequestException as exc:
        raise NessieError(f"Could not reach Nessie: {exc}") from exc
    if response.status_code == 404:
        return []
    if response.status_code != 200:
        raise NessieError(f"Nessie returned {response.status_code} for {kind}")
    body = response.json()
    if not isinstance(body, list):
        raise NessieError(f"Nessie did not return a {kind} list")
    return body


def _read_owned():
    if not OWNED_PATH.exists():
        return []
    try:
        data = json.loads(OWNED_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    if not isinstance(data, list):
        return []
    return [item_id for item_id in data if item_id in SHOP_ITEMS]


def _write_owned(item_ids):
    OWNED_PATH.parent.mkdir(parents=True, exist_ok=True)
    OWNED_PATH.write_text(json.dumps(item_ids), encoding="utf-8")


def ensure_merchant():
    """Create the shop merchant once and store NESSIE_MERCHANT_ID."""
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
    merchant_id = created.get("objectCreated", {}).get("_id")
    if not merchant_id:
        raise NessieError("Nessie created a merchant without an id")
    _save_env_value("NESSIE_MERCHANT_ID", merchant_id)
    return merchant_id


def get_balance():
    """Return deposits minus purchases.

    Nessie creates the transactions, but the account "balance" field stays at 0
    in this sandbox, so the vault total is calculated from those transactions.
    """
    deposits = _transactions("deposits")
    purchases = _transactions("purchases")

    def total(transactions):
        return sum(
            transaction.get("amount", 0)
            for transaction in transactions
            if transaction.get("status") != "cancelled"
        )

    return total(deposits) - total(purchases)


def deposit_task_reward(task_title, amount=TASK_REWARD):
    """Deposit a quest reward. Returns the balance only after Nessie accepts it."""
    amount = int(amount)
    if amount <= 0:
        raise NessieError("Reward amount must be positive")

    _request("POST", f"/accounts/{_account_id()}/deposits", {
        "medium": "balance",
        "transaction_date": date.today().isoformat(),
        "status": "completed",
        "amount": amount,
        "description": f"Quest reward: {task_title or 'task'}",
    })
    return get_balance()


def purchase_shop_item(item_id, unlocked_items):
    """Spend the item price at the shop merchant and record ownership."""
    item = SHOP_ITEMS.get(item_id)
    if item is None:
        raise NessieError("That shop item does not exist")

    requirement = item["requires"]
    if requirement and requirement not in unlocked_items:
        raise NessieError(f"Requires {requirement}")

    with _lock:
        owned = _read_owned()
        if item_id in owned:
            raise NessieError("You already own that item")

        balance = get_balance()
        price = item["price"]
        if balance < price:
            raise NessieError(f"Habit Vault has {balance} coins, and this costs {price} coins")

        merchant_id = ensure_merchant()
        _request("POST", f"/accounts/{_account_id()}/purchases", {
            "merchant_id": merchant_id,
            "medium": "balance",
            "purchase_date": date.today().isoformat(),
            "amount": price,
            "status": "completed",
            "description": f"Purchased {item['name']}",
        })
        try:
            new_balance = get_balance()
        except NessieError:
            new_balance = balance - price

        owned.append(item_id)
        _write_owned(owned)
        return {"coins": new_balance, "owned_cosmetics": owned}


def wallet_snapshot():
    return {"coins": get_balance(), "owned_cosmetics": _read_owned()}


def reset_wallet():
    """Delete every vault transaction and forget purchased shop items."""
    with _lock:
        for kind in ("deposits", "purchases"):
            for transaction in _transactions(kind):
                transaction_id = transaction.get("_id")
                if transaction_id:
                    _request("DELETE", f"/{kind}/{transaction_id}")
        _write_owned([])
        return wallet_snapshot()
