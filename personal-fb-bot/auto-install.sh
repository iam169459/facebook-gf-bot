#!/usr/bin/env bash
# personal-fb-bot/auto-install.sh
#
# AUTO-INSTALLER for the self-hosted Personal FB Bot dashboard.
# One-liner from a brand-new Linux server. Installs Node 18 LTS, npm,
# git, Chromium via Playwright, npm dependencies, creates the SQLite
# data dir, writes a .env, and starts the Express server.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/iam169459/facebook-gf-bot/main/personal-fb-bot/auto-install.sh | sudo -E bash -
#   # or, if you have cloned the repo:
#   cd personal-fb-bot
#   bash auto-install.sh
#
# Requirements:
#   A Debian/Ubuntu/RHEL/Arch linux server. Root or sudo access.
#   Internet access.

set -euo pipefail

# -----------------------------------------------------------
# Defaults
# -----------------------------------------------------------
APP_DIR="${PWD}"
REPO_URL="https://github.com/iam169459/facebook-gf-bot.git"
PORT="${PORT:-8787}"
HOST="${HOST:-0.0.0.0}"
ADMIN_TOKEN="${ADMIN_TOKEN:-change-me-please-now}"
NODE_ENV="${NODE_ENV:-production}"
USER="${SUDO_USER:-$(whoami)}"
DB_PATH="${PERSONAL_FB_DB_PATH:-${APP_DIR}/personal-fb-bot/data/fb.db}"
LOG_FILE="/var/log/personal-fb-bot.log"

# Check for root/sudo
if [[ $EUID -eq 0 ]]; then
  SUDO=""
else
  if [[ -x /usr/bin/sudo ]]; then
    SUDO="sudo"
  else
    echo "Error: this script needs sudo."
    echo "  Please run: sudo bash auto-install.sh"
    exit 1
  fi
fi

# Detect OS
detect_os() {
  if command -v apt-get >/dev/null 2>&1; then
    echo "debian"
  elif command -v dnf >/dev/null 2>&1; then
    echo "rhel"
  elif command -v pacman >/dev/null 2>&1; then
    echo "arch"
  else
    echo "unknown"
  fi
}

run_sudo() {
  if [[ $EUID -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

# -----------------------------------------------------------
# Banner
# -----------------------------------------------------------
echo "============================================================"
echo "  Personal FB Bot — auto installer"
echo "============================================================"
echo "WORKING DIRECTORY : ${APP_DIR}"
echo "DB PATH          : ${DB_PATH}"
echo "PORT             : ${PORT}"
echo "ADMIN_TOKEN      : ${ADMIN_TOKEN}"
echo "============================================================"

# -----------------------------------------------------------
# Step 0: Prerequisites (curl, git, sudo)
# -----------------------------------------------------------
echo ""
echo "[1/6] Checking prerequisites..."
for cmd in curl git; do
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "    Installing ${cmd}..."
    case "${OS}" in
      debian) run_sudo apt-get update -qq && run_sudo apt-get install -y -qq curl git ;;
      rhel)   run_sudo dnf install -y -qq curl git ;;
      arch)   run_sudo pacman -Syu --noconfirm curl git ;;
      *)      echo "    -> Unknown OS; trying apt-get for ${cmd}."
              run_sudo apt-get install -y -qq curl git || exit 1 ;;
    esac
  else
    echo "    ${cmd} already installed."
  fi
done

# -----------------------------------------------------------
# Step 1: Install Node.js 18 LTS
# -----------------------------------------------------------
echo ""
echo "[2/6] Checking Node.js..."
if command -v node >/dev/null 2>&1; then
  echo "    node $(node -v) already installed."
else
  echo "    Installing Node.js 18 LTS..."
  case "${OS}" in
    debian)
      run_sudo curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
      run_sudo apt-get install -y -qq nodejs
      ;;
    rhel)
      run_sudo curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo -E bash -
      run_sudo dnf install -y -qq nodejs
      ;;
    arch)
      run_sudo pacman -S --noconfirm nodejs npm
      ;;
    *)
      echo "    -> Unknown OS; please install Node 18+ manually."
      exit 1
      ;;
  esac
  echo "    node $(node -v) installed."
