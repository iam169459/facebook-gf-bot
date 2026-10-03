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

    if (body && body.object === "page") {
      const { getConfig, buildSystemPrompt } = await import("../lib/config.js");
      const cfg = await getConfig();

      for (const entry of body.entry || []) {
        for (const event of entry.messaging || []) {
          if (event.message && event.message.text && !event.message.is_echo) {
            const senderId = event.sender.id;
            const userText = event.message.text;

            const FALLBACK = "Sorry baby, I'm a bit distracted right now 😘";
            let reply = FALLBACK;

            const sendAction = async (action) => {
              try {
                const res = await fetch(
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
                if (res.ok) console.log("action:", action, "->", senderId);
                else console.error("action failed:", action, res.status, (await res.text()).slice(0, 200));
              } catch (err) {
                console.error("action error:", action, err?.message || err);
              }
            };

            await Promise.all([sendAction("mark_seen"), sendAction("typing_on")]);
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
                  signal: AbortSignal.timeout(15000),
                }
              );

              const data = await aiRes.json();
              if (!aiRes.ok) {
                console.error("AI API error:", aiRes.status, JSON.stringify(data).slice(0, 300));
              } else {
                reply = data.choices?.[0]?.message?.content || FALLBACK;
                console.log("AI ok | model:", cfg.model, "| reply:", reply.slice(0, 80));
              }
            } catch (err) {
              console.error("AI failed:", err?.name || "Error", err?.message || err);
            }

            const targetTyping = Math.min(5000, Math.max(1200, 700 + reply.length * 55));
            const remaining = targetTyping - (Date.now() - startedAt);
            if (remaining > 0) {
              await new Promise((r) => setTimeout(r, remaining));
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
                console.error("Messenger send failed:", sendRes.status, (await sendRes.text()).slice(0, 300));
              }
            } catch (err) {
              console.error("Messenger send error:", err?.message || err);
            }

            await sendAction("typing_off");
          }
        }
      }
    }

    return res.status(200).send("EVENT_RECEIVED");
  }

  return res.status(405).send("Method not allowed");
}
