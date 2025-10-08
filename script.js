/* Полный исправленный frontend.
   ВАЖНО: client-side createInvoiceLink и getUpdates требует BOT_TOKEN в браузере — это небезопасно.
   Замените переменные ниже на реальные только в локальном тесте или реализуйте серверный API.
*/

//// CONFIG - замените заглушки на свои значения при необходимости ////
const BOT_TOKEN = "8001095635:AAF8QL-2D6icOhTFLNTk6MQZkBw5oXMoqkw";
const PROVIDER_TOKEN = "PASTE_YOUR_PROVIDER_TOKEN_HERE";
const CURRENCY = "XTR"; // или "USD" для тестирования
const INVOICE_TIMEOUT_SECONDS = 60; // время ожидания оплаты
//////////////////////////////////////////////////////////////////////

// Telegram WebApp
const tg = window.Telegram.WebApp;
try { tg.expand(); } catch(e){ /* ignore */ }
const user = tg.initDataUnsafe?.user || {};
const USER_ID = user.id || `guest_${Math.random().toString(36).slice(2,8)}`;

// DOM refs
const balanceValueEl = document.getElementById("balanceValue");
const balanceBox = document.getElementById("balanceBox");
const casesGrid = document.getElementById("casesGrid");
const caseModal = document.getElementById("caseModal");
const carousel = document.getElementById("carousel");
const caseTitle = document.getElementById("caseTitle");
const casePriceEl = document.getElementById("casePrice");
const openCaseBtn = document.getElementById("openCaseBtn");
const modalStatus = document.getElementById("modalStatus");
const closeModalBtn = document.getElementById("closeModal");
const btnMain = document.getElementById("btnMain");
const btnProfile = document.getElementById("btnProfile");
const mainPage = document.getElementById("mainPage");
const profilePage = document.getElementById("profilePage");
const avatarEl = document.getElementById("avatar");
const displayNameEl = document.getElementById("displayName");
const metaIdEl = document.getElementById("metaId");
const metaTotalEl = document.getElementById("metaTotal");
const inventoryList = document.getElementById("inventoryList");
const themeSelect = document.getElementById("themeSelect");
const langSelect = document.getElementById("langSelect");
const tpPopup = document.getElementById("topupPopup");
const tpCreateBtn = document.getElementById("tpCreateBtn");
const tpCancelBtn = document.getElementById("tpCancelBtn");
const tpAmountInput = document.getElementById("tpAmount");
const tpStatus = document.getElementById("tpStatus");

// local storage state
const STORAGE_KEY = "casefase_state_v2";
let state = loadState();

// set defaults from Telegram user
if(!state.lang) state.lang = (user.language_code && user.language_code.startsWith("ru")) ? "ru" : "en";
if(!state.theme) state.theme = localStorage.getItem("casefase_theme") || "dark";

// apply UI initial
applyTheme(state.theme);
themeSelect.value = state.theme;
langSelect.value = state.lang;
initProfileUI();
renderInventory();
updateUIBalance();
showPage("main");
localizeAll();

// cases (items provided by you)
const CASES = [
  {
    id: "classic",
    title: "Classic Case",
    price: 25,
    items: [
      { id: "bear",  name: "Bear",   img: "https://storage.beee.pro/game_items/25887/a7gXXBIRWJS1wXk5MD6Wy2xhDec6HtJ5hWxTtnY1.webp", price: 15 },
      { id: "hearth",name: "Hearth", img: "https://storage.beee.pro/game_items/25888/n4QcCspVUixkujQcC0yc9Kkke8py4l17enbIdVR0.webp", price: 15 },
      { id: "rocket",name: "Rocket", img: "https://storage.beee.pro/game_items/25879/77szLyeo6jwTpO7DRbWaKwqTegSsz6oQ0RZa7IdU.webp", price: 50 },
      { id: "ring",  name: "Ring",   img: "https://storage.beee.pro/game_items/25877/mv5puNENM4Uok2pTdAhgrwKUNDoQk6zp8n5vqdM4.webp", price: 100 }
    ]
  }
];

// build cases UI
function buildCases(){
  casesGrid.innerHTML = "";
  CASES.forEach(c=>{
    const card = document.createElement("div"); card.className = "case-card";
    const img = document.createElement("img"); img.src = c.items[0].img; img.alt = c.title;
    const name = document.createElement("div"); name.className = "name"; name.textContent = c.title;
    const info = document.createElement("div"); info.className = "info"; info.textContent = `${c.price} ⭐ • Open`;
    const btn = document.createElement("button"); btn.className = "btn primary"; btn.textContent = state.lang === "ru" ? "Открыть" : "Open";
    btn.addEventListener("click", ()=> openCaseModal(c));
    card.append(img, name, info, btn);
    casesGrid.appendChild(card);
  });
}
buildCases();

