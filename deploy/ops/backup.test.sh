#!/usr/bin/env bash
set -euo pipefail
script="$(cd "$(dirname "$0")" && pwd)/oosta-backup"
workspace=$(mktemp -d /tmp/oosta-backup-test.XXXXXX)
trap 'rm -rf -- "$workspace"' EXIT
mkdir "$workspace/bin"
export OOSTA_BACKUP_DIR="$workspace/archives"
export OOSTA_BACKUP_LOCK="$workspace/backup.lock"
export MOCK_MODE=ok
cat > "$workspace/bin/docker" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == exec && "$3" == node ]]; then
  [[ "$MOCK_MODE" != exec-failure ]] || exit 1
  if [[ "$MOCK_MODE" == invalid-path ]]; then echo /etc/shadow; else
    echo /tmp/oosta-backup-Ab1234/oosta-2026-11-17T00-00-00-000Z.sql.gz.age
  fi
elif [[ "$1" == cp ]]; then
  [[ "$MOCK_MODE" != copy-failure ]] || exit 1
  printf 'age-encryption.org/v1\nsynthetic ciphertext only\n' > "$3"
elif [[ "$1" == exec && "$3" == rm ]]; then :
elif [[ "$1" == exec && "$3" == rmdir ]]; then :
else echo 'unexpected synthetic command' >&2; exit 1; fi
MOCK
chmod 700 "$workspace/bin/docker"
export PATH="$workspace/bin:$PATH"
bash "$script"
test "$(find "$OOSTA_BACKUP_DIR" -name 'oosta-daily-*.sql.gz.age' | wc -l)" -eq 1
test "$(stat -c %a "$OOSTA_BACKUP_DIR")" = 700
test "$(stat -c %a "$OOSTA_BACKUP_DIR"/oosta-daily-*.sql.gz.age)" = 600
for mode in exec-failure invalid-path copy-failure; do
  export MOCK_MODE="$mode"
  if bash "$script"; then echo "FAIL: accepted $mode" >&2; exit 1; fi
  test "$(find "$OOSTA_BACKUP_DIR" -name 'oosta-daily-*.sql.gz.age' | wc -l)" -eq 1
  test "$(find "$OOSTA_BACKUP_DIR" -name '.pending.*' | wc -l)" -eq 0
done
export MOCK_MODE=ok
touch "$OOSTA_BACKUP_DIR/oosta-daily-20000101T000000Z.sql.gz.age" "$OOSTA_BACKUP_DIR/keep-unrelated.txt"
touch -d '60 days ago' "$OOSTA_BACKUP_DIR/oosta-daily-20000101T000000Z.sql.gz.age" "$OOSTA_BACKUP_DIR/keep-unrelated.txt"
sleep 1
bash "$script"
test ! -f "$OOSTA_BACKUP_DIR/oosta-daily-20000101T000000Z.sql.gz.age"
test -f "$OOSTA_BACKUP_DIR/keep-unrelated.txt"
flock "$OOSTA_BACKUP_LOCK" bash -c 'bash "$1"' -- "$script"
echo 'PASS: encrypted backup publication, private modes, source/copy/path failure, retention boundary and concurrent lock'
