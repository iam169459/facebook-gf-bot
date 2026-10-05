#!/usr/bin/env node
// personal-fb-bot/cli.js
//
// Personal FB Bot CLI — interactive terminal interface.
//
// Usage:
//   node cli.js                 # interactive TUI
//   node cli.js setup           # one-time setup (env, data dir, Playwright)
//   node cli.js login           # connect your Facebook account
//   node cli.js connect         # same as login
//   node cli.js messages [filter]  # list inbox
//   node cli.js send <to> <text>      # send a message
//   node cli.js read <id>             # mark message as read
//   node cli.js react <id> <emoji>     # react to a message
//   node cli.js edit <id> <text>       # edit a message
//   node cli.js ai "message"           # ask the AI helper
//   node cli.js logs [--limit N]       # show automation logs
//   node cli.js account [id]           # show account details
//   node cli.js sessions               # list active sessions
//   node cli.js status                 # server health

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DB_PATH = process.env.PERSONAL_FB_DB_PATH || join(ROOT, "data", "fb.db");
const PORT = process.env.PORT || 8787;
const HOST = process.env.HOST || "0.0.0.0";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "change-me-please-now";
const SESSION_COOKIE = process.env.SESSION_COOKIE || "pfb_session";
const SESSION_TTL = process.env.SESSION_TTL || 2592000;

// ------------------------------------------------------------------
// ASCII banner
// -----------------------------------------------------------------
const BANNER = `
╔══════════════════════════════════════════════════════╗
║   Personal FB Bot  ·  self-hosted FB dashboard        ║
║   Node.js + Express  ·  Playwright  ·  SQL.js         ║
╚══════════════════════════════════════════════════════╝
`;

// ------------------------------------------------------------------
// ASCII footer
// -----------------------------------------------------------------
const FOOTER = `
  Commands: setup · login · connect · messages · send · read · react
            edit · ai · logs · account · sessions · status · help · quit
`;

// ------------------------------------------------------------------
// Help text
// -----------------------------------------------------------------
const HELP = `
Personal FB Bot CLI

Usage: node cli.js <command> [options]

Commands:
  setup      One-time setup: create .env, data dir, install Playwright
  login      Connect your Facebook account (interactive)
  connect    Same as login
  messages [filter]    List inbox messages (optionally filter)
  send <to> <text>     Send a message
  read <id>             Mark a message as read
  react <id> <emoji>    React to a message (❤️ 😂 👍 😮 😢 😡)
  edit <id> <text>      Edit a message
  ai <message>          Ask the AI helper (loads settings from CLI or env)
  logs [--limit N]      Show automation logs
  account [id]          Show account details (or specific account)
  sessions              List active sessions
  status                Show server health
  help                    Show this help
  quit                    Exit

Examples:
  node cli.js setup
  node cli.js login
  node cli.js send "Alice" "Hey, how are you?"
  node cli.js ai "Hey, how's the weather?"
  node cli.js logs --limit 50

Env vars:
  PORT          (default 8787)
  HOST          (default 0.0.0.0)
  ADMIN_TOKEN   (default change-me-please-now)
  PERSONAL_FB_DB_PATH
  PERSONAL_FB_DRIVER
  PERSONAL_FB_HEADLESS
  JWT_SECRET
  SESSION_COOKIE
  SESSION_TTL

Learn more: https://github.com/iam169459/facebook-gf-bot
`;

