import { put, list, del } from "@vercel/blob";

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const DEFAULT_PREFIX = "bot-config/logs/";

function fmt(args) {
  return args
    .map((a) => {
      if (typeof a === "string") return a;
      try {
        return JSON.stringify(a);
      } catch (err) {
        return String(a);
      }
    })
    .join(" ");
}

export async function writeEntry(prefix, level, msg) {
  if (!TOKEN) return;
  try {
    const t = Date.now();
    const name =
      prefix +
      String(t).padStart(13, "0") +
      "_" +
      level +
      "_" +
      Math.random().toString(36).slice(2, 8) +
      ".json";
    await put(name, JSON.stringify({ t, level, msg: String(msg).slice(0, 2000) }), {
      token: TOKEN,
      access: "public",
      contentType: "application/json",
    });
  } catch (err) {
    // logging must never break the app
  }
}

export function log(level, ...args) {
  const msg = fmt(args);
  const line = "[" + level + "] " + msg;
  if (level === "error") console.error(line);
  else console.log(line);
  return writeEntry(DEFAULT_PREFIX, level, msg);
}

export async function fetchEntries(opts) {
  const o = opts || {};
  const prefix = o.prefix || DEFAULT_PREFIX;
  const since = Number(o.since) || 0;
  const limit = Math.min(Math.max(Number(o.limit) || 200, 1), 400);
  if (!TOKEN) return { entries: [] };

  const items = [];
  let cursor;
  do {
    const page = await list({ prefix, token: TOKEN, limit: 1000, cursor });
    for (const b of page.blobs || []) items.push(b);
    cursor = page.hasMore ? page.cursor : null;
  } while (cursor);
  items.sort((a, b) => (a.pathname < b.pathname ? -1 : a.pathname > b.pathname ? 1 : 0));

  const recent = items.filter((b) => {
    const ts = parseInt(b.pathname.split("/").pop(), 10);
    return !since || ts >= since;
  });
  const picked = recent.slice(-limit);

  const entries = [];
  for (const b of picked) {
    let e = null;
    try {
      const res = await fetch(b.url, { cache: "no-store" });
      if (res.ok) e = await res.json();
    } catch (err) {
      e = null;
    }
    if (e && typeof e.t === "number") {
      entries.push({ t: e.t, level: e.level || "info", msg: e.msg || "" });
    } else {
      break;
    }
  }

  if (items.length > 650 && !o.noPrune) {
    const excess = items.slice(0, items.length - 550);
    del(
      excess.map((b) => b.url),
      { token: TOKEN }
    ).catch(() => {});
  }

  return { entries, total: items.length };
}

export async function clearAll(opts) {
  const prefix = (opts && opts.prefix) || DEFAULT_PREFIX;
  if (!TOKEN) return { ok: true, deleted: 0 };
  const urls = [];
  let cursor;
  do {
    const page = await list({ prefix, token: TOKEN, limit: 1000, cursor });
    for (const b of page.blobs || []) urls.push(b.url);
    cursor = page.hasMore ? page.cursor : null;
  } while (cursor);
  for (let i = 0; i < urls.length; i += 100) {
    try {
      await del(urls.slice(i, i + 100), { token: TOKEN });
    } catch (err) {}
  }
  return { ok: true, deleted: urls.length };
}
