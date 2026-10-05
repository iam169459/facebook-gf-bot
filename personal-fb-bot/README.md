# Personal FB Bot — Self-Hosted Personal Facebook Dashboard

A self-hosted web app that logs into your **real personal Facebook account**
(OAuth + a persistent browser profile) and gives you a full dashboard to:

- **Log in** with your personal Facebook account
- **Read** your inbox/threads
- **Write / message** friends and replies
- **Mark as seen**
- **Like / react** to posts and messages
- **Edit** messages
- Optional **AI helper** to generate replies using your personal AI account

No Facebook **Page** token needed — this is built around a real personal FB
account, so OAuth + a Chromium browser profile drive the account.

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

# 4) Create the data directory for the local SQLite store
mkdir -p personal-fb-bot/data

# 5) Start the server
npm start
```

Then open:

- **Dashboard:** http://YOUR_SERVER:8787
- **API docs:** read the routes below

---

## Environment variables (.env)

```bash
PORT=8787
HOST=0.0.0.0

# Secret for session/JWT signing — change in production
JWT_SECRET=change-me-please

# Optional admin token for /api/health, /api/accounts, /api/sessions
ADMIN_TOKEN=admin-token-here

# Personal Facebook account credentials (used by the login/connect flow)
PERSONAL_FB_EMAIL=you@example.com
PERSONAL_FB_PASS=your_password

# Browser driver: chromium | firefox | webkit
PERSONAL_FB_DRIVER=chromium

# Persistent browser profile directory (so you don't have to log in every time)
PERSONAL_FB_PROFILE_DIR=/path/to/profile
PERSONAL_FB_HEADLESS=0

# Optional browser user agent override
PERSONAL_FB_USER_AGENT="Mozilla/5.0 ..."
```

---

## Dashboard UI

Open `http://YOUR_SERVER:8787`.

The UI has tabs:

| Tab | What it does |
|---|---|
| **Inbox** | Read messages, filter, mark read |
| **Threads** | Conversation picker |
| **Send** | Compose and send a message, reply, "thumb swipe" |
| **Messages** | Full message list/history |
| **Account** | View connected account, reconnect, disconnect sessions |
| **AI Helper** | Generate replies with your personal AI account |
| **Logs** | Automation log view |

---

## API

All non-login routes require a session cookie (`pfb_session`) or a Bearer JWT.

- `GET /api/health` — health check (admin)
- `GET /api/accounts` — list personal accounts (admin)
- `POST /api/login` — admin login (creates an account)
- `POST /api/connect` — connect a FB account via a real personal account login
- `GET /api/account` — current connected account
- `POST /api/logout` — end session
- `GET /api/messages` — inbox messages
- `GET /api/messages/:id` — single message
- `POST /api/messages` — send a message
- `POST /api/messages/:id/read` — mark read
- `POST /api/messages/:id/like` — like a message
- `POST /api/messages/:id/edit` — edit a message
- `POST /api/messages/:id/seen` — mark as seen
- `POST /api/reactions` — bubble/reaction entry
- `POST /api/settings` — AI helper "test" action
- `GET /api/logs` — automation log store

---

## How it works

1. You open the dashboard and click **Connect & Log In**.
2. The app launches a Chromium browser with a persistent profile.
3. Playwright navigates to Facebook, logs in with your personal account
   (email/password optional if a profile already holds the session).
4. Once logged in, the browser drives the Facebook UI: search a friend,
   open their thread, type a message, send, react, edit, mark seen.
5. The account's profile/name is stored in the app's local SQLite DB.

---

## Hosting on your VPS

- Put the `personal-fb-bot` folder anywhere on the VPS.
- Run `npm install && npx playwright install chromium`.
- Expose `PORT` (default `8787`) to the internet (reverse proxy with SSL).
- Run as a service:

```bash
# /etc/systemd/system/personal-fb-bot.service
[Unit]
Description=Personal FB Bot
After=network.target

[Service]
Type=simple
User=bob
WorkingDirectory=/home/bob/personal-fb-bot
Environment=NODE_ENV=production
Environment=PERSONAL_FB_PROFILE_DIR=/home/bob/.pfb-profile
EnvironmentFile=-/home/bob/personal-fb-bot/.env
ExecStart=/usr/bin/npm start
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now personal-fb-bot
```

The browser runs as the `User=bob` service, so it uses that user's home and
any `PERSONAL_FB_PROFILE_DIR` you point to. A systemd `user@1000` service also
works if you prefer not to run Chromium as root.

---

## Notes & limits

- Facebook frequently changes its UI selectors. The Playwright driver uses
  data-testid/aria-label selectors that can break; a small maintenance loop
  is needed after significant Facebook redesigns.
- A personal Facebook account has limited Graph API access compared to a
  Page. Browser automation is the realistic way to get full chat/reaction/
  editing features for a personal account.
- Keep `PERSONAL_FB_PROFILE_DIR` backed up and don't share it with anyone —
  it contains your session cookies.