// ------------------------------------------------------------------
// Strip ANSI colors
// -----------------------------------------------------------------
function strip(ans) {
  return ans.replace(/\u001b\[[0-9;]*m/g, "");
}

// ------------------------------------------------------------------
// Load database
// -----------------------------------------------------------------
let db = null;
let dbLoaded = false;

export async function openDb() {
  if (dbLoaded) return db;
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { mkdirSync } = await import("node:fs");
  const { join } = await import("node:path");
  mkdirSync(join(process.cwd(), "personal-fb-bot", "data"), { recursive: true });
  let data = Buffer.alloc(0);
  const dbPath = process.env.PERSONAL_FB_DB_PATH || join(process.cwd(), "personal-fb-bot", "data", "fb.db");
  if (existsSync(dbPath)) {
    data = readFileSync(dbPath);
  }
  const mod = await import("sql.js/dist/sql-wasm.js");
  const { default: initSqlJs } = mod;
  const SQL = initSqlJs ? (initSqlJs.default || initSqlJs) : mod;
  const instance = SQL ? new SQL() : null;
  const TargetCtor = instance?.Database || mod.Database;
  const inner = new TargetCtor(data);
  dbLoaded = true;
  db = {
    inner,
    exec(query) {
      return this.inner.exec(query);
    },
    all(query, ...bindings) {
      const stmt = this.inner.prepare(query);
      const out = [];
      while (stmt.step()) {
        const cols = stmt.qb();
        const values = stmt.get();
        const row = {};
        for (let i = 0; i < cols.length; i++) {
          row[cols[i]] = values[i];
        }
      }
      return out;
    },
    get(query, ...bindings) {
      const stmt = this.inner.prepare(query);
      let row = null;
      if (stmt.step()) {
        const cols = stmt.qb();
        const values = stmt.get();
        row = {};
        for (let i = 0; i < cols.length; i++) {
          row[cols[i]] = values[i];
        }
      }
      return row;
    },
    run(query, ...bindings) {
      const stmt = this.inner.prepare(query);
      while (stmt.step()) {}
      stmt.free();
    },
  };
  return db;
}

// ------------------------------------------------------------------
// CLI interface
// -----------------------------------------------------------------
export class CLI {
  constructor() {
    this.rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: "personal-fb> ",
    });
    this.history = [];
    this.maxHistory = 100;
    this.running = true;
  }

  async init() {
    console.clear();
    console.log(BANNER);
    console.log(FOOTER);
    this.renderPrompt();
  }

  async renderPrompt() {
    this.rl.prompt();
  }

  async handleCommand(cmd) {
    const parts = cmd.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return;
    const [action, ...args] = parts;
    const lower = action.toLowerCase();

    switch (lower) {
      case "help":
        this.printHelp();
        break;
      case "quit":
      case "exit":
        this.quit();
        break;
      case "setup": {
        await this.runSetup();
        break;
      }
      case "login": {
        await this.runLogin();
        break;
      }
      case "connect": {
        await this.runLogin();
        break;
      }
      case "messages": {
        await this.runMessages(args);
        break;
      }
      case "send": {
        await this.runSend(args);
        break;
      }
      case "read": {
        await this.runRead(args);
        break;
      }
      case "react": {
        await this.runReact(args);
        break;
      }
      case "edit": {
        await this.runEdit(args);
        break;
      }
      case "ai": {
        await this.runAI(args);
        break;
      }
      case "logs": {
        await this.runLogs(args);
        break;
      }
      case "account": {
        await this.runAccount(args);
        break;
      }
      case "sessions": {
        await this.runSessions();
        break;
      }
      case "status": {
        await this.runStatus();
        break;
      }
      default:
        console.log(`  Unknown command: ${cmd}. Type "help" for a list.`);
        break;
    }
  }

  async runSetup() {
    console.log("  One-time setup...");

    // 1. Create data directory
    const { mkdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    const dbDir = join(process.cwd(), "personal-fb-bot", "data");
    mkdirSync(dbDir, { recursive: true });
    console.log("  Created data directory.");

    // 2. Create .env if missing
    const envPath = join(process.cwd(), "personal-fb-bot", ".env");
    if (!existsSync(envPath)) {
      const { writeFileSync } = await import("node:fs");
      const envContent = `PORT=8787
HOST=0.0.0.0
ADMIN_TOKEN=change-me-please-now
NODE_ENV=production
JWT_SECRET=auto-generated-secret
SESSION_COOKIE=pfb_session
SESSION_TTL=2592000
PERSONAL_FB_DB_PATH=${join(process.cwd(), "personal-fb-bot", "data", "fb.db")}
PERSONAL_FB_DRIVER=chromium
PERSONAL_FB_HEADLESS=1
`;
      writeFileSync(envPath, envContent);
      console.log("  Created .env.");
    } else {
      console.log("  .env already exists.");
    }

    // 3. Install Playwright Chromium
    try {
      console.log("  Installing Playwright Chromium...");
      const { execSync } = await import("node:child_process");
      execSync("npx playwright install chromium", { stdio: "inherit" });
      console.log("  Playwright Chromium installed.");
    } catch (e) {
      console.log("  Warning: Playwright install failed (may need GUI libs):");
      console.log("    sudo apt-get install -y libnss3 libnss3-dev libatk1.0-0");
      console.log("    libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0");
      console.log("    libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1");
    }

    console.log("  Setup complete.");
  }

  async runLogin() {
    const { readFileSync, writeFileSync, existsSync } = await import("node:fs");
    const { homedir } = await import("node:os");

    // Load .env if present
    const envPath = join(process.cwd(), "personal-fb-bot", ".env");
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, "utf8");
      for (const line of content.split("\n")) {
        const [key, ...vals] = line.split("=");
        if (key && vals.length) {
          process.env[key.trim()] = vals.join("=").trim();
        }
      }
    }

    console.log("  Enter your personal Facebook e-mail:");
    const email = await this.prompt("  e-mail: ");
    if (!email) {
      console.log("  E-mail is required.");
      return;
    }
    const firstName = email.split("@")[0];
    const accountName = email.split("@")[0];

    console.log("  Connecting to Facebook via Playwright...");
    const { PersonalFBClient } = await import(join(ROOT, "personal-fb-bot", "fbdriver.js"));
    const fb = new PersonalFBClient({
      driver: process.env.PERSONAL_FB_DRIVER || "chromium",
      profileDir: process.env.PERSONAL_FB_PROFILE_DIR,
      headless: process.env.PERSONAL_FB_HEADLESS === "1",
      userAgent: process.env.PERSONAL_FB_USER_AGENT,
    });

    try {
      const result = await fb.login(email);
      console.log(`  Login result: ${JSON.stringify(result)}`);
      console.log("  Account connected.");
    } catch (e) {
      console.log("  Login failed:");
      console.log("    " + e.message);
    } finally {
      await fb.close();
    }
  }

  async runMessages(args) {
    await this.runApi(
      "GET",
      "/api/messages",
      { filter: args.join(" ") },
      (j) => {
        const messages = j.messages || [];
        if (!messages.length) {
          console.log("  No messages yet.");
          return;
        }
        console.log(`  ${messages.length} message(s) found:`);
        console.log("");
        for (const m of messages) {
          const unread = m.status !== "read" ? " (unread)" : "";
          console.log(`    ${m.id}  ${m.sender_id || m.recipient || "?"}  ${m.text || "(empty)"}  ${unread}`);
        }
      }
    );
  }

  async runSend(args) {
    if (args.length < 2) {
      console.log("  Usage: node cli.js send <to> <text>");
      return;
    }
    const recipient = args[0];
    const text = args.slice(1).join(" ");
    await this.runApi(
      "POST",
      "/api/messages",
      { recipient, text },
      (j) => {
        console.log("  Message sent.");
      }
    );
  }

  async runRead(args) {
    if (args.length < 1) {
      console.log("  Usage: node cli.js read <message-id>");
      return;
    }
    await this.runApi(
      "POST",
      `/api/messages/${args[0]}/read`,
      {},
      (j) => {
        console.log("  Marked as read.");
      }
    );
  }

  async runReact(args) {
    if (args.length < 2) {
      console.log("  Usage: node cli.js react <id> <emoji>");
      console.log("  Emojis: ❤️ 😂 👍 😮 😢 😡");
      return;
    }
    const emoji = args[1].toUpperCase();
    await this.runApi(
      "POST",
      "/api/reactions",
      { reactionableId: args[0], emoji },
      (j) => {
        console.log("  Reacted.");
      }
    );
  }

  async runEdit(args) {
    if (args.length < 2) {
      console.log("  Usage: node cli.js edit <id> <text>");
      return;
    }
    const id = args[0];
    const text = args.slice(1).join(" ");
    await this.runApi(
      "POST",
      `/api/messages/${id}/edit`,
      { text },
      (j) => {
        console.log("  Message edited.");
      }
    );
  }

  async runAI(args) {
    const message = args.join(" ");
    if (!message) {
      console.log("  Usage: node cli.js ai <message>");
      return;
    }
    await this.runApi(
      "POST",
      "/api/settings",
      {
        action: "test",
        message,
      },
      (j) => {
        console.log("  AI reply:");
        console.log("  " + (j.reply || "No reply"));
      }
    );
  }

  async runLogs(args) {
    const limit = args.find((a) => a === "--limit" || a === "-l") ? parseInt(args.find((a) => a === "--limit" || a === "-l") + 1, 10) : 0;
    await this.runApi(
      "GET",
      "/api/logs",
      {},
      (j) => {
        const entries = j.entries || [];
        if (!entries.length) {
          console.log("  No logs yet.");
          return;
        }
        console.log(`  ${entries.length} log entry(s):`);
        for (const e of entries) {
          console.log(`    [${new Date(e.t).toISOString()}] ${e.level}: ${e.msg}`);
        }
      }
    );
  }

  async runAccount(args) {
    const id = args[0] || null;
    await this.runApi(
      "GET",
      "/api/account",
      {},
      (j) => {
        const acc = j.account;
        if (!acc) {
          console.log("  No account connected.");
          return;
        }
        console.log(`  Account: ${acc.name || acc.id}`);
        console.log(`  Email: ${acc.email || "—"}`);
        console.log(`  Profile: ${acc.profile_url || acc.avatar_url || "—"}`);
      }
    );
  }

  async runSessions() {
    await this.runApi(
      "GET",
      "/api/sessions",
      {},
      (j) => {
        const sessions = j.sessions || [];
        if (!sessions.length) {
          console.log("  No active sessions.");
          return;
        }
        console.log(`  ${sessions.length} active session(s):`);
        for (const s of sessions) {
          console.log(`    ${s.id}  ${s.user_agent || "unknown"}  ${new Date(s.logged_in_at).toISOString()}`);
        }
      }
    );
  }

  async runStatus() {
    await this.runApi(
      "GET",
      "/api/health",
      {},
      (j) => {
        console.log(`  Server: ${j.ok ? "ok" : "error"}`);
        console.log(`  Now: ${new Date(j.now).toISOString()}`);
      }
    );
  }

  // ---- API helpers -------------------------------------------------------------

  async runApi(method, path, body, successCb) {
    const { fetch } = await import("node:fetch");
    const headers = { "Content-Type": "application/json" };
    const opts = { method, headers };
    if (body) {
      opts.body = JSON.stringify(body);
    }
    try {
      const res = await fetch(`http://localhost:${process.env.PORT || 8787}${path}`, opts);
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.log(`  Error ${res.status}: ${j.error || res.statusText}`);
        return;
      }
      if (successCb) successCb(j);
    } catch (e) {
      console.log(`  API request failed: ${e.message}`);
    }
  }

  // ---- Help / prompt -----------------------------------------------------------

  printHelp() {
    console.log(HELP);
  }

  async prompt(question) {
    return new Promise((resolve) => {
      this.rl.question(question, (answer) => {
        this.history.push(answer);
        if (this.history.length > this.maxHistory) {
          this.history.shift();
        }
        resolve(answer);
      });
    });
  }

  // ---- Lifecycle ---------------------------------------------------------------

  quit() {
    this.running = false;
    this.rl.close();
    process.exit(0);
  }

  async start() {
    this.rl.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      this.history.push(trimmed);
      if (this.history.length > this.maxHistory) {
        this.history.shift();
      }
      this.handleCommand(trimmed);
      this.renderPrompt();
    });

    this.rl.on("close", () => {
      console.log("\n  Goodbye!");
      process.exit(0);
    });

    this.rl.on("SIGINT", () => {
      console.log("\n  Interrupted. Type 'quit' to exit.");
      this.renderPrompt();
    });

    this.init();
  }
}

