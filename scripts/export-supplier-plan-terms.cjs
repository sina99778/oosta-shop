/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");

function parseArgs(argv) {
  let out = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out") {
      if (!argv[i + 1]) throw new Error("Missing path after --out");
      out = argv[++i];
    } else {
      throw new Error(`Unknown argument: ${argv[i]}`);
    }
  }
  return { out };
}

async function exportSupplierPlanTerms(prisma) {
  const [products, settings] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "desc" }, { name: "asc" }],
      select: {
        slug: true,
        name: true,
        plans: {
          where: { isActive: true },
          orderBy: [{ sortOrder: "desc" }, { createdAt: "asc" }],
          select: {
            id: true,
            label: true,
            variant: true,
            supplierMappings: true,
            activationTerms: true,
          },
        },
      },
    }),
    prisma.siteSetting.findMany({
      where: { key: { startsWith: "suppliers.catalog." } },
      select: { key: true, value: true },
    }),
  ]);

  const catalogsBySupplier = new Map();
  for (const row of settings) {
    try {
      const parsed = JSON.parse(row.value);
      if (parsed && typeof parsed.supplier === "string" && Array.isArray(parsed.offers)) {
        const offers = new Map();
        for (const offer of parsed.offers) {
          if (offer && typeof offer.externalId === "string") {
            offers.set(offer.externalId, offer);
          }
        }
        catalogsBySupplier.set(parsed.supplier, offers);
      }
    } catch {
      /* Ignore unreadable snapshots; export still lists all active plans. */
    }
  }

  const rows = [];
  for (const product of products) {
    for (const plan of product.plans) {
      const mappings = Array.isArray(plan.supplierMappings) ? plan.supplierMappings : [];
      const supplierOffers = [];
      for (const mapping of mappings) {
        if (
          !mapping ||
          typeof mapping.supplier !== "string" ||
          typeof mapping.externalId !== "string"
        )
          continue;
        const offer = catalogsBySupplier.get(mapping.supplier)?.get(mapping.externalId);
        supplierOffers.push({
          supplier: mapping.supplier,
          externalId: mapping.externalId,
          name: typeof offer?.name === "string" ? offer.name : null,
          description: typeof offer?.description === "string" ? offer.description : null,
          flags: Array.isArray(offer?.flags) ? offer.flags : [],
        });
      }
      rows.push({
        productSlug: product.slug,
        productName: product.name,
        planId: plan.id,
        planLabel: plan.label,
        variant: plan.variant ?? null,
        currentActivationTerms: plan.activationTerms ?? null,
        supplierOffers,
      });
    }
  }
  return rows;
}

module.exports = { exportSupplierPlanTerms };

if (require.main === module) {
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  const { out } = parseArgs(process.argv.slice(2));
  exportSupplierPlanTerms(prisma)
    .then((rows) => {
      const json = JSON.stringify(rows, null, 2);
      if (out) {
        fs.writeFileSync(path.resolve(out), json, { mode: 0o600 });
        console.log(`Exported ${rows.length} active plans to ${path.resolve(out)}`);
      } else {
        process.stdout.write(json + "\n");
      }
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
