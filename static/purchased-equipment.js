const PURCHASED_GEAR = {
    wizard_hat: { name: 'Wizard Hat', slot: 'head' },
    knight_armor: { name: 'Knight Armor', slot: 'body' },
    forest_background: { name: 'Forest Background', slot: 'background' },
    red_hat: { name: 'Red Hat', slot: 'head' },
    blue_hat: { name: 'Blue Hat', slot: 'head' },
    blue_hoodie: { name: 'Blue Hoodie', slot: 'body' },
    black_hoodie: { name: 'Black Hoodie', slot: 'body' },
    castle_background: { name: 'Castle Background', slot: 'background' }
};

let purchasedEquipment = [];

for (const [id, item] of Object.entries(PURCHASED_GEAR)) {
    if (!EQUIPMENT[id]) {
        EQUIPMENT[id] = {
            name: item.name,
            category: 'shop'
        };
    }

    EQUIPMENT_SLOTS[id] = item.slot;
}

function temporarySvg(content) {
    const svg =
        '<svg xmlns="http://www.w3.org/2000/svg" ' +
        'viewBox="0 0 64 64" shape-rendering="crispEdges">' +
        content +
        '</svg>';

    return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
}

function temporaryBeret(color) {
    return temporarySvg(`
        <path fill="#211726" d="M22 8h20v3h4v8H19v-7h3z"/>
        <path fill="${color}" d="M23 9h18v3h4v5H20v-4h3z"/>
        <path fill="#f4cf75" d="M38 11h3v3h-3z"/>
        <path fill="#392633" d="M21 17h22v3H21z"/>
    `);
}

function temporaryHoodie(color, highlight) {
    return temporarySvg(`
        <path fill="#151d2c" d="M24 30h16v3h5v12h-5v5H24v-5h-5V33h5z"/>
        <path fill="${color}" d="M24 33h16v15H24zM20 34h4v10h-4zM40 34h4v10h-4z"/>
        <path fill="${highlight}" d="M25 31h3v4h8v-4h3v7H25zM27 42h10v4H27z"/>
        <path fill="#e7e4d9" d="M28 35h1v6h-1zM35 35h1v6h-1z"/>
    `);
}

const TEMPORARY_ART = {
    red_hat: temporaryBeret('#ca3549'),

    blue_hat: temporaryBeret('#285fbd'),

    blue_hoodie: temporaryHoodie('#285fbd', '#558ee3'),

    black_hoodie: temporaryHoodie('#272d38', '#505b6e'),

    knight_armor: temporarySvg(`
        <path fill="#293343" d="M23 30h18v3h5v9h-5v8H23v-8h-5v-9h5z"/>
        <path fill="#adbccc" d="M25 32h14v15H25zM19 34h5v6h-5zM40 34h5v6h-5z"/>
        <path fill="#edf3fa" d="M25 32h3v12h-3zM20 34h3v2h-3zM40 34h4v2h-4z"/>
        <path fill="#64758b" d="M31 33h2v13h-2zM25 45h14v3H25z"/>
        <path fill="#dfb456" d="M24 47h16v3H24zM30 37h4v4h-4z"/>
    `),

    forest_background: temporarySvg(`
        <path fill="#172f37" d="M0 0h64v64H0z"/>
        <path fill="#47716c" d="M0 30h64v34H0z"/>
        <path fill="#182d24" d="M0 47h64v17H0z"/>
        <path fill="#75543c" d="M8 22h4v35H8zM51 16h4v42h-4z"/>
        <path fill="#215344" d="M10 4L0 26h7L0 40h23L13 26h7zM53 0L40 25h8L38 43h26V24z"/>
        <path fill="#347658" d="M10 8L4 23h12zM53 5L45 23h15z"/>
        <path fill="#7d8052" d="M28 48h8l10 16H18z"/>
    `),

    castle_background: temporarySvg(`
        <path fill="#222e4a" d="M0 0h64v64H0z"/>
        <path fill="#f0d99b" d="M46 8h8v8h-8z"/>
        <path fill="#4b596f" d="M0 44h64v20H0zM6 18h14v32H6zM44 18h14v32H44zM20 28h24v22H20z"/>
        <path fill="#8593a6" d="M6 15h4v6H6zM16 15h4v6h-4zM44 15h4v6h-4zM54 15h4v6h-4zM20 25h5v6h-5zM30 25h5v6h-5zM40 25h4v6h-4z"/>
        <path fill="#172035" d="M10 27h5v9h-5zM49 27h5v9h-5zM28 37h8v17h-8z"/>
        <path fill="#8390a1" d="M28 54h8l13 10H15z"/>
    `)
};

