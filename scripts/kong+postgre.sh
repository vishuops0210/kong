#!/usr/bin/env bash
# =============================================================================
# install-kong.sh — Install & configure Kong Enterprise + PostgreSQL
# Ubuntu 24.04 (Noble) | Kong Enterprise Edition 3.14.0.2
# =============================================================================
set -euo pipefail
IFS=$'\n\t'

# ─── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

log()     { echo -e "${GREEN}[INFO]${RESET}  $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error()   { echo -e "${RED}[ERROR]${RESET} $*" >&2; exit 1; }
section() { echo -e "\n${CYAN}${BOLD}▶ $*${RESET}"; }

# ─── Configuration ────────────────────────────────────────────────────────────
# Edit these before running the script.
KONG_DB_USER="kong"
KONG_DB_NAME="kong"
KONG_DB_PASSWORD="opstree@123"          # ← change in production
KONG_DEB_URL="https://packages.konghq.com/public/gateway-314/deb/ubuntu/pool/noble/main/k/ko/kong-enterprise-edition_3.14.0.2/kong-enterprise-edition_3.14.0.2_amd64.deb"
KONG_DEB_FILE="/tmp/kong-enterprise-edition.deb"
KONG_LOG_DIR="/usr/local/kong/logs"
KONG_PID_DIR="/usr/local/kong/pids"

# ─── Pre-flight checks ────────────────────────────────────────────────────────
section "Pre-flight checks"

[[ $EUID -ne 0 ]] && error "Run this script as root or with sudo."

DISTRO=$(lsb_release -cs 2>/dev/null || true)
[[ "$DISTRO" != "noble" ]] && warn "Script is tested on Ubuntu 24.04 (Noble). Current: ${DISTRO}."

log "All pre-flight checks passed."

# ─── Step 1 — PostgreSQL ──────────────────────────────────────────────────────
section "Step 1 — Install PostgreSQL"

apt-get update -qq
apt-get install -y postgresql postgresql-contrib

systemctl start postgresql
systemctl enable postgresql
systemctl is-active --quiet postgresql && log "PostgreSQL is running." || error "PostgreSQL failed to start."

log "Creating Kong DB user and database…"
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${KONG_DB_USER}') THEN
    CREATE USER ${KONG_DB_USER} WITH PASSWORD '${KONG_DB_PASSWORD}';
    RAISE NOTICE 'User ${KONG_DB_USER} created.';
  ELSE
    ALTER USER ${KONG_DB_USER} WITH PASSWORD '${KONG_DB_PASSWORD}';
    RAISE NOTICE 'User ${KONG_DB_USER} already exists — password updated.';
  END IF;
END
\$\$;

SELECT 'CREATE DATABASE ${KONG_DB_NAME} OWNER ${KONG_DB_USER}'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${KONG_DB_NAME}') \gexec

GRANT ALL PRIVILEGES ON DATABASE ${KONG_DB_NAME} TO ${KONG_DB_USER};
SQL

log "Verifying DB connection as Kong user…"
PGPASSWORD="${KONG_DB_PASSWORD}" psql \
  -h 127.0.0.1 -U "${KONG_DB_USER}" -d "${KONG_DB_NAME}" \
  -c "SELECT version();" -q \
  && log "Connection verified." \
  || error "Could not connect to PostgreSQL as '${KONG_DB_USER}'."

# ─── Step 2 — Install Kong ────────────────────────────────────────────────────
section "Step 2 — Install Kong Enterprise"

apt-get install -y curl openssl procps perl libpcre3

if [[ ! -f "${KONG_DEB_FILE}" ]]; then
  log "Downloading Kong package…"
  curl -fsSL -o "${KONG_DEB_FILE}" "${KONG_DEB_URL}" \
    || error "Download failed. Check the URL or your internet connection."
else
  warn "Package already downloaded at ${KONG_DEB_FILE} — skipping download."
fi

apt-get install -y "${KONG_DEB_FILE}"
kong version && log "Kong installed successfully." || error "Kong binary not found after install."

# ─── Step 3 — Configure kong.conf ────────────────────────────────────────────
section "Step 3 — Configure kong.conf"

KONG_CONF="/etc/kong/kong.conf"
KONG_CONF_DEFAULT="/etc/kong/kong.conf.default"

[[ ! -f "${KONG_CONF_DEFAULT}" ]] && error "Default config not found at ${KONG_CONF_DEFAULT}."

if [[ -f "${KONG_CONF}" ]]; then
  BACKUP="${KONG_CONF}.bak.$(date +%Y%m%d_%H%M%S)"
  warn "Existing kong.conf found — backing up to ${BACKUP}"
  cp "${KONG_CONF}" "${BACKUP}"
fi

cp "${KONG_CONF_DEFAULT}" "${KONG_CONF}"

# Helper: uncomment a key and set its value in kong.conf
set_conf() {
  local key="$1" val="$2"
  # Remove any existing active/commented setting for the key, then append it
  sed -i "/^[#[:space:]]*${key}[[:space:]]*=/d" "${KONG_CONF}"
  echo "${key} = ${val}" >> "${KONG_CONF}"
}

set_conf "database"               "postgres"
set_conf "pg_host"                "127.0.0.1"
set_conf "pg_port"                "5432"
set_conf "pg_database"            "${KONG_DB_NAME}"
set_conf "pg_user"                "${KONG_DB_USER}"
set_conf "pg_password"            "${KONG_DB_PASSWORD}"
set_conf "proxy_listen"           "0.0.0.0:8000, 0.0.0.0:8443 ssl"
set_conf "admin_listen"           "127.0.0.1:8001"   # never expose to 0.0.0.0
set_conf "admin_gui_listen"       "0.0.0.0:8002"
set_conf "status_listen"          "0.0.0.0:8100"
set_conf "proxy_access_log"       "${KONG_LOG_DIR}/access.log"
set_conf "proxy_error_log"        "${KONG_LOG_DIR}/error.log"
set_conf "log_level"              "notice"
set_conf "nginx_worker_processes" "auto"
set_conf "mem_cache_size"         "256m"

log "Validating kong.conf…"
kong check && log "kong.conf is valid." || error "kong.conf has errors — fix before continuing."

# ─── Step 4 — Bootstrap database ─────────────────────────────────────────────
section "Step 4 — Bootstrap the database"

log "Running migrations (this may take a moment)…"
kong migrations bootstrap \
  && log "Database bootstrap complete." \
  || error "Migrations failed. Check postgres connectivity and credentials."

# ─── Step 5 — Start Kong ──────────────────────────────────────────────────────
section "Step 5 — Start Kong"

mkdir -p "${KONG_LOG_DIR}" "${KONG_PID_DIR}"

# Gracefully handle already-running Kong
if kong health &>/dev/null; then
  warn "Kong is already running — reloading instead of starting."
  kong reload && log "Kong reloaded." || error "Kong reload failed."
else
  kong start && log "Kong started." || error "Kong failed to start. Check ${KONG_LOG_DIR}/error.log"
fi

log "Running health check…"
kong health

# ─── Summary ──────────────────────────────────────────────────────────────────
section "Done"

cat <<EOF

${BOLD}Kong is up and healthy!${RESET}

  Proxy HTTP   →  http://<your-ip>:8000
  Proxy HTTPS  →  https://<your-ip>:8443
  Admin API    →  http://127.0.0.1:8001   (localhost only)
  Manager UI   →  http://<your-ip>:8002
  Status       →  http://<your-ip>:8100/status

Logs          :  ${KONG_LOG_DIR}/
Config        :  ${KONG_CONF}

Next step: add your Node.js service as a Kong Service + Route.
EOF