import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// sql.js's Statement binding mechanism (Hb/Gb) does not reliably apply
// named (:name/@name) or positional (?) parameters in this build when run
// inside Node. To avoid depending on that broken path, all values are
// safely interpolated directly into the SQL text here and the queries are
// executed with db.exec()/db.run(). Every value is escaped for SQL:
//   - strings: wrap in single quotes, double any internal quotes
//   - integers: emitted as-is (safe for Date.now() and COUNT() results)
//   - null/undefined: emitted as NULL
function esc(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "string") {
    return "'" + value.replace(/'/g, "''") + "'";
  }
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function prepare(query, ...bindings) {
  const args = bindings[0];
  if (!args) return query;
  if (typeof args === "object" && !Array.isArray(args)) {
    // Named binding case: replace @name occurrences with esc(value).
    // Match @ followed by a valid identifier name.
    const mapped = query.replace(/@([A-Za-z_][A-Za-z0-9_]*)/g, (full, name) => {
      const v = args[name];
      const result = esc(v);
      return result;
    });
    return mapped;
  }
  if (Array.isArray(args)) {
    // Positional binding: interpolate ? in order.
    let out = "";
    let qi = 0;
    for (let i = 0; i < query.length; i++) {
      if (query[i] === "?") {
        out += esc(args[qi++]);
      } else {
        out += query[i];
      }
    }
    return out;
  }
  return query;
}

class DbProxy {
  constructor(inner) { this.db = inner; }
  exec(query) {
    return this.db.exec(query);
  }
  all(query, ...bindings) {
    const q = prepare(query, ...bindings);
    const out = [];
    const stmt = this.db.prepare(q);
    while (stmt.step()) {
      const cols = stmt.qb();
      const values = stmt.get();
      const row = {};
      for (let i = 0; i < cols.length; i++) {
        row[cols[i]] = values[i];
      }
      out.push(row);
    }
    stmt.free();
    return out;
  }
  get(query, ...bindings) {
    const q = prepare(query, ...bindings);
    const stmt = this.db.prepare(q);
    let row = null;
    if (stmt.step()) {
      const cols = stmt.qb();
      const values = stmt.get();
      row = {};
      for (let i = 0; i < cols.length; i++) {
        row[cols[i]] = values[i];
      }
    }
    stmt.free();
    return row;
  }
  run(query, ...bindings) {
    const q = prepare(query, ...bindings);
    const stmt = this.db.prepare(q);
    // Execute the statement by stepping through it once (the query already
    // has the values interpolated, so no result rows to read).
    while (stmt.step()) {}
    stmt.free();
  }
  export() {
    return this.db._inner.export();
  }
  prepare(query, ...bindings) {
    // Return a raw SQLite statement (no bindings) that the caller can
    // execute via .run(), .get(), or .all() directly.
    return this.db.prepare(prepare(query, ...bindings));
  }
}

let SQL = null;
let sqlify = null;
const DB_PATH = process.env.PERSONAL_FB_DB_PATH || join(process.cwd(), "personal-fb-bot", "data", "fb.db");
const MAX_DB_SIZE_MB = 256;

let db = null;
let dbLoaded = false;

async function loadSqlJs() {
  if (SQL) return SQL;
  // sql.js ships a deferred module. Awaiting it resolves to an object whose
  // `.default` is the initSqlJs factory function.
  const mod = await import("sql.js/dist/sql-wasm.js");
  const factory = mod.default || mod;
  if (typeof factory !== "function") {
    throw new Error("sql.js: could not resolve the initSqlJs factory from the deferred module.");
  }
  // Calling the factory returns a Promise resolving to the real module that
  // carries the Database class as its `.Database` property.
  const instance = await factory();
  if (!instance || typeof instance.Database !== "function") {
    throw new Error("sql.js: resolved module has no Database class.");
  }
  SQL = instance;
  sqlify = factory;
  return SQL;
}

export async function openDb() {
  if (dbLoaded) return db;
  mkdirSync(join(process.cwd(), "personal-fb-bot", "data"), { recursive: true });
  let data = Buffer.alloc(0);
  if (existsSync(DB_PATH)) {
    data = readFileSync(DB_PATH);
    if (data.length > 256 * 1024 * 1024) {
      console.error(`[db] ${DB_PATH} exceeds 256MB, rebuilding`);
      data = Buffer.alloc(0);
    }
  }
  const sql = await loadSqlJs();

  // sql.js resolves the module as a deferrer whose `.default` is the
  // initSqlJs factory. Calling it returns a Promise that resolves to the
  // module object carrying the Database class as its `.Database` property.
  const buf = data.length ? data : Buffer.alloc(0);
  const inner = new sql.Database(buf);
  dbLoaded = true;
  db = new DbProxy(inner);

  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      fb_access_token TEXT,
      fb_refresh_token TEXT,
      stored_expires_at INTEGER,
      profile_url TEXT,
      avatar_url TEXT,
      last_sync_at INTEGER,
      session_key TEXT UNIQUE,
      session_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      user_agent TEXT,
      ip TEXT,
      logged_in_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      thread_id TEXT,
      sender_id TEXT,
      sender_name TEXT,
      text TEXT,
      type TEXT,
      status TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_messages_account ON messages(account_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(account_id, thread_id);
  `);

  try {
    db.exec("SELECT 1");
  } catch (e) {
    console.error("[db] schema error:", e.message);
    process.exit(1);
  }
  save();
  return db;
}

export function getDb() {
  if (!db) {
    throw new Error("Database not opened. Call openDb() first.");
  }
  return db;
}

export function save() {
  if (!db) return;
  try {
    const buf = db._inner.export();
    const dir = join(process.cwd(), "personal-fb-bot", "data");
    mkdirSync(dir, { recursive: true });
    writeFileSync(DB_PATH, buf);
  } catch (e) {
    console.error("[db] save error:", e.message);
  }
}

export function closeDb() {
  if (db) {
    save();
    db = null;
    dbLoaded = false;
  }
}
