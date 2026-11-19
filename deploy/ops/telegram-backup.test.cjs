/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { deliverBackup } = require("./telegram-backup.cjs");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

test("container stdin entrypoint executes and fails closed without a bot token", () => {
  const result = spawnSync(process.execPath, [], {
    input: fs.readFileSync(path.join(__dirname, "telegram-backup.cjs")),
    env: { ...process.env, TELEGRAM_BOT_TOKEN: "" },
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /TELEGRAM_ENCRYPTED_BACKUP_FAILED/);
});

function fixture() {
  let cleaned = 0,
    created = 0,
    sent = 0;
  const options = {
    chatId: 12345,
    recipient: "synthetic-recipient",
    create: async () => {
      created++;
      return {
        file: "/tmp/synthetic.sql.gz.age",
        cleanup: async () => {
          cleaned++;
        },
      };
    },
    send: async (chat, file) => {
      sent++;
      assert.equal(chat, 12345);
      assert(file.endsWith(".sql.gz.age"));
      return {
        message_id: 42,
        chat: { id: 12345, type: "private" },
        document: { file_name: "synthetic.sql.gz.age" },
      };
    },
    pause: async () => {},
  };
  return { options, counts: () => ({ cleaned, created, sent }) };
}
test("sends only encrypted backup to configured private admin and removes temporary archive", async () => {
  const f = fixture();
  assert.equal((await deliverBackup(f.options)).messageId, 42);
  assert.deepEqual(f.counts(), { cleaned: 1, created: 1, sent: 1 });
});
test("retries bounded transport failure using the same encrypted archive", async () => {
  const f = fixture(),
    send = f.options.send;
  let tries = 0;
  f.options.send = async (...args) => {
    if (++tries < 3) throw Error("synthetic transport failure");
    return send(...args);
  };
  await deliverBackup(f.options);
  assert.equal(tries, 3);
  assert.equal(f.counts().created, 1);
  assert.equal(f.counts().cleaned, 1);
});
test("cleans after permanent failure without printing provider errors", async () => {
  const f = fixture();
  let tries = 0;
  f.options.send = async () => {
    tries++;
    throw Error("sensitive provider response");
  };
  await assert.rejects(deliverBackup(f.options), /Telegram backup delivery failed/);
  assert.equal(tries, 3);
  assert.equal(f.counts().cleaned, 1);
});
test("rejects plaintext and unconfirmed destinations", async () => {
  const f = fixture();
  f.options.create = async () => ({ file: "/tmp/plain.sql.gz", cleanup: async () => {} });
  await assert.rejects(deliverBackup(f.options), /Encrypted archive required/);
  assert.equal(f.counts().sent, 0);
  const g = fixture();
  g.options.send = async () => ({
    message_id: 42,
    chat: { id: 9876, type: "private" },
    document: { file_name: "synthetic.sql.gz.age" },
  });
  await assert.rejects(deliverBackup(g.options), /Telegram backup delivery failed/);
  assert.equal(g.counts().cleaned, 1);
});
test("invalid admin fails before generating database backup", async () => {
  const f = fixture();
  f.options.chatId = -10;
  await assert.rejects(deliverBackup(f.options), /Private admin required/);
  assert.equal(f.counts().created, 0);
});
