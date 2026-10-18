(function () {
'use strict';

let shopButton;
let shopModal;
let closeButton;
let shopContainer;
let inventoryContainer;
let coinDisplay;

const LEGACY_GEAR_RENAMES = {
    beret: 'cap',
    hoodie: 'cape'
};

const LEGACY_SHOP_ITEM_IDS = {
    red_beret: 'red_hat',
    purple_beret: 'blue_hat'
};

function normalizeShopItemId(itemId) {
    if (!itemId) {
        return itemId;
    }

    return LEGACY_SHOP_ITEM_IDS[itemId] || itemId;
}

function currentGearName(requirement) {
    return LEGACY_GEAR_RENAMES[requirement] || requirement;
}

const DEFAULT_SHOP_ITEMS = [
    { id: 'red_hat', name: 'Red Hat', price: 50, category: 'accessories', requires: 'cap', owned: false },
    { id: 'blue_hat', name: 'Blue Hat', price: 75, category: 'accessories', requires: 'cap', owned: false },
    { id: 'blue_hoodie', name: 'Blue Hoodie', price: 80, category: 'clothes', requires: 'cape', owned: false },
    { id: 'black_hoodie', name: 'Black Hoodie', price: 100, category: 'clothes', requires: 'cape', owned: false },
    { id: 'forest_background', name: 'Forest Background', price: 100, category: 'backgrounds', requires: null, owned: false },
    { id: 'castle_background', name: 'Castle Background', price: 150, category: 'backgrounds', requires: null, owned: false }
];

const ITEM_REQUIREMENTS = {
    red_hat: 'cap',
    blue_hat: 'cap',
    blue_hoodie: 'cape',
    black_hoodie: 'cape'
};

let shopItems = [...DEFAULT_SHOP_ITEMS];
let unlockedGear = [];
let ownedCosmeticIds = new Set();

function readSavedEquipment() {
    try {
        return JSON.parse(localStorage.getItem('questify_equipment') || '{}');
    } catch (error) {
        console.warn('Could not read saved shop equipment, resetting.', error);
        return {};
    }
}

const savedEquipment = readSavedEquipment();

let equippedCosmetics = {
    accessories: normalizeShopItemId(savedEquipment.accessories ?? null),
    clothes: normalizeShopItemId(savedEquipment.clothes ?? null),
    backgrounds: normalizeShopItemId(savedEquipment.backgrounds ?? null)
};

let coins = 0;
let selectedCategory = 'all';
let loading = false;
let purchasing = false;

function showCoins(amount) {
    const label = `${amount} coins`;
    if (coinDisplay) {
        coinDisplay.textContent = label;
    }

    const wallet = document.getElementById('wallet-balance');
    if (wallet) {
        wallet.textContent = label;
    }
}

function applyEquippedCosmeticsFromServer(payload) {
    if (!payload || typeof payload !== 'object') {
        return;
    }

    equippedCosmetics = {
        accessories: normalizeShopItemId(payload.accessories ?? null),
        clothes: normalizeShopItemId(payload.clothes ?? null),
        backgrounds: normalizeShopItemId(payload.backgrounds ?? null)
    };
    localStorage.setItem('questify_equipment', JSON.stringify(equippedCosmetics));
    updateAvatarBackground();
}

async function persistEquippedCosmetics() {
    try {
        const result = await shopRequest('/api/player/shop-equipment', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(equippedCosmetics)
        });
        applyEquippedCosmeticsFromServer(result);
    } catch (error) {
        console.warn('Could not save shop equipment to server:', error);
    }
}

async function shopRequest(url, options = {}) {
    const response = await fetch(url, options);
    const text = await response.text();
    let data = {};

    if (text) {
        try {
            data = JSON.parse(text);
        } catch (parseError) {
            throw new Error(
                `The server sent an unexpected response (${response.status}) for ` +
                `${options.method || 'GET'} ${url}`
            );
        }
    }

    if (!response.ok) {
        throw new Error(data.error || `The request failed (${response.status})`);
    }

    return data;
}

async function loadUnlockedGear() {
    try {
        const response = await fetch('/api/character-state');
        if (!response.ok) {
            return;
        }

        const player = await response.json();
            unlockedGear =
                player.available_equipment ||
                player.unlocked_items ||
                [];

        if (player.coins !== undefined && player.coins !== null) {
            showCoins(player.coins);
        }

        if (Array.isArray(player.owned_cosmetics)) {
                ownedCosmeticIds = new Set(
                    player.owned_cosmetics.map(entry => {
                        const raw =
                            typeof entry === 'string'
                                ? entry
                                : (entry.id ?? entry.item_id);
                        return normalizeShopItemId(raw);
                    })
                );
        }
    } catch (error) {
        console.warn('Could not load character state for gear requirements:', error);
    }
}

async function loadShop() {
    if (loading || purchasing) {
        return;
    }

    loading = true;
    renderShop();

    try {
        await loadUnlockedGear();
        const data = await shopRequest('/api/shop');

        coins = data.coins ?? coins;
        if (Array.isArray(data.items)) {
            shopItems = data.items.map(item => ({
                ...item,
                requires: currentGearName(
                    item.requires !== undefined
                        ? item.requires
                        : (ITEM_REQUIREMENTS[item.id] || null)
                )
            }));
        }
        showCoins(coins);
        if (data.equipped_cosmetics) {
            applyEquippedCosmeticsFromServer(data.equipped_cosmetics);
        }
    } catch (error) {
        console.error('Could not load shop from /api/shop, using fallback items:', error);
    } finally {
        shopItems.forEach(item => {
            if (ownedCosmeticIds.has(item.id)) {
                item.owned = true;
            }
        });
        loading = false;
        renderShop();
    }
}

async function purchaseItem(itemId) {
    if (loading || purchasing) {
        return;
    }

    const item = shopItems.find(entry => entry.id === itemId);
    if (!item || item.owned) {
        return;
    }

    const isUnlocked = !item.requires || unlockedGear.includes(item.requires);
    if (!isUnlocked) {
        return;
    }

    if (!confirm(`Buy ${item.name} for ${item.price} coins?`)) {
        return;
    }

    purchasing = true;
    renderShop();

    try {
        let result;
        try {
            result = await shopRequest(`/api/shop/${itemId}/purchase`, { method: 'POST' });
        } catch (firstErr) {
            result = await shopRequest('/api/shop/buy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ item_id: itemId })
            });
        }

        coins = result.coins ?? (coins - item.price);
        item.owned = true;
        showCoins(coins);
    } catch (error) {
        alert(`Could not purchase item: ${error.message}`);
    } finally {
        purchasing = false;
        renderShop();
    }

    await loadShop();
}

