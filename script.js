/* casefase frontend (pure client). 
   - Local state stored in localStorage.
   - Weighted random: Bear 50, Heart 40, Rocket 9, Ring 1.
   - Topup: local by default; optional createInvoiceLink if you set BOT_TOKEN/PROVIDER_TOKEN (unsafe).
   IMPORTANT: Putting BOT_TOKEN in client is insecure. Use server in production.
*/

///// CONFIG (leave tokens empty for safe local top-up) /////
const BOT_TOKEN = ""; // "8001095635:AAF8QL-2D6icOhTFLNTk6MQZkBw5oXMoqkw"  (DANGEROUS in client)
const PROVIDER_TOKEN = ""; // payment provider token from BotFather (if any)
const CURRENCY = "XTR"; // or "USD" for testing
const INVOICE_TTL_SEC = 60; // invoice wait window if you enable invoice flow
/////////////////////////////////////////////////////////////

// Utils
const byId = id => document.getElementById(id);
const tg = window.Telegram?.WebApp;
try{ tg?.expand(); }catch(e){/*ignore*/}

const user = tg?.initDataUnsafe?.user || {};
const USER_ID = user.id || `guest_${Math.random().toString(36).slice(2,8)}`;
const STORAGE_KEY = "casefase_v3_state";

// DOM refs
const balanceBtn = byId("balanceBtn");
const balanceValueEl = byId("balanceValue");
const casesGrid = byId("casesGrid");
const caseModal = byId("caseModal");
const carousel = byId("carousel");
const caseTitle = byId("caseTitle");
const caseCost = byId("caseCost");
const openCaseBtn = byId("openCaseBtn");
const modalStatus = byId("modalStatus");
const closeModal = byId("closeModal");
const dropList = byId("dropList");
const btnMain = byId("btnMain");
const btnProfile = byId("btnProfile");
const mainPage = byId("mainPage");
const profilePage = byId("profilePage");
const avatarEl = byId("avatar");
const displayNameEl = byId("displayName");
const userIdEl = byId("userId");
const totalRechargedEl = byId("totalRecharged");
const inventoryList = byId("inventoryList");
const tpPopup = byId("topupPopup");
const tpAmount = byId("tpAmount");
const tpCreateBtn = byId("tpCreateBtn");
const tpClose = byId("tpClose");
const tpStatus = byId("tpStatus");

// Setup state
let state = loadState();

// ensure defaults
if(!state.theme) state.theme = localStorage.getItem("casefase_theme") || "dark";
if(!state.lang) state.lang = (user.language_code && user.language_code.startsWith("ru")) ? "ru" : "en";

// Items and case definition (weighted probs later)
const ITEMS = [
  { id: "bear",  name: "Bear",   img: "https://storage.beee.pro/game_items/25887/a7gXXBIRWJS1wXk5MD6Wy2xhDec6HtJ5hWxTtnY1.webp", price: 15, weight: 50 },
  { id: "heart", name: "Hearth", img: "https://storage.beee.pro/game_items/25888/n4QcCspVUixkujQcC0yc9Kkke8py4l17enbIdVR0.webp", price: 15, weight: 40 },
  { id: "rocket",name: "Rocket", img: "https://storage.beee.pro/game_items/25879/77szLyeo6jwTpO7DRbWaKwqTegSsz6oQ0RZa7IdU.webp", price: 50, weight: 9 },
  { id: "ring",  name: "Ring",   img: "https://storage.beee.pro/game_items/25877/mv5puNENM4Uok2pTdAhgrwKUNDoQk6zp8n5vqdM4.webp", price: 100, weight: 1 }
];

const CASES = [
  { id: "classic", title: "Classic Case", price: 25, thumb: ITEMS[0].img, items: ITEMS }
];

// INIT UI
applyTheme(state.theme);
buildCases();
initProfile();
renderInventory();
updateBalanceUI();
attachHandlers();
localize();

