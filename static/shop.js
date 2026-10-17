const shopButton = document.getElementById('shop-button');
const shopModal = document.getElementById('shop-modal');
const closeButton = document.getElementById('close-shop');
const shopContainer = document.getElementById('shop-items');
const inventoryContainer = document.getElementById('shop-inventory');
const coinDisplay = document.getElementById('shop-coins');

let shopItems = [];
let available = false;
let selectedCategory = 'all';
let coins = 0;
let loading = false;
let purchasing = false;

async function shopRequest(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || 'The request failed');
    }

    return data;
}

function updateCoins() {
    if (coinDisplay) coinDisplay.textContent = coins;
    const wallet = document.getElementById('wallet-balance');
    if (wallet) wallet.textContent = `${coins} coins`;
}

async function loadShop() {
    if (loading || purchasing) return;
    loading = true;
    available = false;
    renderShop();
    try {
        const data = await shopRequest('/api/shop');
        coins = data.coins;
        shopItems = data.items;
        available = true;
        updateCoins();
    } catch (error) {
        alert(`Could not load shop: ${error.message}`);
    } finally {
        loading = false;
        renderShop();
    }
}

async function purchaseItem(itemId) {
    if (!available || loading || purchasing) return;

    const item = shopItems.find(item => item.id === itemId);
    if (!item || item.owned) return;

    const isUnlocked = item.unlocked;
    if (!isUnlocked) return;

    if (!confirm(`Buy ${item.name} for ${item.price} coins?`)) return;

    purchasing = true;
    renderShop();

    try {
        const result = await shopRequest(
            `/api/shop/${itemId}/purchase`,
            { method: 'POST' }
        );
        coins = result.coins;
        item.owned = true;
        updateCoins();
    } catch (error) {
        alert(`Could not purchase item: ${error.message}`);
    } finally {
        purchasing = false;
        renderShop();
    }

    await loadShop();
}

function renderShop() {
    shopContainer.replaceChildren();
    inventoryContainer.replaceChildren();

    if (!available) {
        const message = document.createElement('p');
        message.textContent = loading
            ? 'Loading shop...'
            : 'Shop unavailable. Close and reopen the shop to retry.';
        shopContainer.appendChild(message);
        return;
    }

    const visibleItems = shopItems.filter(item => {
        return selectedCategory === 'all' || item.category === selectedCategory;
    });

    visibleItems.forEach(item => {
        const isUnlocked = item.unlocked;

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
            button.textContent = `🔒 Requires ${item.requires}`;
        } else if (coins < item.price) {
            button.textContent = 'Not enough coins';
        } else {
            button.textContent = 'Buy';
        }

        button.disabled =
            !available ||
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

            const card = document.createElement('div');
            card.className = 'shop-item';

            const title = document.createElement('h3');
            title.textContent = item.name;

            const status = document.createElement('p');
            status.textContent = 'Owned ✓';
            card.append(title, status);
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

loadShop();
