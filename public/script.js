// -------------- CONFIG --------------
// Адрес вашего Node.js API (сервер хранит sqlite и создаёт инвойсы).
// Пример: https://your-api.example.com  (замени на реальный публичный адрес)
const SERVER_API_URL = "https://YOUR_SERVER_URL";

// URL фронтенда (где развернён public — у тебя: case-fase.vercel.app)
const FRONTEND_URL = "https://case-fase.vercel.app/";
// -------------------------------------

const tg = window.Telegram.WebApp;
tg.expand();

const user = tg.initDataUnsafe?.user || {};
let LANG = (user.language_code && user.language_code.startsWith("ru")) ? "ru" : "en";
let THEME = localStorage.getItem("casefase_theme") || "dark";

// UI elems
const balanceEl = document.getElementById("balanceValue");
const buyBtn = document.getElementById("buyBtn");
const amountInput = document.getElementById("amount");
const buyStatus = document.getElementById("buyStatus");
const avatarEl = document.getElementById("avatar");
const displayNameEl = document.getElementById("displayName");
const userIdEl = document.getElementById("userId");
const totalRechargedEl = document.getElementById("totalRecharged");
const themeSelect = document.getElementById("themeSelect");
const langSelect = document.getElementById("langSelect");
const greetingEl = document.getElementById("greeting");
const subtitleEl = document.getElementById("subtitle");
const labelAmount = document.getElementById("labelAmount");

// nav
const btnMain = document.getElementById("btnMain");
const btnProfile = document.getElementById("btnProfile");
const mainPage = document.getElementById("mainPage");
const profilePage = document.getElementById("profilePage");

// init ui
avatarEl.src = user.photo_url || "https://via.placeholder.com/96";
displayNameEl.textContent = (user.first_name || "User") + (user.last_name ? " " + user.last_name : "");
userIdEl.textContent = user.id || "—";

langSelect.value = LANG;
themeSelect.value = THEME;
applyTheme(THEME);
applyTexts();

function applyTexts(){
  if(LANG === "ru"){
    greetingEl.textContent = `Привет, ${user.first_name || ""}!`;
    subtitleEl.textContent = "Добро пожаловать в casefase";
    labelAmount.textContent = "Количество звёзд";
    buyBtn.textContent = "Пополнить";
  } else {
    greetingEl.textContent = `Hi, ${user.first_name || ""}!`;
    subtitleEl.textContent = "Welcome to casefase";
    labelAmount.textContent = "Amount of stars";
    buyBtn.textContent = "Top up";
  }
}

function applyTheme(t){
  document.getElementById("app").classList.toggle("light", t === "light");
  THEME = t;
}

// nav handlers
btnMain.addEventListener("click", ()=> showPage("main"));
btnProfile.addEventListener("click", ()=> showPage("profile"));
function showPage(p){
  if(p==="main"){
    mainPage.classList.add("active");
    profilePage.classList.remove("active");
    btnMain.classList.add("active");
    btnProfile.classList.remove("active");
  } else {
    profilePage.classList.add("active");
    mainPage.classList.remove("active");
    btnProfile.classList.add("active");
    btnMain.classList.remove("active");
  }
}

// theme/lang change (user-controlled)
themeSelect.addEventListener("change", e=>{
  applyTheme(e.target.value);
  localStorage.setItem("casefase_theme", e.target.value);
});
langSelect.addEventListener("change", e=>{
  LANG = e.target.value;
  applyTexts();
});

// API helpers
async function apiGet(path){
  const r = await fetch(`${SERVER_API_URL}${path}`);
  return r.json();
}
async function apiPost(path, body){
  const r = await fetch(`${SERVER_API_URL}${path}`, {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify(body)
  });
  return r.json();
}

// register user at server (on first open)
async function registerUser(){
  if(!user || !user.id) return;
  try{
    await apiPost("/api/register-user", { user });
  }catch(e){
    console.warn("registerUser error", e);
  }
}

// create invoice and open it
buyBtn.addEventListener("click", async ()=>{
  const amount = parseInt(amountInput.value);
  if(!amount || amount <= 0){ buyStatus.textContent = LANG==="ru" ? "Введите корректное число" : "Enter a valid number"; return; }
  buyStatus.textContent = LANG==="ru" ? "Создаю инвойс..." : "Creating invoice...";
  buyBtn.disabled = true;

  try{
    const res = await apiPost("/api/create-invoice", { user_id: user.id, amount });
    if(res && res.ok && res.invoiceLink){
      buyStatus.textContent = LANG==="ru" ? "Открываю оплату..." : "Opening payment...";
      // open invoice using Telegram WebApp
      tg.openInvoice(res.invoiceLink);
      // бот (polling) обновит баланс на сервере; фронтенд поллит профиль
    } else {
      console.error("create-invoice error", res);
      buyStatus.textContent = LANG==="ru" ? "Ошибка создания инвойса" : "Invoice creation error";
    }
  }catch(err){
    console.error(err);
    buyStatus.textContent = LANG==="ru" ? "Ошибка соединения с сервером" : "Server connection error";
  } finally {
    setTimeout(()=> { buyStatus.textContent = ""; buyBtn.disabled = false; }, 2000);
  }
});

// polling profile for live updates (no reload)
async function refreshProfile(){
  if(!user || !user.id) return;
  try{
    const res = await apiGet(`/api/profile?user_id=${encodeURIComponent(user.id)}`);
    if(res && res.ok && res.profile){
      balanceEl.textContent = res.profile.balance;
      totalRechargedEl.textContent = res.profile.total_recharged;
      document.getElementById("metaTotal").textContent = (LANG==="ru" ? "Всего пополнено: " : "Total recharged: ") + res.profile.total_recharged + " ⭐";
      if(res.profile.first_name) displayNameEl.textContent = (res.profile.first_name + (res.profile.last_name ? " " + res.profile.last_name : ""));
    }
  }catch(e){ /* silent */ }
}

// initial actions
registerUser();
refreshProfile();
setInterval(refreshProfile, 3000);
