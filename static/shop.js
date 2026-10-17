const shopButton = document.getElementById('shop-button');
const shopModal = document.getElementById('shop-modal');
const closeButton = document.getElementById('close-shop');
const shopContainer = document.getElementById('shop-items');

const shopItems = [
    {
        id: 1,
        name: 'Wizard Hat',
        price: 50,
        category: 'accessories',
        image: '/static/images/shop/wizard-hat.png'
    },
    {
        id: 2,
        name: 'Knight Armor',
        price: 100,
        category: 'clothes',
        image: '/static/images/shop/knight-armor.png'
    },
    {
        id: 3,
        name: 'Forest Background',
        price: 150,
        category: 'backgrounds',
        image: '/static/images/shop/forest.png'
    }
];

shopButton.addEventListener('click', () => {
    shopModal.removeAttribute('hidden');
    refreshCoinBalance();
});

closeButton.addEventListener('click', () => {
    shopModal.setAttribute('hidden', '');
});

function displayShopItems() {
    shopContainer.innerHTML = '';

    shopItems.forEach(item => {
        shopContainer.innerHTML += `
            <div class="shop-item">
                <h3>${item.name}</h3>
                <p>🪙 ${item.price} coins</p>
                <button class="buy-button" data-id="${item.id}">
                    Buy
                </button>
            </div>
        `;
    });
}

async function refreshCoinBalance() {
    const coinDisplay = document.getElementById('shop-coins');

    if (!coinDisplay) return;

    try {
        const response = await fetch('/api/player');

        if (!response.ok) {
            throw new Error('Could not load coin balance');
        }

        const player = await response.json();
        coinDisplay.textContent = player.coins;
    } catch (error) {
        coinDisplay.textContent = 'Unavailable';
        console.error(error);
    }
}

displayShopItems();
refreshCoinBalance();