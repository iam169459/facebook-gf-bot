import http from "node:http";
import { URL } from "node:url";
import express from "express";
import { randomBytes } from "node:crypto";
import { v4 as uuid } from "uuid";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cookie from "cookie";
import { PersonalFBClient } from "./fbdriver.js";
import { openDb, getDb, save } from "./db.js";
import {
  createAccount, findAccount, findAccountBySession, listAccounts, createSession, deleteSession, listSessions,
} from "./accounts.js";

const JWT_SECRET = process.env.JWT_SECRET || "personal-fb-bot-dev-secret-change-me";

// bcryptjs bindings (kept for future use in account hashing).
// bcryptjs only exposes a CommonJS default export, so use createRequire.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const bcryptCjs = require("bcryptjs");
const { hashSync, compareSync } = bcryptCjs;
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "0.0.0.0";
const SESSION_COOKIE = "pfb_session";
const SESSION_TTL = 60 * 60 * 24 * 30;

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  let token = null;
  if (header.startsWith("Bearer ")) token = header.slice(7);
  else token = req.cookies[SESSION_COOKIE];
  if (!token) return res.status(401).json({ error: "unauthorized" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.accountId = payload.sub;
    req.sessionToken = payload.sessionToken;
    next();
  } catch (e) {
    return res.status(401).json({ error: "invalid token" });
  }
}

function requireAdmin(req, res, next) {
  const h = req.headers.authorization || "";
  const tok = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (process.env.ADMIN_TOKEN && tok !== process.env.ADMIN_TOKEN) return res.status(401).json({ error: "admin only" });
  next();
}

