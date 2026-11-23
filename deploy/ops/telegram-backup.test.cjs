/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
require("tsx/cjs");
const { deliverBackup } = require("../../apps/api/src/lib/telegram-backup.ts");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

test("delivers a 51 MB archive in independently downloadable, ordered parts", async () => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "oosta-backup-test-"));
  const archive = path.join(dir, "large.sql.gz.age");
  const original = Buffer.alloc(51_000_001, 0x45);
  original[19_000_000] = 0x67;
  original[38_000_000] = 0xab;
  await fs.promises.writeFile(archive, original);
  const parts = [];
  let retried = false;
  try {
    await deliverBackup({
      chatId: 12345,
      create: async () => ({ file: archive, cleanup: async () => fs.promises.unlink(archive) }),
      pause: async () => {},
      send: async (id, { source, filename: name }) => {
        const chunks = [];
        for await (const chunk of source) chunks.push(chunk);
        const bytes = Buffer.concat(chunks);
        if (bytes.length > 19_000_000) throw Error("Exceeds provider download limit");
        if (parts.length === 1 && !retried) {
          retried = true;
          throw Error("Temporary failure after reading the second part");
        }
        parts.push({ name, bytes });
        return {
          message_id: parts.length,
          chat: { id, type: "private" },
          document: { file_name: name },
        };
      },
    });
    assert.deepEqual(
      parts.map((part) => part.name),
      [
        "large.sql.gz.age.part-0001-of-0003",
        "large.sql.gz.age.part-0002-of-0003",
        "large.sql.gz.age.part-0003-of-0003",
      ],
    );
    assert.equal(retried, true);
    assert.deepEqual(Buffer.concat(parts.map((part) => part.bytes)), original);
    assert.equal(fs.existsSync(archive), false);
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
});

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
      const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "oosta-backup-test-"));
      const file = path.join(dir, "synthetic.sql.gz.age");
      await fs.promises.writeFile(file, "synthetic archive");
      return {
        file,
        cleanup: async () => {
          await fs.promises.unlink(file);
          await fs.promises.rmdir(dir);
          cleaned++;
        },
      };
    },
    send: async (chat, { source, filename }) => {
      sent++;
      assert.equal(chat, 12345);
      assert.equal(filename, "synthetic.sql.gz.age");
      const chunks = [];
      for await (const chunk of source) chunks.push(chunk);
      assert.equal(Buffer.concat(chunks).toString(), "synthetic archive");
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
