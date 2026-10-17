// Category Evolution System: syncs XP/gear state with the Flask API and renders it.

const EVOLUTION_TIERS = {
    fitness: [[10, 'black_shoes'], [30, 'headband'], [60, 'dagger']],
    coding: [[10, 'glasses'], [30, 'cape'], [60, 'wand']],
    creative: [[10, 'cap'], [30, 'bauldron'], [60, 'crystal']],
};
const XP_BAR_MAX = 60;

const GEAR_LABELS = {
    black_shoes: 'Shoes',
    headband: 'Headband',
    dagger: 'Dagger',
    glasses: 'Glasses',
    cape: 'Cape',
    wand: 'Magic Staff',
    cap: 'Leather Cap',
    bauldron: 'Bauldron',
    crystal: 'Crystal',
};

// Icons held overhead in the "item get" animation (inline SVG so each one matches its item)
const svgIcon = (body) =>
    `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" stroke="#1e1b16" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round">${body}</svg>`;

const GEAR_ICONS = {
    black_shoes: svgIcon(
        '<path d="M18 8h18v22l14 8c5 3 8 6 8 11v3H12V8z" fill="#8b5a2b"/>' +
        '<rect x="12" y="48" width="46" height="8" rx="2" fill="#3b2a1a"/>' +
        '<path d="M18 18h18M18 25h18" fill="none" stroke="#5c3a1a"/>'
    ),
    headband: svgIcon(
        '<path d="M54 38l9 12-9-3z M54 38l10-4-2 10z" fill="#ef4444"/>' +
        '<path d="M8 40Q32 16 56 40" fill="none" stroke-width="14"/>' +
        '<path d="M8 40Q32 16 56 40" fill="none" stroke="#ef4444" stroke-width="9"/>' +
        '<path d="M14 34Q32 20 50 34" fill="none" stroke="#fca5a5" stroke-width="2"/>'
    ),
    dagger: svgIcon(
        '<path d="M32 3l7 31H25z" fill="#d1d5db"/>' +
        '<path d="M32 6v28" fill="none" stroke="#9ca3af" stroke-width="2"/>' +
        '<rect x="17" y="34" width="30" height="6" rx="2" fill="#f59e0b"/>' +
        '<rect x="28" y="40" width="8" height="14" fill="#7c4a21"/>' +
        '<circle cx="32" cy="57" r="4" fill="#f59e0b"/>'
    ),
    glasses: svgIcon(
        '<path d="M30 33q2-3 4 0" fill="none" stroke-width="8"/>' +
        '<circle cx="19" cy="34" r="12" fill="#bae6fd" fill-opacity="0.45" stroke-width="9"/>' +
        '<circle cx="45" cy="34" r="12" fill="#bae6fd" fill-opacity="0.45" stroke-width="9"/>' +
        '<path d="M30 33q2-3 4 0" fill="none" stroke="#f1f5f9" stroke-width="3"/>' +
        '<circle cx="19" cy="34" r="12" fill="none" stroke="#f1f5f9" stroke-width="4"/>' +
        '<circle cx="45" cy="34" r="12" fill="none" stroke="#f1f5f9" stroke-width="4"/>'
    ),
    cape: svgIcon(
        '<path d="M20 8h24l14 46c-8 5-44 5-52 0z" fill="#b91c1c"/>' +
        '<path d="M20 8q12 9 24 0" fill="#7f1d1d"/>' +
        '<path d="M25 24q5 22 3 30M39 24q-5 22-3 30" fill="none" stroke="#7f1d1d" stroke-width="2"/>' +
        '<circle cx="32" cy="12" r="4" fill="#fbbf24"/>'
    ),
    wand: svgIcon(
        '<path d="M10 54L40 24" stroke-width="10"/>' +
        '<path d="M10 54L40 24" stroke="#8b5a2b" stroke-width="5"/>' +
        '<polygon points="48,6 51.5,14.5 60.5,15 53.5,21 55.5,30 48,25 40.5,30 42.5,21 35.5,15 44.5,14.5" fill="#fde047"/>'
    ),
    cap: svgIcon(
        '<path d="M10 38C10 14 54 14 54 38z" fill="#8b5a2b"/>' +
        '<path d="M6 38q26 14 52 0v6q-26 14-52 0z" fill="#5c3a1a"/>' +
        '<circle cx="32" cy="19" r="3" fill="#5c3a1a"/>' +
        '<path d="M32 22v12" fill="none" stroke="#5c3a1a" stroke-width="2"/>'
    ),
    bauldron: svgIcon(
        '<path d="M6 46C6 22 26 10 42 14c14 4 18 18 16 32H46c0-9-5-13-14-13z" fill="#94a3b8"/>' +
        '<path d="M12 38q20-16 42 0M9 46q24-16 48-2" fill="none" stroke="#64748b" stroke-width="2.5"/>' +
        '<circle cx="19" cy="36" r="2.8" fill="#fbbf24"/><circle cx="36" cy="24" r="2.8" fill="#fbbf24"/><circle cx="49" cy="32" r="2.8" fill="#fbbf24"/>'
    ),
    crystal: svgIcon(
        '<polygon points="32,4 51,22 43,59 21,59 13,22" fill="#22d3ee"/>' +
        '<polygon points="32,4 39,22 32,59 25,22" fill="#a5f3fc"/>' +
        '<path d="M13 22h38" fill="none" stroke-width="2"/>'
    ),
};

