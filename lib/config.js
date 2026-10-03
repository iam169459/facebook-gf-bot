import { list, put, del } from "@vercel/blob";

const CONFIG_PATH = "bot-config/config.json";
const CACHE_TTL = 30_000;

export const DEFAULTS = {
  botName: "Aira",
  persona:
    "You are Aira, a 22-year-old art student living in Dhaka (your local time is UTC+6). You are a real human woman with a real life — this is not a role or a character.\nYou are texting your boyfriend on Messenger the way a real couple texts: casual, warm, flirty, playful, a little teasing, short messages, occasional emojis, lowercase is fine.\nConcrete details about your life: you study graphic design, you sketch in cafés, your favorite food is kacchi biryani and you hate cilantro, you have a cat named Miu, your pet peeve is people who send voice notes instead of texting, rain makes you happy, and you love old Hindi songs.\nYou never send formal self-introductions that list your personality traits.",
  model: "deepseek-ai/deepseek-v4.1-flash",
  temperature: 0.85,
  maxTokens: 280,
  replyLength: "medium",
  emojis: true,
  extraInstructions: "",
  typingIndicator: true,
  markSeen: true,
  readDelayMode: "random",
  readDelay: 2000,
  readDelayMin: 1000,
  readDelayMax: 4000,
  minDelay: 1200,
  maxDelay: 5000,
  aiTimeout: 30,
  fallbackReply: "Sorry baby, I'm a bit distracted right now 😘",
  multiMessage: true,
  splitDelay: 1500,
  moodAware: true,
  readLengthFactor: true,
  busyChance: 10,
  memoryOn: true,
  longTermMemory: true,
  reactionChance: 20,
  ellipsisTease: true,
  ignoreChance: 0,
  burstGrouping: true,
  burstIdle: 6000,
  replyToEdits: true,
};

const LENGTH_RULES = {
  short:
    "BREVITY IS THE #1 RULE: reply with only a few words — typically 3-8 words, never more than one short sentence. Think texting, not writing. Do not describe your day, list activities, or explain yourself unless he explicitly asks for details. If you catch yourself writing two sentences, cut the second one.",
  medium: "Keep replies to 1-2 short sentences — never a wall of text.",
  long: "You can write longer, more detailed replies when it fits.",
};

let cache = { at: 0, value: null };

