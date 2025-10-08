/* script.js
 - Frontend talks to server API (server/server.js) for createInvoiceLink and profile
 - Frontend polls /api/profile to update balance in real-time after bot posts update
*/

// ====== CONFIG ======
const SERVER_API = "https://YOUR_SERVER_API_URL"; // <-- заменить на публичный URL, напр. https://my-case-server.example.com
const FRONTEND_URL = window.location.origin;      // used in payload optionally
// =====================

const tg = window.Telegram?.WebApp;
try{ tg?.expand(); }catch(e){}

const user = tg?.initDataUnsafe?.user || {};
const USER_ID = user.id || `guest_${Math.random().toString(36).slice(2,8)}`;

// DOM
const byId = id => document.getElementById(id);
const balanceValueEl = byId("balanceValue");
const casesGrid = byId("casesGrid");
const caseModal = byId("caseModal");
const carousel = byId("carousel");
const dropList = byId("dropList");
const caseTitle = byId("caseTitle");
const caseCost = byId("caseCost");
const openCaseBtn = byId("openCaseBtn");
const modalStatus = byId("modalStatus");
const closeModal = byId("closeModal");
const btnMain = byId("btnMain");
const btnProfile = byId("btnProfile");
const mainPage = byId("mainPage");
const profilePage = byId("profilePage");
const avatarEl = byId("avatar");
const displayNameEl = byId("displayName");
const userIdEl = byId("userId");
const totalRechargedEl = byId("totalRecharged");
const inventoryList = byId("inventoryList");
const tpAmount = byId("tpAmount");
const tpCreateBtn = byId("tpCreateBtn");
const tpStatus = byId("tpStatus");
const balanceBtn = byId("balanceBtn");

// local state cache (persist inventory locally)
const STORAGE_KEY = "casefase_prod_state_v1";
let state = loadState();

// set lang/theme defaults from telegram
if(!state.lang) state.lang = (user.language_code && user.language_code.startsWith("ru")) ? "ru" : "en";

// Items and Cases
const ITEMS = [
  { id: "bear",  name: "Bear",  img: "https://storage.beee.pro/game_items/25887/a7gXXBIRWJS1wXk5MD6Wy2xhDec6HtJ5hWxTtnY1.webp", price: 15, weight:50 },
  { id: "heart", name: "Heart", img: "https://storage.beee.pro/game_items/25888/n4QcCspVUixkujQcC0yc9Kkke8py4l17enbIdVR0.webp", price: 15, weight:40 },
  { id: "rocket",name: "Rocket", img: "https://storage.beee.pro/game_items/25879/77szLyeo6jwTpO7DRbWaKwqTegSsz6oQ0RZa7IdU.webp", price: 50, weight:9 },
  { id: "ring",  name: "Ring",  img: "https://storage.beee.pro/game_items/25877/mv5puNENM4Uok2pTdAhgrwKUNDoQk6zp8n5vqdM4.webp", price: 100, weight:1 }
];
const CASES = [{ id:"classic", title:"Classic Case", price:25, thumb:ITEMS[0].img, items:ITEMS }];

// init UI
applyProfileInfo();
buildCases();
renderInventory();
pollProfile(); // start polling server profile for updates
setInterval(pollProfile, 3000); // poll every 3s

// NAV
btnMain.addEventListener("click", ()=> showPage("main"));
btnProfile.addEventListener("click", ()=> showPage("profile"));
balanceBtn.addEventListener("click", ()=> showPage("profile"));

// TOPUP (real): call server to create invoice link
tpCreateBtn.addEventListener("click", async ()=>{
  const amount = Math.max(1, Math.floor(Number(tpAmount.value) || 0));
  if(!amount){ tpStatus.textContent = state.lang==="ru" ? "Введите сумму" : "Enter amount"; return; }
  tpStatus.textContent = state.lang==="ru" ? "Создаю инвойс..." : "Creating invoice...";
  tpCreateBtn.disabled = true;
  try{
    const res = await apiPost("/api/create-invoice", { user_id: USER_ID, amount });
    if(res && res.ok && res.invoiceLink){
      tpStatus.textContent = state.lang==="ru" ? "Открываю оплату..." : "Opening payment...";
      try{ tg.openInvoice(res.invoiceLink); } catch(e){ console.warn("openInvoice failed", e); }
      // server + bot will update DB; pollProfile will pick up change
    } else {
      console.error("create-invoice failed", res);
      tpStatus.textContent = state.lang==="ru" ? "Ошибка создания инвойса" : "Invoice creation error";
    }
  }catch(err){
    console.error(err);
    tpStatus.textContent = state.lang==="ru" ? "Ошибка соединения" : "Server connection error";
  } finally {
    tpCreateBtn.disabled = false;
    setTimeout(()=> tpStatus.textContent = "", 2500);
  }
});

