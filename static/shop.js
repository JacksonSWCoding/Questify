const shopButton = document.getElementById("shop-button");
const shopModal = document.getElementById("shop-modal");
const closeButton = document.getElementById("close-shop");
const shopContainer = document.getElementById("shop-items");
const inventoryContainer = document.getElementById("shop-inventory");

const shopItems = [
    { id: "red_beret", name: "Red Beret", price: 50, category: "accessories", requires: "beret" },
    { id: "purple_beret", name: "Purple Beret", price: 75, category: "accessories", requires: "beret" },
    { id: "blue_hoodie", name: "Blue Hoodie", price: 80, category: "clothes", requires: "hoodie" },
    { id: "black_hoodie", name: "Black Hoodie", price: 100, category: "clothes", requires: "hoodie" },
    { id: "forest_background", name: "Forest Background", price: 100, category: "backgrounds", requires: null },
    { id: "castle_background", name: "Castle Background", price: 150, category: "backgrounds", requires: null }
];

let unlockedGear = [];
let ownedCosmetics = [];
let equippedCosmetics = {
    accessories: null,
    clothes: null,
    backgrounds: null
};
let selectedCategory = "all";

shopButton.addEventListener("click", () => {
    shopModal.removeAttribute("hidden");
    loadUnlockedGear();
});

closeButton.addEventListener("click", () => {
    shopModal.setAttribute("hidden", "");
});

async function loadUnlockedGear() {
    try {
        const response = await fetch("/api/character-state");

        if (!response.ok) {
            throw new Error("Failed to load character state");
        }

        const player = await response.json();
        unlockedGear = player.unlocked_items || [];

        displayShopItems();
    } catch (error) {
        console.error("Could not load unlocked gear:", error);
    }
}

function displayShopItems() {
    shopContainer.innerHTML = "";

    const filteredItems = shopItems.filter((item) =>
        selectedCategory === "all" || item.category === selectedCategory
    );

    filteredItems.forEach((item) => {
        const isUnlocked =
            item.requires === null || unlockedGear.includes(item.requires);
        const isOwned = ownedCosmetics.includes(item.id);

        shopContainer.innerHTML += `
            <div class="shop-item">
                <h3>${item.name}</h3>
                <p>🪙 ${item.price} coins</p>
                ${
                    isOwned
                        ? `<button class="buy-button" disabled>Owned ✓</button>`
                        : !isUnlocked
                            ? `<button class="buy-button" disabled>🔒 Requires ${item.requires}</button>`
                            : `<button class="buy-button" data-id="${item.id}">Buy</button>`
                }
            </div>
        `;
    });
}

function displayInventory() {
    inventoryContainer.innerHTML = "";

    if (ownedCosmetics.length === 0) {
        inventoryContainer.innerHTML = "<p>No items purchased yet.</p>";
        return;
    }

    ownedCosmetics.forEach((itemId) => {
        const item = shopItems.find((product) => product.id === itemId);

        if (!item) return;

        const isEquipped = equippedCosmetics[item.category] === item.id;

        inventoryContainer.innerHTML += `
            <div class="shop-item">
                <h3>${item.name}</h3>
                <button class="equip-button"
                    data-id="${item.id}"
                    ${isEquipped ? "disabled" : ""}>
                    ${isEquipped ? "Equipped ✓" : "Equip"}
                </button>
            </div>
        `;
    });
}

const categoryButtons = document.querySelectorAll(".shop-category");

categoryButtons.forEach((button) => {
    button.addEventListener("click", () => {
        selectedCategory = button.dataset.category;
        displayShopItems();
    });
});

inventoryContainer.addEventListener("click", (event) => {
    const button = event.target.closest(".equip-button");
    if (!button) return;

    const itemId = button.dataset.id;
    if (!ownedCosmetics.includes(itemId)) return;

    const item = shopItems.find((product) => product.id === itemId);
    if (!item) return;

    equippedCosmetics[item.category] = item.id;
    displayInventory();
});

shopContainer.addEventListener("click", async (event) => {
    const button = event.target.closest(".buy-button");
    if (!button || button.disabled) return;

    const itemId = button.dataset.id;
    const item = shopItems.find((product) => product.id === itemId);
    if (!item) return;

    button.disabled = true;
    button.textContent = "Purchasing...";

    try {
        const response = await fetch("/api/shop/buy", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ item_id: itemId })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || "Purchase failed");
        }

        ownedCosmetics = result.owned_cosmetics || [];
        document.getElementById("shop-coins").textContent = result.coins;

        displayShopItems();
        displayInventory();
    } catch (error) {
        console.error("Purchase failed:", error);
        alert(error.message);
    } finally {
        if (button.isConnected) {
            button.disabled = false;
            button.textContent = "Buy";
        }
    }
});

displayShopItems();
displayInventory();