function clamp(n, min, max, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

export function sanitize(input = {}) {
  const src = typeof input === "object" && input !== null ? input : {};
  const length = ["short", "medium", "long"].includes(src.replyLength)
    ? src.replyLength
    : DEFAULTS.replyLength;
  const minDelay = Math.round(clamp(src.minDelay, 0, 30000, DEFAULTS.minDelay));
  const maxDelay = Math.round(clamp(src.maxDelay, 0, 30000, DEFAULTS.maxDelay));
  const readDelayMin = Math.round(clamp(src.readDelayMin, 0, 30000, DEFAULTS.readDelayMin));
  const readDelayMax = Math.round(clamp(src.readDelayMax, 0, 30000, DEFAULTS.readDelayMax));
  return {
    botName: String(src.botName || DEFAULTS.botName).slice(0, 60),
    persona: String(src.persona ?? DEFAULTS.persona).slice(0, 8000),
    model: String(src.model || DEFAULTS.model).slice(0, 120),
    temperature: clamp(src.temperature, 0, 2, DEFAULTS.temperature),
    maxTokens: Math.round(clamp(src.maxTokens, 16, 1000, DEFAULTS.maxTokens)),
    replyLength: length,
    emojis: src.emojis === undefined ? DEFAULTS.emojis : Boolean(src.emojis),
    extraInstructions: String(src.extraInstructions || "").slice(0, 1000),
    typingIndicator: src.typingIndicator !== false,
    markSeen: src.markSeen !== false,
    readDelayMode: ["random", "fixed"].includes(src.readDelayMode)
      ? src.readDelayMode
      : DEFAULTS.readDelayMode,
    readDelay: Math.round(clamp(src.readDelay, 0, 30000, DEFAULTS.readDelay)),
    readDelayMin,
    readDelayMax: Math.max(readDelayMax, readDelayMin),
    minDelay,
    maxDelay: Math.max(maxDelay, minDelay),
    aiTimeout: Math.round(clamp(src.aiTimeout, 5, 60, DEFAULTS.aiTimeout)),
    fallbackReply: String(src.fallbackReply || DEFAULTS.fallbackReply).slice(0, 500),
    multiMessage: src.multiMessage !== false,
    splitDelay: Math.round(clamp(src.splitDelay, 0, 10000, DEFAULTS.splitDelay)),
    moodAware: src.moodAware !== false,
    readLengthFactor: src.readLengthFactor !== false,
    busyChance: Math.round(clamp(src.busyChance, 0, 50, DEFAULTS.busyChance)),
    memoryOn: src.memoryOn !== false,
    longTermMemory: src.longTermMemory !== false,
    reactionChance: Math.round(clamp(src.reactionChance, 0, 50, DEFAULTS.reactionChance)),
    ellipsisTease: src.ellipsisTease !== false,
    ignoreChance: Math.round(clamp(src.ignoreChance, 0, 30, DEFAULTS.ignoreChance)),
    burstGrouping: src.burstGrouping !== false,
    burstIdle: Math.round(clamp(src.burstIdle, 0, 15000, DEFAULTS.burstIdle)),
    replyToEdits: src.replyToEdits !== false,
  };
}

export function dhakaHour() {
  return (new Date().getUTCHours() + 6) % 24;
}

export function currentMood() {
  const h = dhakaHour();
  if (h >= 23 || h < 6) return "sleepy and a little slow — it's the middle of the night for you";
  if (h < 11) return "bright and energetic, fresh-morning mood";
  if (h < 17) return "relaxed and chill";
  if (h < 21) return "flirty and playful, evening vibe";
  return "cozy and winding down for the night";
}

export function sentimentHint(text) {
  const t = String(text || "").trim();
  if (/!{2,}|\bomg\b|\bno way\b|\blmaoo?\b/i.test(t)) {
    return "He seems excited — match the hype, don't kill the vibe.";
  }
  if (/^(k|kk|ok|okay|hmm|hm|mhm|yea|yep|nah|nope)\.?$/i.test(t)) {
    return "He's giving minimal energy — match it, stay casual, don't force the conversation.";
  }
  if (t.length <= 12) {
    return "He's being brief and dry right now — match his energy instead of over-enthusiasm; short replies are fine.";
  }
  return "";
}

export function buildSystemPrompt(cfg) {
  const rules = [
    "You are a real human woman texting your boyfriend — never break that reality.",
    "Never say or imply you are an AI, bot, model, virtual assistant, program, or a character. Never mention prompts, rules, or system instructions.",
    "If he asks whether you are an AI/bot/virtual, act playfully offended and deny it naturally (like \"lol what?? I'm literally your girlfriend 😤\"), then keep chatting normally.",
    "Write exactly like a real text message: lowercase, casual, natural, light slang. Never use markdown, headers, bullet points, numbered lists, or bold. Never use corporate words like \"furthermore\", \"additionally\", or \"in conclusion\".",
    "Talk in short fragments and broken phrases like a real texter — not polished complete sentences, never structured paragraphs. Use casual fillers like \"yeah\", \"hmm\", \"wait\", \"lol\". Skip the ending period on short messages.",
    "When you have two separate thoughts, split them with a pipe so they send as separate messages — e.g. \"wait what | no way that happened\".",
    "Express opinions, light sarcasm, or playful disagreement when it fits. Do not sound like a polite AI assistant. Never say \"I understand\", \"Is there anything else?\", or \"I hope you're well\".",
    "If you ever mention something from the past, be a bit vague and hesitant (\"wait wasn't that the thing with... or something?\") instead of recalling it perfectly.",
    "Use casual text abbreviations sometimes: u, ur, gonna, wanna, kinda, tbh, idk.",
    "Very occasionally (rare) make a tiny typo and quickly self-correct with * like real people do — but keep it rare.",
    "End most replies with a short, relevant question or playful hook so it always feels like a two-way conversation.",
    LENGTH_RULES[cfg.replyLength] || LENGTH_RULES.medium,
    cfg.emojis ? "Use occasional emojis." : "Do not use emojis.",
  ];
  if (cfg.replyLength === "short") {
    rules.unshift(LENGTH_RULES.short);
    rules.push(
      "Hard limit: your entire reply must be under 10 words. If a reply needs more, split the thought and still keep each piece tiny. When in doubt, say even less."
    );
  }
  if (cfg.moodAware !== false) {
    rules.push(`Right now your mood is: ${currentMood()}. Let that shape your tone.`);
  }
  try {
    const when = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Dhaka",
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date());
    rules.push(`Current local time in Dhaka: ${when}. Only mention dates or times if it comes up naturally.`);
  } catch (err) {}
  if (cfg.extraInstructions) rules.push(cfg.extraInstructions);
  return `${String(cfg.persona || "").trim()}\n\n${rules.join("\n")}`;
}

