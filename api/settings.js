import { getConfig, saveConfig, sanitize, currentMood } from "../lib/config.js";
import { log } from "../lib/logger.js";
import { waitUntil } from "@vercel/functions";

function isAuthorized(req) {
  const required = process.env.ADMIN_PASSWORD;
  if (!required) return true;
  const given =
    req.headers["x-admin-password"] ||
    (req.body && req.body.password) ||
    (req.query && req.query.password);
  return given === required;
}

async function callNvidia(cfg, userText) {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) throw new Error("NVIDIA_API_KEY is not set");

  const { buildSystemPrompt, sentimentHint } = await import("../lib/config.js");
  const sys = buildSystemPrompt(cfg);
  const hint = sentimentHint(userText);
  const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        { role: "system", content: hint ? sys + "\n" + hint : sys },
        { role: "user", content: userText },
      ],
      max_tokens: cfg.maxTokens,
      temperature: cfg.temperature,
    }),
    signal: AbortSignal.timeout(25000),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || `NVIDIA API error ${res.status}`);
  }
  return data.choices?.[0]?.message?.content || "";
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Invalid admin password" });
  }

  if (req.method === "GET") {
    const settings = await getConfig();
    return res.status(200).json({
      settings,
      env: {
        VERIFY_TOKEN: Boolean(process.env.VERIFY_TOKEN),
        PAGE_ACCESS_TOKEN: Boolean(process.env.PAGE_ACCESS_TOKEN),
        NVIDIA_API_KEY: Boolean(process.env.NVIDIA_API_KEY),
        BLOB_READ_WRITE_TOKEN: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
        ADMIN_PASSWORD: Boolean(process.env.ADMIN_PASSWORD),
      },
      webhookPath: "/api/webhook",
      mood: currentMood(settings),
    });
  }

  if (req.method === "PUT") {
    try {
      const settings = await saveConfig((req.body && req.body.settings) || {});
      waitUntil(log("info", "settings saved from dashboard"));
      return res.status(200).json({ ok: true, settings });
    } catch (err) {
      log("error", "Save failed:", err);
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === "POST") {
    const action = req.body && req.body.action;
    if (action === "test") {
      try {
        const cfg = sanitize((req.body && req.body.settings) || (await getConfig()));
        const message = String((req.body && req.body.message) || "Hey").slice(0, 500);
        const reply = await callNvidia(cfg, message);
        return res.status(200).json({ ok: true, reply });
      } catch (err) {
        log("error","Test failed:", err);
        return res.status(500).json({ error: err.message });
      }
    }
    if (action === "reset") {
      try {
        const settings = await saveConfig({});
        waitUntil(log("warn", "settings reset to defaults"));
        return res.status(200).json({ ok: true, settings });
      } catch (err) {
        log("error","Reset failed:", err);
        return res.status(500).json({ error: err.message });
      }
    }
    return res.status(400).json({ error: "Unknown action" });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