// modal open/close
let currentCase = null;
closeModalBtn.addEventListener("click", ()=> closeCaseModal());
function openCaseModal(caseObj){
  currentCase = caseObj;
  caseModal.classList.remove("hidden");
  carousel.innerHTML = "";
  // repeat items to create long row
  const repeats = 10;
  for(let r=0;r<repeats;r++){
    caseObj.items.forEach(it=>{
      const el = document.createElement("img"); el.src = it.img; el.alt = it.name;
      carousel.appendChild(el);
    });
  }
  caseTitle.textContent = caseObj.title;
  casePriceEl.textContent = `${caseObj.price} ⭐`;
  openCaseBtn.textContent = (state.lang==="ru" ? "Открыть" : "Open") + ` (${caseObj.price} ⭐)`;
  modalStatus.textContent = "";
  // reset carousel transform
  carousel.style.transition = "";
  carousel.style.transform = "translateX(0px)";
}

function closeCaseModal(){
  stopCarousel();
  caseModal.classList.add("hidden");
  currentCase = null;
}

// open case action
openCaseBtn.addEventListener("click", async ()=>{
  if(!currentCase) return;
  if(state.balance < currentCase.price){ modalStatus.textContent = state.lang==="ru" ? "Недостаточно звёзд" : "Not enough stars"; return; }
  // reserve cost
  state.balance -= currentCase.price;
  saveState(); updateUIBalance();
  modalStatus.textContent = state.lang==="ru" ? "Открывается..." : "Opening...";
  await animateCarouselAndReveal(currentCase);
});

// carousel animation and reveal
let animFrame = null;
function stopCarousel(){ if(animFrame) { cancelAnimationFrame(animFrame); animFrame = null; } carousel.style.transition = ""; }

function animateCarouselAndReveal(caseObj){
  return new Promise(resolve=>{
    // continuous scroll
    let pos = 0;
    const speed = 3 + Math.random()*4; // px per frame
    let running = true;
    function frame(){
      pos -= speed;
      carousel.style.transform = `translateX(${pos}px)`;
      if(Math.abs(pos) > carousel.scrollWidth/2) pos = 0;
      if(running) animFrame = requestAnimationFrame(frame);
    }
    animFrame = requestAnimationFrame(frame);

    // after delay slow and stop on random element
    const rnd = 1200 + Math.random()*1600;
    setTimeout(()=>{
      running = false;
      if(animFrame) cancelAnimationFrame(animFrame);
      // pick random index
      const total = carousel.children.length;
      const chosenIndex = Math.floor(Math.random()*total);
      const chosenEl = carousel.children[chosenIndex];
      const viewportWidth = carousel.parentElement.clientWidth;
      const elLeft = chosenEl.offsetLeft;
      const elWidth = chosenEl.clientWidth;
      const target = -(elLeft - (viewportWidth - elWidth)/2);
      // apply smooth transition to target
      carousel.style.transition = "transform 900ms cubic-bezier(.2,.8,.2,1)";
      carousel.style.transform = `translateX(${target}px)`;

      // on end -> award item
      const onEnd = () => {
        carousel.removeEventListener("transitionend", onEnd);
        const chosenSrc = chosenEl.src;
        const chosenItem = caseObj.items.find(i=>i.img === chosenSrc) || caseObj.items[Math.floor(Math.random()*caseObj.items.length)];
        // show drop dialog (choose keep or sell)
        showDropResult(chosenItem);
        resolve();
      };
      carousel.addEventListener("transitionend", onEnd, { once:true });
    }, rnd);
  });
}

// show drop result (in modal) with options
function showDropResult(item){
  modalStatus.textContent = (state.lang==="ru" ? "Выпало: " : "Dropped: ") + item.name + ` • ${item.price} ⭐`;
  // small action overlay appended to modal
  const actions = document.createElement("div"); actions.className = "row"; actions.style.marginTop="12px";
  const keepBtn = document.createElement("button"); keepBtn.className="btn primary"; keepBtn.textContent = state.lang==="ru"?"В инвентарь":"Keep";
  const sellBtn = document.createElement("button"); sellBtn.className="btn"; sellBtn.textContent = state.lang==="ru"?"Продать (-5%)":"Sell (-5%)";
  actions.appendChild(keepBtn); actions.appendChild(sellBtn);
  // place actions under modalStatus
  const container = modalStatus.parentElement;
  if(container) container.appendChild(actions);

  keepBtn.addEventListener("click", ()=>{
    addItemToInventory(item);
    modalStatus.textContent = (state.lang==="ru" ? "Добавлено в инвентарь" : "Added to inventory");
    actions.remove();
  });
  sellBtn.addEventListener("click", ()=>{
    const sellPrice = Math.floor(item.price * 0.95);
    state.balance += sellPrice;
    saveState(); updateUIBalance();
    modalStatus.textContent = (state.lang==="ru" ? `Продано за ${sellPrice} ⭐` : `Sold for ${sellPrice} ⭐`);
    actions.remove();
  });
}