// Build cases (Main)
function buildCases(){
  casesGrid.innerHTML = "";
  for(const c of CASES){
    const card = document.createElement("div"); card.className = "case-card";
    card.innerHTML = `
      <img class="case-thumb" src="${c.thumb}" alt="${escapeHtml(c.title)}">
      <div class="case-title">${escapeHtml(c.title)}</div>
      <div class="case-price">${c.price} ⭐</div>
      <button class="btn primary open-btn">${state.lang==="ru"?"Открыть":"Open"}</button>
    `;
    card.querySelector(".open-btn").addEventListener("click", ()=> openCaseModal(c));
    casesGrid.appendChild(card);
  }
}

// Modal open
closeModal.addEventListener("click", ()=> closeCaseModal());
let currentCase = null;
function openCaseModal(c){
  currentCase = c;
  caseModal.classList.remove("hidden");
  caseTitle.textContent = c.title;
  caseCost.textContent = `${c.price} ⭐`;
  openCaseBtn.textContent = `${state.lang==="ru"?"Открыть":"Open"} (${c.price} ⭐)`;
  modalStatus.textContent = "";
  // fill carousel (long repeat)
  carousel.innerHTML = "";
  for(let r=0;r<8;r++){
    for(const it of c.items){
      const img = document.createElement("img"); img.src = it.img; img.alt = it.name;
      carousel.appendChild(img);
    }
  }
  // fill drop list separately
  dropList.innerHTML = "";
  for(const it of c.items){
    const el = document.createElement("div"); el.className = "drop-item";
    el.innerHTML = `<img src="${it.img}" alt="${escapeHtml(it.name)}"><div class="muted small name">${escapeHtml(it.name)}</div><div class="muted small">${it.price} ⭐</div>`;
    dropList.appendChild(el);
  }
  caseModal.dataset.caseId = c.id;
}

// close
function closeCaseModal(){ stopCarousel(); caseModal.classList.add("hidden"); delete caseModal.dataset.caseId; modalStatus.textContent=""; currentCase=null; }

// animation & reveal
let raf = null;
function stopCarousel(){ if(raf) cancelAnimationFrame(raf); carousel.style.transition=""; }

