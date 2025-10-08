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
// НЕ ВСТАВЛЯЙ реальный токен в публичные места.
// Перед запуском замените заглушки:
const BOT_TOKEN = "8001095635:AAF8QL-2D6icOhTFLNTk6MQZkBw5oXMoqkw";
const PROVIDER_TOKEN = "PASTE_YOUR_PROVIDER_TOKEN_HERE";
// ============================

const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public"))); // optional: serve frontend from server

// init db
const db = new sqlite3.Database(DB_FILE);
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    language TEXT,
    theme TEXT DEFAULT 'dark',
    balance INTEGER DEFAULT 0,
    total_recharged INTEGER DEFAULT 0,
    updated_at TEXT
  )`);
});

// helpers
function runSql(sql, params=[]) {
  return new Promise((res, rej) => {
    db.run(sql, params, function(err){
      if(err) return rej(err);
      res({ lastID: this.lastID, changes: this.changes });
    });
  });
}
function getSql(sql, params=[]){
  return new Promise((res, rej) => {
    db.get(sql, params, (err,row) => {
      if(err) return rej(err);
      res(row);
    });
  });
}

// register user
app.post("/api/register-user", async (req, res) => {
  const payloadUser = req.body.user;
  if(!payloadUser || !payloadUser.id) return res.status(400).json({ ok:false, error: "no_user" });
  const uid = payloadUser.id;
  const now = new Date().toISOString();
  try{
    const existing = await getSql("SELECT * FROM users WHERE id=?", [uid]);
    if(existing){
      await runSql(`UPDATE users SET username=?, first_name=?, last_name=?, language=?, updated_at=? WHERE id=?`,
        [payloadUser.username||null, payloadUser.first_name||null, payloadUser.last_name||null, payloadUser.language_code||"ru", now, uid]);
    } else {
      await runSql(`INSERT INTO users (id, username, first_name, last_name, language, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [uid, payloadUser.username||null, payloadUser.first_name||null, payloadUser.last_name||null, payloadUser.language_code||"ru", now]);
    }
    res.json({ ok: true });
  }catch(e){
    console.error(e);
    res.status(500).json({ ok:false, error: e.message });
  }
});

// get profile
app.get("/api/profile", async (req, res) => {
  const user_id = req.query.user_id;
  if(!user_id) return res.status(400).json({ ok:false, error:"no_user_id" });
  try{
    const u = await getSql("SELECT * FROM users WHERE id=?", [parseInt(user_id)]);
    if(!u) return res.json({ ok:true, profile: { id: parseInt(user_id), balance: 0, total_recharged: 0 }});
    return res.json({ ok:true, profile: {
      id: u.id, username: u.username, first_name: u.first_name, last_name: u.last_name,
      language: u.language, theme: u.theme, balance: u.balance || 0, total_recharged: u.total_recharged || 0
    }});
  }catch(e){
    console.error(e);
    res.status(500).json({ ok:false, error: e.message });
  }
});

// create invoice (calls Telegram createInvoiceLink)
app.post("/api/create-invoice", async (req, res) => {
  const { user_id, amount } = req.body;
  if(!user_id || !amount || amount <= 0) return res.status(400).json({ ok:false, error:"invalid_params" });

  const payload = JSON.stringify({ user_id: user_id, ts: Date.now() });
  // Use Stars (XTR) if your provider supports it. If not — use "USD".
  const currency = "XTR"; // <-- change to "USD" for testing if needed

  const body = {
    title: "Пополнение звёзд ⭐",
    description: `${amount} stars for casefase`,
    payload: payload,
    provider_token: PROVIDER_TOKEN,
    currency: currency,
    prices: [{ label: "Stars", amount: amount * 1 }] // smallest units
  };

  try{
    const r = await fetch(`${API_BASE}/createInvoiceLink`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await r.json();
    if(!data.ok){
      console.error("Telegram createInvoiceLink error:", data);
      return res.status(500).json({ ok:false, error: "telegram_error", details: data });
    }
    return res.json({ ok:true, invoiceLink: data.result });
  }catch(err){
    console.error("create-invoice error", err);
    return res.status(500).json({ ok:false, error: err.message });
  }
});

// update balance (called by bot)
app.post("/api/update-balance", async (req, res) => {
  const { user_id, stars } = req.body;
  if(!user_id || !stars) return res.status(400).json({ ok:false, error: "invalid_params" });
  const now = new Date().toISOString();
  try{
    const r = await runSql(`UPDATE users SET balance = balance + ?, total_recharged = total_recharged + ?, updated_at = ? WHERE id = ?`,
      [stars, stars, now, user_id]);
    if(r.changes === 0){
      // user not exists -> insert
      await runSql(`INSERT INTO users (id, balance, total_recharged, updated_at) VALUES (?, ?, ?, ?)`,
        [user_id, stars, stars, now]);
    }
    return res.json({ ok:true });
  }catch(e){
    console.error(e);
    res.status(500).json({ ok:false, error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