fi

# -----------------------------------------------------------
# Step 2: Clone (or use existing) repo
# -----------------------------------------------------------
echo ""
echo "[3/6] Cloning/prepare repository..."
if [[ ! -d "${APP_DIR}/personal-fb-bot" ]]; then
  echo "    Cloning ${REPO_URL} into ${APP_DIR}..."
  git clone --depth 1 "${REPO_URL}" "${APP_DIR}/personal-fb-bot"
fi
cd "${APP_DIR}/personal-fb-bot"

# -----------------------------------------------------------
# Step 3: Install npm dependencies
# -----------------------------------------------------------
echo ""
echo "[4/6] Installing npm dependencies..."
if [[ ! -f package.json ]]; then
  echo "    Error: no package.json in ${APP_DIR}/personal-fb-bot"
  exit 1
fi
npm install --no-audit --no-fund

# -----------------------------------------------------------
# Step 4: Install Playwright Chromium
# -----------------------------------------------------------
echo ""
echo "[5/6] Installing Playwright Chromium..."
if ! npx playwright install chromium 2>&1 | tail -1; then
  echo "    Error: Playwright Chromium install failed."
  echo "    On Debian/Ubuntu you may need GUI libraries:"
  echo "      sudo apt-get install -y libnss3 libnss3-dev libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2"
  exit 1
fi
echo "    Chromium installed."

# -----------------------------------------------------------
# Step 5: Create data dir + .env
# -----------------------------------------------------------
echo ""
echo "[6/6] Creating data directory and .env..."
mkdir -p "${APP_DIR}/personal-fb-bot/data"
mkdir -p "${APP_DIR}/.env.d"

if [[ ! -f "${APP_DIR}/personal-fb-bot/.env" ]]; then
  cat > "${APP_DIR}/personal-fb-bot/.env" <<EOF
PORT=${PORT}
HOST=${HOST}
ADMIN_TOKEN=${ADMIN_TOKEN}
NODE_ENV=${NODE_ENV}
JWT_SECRET=auto-generated-${RANDOM}-${RANDOM}-${RANDOM}
SESSION_COOKIE=pfb_session
SESSION_TTL=2592000
PERSONAL_FB_DB_PATH=${DB_PATH}
PERSONAL_FB_DRIVER=chromium
PERSONAL_FB_HEADLESS=1
EOF
  echo "    Created ${APP_DIR}/personal-fb-bot/.env"
fi

# -----------------------------------------------------------
# Step 6: Start server (systemd or nohup)
# -----------------------------------------------------------
echo ""
echo "[7/6] Starting the server..."

# Try systemd
if command -v systemctl >/dev/null 2>&1 && id -u "$USER" != 0; then
  cat > /etc/systemd/system/personal-fb-bot.service <<EOF
[Unit]
Description=Personal FB Dashboard
After=network.target

[Service]
User=${USER}
WorkingDirectory=${APP_DIR}/personal-fb-bot
ExecStart=/usr/bin/npm start
Environment=NODE_ENV=production
Environment=ADMIN_TOKEN=${ADMIN_TOKEN}
Environment=PORT=${PORT}
Environment=PERSONAL_FB_DRIVER=chromium
Environment=PERSONAL_FB_HEADLESS=1
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable personal-fb-bot
  systemctl restart personal-fb-bot
  echo "    Systemd service started."
  echo "    Logs: sudo journalctl -u personal-fb-bot -f"
else
  nohup npm start > /tmp/personal-fb-bot.log 2>&1 &
  echo "    Server started (PID $!). Logs:"
  echo "      tail -f /tmp/personal-fb-bot.log"
fi

echo ""
echo "============================================================"
echo "  Personal FB Bot is ready."
echo "  Dashboard: http://localhost:${PORT}"
echo "  Logs       ${LOG_FILE} (or journalctl -u personal-fb-bot -f)"
echo "  ADMIN_TOKEN ${ADMIN_TOKEN}"
echo "============================================================"
