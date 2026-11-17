import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import updater from "../../../scripts/apply-product-content.cjs";

async function main() {
  assert.equal(process.env.ISOLATED_REGRESSION_DB, "1");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "oosta-content-"));
  try {
    const admin = await prisma.user.create({
      data: {
        name: "Synthetic editor",
        email: randomUUID() + "@example.invalid",
        passwordHash: "unused",
        role: "ADMIN",
      },
    });
    const category = await prisma.category.create({
      data: { name: "Synthetic content", slug: randomUUID() },
    });
    const products = await Promise.all(
      ["one", "two"].map((name) =>
        prisma.product.create({
          data: {
            name,
            slug: randomUUID(),
            description: "Original content",
            categoryId: category.id,
            type: "ACCOUNT",
          },
        }),
      ),
    );
    const records = products.map((product) => ({
      slug: product.slug,
      shortDescription: "Synthetic summary",
      description: "Reviewed synthetic product content",
      metaTitle: "Synthetic title",
      metaDescription: "Synthetic meta description",
      sources: [{ title: "Synthetic reference", url: "https://example.invalid/reference" }],
    }));
    const inputFile = path.join(directory, "top-fixture.fa.json");
    fs.writeFileSync(inputFile, JSON.stringify(records));
    const options = {
      directory,
      backupFile: path.join(directory, "backup.json"),
      apiRoot: path.resolve(__dirname, "../src"),
      adminEmail: admin.email,
    };
    await updater.run(options);
    assert.deepEqual(await updater.run({ ...options, apply: true }), { updated: 2, unchanged: 0 });
    assert.deepEqual(await updater.run({ ...options, apply: true }), { updated: 0, unchanged: 2 });
    const fresh = { ...options, backupFile: path.join(directory, "fresh-backup.json") };
    await updater.run(fresh);
    records.forEach((record) => {
      record.description = "Second reviewed draft";
    });
    fs.writeFileSync(inputFile, JSON.stringify(records));
    await prisma.product.update({
      where: { id: products[1].id },
      data: { description: "Concurrent editor change", updatedAt: new Date("2030-01-01") },
    });
    await assert.rejects(updater.run({ ...fresh, apply: true }), /changed since preview/);
    assert.equal(
      (await prisma.product.findUniqueOrThrow({ where: { id: products[0].id } })).description,
      "Reviewed synthetic product content",
    );
    assert.equal(
      (await prisma.product.findUniqueOrThrow({ where: { id: products[1].id } })).description,
      "Concurrent editor change",
    );
    await prisma.user.update({ where: { id: admin.id }, data: { role: "USER" } });
    await assert.rejects(updater.run({ ...fresh, apply: true }), /Current admin role/);
    console.log(
      "PASS: reviewed product content backup, atomic update, safe retry, concurrent-edit rollback and current-role denial",
    );
  } finally {
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert(path.basename(directory).startsWith("oosta-content-"));
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
