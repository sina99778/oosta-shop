#!/usr/bin/env bash
# oostaAI manager — interactive setup menu + doctor (diagnose & auto-fix).
#
#   ./oosta.sh            # interactive menu
#   ./oosta.sh doctor     # diagnose
#   ./oosta.sh doctor fix # diagnose and auto-fix
#   ./oosta.sh up|down|status|logs|seed|update|config
#
# Safe to run via `curl ... | bash` (prompts read from /dev/tty).
set -uo pipefail

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"
ENV_EXAMPLE=".env.production.example"

# Resolve and enter the project dir (so relative compose paths work from anywhere).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors (only when stdout is a TTY).
if [ -t 1 ]; then
  BOLD=$'\e[1m'; RED=$'\e[31m'; GREEN=$'\e[32m'; YELLOW=$'\e[33m'; BLUE=$'\e[34m'; RESET=$'\e[0m'
else
  BOLD=""; RED=""; GREEN=""; YELLOW=""; BLUE=""; RESET=""
fi
ok()   { echo "${GREEN}✓${RESET} $*"; }
warn() { echo "${YELLOW}!${RESET} $*"; }
err()  { echo "${RED}✗${RESET} $*"; }
info() { echo "${BLUE}»${RESET} $*"; }

SUDO=""; [ "$(id -u)" -ne 0 ] && SUDO="sudo"

# Read input from the real terminal even when the script body arrived via a pipe.
read_tty() {
  local __var="$1" __prompt="${2:-}"
  [ -r /dev/tty ] || return 1
  read -r -p "$__prompt" "$__var" </dev/tty
}

