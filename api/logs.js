import { fetchEntries, clearAll } from "../lib/logger.js";
import { getConfig, isAsleep, dhakaNow, currentMood } from "../lib/config.js";

function isAuthorized(req) {
  const required = process.env.ADMIN_PASSWORD;
  if (!required) return true;
  const given =
    req.headers["x-admin-password"] ||
    (req.query && req.query.password);
  return given === required;
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Invalid admin password" });
  }

  if (req.method === "GET") {
    try {
      const { entries, total } = await fetchEntries({
        since: (req.query && req.query.since) || 0,
        limit: (req.query && req.query.limit) || 200,
      });
      const cfg = await getConfig();
      const now = dhakaNow();
      return res.status(200).json({
        entries,
        total,
        status: {
          dhaka: now.formatted,
          asleep: isAsleep(cfg),
          mood: currentMood(cfg),
        },
      });
    } catch (err) {
      console.error("logs fetch failed:", err);
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === "DELETE") {
    try {
      const r = await clearAll();
      return res.status(200).json(r);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
