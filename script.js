/* script.js
   Frontend-only mini-app:
   - Main: кейсы (default)
   - Profile: nick, id, avatar, balance, inventory, real top-up optionally
   - Modal: animation (carousel) and separate drop list below
   - Weighted random: Bear(50), Heart(40), Rocket(9), Ring(1)
   NOTES:
   - For real invoices: uncomment and fill BOT_TOKEN & PROVIDER_TOKEN below.
   - Storing BOT_TOKEN in client is insecure; recommended: use server for invoices.
*/

///// CONFIG /////
const BOT_TOKEN = "8001095635:AAF8QL-2D6icOhTFLNTk6MQZkBw5oXMoqkw";           // optional: "7938864177:..." (DANGEROUS to put in client)
const PROVIDER_TOKEN = "";      // optional provider token from BotFather
const CURRENCY = "XTR";         // or "USD"
const INVOICE_WAIT_SEC = 60;    // watcher timeout if using client-side invoice
/////////////////////

// helpers
const $ = id => document.getElementById(id);
const tg = window.Telegram?.WebApp;
try{ tg?.expand(); }catch(e){}
const user = tg?.initDataUnsafe?.user || {};
const USER_ID = user.id || `guest_${Math.random().toString(36).slice(2,8)}`;
const STORAGE_KEY = "casefase_v4_state";

// DOM refs
const balanceValueEl = $("balanceValue");
const balanceBtn = $("balanceBtn");
const casesGrid = $("casesGrid");
const caseModal = $("caseModal");
const carousel = $("carousel");
const caseTitle = $("caseTitle");
const caseCost = $("caseCost");
const openCaseBtn = $("openCaseBtn");
const modalStatus = $("modalStatus");
const closeModal = $("closeModal");
const dropList = $("dropList");
const btnMain = $("btnMain");
const btnProfile = $("btnProfile");
const mainPage = $("mainPage");
const profilePage = $("profilePage");
const avatarEl = $("avatar");
const displayNameEl = $("displayName");
const userIdEl = $("userId");
const totalRechargedEl = $("totalRecharged");
const inventoryList = $("inventoryList");
const tpAmount = $("tpAmount");
const tpCreateBtn = $("tpCreateBtn");
const tpStatus = $("tpStatus");

// state
let state = loadState();
if(!state.lang) state.lang = (user.language_code && user.language_code.startsWith("ru")) ? "ru" : "en";
if(!state.theme) state.theme = localStorage.getItem("casefase_theme") || "dark";

// items & cases
const ITEMS = [
  { id: "bear",  name: "Bear",  img: "https://storage.beee.pro/game_items/25887/a7gXXBIRWJS1wXk5MD6Wy2xhDec6HtJ5hWxTtnY1.webp", price: 15, weight:50 },
  { id: "heart", name: "Heart", img: "https://storage.beee.pro/game_items/25888/n4QcCspVUixkujQcC0yc9Kkke8py4l17enbIdVR0.webp", price: 15, weight:40 },
  { id: "rocket",name: "Rocket",img: "https://storage.beee.pro/game_items/25879/77szLyeo6jwTpO7DRbWaKwqTegSsz6oQ0RZa7IdU.webp", price: 50, weight:9 },
  { id: "ring",  name: "Ring",  img: "https://storage.beee.pro/game_items/25877/mv5puNENM4Uok2pTdAhgrwKUNDoQk6zp8n5vqdM4.webp", price: 100, weight:1 }
];
const CASES = [{ id:"classic", title:"Classic Case", price:25, thumb:ITEMS[0].img, items:ITEMS }];

// init UI & handlers
applyTheme(state.theme);
buildCases();
initProfile();
renderInventory();
updateBalanceUI();
attachHandlers();
showPage("main");

// === UI builders ===
function buildCases(){
  casesGrid.innerHTML = "";
  for(const c of CASES){
    const card = document.createElement("div"); card.className = "case-card";
    card.innerHTML = `
      <img class="case-thumb" src="${c.thumb}" alt="${escapeHtml(c.title)}" />
      <div class="case-title">${escapeHtml(c.title)}</div>
      <div class="case-price">${c.price} ⭐</div>
      <button class="btn primary open-btn">${state.lang==="ru"?"Открыть":"Open"}</button>
    `;
    card.querySelector(".open-btn").addEventListener("click", ()=> openCaseModal(c));
    casesGrid.appendChild(card);
  }
}