const purchasedStyle = document.createElement('style');

purchasedStyle.textContent = `
    .character-stage {
        isolation: isolate;
    }

    .character-rig {
        z-index: 1;
    }

    #purchased-background {
        position: absolute;
        inset: 0;
        z-index: 0;
        background-size: 100% 100%;
        image-rendering: pixelated;
        pointer-events: none;
    }

    .character-rig .temporary-gear {
        background-position: 0 0;
        background-size: 64px 64px;
        image-rendering: pixelated;
        pointer-events: none;
    }

    #shop-inventory .shop-item {
        padding: 16px;
        min-width: 0;
    }

    #shop-inventory h3 {
        font-size: 1rem;
        margin: 0 0 12px;
    }

    #shop-inventory button {
        font-size: 0.85rem;
        padding: 10px 14px;
    }

    #shop-inventory button[aria-pressed="true"] {
        background: #176c40;
        border-color: #4ade80;
    }
`;

document.head.appendChild(purchasedStyle);

function ensurePurchasedLayers() {
    const rig = document.querySelector('.character-rig');
    const stage = document.querySelector('.character-stage');

    if (!rig || !stage) return;

    if (!document.getElementById('purchased-background')) {
        const backdrop = document.createElement('div');
        backdrop.id = 'purchased-background';
        backdrop.setAttribute('aria-hidden', 'true');

        stage.prepend(backdrop);
    }

    for (const [id, item] of Object.entries(PURCHASED_GEAR)) {
        if (
            item.slot === 'background' ||
            document.getElementById('item-' + id)
        ) {
            continue;
        }

        const layer = document.createElement('div');
        layer.id = 'item-' + id;
        layer.setAttribute('aria-hidden', 'true');

        layer.className =
            'gear-layer ' +
            (id === 'wizard_hat' ? 'lpc-sprite' : 'temporary-gear');

        if (id !== 'wizard_hat') {
            layer.style.backgroundImage = TEMPORARY_ART[id];
            layer.style.zIndex = item.slot === 'head' ? '12' : '4';
        }

        rig.appendChild(layer);
    }
}

function applyPurchasedBackground() {
    const backdrop = document.getElementById('purchased-background');

    if (!backdrop) return;

    const id = [...pendingEquipment].find(item => {
        return (
            unlockedEquipment.has(item) &&
            EQUIPMENT_SLOTS[item] === 'background'
        );
    });

    backdrop.style.backgroundImage = id ? TEMPORARY_ART[id] : 'none';
}

function renderPurchasedInventory() {
    const container = document.getElementById('shop-inventory');

    if (!container) return;

    container.replaceChildren();

    if (!purchasedEquipment.length) {
        const message = document.createElement('p');
        message.textContent = 'Buy items in the Shop to add them here.';

        container.appendChild(message);
        return;
    }

    for (const item of purchasedEquipment) {
        if (!PURCHASED_GEAR[item.id]) continue;

        const card = document.createElement('div');
        card.className = 'shop-item';

        const title = document.createElement('h3');
        title.textContent = item.name;

        const button = document.createElement('button');
        button.type = 'button';

        const selected = pendingEquipment.has(item.id);

        button.textContent = selected
            ? 'Selected ✓ · Remove'
            : 'Equip';

        button.setAttribute('aria-pressed', String(selected));

        button.disabled =
            !editingEquipment ||
            equipmentBusy ||
            !unlockedEquipment.has(item.id);

        button.addEventListener('click', () => {
            if (
                !editingEquipment ||
                equipmentBusy ||
                !unlockedEquipment.has(item.id)
            ) {
                return;
            }

            if (pendingEquipment.has(item.id)) {
                pendingEquipment.delete(item.id);
            } else {
                for (const other of [...pendingEquipment]) {
                    if (
                        EQUIPMENT_SLOTS[other] ===
                        EQUIPMENT_SLOTS[item.id]
                    ) {
                        pendingEquipment.delete(other);
                    }
                }

                pendingEquipment.add(item.id);
            }

            applyEquipment();
            renderEquipment();
        });

        card.append(title, button);
        container.appendChild(card);
    }
}