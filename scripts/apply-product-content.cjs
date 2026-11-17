/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const fields = ["shortDescription", "description", "metaTitle", "metaDescription"];
const matches = (row, data) => fields.every((field) => row[field] === data[field]);

async function run({ directory, backupFile, apply = false, apiRoot, adminEmail }) {
  const { prisma } = require(path.join(apiRoot, "lib/prisma"));
  const { updateProductSchema } = require(path.join(apiRoot, "modules/admin/admin.schemas"));
  const files = fs.readdirSync(directory).filter((name) => /^top-[a-z-]+\.fa\.json$/.test(name));
  const records = files.flatMap((name) =>
    JSON.parse(fs.readFileSync(path.join(directory, name), "utf8")),
  );
  assert(records.length > 0 && records.length <= 50, "Unexpected content batch size");
  assert.equal(new Set(records.map((item) => item.slug)).size, records.length, "Duplicate slugs");
  const changes = records.map((record) => {
    assert(/^[a-z0-9-]{1,100}$/.test(record.slug), "Invalid product slug");
    assert(record.sources?.length > 0, "Product needs reviewed sources");
    assert(
      record.sources.every((source) => new URL(source.url).protocol === "https:"),
      "Use HTTPS sources",
    );
    const data = updateProductSchema.parse(
      Object.fromEntries(fields.map((field) => [field, record[field]])),
    );
    assert(
      fields.every((field) => typeof data[field] === "string" && data[field].length > 0),
      "Missing content field",
    );
    return { slug: record.slug, data };
  });
  const select = {
    id: true,
    slug: true,
    isActive: true,
    updatedAt: true,
    ...Object.fromEntries(fields.map((field) => [field, true])),
  };
  const rows = await prisma.product.findMany({
    where: { slug: { in: changes.map((item) => item.slug) }, isActive: true },
    select,
  });
  assert.equal(rows.length, changes.length, "Every target product must exist and be active");
  if (!apply) {
    assert(
      await prisma.user.findFirst({
        where: { email: adminEmail, role: "ADMIN" },
        select: { id: true },
      }),
      "Current admin role required",
    );
    fs.writeFileSync(backupFile, JSON.stringify({ products: rows }, null, 2), {
      flag: "wx",
      mode: 0o600,
    });
    return { preview: true, products: changes.map((item) => item.slug) };
  }
  const backup = JSON.parse(fs.readFileSync(backupFile, "utf8"));
  assert.equal(backup.products.length, changes.length, "Backup scope mismatch");
  const originals = new Map(backup.products.map((item) => [item.slug, item]));
  return prisma.$transaction(
    async (tx) => {
      assert(
        await tx.user.findFirst({
          where: { email: adminEmail, role: "ADMIN" },
          select: { id: true },
        }),
        "Current admin role required",
      );
      let updated = 0;
      for (const change of changes) {
        const original = originals.get(change.slug);
        const current = await tx.product.findUnique({ where: { slug: change.slug }, select });
        assert(
          original && current && original.id === current.id && current.isActive,
          "Product scope changed",
        );
        if (matches(current, change.data)) continue;
        const result = await tx.product.updateMany({
          where: {
            id: original.id,
            isActive: true,
            updatedAt: new Date(original.updatedAt),
            ...Object.fromEntries(fields.map((field) => [field, original[field]])),
          },
          data: change.data,
        });
        assert.equal(result.count, 1, "Product changed since preview; batch rolled back");
        updated++;
      }
      return { updated, unchanged: changes.length - updated };
    },
    { timeout: 30000 },
  );
}

module.exports = { run };
if (require.main === module) {
  const [directory, backupFile, mode] = process.argv.slice(2);
  assert(["--preview", "--apply"].includes(mode), "Choose preview or apply");
  const apiRoot = process.env.CONTENT_API_ROOT || "/app/apps/api/dist";
  run({
    directory,
    backupFile,
    apply: mode === "--apply",
    apiRoot,
    adminEmail: process.env.CONTENT_ADMIN_EMAIL || "sinanaseri2004@gmail.com",
  })
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    })
    .finally(async () => {
      await require(path.join(apiRoot, "lib/prisma")).prisma.$disconnect();
    });
}
