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

usage() {
  cat <<EOF
oostaAI manager
  ./oosta.sh                 interactive menu
  ./oosta.sh doctor [fix]    diagnose (and optionally auto-fix)
  ./oosta.sh up | down | status | logs | seed | update | config
EOF
}

menu() {
  while true; do
    echo
    echo "${BOLD}oostaAI — setup menu${RESET}"
    echo "  1) Install / start  (build & launch)"
    echo "  2) Configure .env.production (guided)"
    echo "  3) Doctor (diagnose)"
    echo "  4) Doctor + auto-fix"
    echo "  5) Status"
    echo "  6) Logs (api + web)"
    echo "  7) Seed sample data"
    echo "  8) Update (git pull + rebuild)"
    echo "  9) Stop"
    echo "  0) Exit"
    local choice=""
    read_tty choice "Choose [0-9]: " || { warn "No terminal available — run ./oosta.sh from an interactive shell, or use a subcommand (./oosta.sh doctor)."; return 0; }
    case "$choice" in
      1) cmd_up ;;
      2) cmd_config ;;
      3) doctor ;;
      4) doctor fix ;;
      5) cmd_status ;;
      6) cmd_logs ;;
      7) cmd_seed ;;
      8) cmd_update ;;
      9) cmd_down ;;
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
  update) cmd_update ;;
  config) cmd_config ;;
  menu | "") menu ;;
  help | -h | --help) usage ;;
  *) usage; exit 1 ;;
esac
