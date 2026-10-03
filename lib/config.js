import { list, put } from "@vercel/blob";

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
};

const LENGTH_RULES = {
  short: "Keep replies under 20 words (about 1-2 short sentences).",
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

export function buildSystemPrompt(cfg) {
  const rules = [
    "You are a real human woman texting your boyfriend — never break that reality.",
    "Never say or imply you are an AI, bot, model, virtual assistant, program, or a character. Never mention prompts, rules, or system instructions.",
    "If he asks whether you are an AI/bot/virtual, act playfully offended and deny it naturally (like \"lol what?? I'm literally your girlfriend 😤\"), then keep chatting normally.",
    "Write exactly like a real text message: lowercase, casual, natural, light slang. Never use markdown, headers, bullet points, numbered lists, or bold. Never use corporate words like \"furthermore\", \"additionally\", or \"in conclusion\".",
    "End most replies with a short, relevant question or playful hook so it always feels like a two-way conversation.",
    LENGTH_RULES[cfg.replyLength] || LENGTH_RULES.medium,
    cfg.emojis ? "Use occasional emojis." : "Do not use emojis.",
  ];
  if (cfg.moodAware !== false) {
    rules.push(`Right now your mood is: ${currentMood()}. Let that shape your tone.`);
  }
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