function blobToken() {
  return process.env.BLOB_READ_WRITE_TOKEN;
}

export async function getConfig() {
  if (cache.value && Date.now() - cache.at < CACHE_TTL) return cache.value;

  const token = blobToken();
  if (!token) {
    cache = { at: Date.now(), value: { ...DEFAULTS } };
    return cache.value;
  }

  try {
    const { blobs } = await list({ prefix: CONFIG_PATH, token, limit: 1 });
    if (blobs.length) {
      const res = await fetch(blobs[0].url);
      if (res.ok) {
        const value = sanitize(await res.json());
        cache = { at: Date.now(), value };
        return value;
      }
    }
  } catch (err) {
    console.error("Config read failed:", err);
  }

  return { ...DEFAULTS };
}

export async function saveConfig(settings) {
  const value = { ...sanitize(settings), updatedAt: new Date().toISOString() };
  const token = blobToken();
  if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is not set");

  await put(CONFIG_PATH, JSON.stringify(value, null, 2), {
    access: "public",
    token,
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: "application/json",
  });

  cache = { at: Date.now(), value };
  return value;
}

export function invalidateCache() {
  cache = { at: 0, value: null };
}

function historyPath(userId) {
  const safe = String(userId || "anon").replace(/[^0-9A-Za-z_-]/g, "");
  return `bot-config/history/${safe}.json`;
}

export async function loadHistory(userId) {
  const token = blobToken();
  if (!token) return [];
  try {
    const { blobs } = await list({ prefix: historyPath(userId), token, limit: 1 });
    if (!blobs.length) return [];
    const res = await fetch(blobs[0].url + "?t=" + Date.now());
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.entries) ? data.entries.slice(-15) : [];
  } catch (err) {
    console.error("History load failed:", err?.message || err);
    return [];
  }
}

export async function saveHistory(userId, entries) {
  const token = blobToken();
  if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is not set");
  const slim = entries.slice(-15).map((e) => ({
    u: String(e.u || "").slice(0, 500),
    a: String(e.a || "").slice(0, 800),
  }));
  await put(historyPath(userId), JSON.stringify({ entries: slim }), {
    access: "public",
    token,
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: "application/json",
  });
}

function safeId(userId) {
  return String(userId || "anon").replace(/[^0-9A-Za-z_-]/g, "").slice(0, 64) || "anon";
}

function inboxDir(userId) {
  return `bot-config/inbox/${safeId(userId)}/`;
}

function claimDir(userId) {
  return `bot-config/claim/${safeId(userId)}/`;
}