// Shop item id -> gear layer id (matches static/images/*.png)
const SHOP_EQUIP_LAYER = {
    red_hat: 'item-red_hat',
    blue_hat: 'item-blue_hat',
    blue_hoodie: 'item-blue_hoodie',
    black_hoodie: 'item-black_hoodie'
};

function applyShopWearables() {
    document.querySelectorAll('.shop-gear-layer').forEach(layer => {
        layer.classList.remove('equipped');
    });

    const accessory = normalizeShopItemId(equippedCosmetics.accessories);
    const clothes = normalizeShopItemId(equippedCosmetics.clothes);

    if (accessory && SHOP_EQUIP_LAYER[accessory]) {
        document
            .getElementById(SHOP_EQUIP_LAYER[accessory])
            ?.classList.add('equipped');
    }

    if (clothes && SHOP_EQUIP_LAYER[clothes]) {
        document
            .getElementById(SHOP_EQUIP_LAYER[clothes])
            ?.classList.add('equipped');
    }
}

function updateAvatarBackground() {
    const characterStage = document.querySelector('.character-stage');
    if (!characterStage) {
        return;
    }

    const background = equippedCosmetics.backgrounds;
    const forestEquipped =
        background === 'forest_background' || background === 3;
    const castleEquipped = background === 'castle_background';

    characterStage.classList.toggle('forest-background', forestEquipped);
    characterStage.classList.toggle('castle-background', castleEquipped);

    applyShopWearables();
}

async function equipItem(itemId) {
    const item = shopItems.find(product => product.id === itemId);
    if (!item || !item.owned) {
        return;
    }

    equippedCosmetics[item.category] = normalizeShopItemId(item.id);
    localStorage.setItem('questify_equipment', JSON.stringify(equippedCosmetics));
    updateAvatarBackground();
    renderShopInventory();
    await persistEquippedCosmetics();
}

