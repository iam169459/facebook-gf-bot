import { waitUntil } from "@vercel/functions";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function splitReply(text) {
  const raw = String(text || "");
  const chunks = [];
  for (const part of raw.split(/\n+|\|/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (trimmed.length <= 150) {
      chunks.push(trimmed);
      continue;
    }
    const sentences =
      trimmed.match(/[^.!?…]+[.!?…]+["')\]]*\s*|[^.!?…]+$/g) || [trimmed];
    let buf = "";
    for (const s of sentences) {
      if (buf && (buf + s).length > 150) {
        chunks.push(buf.trim());
        buf = s;
      } else {
        buf += s;
      }
    }
    if (buf.trim()) chunks.push(buf.trim());
  }
  return chunks.length ? chunks : [raw];
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
    // waitUntil keeps the function alive until processing (delays + reply) finishes.
    res.status(200).send("EVENT_RECEIVED");

    waitUntil(
      (async () => {
        try {
          const {
            getConfig,
            buildSystemPrompt,
            dhakaHour,
            sentimentHint,
            loadHistory,
            saveHistory,
            appendInbox,
            claimBurst,
            claimItems,
            finalizeInbox,
            loadFacts,
            saveFacts,
            parseFacts,
            mergeFacts,
            factsBlock,
          } = await import("../lib/config.js");
          const cfg = await getConfig();

          // Collect all incoming parts (messages and optionally edits).
          const parts = [];
          for (const entry of body.entry || []) {
            for (const event of entry.messaging || []) {
              if (event.message && event.message.text && !event.message.is_echo) {
                parts.push({
                  text: event.message.text,
                  mid: String(event.message.mid || ""),
                  sender: event.sender.id,
                  edit: false,
                });
              } else if (
                event.message_edit &&
                event.message_edit.text &&
                cfg.replyToEdits !== false
              ) {
                parts.push({
                  text: event.message_edit.text,
                  mid:
                    String(event.message_edit.mid || "") +
                    ":e" +
                    (event.message_edit.num_edit || 1),
                  sender: event.sender.id,
                  edit: true,
                });
              }
            }
          }
          if (!parts.length) return;

          const senderId = parts[0].sender;
          let userText = parts.map((p) => p.text).join("\n");
          let reactionMid =
            (parts.filter((p) => !p.edit).pop() || {}).mid || null;
          let processedMids = null;

          // Burst grouping: collect rapid-fire parts, stop after silence window.
          if (cfg.burstGrouping !== false) {
            for (const p of parts) {
              await appendInbox(senderId, { text: p.text, mid: p.mid, e: p.edit });
            }
            const idle = Number.isFinite(cfg.burstIdle) ? cfg.burstIdle : 6000;
            if (idle > 0) await sleep(idle);

            const owner = await claimBurst(senderId);
            if (!owner) {
              console.log("burst: another reply in flight ->", senderId);
              return;
            }

            const fresh = await claimItems(senderId);
            if (!fresh.length) {
              console.log("burst: already handled ->", senderId);
              return;
            }
            if (fresh.length > 1) {
              console.log("burst grouped", fresh.length, "parts |", senderId);
            }
            userText = fresh.map((i) => i.text).join("\n");
            const lastReal = fresh.filter((i) => !i.e).pop();
            reactionMid = lastReal ? lastReal.mid : null;
            processedMids = fresh.map((i) => i.mid);
          }

          const rdMin = Number.isFinite(cfg.readDelayMin) ? cfg.readDelayMin : 1000;
          const rdMax = Number.isFinite(cfg.readDelayMax)
            ? Math.max(cfg.readDelayMax, rdMin)
            : 4000;
          let readWait =
            cfg.readDelayMode === "fixed"
              ? Number.isFinite(cfg.readDelay)
                ? cfg.readDelay
                : 2000
              : Math.floor(Math.random() * (rdMax - rdMin + 1)) + rdMin;
          if (cfg.readLengthFactor !== false) {
            readWait += Math.min(userText.length * 25, 4000);
          }
          if (readWait > 0) {
            console.log("read delay:", readWait + "ms", "->", senderId);
            await sleep(readWait);
          }

          if (
            cfg.reactionChance > 0 &&
            Math.random() * 100 < cfg.reactionChance &&
            reactionMid
          ) {
            const reactionTypes = ["LOVE", "HAHA", "LIKE", "WOW"];
            const rtype =
              reactionTypes[Math.floor(Math.random() * reactionTypes.length)];
            try {
              const rr = await fetch(
                `https://graph.facebook.com/v21.0/${reactionMid}/reactions?type=${rtype}&access_token=${PAGE_ACCESS_TOKEN}`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: "{}",
                  signal: AbortSignal.timeout(8000),
                }
              );
              if (rr.ok) console.log("reaction:", rtype, "->", senderId);
              else
                console.error(
                  "reaction failed:",
                  rr.status,
                  (await rr.text()).slice(0, 200)
                );
            } catch (err) {
              console.error("reaction error:", err?.message || err);
            }
          }

          if (cfg.moodAware !== false && (dhakaHour() >= 23 || dhakaHour() < 6)) {
            const extra = Math.floor(Math.random() * 4000);
            if (extra > 0) {
              console.log("late-night slow-down:", extra + "ms", "->", senderId);
              await sleep(extra);
            }
          }

          if (cfg.busyChance > 0 && Math.random() * 100 < cfg.busyChance) {
            const busyWait = 2000 + Math.floor(Math.random() * 6000);
            console.log("busy/distraction:", busyWait + "ms", "->", senderId);
            await sleep(busyWait);
          }

          const fallback =
            cfg.fallbackReply || "Sorry baby, I'm a bit distracted right now 😘";
          let reply = fallback;
          let typingOn = false;
          const history =
            cfg.memoryOn !== false ? await loadHistory(senderId) : [];

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

          if (cfg.ignoreChance > 0 && Math.random() * 100 < cfg.ignoreChance) {
            console.log("left on read ->", senderId);
            if (cfg.markSeen !== false) await sendAction("mark_seen");
            if (processedMids) {
              try {
                await finalizeInbox(senderId, processedMids);
              } catch (err) {
                console.error("inbox finalize failed:", err?.message || err);
              }
            }
            return;
          }

          const openingActions = [];
          if (cfg.markSeen !== false) openingActions.push("mark_seen");
          if (cfg.typingIndicator !== false) {
            openingActions.push("typing_on");
            typingOn = true;
          }
          await Promise.all(openingActions.map((a) => sendAction(a)));
          const startedAt = Date.now();
          const aiStartedAt = Date.now();

          let facts = [];
          if (cfg.longTermMemory !== false) {
            try {
              facts = await loadFacts(senderId);
            } catch (err) {
              console.error("facts load failed:", err?.message || err);
            }
          }

          let aiOk = false;
          try {
            const fb = factsBlock(facts);
            const basePrompt = buildSystemPrompt(cfg);
            const sysPrompt = fb ? basePrompt + "\n\n" + fb : basePrompt;
            const hint = sentimentHint(userText);
            const messages = [
              {
                role: "system",
                content: hint ? sysPrompt + "\n" + hint : sysPrompt,
              },
            ];
            for (const h of history) {
              if (h && h.u) {
                messages.push({ role: "user", content: String(h.u).slice(0, 500) });
                if (h.a) {
                  messages.push({
                    role: "assistant",
                    content: String(h.a).slice(0, 1500),
                  });
                }
              }
            }
            messages.push({ role: "user", content: userText });
            const callAI = async (maxTokens) => {
              const res = await fetch(
                "https://integrate.api.nvidia.com/v1/chat/completions",
                {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${NVIDIA_API_KEY}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    model: cfg.model,
                    messages,
                    max_tokens: maxTokens,
                    temperature: cfg.temperature,
                  }),
                  signal: AbortSignal.timeout((cfg.aiTimeout || 30) * 1000),
                }
              );
              const d = await res.json();
              return { ok: res.ok, status: res.status, data: d };
            };

            const first = await callAI(cfg.maxTokens);
            if (!first.ok) {
              console.error(
                "AI API error:",
                first.status,
                JSON.stringify(first.data).slice(0, 300)
              );
            } else {
              let content = String(
                first.data.choices?.[0]?.message?.content || ""
              ).trim();
              if (!content) {
                console.log("AI returned empty content — retrying with more tokens");
                try {
                  const second = await callAI(
                    Math.min(1000, Math.max(600, cfg.maxTokens))
                  );
                  if (second.ok) {
                    content = String(
                      second.data.choices?.[0]?.message?.content || ""
                    ).trim();
                  }
                } catch (e) {
                  console.error("AI retry failed:", e?.message || e);
                }
              }
              reply = content || fallback;
              aiOk = Boolean(content);
              console.log(
                "AI ok | model:",
                cfg.model,
                "| took:",
                ((Date.now() - aiStartedAt) / 1000).toFixed(1) + "s",
                "| reply:",
                reply.slice(0, 80)
              );
            }
          } catch (err) {
            console.error(
              "AI failed:",
              err?.name || "Error",
              "| after:",
              ((Date.now() - aiStartedAt) / 1000).toFixed(1) + "s",
              "| aiTimeout:",
              cfg.aiTimeout,
              "|",
              err?.message || err
            );
          }

          const sendText = async (text) => {
            try {
              const sendRes = await fetch(
                `https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    recipient: { id: senderId },
                    messaging_type: "RESPONSE",
                    message: { text },
                  }),
                  signal: AbortSignal.timeout(15000),
                }
              );
              if (sendRes.ok) {
                console.log("Sent reply to", senderId, "|", text.slice(0, 60));
                return true;
              }
              console.error(
                "Messenger send failed:",
                sendRes.status,
                (await sendRes.text()).slice(0, 300)
              );
              return false;
            } catch (err) {
              console.error("Messenger send error:", err?.message || err);
              return false;
            }
          };

          const chunks =
            cfg.multiMessage !== false
              ? splitReply(reply)
              : [String(reply).replace(/\s*\|\s*/g, " ")];
          let queue = chunks;
          if (cfg.ellipsisTease !== false && Math.random() < 0.15) {
            queue = ["..."].concat(chunks);
            console.log("ellipsis tease ->", senderId);
          }
          if (queue.length > 1) {
            console.log("sending in", queue.length, "bubbles |", senderId);
          }

          const minD = Number.isFinite(cfg.minDelay) ? cfg.minDelay : 1200;
          const maxD = Number.isFinite(cfg.maxDelay) ? cfg.maxDelay : 5000;
          const targetTyping = Math.min(
            Math.max(maxD, minD),
            Math.max(minD, 700 + reply.length * 55 + Math.floor(Math.random() * 800))
          );
          const remaining = targetTyping - (Date.now() - startedAt);
          if (remaining > 0) {
            await sleep(remaining);
          }

          let sentAny = false;
          for (let i = 0; i < queue.length; i++) {
            if (i > 0) {
              const splitMs = Number.isFinite(cfg.splitDelay)
                ? cfg.splitDelay
                : 1500;
              if (splitMs > 0) await sleep(splitMs);
              if (typingOn) await sendAction("typing_on");
            }
            const ok = await sendText(queue[i]);
            sentAny = sentAny || ok;
          }

          if (typingOn) await sendAction("typing_off");

          if (sentAny && cfg.memoryOn !== false) {
            try {
              history.push({ u: userText, a: chunks.join(" ") });
              await saveHistory(senderId, history);
            } catch (err) {
              console.error("history save failed:", err?.message || err);
            }
          }

          if (cfg.longTermMemory !== false && (sentAny || aiOk)) {
            try {
              const exRes = await fetch(
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
                      {
                        role: "system",
                        content:
                          "Extract durable facts about the user from his message. Reply ONLY with up to 3 short lines in the form 'type: fact', e.g. 'user_interest: hardware projects'. Use a short type prefix before each colon. If there is no new durable fact, reply exactly: NONE",
                      },
                      { role: "user", content: String(userText).slice(0, 1000) },
                    ],
                    max_tokens: 120,
                    temperature: 0.1,
                  }),
                  signal: AbortSignal.timeout(20000),
                }
              );
              if (exRes.ok) {
                const exData = await exRes.json();
                const newFacts = parseFacts(
                  exData.choices?.[0]?.message?.content || ""
                );
                if (newFacts.length) {
                  const existing = await loadFacts(senderId);
                  const merged = mergeFacts(existing, newFacts);
                  if (merged.length !== existing.length) {
                    await saveFacts(senderId, merged);
                    console.log(
                      "facts saved:",
                      merged.length - existing.length,
                      "new | total:",
                      merged.length,
                      "|",
                      senderId
                    );
                  }
                }
              } else {
                console.error("fact extraction API:", exRes.status);
              }
            } catch (err) {
              console.error("fact extraction failed:", err?.message || err);
            }
          }

          if (processedMids && sentAny) {
            try {
              await finalizeInbox(senderId, processedMids);
            } catch (err) {
              console.error("inbox finalize failed:", err?.message || err);
            }
          }
        } catch (err) {
          console.error("Webhook processing failed:", err?.message || err);
        }
      })()
    );

    return;
  }

  return res.status(405).send("Method not allowed");
}