// open modal
function openCaseModal(c){
  caseModal.classList.remove("hidden");
  caseTitle.textContent = c.title;
  caseCost.textContent = `${c.price} ⭐`;
  openCaseBtn.textContent = `${state.lang==="ru"?"Открыть":"Open"} (${c.price} ⭐)`;
  modalStatus.textContent = "";
  // prepare long carousel
  carousel.innerHTML = "";
  for(let r=0;r<8;r++){
    for(const it of c.items){
      const img = document.createElement("img"); img.src = it.img; img.alt = it.name;
      carousel.appendChild(img);
    }
  }
  fillDropList(c.items);
  caseModal.dataset.caseId = c.id;
}

// close modal
closeModal.addEventListener("click", ()=> { stopCarousel(); caseModal.classList.add("hidden"); delete caseModal.dataset.caseId; modalStatus.textContent = ""; });

// drop list
function fillDropList(items){
  dropList.innerHTML = "";
  for(const it of items){
    const div = document.createElement("div"); div.className = "drop-item";
    div.innerHTML = `<img src="${it.img}" alt="${escapeHtml(it.name)}"/><div class="muted small">${escapeHtml(it.name)}</div><div class="muted small">${it.price} ⭐</div>`;
    dropList.appendChild(div);
  }
}

// animation + reveal (weighted)
let rafId = null;
function stopCarousel(){ if(rafId) cancelAnimationFrame(rafId); carousel.style.transition=""; }

