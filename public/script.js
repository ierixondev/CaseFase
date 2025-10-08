/* script.js - frontend
   PUBLIC: put these files on your hosting (Vercel) at https://case-fase.vercel.app/
   BOT_API_URL must point to the bot server (bot.py's HTTP server), e.g. https://my-bot.example.com
*/
const BOT_API_URL = "https://YOUR_BOT_PUBLIC_URL"; // <<< SET THIS to your bot server public URL (https)
const POLL_PROFILE_INTERVAL_MS = 3000;

const tg = window.Telegram?.WebApp;
try{ tg?.expand(); }catch(e){}

const user = tg?.initDataUnsafe?.user || {};
const USER_ID = user.id || `guest_${Math.random().toString(36).slice(2,8)}`;

const byId = id => document.getElementById(id);
const balanceValueEl = byId("balanceValue");
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

const caseModal = byId("caseModal");
const closeModal = byId("closeModal");
const carousel = byId("carousel");
const dropList = byId("dropList");
const openCaseBtn = byId("openCaseBtn");
const modalStatus = byId("modalStatus");
const caseTitle = byId("caseTitle");
const caseCost = byId("caseCost");

const STORAGE_KEY = "casefase_prod_state";

// local state: inventory and cached profile (balance) (inventory local)
let state = loadState();

// items & case (weights for rarities)
const ITEMS = [
  { id: "bear",  name: "Bear",  img: "https://storage.beee.pro/game_items/25887/a7gXXBIRWJS1wXk5MD6Wy2xhDec6HtJ5hWxTtnY1.webp", price: 15, weight:50 },
  { id: "heart", name: "Heart", img: "https://storage.beee.pro/game_items/25888/n4QcCspVUixkujQcC0yc9Kkke8py4l17enbIdVR0.webp", price: 15, weight:40 },
  { id: "rocket",name: "Rocket", img: "https://storage.beee.pro/game_items/25879/77szLyeo6jwTpO7DRbWaKwqTegSsz6oQ0RZa7IdU.webp", price: 50, weight:9 },
  { id: "ring",  name: "Ring",  img: "https://storage.beee.pro/game_items/25877/mv5puNENM4Uok2pTdAhgrwKUNDoQk6zp8n5vqdM4.webp", price: 100, weight:1 }
];
const CASE = { id:"classic", title:"Classic Case", price:25, thumb:ITEMS[0].img, items:ITEMS };

// init UI
applyProfile();
buildMain();
renderInventory();
pollProfile();
setInterval(pollProfile, POLL_PROFILE_INTERVAL_MS);

// nav
btnMain.addEventListener("click", ()=> showPage("main"));
btnProfile.addEventListener("click", ()=> showPage("profile"));
byId("balanceBtn").addEventListener("click", ()=> showPage("profile"));

// main: open case modal from main button
byId("openCaseBtnMain").addEventListener("click", ()=> openCaseModal(CASE));

// modal handlers
closeModal.addEventListener("click", ()=> closeCaseModal());
openCaseBtn.addEventListener("click", async ()=>{
  if(!CASE) return;
  // require balance from server
  const profile = await getProfile();
  const bal = profile?.balance || 0;
  if(bal < CASE.price){ modalStatus.textContent = "Недостаточно звёзд"; return; }
  modalStatus.textContent = "Открывается...";
  // request server to reserve? (we are doing simple approach: deduct visible after success)
  // For client-only simplicity: we let animation run then add item locally and call server to validate (server updates after payment only).
  const prize = await animateAndReveal(CASE);
  modalStatus.textContent = `Выпало: ${prize.name} • ${prize.price} ⭐`;
  const actions = document.createElement("div"); actions.className = "row"; actions.style.marginTop="10px";
  const keep = document.createElement("button"); keep.className="btn primary"; keep.textContent = "В инвентарь";
  const sell = document.createElement("button"); sell.className="btn"; sell.textContent = "Продать (-5%)";
  actions.appendChild(keep); actions.appendChild(sell);
  modalStatus.parentElement.appendChild(actions);
  keep.addEventListener("click", ()=>{ addToInventory(prize); modalStatus.textContent = "Добавлено в инвентарь"; actions.remove(); });
  sell.addEventListener("click", async ()=>{
    // sale increases local balance — but authoritative balance is on bot/server; to reflect real system, we also send server nothing here (this is client-only sale).
    const sellVal = Math.floor(prize.price * 0.95);
    // update local cached balance to show immediate UX — real balance is controlled by bot.
    state.cached_balance = (state.cached_balance || 0) + sellVal;
    saveState(); renderInventory(); modalStatus.textContent = `Продано за ${sellVal} ⭐`; actions.remove();
  });
});

