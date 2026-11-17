#!/usr/bin/env bash
set -euo pipefail
script="$(cd "$(dirname "$0")" && pwd)/oosta-backup"
workspace=$(mktemp -d /tmp/oosta-backup-test.XXXXXX)
trap 'rm -rf -- "$workspace"' EXIT
mkdir "$workspace/bin"
export OOSTA_BACKUP_LOCK="$workspace/backup.lock"
export OOSTA_BACKUP_PROGRAM="$workspace/program.cjs"
export MOCK_CALLS="$workspace/calls"
printf 'synthetic encrypted sender\n' > "$OOSTA_BACKUP_PROGRAM"
cat > "$workspace/bin/docker" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
[[ "$*" = 'exec -i oosta-api-1 node' ]]
test "$(cat)" = 'synthetic encrypted sender'
echo called >> "$MOCK_CALLS"
exit "${MOCK_STATUS:-0}"
MOCK
chmod 700 "$workspace/bin/docker"
export PATH="$workspace/bin:$PATH"
bash "$script"
test "$(wc -l < "$MOCK_CALLS")" -eq 1
if MOCK_STATUS=1 bash "$script"; then echo 'FAIL: ignored Telegram failure'; exit 1; fi
test "$(wc -l < "$MOCK_CALLS")" -eq 2
flock "$OOSTA_BACKUP_LOCK" bash -c 'bash "$1"' -- "$script"
test "$(wc -l < "$MOCK_CALLS")" -eq 2
echo 'PASS: Telegram-only backup runner, failure propagation and concurrent lock'
