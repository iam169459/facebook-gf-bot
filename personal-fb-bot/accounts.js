import crypto from "node:crypto";
import { v4 as uuid } from "uuid";
import { getDb } from "./db.js";

export function hashToken(t) {
  return crypto.createHash("sha256").update(t || "").digest("hex");
}

export function genSecret() {
  return crypto.randomBytes(48).toString("base64url");
}

export function createAccount(db, { name, email, fbAccessToken, fbRefreshToken, storedExpiresAt, profileUrl, avatarUrl }) {
  const id = uuid();
  const now = Date.now();
  db.run(
    `INSERT INTO accounts
      (id, name, email, fb_access_token, fb_refresh_token, stored_expires_at, profile_url, avatar_url, created_at, updated_at)
     VALUES (@id, @name, @email, @fb_access_token, @fb_refresh_token, @stored_expires_at, @profile_url, @avatar_url, @now, @now)`,
    { id, name, email: email || null, fb_access_token: hashToken(fbAccessToken), fb_refresh_token: fbRefreshToken || null,
      stored_expires_at: storedExpiresAt || null, profile_url: profileUrl || null, avatar_url: avatarUrl || null, now }
  );
  return { id, name, email, profile_url: profileUrl, avatar_url: avatarUrl };
}

export function findAccount(db, id) {
  return db.get("SELECT * FROM accounts WHERE id = @id", { id });
}

export function findAccountBySession(db, token) {
  return db.get("SELECT a.* FROM accounts a JOIN sessions s ON s.account_id = a.id WHERE s.token = @token", { token });
}

export function listAccounts(db) {
  const out = [];
  for (const r of db.all("SELECT * FROM accounts ORDER BY name")) {
    out.push({ id: r.id, name: r.name, email: r.email, profile_url: r.profile_url, avatar_url: r.avatar_url });
  }
  return out;
}

export function createSession(db, accountId, token, userAgent, ip, expiresAt) {
  db.run(
    `INSERT INTO sessions (id, account_id, token, user_agent, ip, logged_in_at, expires_at)
     VALUES (@id, @account_id, @token, @user_agent, @ip, @now, @expires_at)`,
    { id: uuid(), account_id: accountId, token: hashToken(token), user_agent: userAgent || null, ip: ip || null, now: Date.now(), expires_at: expiresAt }
  );
  return token;
}

export function findSession(db, token) {
  return db.get("SELECT s.*, a.id as account_id FROM sessions s JOIN accounts a ON a.id = s.account_id WHERE s.token = @token", { token: hashToken(token) });
}

export function deleteSession(db, token) {
  db.run("DELETE FROM sessions WHERE token = @t", { t: hashToken(token) });

}

export function listSessions(db) {
  const out = [];
  for (const r of db.all("SELECT id, account_id, token, user_agent, ip, logged_in_at, expires_at FROM sessions")) {
    out.push({ id: r.id, account_id: r.account_id, user_agent: r.user_agent, ip: r.ip, logged_in_at: r.logged_in_at, expires_at: r.expires_at });
  }
  return out;
}