// Inventory sections: head items in "shirts" (as before), armor/magic in "weapons" (Armor / Weapons)
const GEAR_CATEGORIES = {
    headband: 'shirts',
    glasses: 'shirts',
    cap: 'shirts',
    black_shoes: 'shoes',
    dagger: 'weapons',
    cape: 'weapons',
    bauldron: 'weapons',
    wand: 'weapons',
    crystal: 'weapons',
};

const EQUIPPED_KEY = 'questify_equipped';
function loadEquipped() {
    try {
        return new Set(JSON.parse(localStorage.getItem(EQUIPPED_KEY) || '[]'));
    } catch (e) {
        return new Set();
    }
}
const equippedItems = loadEquipped();
function saveEquipped() {
    localStorage.setItem(EQUIPPED_KEY, JSON.stringify([...equippedItems]));
}
let unlockMessageTimer = null;

function capitalize(word) {
    return word.charAt(0).toUpperCase() + word.slice(1);
}

async function evolutionRequest(url, options = {}) {
    try {
        const response = await fetch(url, {
            headers: { 'Content-Type': 'application/json' },
            ...options,
        });
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        const stateData = await response.json();
        updateCharacterVisuals(stateData);
        return stateData;
    } catch (err) {
        console.warn(`Evolution API unavailable (${url}). Is \`python app.py\` running?`, err);
        return null;
    }
}

function loadCharacterState() {
    return evolutionRequest('/api/character-state');
}

function completeEvolutionTask(category, taskTitle) {
    return evolutionRequest('/api/complete-task', {
        method: 'POST',
        body: JSON.stringify({ category, title: taskTitle }),
    });
}

function resetEvolutionState(mode = 'reset') {
    return evolutionRequest('/api/reset-state', {
        method: 'POST',
        body: JSON.stringify({ mode }),
    });
}

function toggleEquipGear(itemId) {
    if (equippedItems.has(itemId)) {
        equippedItems.delete(itemId);
    } else {
        equippedItems.add(itemId);
    }
    // Live preview only: the choice is kept when the user presses Save (see app.js),
    // and rolled back by restoreEquipped() if they press Cancel.
    const layer = document.getElementById(`item-${itemId}`);
    if (layer) {
        layer.classList.toggle('equipped', equippedItems.has(itemId));
    }
    const unlocked = new Set(JSON.parse(localStorage.getItem('cached_unlocked') || '[]'));
    renderInventory(unlocked);
}

function snapshotEquipped() {
    return [...equippedItems];
}

function restoreEquipped(items) {
    equippedItems.clear();
    items.forEach((itemId) => equippedItems.add(itemId));
    document.querySelectorAll('.gear-layer').forEach((layer) => {
        const itemId = layer.id.replace('item-', '');
        layer.classList.toggle('equipped', equippedItems.has(itemId));
    });
    const unlocked = new Set(JSON.parse(localStorage.getItem('cached_unlocked') || '[]'));
    renderInventory(unlocked);
}