// Open case modal (shared)
function openCaseModal(c){
  caseModal.classList.remove("hidden");
  caseTitle.textContent = c.title;
  caseCost.textContent = `${c.price} ⭐`;
  fillCarousel(c);
  fillDropList(c.items);
  caseModal.dataset.caseId = c.id;
}
function closeCaseModal(){ stopCarousel(); caseModal.classList.add("hidden"); delete caseModal.dataset.caseId; modalStatus.textContent=""; }

// animation (same weighted logic)
let raf = null;
function fillCarousel(c){
  carousel.innerHTML = "";
  for(let r=0;r<8;r++){
    for(const it of c.items){
      const img = document.createElement("img"); img.src = it.img; img.alt = it.name;
      carousel.appendChild(img);
    }
  }
}
function fillDropList(items){
  dropList.innerHTML = "";
  for(const it of items){
    const el = document.createElement("div"); el.className = "drop-item";
    el.innerHTML = `<img src="${it.img}" alt="${it.name}"><div class="muted small name">${it.name}</div><div class="muted small">${it.price} ⭐</div>`;
    dropList.appendChild(el);
  }
}

function stopCarousel(){ if(raf) cancelAnimationFrame(raf); carousel.style.transition=""; }

function animateAndReveal(caseObj){
  return new Promise(resolve=>{
    let pos = 0;
    const speed = 3 + Math.random()*4;
    let running = true;
    function frame(){ pos -= speed; carousel.style.transform = `translateX(${pos}px)`; if(Math.abs(pos) > carousel.scrollWidth/2) pos = 0; if(running) raf = requestAnimationFrame(frame);}
    raf = requestAnimationFrame(frame);
    const delay = 1200 + Math.random()*1300;
    setTimeout(()=>{
      running = false;
      if(raf) cancelAnimationFrame(raf);
      const chosen = pickWeighted(caseObj.items);
      // find index
      const key = chosen.img.split('/').slice(-1)[0];
      let idx = 0;
      for(let i=0;i<carousel.children.length;i++){ if(carousel.children[i].src && carousel.children[i].src.includes(key)){ idx = i; break; } }
      const viewportWidth = carousel.parentElement.clientWidth;
      const el = carousel.children[idx];
      const elLeft = el.offsetLeft;
      const elW = el.clientWidth;
      const target = -(elLeft - (viewportWidth - elW)/2);
      carousel.style.transition = "transform 900ms cubic-bezier(.2,.8,.2,1)";
      carousel.style.transform = `translateX(${target}px)`;
      carousel.addEventListener("transitionend", function handler(){ carousel.removeEventListener("transitionend", handler); resolve(chosen); }, { once:true });
    }, delay);
  });
}
function pickWeighted(arr){
  const total = arr.reduce((s,i)=>s+(i.weight||1),0);
  let r = Math.random()*total;
  for(const i of arr){ r -= (i.weight||1); if(r <= 0) return i; }
  return arr[arr.length-1];
}