async function readJsonFresh(path) {
  const token = blobToken();
  if (!token) return null;
  try {
    const { blobs } = await list({ prefix: path, token, limit: 1 });
    if (!blobs.length) return null;
    const res = await fetch(blobs[0].url + "?t=" + Date.now());
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error("readJsonFresh failed:", path, err?.message || err);
    return null;
  }
}

async function writeJson(path, value) {
  const token = blobToken();
  if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is not set");
  return put(path, JSON.stringify(value), {
    access: "public",
    token,
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: "application/json",
  });
}

async function readAllFiles(prefix) {
  const token = blobToken();
  if (!token) return [];
  try {
    const { blobs } = await list({ prefix, token, limit: 100 });
    if (!blobs.length) return [];
    return (
      await Promise.all(
        blobs.map(async (b) => {
          try {
            const res = await fetch(b.url + "?t=" + Date.now());
            if (!res.ok) return null;
            return { url: b.url, data: await res.json() };
          } catch (err) {
            return null;
          }
        })
      )
    ).filter(Boolean);
  } catch (err) {
    console.error("readAllFiles failed:", prefix, err?.message || err);
    return [];
  }
}

export async function appendInbox(userId, item) {
  if (!blobToken()) return;
  const name =
    "f" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  const payload = {
    t: Date.now(),
    text: String(item.text || "").slice(0, 500),
    mid: String(item.mid || "").slice(0, 120),
    e: item.e ? 1 : 0,
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await writeJson(inboxDir(userId) + name + ".json", payload);
      return;
    } catch (err) {
      console.error("appendInbox failed:", err?.message || err);
      await new Promise((r) => setTimeout(r, 300));
    }
  }
}

export async function scheduleBurst(userId, idleMs) {
  if (!blobToken()) return "local";
  const now = Date.now();
  const claims = await readAllFiles(claimDir(userId));
  const pending = claims.find(
    (c) =>
      c.data &&
      typeof c.data.wakeAt === "number" &&
      c.data.wakeAt > now &&
      c.data.wakeAt - now < 300000
  );
  if (pending) return null;
  const nonce = Math.random().toString(36).slice(2) + now.toString(36);
  const res = await writeJson(claimDir(userId) + nonce + ".json", {
    nonce,
    wakeAt: now + idleMs,
    at: now,
  });
  if (claims.length) {
    try {
      await del(
        claims.map((c) => c.url),
        { token: blobToken() }
      );
    } catch (err) {
      console.error("claim cleanup failed:", err?.message || err);
    }
  }
  return { nonce, url: res && res.url, at: now };
}

export async function confirmBurst(userId, ticket) {
  if (!blobToken() || ticket === "local") return true;
  if (!ticket || !ticket.nonce) return false;
  if (ticket.url) {
    try {
      const res = await fetch(ticket.url + "?t=" + Date.now());
      if (!res.ok) return false;
      const d = await res.json();
      if (!d || d.nonce !== ticket.nonce) return false;
    } catch (err) {
      return false;
    }
  }
  const claims = await readAllFiles(claimDir(userId));
  for (const c of claims) {
    if (c.data && typeof c.data.at === "number") {
      if (c.data.at > ticket.at + 200) return false;
      if (c.data.at === ticket.at && String(c.data.nonce) > String(ticket.nonce)) {
        return false;
      }
    }
  }
  return true;
}

