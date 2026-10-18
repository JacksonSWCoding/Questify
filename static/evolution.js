const EQUIPMENT = {
    wizard_hat: {
        name: 'Wizard Hat',
        category: 'general',
        xp: 30
    },
    black_shoes: {
        name: 'Shoes',
        category: 'fitness',
        xp: 10
    },
    headband: {
        name: 'Headband',
        category: 'fitness',
        xp: 30
    },
    dagger: {
        name: 'Dagger',
        category: 'fitness',
        xp: 60
    },
    glasses: {
        name: 'Glasses',
        category: 'coding',
        xp: 10
    },
    cape: {
        name: 'Cape',
        category: 'coding',
        xp: 30
    },
    wand: {
        name: 'Magic Staff',
        category: 'coding',
        xp: 60
    },
    cap: {
        name: 'Leather Cap',
        category: 'creative',
        xp: 10
    },
    bauldron: {
        name: 'Shoulder Armor',
        category: 'creative',
        xp: 30
    },
    crystal: {
        name: 'Crystal',
        category: 'creative',
        xp: 60
    }
};

const EQUIPMENT_SLOTS = {
    wizard_hat: 'head',
    headband: 'head',
    cap: 'head',
    glasses: 'face',
    black_shoes: 'feet',
    cape: 'back',
    bauldron: 'shoulders',
    dagger: 'hand',
    wand: 'hand',
    crystal: 'hand'
};

const GEAR_ICONS = {
    wizard_hat: '🧙',
    black_shoes: '👟',
    headband: '🎽',
    dagger: '🗡️',
    glasses: '👓',
    cape: '🦸',
    wand: '🪄',
    cap: '🧢',
    bauldron: '🛡️',
    crystal: '🔮'
};
window.GEAR_ICONS = GEAR_ICONS;

let unlockedEquipment = new Set();
let savedEquipment = new Set();
let pendingEquipment = new Set();
let editingEquipment = false;
let equipmentBusy = false;
let hasInitializedState = false;
let unlockBannerTimer = null;

function selectedEquipment() {
    return [...pendingEquipment];
}

function clearEvolutionHeadSlot() {
    for (const id of [...pendingEquipment]) {
        if (EQUIPMENT_SLOTS[id] === 'head') {
            pendingEquipment.delete(id);
        }
    }
    for (const id of [...savedEquipment]) {
        if (EQUIPMENT_SLOTS[id] === 'head') {
            savedEquipment.delete(id);
        }
    }
    applyEquipment();
    renderEquipment();
}
window.clearEvolutionHeadSlot = clearEvolutionHeadSlot;

function applyEquipment() {
    const shopHatEquipped =
        document.getElementById('item-red_hat')?.classList.contains('equipped') ||
        document.getElementById('item-blue_hat')?.classList.contains('equipped');

    for (const id of Object.keys(EQUIPMENT)) {
        const layer = document.getElementById('item-' + id);
        const isHeadItem = EQUIPMENT_SLOTS[id] === 'head';

        layer?.classList.toggle(
            'equipped',
            unlockedEquipment.has(id) &&
            pendingEquipment.has(id) &&
            !(isHeadItem && shopHatEquipped)
        );
    }

    document.getElementById('item-black_glasses')
        ?.classList.remove('equipped');
}
window.applyEquipment = applyEquipment;

function setEquipmentBusy(busy) {
    equipmentBusy = busy;
    renderEquipment();
}

function beginEquipmentEdit() {
    editingEquipment = true;
    pendingEquipment = new Set(savedEquipment);

    applyEquipment();
    renderEquipment();
}

function cancelEquipmentEdit() {
    editingEquipment = false;
    pendingEquipment = new Set(savedEquipment);

    applyEquipment();
    renderEquipment();
}

function acceptEquipment(items) {
    savedEquipment = new Set(items);
    cancelEquipmentEdit();
}

const GEAR_LABELS = {
    black_shoes: 'Shoes',
    headband: 'Headband',
    dagger: 'Dagger',
    glasses: 'Glasses',
    cape: 'Cape',
    wand: 'Magic Staff',
    cap: 'Leather Cap',
    bauldron: 'Shoulder Armor',
    crystal: 'Crystal',
    wizard_hat: 'Wizard Hat'
};

