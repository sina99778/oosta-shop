/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { inspectCredits, inspectReceipt, matchesReceipt } = require("./match-credit.cjs");

const candidates = (...args) => inspectCredits(...args).ids;

const iban = "IR000560611828001111111101";
const row = {
  1: "synthetic-bank-id",
  2: { 1: { 1: iban } },
  4: { 1: { 1: { 1: "10130.00" }, 2: { 1: "IRR" } } },
  5: { 1: { 1: { 1: "1794499200" } } },
  6: { 1: "2" },
};

test("selects exact integer-rial credits for the specified account", () => {
  assert.deepEqual(candidates([row], iban, "10130"), ["synthetic-bank-id"]);
  assert.deepEqual(candidates([row], iban, "10131"), []);
  assert.deepEqual(candidates([row], iban.replace(/1$/, "2"), "10130"), []);
  assert.deepEqual(candidates([{ ...row, 6: { 1: "1" } }], iban, "10130"), []);
  assert.deepEqual(
    candidates([{ ...row, 4: { 1: { 1: { 1: "10130.01" }, 2: { 1: "IRR" } } } }], iban, "10130"),
    [],
  );
  assert.deepEqual(candidates([{ ...row, 5: null }], iban, "10130"), []);
  assert.deepEqual(candidates([row, row], iban, "10130"), ["synthetic-bank-id"]);
});

test("checks the bank detail receipt independently of the amount", () => {
  assert(matchesReceipt({ 17: { 1: "000123" } }, "000123"));
  assert(!matchesReceipt({ 17: { 1: "000123" } }, "123"));
  assert(!matchesReceipt({}, "000123"));
});

test("reports the stage that excluded a candidate without outputting bank values", () => {
  const result = inspectCredits(
    [row, { ...row, 2: null }, { ...row, 5: null }, { ...row, 6: { 1: "1" } }],
    iban,
    "10130",
  );
  assert.deepEqual(result.ids, ["synthetic-bank-id"]);
  assert.deepEqual(result.counts, {
    rows: 4,
    credits: 3,
    exactAmount: 3,
    withIban: 2,
    matchingIban: 2,
    withTimestamp: 1,
    candidates: 1,
  });
});

test("distinguishes a labeled tracking code, a labeled reference and unrelated numbers", () => {
  const detail = { 15: "مبلغ: ۰۰۰۱۲۳ ریال\nشماره مرجع: ‎۰۰۰۱۲۳\nکد پیگیری: ۰۰۰۱۲۴" };
  assert.deepEqual(inspectReceipt(detail, "000123"), {
    structured: false,
    description: true,
    labeledTracking: true,
    labeledReference: true,
    trackingMatched: false,
    matchSource: "reference",
    referenceMatched: true,
  });
  assert.equal(inspectReceipt(detail, "000124").trackingMatched, true);
  assert.equal(inspectReceipt(detail, "123").referenceMatched, false);
  assert.equal(inspectReceipt({ 15: "مبلغ: ۰۰۰۱۲۳" }, "000123").referenceMatched, false);
  assert.equal(
    inspectReceipt({ 15: "شماره پیگیری: ۱۲۳۴۵۶\nشماره پیگیری: ۹۸۷۶۵۴" }, "123456").trackingMatched,
    false,
  );
});

const trackingEvidence = (detail, expected) => inspectReceipt(detail, expected).matchSource;

test("uses a uniquely labeled bank tracking code only when the structured field is absent", () => {
  assert.equal(trackingEvidence({ 15: "شماره پیگیری: ۰۰۰۱۲۳" }, "000123"), "description");
  assert.equal(trackingEvidence({ 15: "شماره مرجع: ۰۰۰۱۲۳" }, "000123"), null);
  assert.equal(trackingEvidence({ 17: { 1: "000123" } }, "000123"), "structured");
  assert.equal(
    trackingEvidence({ 17: { 1: "999999" }, 15: "شماره پیگیری: ۰۰۰۱۲۳" }, "000123"),
    null,
  );
  assert.equal(
    trackingEvidence({ 17: { 1: "000123" }, 15: "شماره پیگیری: ۹۹۹۹۹۹" }, "000123"),
    null,
  );
});