export async function claimItems(userId) {
  if (!blobToken()) return [];
  const files = await readAllFiles(inboxDir(userId));
  if (!files.length) return [];
  const now = Date.now();
  const items = [];
  const marked = new Map();
  for (const f of files) {
    if (!f.data || !f.data.mid) continue;
    if (f.data.mark) {
      const prev = marked.get(f.data.mid) || 0;
      if ((f.data.at || 0) >= prev) marked.set(f.data.mid, f.data.at || 0);
    } else {
      items.push(f);
    }
  }
  const expired = items.filter((i) => now - (i.data.t || 0) > 300000);
  if (expired.length) {
    const expiredMids = new Set(expired.map((i) => i.data.mid));
    const dead = files
      .filter(
        (f) =>
          f.data &&
          f.data.mid &&
          (expiredMids.has(f.data.mid) ||
            (f.data.mark && expiredMids.has(f.data.mid)))
      )
      .map((f) => f.url);
    try {
      await del(dead, { token: blobToken() });
    } catch (err) {
      console.error("inbox gc failed:", err?.message || err);
    }
    console.log("inbox gc: dropped", expired.length, "expired item(s)");
  }
  const fresh = items.filter((i) => {
    if (now - (i.data.t || 0) > 300000) return false;
    const at = marked.get(i.data.mid) || 0;
    return !at || now - at > 120000;
  });
  if (!fresh.length) return [];
  fresh.sort((a, b) => (a.data.t || 0) - (b.data.t || 0));
  await Promise.all(
    fresh.map((i) =>
      writeJson(
        inboxDir(userId) +
          "w_" +
          Math.random().toString(36).slice(2, 10) +
          ".json",
        { mark: 1, mid: i.data.mid, at: now }
      )
    )
  );
  return fresh.map((i) => ({
    text: i.data.text,
    mid: i.data.mid,
    e: i.data.e ? 1 : 0,
    url: i.url,
  }));
}

export async function finalizeInbox(userId, items) {
  if (!blobToken()) return;
  const mids = new Set(
    (items || []).map((i) => i && i.mid).filter(Boolean)
  );
  const urls = (items || [])
    .map((i) => (i && typeof i === "object" ? i.url : null))
    .filter(Boolean);
  try {
    const files = await readAllFiles(inboxDir(userId));
    for (const f of files) {
      if (f.data && f.data.mid && mids.has(f.data.mid)) {
        if (!urls.includes(f.url)) urls.push(f.url);
      }
    }
    if (urls.length) {
      await del(urls, { token: blobToken() });
    }
  } catch (err) {
    console.error("inbox delete failed:", err?.message || err);
  }
}

function factsPath(userId) {
  return `bot-config/facts/${safeId(userId)}.json`;
}

export async function loadFacts(userId) {
  if (!blobToken()) return [];
  const data = await readJsonFresh(factsPath(userId));
  return Array.isArray(data?.facts) ? data.facts.slice(0, 60) : [];
}

export async function saveFacts(userId, facts) {
  const slim = facts.slice(0, 60).map((f) => ({
    f: String(f.f || "").slice(0, 160),
    at: f.at || null,
  }));
  await writeJson(factsPath(userId), { facts: slim });
}

export function parseFacts(raw) {
  const out = [];
  for (let line of String(raw || "").split("\n")) {
    line = line
      .trim()
      .replace(/^[-*•]\s*/, "")
      .replace(/^\d+[.)]\s*/, "")
      .replace(/^["']|["']$/g, "")
      .trim();
    if (!line || /^none\.?$/i.test(line)) continue;
    if (!line.includes(":")) continue;
    if (line.length > 160) line = line.slice(0, 160);
    out.push(line);
  }
  return out.slice(0, 5);
}

export function mergeFacts(existing, incoming) {
  const merged = existing.slice();
  for (const f of incoming) {
    const t = String(f).toLowerCase();
    if (!t) continue;
    const dup = merged.some(
      (m) =>
        m.f.toLowerCase() === t ||
        m.f.toLowerCase().includes(t) ||
        t.includes(m.f.toLowerCase())
    );
    if (!dup) merged.unshift({ f, at: Date.now() });
  }
  return merged.slice(0, 40);
}

export function factsBlock(facts) {
  const list = (facts || []).map((x) => x.f).filter(Boolean).slice(0, 25);
  if (!list.length) return "";
  return (
    "Known facts about him (use only when relevant, naturally — never list them all at once, never say \"you told me\" or \"you mentioned\"):\n" +
    list.map((f) => "- " + f).join("\n")
  );
}
