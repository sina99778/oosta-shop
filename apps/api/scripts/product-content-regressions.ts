import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { inject } from "light-my-request";
import { createApp } from "../src/app";
import { signAccessToken } from "../src/lib/jwt";
import { prisma } from "../src/lib/prisma";
import updater from "../../../scripts/apply-product-content.cjs";
import termsUpdater from "../../../scripts/apply-plan-activation-terms.cjs";
import exporter from "../../../scripts/export-supplier-plan-terms.cjs";

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
    const specs = [{ label: "Provider", value: "Synthetic provider" }];
    const curatedSpecs = [{ label: "Provider", value: "Existing provider" }];
    await prisma.product.update({ where: { id: products[1].id }, data: { specs: curatedSpecs } });
    const records = products.map((product) => ({
      slug: product.slug,
      shortDescription: "Synthetic summary",
      description: "Reviewed synthetic product content",
      metaTitle: "Synthetic title",
      metaDescription: "Synthetic meta description",
      specs,
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
    await assert.rejects(
      updater.run({ ...options, slugs: ["unknown-product"] }),
      /Unknown content slug/,
    );
    const selected = {
      ...options,
      backupFile: path.join(directory, "single-backup.json"),
      slugs: [products[0].slug],
    };
    assert.deepEqual((await updater.run(selected)).products, selected.slugs);
    assert.deepEqual(await updater.run({ ...selected, apply: true }), { updated: 1, unchanged: 0 });
    assert.equal(
      (await prisma.product.findUniqueOrThrow({ where: { id: products[1].id } })).description,
      "Original content",
    );
    await updater.run(options);
    assert.deepEqual(await updater.run({ ...options, apply: true }), { updated: 1, unchanged: 1 });
    assert.deepEqual(await updater.run({ ...options, apply: true }), { updated: 0, unchanged: 2 });
    assert.deepEqual(
      (await prisma.product.findUniqueOrThrow({ where: { id: products[0].id } })).specs,
      specs,
    );
    assert.deepEqual(
      (await prisma.product.findUniqueOrThrow({ where: { id: products[1].id } })).specs,
      curatedSpecs,
    );
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

    const termsAdmin = await prisma.user.create({
      data: {
        name: "Synthetic plan terms editor",
        email: randomUUID() + "@example.invalid",
        passwordHash: "unused",
        role: "ADMIN",
      },
    });
    const authHeader = {
      authorization: "Bearer " + signAccessToken({ sub: termsAdmin.id, role: "ADMIN" }),
    };
    const app = createApp();
    const createdPlan = await inject(app, {
      method: "POST",
      url: `/admin/products/${products[0].id}/plans`,
      headers: authHeader,
      payload: {
        label: "Synthetic Terms Plan",
        price: 1500000,
        activationTerms: "  شرایط اولیهٔ فعال‌سازی  ",
      },
    });
    assert.equal(createdPlan.statusCode, 201, createdPlan.body);
    const createdPlanId = createdPlan.json().plan.id;
    assert.equal(createdPlan.json().plan.activationTerms, "شرایط اولیهٔ فعال‌سازی");

    // Existing inventory must not block non-semantic activationTerms edits via PLAN_IN_USE.
    await prisma.inventoryItem.create({
      data: {
        productId: products[0].id,
        planId: createdPlanId,
        type: "ACCOUNT",
        accountEmail: "synthetic@example.invalid",
        accountPassword: "unused",
      },
    });
    const patchedPlan = await inject(app, {
      method: "PATCH",
      url: `/admin/plans/${createdPlanId}`,
      headers: authHeader,
      payload: { activationTerms: "  شرایط جدید پس از موجودی  " },
    });
    assert.equal(patchedPlan.statusCode, 200, patchedPlan.body);
    assert.equal(patchedPlan.json().plan.activationTerms, "شرایط جدید پس از موجودی");

    const publicView = await inject(app, {
      method: "GET",
      url: `/products/${products[0].slug}`,
    });
    assert.equal(publicView.statusCode, 200, publicView.body);
    assert.equal(
      publicView
        .json()
        .product.plans.find((plan: { id: string }) => plan.id === createdPlanId).activationTerms,
      "شرایط جدید پس از موجودی",
    );

    const clearedPlan = await inject(app, {
      method: "PATCH",
      url: `/admin/plans/${createdPlanId}`,
      headers: authHeader,
      payload: { activationTerms: "   " },
    });
    assert.equal(clearedPlan.statusCode, 200, clearedPlan.body);
    assert.equal(clearedPlan.json().plan.activationTerms, null);

    const oversizedPlan = await inject(app, {
      method: "PATCH",
      url: `/admin/plans/${createdPlanId}`,
      headers: authHeader,
      payload: { activationTerms: "a".repeat(4001) },
    });
    assert.equal(oversizedPlan.statusCode, 400, oversizedPlan.body);

    const { validateActivationTerms, applyPlanActivationTerms } = termsUpdater;
    assert.equal(validateActivationTerms("  "), null);
    assert.equal(validateActivationTerms(null), null);
    assert.match(
      validateActivationTerms(
        "پس از خرید، با @oostaAiSupport یا https://t.me/oostaAiSupport و https://oostaai.store/fa/p/contact در ارتباط باشید.",
      ) ?? "",
      /@oostaAiSupport/,
    );
    assert.throws(() => validateActivationTerms("پیام به @competitor_bot"), /Disallowed.*handle/);
    assert.throws(() => validateActivationTerms("لینک https://evil.example/a"), /Disallowed URL/);
    assert.throws(() => validateActivationTerms("t.me/other_bot"), /Disallowed URL/);
    assert.throws(
      () => validateActivationTerms("Please send email and password to activate"),
      /password solicitation/i,
    );
    assert.throws(() => validateActivationTerms("a".repeat(4001)), /4000/);

    const batch = [
      {
        planId: createdPlanId,
        activationTerms: "## فعال‌سازی\n- اکانت آماده ارسال می‌شود.\n- پشتیبانی: @oostaAiSupport",
      },
    ];
    assert.deepEqual(await applyPlanActivationTerms(prisma, batch, { apply: false }), {
      preview: true,
      total: 1,
      wouldUpdate: 1,
      unchanged: 0,
    });
    assert.equal(
      (await prisma.productPlan.findUniqueOrThrow({ where: { id: createdPlanId } }))
        .activationTerms,
      null,
    );
    assert.deepEqual(await applyPlanActivationTerms(prisma, batch, { apply: true }), {
      applied: true,
      total: 1,
      updated: 1,
      unchanged: 0,
    });
    assert.deepEqual(await applyPlanActivationTerms(prisma, batch, { apply: true }), {
      applied: true,
      total: 1,
      updated: 0,
      unchanged: 1,
    });
    await assert.rejects(
      applyPlanActivationTerms(
        prisma,
        [{ planId: "missing-plan-id", activationTerms: "معتبر" }],
        { apply: true },
      ),
      /Unknown planId/,
    );

    const mappedPlan = await prisma.productPlan.create({
      data: {
        productId: products[0].id,
        label: "Synthetic Supplier Plan",
        price: 1000000,
        source: "SUPPLIER",
        supplierMappings: [
          {
            supplier: "canboso",
            externalId: "ext-123",
            fingerprint: "a".repeat(64),
          },
        ],
      },
    });
    const priorCatalog = await prisma.siteSetting.findUnique({
      where: { key: "suppliers.catalog.canboso" },
    });
    await prisma.siteSetting.upsert({
      where: { key: "suppliers.catalog.canboso" },
      create: {
        key: "suppliers.catalog.canboso",
        value: JSON.stringify({
          supplier: "canboso",
          offers: [
            {
              externalId: "ext-123",
              name: "Upstream Offer",
              description: "Synthetic upstream rules",
              cost: "99.99",
              flags: [],
            },
          ],
        }),
      },
      update: {
        value: JSON.stringify({
          supplier: "canboso",
          offers: [
            {
              externalId: "ext-123",
              name: "Upstream Offer",
              description: "Synthetic upstream rules",
              cost: "99.99",
              flags: [],
            },
          ],
        }),
      },
    });
    try {
      const exported = await exporter.exportSupplierPlanTerms(prisma);
      const row = exported.find((item: { planId: string }) => item.planId === mappedPlan.id);
      assert(row, "Mapped active plan must be exported");
      assert.equal(row.supplierOffers.length, 1);
      assert.equal(row.supplierOffers[0].description, "Synthetic upstream rules");
      assert.equal("cost" in row.supplierOffers[0], false);
    } finally {
      if (priorCatalog) {
        await prisma.siteSetting.update({
          where: { key: "suppliers.catalog.canboso" },
          data: { value: priorCatalog.value },
        });
      } else {
        await prisma.siteSetting.delete({ where: { key: "suppliers.catalog.canboso" } });
      }
    }
    console.log(
      "PASS: per-plan activationTerms API, inventory-safe updates, leak-guarded bulk import and read-only supplier terms export",
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
