#!/usr/bin/env bash
# One-liner production setup for oostaAI.
#   ./setup.sh   (or: bash setup.sh)
set -euo pipefail

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"
ENV_EXAMPLE=".env.production.example"

echo "==> oostaAI production setup"

# 1) Ensure Docker is installed.
if ! command -v docker >/dev/null 2>&1; then
  echo "==> Docker not found — installing via get.docker.com ..."
  curl -fsSL https://get.docker.com | sh
  echo "==> Docker installed. You may need to log out and back in for group changes to apply."
else
  echo "==> Docker is already installed."
fi

# Ensure the Compose plugin is available.
if ! docker compose version >/dev/null 2>&1; then
  echo "ERROR: the 'docker compose' plugin is not available." >&2
  echo "       Install it (docker-compose-plugin) and re-run ./setup.sh" >&2
  exit 1
fi

# 2) Ensure the production env file exists.
if [ ! -f "$ENV_FILE" ]; then
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  echo ""
  echo "==> Created $ENV_FILE from $ENV_EXAMPLE."
  echo "    Edit it now (domain, DB password, JWT secret, Zarinpal, Telegram),"
  echo "    then run ./setup.sh again to launch."
  exit 0
fi

# 3) Build and start the production stack.
echo "==> Starting production containers ..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --build

echo ""
echo "==> Done. Useful commands:"
echo "    docker compose -f $COMPOSE_FILE ps"
echo "    docker compose -f $COMPOSE_FILE logs -f api web"
