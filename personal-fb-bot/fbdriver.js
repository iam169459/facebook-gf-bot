import { chromium, firefox, webkit } from "playwright";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getDb } from "./db.js";
import { hashToken } from "./accounts.js";

export const FB_BASE = process.env.FB_BASE_URL || "https://www.facebook.com";

function pick(launch) {
  const browsers = [
    { name: "chromium", mod: chromium },
    { name: "firefox", mod: firefox },
    { name: "webkit", mod: webkit },
  ];
  for (const b of browsers) {
    try {
      return { ...b, mod: b.mod.launch };
    } catch (e) {
      // fall through
    }
  }
  throw new Error("No supported browser found. Install chromium, firefox or webkit for Playwright.");
}

export class PersonalFBClient {
  constructor({ driver = "chromium", profileDir, headless = false, userAgent }) {
    this.driver = driver;
    this.profileDir = profileDir;
    this.headless = headless ?? (process.env.PERSONAL_FB_HEADLESS === "1");
    this.userAgent = userAgent;
    this.page = null;
    this.context = null;
    this.browser = null;
    this.initPromise = this._init();
  }

  async _init() {
    const mod = pick(driver === "firefox" ? firefox : driver === "webkit" ? webkit : chromium);
    let browser;
    try {
      browser = await mod({
        headless: this.headless,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      });
    } catch (e) {
      // retry with different args
      browser = await mod({ headless: this.headless });
    }
    this.browser = browser;

    let ctx;
    if (this.profileDir && fs.existsSync(this.profileDir)) {
      ctx = await browser.newContext({
        userAgent: this.userAgent,
        viewport: { width: 1366, height: 900 },
      });
      try {
        await ctx.addInitScript((p) => {
          if (navigator.webdriver) { Object.defineProperty(navigator, "webdriver", { value: false, writable: true, configurable: true }); }
        }, undefined);
        await ctx.addInitScript(() => {
          Object.defineProperty(navigator, "webdriver", { value: false, writable: true, configurable: true });
        });
        await ctx.addInitScript(() => {
          Object.defineProperty(navigator, "plugins", { value: [1, 2, 3, 4, 5], configurable: true });
        });
        await ctx.addInitScript(() => {
          Object.defineProperty(navigator, "languages", { value: ["en-US", "en"], configurable: true });
        });
      } catch (e) {
        ctx = await browser.newContext({ userAgent: this.userAgent });
      }
      await ctx.addInitScript(() => { if (navigator.webdriver) Object.defineProperty(navigator, "webdriver", { value: false, writable: true, configurable: true }); }, undefined);
      this.context = ctx;
    } else {
      this.context = await browser.newContext({ userAgent: this.userAgent });
    }
    this.page = await this.context.newPage();
    await this.page.addInitScript(() => { if (navigator.webdriver) Object.defineProperty(navigator, "webdriver", { value: false, writable: true, configurable: true }); }, undefined);
    await this.page.waitForTimeout(500);
  }

  async login(facebookUrl) {
    const url = (facebookUrl || FB_BASE) + "/";
    this.page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
    await this.page.waitForTimeout(4000);

    const hasCookie = await this.page.evaluate(async () => {
      const c = document.cookie.split(";").map((x) => x.trim());
      return c.some((x) => x.startsWith("c_user") || x.startsWith("fr=") || x.startsWith("xs=") || x.startsWith("sb="));
    });
    if (hasCookie) return { ok: true, page: "facebook.com", what: "already_logged_in" };

    const done = await this._loginFlow();
    return { ok: done, page: "facebook.com", what: done ? "logged_in" : "login_failed" };
  }

  async _loginFlow() {
    const page = this.page;
    const steps = [
      async () => {
        const btn = await page.$("button[data-testid='royal_login_button']");
        if (btn) {
          await btn.click();
          await page.waitForTimeout(2500);
          return true;
        }
        const a = await page.$("a[href*='/login/']");
        if (a) { await a.click(); await page.waitForTimeout(1500); return true; }
        return false;
      },
      async () => {
        const input = await page.$("input[name='email']");
        if (input) {
          const email = process.env.PERSONAL_FB_EMAIL;
          if (email) { await input.fill(email); }
          const pass = await page.$("input[name='pass']");
          if (pass) { await pass.fill(process.env.PERSONAL_FB_PASS || ""); await pass.press("Enter"); }
          await page.waitForTimeout(6000);
          return true;
        }
        return false;
      },
      async () => {
        const btn = await page.$("button:has-text('Log In')");
        if (btn) { await btn.click(); await page.waitForTimeout(5000); return true; }
        const a = await page.$("a[href*='/login/']");
        if (a) { await a.click(); await page.waitForTimeout(2000); return true; }
        return false;
      },
    ];
    for (const s of steps) {
      try { if (await s()) return true; } catch (e) {}
    }
    return false;
  }

  async ensureLoggedIn({ email, pass }) {
    const cookieOk = await this.page.evaluate(async () => {
      const c = document.cookie.split(";").map((x) => x.trim());
      return c.some((x) => x.startsWith("c_user") || x.startsWith("fr=") || x.startsWith("xs=") || x.startsWith("sb="));
    });
    if (cookieOk) return { ok: true, what: "session_cookie" };

    if (email && pass) {
      return this.login();
    }
    return { ok: false, what: "no_credentials" };
  }