// inventory
function addItemToInventory(item){
  const record = { uid: genId(), id: item.id, name: item.name, img: item.img, price: item.price, created: Date.now() };
  state.inventory.push(record);
  saveState(); renderInventory();
}

function renderInventory(){
  inventoryList.innerHTML = "";
  if(state.inventory.length === 0){
    inventoryList.innerHTML = `<div class="status">${state.lang==="ru" ? "Пусто" : "Empty"}</div>`;
    return;
  }
  // newest first
  const arr = state.inventory.slice().reverse();
  for(const it of arr){
    const box = document.createElement("div"); box.className="inv-item";
    const img = document.createElement("img"); img.src = it.img;
    const nm = document.createElement("div"); nm.textContent = it.name;
    const price = document.createElement("div"); price.textContent = `${it.price} ⭐`;
    const row = document.createElement("div"); row.className="row";
    const sellBtn = document.createElement("button"); sellBtn.className="btn"; sellBtn.textContent = state.lang==="ru"?"Продать":"Sell";
    const keepBtn = document.createElement("button"); keepBtn.className="btn"; keepBtn.textContent = state.lang==="ru"?"Оставить":"Keep";
    sellBtn.addEventListener("click", ()=>{ sellInventoryItem(it.uid); });
    keepBtn.addEventListener("click", ()=>{ showStatus(state.lang==="ru"?"Оставлено в инвентаре":"Kept in inventory"); });
    row.appendChild(keepBtn); row.appendChild(sellBtn);
    box.append(img, nm, price, row);
    inventoryList.appendChild(box);
  }
}

function sellInventoryItem(uid){
  const idx = state.inventory.findIndex(x=>x.uid===uid);
  if(idx === -1) return;
  const item = state.inventory[idx];
  const sellPrice = Math.floor(item.price * 0.95);
  state.inventory.splice(idx,1);
  state.balance += sellPrice;
  saveState(); renderInventory(); updateUIBalance();
  showStatus((state.lang==="ru" ? "Продано за " : "Sold for ") + sellPrice + " ⭐");
}

// TOP-UP popup logic
balanceBox.addEventListener("click", ()=> openTopup());
tpCancelBtn.addEventListener("click", ()=> closeTopup());
tpCreateBtn.addEventListener("click", async ()=>{
  const amount = Math.max(1, Math.floor(Number(tpAmountInput.value) || 0));
  if(!amount){ tpStatus.textContent = state.lang==="ru" ? "Введите сумму" : "Enter amount"; return; }
  tpStatus.textContent = state.lang==="ru" ? "Создаю инвойс..." : "Creating invoice...";
  tpCreateBtn.disabled = true;
  try{
    const invoiceLink = await createInvoiceLink(USER_ID, amount);
    if(invoiceLink){
      tpStatus.textContent = state.lang==="ru" ? "Открываю оплату..." : "Opening payment...";
      // open Telegram invoice via WebApp
      try { tg.openInvoice(invoiceLink); } catch(e){ console.warn("openInvoice failed", e); }
      // start polling getUpdates for 60s to detect successful_payment matching payload
      startInvoiceWatcher(INVOICE_TIMEOUT_SECONDS);
    } else {
      tpStatus.textContent = state.lang==="ru" ? "Ошибка создания" : "Creation error";
    }
  }catch(e){
    console.error(e); tpStatus.textContent = state.lang==="ru" ? "Ошибка" : "Error";
  } finally {
    tpCreateBtn.disabled = false;
    setTimeout(()=> tpStatus.textContent = "", 3000);
  }
});

function openTopup(){ tpPopup.classList.remove("hidden"); tpPopup.setAttribute("aria-hidden","false"); tpAmountInput.value = 50; tpStatus.textContent = ""; }
function closeTopup(){ tpPopup.classList.add("hidden"); tpPopup.setAttribute("aria-hidden","true"); tpStatus.textContent = ""; }

// createInvoiceLink via Telegram Bot API (client-side)
async function createInvoiceLink(user_id, amount){
  if(!BOT_TOKEN || !PROVIDER_TOKEN){ console.warn("BOT_TOKEN/PROVIDER_TOKEN not set"); return null; }
  const payload = { uid: user_id, ts: Date.now() };
  const body = {
    title: "Пополнение звёзд ⭐",
    description: `${amount} stars for casefase`,
    payload: JSON.stringify(payload),
    provider_token: PROVIDER_TOKEN,
    currency: CURRENCY,
    prices: [{ label: "Stars", amount: amount * 1 }]
  };
  try{
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
      method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body)
    });
    const data = await r.json();
    if(data && data.ok) return data.result;
    console.error("createInvoiceLink failed", data);
    return null;
  }catch(e){
    console.error("createInvoiceLink error", e);
    return null;
  }
}

