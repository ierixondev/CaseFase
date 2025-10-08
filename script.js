// === НАСТРОЙКИ ===
const BOT_TOKEN = "8001095635:AAF8QL-2D6icOhTFLNTk6MQZkBw5oXMoqkw";       // вставь токен бота
const PROVIDER_TOKEN = "PASTE_YOUR_PROVIDER_TOKEN_HERE"; // токен платежного провайдера
const CURRENCY = "XTR"; // или "USD" если тестируешь без Stars
// ==================

const tg = window.Telegram.WebApp;
tg.expand();
const user = tg.initDataUnsafe?.user || {};
document.getElementById("profileName").textContent = `Имя: ${user.first_name || "-"}`;
document.getElementById("profileId").textContent = `ID: ${user.id || "-"}`;

// вкладки
const pageMain = document.getElementById("page-main");
const pageProfile = document.getElementById("page-profile");
document.getElementById("tabMain").onclick = () => switchTab("main");
document.getElementById("tabProfile").onclick = () => switchTab("profile");

function switchTab(tab){
  document.getElementById("tabMain").classList.toggle("active", tab==="main");
  document.getElementById("tabProfile").classList.toggle("active", tab==="profile");
  pageMain.classList.toggle("active", tab==="main");
  pageProfile.classList.toggle("active", tab==="profile");
}

// кнопка пополнить
document.getElementById("buy").onclick = async () => {
  const amount = parseInt(document.getElementById("amount").value);
  if(!amount || amount <= 0){
    setStatus("Введите корректное число");
    return;
  }
  setStatus("Создаю инвойс...");
  try{
    const payload = JSON.stringify({ uid: user.id, ts: Date.now() });
    const body = {
      title: "Пополнение звёзд",
      description: `${amount} ⭐ для casefase`,
      payload: payload,
      provider_token: PROVIDER_TOKEN,
      currency: CURRENCY,
      prices: [{ label: "Stars", amount: amount * 1 }]
    };
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if(data.ok){
      setStatus("Открываю оплату...");
      tg.openInvoice(data.result);
    } else {
      console.error(data);
      setStatus("Ошибка при создании инвойса");
    }
  } catch(e){
    console.error(e);
    setStatus("Ошибка соединения");
  }
};

function setStatus(msg){
  document.getElementById("status").textContent = msg;
  setTimeout(()=>document.getElementById("status").textContent="",4000);
}
