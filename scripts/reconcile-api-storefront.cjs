/* eslint-disable @typescript-eslint/no-require-imports */
// Operator-only catalog update. Run inside the API container with --preview or --apply.
const assert = require("node:assert/strict");
const { families, categories } = require("./supplier-storefront-families.json");
const { terms } = require("./import-supplier-storefront.cjs");

async function main() {
  const mode = process.argv[2];
  assert(["--preview", "--apply"].includes(mode));
  const { prisma } = require("/app/apps/api/dist/lib/prisma");
  const { variantKey, variantSchema } = require("/app/apps/api/dist/modules/suppliers/variant");
  const { fetchCatalog } = require("/app/apps/api/dist/modules/suppliers/catalog");
  const { matchingOffers } = require("/app/apps/api/dist/modules/suppliers/suppliers.service");
  try {
    const premi = await fetchCatalog("canboso2");
    const sku = "6a7347f6b1446d1a93c12cdf";
    const offer = premi.offers.find((item) => item.externalId === sku);
    assert.equal(
      offer?.fingerprint,
      "4aa7403e67eac18477ea506ddbfd8210138c4c2b82caf7ff45ae323e4c29b3c2",
    );
    const result = await prisma.$transaction(
      async (tx) => {
        const plans = await tx.productPlan.findMany({
          where: { source: "SUPPLIER", isActive: true, product: { isActive: true } },
          select: {
            id: true,
            label: true,
            variant: true,
            supplierMappings: true,
            durationDays: true,
            product: { select: { id: true, slug: true, type: true } },
            _count: { select: { orderItems: true, inventory: true, supplierCheckoutQuotes: true } },
          },
        });
        const plus = plans.find(
          (plan) =>
            plan.product.slug === "chatgpt" &&
            plan.supplierMappings?.some(
              (mapping) => mapping.supplier === "canboso2" && mapping.externalId === sku,
            ),
        );
        assert(plus && plus.durationDays === 30 && plus.variant?.warranty?.coverage === "FULL");
        const updatedMappings = plus.supplierMappings.map((mapping) =>
          mapping.supplier === "canboso2" && mapping.externalId === sku
            ? { ...mapping, fingerprint: offer.fingerprint }
            : mapping,
        );
        assert(
          matchingOffers(
            { ...plus, source: "SUPPLIER", supplierMappings: updatedMappings },
            new Map([["canboso2", premi]]),
          ).some(({ offer: matched }) => matched.externalId === sku),
        );
        const [categorySlug, categoryName] = categories.api;
        const category =
          mode === "--apply"
            ? await tx.category.upsert({
                where: { slug: categorySlug },
                update: {},
                create: { slug: categorySlug, name: categoryName },
              })
            : null;
        const groups = [];
        for (const family of families.filter((f) => f.category === "api")) {
          const pattern = new RegExp(family.pattern, "i");
          const selected = plans.filter(
            (p) =>
              p.product.slug === family.slug ||
              (p.product.slug === family.parent && pattern.test(p.label)),
          );
          if (!selected.length) continue;
          let product = await tx.product.findUnique({
            where: { slug: family.slug },
            select: { id: true, type: true },
          });
          const parent = selected[0].product;
          const description =
            "پلن‌های دسترسی و اعتبار API این سرویس برای اتصال به برنامه‌ها و ابزارهای توسعه عرضه می‌شوند. سهمیه، اعتبار زمانی و شرایط تحویل را در گزینهٔ هر پلن بررسی کن. این بسته‌ها اشتراک معمولی برنامه را شامل نمی‌شوند.";
          if (category) {
            if (product) {
              await tx.product.update({
                where: { id: product.id },
                data: { categoryId: category.id },
              });
            } else {
              const image = await tx.product.findUniqueOrThrow({
                where: { id: parent.id },
                select: { image: true, imageData: true, imageMimeType: true },
              });
              product = await tx.product.create({
                data: {
                  ...image,
                  slug: family.slug,
                  name: family.name,
                  type: parent.type,
                  categoryId: category.id,
                  description,
                  shortDescription: "دسترسی و اعتبار API برای توسعه و اتوماسیون",
                },
              });
            }
          }
          let moved = 0;
          let termsChanged = 0;
          for (const plan of selected) {
            const parsed = terms(
              { name: plan.label, description: "", warranty: { kind: "NONE" } },
              family,
            );
            const hasTokenQuota = /\b\d+(?:\.\d+)?\s*[MB]\s*tokens?\b/i.test(plan.label);
            const durationDays = hasTokenQuota ? parsed.durationDays : plan.durationDays;
            const variant = variantSchema.parse({
              ...plan.variant,
              plan: family.name,
              ...(hasTokenQuota ? { quota: parsed.variant.quota } : {}),
            });
            const changedProduct = plan.product.slug !== family.slug;
            const changedTerms =
              durationDays !== plan.durationDays ||
              variant.plan !== plan.variant.plan ||
              variant.quota !== plan.variant.quota;
            if (!changedProduct && !changedTerms) continue;
            assert(
              Object.values(plan._count).every((count) => count === 0),
              "Plan has order, quote or inventory history",
            );
            if (changedProduct) moved++;
            if (changedTerms) termsChanged++;
            if (category) {
              assert.equal(product.type, plan.product.type);
              await tx.productPlan.update({
                where: { id: plan.id },
                data: {
                  productId: product.id,
                  durationDays,
                  variant,
                  supplierMappings: plan.supplierMappings.map((mapping) => ({
                    ...mapping,
                    variantKey: variantKey(variant, durationDays),
                  })),
                },
              });
            }
          }
          groups.push({ product: family.slug, plans: selected.length, moved, termsChanged });
        }
        if (category)
          await tx.productPlan.update({
            where: { id: plus.id },
            data: { supplierMappings: updatedMappings },
          });
        return { applied: !!category, premiStock: offer.stock, premiCostUsd: offer.cost, groups };
      },
      { isolationLevel: "Serializable", timeout: 30000 },
    );
    console.log(JSON.stringify(result));
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((error) => {
  console.error(
    "CATALOG_UPDATE_FAILED",
    error.code ?? error.name,
    error.name === "AssertionError" ? error.message : "",
  );
  process.exitCode = 1;
});
