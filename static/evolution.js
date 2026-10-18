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

let unlockedEquipment = new Set();
let savedEquipment = new Set();
let pendingEquipment = new Set();
let editingEquipment = false;
let equipmentBusy = false;

function selectedEquipment() {
    return [...pendingEquipment];
}

function applyEquipment() {
    for (const id of Object.keys(EQUIPMENT)) {
        const layer = document.getElementById('item-' + id);

        layer?.classList.toggle(
            'equipped',
            unlockedEquipment.has(id) && pendingEquipment.has(id)
        );
    }

    document.getElementById('item-black_glasses')
        ?.classList.remove('equipped');
}

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

function renderEquipment() {
    const container = document.getElementById('equipment-inventory');

    if (!container) return;

    container.replaceChildren();

    for (const category of [
        'general',
        'fitness',
        'coding',
        'creative'
    ]) {
        const section = document.createElement('section');
        const heading = document.createElement('h3');

        heading.textContent =
            category[0].toUpperCase() + category.slice(1);

        const group = document.createElement('div');
        group.className = 'inv-slot-group';

        for (const [id, item] of Object.entries(EQUIPMENT)) {
            if (item.category !== category) continue;

            const unlocked = unlockedEquipment.has(id);
            const selected = pendingEquipment.has(id);

            const button = document.createElement('button');
            button.type = 'button';

            button.className =
                'gear-badge' + (selected ? ' equipped' : '');

            button.textContent = unlocked
                ? (selected ? '✓ ' : '') + item.name
                : item.name + ' · ' + item.xp + ' XP';

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

function updateCharacterVisuals(state) {
    const xp = state.xp || {};

    unlockedEquipment = new Set(
        (state.available_equipment || []).filter(id => EQUIPMENT[id])
    );

    savedEquipment = new Set(
        (state.equipped_items || []).filter(id => {
            return unlockedEquipment.has(id);
        })
    );

    if (!editingEquipment) {
        pendingEquipment = new Set(savedEquipment);
    } else {
        pendingEquipment = new Set(
            [...pendingEquipment].filter(id => {
                return unlockedEquipment.has(id);
            })
        );
    }

    applyEquipment();
    renderEquipment();

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

        const next = [10, 30, 60].find(threshold => {
            return threshold > value;
        });

        if (bar) {
            const percentage = category === 'general'
                ? value % 30 / 30 * 100
                : Math.min(value / 60, 1) * 100;

            bar.style.width = percentage + '%';
        }

        if (label) {
            if (category === 'general') {
                label.textContent = (value % 30) + ' / 30 XP';
            } else if (next) {
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
                'Could not load hero progress. ' +
                'Check that the server is running and refresh.';

            message.classList.add('visible');
        }

        console.error(error);
        return null;
    }
}

document.addEventListener('DOMContentLoaded', loadCharacterState);