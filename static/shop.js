const shopButton = document.getElementById('shop-button');
const shopModal = document.getElementById('shop-modal');
const closeButton = document.getElementById('close-shop');
const shopContainer = document.getElementById('shop-items');
const inventoryContainer = document.getElementById('shop-inventory');
const coinDisplay = document.getElementById('shop-coins');

// The hero's gear was renamed when new items were added. Any shop item that still asks
// for an old gear name is translated to the gear that now sits in the same tier
// (creative tier 1: beret -> cap, coding tier 2: hoodie -> cape).
const LEGACY_GEAR_RENAMES = {
    beret: 'cap',
    hoodie: 'cape'
};

function currentGearName(requirement) {
    return LEGACY_GEAR_RENAMES[requirement] || requirement;
}

// Fallback items with Category Evolution 'requires' rules in case /api/shop doesn't include 'requires'
const DEFAULT_SHOP_ITEMS = [
    { id: 'red_beret', name: 'Red Beret', price: 50, category: 'accessories', requires: 'cap', owned: false },
    { id: 'purple_beret', name: 'Purple Beret', price: 75, category: 'accessories', requires: 'cap', owned: false },
    { id: 'blue_hoodie', name: 'Blue Hoodie', price: 80, category: 'clothes', requires: 'cape', owned: false },
    { id: 'black_hoodie', name: 'Black Hoodie', price: 100, category: 'clothes', requires: 'cape', owned: false },
    { id: 'forest_background', name: 'Forest Background', price: 100, category: 'backgrounds', requires: null, owned: false },
    { id: 'castle_background', name: 'Castle Background', price: 150, category: 'backgrounds', requires: null, owned: false }
];

// Map item IDs to their category evolution requirements
const ITEM_REQUIREMENTS = {
    red_beret: 'cap',
    purple_beret: 'cap',
    blue_hoodie: 'cape',
    black_hoodie: 'cape'
};

let shopItems = [...DEFAULT_SHOP_ITEMS];
let unlockedGear = [];
let ownedCosmeticIds = new Set();

const savedEquipment = JSON.parse(
    localStorage.getItem("questify_equipment") || "{}"
);

let equippedCosmetics = {
    accessories: savedEquipment.accessories ?? null,
    clothes: savedEquipment.clothes ?? null,
    backgrounds: savedEquipment.backgrounds ?? null
};

let coins = 0;
let selectedCategory = 'all';
let loading = false;
let purchasing = false;

function showCoins(amount) {
    const label = `${amount} coins`;
    if (coinDisplay) coinDisplay.textContent = label;
    const wallet = document.getElementById('wallet-balance');
    if (wallet) wallet.textContent = label;
}

async function shopRequest(url, options = {}) {
    const response = await fetch(url, options);

    // Read as text first so an HTML error page gives a readable message
    // instead of "Unexpected token '<'".
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
        if (response.ok) {
            const player = await response.json();
            unlockedGear = player.unlocked_items || [];
            if (player.coins !== undefined && player.coins !== null) {
                showCoins(player.coins);
            }
            // Remember what the wallet says is owned, so "Owned" survives a page reload
            // even when /api/shop is not available.
            if (Array.isArray(player.owned_cosmetics)) {
                ownedCosmeticIds = new Set(
                    player.owned_cosmetics.map(entry =>
                        typeof entry === 'string' ? entry : (entry.id ?? entry.item_id)
                    )
                );
            }
        }
    } catch (error) {
        console.warn('Could not load character state for gear requirements:', error);
    }
}

async function loadShop() {
    if (loading || purchasing) return;

    loading = true;
    renderShop();

    try {
        // Load both character evolution unlocks and shop state in parallel
        await loadUnlockedGear();
        const data = await shopRequest('/api/shop');

        coins = data.coins ?? coins;
        if (Array.isArray(data.items)) {
            shopItems = data.items.map(item => ({
                ...item,
                requires: currentGearName(
                    item.requires !== undefined ? item.requires : (ITEM_REQUIREMENTS[item.id] || null)
                )
            }));
        }
        showCoins(coins);
    } catch (error) {
        console.error('Could not load shop from /api/shop, using fallback items:', error);
    } finally {
        shopItems.forEach(item => {
            if (ownedCosmeticIds.has(item.id)) item.owned = true;
        });
        loading = false;
        renderShop();
    }
}

async function purchaseItem(itemId) {
    if (loading || purchasing) return;

    const item = shopItems.find(item => item.id === itemId);
    if (!item || item.owned) return;

    const isUnlocked = !item.requires || unlockedGear.includes(item.requires);
    if (!isUnlocked) return;

    if (!confirm(`Buy ${item.name} for ${item.price} coins?`)) return;

    purchasing = true;
    renderShop();

    try {
        let result;
        try {
            // Try backend branch endpoint first
            result = await shopRequest(`/api/shop/${itemId}/purchase`, { method: 'POST' });
        } catch (firstErr) {
            // Fallback to main branch endpoint if needed
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


function updateAvatarBackground() {
    const characterStage = document.querySelector(".character-stage");
    if (!characterStage) return;

    const forestEquipped =
        equippedCosmetics.backgrounds === "forest_background" ||
        equippedCosmetics.backgrounds === 3;

    characterStage.classList.toggle(
        "forest-background",
        forestEquipped
    );
}

function equipItem(itemId) {
    const item = shopItems.find(product => product.id === itemId);
    if (!item || !item.owned) return;

    equippedCosmetics[item.category] = item.id;

    // Remember the equipped cosmetics after refreshing.
    localStorage.setItem(
        "questify_equipment",
        JSON.stringify(equippedCosmetics)
    );

    // Apply the Forest Background to the avatar.
    updateAvatarBackground();

    renderShop();
}


function renderShop() {
    shopContainer.replaceChildren();
    inventoryContainer.replaceChildren();

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
        price.textContent = `🪙 ${item.price} coins`;

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'buy-button';
        button.dataset.id = item.id;

        if (item.owned) {
            button.textContent = 'Owned ✓';
        } else if (!isUnlocked) {
            const gearName = (typeof GEAR_LABELS !== 'undefined' && GEAR_LABELS[item.requires]) || item.requires;
            button.textContent = `🔒 Requires ${gearName}`;
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

    const ownedItems = shopItems.filter(item => item.owned);

    if (ownedItems.length === 0) {
        const message = document.createElement('p');
        message.textContent = 'No items purchased yet.';
        inventoryContainer.appendChild(message);
    } else {
        ownedItems.forEach(item => {
            const isEquipped = equippedCosmetics[item.category] === item.id;

            const card = document.createElement('div');
            card.className = 'shop-item';

            const title = document.createElement('h3');
            title.textContent = item.name;

            const equipBtn = document.createElement('button');
            equipBtn.type = 'button';
            equipBtn.className = 'equip-button';
            equipBtn.dataset.id = item.id;
            equipBtn.disabled = isEquipped;
            equipBtn.textContent = isEquipped ? 'Equipped ✓' : 'Equip';

            equipBtn.addEventListener('click', () => equipItem(item.id));

            card.append(title, equipBtn);
            inventoryContainer.appendChild(card);
        });
    }
}

shopButton.addEventListener('click', () => {
    shopModal.removeAttribute('hidden');
    loadShop();
});

closeButton.addEventListener('click', () => {
    shopModal.setAttribute('hidden', '');
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