function renderEquipment() {
    const container = document.getElementById('equipment-inventory');

    if (!container) return;

    container.replaceChildren();

    const intro = document.createElement('p');
    intro.className = 'equipment-note';
    intro.textContent =
        'Evolution unlocks (earn category XP on quests). Click an unlocked item to equip or unequip it, then Save Changes.';
    container.appendChild(intro);

    for (const category of [
        'general',
        'fitness',
        'coding',
        'creative'
    ]) {
        const section = document.createElement('section');
        const heading = document.createElement('h3');

        const categoryItems = Object.entries(EQUIPMENT).filter(
            ([, item]) => item.category === category
        );

        if (categoryItems.length === 0) {
            continue;
        }

        heading.textContent =
            category[0].toUpperCase() + category.slice(1);

        const group = document.createElement('div');
        group.className = 'inv-slot-group';

        for (const [id, item] of categoryItems) {
            const unlocked = unlockedEquipment.has(id);
            const selected = pendingEquipment.has(id);

            const button = document.createElement('button');
            button.type = 'button';

            button.className =
                'gear-badge' + (selected ? ' equipped' : '');

            button.textContent = unlocked
                ? (selected ? '✓ ' + item.name + ' · Unequip' : item.name)
                : '🔒 ' + item.name + ' · ' + item.xp + ' XP';

            button.disabled =
                !unlocked ||
                !editingEquipment ||
                equipmentBusy;

            button.setAttribute('aria-pressed', String(selected));

            button.addEventListener('click', () => {
                if (equipmentBusy || !editingEquipment) return;

                if (pendingEquipment.has(id)) {
                    pendingEquipment.delete(id);
                } else {
                    const slot = EQUIPMENT_SLOTS[id];

                    for (const equippedId of [...pendingEquipment]) {
                        if (EQUIPMENT_SLOTS[equippedId] === slot) {
                            pendingEquipment.delete(equippedId);
                        }
                    }

                    pendingEquipment.add(id);

                    // If equipping an evolution hat, unequip any active shop hat
                    if (slot === 'head' && typeof window.unequipShopCategory === 'function') {
                        window.unequipShopCategory('accessories');
                    }
                }

                applyEquipment();
                renderEquipment();
            });

            group.appendChild(button);
        }

        section.append(heading, group);
        container.appendChild(section);
    }
}

function triggerUnlockAnimation(newlyUnlockedIds) {
    if (!Array.isArray(newlyUnlockedIds) || newlyUnlockedIds.length === 0) {
        return;
    }

    const latestId = newlyUnlockedIds[newlyUnlockedIds.length - 1];
    const layer = document.getElementById('item-' + latestId);

    if (layer) {
        layer.classList.add('equipped');
        layer.classList.remove('just-unlocked');
        void layer.offsetWidth;
        layer.classList.add('just-unlocked');
    }

    const message = document.getElementById('unlock-message');
    if (message && EQUIPMENT[latestId]) {
        const icon = GEAR_ICONS[latestId] || '✨';
        message.textContent = `${icon} Unlocked ${EQUIPMENT[latestId].name}!`;
        message.classList.add('visible');
        clearTimeout(unlockBannerTimer);
        unlockBannerTimer = setTimeout(() => {
            message.classList.remove('visible');
        }, 4000);
    }
}

