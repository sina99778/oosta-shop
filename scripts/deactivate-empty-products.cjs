/* eslint-disable @typescript-eslint/no-require-imports */
// Hide storefront products that have nothing to sell (no plans at all).
//
//   node scripts/deactivate-empty-products.cjs <slug> [...]            # dry run
//   node scripts/deactivate-empty-products.cjs <slug> [...] --apply    # write
//
// Only touches active products with zero plans, so it can never hide a product
// that still has a sellable option. Reversible: set isActive back in the admin.
// Run inside the API container with NODE_PATH pointing at its node_modules.
async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const slugs = args.filter((a) => a !== "--apply");
  if (!slugs.length || !slugs.every((s) => /^[a-z0-9-]{1,100}$/.test(s)))
    throw new Error("usage: <slug>... [--apply]");
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.product.findMany({
      where: { slug: { in: slugs } },
      select: { slug: true, isActive: true, _count: { select: { plans: true } } },
    });
    for (const slug of slugs) {
      const row = rows.find((r) => r.slug === slug);
      console.log(
        `${slug}: ${row ? `active=${row.isActive} plans=${row._count.plans}` : "not found"}`,
      );
    }
    const target = rows.filter((r) => r.isActive && r._count.plans === 0).map((r) => r.slug);
    console.log(`${apply ? "DEACTIVATE" : "DRY-RUN"}: ${target.join(", ") || "nothing"}`);
    if (!apply || !target.length) return;
    const result = await prisma.product.updateMany({
      where: { slug: { in: target }, isActive: true, plans: { none: {} } },
      data: { isActive: false },
    });
    console.log(`deactivated ${result.count}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
