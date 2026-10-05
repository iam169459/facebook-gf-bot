#!/usr/bin/env bash
# personal-fb-bot/install.sh
#
# Auto-installer for the self-hosted Personal FB Bot dashboard.
# Installs Node, npm, Playwright Chromium, creates the SQLite data dir,
# and starts (or restarts) the Express server on a VPS.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/iam169459/facebook-gf-bot/main/personal-fb-bot/install.sh | sudo -E bash -
#   # OR, if you have cloned the repo:
#  cd personal-fb-bot
#   bash install.sh

set -euo pipefail

# ---------------------------------------------------------
# Defaults
# ---------------------------------------------------------
APP_DIR="${PWD}"
DB_PATH="${PERSONAL_FB_DB_PATH:-${APP_DIR}/data/fb.db}"
PORT="${PORT:-8787}"
HOST="${HOST:-0.0.0.0}"
ADMIN_TOKEN="${ADMIN_TOKEN:-change-me-please-now}"
NODE_ENV="${NODE_ENV:-production}"
USER="${SUDO_USER:-$(whoami)}"
LOG_FILE="/var/log/personal-fb-bot.log"

# Checks for root or sudo
if [[ $EUID -eq 0 ]]; then
  SUDO=""
else
  if [[ -x /usr/bin/sudo ]]; then
    SUDO="sudo"
  else
    echo "Error: this script needs sudo. Please run with: sudo bash install.sh"
    exit 1
  fi
fi

# Detect OS (Ubuntu/Debian-based only; terve it for Arch/RHEL if needed)
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

# Run a command with sudo if not root
run_sudo() {
  if [[ $EUID -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

# ---------------------------------------------------------
# Step 0: Show banner
# ---------------------------------------------------------
echo "============================================================"
echo " Personal FB Bot — auto installer"
echo "============================================================"
echo "WORKING DIRECTORY: ${APP_DIR}"
echo "DB PATH:           ${DB_PATH}"
echo "PORT:              ${PORT}"
echo "ADMIN_TOKEN:       ${ADMIN_TOKEN}"
echo "============================================================"

# ---------------------------------------------------------
# Step 1: Detect OS and install prerequisites
# ---------------------------------------------------------
echo ""
echo "[1/6] Detecting OS..."
OS=$(detect_os)
echo "    -> ${OS}"
case "${OS}" in
  debian)
    run_sudo apt-get update -qq
    run_sudo apt-get install -y -qq curl git ca-certificates
    ;;
  rhel)
    run_sudo dnf install -y -qq curl git
    ;;
  arch)
    run_sudo pacman -Syu --noconfirm curl git
    ;;
  *)
    echo "    -> WARNING: unknown OS. Installing curl and git manually."
    run_sudo apt-get install -y -qq curl git || run_sudo dnf install -y -qq curl git || run_sudo pacman -Syu --noconfirm curl git
    ;;
esac

# ---------------------------------------------------------
# Step 2: Install Node.js 18 (or 20) if missing
# ---------------------------------------------------------
echo ""
echo "[2/6] Checking Node.js..."
if command -v node >/dev/null 2>&1; then
  NODE_VER=$(node -v)
  echo "    node ${NODE_VER} already installed."
else
  echo "    Installing Node.js 18 LTS..."
  if [[ "${OS}" == "debian" ]]; then
    run_sudo curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    run_sudo apt-get install -y -qq nodejs
  elif [[ "${OS}" == "rhel" ]]; then
    run_sudo curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo -E bash -
    run_sudo dnf install -y -qq nodejs
  elif [[ "${OS}" == "arch" ]]; then
    run_sudo pacman -S --noconfirm nodejs npm
  else
    echo "    -> Could not auto-install Node. Please install Node 18+ manually."
    exit 1
  fi
  echo "    node $(node -v) installed."
fi

# ---------------------------------------------------------
# Step 3: Install npm dependencies
# ---------------------------------------------------------
echo ""
echo "[3/6] Installing npm dependencies..."
cd "${APP_DIR}"
if [[ ! -f package.json ]]; then
  echo "    Error: no package.json in ${APP_DIR}"
  exit 1
fi
npm install --no-audit --no-fund

# ---------------------------------------------------------
# Step 4: Install Playwright Chromium
# ---------------------------------------------------------
echo ""
echo "[4/6] Installing Playwright Chromium..."
if ! npx playwright install chromium 2>&1 | tail -1; then
  echo "    Error: Playwright Chromium install failed. You may need GUI dependencies:"
  echo "      Debian/Ubuntu: sudo apt-get install -y libnss3 libnss3-dev libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2"
  exit 1
fi
echo "    Chromium installed."

# ---------------------------------------------------------
# Step 5: Create data directory and write .env
# ---------------------------------------------------------
echo ""
echo "[5/6] Preparing data directory and environment..."
mkdir -p "${APP_DIR}/data"
mkdir -p "${APP_DIR}/.env.d"

# Write a local .env if it does not already exist
if [[ ! -f "${APP_DIR}/.env" ]]; then
  cat > "${APP_DIR}/.env" <<EOF
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
  echo "    Created ${APP_DIR}/.env"
fi

# ---------------------------------------------------------
# Step 6: Start or restart the service
# ---------------------------------------------------------
echo ""
echo "[6/6] Starting the server..."

# Check if systemd is available
if command -v systemctl >/dev/null 2>&1 && id -u "$USER" != 0; then
  echo "    Detected systemd. Creating systemd service..."

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
  echo "    Service started. Logs:"
  echo "      sudo journalctl -u personal-fb-bot -f"
else
  echo "    Running directly (no systemd)."
  nohup npm start > /tmp/personal-fb-bot.log 2>&1 &
  echo "    Server started (PID $!). Logs:"
  echo "      tail -f /tmp/personal-fb-bot.log"
fi

echo ""
echo "============================================================"
echo " Personal FB Bot is ready."
echo " Dashboard: http://localhost:${PORT}"
echo " Logs:        ${LOG_FILE} (or journalctl -u personal-fb-bot -f)"
echo " ADMIN_TOKEN: ${ADMIN_TOKEN}"
echo "============================================================"
