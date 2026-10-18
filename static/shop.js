

const shopButton = document.getElementById("shop-button");
const shopModal = document.getElementById("shop-modal");
const closeButton = document.getElementById("close-shop");
const shopContainer = document.getElementById("shop-items");
const inventoryContainer = document.getElementById("shop-inventory");
const coinDisplay = document.getElementById("shop-coins");
const characterStage = document.querySelector(".character-stage");

// Shop data comes from the Python backend.
let shopItems = [];
let coins = 0;
let selectedCategory = "all";
let loading = false;
let purchasing = false;


const savedEquipment = JSON.parse(
    localStorage.getItem("questify_equipment") || "{}"
);

let equippedCosmetics = {
    accessories: savedEquipment.accessories ?? null,
    clothes: savedEquipment.clothes ?? null,
    backgrounds: savedEquipment.backgrounds ?? null
};


// Send requests to the Flask backend.
async function shopRequest(url, options = {}) {
    const response = await fetch(url, options);
    const contentType = response.headers.get("content-type") || "";

    if (!contentType.includes("application/json")) {
        throw new Error(
            `Server returned HTTP ${response.status} instead of JSON`
        );
    }

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || "Request failed");
    }

    return data;
}

// Load coins, items, and owned inventory.
async function loadShop() {
    if (loading || purchasing) {
        return;
    }

    loading = true;
    renderShop();

    try {
        const data = await shopRequest("/api/shop");

        coins = data.coins;
        shopItems = data.items;
        coinDisplay.textContent = coins;

// Make sure saved equipment is still owned by the player.
for (const category of Object.keys(equippedCosmetics)) {
    const savedId = equippedCosmetics[category];

    if (savedId !== null) {
        const ownedItem = shopItems.find(
            item => item.id === savedId &&
                    item.category === category &&
                    item.owned
        );

        if (!ownedItem) {
            equippedCosmetics[category] = null;
        }
    }
}

// Update the saved equipment after checking ownership.
localStorage.setItem(
    "questify_equipment",
    JSON.stringify(equippedCosmetics)
);

// Apply the restored background to the avatar.
updateAvatarBackground();


    } catch (error) {
        coinDisplay.textContent = "Unavailable";
        console.error("Could not load shop:", error);

    } finally {
        loading = false;
        renderShop();
    }
}

// Purchase an item using the Python backend.
async function purchaseItem(itemId) {
    if (loading || purchasing) {
        return;
    }

    const item = shopItems.find(product => product.id === itemId);

    if (!item || item.owned) {
        return;
    }

    if (!confirm(`Buy ${item.name} for ${item.price} coins?`)) {
        return;
    }

    purchasing = true;
    renderShop();

    try {
        await shopRequest(`/api/shop/${itemId}/purchase`, {
            method: "POST"
        });

        const data = await shopRequest("/api/shop");

        coins = data.coins;
        shopItems = data.items;
        coinDisplay.textContent = coins;

    } catch (error) {
        console.error("Purchase failed:", error);
        alert(`Could not purchase item: ${error.message}`);

    } finally {
        purchasing = false;
        renderShop();
    }
}

// Apply the selected background to the avatar circle.
function updateAvatarBackground() {
    if (!characterStage) {
        console.error("Character stage not found");
        return;
    }

    const forestEquipped = equippedCosmetics.backgrounds === 3;

    characterStage.classList.toggle(
        "forest-background",
        forestEquipped
    );
}

// Equip a cosmetic that the player owns.

function equipItem(itemId) {
    const item = shopItems.find(product => product.id === itemId);

    if (!item || !item.owned) {
        return;
    }

    equippedCosmetics[item.category] = item.id;

    // Save the selected equipment in the browser.
    localStorage.setItem(
        "questify_equipment",
        JSON.stringify(equippedCosmetics)
    );

    updateAvatarBackground();
    renderShop();
}


// Display all products and purchased inventory.
function renderShop() {
    shopContainer.replaceChildren();
    inventoryContainer.replaceChildren();

    // Filter products by category.
    const visibleItems = shopItems.filter(item => {
        return selectedCategory === "all" ||
               item.category === selectedCategory;
    });

    // Create product cards.
    visibleItems.forEach(item => {
        const card = document.createElement("div");
        card.className = "shop-item";

        const title = document.createElement("h3");
        title.textContent = item.name;

        const price = document.createElement("p");
        price.textContent = `🪙 ${item.price} coins`;

        const button = document.createElement("button");
        button.type = "button";
        button.className = "buy-button";

        if (item.owned) {
            button.textContent = "Owned ✓";
        } else if (coins < item.price) {
            button.textContent = "Not enough coins";
        } else {
            button.textContent = "Buy";
        }

        button.disabled =
            loading ||
            purchasing ||
            item.owned ||
            coins < item.price;

        button.addEventListener("click", () => {
            purchaseItem(item.id);
        });

        card.append(title, price, button);
        shopContainer.appendChild(card);
    });

    // Find items purchased by the player.
    const ownedItems = shopItems.filter(item => item.owned);

    if (ownedItems.length === 0) {
        inventoryContainer.textContent = "No items purchased yet.";
        return;
    }

    // Create inventory cards with Equip buttons.
    ownedItems.forEach(item => {
        const card = document.createElement("div");
        card.className = "shop-item";

        const title = document.createElement("h3");
        title.textContent = item.name;

        const button = document.createElement("button");
        button.type = "button";
        button.className = "equip-button";

        const isEquipped =
            equippedCosmetics[item.category] === item.id;

        button.textContent = isEquipped ? "Equipped ✓" : "Equip";
        button.disabled = isEquipped;

        button.addEventListener("click", () => {
            equipItem(item.id);
        });

        card.append(title, button);
        inventoryContainer.appendChild(card);
    });
}

// Open the shop and refresh its information.
shopButton.addEventListener("click", () => {
    shopModal.removeAttribute("hidden");
    loadShop();
});

// Close the shop.
closeButton.addEventListener("click", () => {
    shopModal.setAttribute("hidden", "");
});

// Shop category filters.
document.querySelectorAll(".shop-category").forEach(button => {
    button.addEventListener("click", () => {
        selectedCategory = button.dataset.category;

        document.querySelectorAll(".shop-category").forEach(categoryButton => {
            categoryButton.setAttribute(
                "aria-pressed",
                String(categoryButton === button)
            );
        });

        renderShop();
    });
});

// Initialize the shop.
renderShop();
loadShop();