function animateAndReveal(caseObj){
  return new Promise(resolve=>{
    let pos = 0;
    const speed = 3 + Math.random()*4;
    let running = true;
    function frame(){
      pos -= speed;
      carousel.style.transform = `translateX(${pos}px)`;
      if(Math.abs(pos) > carousel.scrollWidth/2) pos = 0;
      if(running) raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    const delay = 1300 + Math.random()*1400;
    setTimeout(()=>{
      running = false;
      if(raf) cancelAnimationFrame(raf);
      const chosen = pickWeighted(caseObj.items);
      // find chosen element index by filename
      let idx = 0;
      const key = chosen.img.split('/').slice(-1)[0];
      for(let i=0;i<carousel.children.length;i++){
        if(carousel.children[i].src && carousel.children[i].src.includes(key)){ idx = i; break; }
      }
      const viewportWidth = carousel.parentElement.clientWidth;
      const el = carousel.children[idx];
      const elLeft = el.offsetLeft;
      const elW = el.clientWidth;
      const target = -(elLeft - (viewportWidth - elW)/2);
      carousel.style.transition = "transform 900ms cubic-bezier(.2,.8,.2,1)";
      carousel.style.transform = `translateX(${target}px)`;
      carousel.addEventListener("transitionend", function handler(){
        carousel.removeEventListener("transitionend", handler);
        resolve(chosen);
      }, { once:true });
    }, delay);
  });
}

function pickWeighted(arr){
  const total = arr.reduce((s,i)=>s+(i.weight||1),0);
  let r = Math.random()*total;
  for(const i of arr){
    r -= (i.weight||1);
    if(r <= 0) return i;
  }
  return arr[arr.length-1];
}

// Open case click -> deduct locally, animate; result will be added to local inventory
openCaseBtn.addEventListener("click", async ()=>{
  if(!currentCase) return;
  if((state.balance || 0) < currentCase.price){ modalStatus.textContent = state.lang==="ru" ? "Недостаточно звёзд" : "Not enough stars"; return; }
  // deduct immediately
  state.balance -= currentCase.price;
  saveState(); updateBalanceUI();
  modalStatus.textContent = state.lang==="ru" ? "Открывается..." : "Opening...";
  try{
    const prize = await animateAndReveal(currentCase);
    modalStatus.textContent = (state.lang==="ru" ? "Выпало: " : "Dropped: ") + prize.name + ` • ${prize.price} ⭐`;
    const actions = document.createElement("div"); actions.className="row"; actions.style.marginTop="10px";
    const keep = document.createElement("button"); keep.className="btn primary"; keep.textContent = state.lang==="ru"?"В инвентарь":"Keep";
    const sell = document.createElement("button"); sell.className="btn"; sell.textContent = state.lang==="ru"?"Продать (-5%)":"Sell (-5%)";
    actions.appendChild(keep); actions.appendChild(sell);
    modalStatus.parentElement.appendChild(actions);
    keep.addEventListener("click", ()=> { addToInventory(prize); modalStatus.textContent = state.lang==="ru" ? "Добавлено в инвентарь" : "Added to inventory"; actions.remove(); });
    sell.addEventListener("click", ()=> { const val = Math.floor(prize.price*0.95); state.balance += val; saveState(); updateBalanceUI(); modalStatus.textContent = (state.lang==="ru"?`Продано за ${val} ⭐`:`Sold for ${val} ⭐`); actions.remove(); });
  }catch(e){ console.error(e); modalStatus.textContent = state.lang==="ru" ? "Ошибка открытия" : "Open error"; }
});

// inventory
function addToInventory(item){
  const rec = { uid: genId(), id: item.id, name: item.name, img: item.img, price: item.price, created: Date.now() };
  state.inventory.push(rec);
  saveState(); renderInventory();
}
function renderInventory(){
  inventoryList.innerHTML = "";
  if(!state.inventory || state.inventory.length === 0){ inventoryList.innerHTML = `<div class="muted small">${state.lang==="ru" ? "Пусто" : "Empty"}</div>`; return; }
  const arr = state.inventory.slice().reverse();
  for(const it of arr){
    const el = document.createElement("div"); el.className="inv-item";
    el.innerHTML = `
      <img src="${it.img}" alt="${escapeHtml(it.name)}" />
      <div class="name">${escapeHtml(it.name)}</div>
      <div class="price">${it.price} ⭐</div>
      <div class="row"><button class="btn keep">${state.lang==="ru" ? "Оставить" : "Keep"}</button><button class="btn sell">${state.lang==="ru" ? "Продать" : "Sell"}</button></div>
    `;
    el.querySelector(".sell").addEventListener("click", ()=>{
      const val = Math.floor(it.price*0.95);
      state.inventory = state.inventory.filter(x=>x.uid !== it.uid);
      state.balance += val;
      saveState(); renderInventory(); updateBalanceUI();
    });
    inventoryList.appendChild(el);
  }
}

// Profile info from telegram + profile from server (for balance)
function applyProfileInfo(){
  avatarEl.src = user.photo_url || "https://via.placeholder.com/96";
  displayNameEl.textContent = (user.first_name || "User") + (user.last_name ? " " + user.last_name : "");
  userIdEl.textContent = "ID: " + (user.id || "—");
}

// POLL server profile (balance) — server must expose /api/profile
async function pollProfile(){
  if(!SERVER_API) return; // nothing to poll if no server
  try{
    const r = await fetch(`${SERVER_API}/api/profile?user_id=${encodeURIComponent(USER_ID)}`);
    const j = await r.json();
    if(j && j.ok && j.profile){
      state.balance = j.profile.balance || 0;
      state.total_recharged = j.profile.total_recharged || 0;
      saveState(); updateBalanceUI(); renderInventory();
    }
  }catch(e){ /* ignore network errors */ }
}

// Update UI balance
function updateBalanceUI(){
  balanceValueEl.textContent = state.balance || 0;
  totalRechargedEl.textContent = (state.lang==="ru" ? "Всего пополнено: " : "Total recharged: ") + (state.total_recharged || 0) + " ⭐";
}

// API helper for create-invoice
async function apiPost(path, body){
  const r = await fetch(SERVER_API + path, { method:"POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body) });
  return r.json();
}

// Top-up: handled via server createInvoiceLink -> tg.openInvoice; bot updates DB after successful_payment
// tpCreateBtn handler defined above

// util / persistence
function saveState(){ try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch(e){ console.warn(e); } }
function loadState(){ try{ const raw = localStorage.getItem(STORAGE_KEY); if(raw) return JSON.parse(raw); }catch(e){} return { balance:0, total_recharged:0, inventory:[], lang:null }; }
function genId(){ return 'it_' + Math.random().toString(36).slice(2,9); }
function escapeHtml(s){ return String(s).replace(/[&<>"]/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }

// nav
btnMain.addEventListener("click", ()=> showPage("main"));
btnProfile.addEventListener("click", ()=> showPage("profile"));
function showPage(p){
  if(p === "main"){ mainPage.classList.add("active"); profilePage.classList.remove("active"); btnMain.classList.add("active"); btnProfile.classList.remove("active"); }
  else { profilePage.classList.add("active"); mainPage.classList.remove("active"); btnProfile.classList.add("active"); btnMain.classList.remove("active"); }
}

// initial trigger to main
showPage("main");