function renderShopInventory() {
    if (!inventoryContainer) {
        return;
    }

    inventoryContainer.replaceChildren();

    const ownedItems = shopItems.filter(item => item.owned);

    if (ownedItems.length === 0) {
        const message = document.createElement('p');
        message.textContent = 'No items purchased yet.';
        inventoryContainer.appendChild(message);
    } else {
        ownedItems.forEach(item => {
            const itemId = normalizeShopItemId(item.id);
            const isEquipped = equippedCosmetics[item.category] === itemId;

            const card = document.createElement('div');
            card.className = 'shop-item';

            const title = document.createElement('h3');
            title.textContent = item.name;

            const equipBtn = document.createElement('button');
            equipBtn.type = 'button';
            equipBtn.className = 'equip-button';
            equipBtn.dataset.id = item.id;
            equipBtn.disabled = isEquipped;
            equipBtn.textContent = isEquipped ? 'Equipped' : 'Equip';

            equipBtn.addEventListener('click', () => equipItem(item.id));

            card.append(title, equipBtn);
            inventoryContainer.appendChild(card);
        });
    }
}

function renderShop() {
    if (!shopContainer) {
        return;
    }

    shopContainer.replaceChildren();

    const visibleItems = shopItems.filter(item => {
        return selectedCategory === 'all' || item.category === selectedCategory;
    });

    visibleItems.forEach(item => {
        const isUnlocked = !item.requires || unlockedGear.includes(item.requires);

        const card = document.createElement('div');
        card.className = 'shop-item';

        const title = document.createElement('h3');
        title.textContent = item.name;

        const price = document.createElement('p');
        price.textContent = `${item.price} coins`;

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'buy-button';
        button.dataset.id = item.id;

        if (item.owned) {
            button.textContent = 'Owned';
        } else if (!isUnlocked) {
            const gearName =
                (typeof GEAR_LABELS !== 'undefined' && GEAR_LABELS[item.requires]) ||
                item.requires;
            button.textContent = `Requires ${gearName}`;
        } else if (coins < item.price) {
            button.textContent = 'Not enough coins';
        } else {
            button.textContent = 'Buy';
        }

        button.disabled =
            loading ||
            purchasing ||
            item.owned ||
            !isUnlocked ||
            coins < item.price;

        button.addEventListener('click', () => purchaseItem(item.id));

        card.append(title, price, button);
        shopContainer.appendChild(card);
    });

    renderShopInventory();
}

async function refreshCustomizerInventory() {
    await loadShop();
    renderShopInventory();
}

function openShop() {
    if (!shopModal) {
        return;
    }

    shopModal.removeAttribute('hidden');
    loadShop();
}

function closeShop() {
    shopModal?.setAttribute('hidden', '');
}

function initShop() {
    shopButton = document.getElementById('shop-button');
    shopModal = document.getElementById('shop-modal');
    closeButton = document.getElementById('close-shop');
    shopContainer = document.getElementById('shop-items');
    inventoryContainer = document.getElementById('shop-inventory');
    coinDisplay = document.getElementById('shop-coins');

    if (!shopButton || !shopModal) {
        console.error('Shop UI elements are missing from the page.');
        return;
    }

    shopButton.addEventListener('click', openShop);
    closeButton?.addEventListener('click', closeShop);

    shopModal.addEventListener('click', event => {
        if (event.target === shopModal) {
            closeShop();
        }
    });

    document.querySelectorAll('.shop-category').forEach(button => {
        button.addEventListener('click', () => {
            selectedCategory = button.dataset.category;

            document.querySelectorAll('.shop-category').forEach(categoryButton => {
                categoryButton.setAttribute(
                    'aria-pressed',
                    String(categoryButton === button)
                );
            });

            renderShop();
        });
    });

    updateAvatarBackground();
    loadShop();
}

function bootShop() {
    try {
        initShop();
    } catch (error) {
        console.error('Questify shop failed to start:', error);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootShop);
} else {
    bootShop();
}

window.openQuestifyShop = openShop;
window.refreshCustomizerInventory = refreshCustomizerInventory;
})();
