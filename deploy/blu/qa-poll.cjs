/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const assert = require("node:assert/strict");
const { readSync } = require("node:fs");

function readBoundedInput(maximum) {
  const bytes = Buffer.alloc(maximum + 1);
  let length = 0;
  while (length <= maximum) {
    const count = readSync(0, bytes, length, bytes.length - length, null);
    if (count === 0) return bytes.subarray(0, length).toString("utf8");
    length += count;
  }
  throw new Error("Input exceeds limit");
}

function parseReceiptLookup(input) {
  assert(input.length <= 512);
  const lookup = JSON.parse(input);
  assert(lookup && Object.keys(lookup).length === 4);
  for (const [field, pattern] of Object.entries({
    iban: /^IR\d{24}$/,
    cardNumber: /^\d{16}$/,
    amountIrr: /^[1-9]\d{0,14}$/,
    reference: /^\d{4,30}$/,
  }))
    assert(typeof lookup[field] === "string" && pattern.test(lookup[field]));
  return lookup;
}

function pollReceipts(input, invoke) {
  const queue = JSON.parse(input);
  assert(Array.isArray(queue) && queue.length <= 5);
  const lookups = queue.map((item) => JSON.stringify(parseReceiptLookup(JSON.stringify(item))));
  if (!lookups.length) return { idle: 1 };
  const results = {};
  for (const lookup of lookups) {
    const { status, stdout } = invoke(lookup);
    const lines = (stdout ?? "").split(/\r?\n/);
    let outcome = "unavailable";
    if (status === 0 && lines.includes("BLU_EVENT_MATCHED")) outcome = "matched";
    else if (
      status === 0 &&
      lines.some((line) => /^BLU_(EVENT_REVIEW|DEPOSIT_REVIEW_[A-Z_]+)$/.test(line))
    )
      outcome = "review";
    else if (status === 0 && lines.includes("BLU_EVENT_OBSERVED")) outcome = "review";
    else if (status === 5 && lines.includes("BLU_EVENT_NOT_SENT")) outcome = "pending";
    else if (status === 3 || status === 4) outcome = "enrollmentRequired";
    results[outcome] = (results[outcome] ?? 0) + 1;
    if (outcome === "enrollmentRequired" || outcome === "unavailable") break;
  }
  return results;
}

module.exports = { readBoundedInput, parseReceiptLookup, pollReceipts };

if (require.main === module) {
  const { spawnSync } = require("node:child_process");
  try {
    const results = pollReceipts(readBoundedInput(4096), (input) =>
      spawnSync("/usr/local/sbin/oosta-blu", ["poll"], {
        input,
        encoding: "utf8",
        timeout: 32000,
        maxBuffer: 8192,
      }),
    );
    console.log("BLU_QA_POLL " + JSON.stringify(results));
    if (results.unavailable || results.enrollmentRequired) process.exitCode = 1;
  } catch {
    console.error("BLU_QA_POLL_INVALID_INPUT");
    process.exitCode = 1;
  }
}
