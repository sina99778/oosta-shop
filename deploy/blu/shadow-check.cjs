/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const assert = require("node:assert/strict");
const { createInterface } = require("node:readline/promises");
const { inspectCredits, digits, inspectReceipt } = require("./match-credit.cjs");
const { Writable } = require("node:stream");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { createPrivateKey } = require("node:crypto");
const { signBankObservation } = require("./event-wire.cjs");
const { openSessionVault } = require("./session-vault.cjs");
const { readBoundedInput, parseReceiptLookup } = require("./qa-poll.cjs");

const revision = "/opt/oosta-blu/upstream/src";
delete process.env.BLU_PROXY;
const store = require(revision + "/session.js");
// The upstream client normally saves passwords and device keys to disk.
store.load = () => null;
store.save = () => {};
const { BluClient } = require(revision + "/client.js");
const { Api } = require(revision + "/api.js");
const proto = require(revision + "/proto.js");

async function run(client) {
  if (process.argv[2] === "--connectivity") {
    client.newDevice();
    await client.keyExchange();
    console.log("BLU_KEY_EXCHANGE_OK");
    return;
  }

  const mode = process.argv[2];
  const queued = mode === "--publish-stdin";
  const publish = mode === "--publish" || queued;
  const deposit = mode === "--deposit" || publish;
  const enroll = mode === "--enroll";
  const savedCheck = mode === "--saved-check";
  const persistent = deposit || enroll || savedCheck;
  assert(process.argv.length === 2 || (persistent && process.argv.length === 3));

  let vault;
  let previous = null;
  if (persistent) {
    vault = openSessionVault(
      "/var/lib/oosta-blu-probe/session.enc",
      readFileSync(join(process.env.CREDENTIALS_DIRECTORY, "session-key")),
    );
    previous = vault.load();
    if (!previous && !enroll) {
      console.log("BLU_ENROLLMENT_REQUIRED");
      return 3;
    }
    if (previous?.reEnrollmentRequired && !enroll) {
      console.log("BLU_DEVICE_REENROLLMENT_REQUIRED");
      return 4;
    }
  }

  const interactive = !savedCheck && !queued;
  if (interactive) assert(process.stdin.isTTY && process.stdout.isTTY, "Run in a private terminal");
  let muted = false;
  const output = new Writable({
    write(chunk, encoding, done) {
      if (!muted) process.stdout.write(chunk, encoding);
      done();
    },
  });
  output.isTTY = true;
  output.columns = process.stdout.columns;
  const terminal = interactive
    ? createInterface({ input: process.stdin, output, terminal: true })
    : null;
  async function secret(label) {
    process.stdout.write(label);
    muted = true;
    try {
      return await terminal.question("");
    } finally {
      muted = false;
      process.stdout.write("\n");
    }
  }

  try {
    const useSaved = deposit || savedCheck;
    const account = useSaved
      ? previous.profileId
      : digits((await secret("Receiving Blu account number (18 digits): ")).trim());
    let iban, cardNumber, amountIrr, reference;
    assert(/^\d{18}$/.test(account));
    if (queued) {
      ({ iban, cardNumber, amountIrr, reference } = parseReceiptLookup(readBoundedInput(512)));
    } else if (deposit) {
      iban = digits(
        (await secret("Receiving Blu IBAN (IR and 24 digits): ")).replace(/\s/g, "").toUpperCase(),
      );
      amountIrr = digits((await secret("Deposit amount in rials (digits only): ")).trim());
      reference = digits(
        (await secret("Tracking or reference code shown on the receipt: ")).trim(),
      );
      assert(
        /^IR\d{24}$/.test(iban) &&
          /^[1-9]\d{0,14}$/.test(amountIrr) &&
          /^\d{4,30}$/.test(reference),
      );
      if (publish) {
        cardNumber = digits((await secret("Receiving card number (16 digits): ")).trim());
        assert(/^\d{16}$/.test(cardNumber));
      }
    }
    if (useSaved) {
      // The upstream client renews using the saved device identity when needed.
      // Only the final, usable session is committed to our encrypted vault.
      client.s = { ...previous };
      client.restoreKeys();
    } else {
      if (enroll && previous) store.load = () => previous;
      client.newDevice();
      store.load = () => null;
      const username = (await secret("Blu username: ")).trim();
      const password = await secret("Blu password: ");
      assert(username.length > 0 && password.length > 0);
      const login = await client.login(username, password);
      if (!enroll) client.s.password = undefined;
      if (!login.token && login.otp) {
        const code = digits((await secret("Blu device verification code: ")).trim());
        assert(/^\d{4,8}$/.test(code));
        await client.otpVerify(code, null, login.otp);
      }
      assert(store.isFresh(client.s), "Bank session was not established");
    }
    client.s.profileId = account;
    const api = new Api(client);
    let page;
    try {
      page = await api.transactions(account, { size: deposit ? 20 : 5, page: 1 });
    } catch (error) {
      if (useSaved && client.s.otp) {
        vault.save({ ...previous, reEnrollmentRequired: true });
        console.log("BLU_DEVICE_REENROLLMENT_REQUIRED");
        return 4;
      }
      throw error;
    }
    const rows = proto.all(page, 3);
    if (vault) vault.save(client.strip());
    if (!deposit) {
      const result = enroll
        ? "BLU_ENROLL_OK"
        : savedCheck
          ? "BLU_SAVED_HISTORY_OK"
          : "BLU_HISTORY_READ_OK";
      console.log(result + " rows=" + rows.length);
      return;
    }

    const decodedRows = rows.map((row) => proto.toJson(row));
    const { ids, counts } = inspectCredits(decodedRows, iban, amountIrr);
    if (ids.length > 5) {
      console.log("BLU_DEPOSIT_DIAGNOSTICS " + JSON.stringify(counts));
      console.log("BLU_DEPOSIT_REVIEW_TOO_MANY_CANDIDATES");
      return;
    }
    const evidence = {
      detailsRead: 0,
      receiptFields: 0,
      descriptions: 0,
      labeledTracking: 0,
      labeledReference: 0,
      trackingMatches: 0,
      referenceMatches: 0,
      matched: 0,
      descriptionMatches: 0,
      referenceEvidenceMatches: 0,
    };
    let selected;
    for (const id of ids) {
      const response = await api.transactionDetail(id);
      const details = proto.all(response, 3);
      if (details.length !== 1) continue;
      evidence.detailsRead++;
      const detail = proto.toJson(details[0]);
      const receipt = inspectReceipt(detail, reference);
      if (receipt.structured) evidence.receiptFields++;
      if (receipt.description) evidence.descriptions++;
      if (receipt.labeledTracking) evidence.labeledTracking++;
      if (receipt.labeledReference) evidence.labeledReference++;
      if (receipt.trackingMatched) evidence.trackingMatches++;
      if (receipt.referenceMatched) evidence.referenceMatches++;
      if (receipt.matchSource === "structured") evidence.matched++;
      if (receipt.matchSource === "description") evidence.descriptionMatches++;
      if (receipt.matchSource === "reference") evidence.referenceEvidenceMatches++;
      if (receipt.matchSource) selected = { id, detail };
    }
    console.log("BLU_DEPOSIT_DIAGNOSTICS " + JSON.stringify({ ...counts, ...evidence }));
    const { matched, descriptionMatches, referenceEvidenceMatches } = evidence;
    if (matched + descriptionMatches + referenceEvidenceMatches > 1) {
      console.log("BLU_DEPOSIT_REVIEW_AMBIGUOUS");
      return;
    }
    if (publish) {
      if (!selected) {
        console.log("BLU_EVENT_NOT_SENT");
        return 5;
      }
      const privateKey = createPrivateKey(
        readFileSync(join(process.env.CREDENTIALS_DIRECTORY, "event-key")),
      );
      const signed = signBankObservation(
        decodedRows.find((row) => row?.[1] === selected.id),
        selected.detail,
        { iban, cardNumber, amountIrr, reference },
        privateKey,
        readFileSync(join(process.env.CREDENTIALS_DIRECTORY, "tracking-key")),
      );
      if (!signed) {
        console.log("BLU_EVENT_NOT_SENT");
        return 5;
      }
      const response = await fetch("https://oostaai.store/api/internal/blu-events", {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(10000),
        headers: { "content-type": "application/json", "x-oosta-blu-signature": signed.signature },
        body: signed.body,
      });
      if (!response.ok) {
        if (response.status === 409) {
          console.log("BLU_EVENT_REVIEW");
          return;
        }
        console.log("BLU_EVENT_REJECTED HTTP " + response.status);
        return 6;
      }
      const result = await response.json();
      assert(["matched", "observed", "ignored", "review"].includes(result.status));
      console.log("BLU_EVENT_" + result.status.toUpperCase());
      return;
    }
    if (referenceEvidenceMatches === 1) {
      console.log("BLU_DEPOSIT_REFERENCE_TEXT_MATCH");
      return;
    }
    if (descriptionMatches === 1) {
      console.log("BLU_DEPOSIT_TRACKING_TEXT_MATCH");
      return;
    }
    if (matched === 0 && evidence.detailsRead > 0 && evidence.receiptFields === 0) {
      console.log("BLU_DEPOSIT_REVIEW_MISSING_RECEIPT");
      return;
    }
    console.log(matched === 1 ? "BLU_DEPOSIT_MATCH_OK" : "BLU_DEPOSIT_NO_MATCH");
  } finally {
    terminal?.close();
  }
}

async function main() {
  const client = new BluClient();
  try {
    process.exitCode = (await run(client)) ?? 0;
  } finally {
    // This pinned upstream client keeps its HTTP/2 connection open for reuse.
    client._h2?.destroy();
  }
}

main().catch((error) => {
  const status = Number.isInteger(error.status) ? " HTTP " + error.status : "";
  console.error("BLU_CHECK_FAILED" + status);
  process.exitCode = 1;
});