// ---------- FUNCTIONS ----------

function buildCases(){
  casesGrid.innerHTML = "";
  for(const c of CASES){
    const card = document.createElement("div");
    card.className = "case-card";
    card.innerHTML = `
      <img class="case-thumb" src="${c.thumb}" alt="${escapeHtml(c.title)}" />
      <div class="case-title">${escapeHtml(c.title)}</div>
      <div class="case-price">${c.price} ⭐</div>
      <button class="btn primary open-btn">${state.lang==="ru"?"Открыть":"Open"}</button>
    `;
    const btn = card.querySelector(".open-btn");
    btn.addEventListener("click", ()=> openCaseModal(c));
    casesGrid.appendChild(card);
  }
}

function openCaseModal(caseObj){
  // populate modal
  caseModal.classList.remove("hidden");
  caseTitle.textContent = caseObj.title;
  caseCost.textContent = `${caseObj.price} ⭐`;
  openCaseBtn.textContent = `${state.lang==="ru"?"Открыть":"Open"} (${caseObj.price} ⭐)`;
  modalStatus.textContent = "";
  // prepare carousel: repeat items many times so scroll looks smooth
  carousel.innerHTML = "";
  for(let r=0;r<8;r++){
    for(const it of caseObj.items){
      const img = document.createElement("img"); img.src = it.img; img.alt = it.name;
      carousel.appendChild(img);
    }
  }
  // show drop list below
  fillDropList(caseObj.items);
  // store current
  caseModal.dataset.caseId = caseObj.id;
}

function closeCaseModal(){
  stopAnimation();
  caseModal.classList.add("hidden");
  delete caseModal.dataset.caseId;
  modalStatus.textContent = "";
}

function fillDropList(items){
  dropList.innerHTML = "";
  for(const it of items){
    const el = document.createElement("div"); el.className = "drop-item";
    el.innerHTML = `<img src="${it.img}" alt="${escapeHtml(it.name)}" /><div class="muted small">${escapeHtml(it.name)}</div><div class="muted small">${it.price} ⭐</div>`;
    dropList.appendChild(el);
  }
}

// ANIMATION + reveal (weighted)
let animRAF = null;
function stopAnimation(){ if(animRAF) { cancelAnimationFrame(animRAF); animRAF = null; } carousel.style.transition = ""; }