function updateCharacterVisuals(stateData) {
    const xp = stateData.xp || {};
        const generalXp = xp.general || 0;
    const generalBar = document.getElementById('general-xp-bar');
    const generalText = document.getElementById('general-xp-text');

    if (generalBar) {
        generalBar.style.width = `${(generalXp % 30) / 30 * 100}%`;
        generalBar.style.background = '#f5b942';
    }

    if (generalText) {
        generalText.textContent =
            `${generalXp % 30} / 30 XP`;
    }
    const unlocked = new Set(stateData.unlocked_items || []);
    const newlyUnlocked = stateData.newly_unlocked || [];

    // Cache unlocked items for inventory UI state
    localStorage.setItem('cached_unlocked', JSON.stringify([...unlocked]));

    Object.values(EVOLUTION_TIERS).flat().forEach(([, itemId]) => {
        const layer = document.getElementById(`item-${itemId}`);
        if (!layer) return;
        const isUnlocked = unlocked.has(itemId);
        layer.classList.toggle('unlocked', isUnlocked);
        if (!isUnlocked) equippedItems.delete(itemId);
        // Re-apply equipped state (also restores it after a page reload)
        layer.classList.toggle('equipped', equippedItems.has(itemId));
        if (newlyUnlocked.includes(itemId)) {
            layer.classList.remove('just-unlocked');
            void layer.offsetWidth; // restart pop animation
            layer.classList.add('just-unlocked');
        }
    });

    Object.entries(EVOLUTION_TIERS).forEach(([category, tiers]) => {
        const value = xp[category] || 0;
        const bar = document.getElementById(`${category}-xp-bar`);
        const text = document.getElementById(`${category}-xp-text`);
        if (bar) bar.style.width = `${Math.min(value / XP_BAR_MAX, 1) * 100}%`;
        if (text) {
            const nextTier = tiers.find(([threshold]) => value < threshold);
            text.textContent = nextTier ? `${value} / ${nextTier[0]} XP` : `${value} XP ★`;
        }
    });

    const trait = stateData.dominant_trait || 'general';
    const stage = document.querySelector('.character-stage');
    if (stage) stage.dataset.trait = trait;
    const traitLabel = document.getElementById('dominant-trait');
    if (traitLabel) traitLabel.textContent = `Dominant trait: ${capitalize(trait)}`;

    renderInventory(unlocked);

    // Guard against an out-of-date server (old evolution_logic.py still running)
    const unknownItems = [...unlocked, ...newlyUnlocked].filter((id) => !GEAR_LABELS[id]);
    if (unknownItems.length) {
        const names = [...new Set(unknownItems)].join(', ');
        console.warn(`Server unlocked items this page doesn't know: ${names}. Is the old evolution_logic.py still running?`);
        showUnlockMessage(`Server is out of date (sent: ${names}). Update evolution_logic.py and restart Flask.`, 15000);
        return;
    }

    if (newlyUnlocked.length) {
        showUnlockMessage(`New gear unlocked: ${newlyUnlocked.map((id) => GEAR_LABELS[id] || id).join(', ')}! Check the Customize menu to equip.`);
    }
}

function renderInventory(unlocked) {
    const categories = {
        shirts: document.getElementById('inv-shirts'),
        shorts: document.getElementById('inv-shorts'),
        shoes: document.getElementById('inv-shoes'),
        weapons: document.getElementById('inv-weapons'),
    };

    // Clear containers
    Object.values(categories).forEach(container => {
        if (container) container.replaceChildren();
    });

    [...unlocked].forEach((itemId) => {
        if (!GEAR_LABELS[itemId]) return; // ignore items that no longer exist (e.g. old hoodie/beret)
        const category = GEAR_CATEGORIES[itemId] || 'weapons';
        const container = categories[category];
        if (!container) return;

        const isEquipped = equippedItems.has(itemId);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `badge gear-badge ${isEquipped ? 'equipped' : ''}`;
        btn.textContent = `${isEquipped ? '✓ ' : ''}${GEAR_LABELS[itemId] || itemId}`;
        btn.title = 'Click to equip/unequip';
        btn.addEventListener('click', () => {
            toggleEquipGear(itemId);
        });
        container.appendChild(btn);
    });

    // Add fallback placeholder if a category is empty
    Object.entries(categories).forEach(([key, container]) => {
        if (container && container.children.length === 0) {
            const emptyMsg = document.createElement('span');
            emptyMsg.style.fontSize = '0.75rem';
            emptyMsg.style.color = 'var(--muted)';
            emptyMsg.style.fontStyle = 'italic';
            emptyMsg.textContent = 'None unlocked';
            container.appendChild(emptyMsg);
        }
    });
}

function showUnlockMessage(message, duration = 4000) {
    const el = document.getElementById('unlock-message');
    if (!el) return;
    el.textContent = message;
    el.classList.add('visible');
    clearTimeout(unlockMessageTimer);
    unlockMessageTimer = setTimeout(() => el.classList.remove('visible'), duration);
}

document.addEventListener('DOMContentLoaded', () => {
    loadCharacterState();
});