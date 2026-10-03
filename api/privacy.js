const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Privacy Policy — Aira</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background:#0f0f14; color:#e8e8ee; margin:0; line-height:1.65; }
  main { max-width:760px; margin:0 auto; padding:48px 22px 80px; }
  h1 { font-size:26px; margin-bottom:4px; }
  h2 { font-size:18px; margin-top:36px; color:#f0a9c8; }
  .muted { color:#9a9aa8; font-size:14px; }
  p, li { font-size:15.5px; color:#d6d6e0; }
  a { color:#7fb2ff; }
</style>
</head>
<body>
<main>
  <h1>Privacy Policy</h1>
  <p class="muted">Effective date: October 3, 2026</p>

  <p>This policy explains what happens to your information when you chat with the Aira page on Facebook Messenger.</p>

  <h2>What we collect</h2>
  <ul>
    <li><strong>Your messages</strong> — the text you send to our page, so we can reply.</li>
    <li><strong>Your Facebook page-scoped ID</strong> — the identifier Meta provides to deliver replies to the right conversation.</li>
    <li><strong>Technical logs</strong> — timestamps and error information used only for debugging (for example, if a reply fails to send).</li>
  </ul>

  <h2>How it is used</h2>
  <p>Messages are used for one purpose: to generate your reply. Message content is sent to NVIDIA's API (as our AI inference provider) and returned output is sent back to you. Messages are never used for advertising, profiling, or sold to anyone.</p>

  <h2>Who processes your data</h2>
  <ul>
    <li><strong>Meta (Facebook)</strong> — hosts Messenger and delivers messages.</li>
    <li><strong>Vercel</strong> — hosts the bot and stores configuration and short-lived diagnostic logs.</li>
    <li><strong>NVIDIA</strong> — generates reply text. Prompts are processed for inference only.</li>
  </ul>

  <h2>Retention</h2>
  <p>Diagnostic logs are short-lived and automatically purged by our hosting provider. Conversation content is not stored on our servers; each reply is generated from the message you sent and then discarded.</p>

  <h2>Your choices</h2>
  <ul>
    <li>You can remove this page's access to your information at any time from Facebook Messenger: <em>Chats → the page → Page options → Remove page access</em>.</li>
    <li>To have your data deleted or ask questions, contact us below.</li>
  </ul>

  <h2>Children</h2>
  <p>This service is not directed at children under 13.</p>

  <h2>Contact</h2>
  <p>Questions or deletion requests: <a href="mailto:iam169459@gmail.com">iam169459@gmail.com</a></p>

  <p class="muted">We may update this policy; the effective date above will change when we do.</p>
</main>
</body>
</html>`;

export default function handler(req, res) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.status(200).send(html);
}
