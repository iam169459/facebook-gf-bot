# Personal FB Bot — Self-Hosted Personal Facebook Dashboard

A self-hosted web app that logs into your **real personal Facebook account** and gives you a full dashboard to:

- **Read** your inbox and threads
- **Send / message** friends and replies
- **Mark as seen**
- **Like / react** to posts and messages
- **Edit** messages
- Optional **AI helper** to generate replies using your personal AI account

No Facebook **Page** token needed — this is built around a real personal FB account, so a Playwright Chromium browser drives the login and the session.

---

## Install on a server

```bash
# 1) Node 18+ and npm
node -v   # 18+
npm -v

# 2) Install dependencies
npm install

# 3) Install Playwright's Chromium browser
npx playwright install chromium

# 4) Create the local SQLite store
mkdir -p personal-fb-bot/data

# 5) Start the server
npm start
```

Then open:

- **Dashboard:** http://YOUR_SERVER:8787
- **API:** documented in the sections below

---

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | 8787 | HTTP port |
| `HOST` | 0.0.0.0 | Bind address |
| `ADMIN_TOKEN` | personal-fb-bot-dev-secret-change-me | Token for admin-only API routes (`/api/health`, `/api/accounts`, `/api/sessions`, `/api/login`, `/api/create-account`) |
| `PERSONAL_FB_DB_PATH` | `personal-fb-bot/data/fb.db` | Local SQLite file |
| `PERSONAL_FB_DRIVER` | chromium | Playwright browser (`chromium`, `firefox`, `webkit`) |
| `PERSONAL_FB_PROFILE_DIR` | `""` | Optional persistent Chromium user profile directory |
| `PERSONAL_FB_HEADLESS` | `""` (false) | Set to `1` to run Chromium headless |
| `PERSONAL_FB_USER_AGENT` | `""` | Optional custom user agent |
| `JWT_SECRET` | personal-fb-bot-dev-secret-change-me | Symmetric key for session JWT |
| `SESSION_COOKIE` | pfb_session | Session cookie name |
| `SESSION_TTL` | 2592000 (30 days) | Session lifetime in seconds |

### Admin routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Health check + DB readiness |
| GET | `/api/accounts` | List personal accounts |
| GET | `/api/sessions` | List active session IDs |
| POST | `/api/login` | Create or log in to an account (admin) |
| POST | `/api/create-account` | Create an account (admin) |

All other routes require a session cookie (`pfb_session`) or a `Bearer` JWT.

---

## Systemd service (Linux, recommended)

```ini
# /etc/systemd/system/personal-fb-bot.service
[Unit]
Description=Personal FB Dashboard
After=network.target

[Service]
User=www-data
WorkingDirectory=/var/www/personal-fb-bot/personal-fb-bot
ExecStart=/usr/bin/npm start
Environment=NODE_ENV=production
Environment=ADMIN_TOKEN=your_random_token
Environment=PORT=8787
Environment=PERSONAL_FB_DRIVER=chromium
Environment=PERSONAL_FB_HEADLESS=1
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now personal-fb-bot
sudo journalctl -u personal-fb-bot -f
```

---

## Local install (development)

```bash
npm install
npx playwright install chromium
PORT=8787 npm start
```

---

## How it works

1. **Login** — you log in to your real personal Facebook account. A headless Chromium browser in the server drives the OAuth/login flow and persists the session.
2. **Inbox / Threads** — the server reads your Facebook inbox and threads through that browser session.
3. **Send / message** — the server opens a chat with a recipient and types your message.
4. **Seen / reacted / edited** — the server drives the Facebook UI to mark messages as seen, react, and edit.
5. **AI helper** — an optional AI reply engine uses your personal AI account (OpenAI, Anthropic, NVIDIA) to reply to messages for you. `personal-ai` is a placeholder; set your personal AI token in the UI or via the `PERSONAL_AI_TOKEN` env var.

The database is a pure-JS SQLite store (`personal-fb-bot/data/fb.db`) that persists account credential references and message history. The Facebook session itself lives in the browser profile, not in the database.

---

## Where to find things

| Path | Purpose |
|---|---|
| `personal-fb-bot/server.js` | Express API + HTTP server |
| `personal-fb-bot/db.js` | SQLite + proxy |
| `personal-fb-bot/accounts.js` | Account/session persistence |
| `personal-fb-bot/fbdriver.js` | Playwright Discord driver |
| `personal-fb-bot/ui/index.html` | Dashboard frontend |
| `personal-fb-bot/data/fb.db` | Local SQLite (auto-created) |

---

## Uninstall / clean stop

```bash
# stop the service or Ctrl+C, then remove the data store
rm -rf personal-fb-bot/data
```

---

## License

MIT
