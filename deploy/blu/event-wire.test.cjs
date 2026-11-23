/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const assert = require("node:assert/strict");
const { createHash, createHmac, generateKeyPairSync, verify } = require("node:crypto");
const test = require("node:test");
const { signBankObservation } = require("./event-wire.cjs");

test("signs only a scoped, exact bank credit without including raw identifiers", () => {
  const keys = generateKeyPairSync("ed25519");
  const iban = "IR230000000000000000000001";
  const invoice = { iban, amountIrr: "4199990", reference: "001234" };
  const row = {
    1: "RAW-BANK-ID",
    2: { 1: { 1: iban } },
    3: { 2: "دریافت از کارت" },
    4: { 1: { 1: { 1: "4199990.00" }, 2: { 1: "IRR" } } },
    5: { 1: { 1: { 1: "1794499200" } } },
    6: { 1: "2" },
  };
  const detail = { 15: "نام مشتری: PRIVATE-NAME\nشماره پیگیری: ۰۰۱۲۳۴" };
  const now = new Date("2026-11-13T01:00:00.000Z");
  const trackingKey = Buffer.alloc(32, 7);
  const args = [detail, invoice, keys.privateKey, trackingKey, now];
  const signed = signBankObservation(row, ...args);
  assert(signed);
  assert(
    verify(
      null,
      Buffer.from(signed.body),
      keys.publicKey,
      Buffer.from(signed.signature, "base64url"),
    ),
  );
  const event = JSON.parse(signed.body);
  assert.equal(event.amountIrr, invoice.amountIrr);
  assert.equal(
    event.trackingDigest,
    createHmac("sha256", trackingKey)
      .update("oosta:blu:tracking:v1\0")
      .update(invoice.reference)
      .digest("hex"),
  );
  assert(!Object.hasOwn(event, "trackingCode"));
  assert.equal(event.direction, "CREDIT");
  assert.equal(
    event.accountDigest,
    createHash("sha256").update("oosta:blu:account:v1\0").update(iban).digest("hex"),
  );
  assert(!signed.body.includes(iban));
  assert.match(event.transactionDigest, /^[a-f0-9]{64}$/);
  assert.equal(signBankObservation(row, ...args).body, signed.body);
  assert(!signed.body.includes("RAW-BANK-ID") && !signed.body.includes("PRIVATE-NAME"));
  assert.equal(signBankObservation({ ...row, 6: { 1: "1" } }, ...args), null);
  assert.equal(signBankObservation({ ...row, 3: { 2: "دریافت از سپرده" } }, ...args), null);
  assert.equal(signBankObservation(row, { ...detail, 6: { 1: "1" } }, ...args.slice(1)), null);
  assert.equal(
    signBankObservation(row, { ...detail, 4: { 1: { 1: { 1: "1" } } } }, ...args.slice(1)),
    null,
  );
  assert.equal(signBankObservation(row, { 15: "شماره مرجع: ۰۰۱۲۳۴" }, ...args.slice(1)), null);
  const referenceDetail = { 15: "شماره پیگیری: ۹۹۹۹۹۹\nشماره مرجع: ۰۰۱۲۳۴" };
  const referenceWire = signBankObservation(row, referenceDetail, ...args.slice(1));
  assert(
    referenceWire,
    "A unique bank reference with a distinct labeled tracking code must be usable",
  );
  const referenceEvent = JSON.parse(referenceWire.body);
  assert.equal(referenceEvent.receiptIdentifierType, "REFERENCE");
  assert.equal(
    referenceEvent.trackingDigest,
    createHmac("sha256", trackingKey)
      .update("oosta:blu:reference:v1\0")
      .update(invoice.reference)
      .digest("hex"),
  );
  assert.notEqual(referenceEvent.trackingDigest, event.trackingDigest);
  assert.equal(
    signBankObservation(
      row,
      { 15: referenceDetail[15] + "\nشماره مرجع: ۸۸۸۸۸۸" },
      ...args.slice(1),
    ),
    null,
  );
  assert.equal(
    signBankObservation(
      row,
      { 15: referenceDetail[15] + "\nشماره پیگیری: ۸۸۸۸۸۸" },
      ...args.slice(1),
    ),
    null,
  );
  assert.equal(
    signBankObservation(row, { ...referenceDetail, 17: { 1: "888888" } }, ...args.slice(1)),
    null,
  );
  const cardNumber = "6219860000000001";
  const cardDetail = { ...referenceDetail, 2: { 1: { 1: cardNumber } } };
  assert(
    signBankObservation(row, cardDetail, { ...invoice, cardNumber }, ...args.slice(2)),
    "Detail may identify the exact configured receiving card",
  );
  assert.equal(signBankObservation(row, cardDetail, invoice, ...args.slice(2)), null);
  assert.equal(
    signBankObservation(
      row,
      cardDetail,
      { ...invoice, cardNumber: "6219860000000002" },
      ...args.slice(2),
    ),
    null,
  );
  assert.equal(
    signBankObservation(
      row,
      { ...cardDetail, 2: { 1: { 1: "IR230000000000000000000002" } } },
      { ...invoice, cardNumber },
      ...args.slice(2),
    ),
    null,
  );
});
