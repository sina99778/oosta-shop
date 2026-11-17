/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function terms(offer, family) {
  const title = offer.name.replace(/[^\p{L}\p{N}\p{P}\p{Z}]/gu, "").trim();
  const text = title + "\n" + offer.description;
  const segment = title.split(/\b(?:full )?warrant|\bguarantee/i)[0];
  const duration = segment.match(
    /(?<![\d–-])(\d{1,3})\s*(?:[-–]\s*\d{1,3}\s*)?(years?|yrs?|months?|mo|m|days?|d)\b/i,
  );
  const multiplier = duration?.[2].match(/^y/i) ? 365 : duration?.[2].match(/^m/i) ? 30 : 1;
  const range = duration && /[-–]/.test(duration[0]);
  const durationDays = duration && !range ? Number(duration[1]) * multiplier : null;
  const fulfillment = /\b(?:slot|invite|invitation)\b/i.test(title)
    ? "INVITE"
    : /\b(?:code|coupon|redeem|cdk|activation link|key)\b/i.test(title)
      ? "CODE"
      : /\b(?:upgrade|renewal|activation)\b/i.test(title)
        ? "UPGRADE"
        : /\b(?:api|credits?|tokens?)\b/i.test(title)
          ? "CODE"
          : "ACCOUNT";
  const access = /\b(?:team|admin|workspace|seats)\b/i.test(title)
    ? "TEAM"
    : fulfillment === "INVITE" || /\bshared\b/i.test(title)
      ? "SHARED"
      : "PERSONAL";
  const warranty =
    offer.warranty.kind === "WARRANTED"
      ? { ...offer.warranty, coverage: "LOGIN" }
      : { kind: "NONE", days: 0, coverage: "NONE" };
  const label =
    family.category === "gaming" ? title.replace(/vpn/gi, "").replace(/\s+/g, " ").trim() : title;
  return {
    label: label.slice(0, 100),
    durationDays: durationDays > 0 ? durationDays : null,
    variant: {
      plan: family.name,
      access,
      fulfillment,
      delivery: offer.delivery === "AUTOMATIC" ? "AUTOMATIC" : "MANUAL",
      warranty,
      region: /\b(?:US only|United States only)\b/i.test(text) ? "US" : "UNSPECIFIED",
      quota:
        title.match(/\b\d+(?:\.\d+)?\s*(?:devices|seats|GB|TB|credits?)\b/i)?.[0] ?? "UNSPECIFIED",
    },
  };
}

function classify(offer, families) {
  const text = offer.name;
  if (
    /\b(?:otp|sms|spam|bypass|unlock|trial)\b|^(?:gmail|outlook|hotmail)\b|(?:old|new).*gmail|discord clone|tiktok|onlyfan|\bapple id\b|\baccount x\b|ancient youtube|verify .*student/i.test(
      text,
    )
  )
    return "manual-review";
  if (
    offer.flags.some((flag) =>
      [
        "SENSITIVE_MANUAL_FLOW",
        "DIFFERENT_PRODUCT_REVIEW",
        "INPUT_CONFLICT",
        "WARRANTY_CONFLICT",
      ].includes(flag),
    )
  )
    return "manual-review";
  return families.find((family) => new RegExp(family.pattern, "i").test(text)) ?? "unclassified";
}

