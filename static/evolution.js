// Category Evolution System: syncs XP/gear state with the Flask API and renders it.

const EVOLUTION_TIERS = {
    fitness: [[10, 'headband'], [30, 'dumbbells'], [60, 'muscle_upgrade']],
    coding: [[10, 'glasses'], [30, 'hoodie'], [60, 'computer_desk']],
    creative: [[10, 'beret'], [30, 'paintbrush'], [60, 'easel']],
};
const XP_BAR_MAX = 60;

const GEAR_LABELS = {
    headband: 'Headband',
    dumbbells: 'Dumbbells',
    muscle_upgrade: 'Muscle Upgrade',
    glasses: 'Glasses',
    hoodie: 'Hoodie',
    computer_desk: 'Computer Desk',
    beret: 'Beret',
    paintbrush: 'Paintbrush',
    easel: 'Easel',
};

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

// Demo helper, e.g. resetEvolutionState('demo') from the browser console.
function resetEvolutionState(mode = 'reset') {
    return evolutionRequest('/api/reset-state', {
        method: 'POST',
        body: JSON.stringify({ mode }),
    });
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

    Object.values(EVOLUTION_TIERS).flat().forEach(([, itemId]) => {
        const layer = document.getElementById(`item-${itemId}`);
        if (!layer) return;
        layer.classList.toggle('unlocked', unlocked.has(itemId));
        if (newlyUnlocked.includes(itemId)) {
            layer.classList.remove('just-unlocked');
            void layer.offsetWidth; // restart the pop animation
            layer.classList.add('just-unlocked');
        }
    });

    const avatar = document.getElementById('base-avatar');
    if (avatar) {
        const targetSrc = unlocked.has('muscle_upgrade') ? avatar.dataset.buffSrc : avatar.dataset.baseSrc;
        if (avatar.getAttribute('src') !== targetSrc) avatar.setAttribute('src', targetSrc);
    }

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

    const gearList = document.getElementById('unlocked-gear-list');
    if (gearList) {
        gearList.replaceChildren(...[...unlocked].map((itemId) => {
            const badge = document.createElement('span');
            badge.className = 'badge';
            badge.textContent = GEAR_LABELS[itemId] || itemId;
            return badge;
        }));
    }

    if (stateData.coins !== undefined && stateData.coins !== null) {
        const wallet = document.getElementById('wallet-balance');
        const shopCoins = document.getElementById('shop-coins');
        const coinLabel = `${stateData.coins} coins`;
        if (wallet) wallet.textContent = coinLabel;
        if (shopCoins) shopCoins.textContent = coinLabel;
    }

    if (stateData.wallet_error) {
        showUnlockMessage(stateData.wallet_error);
    } else if (newlyUnlocked.length) {
        showUnlockMessage(`New gear unlocked: ${newlyUnlocked.map((id) => GEAR_LABELS[id] || id).join(', ')}!`);
    }
}

function showUnlockMessage(message) {
    const el = document.getElementById('unlock-message');
    if (!el) return;
    el.textContent = message;
    el.classList.add('visible');
    clearTimeout(unlockMessageTimer);
    unlockMessageTimer = setTimeout(() => el.classList.remove('visible'), 3000);
}

// Hide layers whose art hasn't been added to static/images/ yet instead of showing broken icons.
function watchStageArt() {
    const stage = document.querySelector('.character-stage');
    if (!stage) return;
    stage.querySelectorAll('img').forEach((img) => {
        const markMissing = () => {
            img.classList.add('missing-art');
            if (img.id === 'base-avatar') stage.classList.remove('has-avatar-art');
        };
        const markLoaded = () => {
            img.classList.remove('missing-art');
            if (img.id === 'base-avatar') stage.classList.add('has-avatar-art');
        };
        img.addEventListener('error', markMissing);
        img.addEventListener('load', markLoaded);
        if (img.complete) (img.naturalWidth ? markLoaded : markMissing)();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    watchStageArt();
    loadCharacterState();
});