// ------------------------------------------------------------------
// Main entry point
// -----------------------------------------------------------------
function main() {
  const args = process.argv.slice(2);
  const cli = new CLI();

  if (args.length === 0) {
    // Interactive mode
    cli.start();
    return;
  }

  const [cmd, ...cmdArgs] = args;
  const cmdLower = cmd.toLowerCase();

  // One-time command mode
  switch (cmdLower) {
    case "setup": {
      cli.runSetup().then(() => {
        console.log("  Setup complete.");
        process.exit(0);
      });
      break;
    }
    case "login":
    case "connect":
      cli.runLogin().then(() => {
        process.exit(0);
      });
      break;
    case "messages": {
      cli.runMessages(cmdArgs).then(() => process.exit(0));
      break;
    }
    case "send": {
      cli.runSend(cmdArgs).then(() => process.exit(0));
      break;
    }
    case "read": {
      cli.runRead(cmdArgs).then(() => process.exit(0));
      break;
    }
    case "react": {
      cli.runReact(cmdArgs).then(() => process.exit(0));
      break;
    }
    case "edit": {
      cli.runEdit(cmdArgs).then(() => process.exit(0));
      break;
    }
    case "ai": {
      cli.runAI(cmdArgs).then(() => process.exit(0));
      break;
    }
    case "logs": {
      cli.runLogs(cmdArgs).then(() => process.exit(0));
      break;
    }
    case "account": {
      cli.runAccount(cmdArgs).then(() => process.exit(0));
      break;
    }
    case "sessions": {
      cli.runSessions().then(() => process.exit(0));
      break;
    }
    case "status": {
      cli.runStatus().then(() => process.exit(0));
      break;
    }
    case "help":
    case "--help":
    case "-h": {
      console.log(HELP);
      process.exit(0);
    }
    default: {
      console.log(HELP);
      process.exit(0);
    }
  }
}

// Skip CLI if this module is imported
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}


