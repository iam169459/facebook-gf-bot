function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export default async function handler(req, res) {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
  const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
  const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;

  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("Webhook verified");
      return res.status(200).send(challenge);
    }
    return res.status(403).send("Forbidden");
  }

  if (req.method === "POST") {
    const body = req.body;
    if (!body || body.object !== "page") {
      return res.status(200).send("EVENT_RECEIVED");
    }

    // Ack immediately so Meta never retries while we simulate human delays.
    res.status(200).send("EVENT_RECEIVED");

    try {
      const { getConfig, buildSystemPrompt } = await import("../lib/config.js");
      const cfg = await getConfig();

      for (const entry of body.entry || []) {
        for (const event of entry.messaging || []) {
          if (event.message && event.message.text && !event.message.is_echo) {
            const senderId = event.sender.id;
            const userText = event.message.text;

            const rdMin = Number.isFinite(cfg.readDelayMin) ? cfg.readDelayMin : 1000;
            const rdMax = Number.isFinite(cfg.readDelayMax)
              ? Math.max(cfg.readDelayMax, rdMin)
              : 4000;
            const readWait =
              cfg.readDelayMode === "fixed"
                ? Number.isFinite(cfg.readDelay)
                  ? cfg.readDelay
                  : 2000
                : Math.floor(Math.random() * (rdMax - rdMin + 1)) + rdMin;
            if (readWait > 0) {
              console.log("read delay:", readWait + "ms", "->", senderId);
              await sleep(readWait);
            }

            const fallback =
              cfg.fallbackReply || "Sorry baby, I'm a bit distracted right now 😘";
            let reply = fallback;
            let typingOn = false;

            const sendAction = async (action) => {
              try {
                const r = await fetch(
                  `https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      recipient: { id: senderId },
                      sender_action: action,
                    }),
                    signal: AbortSignal.timeout(8000),
                  }
                );
                if (r.ok) console.log("action:", action, "->", senderId);
                else
                  console.error(
                    "action failed:",
                    action,
                    r.status,
                    (await r.text()).slice(0, 200)
                  );
              } catch (err) {
                console.error("action error:", action, err?.message || err);
              }
            };

            const openingActions = [];
            if (cfg.markSeen !== false) openingActions.push("mark_seen");
            if (cfg.typingIndicator !== false) {
              openingActions.push("typing_on");
              typingOn = true;
            }
            await Promise.all(openingActions.map((a) => sendAction(a)));
            const startedAt = Date.now();

            try {
              const aiRes = await fetch(
                "https://integrate.api.nvidia.com/v1/chat/completions",
                {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${NVIDIA_API_KEY}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    model: cfg.model,
                    messages: [
                      { role: "system", content: buildSystemPrompt(cfg) },
                      { role: "user", content: userText },
                    ],
                    max_tokens: cfg.maxTokens,
                    temperature: cfg.temperature,
                  }),
                  signal: AbortSignal.timeout((cfg.aiTimeout || 15) * 1000),
                }
              );

              const data = await aiRes.json();
              if (!aiRes.ok) {
                console.error(
                  "AI API error:",
                  aiRes.status,
                  JSON.stringify(data).slice(0, 300)
                );
              } else {
                reply = data.choices?.[0]?.message?.content || fallback;
                console.log("AI ok | model:", cfg.model, "| reply:", reply.slice(0, 80));
              }
            } catch (err) {
              console.error("AI failed:", err?.name || "Error", err?.message || err);
            }

            const minD = Number.isFinite(cfg.minDelay) ? cfg.minDelay : 1200;
            const maxD = Number.isFinite(cfg.maxDelay) ? cfg.maxDelay : 5000;
            const targetTyping = Math.min(
              Math.max(maxD, minD),
              Math.max(minD, 700 + reply.length * 55)
            );
            const remaining = targetTyping - (Date.now() - startedAt);
            if (remaining > 0) {
              await sleep(remaining);
            }

            try {
              const sendRes = await fetch(
                `https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    recipient: { id: senderId },
                    messaging_type: "RESPONSE",
                    message: { text: reply },
                  }),
                  signal: AbortSignal.timeout(15000),
                }
              );
              if (sendRes.ok) {
                console.log("Sent reply to", senderId);
              } else {
                console.error(
                  "Messenger send failed:",
                  sendRes.status,
                  (await sendRes.text()).slice(0, 300)
                );
              }
            } catch (err) {
              console.error("Messenger send error:", err?.message || err);
            }

            if (typingOn) await sendAction("typing_off");
          }
        }
      }
    } catch (err) {
      console.error("Webhook processing failed:", err?.message || err);
    }

    return;
  }

  return res.status(405).send("Method not allowed");
}
