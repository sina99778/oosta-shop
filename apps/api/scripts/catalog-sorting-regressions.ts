import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { inject } from "light-my-request";
import { prisma } from "../src/lib/prisma";
import { createApp } from "../src/app";
import { listProductsQuery } from "../src/modules/catalog/catalog.schemas";
import type { Prisma } from "@prisma/client";

async function main() {
  assert.equal(process.env.ISOLATED_REGRESSION_DB, "1");
  const app = createApp();
  const category = await prisma.category.create({
    data: { name: "Sorting fixture", slug: randomUUID() },
  });
  const user = await prisma.user.create({
    data: { name: "Sorting fixture", passwordHash: "unused" },
  });
  const create = (slug: string, price: number) =>
    prisma.product.create({
      data: {
        slug,
        name: slug,
        description: "Synthetic sorting regression",
        type: "ACCOUNT",
        categoryId: category.id,
        plans: { create: { label: "Synthetic", price } },
      },
      include: { plans: true },
    });
  const known = await create("canva", 100);
  const obscure = await create("unknown-" + randomUUID(), 200);
  const inactive = await prisma.productPlan.create({
    data: { productId: known.id, label: "Inactive stock fixture", price: 25, isActive: false },
  });
  await prisma.inventoryItem.createMany({
    data: [
      { productId: known.id, planId: inactive.id, type: "ACCOUNT", status: "AVAILABLE" },
      { productId: known.id, type: "ACCOUNT", status: "AVAILABLE" },
    ],
  });
  const quote = await prisma.product.create({
    data: {
      name: "No price",
      slug: randomUUID(),
      description: "Synthetic",
      type: "ACCOUNT",
      categoryId: category.id,
    },
  });
  await prisma.inventoryItem.create({
    data: {
      productId: obscure.id,
      planId: obscure.plans[0].id,
      type: "ACCOUNT",
      status: "AVAILABLE",
    },
  });
  await prisma.review.create({
    data: { userId: user.id, productId: obscure.id, rating: 5, status: "APPROVED" },
  });
  await prisma.review.create({
    data: { userId: user.id, productId: known.id, rating: 5, status: "PENDING" },
  });
  for (const [product, status, quantity] of [
    [known, "REFUNDED", 99],
    [known, "PENDING", 99],
    [obscure, "PAID", 2],
  ] as const) {
    await prisma.order.create({
      data: {
        userId: user.id,
        totalAmount: 100 * quantity,
        paymentStatus: status,
        items: {
          create: {
            productId: product.id,
            planId: product.plans[0].id,
            quantity,
            unitPrice: 100,
            lineTotal: 100 * quantity,
          },
        },
      },
    });
  }
  async function items(sort?: string, page = 1, pageSize = 12) {
    const query = new URLSearchParams({
      category: category.slug,
      page: String(page),
      pageSize: String(pageSize),
    });
    if (sort) query.set("sort", sort);
    const result = await inject(app, { method: "GET", url: "/products?" + query });
    assert.equal(result.statusCode, 200, result.body);
    return result.json().items as {
      id: string;
      availability: string;
      availableStock: number;
      priceFrom: number | null;
    }[];
  }
  assert.equal(listProductsQuery.parse({}).sort, "recommended");
  const recommended = await items();
  assert.equal(recommended[0].id, known.id);
  assert.equal((await items("recommended", 2, 1))[0].id, recommended[1].id);
  assert.equal((await items("recommended", 5, 1)).length, 0);
  const available = await items("available");
  assert.equal(available[0].id, obscure.id);
  assert.equal(available[0].availability, "LOCAL_STOCK");
  assert.equal(available.find((p) => p.id === known.id)?.availability, "OUT_OF_STOCK");
  assert.equal(available.find((p) => p.id === known.id)?.availableStock, 0);
  assert.equal((await items("popular"))[0].id, obscure.id);
  assert.equal((await items("popular", 1, 1))[0].id, obscure.id);
  assert.equal((await items("popular", 2, 1))[0].id, known.id);
  assert.equal((await items("bestselling"))[0].id, obscure.id);
  for (const sort of ["price_asc", "price_desc"]) {
    const sorted = await items(sort);
    assert.equal(sorted[0].id, obscure.id, "An obtainable price ranks before unavailable prices");
    assert.equal(sorted.find((item) => item.id === known.id)?.priceFrom, null);
    assert.equal(sorted.find((item) => item.id === quote.id)?.priceFrom, null);
  }
  // 19 tomans = 190 rials. The 100-rial plan is sold out and the stocked
  // 192-rial alternative is more expensive.
  const selected = await prisma.productPlan.create({
    data: {
      productId: known.id,
      label: "Monthly",
      durationDays: 30,
      price: 25,
      salePrice: 19,
      currency: "IRT",
    },
  });
  const alternate = await prisma.productPlan.create({
    data: { productId: known.id, label: "Other", price: 192, currency: "IRR" },
  });
  await prisma.inventoryItem.createMany({
    data: [selected, alternate].map((p) => ({
      productId: known.id,
      planId: p.id,
      type: "ACCOUNT" as const,
    })),
  });
  const rival = await prisma.productPlan.update({
    where: { id: obscure.plans[0].id },
    data: { price: 185, currency: "IRR" },
  });
  assert.equal((await items("price_asc", 1, 1))[0].id, obscure.id);
  assert.equal((await items("price_desc", 1, 1))[0].id, known.id);
  const detail = await inject(app, { method: "GET", url: "/products/" + known.slug });
  assert.equal(detail.statusCode, 200);
  for (const summary of [detail.json().product, (await items("price_asc", 2, 1))[0]]) {
    assert.equal(summary.pricePlanId, selected.id);
    assert.equal(summary.priceDurationDays, 30);
    assert.equal(summary.priceFrom, 19);
    assert.equal(summary.originalPriceFrom, 25);
    assert.equal(summary.currency, "IRT");
  }
  await prisma.productPlan.update({ where: { id: rival.id }, data: { price: 200 } });
  assert.equal((await items("price_asc", 1, 1))[0].id, known.id);
  await prisma.productPlan.update({ where: { id: alternate.id }, data: { price: 180 } });
  const cheaperRialPlan = (await items("price_asc", 1, 1))[0];
  assert.equal(cheaperRialPlan.id, known.id);
  assert.equal(cheaperRialPlan.priceFrom, 180, "180 rials cost less than 19 tomans");
  assert.equal((await items("bestselling", 1, 1))[0].id, obscure.id);
  assert.equal((await items("bestselling", 2, 1)).length, 1);
  const originalFindMany = prisma.product.findMany;
  let hydratedProducts = 0;
  prisma.product.findMany = (async (args: Prisma.ProductFindManyArgs) => {
    const rows = await originalFindMany(args);
    if (args.include?.plans) hydratedProducts += rows.length;
    return rows;
  }) as typeof originalFindMany;
  try {
    for (const sort of ["popular", "bestselling"]) {
      hydratedProducts = 0;
      assert.equal((await items(sort, 1, 1))[0].id, obscure.id);
      assert.equal(hydratedProducts, 1, "Only hydrate the displayed page's product plans");
    }
  } finally {
    prisma.product.findMany = originalFindMany;
  }
  const invalid = await inject(app, { method: "GET", url: "/products?sort=invalid" });
  assert.equal(invalid.statusCode, 400);
  const chatgpt = await prisma.product.create({
    data: {
      slug: "chatgpt",
      name: "ChatGPT",
      description: "Synthetic",
      type: "ACCOUNT",
      categoryId: category.id,
      plans: {
        create: [
          { label: "Cheaper unwarranted plan", price: 1 },
          {
            label: "Preferred full month",
            durationDays: 30,
            price: 100,
            variant: {
              plan: "ChatGPT Plus",
              access: "PERSONAL",
              fulfillment: "ACCOUNT",
              delivery: "MANUAL",
              warranty: { kind: "WARRANTED", days: 30, coverage: "FULL" },
              region: "UNSPECIFIED",
              quota: "UNSPECIFIED",
            },
          },
        ],
      },
    },
    include: { plans: true },
  });
  const response = await inject(app, { method: "GET", url: "/products/chatgpt" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().product.plans[0].label, "Preferred full month");
  assert.equal(response.json().product.plans.length, chatgpt.plans.length);
  console.log(
    "PASS: catalog ranking before pagination, approved ratings, actual paid sales, unavailable prices and rejected sort",
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
