// server/server.js
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import sqlite3 from "sqlite3";
import fetch from "node-fetch";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_FILE = path.join(__dirname, "data.db");

// ========== CONFIG ==========
// ВАЖНО: вставь здесь реальные значения перед запуском
const BOT_TOKEN = "8001095635:AAF8QL-2D6icOhTFLNTk6MQZkBw5oXMoqkw";          // <- вставь токен бота (секретно, на сервере)
const PROVIDER_TOKEN = "PASTE_YOUR_PROVIDER_TOKEN_HERE"; // <- provider token от BotFather
const CURRENCY = "XTR"; // или "USD" если провайдер не поддерживает XTR
// ==============================

const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public"))); // optional

// init sqlite
const db = new sqlite3.Database(DB_FILE);
db.serialize(()=>{
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    language TEXT,
    balance INTEGER DEFAULT 0,
    total_recharged INTEGER DEFAULT 0,
    updated_at TEXT
  )`);
});

// helpers
const run = (sql, params=[]) => new Promise((res, rej)=> db.run(sql, params, function(err){ if(err) return rej(err); res(this); }));
const get = (sql, params=[]) => new Promise((res, rej)=> db.get(sql, params, (err,row)=> { if(err) return rej(err); res(row); }));

// register/update user (optional endpoint used by bot)
app.post("/api/register-user", async (req,res)=>{
  const u = req.body.user;
  if(!u || !u.id) return res.status(400).json({ ok:false, error:"no_user" });
  const now = new Date().toISOString();
  try{
    const existing = await get("SELECT * FROM users WHERE id = ?", [u.id]);
    if(existing){
      await run(`UPDATE users SET username=?, first_name=?, last_name=?, language=?, updated_at=? WHERE id=?`, [u.username||null, u.first_name||null, u.last_name||null, u.language_code||"ru", now, u.id]);
    } else {
      await run(`INSERT INTO users (id, username, first_name, last_name, language, updated_at) VALUES (?, ?, ?, ?, ?, ?)`, [u.id, u.username||null, u.first_name||null, u.last_name||null, u.language_code||"ru", now]);
    }
    res.json({ ok:true });
  }catch(e){ console.error(e); res.status(500).json({ ok:false, error: e.message }); }
});

// get profile
app.get("/api/profile", async (req,res)=>{
  const user_id = req.query.user_id;
  if(!user_id) return res.status(400).json({ ok:false, error:"no_user_id" });
  try{
    const row = await get("SELECT * FROM users WHERE id = ?", [parseInt(user_id)]);
    if(!row) return res.json({ ok:true, profile: { id: parseInt(user_id), balance:0, total_recharged:0 } });
    res.json({ ok:true, profile: { id: row.id, username: row.username, first_name: row.first_name, last_name: row.last_name, language: row.language, balance: row.balance || 0, total_recharged: row.total_recharged || 0 } });
  }catch(e){ console.error(e); res.status(500).json({ ok:false, error: e.message }); }
});

// create invoice -> call Telegram createInvoiceLink
app.post("/api/create-invoice", async (req,res)=>{
  const { user_id, amount } = req.body;
  if(!user_id || !amount || amount <= 0) return res.status(400).json({ ok:false, error:"invalid_params" });

  const payload = JSON.stringify({ uid: user_id, ts: Date.now() });
  const body = {
    title: "Пополнение звёзд ⭐",
    description: `${amount} stars for casefase`,
    payload,
    provider_token: PROVIDER_TOKEN,
    currency: CURRENCY,
    prices: [{ label: "Stars", amount: amount * 1 }]
  };
  try{
    const r = await fetch(`${API_BASE}/createInvoiceLink`, { method: "POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body) });
    const data = await r.json();
    if(!data.ok){ console.error("Telegram error:", data); return res.status(500).json({ ok:false, error:"telegram_error", details: data }); }
    return res.json({ ok:true, invoiceLink: data.result });
  }catch(e){ console.error("createInvoice error", e); res.status(500).json({ ok:false, error: e.message }); }
});

// update-balance (called by bot after successful_payment)
app.post("/api/update-balance", async (req,res)=>{
  const { user_id, stars } = req.body;
  if(!user_id || !stars) return res.status(400).json({ ok:false, error:"invalid_params" });
  const now = new Date().toISOString();
  try{
    const r = await run(`UPDATE users SET balance = balance + ?, total_recharged = total_recharged + ?, updated_at = ? WHERE id = ?`, [stars, stars, now, user_id]);
    if(r.changes === 0){
      await run(`INSERT INTO users (id, balance, total_recharged, updated_at) VALUES (?, ?, ?, ?)`, [user_id, stars, stars, now]);
    }
    res.json({ ok:true });
  }catch(e){ console.error(e); res.status(500).json({ ok:false, error: e.message }); }
});

// serve frontend optional
app.get("/", (req,res)=> res.sendFile(path.join(__dirname, "../public/index.html")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log(`Server started on ${PORT}`));
