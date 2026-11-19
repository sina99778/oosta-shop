"use strict";

const digits = (value) => value.replace(/[۰-۹٠-٩]/g, (digit) => String(digit.charCodeAt(0) % 16));

function inspectCredits(rows, iban, amountIrr) {
  const ids = new Set();
  const counts = {
    rows: rows.length,
    credits: 0,
    exactAmount: 0,
    withIban: 0,
    matchingIban: 0,
    withTimestamp: 0,
    candidates: 0,
  };
  for (const row of rows) {
    if (row?.[6]?.[1] !== "2") continue;
    counts.credits++;

    const money = row?.[4]?.[1];
    const amount = money?.[1]?.[1];
    if (
      money?.[2]?.[1] !== "IRR" ||
      typeof amount !== "string" ||
      !/^\d{1,15}(?:\.0+)?$/.test(amount) ||
      amount.split(".")[0] !== amountIrr
    )
      continue;
    counts.exactAmount++;

    const bankIban = row?.[2]?.[1]?.[1];
    if (typeof bankIban !== "string" || !/^IR\d{24}$/.test(bankIban)) continue;
    counts.withIban++;
    if (bankIban !== iban) continue;
    counts.matchingIban++;
    if (!/^\d{10}$/.test(row?.[5]?.[1]?.[1]?.[1] ?? "")) continue;
    counts.withTimestamp++;

    const id = row?.[1];
    if (typeof id === "string" && id.length > 0 && id.length <= 256) ids.add(id);
  }
  counts.candidates = ids.size;
  return { ids: [...ids], counts };
}

function matchesReceipt(detail, expected) {
  const receipt = detail?.[17]?.[1];
  return typeof receipt === "string" && digits(receipt.trim()) === expected;
}

function inspectReceipt(detail, expected) {
  const rawReceipt = detail?.[17]?.[1];
  const structured = typeof rawReceipt === "string" && rawReceipt.trim().length > 0;
  const text = detail?.[15];
  const description = typeof text === "string" && text.trim().length > 0;
  const tracking = new Set();
  const reference = new Set();
  if (description) {
    const normalized = digits(text.replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, ""));
    for (const line of normalized.split(/\r?\n/)) {
      const pair = line
        .trim()
        .match(/^(?:شماره|کد)[ \t\u200c]+(پیگیری|مرجع)\s*[:：]\s*(\d{4,30})$/u);
      if (!pair) continue;
      (pair[1] === "پیگیری" ? tracking : reference).add(pair[2]);
    }
  }
  const trackingMatched = tracking.size === 1 && tracking.has(expected);
  let matchSource = null;
  if (structured) {
    if (matchesReceipt(detail, expected) && (tracking.size === 0 || trackingMatched)) {
      matchSource = "structured";
    }
  } else if ((rawReceipt == null || rawReceipt === "") && trackingMatched) {
    matchSource = "description";
  } else if (
    (rawReceipt == null || rawReceipt === "") &&
    tracking.size === 1 &&
    reference.size === 1 &&
    reference.has(expected)
  ) {
    matchSource = "reference";
  }
  return {
    structured,
    description,
    labeledTracking: tracking.size > 0,
    labeledReference: reference.size > 0,
    trackingMatched,
    matchSource,
    referenceMatched: reference.size === 1 && reference.has(expected),
  };
}

module.exports = { inspectCredits, digits, matchesReceipt, inspectReceipt };