function updateCharacterVisuals(state) {
    if (!state || typeof state !== 'object') return;

    const xp = state.xp || {};
    const previousUnlocked = new Set(unlockedEquipment);

    const rawAvailable = state.available_equipment || state.unlocked_items || [];
    unlockedEquipment = new Set(
        rawAvailable.filter(id => EQUIPMENT[id])
    );

    const newlyUnlocked = Array.isArray(state.newly_unlocked) && state.newly_unlocked.length > 0
        ? state.newly_unlocked.filter(id => EQUIPMENT[id])
        : (hasInitializedState
            ? [...unlockedEquipment].filter(id => !previousUnlocked.has(id))
            : []);

    if (Array.isArray(state.equipped_items)) {
        savedEquipment = new Set(
            state.equipped_items.filter(id => unlockedEquipment.has(id))
        );
    }

    if (newlyUnlocked.length > 0) {
        for (const id of newlyUnlocked) {
            const slot = EQUIPMENT_SLOTS[id];
            for (const existing of [...savedEquipment]) {
                if (EQUIPMENT_SLOTS[existing] === slot) {
                    savedEquipment.delete(existing);
                }
            }
            savedEquipment.add(id);

            if (slot === 'head' && typeof window.unequipShopCategory === 'function') {
                window.unequipShopCategory('accessories');
            }
        }
    }

    if (!editingEquipment) {
        pendingEquipment = new Set(savedEquipment);
    } else {
        pendingEquipment = new Set(
            [...pendingEquipment].filter(id => unlockedEquipment.has(id))
        );
    }

    applyEquipment();
    if (typeof window.applyShopWearables === 'function') {
        window.applyShopWearables();
    }
    renderEquipment();

    if (newlyUnlocked.length > 0) {
        triggerUnlockAnimation(newlyUnlocked);
    }

    hasInitializedState = true;

    for (const category of [
        'general',
        'fitness',
        'coding',
        'creative'
    ]) {
        const value = xp[category] || 0;

        const bar = document.getElementById(
            category + '-xp-bar'
        );

        const label = document.getElementById(
            category + '-xp-text'
        );

        const thresholds = category === 'general' ? [30] : [10, 30, 60];
        const next = thresholds.find(threshold => threshold > value);

        if (bar) {
            const percentage = next
                ? Math.min((value / next) * 100, 100)
                : 100;

            bar.style.width = percentage + '%';
        }

        if (label) {
            if (next) {
                label.textContent = value + ' / ' + next + ' XP';
            } else {
                label.textContent = value + ' XP ★';
            }
        }
    }

    const trait = state.dominant_trait || 'general';
    const traitLabel = document.getElementById('dominant-trait');

    if (traitLabel) {
        traitLabel.textContent =
            'Dominant trait: ' +
            trait[0].toUpperCase() +
            trait.slice(1);
    }

    const stage = document.querySelector('.character-stage');

    if (stage) {
        stage.dataset.trait = trait;
    }

    const list = document.getElementById('unlocked-gear-list');

    if (list) {
        list.replaceChildren();

        for (const id of unlockedEquipment) {
            if (!EQUIPMENT[id]) continue;

            const badge = document.createElement('span');
            badge.className = 'badge';
            badge.textContent = EQUIPMENT[id].name;

            list.appendChild(badge);
        }
    }

    if (typeof state.coins === 'number') {
        const shop = document.getElementById('shop-coins');
        const wallet = document.getElementById('wallet-balance');

        if (shop) {
            shop.textContent = state.coins;
        }

        if (wallet) {
            wallet.textContent = state.coins + ' coins';
        }
    }

    const walletStatus = document.getElementById('wallet-status');
    if (walletStatus) {
        if (state.wallet_error) {
            walletStatus.textContent =
                'Wallet unavailable — coins and shop purchases may not work. ' +
                state.wallet_error;
            walletStatus.hidden = false;
        } else {
            walletStatus.textContent = '';
            walletStatus.hidden = true;
        }
    }
}

async function loadCharacterState() {
    try {
        const response = await fetch('/api/character-state');

        if (!response.ok) {
            throw new Error('Could not load hero progress');
        }

        const state = await response.json();
        updateCharacterVisuals(state);

        return state;
    } catch (error) {
        const message = document.getElementById('unlock-message');

        if (message) {
            message.textContent =
                'Could not load hero progress. Refresh the page and try again.';

            message.classList.add('visible');
        }

        if (typeof window.showAppStatus === 'function') {
            window.showAppStatus(
                'Could not load hero progress. Refresh and try again.',
                'error'
            );
        }

        console.error(error);
        return null;
    }
}

document.addEventListener('DOMContentLoaded', loadCharacterState);