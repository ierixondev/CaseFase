/*  SCRIPT (frontend-only)
    IMPORTANT:
    - This code is fully client-side and creates Telegram invoices by calling
      https://api.telegram.org/bot<BOT_TOKEN>/createInvoiceLink
    - Putting BOT_TOKEN or PROVIDER_TOKEN in client-side JS is INSECURE: anyone
      who can see the page can steal the token. Safer approach is server-side.
    - You asked explicitly for client-only flow — placeholders remain below.
*/

///// CONFIG — вставь свои значения /////
const BOT_TOKEN = "8001095635:AAF8QL-2D6icOhTFLNTk6MQZkBw5oXMoqkw";
const PROVIDER_TOKEN = "PASTE_YOUR_PROVIDER_TOKEN_HERE";
const CURRENCY = "XTR"; // or "USD" for testing
const FRONTEND_ORIGIN = window.location.origin;
///// END CONFIG //////////////////////

const tg = window.Telegram.WebApp;
tg.expand();

const user = tg.initDataUnsafe?.user || {};
const USER_ID = user.id || "guest";
let LANG = (user.language_code && user.language_code.startsWith("ru")) ? "ru" : "en";
let THEME = localStorage.getItem("casefase_theme") || "dark";

// UI refs
const balanceValueEl = document.getElementById("balanceValue");
const balanceBox = document.getElementById("balanceBox");
const casesGrid = document.getElementById("casesGrid");
const caseModal = document.getElementById("caseModal");
const carousel = document.getElementById("carousel");
const caseTitle = document.getElementById("caseTitle");
const casePriceEl = document.getElementById("casePrice");
const openCaseBtn = document.getElementById("openCaseBtn");
const modalStatus = document.getElementById("modalStatus");
const closeModal = document.getElementById("closeModal");
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

// local state saved in localStorage
const STORAGE_KEY = "casefase_state_v1";
let state = loadState();

// INITIALIZATION
applyTheme(THEME);
langSelect.value = LANG;
themeSelect.value = THEME;
initProfileUI();
buildCases();
renderInventory();
updateUIBalance();

// NAV
btnMain.addEventListener("click", ()=>showPage("main"));
btnProfile.addEventListener("click", ()=>showPage("profile"));
function showPage(p){ if(p==="main"){ mainPage.classList.add("active"); profilePage.classList.remove("active"); btnMain.classList.add("active"); btnProfile.classList.remove("active"); } else { profilePage.classList.add("active"); mainPage.classList.remove("active"); btnProfile.classList.add("active"); btnMain.classList.remove("active"); } }

// THEME / LANG
themeSelect.addEventListener("change", e=>{ THEME = e.target.value; localStorage.setItem("casefase_theme", THEME); applyTheme(THEME); });
langSelect.addEventListener("change", e=>{ LANG = e.target.value; localizeAll(); });

// BALANCE click => open topup popup
balanceBox.addEventListener("click", ()=>{ openTopup(); });

