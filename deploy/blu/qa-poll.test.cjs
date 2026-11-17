/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseReceiptLookup, pollReceipts } = require("./qa-poll.cjs");

const lookup = {
  iban: "IR230000000000000000000001",
  cardNumber: "6219860000000001",
  amountIrr: "10010",
  reference: "001234",
};

test("accepts only exact bounded invoice input", () => {
  assert.deepEqual(parseReceiptLookup(JSON.stringify(lookup)), lookup);
  for (const input of [
    "{",
    JSON.stringify({ ...lookup, extra: true }),
    JSON.stringify({ ...lookup, amountIrr: "10010.0" }),
    JSON.stringify({ ...lookup, reference: "12" }),
    JSON.stringify(lookup).padEnd(513),
  ])
    assert.throws(() => parseReceiptLookup(input));
});

test("leaves idle runs off the bank and sanitizes collector failures", () => {
  let calls = 0;
  const run = (jobs, result) =>
    pollReceipts(JSON.stringify(jobs), (input) => {
      calls++;
      assert.deepEqual(JSON.parse(input), lookup);
      return result;
    });
  assert.deepEqual(run([], {}), { idle: 1 });
  assert.equal(calls, 0);
  assert.deepEqual(run([lookup], { status: 0, stdout: "BLU_EVENT_MATCHED\n" }), { matched: 1 });
  assert.deepEqual(run([lookup], { status: 5, stdout: "BLU_EVENT_NOT_SENT\n" }), { pending: 1 });
  assert.deepEqual(
    run([lookup, lookup], { status: 4, stdout: "BLU_DEVICE_REENROLLMENT_REQUIRED\n" }),
    { enrollmentRequired: 1 },
  );
  assert.deepEqual(run([lookup, lookup], { status: 255, stdout: lookup.reference }), {
    unavailable: 1,
  });
  assert.throws(() => run([lookup, { ...lookup, extra: true }], {}));
  assert.equal(calls, 4);
  const outcomes = [
    { status: 0, stdout: "BLU_EVENT_OBSERVED\n" },
    { status: 0, stdout: "BLU_EVENT_MATCHED\n" },
    { status: 0, stdout: "BLU_EVENT_REVIEW\n" },
  ];
  assert.deepEqual(
    pollReceipts(JSON.stringify([lookup, lookup, lookup]), () => outcomes.shift()),
    { review: 2, matched: 1 },
  );
});