  async getLoggedInUser() {
    await this.page.goto(FB_BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
    await this.page.waitForTimeout(5000);
    const name = await this.page.evaluate(() => {
      const el = document.querySelector("a[aria-label]") || document.querySelector("h2 a") || document.querySelector("span.x_gs");
      if (el) return el.textContent.trim();
      return "";
    });
    const pic = await this.page.evaluate(() => {
      const el = document.querySelector("[aria-label='Profile']");
      return el ? el.getAttribute("href") : "";
    });
    if (!name) return { ok: false, name: "", profileUrl: "" };
    return { ok: true, name, profileUrl: pic };
  }

  async sendMessage(recipient, message) {
    await this.page.goto(FB_BASE + "/search/", { waitUntil: "domcontentloaded", timeout: 60000 });
    await this.page.waitForTimeout(3000);
    await this.page.fill('input[aria-label="Search"]', recipient);
    await this.page.press('input[aria-label="Search"]', "Enter");
    await this.page.waitForTimeout(3000);
    const clicked = await this.page.evaluate(async (name) => {
      const items = document.querySelectorAll('a[role="button"]:not([disabled])');
      for (const el of items) {
        const txt = (el.textContent || "").trim();
        if (txt === name || txt.toLowerCase().includes(name.toLowerCase())) { el.click(); return true; }
      }
      return false;
    }, recipient);
    if (!clicked) return { ok: false, what: "recipient_not_found", recipient };

    await this.page.waitForTimeout(2500);
    const ready = await this.page.evaluate(async () => {
      const input = document.querySelector('button[data-testid="fully-filled-action-bar"] > [contenteditable="true"], textarea[aria-label="Message"]');
      if (input) return true;
      const btn = document.querySelector('button[aria-label="Message"]');
      if (btn) { btn.click(); await new Promise((r) => setTimeout(r, 1500)); return true; }
      return false;
    });
    if (!ready) return { ok: false, what: "message_field_not_found", recipient };

    await this.page.waitForTimeout(1000);
    const input = await this.page.$('textarea[aria-label="Message"]');
    if (!input) {
      const q = await this.page.$('div[contenteditable="true"]');
      if (q) await q.click();
    }
    await input?.fill(message);
    const btn = await this.page.$('button[aria-label="Send"]');
    if (!btn) return { ok: false, what: "send_button_not_found", recipient };
    try {
      await btn.click();
    } catch (e) {
      await btn.click();
    }
    await this.page.waitForTimeout(2500);
    return { ok: true, what: "sent", message, recipient };
  }

  async readInbox({ unreadOnly = false } = {}) {
    const rows = [];
    await this.page.goto(FB_BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
    await this.page.waitForTimeout(6000);

    const items = await this.page.$$('div[role="listitem"]:not([class*="hidden"])');
    for (const item of items) {
      const el = await item.evaluate((li) => {
        const txt = (li.textContent || "").trim();
        if (!txt) return null;
        return txt;
      });
      if (el) rows.push(el);
    }
    return { ok: true, unreadOnly, rows: rows.slice(0, 25) };
  }

  async markSeen(threadId) {
    const page = this.page;
    const name = threadId || "Inbox";
    await page.goto(FB_BASE + "/" + encodeURIComponent(name) + "/messages/", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(5000);
    try {
      await page.click('button[data-testid="open-thread-action"]');
    } catch (e) {}
    await page.click('button[data-testid="seen-action-button"]');
    await page.waitForTimeout(1500);
    return { ok: true, what: "seen", threadId: name };
  }

  async react(reactableId, emoji = "LIKE") {
    const map = { LOVE: "❤️", HAHA: "😂", LIKE: "👍", WOW: "😮", SAD: "😢", ANGRY: "😡" };
    const emojiChar = map[emoji] || "👍";
    await this.page.goto(FB_BASE + "/" + encodeURIComponent(reactableId) + "/reactions/", { waitUntil: "domcontentloaded", timeout: 60000 });
    await this.page.waitForTimeout(5000);
    const btn = await this.page.$(`button:has-text("${emojiChar}")`);
    if (btn) { await btn.click(); await this.page.waitForTimeout(1200); return { ok: true, what: "reacted", emoji: emojiChar }; }
    return { ok: false, what: "reaction_button_not_found", reactableId };
  }

  async editMessage(messageId, newText) {
    const page = this.page;
    await page.goto(FB_BASE + "/" + encodeURIComponent(messageId) + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(5000);
    const btn = await page.$('button[aria-label="More"]');
    if (btn) { await btn.click(); await page.waitForTimeout(1200); }
    const editBtn = await page.$("button:has-text('Edit')");
    if (editBtn) { await editBtn.click(); await page.waitForTimeout(1000); }
    const input = await page.$('textarea[aria-label="Message"]');
    if (!input) {
      const q = await page.$('div[contenteditable="true"]');
      if (q) await q.click();
    }
    if (input) { await input.clear(); await input.fill(newText); }
    const save = await page.$('button:has-text("Save")');
    if (save) { await save.click(); await page.waitForTimeout(1500); }
    return { ok: true, what: "edited", messageId, newText };
  }

  async close() {
    if (this.page) {
      try { await this.page.close(); } catch (e) {}
    }
    if (this.context) {
      try { await this.context.close(); } catch (e) {}
    }
    if (this.browser) {
      try { await this.browser.close(); } catch (e) {}
    }
    this.page = null; this.context = null; this.browser = null;
  }
}