// TOPUP popup handlers
tpCancelBtn?.addEventListener("click", ()=>{ closeTopup(); });
tpCreateBtn?.addEventListener("click", async ()=>{ const amt = parseInt(tpAmountInput.value); if(!amt || amt<=0){ tpStatus.textContent = LANG==="ru"?"Введите корректную сумму":"Enter valid amount"; return; } tpStatus.textContent = LANG==="ru"?"Создаю инвойс...":"Creating invoice..."; tpCreateBtn.disabled = true; try{ const invoiceLink = await createInvoiceLink(USER_ID, amt); if(invoiceLink){ tpStatus.textContent = LANG==="ru"?"Открываю оплату...":"Opening payment..."; tg.openInvoice(invoiceLink); // start 60s watcher to poll bot updates for success startInvoiceWatcher(invoiceLink, 60); } else { tpStatus.textContent = LANG==="ru"?"Ошибка создания":"Creation error"; } }catch(e){ tpStatus.textContent = LANG==="ru"?"Ошибка":"Error"; console.error(e);} finally{ tpCreateBtn.disabled=false; setTimeout(()=>tpStatus.textContent="",3000); } });

// CASES DATA (no probabilities — absolute random pick)
const CASES = [
  {
    id: "case1",
    title: "Classic Case",
    price: 25,
    thumb: "https://postimg.cc/DWBrjcG1", // user image link (note: postimg page not direct image; used as thumb)
    items: [
      { id: "bear", name: "Bear", img: "https://storage.beee.pro/game_items/25887/a7gXXBIRWJS1wXk5MD6Wy2xhDec6HtJ5hWxTtnY1.webp", price: 15 },
      { id: "hearth", name: "Hearth", img: "https://storage.beee.pro/game_items/25888/n4QcCspVUixkujQcC0yc9Kkke8py4l17enbIdVR0.webp", price: 15 },
      { id: "rocket", name: "Rocket", img: "https://storage.beee.pro/game_items/25879/77szLyeo6jwTpO7DRbWaKwqTegSsz6oQ0RZa7IdU.webp", price: 50 },
      { id: "ring", name: "Ring", img: "https://storage.beee.pro/game_items/25877/mv5puNENM4Uok2pTdAhgrwKUNDoQk6zp8n5vqdM4.webp", price: 100 }
    ]
  }
];

// build cases grid
function buildCases(){
  casesGrid.innerHTML = "";
  for(const c of CASES){
    const card = document.createElement("div"); card.className="case-card";
    const img = document.createElement("img"); img.src = c.items[0].img; img.alt = c.title;
    const name = document.createElement("div"); name.className="name"; name.textContent = c.title;
    const info = document.createElement("div"); info.className="info"; info.textContent = `${c.price} ⭐ • Open`;
    const openBtn = document.createElement("button"); openBtn.className="btn primary"; openBtn.textContent = LANG==="ru"?"Открыть":"Open";
    openBtn.addEventListener("click", ()=>openCaseModal(c));
    card.appendChild(img); card.appendChild(name); card.appendChild(info); card.appendChild(openBtn);
    casesGrid.appendChild(card);
  }
}

// open case modal
let currentCase = null;
function openCaseModal(caseObj){
  currentCase = caseObj;
  caseModal.classList.remove("hidden");
  carousel.innerHTML = "";
  // fill carousel with item thumbnails (repeated to look like a roll)
  const reps = 12;
  for(let i=0;i<reps;i++){
    for(const it of caseObj.items){
      const im = document.createElement("img"); im.src = it.img; im.alt = it.name;
      carousel.appendChild(im);
    }
  }
  caseTitle.textContent = caseObj.title;
  casePriceEl.textContent = `${caseObj.price} ⭐`;
  openCaseBtn.textContent = (LANG==="ru"?"Открыть":"Open") + ` (${caseObj.price} ⭐)`;
  modalStatus.textContent = "";
}

// close modal
closeModal.addEventListener("click", ()=>{ caseModal.classList.add("hidden"); stopCarousel(); });

// open case action
openCaseBtn.addEventListener("click", async ()=>{
  if(!currentCase) return;
  if(state.balance < currentCase.price){ modalSetStatus(LANG==="ru"?"Недостаточно звёзд":"Not enough stars"); return; }
  // deduct immediately
  state.balance -= currentCase.price;
  state.total_recharged = state.total_recharged; // unchanged
  saveState(); updateUIBalance(); renderInventory();
  modalSetStatus(LANG==="ru"?"Открывается...":"Opening...");
  // animate carousel: continuous scroll then stop and pick a random item
  await animateCarouselAndReveal(currentCase);
});

// CAROUSEL ANIMATION + REVEAL
let carouselAnim = null;
function stopCarousel(){ if(carouselAnim){ clearTimeout(carouselAnim); carouselAnim = null; } carousel.style.transition=""; }
function modalSetStatus(msg){ modalStatus.textContent = msg; setTimeout(()=>modalStatus.textContent="",4000); }

function animateCarouselAndReveal(caseObj){
  return new Promise(resolve=>{
    const speed = 6; // px per frame approx
    // initial continuous move
    let pos = 0;
    let running = true;
    function frame(){
      pos -= speed;
      carousel.style.transform = `translateX(${pos}px)`;
      // loop: when scrolled past width of first block, reset to 0 to create infinite scroll illusion
      if(Math.abs(pos) > carousel.scrollWidth/2) pos = 0;
      if(running) carouselAnim = requestAnimationFrame(frame);
    }
    carouselAnim = requestAnimationFrame(frame);

    // after random time (1.5–2.5s), slow & stop then pick random item
    const rndDelay = 1500 + Math.random()*1200;
    setTimeout(()=>{
      running = false; // stop continuous
      cancelAnimationFrame(carouselAnim);
      // smooth slow-down by CSS transition to a specific offset that shows chosen item
      const totalItems = carousel.children.length;
      const chosenIndex = Math.floor(Math.random()*totalItems);
      const chosenEl = carousel.children[chosenIndex];
      // compute target translate so chosenEl is centered
      const viewportWidth = carousel.parentElement.clientWidth;
      const elLeft = chosenEl.offsetLeft;
      const elWidth = chosenEl.clientWidth;
      const target = -(elLeft - (viewportWidth - elWidth)/2);
      carousel.style.transition = "transform 900ms cubic-bezier(.2,.8,.2,1)";
      carousel.style.transform = `translateX(${target}px)`;
      // when transition ends -> finalize
      carousel.addEventListener("transitionend", function handler(){
        carousel.removeEventListener("transitionend", handler);
        // map chosenEl src to item
        const chosenSrc = chosenEl.src;
        const chosenItem = caseObj.items.find(it => it.img === chosenSrc) || randomChoice(caseObj.items);
        // add to inventory
        addItemToInventory(chosenItem);
        modalSetStatus((LANG==="ru"? "Выпало: ":"Dropped: ") + chosenItem.name + ` • ${chosenItem.price} ⭐`);
        // show options: keep or sell -> we add a small choose overlay in inv rendering
        resolve();
      }, { once: true });
    }, rndDelay);
  });
}

// inventory management
function addItemToInventory(item){
  const it = { id: genId(), itemId: item.id, name: item.name, img: item.img, price: item.price, created: Date.now() };
  state.inventory.push(it);
  saveState();
  renderInventory();
}

// render inventory list
function renderInventory(){
  inventoryList.innerHTML = "";
  if(state.inventory.length===0){ inventoryList.innerHTML = `<div class="status">${LANG==="ru"?"Пусто":"Empty"}</div>`; return; }
  for(const it of state.inventory.slice().reverse()){ // newest first
    const div = document.createElement("div"); div.className="inv-item";
    const img = document.createElement("img"); img.src = it.img;
    const nm = document.createElement("div"); nm.textContent = it.name;
    const price = document.createElement("div"); price.textContent = `${it.price} ⭐`;
    const btnKeep = document.createElement("button"); btnKeep.className="btn"; btnKeep.textContent = LANG==="ru"?"Оставить":"Keep";
    const btnSell = document.createElement("button"); btnSell.className="btn"; btnSell.textContent = LANG==="ru"?"Продать":"Sell";
    btnKeep.addEventListener("click", ()=>{ modalSetStatus(LANG==="ru"? "Добавлено в инвентарь":"Kept"); });
    btnSell.addEventListener("click", ()=>{ sellItem(it.id); });
    div.appendChild(img); div.appendChild(nm); div.appendChild(price);
    const row = document.createElement("div"); row.className="row";
    row.appendChild(btnKeep); row.appendChild(btnSell);
    div.appendChild(row);
    inventoryList.appendChild(div);
  }
}

// sell item: price with -5% fee
function sellItem(uid){
  const idx = state.inventory.findIndex(x=>x.id===uid);
  if(idx===-1) return;
  const it = state.inventory[idx];
  const sellPrice = Math.floor(it.price * 0.95);
  state.balance += sellPrice;
  // remove item
  state.inventory.splice(idx,1);
  saveState(); updateUIBalance(); renderInventory();
  modalSetStatus((LANG==="ru"? "Продано за ":"Sold for ") + sellPrice + " ⭐");
}

// UTIL: createInvoiceLink via Telegram Bot API
async function createInvoiceLink(user_id, amount){
  // payload: include user id and client marker so we can later match updates
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
    const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify(body)
    });
    const data = await resp.json();
    if(data && data.ok) return data.result;
    console.error("createInvoiceLink error", data); return null;
  }catch(e){ console.error(e); return null; }
}

// INVOICE WATCHER (poll bot getUpdates for successful_payment)
// NOTE: This will expose BOT_TOKEN client-side (insecure). We respect user's "no API" requirement.
let invoiceWatcherOffset = parseInt(localStorage.getItem("casefase_updates_offset")||"0");
let invoicePolling = null;
function startInvoiceWatcher(invoiceLink, seconds){
  const expiry = Date.now() + seconds*1000;
  // Poll every 2s for updates (successful_payment) until expiry
  invoicePolling = setInterval(async ()=>{
    // stop if expired
    if(Date.now()>expiry){ clearInterval(invoicePolling); invoicePolling=null; return; }
    try{
      const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${invoiceWatcherOffset}&timeout=1`);
      const data = await resp.json();
      if(data && data.ok && data.result && data.result.length){
        for(const upd of data.result){
          invoiceWatcherOffset = Math.max(invoiceWatcherOffset, upd.update_id+1);
          // save offset to localStorage so we don't re-read next time
          localStorage.setItem("casefase_updates_offset", invoiceWatcherOffset);
          // check for message with successful_payment
          if(upd.message && upd.message.successful_payment){
            const sp = upd.message.successful_payment;
            const payer = upd.message.from;
            // payload can be in successful_payment.invoice_payload or message.invoice_payload
            const payloadRaw = sp.invoice_payload || upd.message.invoice_payload || sp.payload || null;
            // if payload matches our user id, credit balance
            if(payloadRaw){
              let payloadObj = null;
              try{ payloadObj = typeof payloadRaw === "string" ? JSON.parse(payloadRaw) : payloadRaw; }catch(e){}
              if(payloadObj && String(payloadObj.uid) === String(USER_ID)){
                const total_amount = sp.total_amount || 0; // in smallest units (cents)
                const stars = Math.floor(total_amount / 100);
                // credit
                state.balance += stars;
                state.total_recharged += stars;
                saveState(); updateUIBalance(); renderInventory();
                modalSetStatus((LANG==="ru"?"Оплата подтверждена: ":"Payment confirmed: ") + stars + " ⭐");
                // stop watcher for this invoice
                clearInterval(invoicePolling); invoicePolling = null;
                return;
              }
            }
          }
        }
      }
    }catch(e){
      console.warn("invoice watcher error", e);
    }
  }, 2000);
}

// small helpers
function updateUIBalance(){ balanceValueEl.textContent = state.balance; metaTotalEl.textContent = (LANG==="ru"?"Всего пополнено: ":"Total recharged: ") + state.total_recharged + " ⭐"; }
function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function loadState(){ try{ const s = JSON.parse(localStorage.getItem(STORAGE_KEY)||"null"); if(s) return s; }catch(e){} return { balance: 0, total_recharged: 0, inventory: [] }; }
function genId(){ return 'id_'+Math.random().toString(36).slice(2,9); }
function randomChoice(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

// PROFILE UI init
function initProfileUI(){
  avatarEl.src = user.photo_url || "https://via.placeholder.com/96";
  displayNameEl.textContent = (user.first_name||"User") + (user.last_name ? " " + user.last_name : "");
  metaIdEl.textContent = "ID: " + (user.id || "—");
  metaTotalEl.textContent = (LANG==="ru"?"Всего пополнено: ":"Total recharged: ") + state.total_recharged + " ⭐";
}

// topup popup UI
function openTopup(){ tpPopup.classList.remove("hidden"); tpAmountInput.value = 50; tpStatus.textContent = ""; }
function closeTopup(){ tpPopup.classList.add("hidden"); tpStatus.textContent = ""; }

// utils
function applyTheme(t){ document.getElementById("app").classList.toggle("light", t==="light"); }
function localizeAll(){
  // minimal localization for labels (can expand)
  if(LANG==="ru"){ document.getElementById("greeting").textContent = `Привет, ${user.first_name || ""}!`; document.getElementById("subtitle").textContent = "Открывайте кейсы и собирайте предметы"; }
  else { document.getElementById("greeting").textContent = `Hi, ${user.first_name || ""}!`; document.getElementById("subtitle").textContent = "Open cases and collect items"; }
}

// small boot actions
localizeAll();

// Expose some debug to window
window._casefase = { state, saveState, addItemToInventory };
