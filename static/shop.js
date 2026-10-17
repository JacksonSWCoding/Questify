
const shopButton = document.getElementById("shop-button");
const shopModal = document.getElementById("shop-modal");
const closeButton = document.getElementById("close-shop");
const shopContainer = document.getElementById("shop-items");
const inventoryContainer = document.getElementById("shop-inventory");
const coinDisplay = document.getElementById("shop-coins");

let shopItems = [];
let coins = 0;
let selectedCategory = "all";
let loading = false;
let purchasing = false;

// Temporary frontend-only equipment selection.
// The backend must add an equip endpoint to save this permanently.
let equippedCosmetics = {
    accessories: null,
    clothes: null,
    backgrounds: null
};

async function shopRequest(url, options = {}) {
    const response = await fetch(url, options);
    const contentType = response.headers.get("content-type") || "";

    if (!contentType.includes("application/json")) {
        throw new Error(`Server returned HTTP ${response.status} instead of JSON`);
    }

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || "Request failed");
    }

    return data;
}

async function loadShop() {
    if (loading || purchasing) return;

    loading = true;
    renderShop();

    try {
        const data = await shopRequest("/api/shop");
        coins = data.coins;
        shopItems = data.items;
        coinDisplay.textContent = coins;
    } catch (error) {
        coinDisplay.textContent = "Unavailable";
        console.error("Could not load shop:", error);
    } finally {
        loading = false;
        renderShop();
    }
}

async function purchaseItem(itemId) {
    if (loading || purchasing) return;

    const item = shopItems.find((product) => product.id === itemId);

    if (!item || item.owned) return;

    if (!confirm(`Buy ${item.name} for ${item.price} coins?`)) return;

    purchasing = true;
    renderShop();

    try {
        await shopRequest(`/api/shop/${itemId}/purchase`, {
            method: "POST"
        });

        await loadShopAfterPurchase();

    } catch (error) {
        alert(`Could not purchase item: ${error.message}`);
    } finally {
        purchasing = false;
        renderShop();
    }
}

async function loadShopAfterPurchase() {
    const data = await shopRequest("/api/shop");

    coins = data.coins;
    shopItems = data.items;
    coinDisplay.textContent = coins;
}

function renderShop() {
    shopContainer.replaceChildren();
    inventoryContainer.replaceChildren();

    const visibleItems = shopItems.filter((item) =>
        selectedCategory === "all" ||
        item.category === selectedCategory
    );

    visibleItems.forEach((item) => {
        const card = document.createElement("div");
        card.className = "shop-item";

        const title = document.createElement("h3");
        title.textContent = item.name;

        const price = document.createElement("p");
        price.textContent = `🪙 ${item.price} coins`;

        const button = document.createElement("button");
        button.className = "buy-button";
        button.type = "button";

        if (item.owned) {
            button.textContent = "Owned ✓";
        } else if (coins < item.price) {
            button.textContent = "Not enough coins";
        } else {
            button.textContent = "Buy";
        }

        button.disabled =
            loading || purchasing || item.owned || coins < item.price;

        button.addEventListener("click", () => purchaseItem(item.id));

        card.append(title, price, button);
        shopContainer.appendChild(card);
    });

    const ownedItems = shopItems.filter((item) => item.owned);

    if (ownedItems.length === 0) {
        inventoryContainer.textContent = "No items purchased yet.";
        return;
    }

    ownedItems.forEach((item) => {
        const card = document.createElement("div");
        card.className = "shop-item";

        const title = document.createElement("h3");
        title.textContent = item.name;

        const button = document.createElement("button");
        button.className = "equip-button";
        button.type = "button";

        const isEquipped = equippedCosmetics[item.category] === item.id;

        button.textContent = isEquipped ? "Equipped ✓" : "Equip";
        button.disabled = isEquipped;

        button.addEventListener("click", () => {
            equippedCosmetics[item.category] = item.id;
            renderShop();
        });

        card.append(title, button);
        inventoryContainer.appendChild(card);
    });
}

shopButton.addEventListener("click", () => {
    shopModal.removeAttribute("hidden");
    loadShop();
});

closeButton.addEventListener("click", () => {
    shopModal.setAttribute("hidden", "");
});

document.querySelectorAll(".shop-category").forEach((button) => {
    button.addEventListener("click", () => {
        selectedCategory = button.dataset.category;
        renderShop();
    });
});

renderShop();
loadShop();