dc() { docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"; }

gen_secret() { openssl rand -base64 "${1:-36}" | tr -d '\n'; }

get_env() { [ -f "$ENV_FILE" ] && grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -n1 | cut -d= -f2-; }
set_env() {
  local key="$1" val="$2" esc
  [ -f "$ENV_FILE" ] || cp "$ENV_EXAMPLE" "$ENV_FILE"
  esc=$(printf '%s' "$val" | sed -e 's/[\/&|]/\\&/g')
  if grep -qE "^$key=" "$ENV_FILE" 2>/dev/null; then
    sed -i -E "s|^$key=.*|$key=$esc|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$val" >>"$ENV_FILE"
  fi
}

# ---------------------------------------------------------------- doctor ----
doctor() {
  local fix="${1:-}" issues=0
  echo "${BOLD}oostaAI doctor${RESET}${fix:+ (auto-fix)}"
  echo

  # Docker
  if command -v docker >/dev/null 2>&1; then
    ok "Docker installed"
  else
    err "Docker not installed"
    if [ "$fix" = "fix" ]; then info "Installing Docker…"; curl -fsSL https://get.docker.com | $SUDO sh && ok "Docker installed"; else issues=$((issues + 1)); fi
  fi

  # Compose plugin
  if docker compose version >/dev/null 2>&1; then
    ok "Docker Compose plugin present"
  else
    err "Docker Compose plugin missing"
    if [ "$fix" = "fix" ]; then $SUDO apt-get update -y && $SUDO apt-get install -y docker-compose-plugin && ok "Compose plugin installed"; else issues=$((issues + 1)); fi
  fi

  # Daemon
  if docker info >/dev/null 2>&1; then
    ok "Docker daemon reachable"
  else
    err "Docker daemon not running / not accessible"
    if [ "$fix" = "fix" ]; then $SUDO systemctl enable --now docker 2>/dev/null && ok "Docker daemon started"; else issues=$((issues + 1)); fi
  fi

  # Env file
  if [ -f "$ENV_FILE" ]; then
    ok "$ENV_FILE exists"
  else
    err "$ENV_FILE missing"
    if [ "$fix" = "fix" ]; then cp "$ENV_EXAMPLE" "$ENV_FILE" && ok "created $ENV_FILE from example"; else issues=$((issues + 1)); fi
  fi

  if [ -f "$ENV_FILE" ]; then
    local jwt pg origin
    jwt=$(get_env JWT_SECRET)
    if [ -z "$jwt" ] || [ "$jwt" = "replace-with-a-long-random-secret" ]; then
      err "JWT_SECRET is unset/placeholder"
      if [ "$fix" = "fix" ]; then set_env JWT_SECRET "$(gen_secret 36)" && ok "generated a strong JWT_SECRET"; else issues=$((issues + 1)); fi
    else ok "JWT_SECRET is set"; fi

    pg=$(get_env POSTGRES_PASSWORD)
    if [ -z "$pg" ] || [ "$pg" = "change-me-to-a-strong-password" ]; then
      err "POSTGRES_PASSWORD is unset/placeholder"
      if [ "$fix" = "fix" ]; then set_env POSTGRES_PASSWORD "$(gen_secret 24)" && ok "generated a strong POSTGRES_PASSWORD"; else issues=$((issues + 1)); fi
    else ok "POSTGRES_PASSWORD is set"; fi

    origin=$(get_env PUBLIC_ORIGIN)
    if [ -z "$origin" ] || [ "$origin" = "https://your-domain.com" ]; then
      err "PUBLIC_ORIGIN not set to your domain — edit $ENV_FILE (cannot auto-fix)"
      issues=$((issues + 1))
    else ok "PUBLIC_ORIGIN = $origin"; fi
  fi

  # Memory / swap
  local memk swapk
  memk=$(awk '/MemTotal/{print $2}' /proc/meminfo 2>/dev/null); memk=${memk:-0}
  swapk=$(awk '/SwapTotal/{print $2}' /proc/meminfo 2>/dev/null); swapk=${swapk:-0}
  if [ "$memk" -gt 0 ] && [ "$memk" -lt 1500000 ] && [ "$swapk" -lt 500000 ]; then
    warn "Low RAM ($((memk / 1024)) MB) with little swap — the build may be OOM-killed"
    if [ "$fix" = "fix" ] && [ ! -f /swapfile ]; then
      info "Creating a 2G swap file…"
      $SUDO fallocate -l 2G /swapfile && $SUDO chmod 600 /swapfile && $SUDO mkswap /swapfile >/dev/null &&
        $SUDO swapon /swapfile && echo '/swapfile none swap sw 0 0' | $SUDO tee -a /etc/fstab >/dev/null && ok "2G swap enabled"
    fi
  else
    ok "Memory looks sufficient"
  fi

  # Ports 80/443
  if command -v ss >/dev/null 2>&1; then
    local p
    for p in 80 443; do
      if $SUDO ss -ltn 2>/dev/null | grep -q ":$p "; then
        warn "Port $p is already in use — make sure it's oostaAI's nginx and not another web server"
      fi
    done
  fi

  # Stack state
  if docker info >/dev/null 2>&1 && [ -f "$ENV_FILE" ]; then
    if [ -n "$(dc ps -q 2>/dev/null)" ]; then ok "Containers are running"; else info "Stack is not started yet (use the menu → Install / start)"; fi
  fi

  echo
  if [ "$issues" -eq 0 ]; then
    ok "${BOLD}No blocking issues.${RESET}"
  else
    warn "${BOLD}${issues} issue(s) found.${RESET} Re-run with auto-fix: ${BOLD}./oosta.sh doctor fix${RESET}"
  fi
}

# --------------------------------------------------------------- actions ----
cmd_config() {
  [ -f "$ENV_FILE" ] || cp "$ENV_EXAMPLE" "$ENV_FILE"
  local v
  read_tty v "Public domain incl. https:// [$(get_env PUBLIC_ORIGIN)]: " || { warn "No terminal — edit $ENV_FILE manually."; return; }
  [ -n "$v" ] && set_env PUBLIC_ORIGIN "$v"

  # Auto-generate any placeholder secrets.
  [ "$(get_env JWT_SECRET)" = "replace-with-a-long-random-secret" ] && { set_env JWT_SECRET "$(gen_secret 36)"; ok "generated JWT_SECRET"; }
  [ "$(get_env POSTGRES_PASSWORD)" = "change-me-to-a-strong-password" ] && { set_env POSTGRES_PASSWORD "$(gen_secret 24)"; ok "generated POSTGRES_PASSWORD"; }

  read_tty v "Zarinpal merchant id (blank to skip / keep mock): " || true
  if [ -n "${v:-}" ]; then set_env ZARINPAL_MERCHANT_ID "$v"; set_env PAYMENT_PROVIDER "zarinpal"; set_env ZARINPAL_SANDBOX "false"; ok "Zarinpal enabled"; fi
  read_tty v "Telegram bot token (blank to skip): " || true
  [ -n "${v:-}" ] && set_env TELEGRAM_BOT_TOKEN "$v"
  read_tty v "Telegram admin id (blank to skip): " || true
  [ -n "${v:-}" ] && set_env TELEGRAM_ADMIN_ID "$v"
  ok "Saved to $ENV_FILE"
}

cmd_up() {
  if [ ! -f "$ENV_FILE" ]; then warn "$ENV_FILE not found — run 'Configure' first."; return; fi
  info "Building and starting the stack…"
  dc up -d --build && ok "Stack is up." && dc ps
}
cmd_down() { dc down && ok "Stack stopped."; }
cmd_status() { dc ps; }
cmd_logs() { dc logs --tail=120 api web; }
cmd_seed() { dc exec api npm run db:seed; }
cmd_update() { info "Updating…"; git pull --ff-only && dc up -d --build && ok "Updated and restarted."; }

cmd_backup() {
  mkdir -p backups
  local ts user db f
  ts=$(date +%Y%m%d-%H%M%S)
  user=$(get_env POSTGRES_USER); user=${user:-oosta}
  db=$(get_env POSTGRES_DB); db=${db:-oosta}
  f="backups/oosta-$ts.sql.gz"
  info "Dumping database to $f …"
  if dc exec -T postgres pg_dump --clean --if-exists --no-owner -U "$user" "$db" | gzip -9 >"$f"; then
    ok "Backup saved: $f ($(du -h "$f" 2>/dev/null | cut -f1))"
  else
    err "Backup failed (is the stack running?)"; rm -f "$f"
  fi
}

cmd_restore() {
  local file="${1:-}"
  if [ -z "$file" ]; then read_tty file "Path to backup (.sql or .sql.gz): " || { err "No file given."; return; }; fi
  [ -f "$file" ] || { err "File not found: $file"; return; }
  warn "This OVERWRITES the current database with: $file"
  local confirm=""
  read_tty confirm "Type 'yes' to continue: " || return
  [ "$confirm" = "yes" ] || { info "Cancelled."; return; }
  local user db rc
  user=$(get_env POSTGRES_USER); user=${user:-oosta}
  db=$(get_env POSTGRES_DB); db=${db:-oosta}
  info "Stopping api during restore…"; dc stop api >/dev/null 2>&1 || true
  if [ "${file##*.}" = "gz" ]; then
    gunzip -c "$file" | dc exec -T postgres psql -v ON_ERROR_STOP=1 -U "$user" -d "$db"
  else
    dc exec -T postgres psql -v ON_ERROR_STOP=1 -U "$user" -d "$db" <"$file"
  fi
  rc=$?
  info "Restarting api…"; dc start api >/dev/null 2>&1 || true
  if [ "$rc" -eq 0 ]; then ok "Restore complete."; else err "Restore failed (exit $rc)."; fi
}

# Write an HTTPS nginx config (HTTP->HTTPS redirect + TLS termination on origin).
write_https_conf() {
  local domain="$1"
  cat >deploy/nginx/default.conf <<EOF
server {
  listen 80;
  server_name ${domain} www.${domain};
  location / { return 301 https://\$host\$request_uri; }
}

server {
  listen 443 ssl;
  http2 on;
  server_name ${domain} www.${domain};

  ssl_certificate     /etc/nginx/certs/fullchain.pem;
  ssl_certificate_key /etc/nginx/certs/privkey.pem;
  client_max_body_size 2m;

  location /api/ {
    proxy_pass http://api:4000/;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }
  location / {
    proxy_pass http://web:3000;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
EOF
}

install_renew_cron() {
  local line
  line="0 3 * * 1 cd $SCRIPT_DIR && ./oosta.sh renew-ssl >> /var/log/oosta-ssl.log 2>&1 # oosta-ssl"
  { $SUDO crontab -l 2>/dev/null | grep -v 'oosta-ssl'; echo "$line"; } | $SUDO crontab - &&
    ok "Weekly auto-renew cron installed."
}

# Obtain a Let's Encrypt cert (standalone) and switch nginx to HTTPS.
# Requires the domain to point directly at this server (ArvanCloud proxy OFF).
cmd_ssl() {
  local domain="${1:-}" email="${2:-}" c
  if [ -z "$domain" ]; then read_tty domain "Domain (e.g. oostaai.store): " || { err "No domain."; return; }; fi
  if [ -z "$email" ]; then read_tty email "Email (Let's Encrypt notices): " || { err "No email."; return; }; fi

  echo
  warn "Let's Encrypt validates over port 80 of THIS server. First, in ArvanCloud:"
  warn "  • turn the cloud/proxy OFF (DNS-only / grey) for @ and www so $domain points here"
  warn "  • open ports 80 and 443 (sudo ufw allow 80/tcp && sudo ufw allow 443/tcp)"
  read_tty c "Type 'yes' when DNS points directly to this server: " || return
  [ "$c" = "yes" ] || { info "Cancelled."; return; }

  if ! command -v certbot >/dev/null 2>&1; then
    info "Installing certbot…"
    $SUDO apt-get update -y && $SUDO apt-get install -y certbot
  fi

  info "Stopping nginx to free port 80…"
  dc stop nginx >/dev/null 2>&1 || true
  if $SUDO certbot certonly --standalone --non-interactive --agree-tos -m "$email" -d "$domain" -d "www.$domain"; then
    mkdir -p deploy/nginx/certs
    $SUDO cp "/etc/letsencrypt/live/$domain/fullchain.pem" deploy/nginx/certs/fullchain.pem
    $SUDO cp "/etc/letsencrypt/live/$domain/privkey.pem" deploy/nginx/certs/privkey.pem
    $SUDO chmod 600 deploy/nginx/certs/privkey.pem 2>/dev/null || true
    printf '%s\n' "$domain" >deploy/nginx/.ssl-domain
    write_https_conf "$domain"
    info "Starting nginx with HTTPS…"
    dc up -d nginx
    install_renew_cron
    ok "HTTPS is live at https://$domain"
    warn "Now set PUBLIC_ORIGIN=https://$domain in .env.production, then run: ./oosta.sh up"
  else
    err "certbot failed — confirm $domain resolves to this server and 80/443 are open."
    dc up -d nginx >/dev/null 2>&1 || true
  fi
}

cmd_renew_ssl() {
  local domain=""
  [ -f deploy/nginx/.ssl-domain ] && domain=$(cat deploy/nginx/.ssl-domain)
  info "Renewing certificates…"
  dc stop nginx >/dev/null 2>&1 || true
  $SUDO certbot renew --quiet || warn "certbot renew returned non-zero"
  if [ -n "$domain" ] && [ -f "/etc/letsencrypt/live/$domain/fullchain.pem" ]; then
    $SUDO cp "/etc/letsencrypt/live/$domain/fullchain.pem" deploy/nginx/certs/fullchain.pem
    $SUDO cp "/etc/letsencrypt/live/$domain/privkey.pem" deploy/nginx/certs/privkey.pem
    $SUDO chmod 600 deploy/nginx/certs/privkey.pem 2>/dev/null || true
  fi
  dc up -d nginx
  ok "Renew cycle complete."
}

usage() {
  cat <<EOF
oostaAI manager
  ./oosta.sh                 interactive menu
  ./oosta.sh doctor [fix]    diagnose (and optionally auto-fix)
  ./oosta.sh ssl <domain> <email>   set up Let's Encrypt HTTPS on this server
  ./oosta.sh up | down | status | logs | seed | update | config
  ./oosta.sh backup | restore <file.sql[.gz]> | renew-ssl
EOF
}

menu() {
  while true; do
    echo
    echo "${BOLD}oostaAI — setup menu${RESET}"
    echo "   1) Install / start  (build & launch)"
    echo "   2) Configure .env.production (guided)"
    echo "   3) Set up HTTPS (Let's Encrypt)"
    echo "   4) Doctor (diagnose)"
    echo "   5) Doctor + auto-fix"
    echo "   6) Status"
    echo "   7) Logs (api + web)"
    echo "   8) Seed sample data"
    echo "   9) Backup database (save locally)"
    echo "  10) Restore database (from a file)"
    echo "  11) Update (git pull + rebuild)"
    echo "  12) Stop"
    echo "   0) Exit"
    local choice=""
    read_tty choice "Choose [0-12]: " || { warn "No terminal available — run ./oosta.sh from an interactive shell, or use a subcommand (./oosta.sh doctor)."; return 0; }
    case "$choice" in
      1) cmd_up ;;
      2) cmd_config ;;
      3) cmd_ssl ;;
      4) doctor ;;
      5) doctor fix ;;
      6) cmd_status ;;
      7) cmd_logs ;;
      8) cmd_seed ;;
      9) cmd_backup ;;
      10) cmd_restore ;;
      11) cmd_update ;;
      12) cmd_down ;;
      0) exit 0 ;;
      *) warn "Unknown option: ${choice:-（empty）}" ;;
    esac
  done
}

case "${1:-menu}" in
  doctor) doctor "${2:-}" ;;
  up | start) cmd_up ;;
  down | stop) cmd_down ;;
  status) cmd_status ;;
  logs) cmd_logs ;;
  seed) cmd_seed ;;
  backup) cmd_backup ;;
  restore) cmd_restore "${2:-}" ;;
  ssl) cmd_ssl "${2:-}" "${3:-}" ;;
  renew-ssl) cmd_renew_ssl ;;
  update) cmd_update ;;
  config) cmd_config ;;
  menu | "") menu ;;
  help | -h | --help) usage ;;
  *) usage; exit 1 ;;
esac
