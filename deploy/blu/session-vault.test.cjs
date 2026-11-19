/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { openSessionVault } = require("./session-vault.cjs");

test("persists encrypted state for reuse and rejects tampering or a wrong key", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "blu-vault-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "session.enc");
  const key = randomBytes(32);
  const session = {
    deviceId: "synthetic-device",
    username: "fixture",
    password: "synthetic-password",
  };
  const vault = openSessionVault(file, key);
  assert.equal(vault.load(), null);
  vault.save(session);
  const encrypted = fs.readFileSync(file);
  assert(!encrypted.includes(Buffer.from(session.password)));
  assert(!encrypted.includes(Buffer.from(session.deviceId)));
  assert.deepEqual(openSessionVault(file, key).load(), session);
  if (process.platform !== "win32") assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.throws(() => openSessionVault(file, randomBytes(32)).load());
  encrypted[encrypted.length - 1] ^= 1;
  fs.writeFileSync(file, encrypted);
  assert.throws(() => vault.load());
});
