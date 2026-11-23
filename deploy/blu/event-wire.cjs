/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const { createHash, createHmac, sign } = require("node:crypto");
const { inspectCredits, inspectReceipt } = require("./match-credit.cjs");

function signBankObservation(row, detail, invoice, privateKey, trackingKey, now = new Date()) {
  if (privateKey.asymmetricKeyType !== "ed25519") throw new Error("Invalid Blu signer");
  if (!Buffer.isBuffer(trackingKey) || trackingKey.length !== 32)
    throw new Error("Invalid Blu tracking key");
  const { iban, cardNumber, amountIrr, reference } = invoice;
  const receipt = inspectReceipt(detail, reference);
  if (
    !/^IR\d{24}$/.test(iban) ||
    !/^[1-9]\d{0,14}$/.test(amountIrr) ||
    !/^\d{4,30}$/.test(reference) ||
    row?.[3]?.[2] !== "دریافت از کارت" ||
    !receipt.matchSource
  )
    return null;
  const { ids } = inspectCredits([row], iban, amountIrr);
  if (ids.length !== 1) return null;
  const detailMoney = detail?.[4]?.[1];
  const detailAmount = detailMoney?.[1]?.[1];
  const detailCurrency = detailMoney?.[2]?.[1];
  const detailDestination = detail?.[2]?.[1]?.[1];
  const destinationMatches =
    detailDestination == null ||
    detailDestination === iban ||
    (typeof cardNumber === "string" &&
      /^\d{16}$/.test(cardNumber) &&
      detailDestination === cardNumber);
  const detailDirection = detail?.[6]?.[1];
  const detailTime = detail?.[5]?.[1]?.[1]?.[1];
  if (
    (detailAmount != null &&
      (typeof detailAmount !== "string" ||
        !/^\d{1,15}(?:\.0+)?$/.test(detailAmount) ||
        detailAmount.split(".")[0] !== amountIrr)) ||
    (detailCurrency != null && detailCurrency !== "IRR") ||
    !destinationMatches ||
    (detailDirection != null && detailDirection !== "2") ||
    (detailTime != null && detailTime !== row[5][1][1][1])
  )
    return null;
  const occurredAt = new Date(Number(row[5][1][1][1]) * 1000);
  if (occurredAt > now) return null;

  const body = JSON.stringify({
    version: 1,
    accountDigest: createHash("sha256").update("oosta:blu:account:v1\0").update(iban).digest("hex"),
    currency: "IRR",
    direction: "CREDIT",
    amountIrr,
    transactionDigest: createHash("sha256")
      .update("oosta:blu:row:v1\0")
      .update(iban)
      .update("\0")
      .update(ids[0])
      .digest("hex"),
    trackingDigest: createHmac("sha256", trackingKey)
      .update(
        receipt.matchSource === "reference"
          ? "oosta:blu:reference:v1\0"
          : "oosta:blu:tracking:v1\0",
      )
      .update(reference)
      .digest("hex"),
    ...(receipt.matchSource === "reference" ? { receiptIdentifierType: "REFERENCE" } : {}),
    occurredAt: occurredAt.toISOString(),
    observedAt: now.toISOString(),
  });
  return { body, signature: sign(null, Buffer.from(body), privateKey).toString("base64url") };
}

module.exports = { signBankObservation };