// Inventory (local)
function addToInventory(item){
  state.inventory = state.inventory || [];
  state.inventory.push({ uid: genId(), id: item.id, name: item.name, img: item.img, price: item.price, ts: Date.now() });
  saveState(); renderInventory();
}
function renderInventory(){
  inventoryList.innerHTML = "";
  if(!state.inventory || state.inventory.length === 0){ inventoryList.innerHTML = `<div class="muted small">Пусто</div>`; return; }
  const arr = state.inventory.slice().reverse();
  for(const it of arr){
    const el = document.createElement("div"); el.className = "inv-item";
    el.innerHTML = `<img src="${it.img}" alt="${it.name}"><div class="name">${it.name}</div><div class="price">${it.price} ⭐</div><div class="row"><button class="btn keep">Оставить</button><button class="btn sell">Продать</button></div>`;
    el.querySelector(".sell").addEventListener("click", ()=>{ const val = Math.floor(it.price*0.95); state.inventory = state.inventory.filter(x=>x.uid !== it.uid); state.cached_balance = (state.cached_balance || 0) + val; saveState(); renderInventory(); });
    inventoryList.appendChild(el);
  }
}

// Profile: show telegram info + cached balance
function applyProfile(){
  avatarEl.src = user.photo_url || "https://via.placeholder.com/96";
  displayNameEl.textContent = (user.first_name || "User") + (user.last_name ? " " + user.last_name : "");
  userIdEl.textContent = "ID: " + (user.id || "—");
  totalRechargedEl.textContent = "Всего пополнено: " + (state.total_recharged || 0) + " ⭐";
  balanceValueEl.textContent = state.cached_balance || 0;
}

// Poll profile on bot (bot server is authoritative for real payments)
async function pollProfile(){
  if(!BOT_API_URL) return;
  try{
    const res = await fetch(`${BOT_API_URL}/profile?user_id=${encodeURIComponent(USER_ID)}`);
    if(!res.ok) return;
    const j = await res.json();
    if(j && j.ok && j.profile){
      state.cached_balance = j.profile.balance || 0;
      state.total_recharged = j.profile.total_recharged || 0;
      saveState(); applyProfile(); renderInventory();
    }
  }catch(e){ /* ignore */ }
}

// Top-up: call bot server create-invoice — bot creates invoiceLink via Telegram API and returns it
tpCreateBtn.addEventListener("click", async ()=>{
  const amount = Math.max(1, Math.floor(Number(tpAmount.value) || 0));
  if(!amount){ tpStatus.textContent = "Введите сумму"; return; }
  tpStatus.textContent = "Создаю инвойс...";
  tpCreateBtn.disabled = true;
  try{
    const resp = await fetch(`${BOT_API_URL}/create-invoice`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ user_id: USER_ID, amount }) });
    const j = await resp.json();
    if(j && j.ok && j.invoiceLink){
      tpStatus.textContent = "Открываю оплату...";
      try{ tg.openInvoice(j.invoiceLink); }catch(e){ console.warn(e); }
      // server (bot) will get successful_payment and update DB; pollProfile will pick it up
    } else {
      tpStatus.textContent = "Ошибка создания инвойса";
    }
  }catch(e){
    console.error(e); tpStatus.textContent = "Ошибка соединения";
  } finally { tpCreateBtn.disabled = false; setTimeout(()=>tpStatus.textContent="",2000); }
});

// Helpers / state
function showPage(p){ if(p==="main"){ mainPage.classList.add("active"); profilePage.classList.remove("active"); btnMain.classList.add("active"); btnProfile.classList.remove("active"); } else { profilePage.classList.add("active"); mainPage.classList.remove("active"); btnProfile.classList.add("active"); btnMain.classList.remove("active"); } }
function saveState(){ try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch(e){} }
function loadState(){ try{ const raw = localStorage.getItem(STORAGE_KEY); if(raw) return JSON.parse(raw); }catch(e){} return { inventory: [], cached_balance: 0, total_recharged: 0 }; }
function genId(){ return 'it_' + Math.random().toString(36).slice(2,9); }
function buildMain(){ /* nothing additional - main shows single CASE */ }
