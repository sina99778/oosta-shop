/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const { createCipheriv, createDecipheriv, randomBytes } = require("node:crypto");
const {
  closeSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} = require("node:fs");
const { dirname } = require("node:path");

const header = Buffer.from("OOSTA-BLU-1\0");
const nonceSize = 12;
const tagSize = 16;

function openSessionVault(file, key) {
  if (key.length !== 32) throw new Error("Invalid session vault key");
  return {
    load() {
      let blob;
      try {
        blob = readFileSync(file);
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
      }
      const tagStart = header.length + nonceSize;
      const contentStart = tagStart + tagSize;
      if (blob.length <= contentStart || !blob.subarray(0, header.length).equals(header)) {
        throw new Error("Invalid session vault");
      }
      const decipher = createDecipheriv("aes-256-gcm", key, blob.subarray(header.length, tagStart));
      decipher.setAAD(header);
      decipher.setAuthTag(blob.subarray(tagStart, contentStart));
      const contents = Buffer.concat([
        decipher.update(blob.subarray(contentStart)),
        decipher.final(),
      ]);
      return JSON.parse(contents.toString("utf8"));
    },
    save(session) {
      const nonce = randomBytes(nonceSize);
      const cipher = createCipheriv("aes-256-gcm", key, nonce);
      cipher.setAAD(header);
      const ciphertext = Buffer.concat([
        cipher.update(JSON.stringify(session), "utf8"),
        cipher.final(),
      ]);
      const temporary = file + "." + randomBytes(12).toString("hex") + ".tmp";
      const fd = openSync(temporary, "wx", 0o600);
      let replaced = false;
      try {
        try {
          writeFileSync(fd, Buffer.concat([header, nonce, cipher.getAuthTag(), ciphertext]));
          fsyncSync(fd);
        } finally {
          closeSync(fd);
        }
        renameSync(temporary, file);
        replaced = true;
        if (process.platform !== "win32") {
          const parent = openSync(dirname(file), "r");
          try {
            fsyncSync(parent);
          } finally {
            closeSync(parent);
          }
        }
      } finally {
        if (!replaced) unlinkSync(temporary);
      }
    },
  };
}

module.exports = { openSessionVault };