function animateAndReveal(caseObj){
  return new Promise(resolve=>{
    // continuous scroll
    let pos = 0;
    const speed = 3 + Math.random()*4;
    let running = true;
    function frame(){
      pos -= speed;
      carousel.style.transform = `translateX(${pos}px)`;
      if(Math.abs(pos) > carousel.scrollWidth/2) pos = 0;
      if(running) animRAF = requestAnimationFrame(frame);
    }
    animRAF = requestAnimationFrame(frame);

    // after random delay slow down and stop on weighted random
    const delay = 1400 + Math.random()*1200;
    setTimeout(()=>{
      running = false;
      if(animRAF) cancelAnimationFrame(animRAF);

      // choose item by weight
      const chosen = pickWeighted(caseObj.items);
      // find an element with that src in carousel children
      let chosenIndex = 0;
      for(let i=0;i<carousel.children.length;i++){
        if(carousel.children[i].src && carousel.children[i].src.includes(chosen.img.split('/').slice(-1)[0])){
          chosenIndex = i;
          // small random offset within same item group
          break;
        }
      }
      // center chosen element
      const viewportWidth = carousel.parentElement.clientWidth;
      const el = carousel.children[chosenIndex];
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

// On open case click
openCaseBtn.addEventListener("click", async ()=>{
  const caseId = caseModal.dataset.caseId;
  const caseObj = CASES.find(c=>c.id === caseId);
  if(!caseObj) return;
  if(state.balance < caseObj.price){
    modalStatus.textContent = state.lang==="ru" ? "Недостаточно звёзд" : "Not enough stars";
    return;
  }
  // deduct cost immediately
  state.balance -= caseObj.price;
  saveState(); updateBalanceUI();
  modalStatus.textContent = state.lang==="ru" ? "Открывается..." : "Opening...";
  try{
    const prize = await animateAndReveal(caseObj);
    // after prize determined, show options
    modalStatus.textContent = `${state.lang==="ru" ? "Выпало" : "Dropped"}: ${prize.name} • ${prize.price} ⭐`;
    const actions = document.createElement("div"); actions.className = "row"; actions.style.marginTop = "10px";
    const keep = document.createElement("button"); keep.className="btn primary"; keep.textContent = state.lang==="ru"?"В инвентарь":"Keep";
    const sell = document.createElement("button"); sell.className="btn"; sell.textContent = state.lang==="ru"?"Продать (-5%)":"Sell (-5%)";
    actions.appendChild(keep); actions.appendChild(sell);
    modalStatus.parentElement.appendChild(actions);
    keep.addEventListener("click", ()=>{
      addToInventory(prize);
      modalStatus.textContent = state.lang==="ru" ? "Добавлено в инвентарь" : "Added to inventory";
      actions.remove();
    });
    sell.addEventListener("click", ()=>{
      const sellVal = Math.floor(prize.price * 0.95);
      state.balance += sellVal;
      saveState(); updateBalanceUI();
      modalStatus.textContent = `${state.lang==="ru" ? "Продано за " : "Sold for "}${sellVal} ⭐`;
      actions.remove();
    });
  }catch(e){
    console.error(e);
    modalStatus.textContent = state.lang==="ru" ? "Ошибка открытия" : "Open error";
  }
});

// inventory
function addToInventory(item){
  const rec = { uid: genId(), id: item.id, name: item.name, img: item.img, price: item.price, ts: Date.now() };
  state.inventory.push(rec);
  saveState(); renderInventory();
}
function renderInventory(){
  inventoryList.innerHTML = "";
  if(state.inventory.length === 0){
    inventoryList.innerHTML = `<div class="muted small">${state.lang==="ru" ? "Пусто" : "Empty"}</div>`;
    return;
  }
  const arr = state.inventory.slice().reverse();
  for(const it of arr){
    const el = document.createElement("div"); el.className = "inv-item";
    const img = document.createElement("img"); img.src = it.img;
    const nm = document.createElement("div"); nm.textContent = it.name;
    const pr = document.createElement("div"); pr.className = "muted small"; pr.textContent = `${it.price} ⭐`;
    const row = document.createElement("div"); row.className = "row";
    const keepBtn = document.createElement("button"); keepBtn.className = "btn"; keepBtn.textContent = state.lang==="ru"?"Оставить":"Keep";
    const sellBtn = document.createElement("button"); sellBtn.className = "btn"; sellBtn.textContent = state.lang==="ru"?"Продать":"Sell";
    sellBtn.addEventListener("click", ()=> {
      const sellVal = Math.floor(it.price * 0.95);
      state.balance += sellVal;
      state.inventory = state.inventory.filter(x=>x.uid !== it.uid);
      saveState(); renderInventory(); updateBalanceUI();
      showTmp(state.lang==="ru"?`Продано за ${sellVal} ⭐`:`Sold for ${sellVal} ⭐`);
    });
    row.appendChild(keepBtn); row.appendChild(sellBtn);
    el.appendChild(img); el.appendChild(nm); el.appendChild(pr); el.appendChild(row);
    inventoryList.appendChild(el);
  }
}

// Topup UI
balanceBtn.addEventListener("click", ()=> openTopup());
function openTopup(){ tpPopup.classList.remove("hidden"); tpPopup.setAttribute("aria-hidden","false"); tpStatus.textContent = ""; tpAmount.value = 50; }
function closeTopup(){ tpPopup.classList.add("hidden"); tpPopup.setAttribute("aria-hidden","true"); tpStatus.textContent = ""; }

document.querySelectorAll(".preset").forEach(btn=>{
  btn.addEventListener("click", (e)=>{ tpAmount.value = e.target.textContent; });
});

tpClose.addEventListener("click", ()=> closeTopup());

tpCreateBtn.addEventListener("click", async ()=>{
  const amount = Math.max(1, Math.floor(Number(tpAmount.value) || 0));
  if(!amount){ tpStatus.textContent = state.lang==="ru" ? "Введите сумму" : "Enter amount"; return; }
  // If BOT_TOKEN is provided we attempt to create an invoice link (insecure)
  if(BOT_TOKEN && PROVIDER_TOKEN){
    tpStatus.textContent = state.lang==="ru" ? "Создаю инвойс..." : "Creating invoice...";
    const link = await createInvoiceLink(USER_ID, amount);
    if(link){
      tpStatus.textContent = state.lang==="ru" ? "Открываю оплату..." : "Opening payment...";
      try{ tg?.openInvoice(link); }catch(e){ console.warn("openInvoice failed", e); }
      // start local watcher (client-side) for payment — insecure and not 100% reliable
      startInvoiceWatcher(INVOICE_TTL_SEC);
    } else {
      tpStatus.textContent = state.lang==="ru" ? "Ошибка создания инвойса" : "Invoice error";
    }
  } else {
    // SAFE LOCAL TOPUP (no money): instantly credit
    state.balance += amount;
    state.total_recharged += amount;
    saveState(); updateBalanceUI();
    tpStatus.textContent = state.lang==="ru" ? `+${amount} ⭐` : `+${amount} ⭐`;
    setTimeout(()=> closeTopup(), 900);
  }
});

// createInvoiceLink (client-side, dangerous)
async function createInvoiceLink(user_id, amount){
  try{
    const body = {
      title: "Пополнение звёзд ⭐",
      description: `${amount} stars for casefase`,
      payload: JSON.stringify({ uid: user_id, ts: Date.now() }),
      provider_token: PROVIDER_TOKEN,
      currency: CURRENCY,
      prices: [{ label: "Stars", amount: amount * 1 }]
    };
    const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
      method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body)
    });
    const data = await resp.json();
    if(data && data.ok) return data.result;
    console.error("invoice error", data);
    return null;
  }catch(e){ console.error("invoice exception", e); return null; }
}

// invoice watcher - polls getUpdates (client-side) to detect successful_payment
let updatesOffset = parseInt(localStorage.getItem("casefase_updates_offset")||"0",10) || 0;
let invoiceInterval = null;
function startInvoiceWatcher(ttl){
  const until = Date.now() + (ttl||INVOICE_TTL_SEC)*1000;
  if(invoiceInterval) clearInterval(invoiceInterval);
  invoiceInterval = setInterval(async ()=>{
    if(Date.now() > until){ clearInterval(invoiceInterval); invoiceInterval = null; showTmp(state.lang==="ru" ? "Время на оплату истекло" : "Invoice expired"); return; }
    try{
      const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${updatesOffset}&timeout=1`);
      const data = await r.json();
      if(!data.ok) return;
      for(const upd of data.result || []){
        updatesOffset = Math.max(updatesOffset, upd.update_id + 1);
        localStorage.setItem("casefase_updates_offset", updatesOffset);
        if(upd.message && upd.message.successful_payment){
          const sp = upd.message.successful_payment;
          const raw = sp.invoice_payload || upd.message.invoice_payload || null;
          if(raw){
            let payload = null;
            try{ payload = typeof raw === "string" ? JSON.parse(raw) : raw; }catch(e){}
            if(payload && String(payload.uid) === String(USER_ID)){
              const total = sp.total_amount || 0;
              const stars = Math.floor(total/100);
              state.balance += stars;
              state.total_recharged += stars;
              saveState(); updateBalanceUI(); renderInventory();
              showTmp((state.lang==="ru"? "Оплата подтверждена: " : "Payment confirmed: ") + stars + " ⭐");
              clearInterval(invoiceInterval); invoiceInterval = null; closeTopup();
              return;
            }
          }
        }
      }
    }catch(e){ console.warn("watcher error", e); }
  }, 1400);
}

// helpers
function updateBalanceUI(){
  balanceValueEl.textContent = state.balance;
  totalRechargedEl.textContent = (state.lang==="ru" ? "Всего пополнено: " : "Total recharged: ") + state.total_recharged + " ⭐";
}
function saveState(){ try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch(e){ console.warn(e); } }
function loadState(){ try{ const raw = localStorage.getItem(STORAGE_KEY); if(raw) return JSON.parse(raw); }catch(e){} return { balance: 0, total_recharged: 0, inventory: [], lang: null, theme: null }; }
function genId(){ return 'it_' + Math.random().toString(36).slice(2,9); }
function showTmp(msg){ modalStatus.textContent = msg; setTimeout(()=>{ if(modalStatus.textContent === msg) modalStatus.textContent = ""; }, 3500); }
function escapeHtml(s){ return String(s).replace(/[&<>"]/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }

// localization & UI glue
function localize(){
  document.querySelectorAll(".open-btn").forEach(b=> b.textContent = state.lang==="ru" ? "Открыть" : "Open");
  document.querySelectorAll(".preset").forEach(b=> b.textContent = b.textContent); // same
}
function applyTheme(t){
  if(t === "light"){ document.documentElement.style.setProperty('--bg', '#f5f6f7'); document.documentElement.style.setProperty('--text','#111'); }
  localStorage.setItem("casefase_theme", t);
}

// profile init
function initProfile(){
  avatarEl.src = user.photo_url || "https://via.placeholder.com/96";
  displayNameEl.textContent = (user.first_name || "User") + (user.last_name ? " " + user.last_name : "");
  userIdEl.textContent = "ID: " + (user.id || "—");
  renderInventory();
  updateBalanceUI();
}

// nav handlers
btnMain.addEventListener("click", ()=> { showPage("main"); });
btnProfile.addEventListener("click", ()=> { showPage("profile"); });

function showPage(p){
  if(p === "main"){ mainPage.classList.add("active"); profilePage.classList.remove("active"); btnMain.classList.add("active"); btnProfile.classList.remove("active"); }
  else { profilePage.classList.add("active"); mainPage.classList.remove("active"); btnProfile.classList.add("active"); btnMain.classList.remove("active"); }
}

// attach DOM handlers
function attachHandlers(){
  closeModal.addEventListener("click", ()=> closeCaseModal());
  tpClose.addEventListener("click", ()=> closeTopup());
  buildCases(); // ensure buttons wired
}

// small helpers for demo
function showStatusText(s){ byId("subtitle").textContent = s; }

// initial render functions
function renderInventory(){ /* defined earlier */ }
function buildCases(){ /* already defined above - no-op here to satisfy hoist */ }

// small housekeeping: ensure case list built properly (rebuild)
casesGrid.innerHTML = "";
for(const c of CASES){
  const card = document.createElement("div"); card.className = "case-card";
  const img = document.createElement("img"); img.className = "case-thumb"; img.src = c.thumb; img.alt = c.title;
  const title = document.createElement("div"); title.className = "case-title"; title.textContent = c.title;
  const price = document.createElement("div"); price.className = "case-price"; price.textContent = `${c.price} ⭐`;
  const btn = document.createElement("button"); btn.className = "btn primary open-btn"; btn.textContent = state.lang==="ru"?"Открыть":"Open";
  btn.addEventListener("click", ()=> openCaseModal(c));
  card.appendChild(img); card.appendChild(title); card.appendChild(price); card.appendChild(btn);
  casesGrid.appendChild(card);
}

// make sure inventory renders at start
renderInventory();
updateBalanceUI();
localize();
