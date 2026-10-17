const shopButton= document.getElementById("shop-button")
const shopModal= document.getElementById("shop-modal")
const closeButton= document.getElementById("close-shop")

shopButton.addEventListener("click", () =>{
    shopModal.removeAttribute("hidden")
});

closeButton.addEventListener("click", () =>{
    shopModal.setAttribute("hidden", "")
});

const shopItems = [
    {
        id: 1,
        name: "Wizard Hat",
        price: 50,
        category: "accessories",
        image: "/static/images/shop/wizard-hat.png"
    },
    {
        id: 2,
        name: "Knight Armor",
        price: 100,
        category: "clothes",
        image: "/static/images/shop/knight-armor.png"
    },
    {
        id: 3,
        name: "Forest Background",
        price: 150,
        category: "backgrounds",
        image: "/static/images/shop/forest.png"
    }
];

const shopContainer= document.getElementById("shop-items")

shopContainer.innerHTML = "";
function displayShopItems (){
    shopItems.forEach((item) =>{
        console.log(item.name)
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

displayShopItems();