async function main() {
  const dir = process.argv[2];
  assert(dir && ["--apply", "--preview"].includes(process.argv[3]));
  const apply = process.argv[3] === "--apply";
  const { categories, families } = JSON.parse(
    fs.readFileSync(path.join(dir, "supplier-storefront-families.json"), "utf8"),
  );
  const { prisma } = require("/app/apps/api/dist/lib/prisma");
  const {
    catalogs,
    verifyMappings,
  } = require("/app/apps/api/dist/modules/suppliers/suppliers.service");
  const { createPlanSchema } = require("/app/apps/api/dist/modules/admin/admin.schemas");
  try {
    const snapshots = await catalogs();
    assert.equal(snapshots.size, 5, "All supplier snapshots are required");
    const found = new Map();
    const vendors = [];
    const review = [];
    for (const [supplier, snapshot] of snapshots) {
      assert(Date.now() - Date.parse(snapshot.fetchedAt) < 60000, "Supplier snapshot is stale");
      const counts = { supplier, offers: snapshot.offers.length, available: 0, eligible: 0 };
      for (const offer of snapshot.offers) {
        if (!(offer.stock > 0 || offer.onRequest)) continue;
        counts.available++;
        const family = classify(offer, families);
        if (typeof family === "string") {
          review.push({
            supplier,
            sku: offer.externalId,
            name: offer.name,
            reason: /gemini.*(?:plus|ultra)/i.test(offer.name) ? "gemini-pro-only" : family,
          });
          continue;
        }
        const plans = found.get(family.slug) ?? [];
        plans.push(offer);
        found.set(family.slug, plans);
        counts.eligible++;
      }
      vendors.push(counts);
    }
    const updates = [];
    for (const family of families) {
      const offers = found.get(family.slug);
      if (!offers?.length) continue;
      const image = fs.readFileSync(path.join(dir, "covers", family.slug + ".webp"));
      assert(image.length <= 200000 && image.subarray(8, 12).toString() === "WEBP");
      const existing = await prisma.product.findUnique({
        where: { slug: family.slug },
        select: {
          id: true,
          image: true,
          imageMimeType: true,
          plans: { select: { supplierMappings: true } },
        },
      });
      const present = new Set(
        (existing?.plans ?? []).flatMap((plan) =>
          Array.isArray(plan.supplierMappings)
            ? plan.supplierMappings.map((m) => m.supplier + ":" + m.externalId)
            : [],
        ),
      );
      const plans = [];
      for (const offer of offers) {
        if (present.has(offer.supplier + ":" + offer.externalId)) continue;
        const data = createPlanSchema.parse({
          ...terms(offer, family),
          source: "SUPPLIER",
          currency: "IRR",
          price: 10,
          isActive: true,
          supplierMappings: [
            {
              supplier: offer.supplier,
              externalId: offer.externalId,
              fingerprint: offer.fingerprint,
            },
          ],
        });
        const { supplierMappings: rawMappings, ...fields } = data;
        const supplierMappings = await verifyMappings(
          rawMappings,
          fields.variant,
          fields.durationDays ?? null,
        );
        plans.push({ ...fields, supplierMappings });
      }
      updates.push({ family, plans, existing, image });
    }
    let addedPlans = 0;
    if (apply)
      await prisma.$transaction(
        async (tx) => {
          for (const { family, plans, existing, image } of updates) {
            const [slug, name] = categories[family.category];
            const category = await tx.category.upsert({
              where: { slug },
              create: { slug, name },
              update: {},
            });
            const imageData =
              existing?.image || existing?.imageMimeType
                ? {}
                : { imageData: image, imageMimeType: "image/webp" };
            const product = existing
              ? await tx.product.update({
                  where: { id: existing.id },
                  data: { categoryId: category.id, ...imageData },
                  select: { id: true },
                })
              : await tx.product.create({
                  data: {
                    slug: family.slug,
                    name: family.name,
                    type: "ACCOUNT",
                    categoryId: category.id,
                    description:
                      family.category === "gaming" && family.slug !== "discord"
                        ? "سرویس اتصال و تغییر مسیر شبکه (VPN). نتیجهٔ پینگ به مسیر شبکه، اینترنت و سرور بازی بستگی دارد. نوع اشتراک و مدت را در گزینه‌های محصول بررسی کن."
                        : "مدت، نوع دریافت و وضعیت موجودی را در گزینه‌های محصول بررسی کن. قیمت هر پلن با استعلام موجودی و نرخ ارز محاسبه می‌شود.",
                    ...imageData,
                  },
                  select: { id: true },
                });
            if (plans.length) {
              const result = await tx.productPlan.createMany({
                data: plans.map((plan) => ({ ...plan, productId: product.id })),
              });
              addedPlans += result.count;
            }
          }
        },
        { timeout: 45000 },
      );
    const report = {
      applied: apply,
      vendors,
      products: updates.length,
      newPlans: updates.reduce((n, p) => n + p.plans.length, 0),
      addedPlans,
      review,
    };
    fs.writeFileSync(path.join(dir, "report.json"), JSON.stringify(report, null, 2), {
      mode: 0o600,
    });
    console.log(JSON.stringify({ ...report, review: review.length }));
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("SUPPLIER_IMPORT_FAILED", error.code ?? error.name, error.message);
    process.exitCode = 1;
  });
}

module.exports = { terms, classify };
