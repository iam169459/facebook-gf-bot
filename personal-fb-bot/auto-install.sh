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
#
# The script is self-locating: it finds the repository root automatically
# whether you run it from the repo root, from inside personal-fb-bot/, or
# pipe it from remote.

set -euo pipefail

# -----------------------------------------------------------
# Locate the repository root
# -----------------------------------------------------------
# If we are inside the repo (personal-fb-bot/ exists in this directory),
# use that as the repo root.
if [[ -f "${PWD}/personal-fb-bot/package.json" ]]; then
  REPO_ROOT="${PWD}"
  echo "    Repo root detected: ${REPO_ROOT}"
elif [[ -f "${PWD}/package.json" ]]; then
  # We were given a cloned repo (personal-fb-bot/ at top level)
  REPO_ROOT="${PWD}"
  echo "    Repo root detected: ${REPO_ROOT}"
else
  # Otherwise, look for personal-fb-bot in the current directory or
  # in the parent of the script's directory.
  if [[ -f "${PWD}/personal-fb-bot/package.json" ]]; then
    REPO_ROOT="${PWD}"
  elif [[ -f "${PWD}/personal-fb-bot/package.json" ]]; then
    REPO_ROOT="${PWD}"
  else
    # Fall back to PWD as the working directory
    REPO_ROOT="${PWD}"
    echo "    WARNING: personal-fb-bot/package.json not found in ${REPO_ROOT}."
    echo "    Proceeding from ${REPO_ROOT} (most likely you ran"
    echo "    this from inside the repository)."
  fi
fi

# Resolve to absolute path
REPO_ROOT="$(cd "${REPO_ROOT}" && pwd)"
APP_DIR="${REPO_ROOT}"

# -----------------------------------------------------------
# Defaults
# -----------------------------------------------------------
DB_PATH="${PERSONAL_FB_DB_PATH:-${REPO_ROOT}/personal-fb-bot/data/fb.db}"
PORT="${PORT:-8787}"
HOST="${HOST:-0.0.0.0}"
ADMIN_TOKEN="${ADMIN_TOKEN:-change-me-please-now}"
NODE_ENV="${NODE_ENV:-production}"
USER="${SUDO_USER:-$(whoami)}"
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
echo "WORKING DIRECTORY : ${REPO_ROOT}"
echo "DATA PATH         : ${DB_PATH}"
echo "PORT              : ${PORT}"
echo "ADMIN_TOKEN       : ${ADMIN_TOKEN}"
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
if [[ ! -f "${REPO_ROOT}/personal-fb-bot/package.json" ]]; then
  echo "    Cloning ${REPO_URL} into ${REPO_ROOT}..."
  git clone --depth 1 "https://github.com/iam169459/facebook-gf-bot.git" "${REPO_ROOT}/personal-fb-bot"
fi

# Step into the app directory
cd "${REPO_ROOT}/personal-fb-bot"

# -----------------------------------------------------------
# Step 3: Install npm dependencies
# -----------------------------------------------------------
echo ""
echo "[4/6] Installing npm dependencies..."
if [[ ! -f package.json ]]; then
  echo "    Error: no package.json in ${REPO_ROOT}/personal-fb-bot"
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
mkdir -p "${REPO_ROOT}/personal-fb-bot/data"
mkdir -p "${REPO_ROOT}/.env.d"

if [[ ! -f "${REPO_ROOT}/personal-fb-bot/.env" ]]; then
  cat > "${REPO_ROOT}/personal-fb-bot/.env" <<EOF
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
  echo "    Created ${REPO_ROOT}/personal-fb-bot/.env"
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
WorkingDirectory=${REPO_ROOT}/personal-fb-bot
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
