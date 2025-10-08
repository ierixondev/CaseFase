const tg = window.Telegram.WebApp;
tg.expand();

const user = tg.initDataUnsafe?.user || {};
const balanceEl = document.getElementById("balance");
let balance = 0;
let totalTopUp = 0;

// === USER INFO ===
function loadProfile() {
  document.getElementById("username").textContent = `Имя: ${user.first_name || "Неизвестно"}`;
  document.getElementById("userid").textContent = `ID: ${user.id || "—"}`;
  const avatar = document.getElementById("avatar");
  if (user.photo_url) avatar.src = user.photo_url;
  else avatar.src = "https://cdn-icons-png.flaticon.com/512/1077/1077012.png";
  document.getElementById("totalStars").textContent = `Всего пополнено: ${totalTopUp} ⭐`;
}
loadProfile();

// === NAVIGATION ===
const pageMain = document.getElementById("page-main");
const pageProfile = document.getElementById("page-profile");
const tabMain = document.getElementById("tabMain");
const tabProfile = document.getElementById("tabProfile");

tabMain.onclick = () => switchTab("main");
tabProfile.onclick = () => switchTab("profile");

function switchTab(tab) {
  tabMain.classList.toggle("active", tab === "main");
  tabProfile.classList.toggle("active", tab === "profile");
  pageMain.classList.toggle("active", tab === "main");
  pageProfile.classList.toggle("active", tab === "profile");
}

// === BALANCE TOP UP ===
document.getElementById("balanceBtn").onclick = () => {
  addStars(50); // пополнить на 50 звёзд по клику на баланс
};

function addStars(count) {
  balance += count;
  totalTopUp += count;
  balanceEl.textContent = balance;
  showStatus(`+${count} ⭐`);
  loadProfile();
}

// === CASE LOGIC ===
const items = [
  { name: "Bear", img: "https://storage.beee.pro/game_items/25887/a7gXXBIRWJS1wXk5MD6Wy2xhDec6HtJ5hWxTtnY1.webp", price: 15 },
  { name: "Heart", img: "https://storage.beee.pro/game_items/25888/n4QcCspVUixkujQcC0yc9Kkke8py4l17enbIdVR0.webp", price: 15 },
  { name: "Rocket", img: "https://storage.beee.pro/game_items/25879/77szLyeo6jwTpO7DRbWaKwqTegSsz6oQ0RZa7IdU.webp", price: 50 },
  { name: "Ring", img: "https://storage.beee.pro/game_items/25877/mv5puNENM4Uok2pTdAhgrwKUNDoQk6zp8n5vqdM4.webp", price: 100 }
];

function openCase() {
  if (balance < 25) {
    showStatus("Недостаточно ⭐");
    return;
  }
  balance -= 25;
  balanceEl.textContent = balance;

  const prize = items[Math.floor(Math.random() * items.length)];
  showStatus(`Выпал: ${prize.name} (${prize.price} ⭐)`);

  setTimeout(() => {
    const choice = confirm(`${prize.name} (${prize.price} ⭐)\nДобавить в инвентарь? (Отмена — продать с -5%)`);
    if (choice) {
      addStars(0); // ничего не меняем
    } else {
      const sellValue = Math.floor(prize.price * 0.95);
      balance += sellValue;
      balanceEl.textContent = balance;
      showStatus(`Продано за ${sellValue} ⭐`);
    }
  }, 500);
}

// === STATUS ===
function showStatus(msg) {
  const s = document.getElementById("status");
  s.textContent = msg;
  s.style.opacity = "1";
  setTimeout(() => { s.style.opacity = "0"; }, 3000);
}
