/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");

function validateActivationTerms(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new Error("activationTerms must be a string or null");
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 4000) {
    throw new Error("activationTerms exceeds 4000 characters");
  }

  for (const match of trimmed.matchAll(/(?:^|[^a-zA-Z0-9_])@([a-zA-Z0-9_]+)/g)) {
    if (match[1].toLowerCase() !== "oostaaisupport") {
      throw new Error(`Disallowed Telegram/social handle @${match[1]} in activationTerms`);
    }
  }

  for (const match of trimmed.matchAll(/(?:https?:\/\/|(?:t|telegram)\.me\/)[^\s)\]"'<>»]+/gi)) {
    const raw = match[0].replace(/[.,،؛:]+$/, "");
    const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    let parsed;
    try {
      parsed = new URL(candidate);
    } catch {
      throw new Error(`Invalid URL in activationTerms: ${raw}`);
    }
    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.replace(/\/+$/, "").toLowerCase();
    const isAllowedTelegram =
      parsed.protocol === "https:" && host === "t.me" && pathname === "/oostaaisupport";
    const isAllowedSite = parsed.protocol === "https:" && host === "oostaai.store";
    if (!isAllowedTelegram && !isAllowedSite) {
      throw new Error(`Disallowed URL in activationTerms: ${raw}`);
    }
  }

  if (/send.{0,60}(?:password|pass)\b/i.test(trimmed)) {
    throw new Error("Disallowed password solicitation phrase in activationTerms");
  }

  return trimmed;
}

async function applyPlanActivationTerms(prisma, entries, options = {}) {
  const apply = Boolean(options.apply);
  if (!Array.isArray(entries)) {
    throw new Error("Activation terms payload must be a JSON array");
  }

  const seen = new Set();
  const validated = entries.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(`Entry #${index} must be an object`);
    }
    const planId = typeof entry.planId === "string" ? entry.planId.trim() : "";
    if (!planId) {
      throw new Error(`Entry #${index} is missing a valid planId`);
    }
    if (seen.has(planId)) {
      throw new Error(`Duplicate planId in batch: ${planId}`);
    }
    seen.add(planId);
    return {
      planId,
      activationTerms: validateActivationTerms(entry.activationTerms),
    };
  });

  if (validated.length === 0) {
    return apply
      ? { applied: true, total: 0, updated: 0, unchanged: 0 }
      : { preview: true, total: 0, wouldUpdate: 0, unchanged: 0 };
  }

  const existing = await prisma.productPlan.findMany({
    where: { id: { in: validated.map((item) => item.planId) } },
    select: { id: true, activationTerms: true },
  });
  const byId = new Map(existing.map((plan) => [plan.id, plan]));
  for (const item of validated) {
    if (!byId.has(item.planId)) {
      throw new Error(`Unknown planId: ${item.planId}`);
    }
  }

  const updates = validated.filter(
    (item) => (byId.get(item.planId).activationTerms ?? null) !== item.activationTerms,
  );
  const unchanged = validated.length - updates.length;

  if (!apply) {
    return {
      preview: true,
      total: validated.length,
      wouldUpdate: updates.length,
      unchanged,
    };
  }

  await prisma.$transaction(async (tx) => {
    for (const item of updates) {
      await tx.productPlan.update({
        where: { id: item.planId },
        data: { activationTerms: item.activationTerms },
      });
    }
  });

  return {
    applied: true,
    total: validated.length,
    updated: updates.length,
    unchanged,
  };
}

function parseCliArgs(argv) {
  let input = null;
  let apply = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--input") {
      if (!argv[i + 1]) throw new Error("Missing path after --input");
      input = argv[++i];
    } else if (argv[i] === "--apply") {
      apply = true;
    } else {
      throw new Error(`Unknown argument: ${argv[i]}`);
    }
  }
  if (!input) throw new Error("--input <file> is required");
  return { input, apply };
}

module.exports = { validateActivationTerms, applyPlanActivationTerms };

if (require.main === module) {
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  const { input, apply } = parseCliArgs(process.argv.slice(2));
  const payload = JSON.parse(fs.readFileSync(path.resolve(input), "utf8"));
  applyPlanActivationTerms(prisma, payload, { apply })
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
