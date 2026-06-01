#!/usr/bin/env bash
# oostaAI remote installer — bootstrap a fresh Ubuntu/Debian VPS in one line.
#
#   curl -fsSL https://raw.githubusercontent.com/sina99778/oosta-shop/main/install.sh | bash
#
# Run as root (recommended on a fresh VPS) or a user already in the `docker` group.
#
# Optional environment variables:
#   TARGET_DIR    install location            (default: $HOME/oosta-shop)
#   REPO_URL      git URL to clone            (default: the public HTTPS URL below)
#   GITHUB_TOKEN  token for a PRIVATE repo    (used to authenticate the clone)
set -euo pipefail

REPO_SLUG="sina99778/oosta-shop"
TARGET_DIR="${TARGET_DIR:-$HOME/oosta-shop}"

if [ -n "${GITHUB_TOKEN:-}" ]; then
  REPO_URL="${REPO_URL:-https://${GITHUB_TOKEN}@github.com/${REPO_SLUG}.git}"
else
  REPO_URL="${REPO_URL:-https://github.com/${REPO_SLUG}.git}"
fi

# Use sudo only when not already root.
if [ "$(id -u)" -eq 0 ]; then SUDO=""; else SUDO="sudo"; fi

echo "==> oostaAI installer"

# 1) Base tools
if ! command -v git >/dev/null 2>&1 || ! command -v curl >/dev/null 2>&1; then
  echo "==> Installing git and curl ..."
  $SUDO apt-get update -y
  $SUDO apt-get install -y git curl ca-certificates
fi

# 2) Docker (+ compose plugin via the official convenience script)
if ! command -v docker >/dev/null 2>&1; then
  echo "==> Installing Docker ..."
  curl -fsSL https://get.docker.com | $SUDO sh
fi

# 3) Clone or update the project
if [ -d "$TARGET_DIR/.git" ]; then
  echo "==> Updating existing checkout in $TARGET_DIR ..."
  git -C "$TARGET_DIR" pull --ff-only
else
  echo "==> Cloning $REPO_SLUG into $TARGET_DIR ..."
  git clone "$REPO_URL" "$TARGET_DIR"
fi

cd "$TARGET_DIR"
chmod +x oosta.sh setup.sh 2>/dev/null || true

# 4) Hand off to the in-repo manager (interactive setup menu + doctor).
echo "==> Launching the oostaAI setup menu ..."
exec bash oosta.sh