// INVOICE WATCHER: polls getUpdates and credits when successful_payment with matching payload found
let updatesOffset = parseInt(localStorage.getItem("casefase_updates_offset")||"0",10) || 0;
let invoiceWatcherTimer = null;
function startInvoiceWatcher(timeoutSec){
  const until = Date.now() + timeoutSec*1000;
  if(invoiceWatcherTimer) clearInterval(invoiceWatcherTimer);
  invoiceWatcherTimer = setInterval(async ()=>{
    if(Date.now() > until){ clearInterval(invoiceWatcherTimer); invoiceWatcherTimer = null; return; }
    try{
      const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${updatesOffset}&timeout=1`);
      const data = await res.json();
      if(!data.ok) return;
      for(const upd of data.result || []){
        updatesOffset = Math.max(updatesOffset, upd.update_id + 1);
        localStorage.setItem("casefase_updates_offset", updatesOffset);
        // check successful_payment in message
        if(upd.message && upd.message.successful_payment){
          const sp = upd.message.successful_payment;
          // invoice payload might be in successful_payment.invoice_payload or message.invoice_payload
          const raw = sp.invoice_payload || upd.message.invoice_payload || null;
          if(raw){
            let obj = null;
            try{ obj = typeof raw === "string" ? JSON.parse(raw) : raw; }catch(e){}
            if(obj && String(obj.uid) === String(USER_ID)){
              const total = sp.total_amount || 0; // smallest units
              const stars = Math.floor(total/100);
              state.balance += stars;
              state.total_recharged += stars;
              saveState(); updateUIBalance(); renderInventory();
              showStatus((state.lang==="ru" ? "Оплата подтверждена: " : "Payment confirmed: ") + stars + " ⭐");
              // stop watcher
              clearInterval(invoiceWatcherTimer); invoiceWatcherTimer = null;
              closeTopup();
              return;
            }
          }
        }
      }
    }catch(e){
      console.warn("invoice watcher error", e);
    }
  }, 1500);
}

// UI helpers
function updateUIBalance(){
  balanceValueEl.textContent = state.balance;
  metaTotalEl.textContent = (state.lang==="ru" ? "Всего пополнено: " : "Total recharged: ") + state.total_recharged + " ⭐";
}

function showPage(page){
  if(page === "main"){
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

// nav handlers
btnMain.addEventListener("click", ()=> showPage("main"));
btnProfile.addEventListener("click", ()=> showPage("profile"));

// profile init
function initProfileUI(){
  avatarEl.src = user.photo_url || "https://via.placeholder.com/96";
  displayNameEl.textContent = ((user.first_name || "User") + (user.last_name ? " " + user.last_name : ""));
  metaIdEl.textContent = "ID: " + (user.id || "—");
  metaTotalEl.textContent = (state.lang==="ru" ? "Всего пополнено: " : "Total recharged: ") + state.total_recharged + " ⭐";
}

// theme & lang
themeSelect.addEventListener("change", (e)=>{ state.theme = e.target.value; localStorage.setItem("casefase_theme", state.theme); applyTheme(state.theme); saveState(); });
langSelect.addEventListener("change", (e)=>{ state.lang = e.target.value; localizeAll(); saveState(); });

function applyTheme(t){ document.getElementById("app").classList.toggle("light", t === "light"); }
function localizeAll(){
  // small text updates
  if(state.lang === "ru"){
    document.getElementById("greeting").textContent = `Привет, ${user.first_name || ""}!`;
    document.getElementById("subtitle").textContent = "Открывайте кейсы и собирайте предметы";
    document.querySelectorAll(".btn.primary").forEach(b=> b.textContent = "Открыть");
  } else {
    document.getElementById("greeting").textContent = `Hi, ${user.first_name || ""}!`;
    document.getElementById("subtitle").textContent = "Open cases and collect items";
    document.querySelectorAll(".btn.primary").forEach(b=> b.textContent = "Open");
  }
  // update inventory text etc.
  renderInventory();
  updateUIBalance();
}

// state persistence
function loadState(){
  try{ const raw = localStorage.getItem(STORAGE_KEY); if(raw) return JSON.parse(raw); }catch(e){ /* ignored */ }
  return { balance: 0, total_recharged: 0, inventory: [], theme: "dark", lang: null };
}
function saveState(){ try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch(e){ console.warn("save state failed", e); } }

// small utilities
function genId(){ return 'id_' + Math.random().toString(36).slice(2,9); }
function showStatus(msg){ const el = document.getElementById("modalStatus") || document.querySelector(".status"); if(!el) return; el.textContent = msg; setTimeout(()=>{ if(el.textContent === msg) el.textContent = ""; }, 3500); }

// expose for debugging
window.__casefase_state = state;