function animateAndReveal(caseObj){
  return new Promise(resolve=>{
    // continuous scroll loop
    let pos = 0;
    const speed = 3 + Math.random()*4;
    let running = true;
    function loop(){
      pos -= speed;
      carousel.style.transform = `translateX(${pos}px)`;
      if(Math.abs(pos) > carousel.scrollWidth/2) pos = 0;
      if(running) rafId = requestAnimationFrame(loop);
    }
    rafId = requestAnimationFrame(loop);

    // stop after delay and pick weighted
    const delay = 1400 + Math.random()*1200;
    setTimeout(()=>{
      running = false;
      if(rafId) cancelAnimationFrame(rafId);

      const chosen = pickWeighted(caseObj.items);
      // find an element whose src contains chosen image filename
      let idx = 0;
      const key = chosen.img.split('/').slice(-1)[0];
      for(let i=0;i<carousel.children.length;i++){
        if(carousel.children[i].src && carousel.children[i].src.includes(key)){
          idx = i; break;
        }
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

// open-case button handler
openCaseBtn.addEventListener("click", async ()=>{
  const cid = caseModal.dataset.caseId;
  const caseObj = CASES.find(c=>c.id===cid);
  if(!caseObj) return;
  if(state.balance < caseObj.price){ modalStatus.textContent = state.lang==="ru" ? "Недостаточно звёзд" : "Not enough stars"; return; }
  // deduct immediately
  state.balance -= caseObj.price;
  saveState(); updateBalanceUI();
  modalStatus.textContent = state.lang==="ru" ? "Открывается..." : "Opening...";
  try{
    const prize = await animateAndReveal(caseObj);
    modalStatus.textContent = `${state.lang==="ru" ? "Выпало" : "Dropped"}: ${prize.name} • ${prize.price} ⭐`;
    const actions = document.createElement("div"); actions.className = "row"; actions.style.marginTop = "12px";
    const keep = document.createElement("button"); keep.className="btn primary"; keep.textContent = state.lang==="ru"?"В инвентарь":"Keep";
    const sell = document.createElement("button"); sell.className="btn"; sell.textContent = state.lang==="ru"?"Продать (-5%)":"Sell (-5%)";
    actions.appendChild(keep); actions.appendChild(sell);
    modalStatus.parentElement.appendChild(actions);
    keep.addEventListener("click", ()=> { addToInventory(prize); modalStatus.textContent = state.lang==="ru" ? "Добавлено в инвентарь" : "Added to inventory"; actions.remove(); });
    sell.addEventListener("click", ()=> { const sellVal = Math.floor(prize.price * 0.95); state.balance += sellVal; saveState(); updateBalanceUI(); modalStatus.textContent = (state.lang==="ru"?`Продано за ${sellVal} ⭐`:`Sold for ${sellVal} ⭐`); actions.remove(); });
  }catch(e){ console.error(e); modalStatus.textContent = state.lang==="ru"? "Ошибка открытия" : "Open error"; }
});

// inventory functions
function addToInventory(item){
  const rec = { uid: genId(), id: item.id, name: item.name, img: item.img, price: item.price, ts: Date.now() };
  state.inventory.push(rec);
  saveState(); renderInventory();
}
function renderInventory(){
  inventoryList.innerHTML = "";
  if(state.inventory.length === 0){ inventoryList.innerHTML = `<div class="muted small">${state.lang==="ru" ? "Пусто" : "Empty"}</div>`; return; }
  const arr = state.inventory.slice().reverse();
  for(const it of arr){
    const el = document.createElement("div"); el.className="inv-item";
    const img = document.createElement("img"); img.src = it.img;
    const nm = document.createElement("div"); nm.textContent = it.name;
    const pr = document.createElement("div"); pr.className="muted small"; pr.textContent = `${it.price} ⭐`;
    const row = document.createElement("div"); row.className="row";
    const keepBtn = document.createElement("button"); keepBtn.className="btn"; keepBtn.textContent = state.lang==="ru"?"Оставить":"Keep";
    const sellBtn = document.createElement("button"); sellBtn.className="btn"; sellBtn.textContent = state.lang==="ru"?"Продать":"Sell";
    sellBtn.addEventListener("click", ()=>{ const sellVal = Math.floor(it.price * 0.95); state.inventory = state.inventory.filter(x=>x.uid!==it.uid); state.balance += sellVal; saveState(); renderInventory(); updateBalanceUI(); showTemp(state.lang==="ru"?`Продано за ${sellVal} ⭐`:`Sold for ${sellVal} ⭐`); });
    row.appendChild(keepBtn); row.appendChild(sellBtn);
    el.appendChild(img); el.appendChild(nm); el.appendChild(pr); el.appendChild(row);
    inventoryList.appendChild(el);
  }
}

// Top-up (Profile): real invoice optional / local credit by default
balanceBtn.addEventListener("click", ()=> showPage("profile")); // tap balance -> go to profile top-up area
tpCreateBtn.addEventListener("click", async ()=>{
  const amount = Math.max(1, Math.floor(Number(tpAmount.value) || 0));
  if(!amount){ tpStatus.textContent = state.lang==="ru" ? "Введите сумму" : "Enter amount"; return; }
  tpStatus.textContent = state.lang==="ru" ? "Обработка..." : "Processing...";
  // If tokens not set -> local credit
  if(!BOT_TOKEN || !PROVIDER_TOKEN){
    state.balance += amount;
    state.total_recharged += amount;
    saveState(); updateBalanceUI(); renderInventory();
    tpStatus.textContent = `+${amount} ⭐`;
    setTimeout(()=> tpStatus.textContent = "", 1200);
    return;
  }
  // If BOT_TOKEN provided (INSECURE) -> create invoice link client-side and open
  const invoice = await createInvoiceLink(USER_ID, amount);
  if(invoice){
    try{ tg?.openInvoice(invoice); }catch(e){ console.warn("openInvoice failed", e); }
    // start client-side watcher to detect successful_payment via getUpdates
    startClientInvoiceWatcher(INVOICE_WAIT_SEC);
  } else {
    tpStatus.textContent = state.lang==="ru" ? "Ошибка создания инвойса" : "Invoice error";
    setTimeout(()=> tpStatus.textContent = "", 1500);
  }
});

// createInvoiceLink (client-side) — DANGEROUS to use with real BOT_TOKEN in browser
async function createInvoiceLink(user_id, amount){
  try{
    const payload = { uid: user_id, ts: Date.now() };
    const body = { title:"Пополнение звёзд ⭐", description:`${amount} stars`, payload:JSON.stringify(payload), provider_token:PROVIDER_TOKEN, currency:CURRENCY, prices:[{label:"Stars", amount: amount*1}] };
    const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) });
    const data = await resp.json();
    if(data && data.ok) return data.result;
    console.error("createInvoiceLink error", data);
    return null;
  }catch(e){ console.error(e); return null; }
}

// client-side invoice watcher (polling getUpdates) — only if BOT_TOKEN available (insecure)
let updatesOffset = parseInt(localStorage.getItem("casefase_updates_offset")||"0",10) || 0;
let invoiceInterval = null;
function startClientInvoiceWatcher(ttl){
  const until = Date.now() + ttl*1000;
  if(invoiceInterval) clearInterval(invoiceInterval);
  invoiceInterval = setInterval(async ()=>{
    if(Date.now() > until){ clearInterval(invoiceInterval); invoiceInterval=null; tpStatus.textContent = state.lang==="ru"?"Время ожидания истекло":"Invoice expired"; setTimeout(()=>tpStatus.textContent="",1500); return; }
    try{
      const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${updatesOffset}&timeout=1`);
      const data = await r.json();
      if(!data.ok) return;
      for(const u of data.result || []){
        updatesOffset = Math.max(updatesOffset, u.update_id + 1);
        localStorage.setItem("casefase_updates_offset", updatesOffset);
        if(u.message && u.message.successful_payment){
          const sp = u.message.successful_payment;
          const raw = sp.invoice_payload || u.message.invoice_payload || null;
          if(raw){
            let obj = null;
            try{ obj = typeof raw === "string" ? JSON.parse(raw) : raw; }catch(e){}
            if(obj && String(obj.uid) === String(USER_ID)){
              const total = sp.total_amount || 0; // smallest units
              const stars = Math.floor(total / 100);
              state.balance += stars;
              state.total_recharged += stars;
              saveState(); updateBalanceUI(); renderInventory();
              tpStatus.textContent = state.lang==="ru" ? `Оплата подтверждена: ${stars} ⭐` : `Payment confirmed: ${stars} ⭐`;
              clearInterval(invoiceInterval); invoiceInterval = null;
              setTimeout(()=> tpStatus.textContent = "", 2000);
              return;
            }
          }
        }
      }
    }catch(e){ console.warn("watcher error", e); }
  }, 1400);
}

// helpers / UI
function initProfile(){
  avatarEl.src = user.photo_url || "https://via.placeholder.com/96";
  displayNameEl.textContent = (user.first_name||"User") + (user.last_name ? " " + user.last_name : "");
  userIdEl.textContent = "ID: " + (user.id || "—");
  totalRechargedEl.textContent = (state.lang==="ru" ? "Всего пополнено: " : "Total recharged: ") + (state.total_recharged || 0) + " ⭐";
}
function updateBalanceUI(){ balanceValueEl.textContent = state.balance; totalRechargedEl.textContent = (state.lang==="ru" ? "Всего пополнено: " : "Total recharged: ") + (state.total_recharged||0) + " ⭐"; }
function saveState(){ try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch(e){ console.warn(e); } }
function loadState(){ try{ const raw = localStorage.getItem(STORAGE_KEY); if(raw) return JSON.parse(raw); }catch(e){} return { balance:0, total_recharged:0, inventory:[], lang:null, theme:null }; }
function genId(){ return 'it_'+Math.random().toString(36).slice(2,9); }
function showTemp(msg){ modalStatus.textContent = msg; setTimeout(()=>{ if(modalStatus.textContent===msg) modalStatus.textContent=""; }, 3000); }
function escapeHtml(s){ return String(s).replace(/[&<>"]/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
function applyTheme(t){ if(t==="light"){ document.documentElement.style.setProperty('--bg','#f7f8fa'); document.documentElement.style.setProperty('--text','#111'); } localStorage.setItem("casefase_theme", t); }

// nav
btnMain.addEventListener("click", ()=> showPage("main"));
btnProfile.addEventListener("click", ()=> showPage("profile"));
function showPage(p){
  if(p==="main"){ mainPage.classList.add("active"); profilePage.classList.remove("active"); btnMain.classList.add("active"); btnProfile.classList.remove("active"); }
  else { profilePage.classList.add("active"); mainPage.classList.remove("active"); btnProfile.classList.add("active"); btnMain.classList.remove("active"); }
}

// attach other handlers
function attachHandlers(){
  tpAmount.value = 50;
  renderInventory();
}
attachHandlers();

// expose for debug
window._casefase = { state, saveState, addToInventory };

// done