function setSession(res, req, payload) {
  const sess = randomBytes(24).toString("base64url");
  createSession(getDb(), payload.sub, sess, req.headers["user-agent"] || "", req.ip || "unknown", Date.now() + SESSION_TTL * 1000);
  const httpOnly = "HttpOnly; Path=/; SameSite=Lax";
  if (process.env.NODE_ENV === "production") httpOnly += "; Secure";
  res.cookie(SESSION_COOKIE, sess, { httpOnly: true, maxAge: SESSION_TTL * 1000, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  const raw = jwt.sign({ sub: payload.sub, sessionToken: sess }, JWT_SECRET, { expiresIn: "30d" });
  res.cookie("pfb_jwt", raw, { httpOnly: true, maxAge: 30 * 24 * 60 * 60 * 1000, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
}

async function main() {
  await openDb();

  app.get("/api/health", requireAdmin, (req, res) => {
    res.json({ ok: true, now: Date.now(), db: getDb().all("SELECT 1")[0] || {} });
  });

  app.get("/api/accounts", requireAdmin, (req, res) => {
    res.json({ accounts: listAccounts(getDb()) });
  });

  app.get("/api/sessions", requireAdmin, (req, res) => {
    res.json({ sessions: listSessions(getDb()) });
  });

  app.post("/api/login", requireAdmin, async (req, res) => {
    const { email, pass, accountName, profileUrl, avatarUrl } = req.body || {};
    const db = getDb();
    let account = findAccount(db, email || req.body.accountId || null);
    if (!account) {
      const email2 = email || req.body.email || null;
      const name = accountName || (email2 ? email2.split("@")[0].slice(0, 40) : "Personal FB Account");
      account = createAccount(db, {
        name, email: email2, fbAccessToken: null, fbRefreshToken: null, storedExpiresAt: null, profileUrl, avatarUrl,
      });
    }
    const token = randomBytes(24).toString("base64url");
    createSession(db, account.id, token, req.headers["user-agent"] || "", req.ip || "unknown", Date.now() + SESSION_TTL * 1000);
    const raw = jwt.sign({ sub: account.id, sessionToken: token }, JWT_SECRET, { expiresIn: "30d" });
    res.cookie("pfb_jwt", raw, { httpOnly: true, maxAge: 30 * 24 * 60 * 60 * 1000, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
    res.cookie(SESSION_COOKIE, token, { httpOnly: true, maxAge: SESSION_TTL * 1000, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
    res.json({ ok: true, account: { id: account.id, name: account.name, email: account.email, profile_url: account.profile_url } });
  });

  app.post("/api/connect", auth, async (req, res) => {
    const { email, pass, profileUrl, avatarUrl } = req.body || {};
    const fb = new PersonalFBClient({ driver: process.env.PERSONAL_FB_DRIVER || "chromium", profileDir: process.env.PERSONAL_FB_PROFILE_DIR, headless: false, userAgent: process.env.PERSONAL_FB_USER_AGENT });
    try {
      const loggedIn = await fb.ensureLoggedIn({ email, pass });
      if (!loggedIn.ok) return res.status(400).json({ error: "login_failed", what: loggedIn.what });
      const user = await fb.getLoggedInUser();
      if (!user.ok) return res.status(400).json({ error: "user_not_found" });
      const db = getDb();
      const acc = findAccount(db, req.accountId);
      if (acc) {
        acc.name = user.name;
        acc.profile_url = user.profileUrl;
        if (email) acc.email = email;
        getDb().run(`UPDATE accounts SET name=@name, profile_url=@profile_url, email=@email, updated_at=@now WHERE id=@id`, { name: user.name, profile_url: user.profileUrl, email, id: acc.id, now: Date.now() });
      } else {
        createAccount(db, { name: user.name, email, fbAccessToken: null, fbRefreshToken: null, storedExpiresAt: null, profileUrl: user.profileUrl, avatarUrl });
      }
      save();
      res.json({ ok: true, account: { id: req.accountId, name: user.name, profileUrl: user.profileUrl } });
    } catch (e) {
      console.error("[connect]", e);
      res.status(500).json({ error: "connect_failed", message: e.message });
    } finally {
      try { await fb.close(); } catch (e) {}
    }
  });

  app.post("/api/disconnect", auth, (req, res) => {
    const db = getDb();
    db.run("DELETE FROM accounts WHERE id = @id", { id: req.accountId });

    save();
    res.json({ ok: true });
  });

  app.get("/api/account", auth, (req, res) => {
    const db = getDb();
    const acc = findAccount(db, req.accountId);
    res.json({ account: acc || null });
  });

  app.post("/api/logout", auth, (req, res) => {
    deleteSession(getDb(), req.sessionToken);
    res.clearCookie(SESSION_COOKIE);
    res.clearCookie("pfb_jwt");
    res.json({ ok: true });
  });

  app.get("/api/messages", auth, async (req, res) => {
    const { unreadOnly = false } = req.query;
    const db = getDb();
    const rows = db.all("SELECT * FROM messages WHERE account_id = @id ORDER BY created_at DESC LIMIT 100", { id: req.accountId }) || [];
    const { rows: threads } = db.all("SELECT DISTINCT thread_id FROM messages WHERE account_id = @id AND thread_id IS NOT NULL", { id: req.accountId }) || [];
    res.json({ ok: true, messages: rows, threads });
  });

  app.get("/api/messages/:id", auth, async (req, res) => {
    const db = getDb();
    const msg = db.get("SELECT * FROM messages WHERE account_id = @id AND id = @id", { id: req.params.id, accountId: req.accountId });
    if (!msg) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true, message: msg });
  });

  app.post("/api/messages", auth, async (req, res) => {
    const { threadId, text, recipient } = req.body || {};
    const db = getDb();
    const id = uuid();
    db.run("INSERT INTO messages (id, account_id, thread_id, sender_id, text, type, status, created_at, updated_at) VALUES (@id, @account_id, @thread_id, @sender_id, @text, @type, @status, @now, @now)", { id, account_id: req.accountId, thread_id: threadId || null, sender_id: recipient || null, text: text || "", type: "message", status: "sent", now: Date.now() });
    save();
    res.json({ ok: true, message: { id, ...req.body } });
  });

  app.post("/api/messages/:id/read", auth, async (req, res) => {
    const db = getDb();
    db.run("UPDATE messages SET status = 'read', updated_at = @now WHERE account_id = @id AND id = @id", { id: req.params.id, accountId: req.accountId, now: Date.now() });
    save();
    res.json({ ok: true });
  });

  app.post("/api/messages/:id/like", auth, async (req, res) => {
    const { emoji } = req.body || {};
    const db = getDb();
    db.run("INSERT INTO messages (id, account_id, thread_id, sender_id, text, type, status, created_at, updated_at) VALUES (@id, @account_id, @thread_id, @sender_id, @text, 'like', 'liked', @now, @now)", { id: uuid(), account_id: req.accountId, thread_id: null, sender_id: req.body.senderId || null, text: emoji || "👍", type: "like", status: "liked", now: Date.now() });
    save();
    res.json({ ok: true });
  });

  app.post("/api/messages/:id/edit", auth, async (req, res) => {
    const { text } = req.body || {};
    const db = getDb();
    db.run("UPDATE messages SET text = @text, updated_at = @now WHERE account_id = @id AND id = @id", { id: req.params.id, accountId: req.accountId, text, now: Date.now() });
    save();
    res.json({ ok: true });
  });

  app.post("/api/messages/:id/seen", auth, async (req, res) => {
    const db = getDb();
    db.run("UPDATE messages SET status = 'read', updated_at = @now WHERE account_id = @id AND id = @id", { id: req.params.id, accountId: req.accountId, now: Date.now() });
    save();
    res.json({ ok: true });
  });

  app.post("/api/reactions", auth, async (req, res) => {
    const { reactionableId, emoji } = req.body || {};
    const db = getDb();
    db.run("INSERT INTO messages (id, account_id, thread_id, sender_id, text, type, status, created_at, updated_at) VALUES (@id, @account_id, @thread_id, @sender_id, @text, 'reaction', 'reacted', @now, @now)", { id: uuid(), account_id: req.accountId, thread_id: reactionableId || null, sender_id: null, text: emoji || "👍", type: "reaction", status: "reacted", now: Date.now() });
    save();
    res.json({ ok: true });
  });

  app.post("/api/create-account", requireAdmin, async (req, res) => {
    const { name, email, profileUrl, avatarUrl } = req.body || {};
    const db = getDb();
    const acc = createAccount(db, { name, email, fbAccessToken: null, fbRefreshToken: null, storedExpiresAt: null, profileUrl, avatarUrl });
    res.json({ ok: true, account: acc });
  });

  app.post("/api/settings", async (req, res) => {
    const { action, message, settings } = req.body || {};
    if (action === "test") {
      const model = (settings && settings.model) || "gpt-4o-mini";
      const provider = (settings && settings.provider) || "openai";
      const token = settings && settings.aiAccount ? settings.aiAccount : process.env.PERSONAL_AI_TOKEN || "demo-token";
      const endpoint = settings && settings.endpoint;
      try {
        let reply;
        if (provider === "anthropic") {
          const res2 = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-api-key": token, "anthropic-version": "2023-06-01" },
            body: JSON.stringify({ model, max_tokens: 500, messages: [{ role: "user", content: message }] }),
          });
          const j2 = await res2.json();
          reply = (j2.content && j2.content[0] && j2.content[0].text) || "Anthropic error";
        } else {
          const res2 = await fetch(endpoint || "https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ model, max_tokens: 500, messages: [{ role: "user", content: message }] }),
          });
          const j2 = await res2.json();
          reply = (j2.choices && j2.choices[0] && j2.choices[0].message && j2.choices[0].message.content) || "OpenAI/other error";
        }
        res.json({ ok: true, reply });
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    } else {
      res.json({ ok: true });
    }
  });

  app.get("/api/logs", (req, res) => {
    res.json({ entries: [{ t: Date.now(), level: "info", msg: "Personal FB dashboard online" }] });
  });

  app.use((req, res) => {
    if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });
    res.sendFile("ui/index.html", { root: process.cwd() });
  });

  const server = http.createServer(app);
  server.listen(PORT, HOST, () => {
    console.log(`[pfb] personal facebook dashboard listening on http://${HOST}:${PORT}`);
    const count = getDb().all("SELECT COUNT(*) as c FROM accounts")[0];
    console.log(`[pfb] DB ready (accounts rows: ${count?.c})`);
  });
}

main().catch((e) => {
  console.error("[pfb] fatal:", e);
  process.exit(1);
});
