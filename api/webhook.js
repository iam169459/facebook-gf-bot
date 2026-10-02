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
                }
              );

              const data = await aiRes.json();
              const reply =
                data.choices?.[0]?.message?.content ||
                "Sorry baby, I'm a bit distracted right now 😘";

              await fetch(
                `https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    recipient: { id: senderId },
                    messaging_type: "RESPONSE",
                    message: { text: reply },
                  }),
                }
              );
            } catch (err) {
              console.error("Error:", err);
            }
          }
        }
      }
    }

    return res.status(200).send("EVENT_RECEIVED");
  }

  return res.status(405).send("Method not allowed");
}
