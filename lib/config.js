import { list, put } from "@vercel/blob";

const CONFIG_PATH = "bot-config/config.json";
const CACHE_TTL = 30_000;

export const DEFAULTS = {
  botName: "Aira",
  persona:
    "You are Aira, my loving virtual girlfriend.\nYou are warm, affectionate, flirty, playful and a little teasing.\nTalk naturally like a real girl texting her boyfriend.\nNever break character or say you are an AI.",
  model: "deepseek-ai/deepseek-v4.1-flash",
  temperature: 0.85,
  maxTokens: 280,
  replyLength: "medium",
  emojis: true,
  extraInstructions: "",
};

const LENGTH_RULES = {
  short: "Keep replies very short (1-2 sentences).",
  medium: "Keep replies short to medium length.",
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
  return {
    botName: String(src.botName || DEFAULTS.botName).slice(0, 60),
    persona: String(src.persona ?? DEFAULTS.persona).slice(0, 4000),
    model: String(src.model || DEFAULTS.model).slice(0, 120),
    temperature: clamp(src.temperature, 0, 2, DEFAULTS.temperature),
    maxTokens: Math.round(clamp(src.maxTokens, 16, 1000, DEFAULTS.maxTokens)),
    replyLength: length,
    emojis: src.emojis === undefined ? DEFAULTS.emojis : Boolean(src.emojis),
    extraInstructions: String(src.extraInstructions || "").slice(0, 1000),
  };
}

export function buildSystemPrompt(cfg) {
  const parts = [
    `You are ${cfg.botName}, my loving virtual girlfriend.`,
    cfg.persona.replace(/^You are [^,.\n]+, my loving virtual girlfriend\.\n?/, ""),
    LENGTH_RULES[cfg.replyLength] || LENGTH_RULES.medium,
    cfg.emojis ? "Use occasional emojis." : "Do not use emojis.",
  ];
  if (cfg.extraInstructions) parts.push(cfg.extraInstructions);
  return parts.filter(Boolean).join("\n");
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
