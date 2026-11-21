import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { inject } from "light-my-request";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";

async function main() {
  assert.equal(process.env.ISOLATED_REGRESSION_DB, "1");
  const app = createApp();
  const category = await prisma.category.create({
    data: { name: "Search fixture", slug: randomUUID() },
  });
  const create = (slug: string, name: string, active = true, featured = false) =>
    prisma.product.create({
      data: {
        slug,
        name,
        description: "Synthetic catalog search fixture",
        type: "ACCOUNT",
        categoryId: category.id,
        isActive: active,
        isFeatured: featured,
      },
    });

  const chatgpt = await create("chatgpt", "ChatGPT", true, true);
  const canva = await create("canva", "Canva");
  const claude = await create("claude", "Claude");
  const netflix = await create("netflix", "Netflix");
  const spotify = await create("spotify", "Spotify");
  const gemini = await create("gemini", "Gemini");
  const adobe = await create("adobe-creative-cloud", "Adobe Creative Cloud");
  const searchPeer = await create(randomUUID(), "Persian normalization fixture");
  const privateProduct = await create(randomUUID(), "Hidden Match", false);
  await prisma.product.update({
    where: { id: searchPeer.id },
    data: { metaTitle: "کیت‌طراحی" },
  });
  await prisma.productPlan.createMany({
    data: [
      { productId: chatgpt.id, label: "اکانت Chat GPT Plus یک‌ماهه", price: 100 },
      { productId: searchPeer.id, label: "ChatGPT Plus alternative", price: 200 },
      { productId: chatgpt.id, label: "Retired fixture term", price: 50, isActive: false },
      { productId: privateProduct.id, label: "Hidden Plan Match", price: 50 },
    ],
  });

  async function search(q: string, filters: Record<string, string> = {}) {
    const params = new URLSearchParams({ q, category: category.slug, ...filters });
    const response = await inject(app, { method: "GET", url: `/products?${params}` });
    assert.equal(response.statusCode, 200, response.body);
    return response.json() as {
      items: { id: string; availability: string }[];
      pagination: { total: number; totalPages: number; page: number; pageSize: number };
    };
  }

  for (const [term, product] of [
    ["chat gpt", chatgpt],
    ["چت", chatgpt],
    ["چت‌جی پی تي", chatgpt],
    ["chatgtp", chatgpt],
    ["كلود", claude],
    ["كانوا", canva],
    ["نتفليكس", netflix],
    ["اسپاتيفای", spotify],
    ["جمینای", gemini],
    ["photoshop", adobe],
    ["فتو شاپ", adobe],
    ["adobe-creative-cloud", adobe],
    ["كيت طراحی", searchPeer],
  ] as const) {
    const result = await search(term);
    assert.ok(
      result.items.some((item) => item.id === product.id),
      `Search for ${term}`,
    );
  }

  for (const sort of [
    "recommended",
    "newest",
    "popular",
    "bestselling",
    "available",
    "price_asc",
    "price_desc",
  ]) {
    const [first, second, pastEnd] = await Promise.all(
      ["1", "2", "3"].map((page) => search("ChatGPT Plus", { page, pageSize: "1", sort })),
    );
    assert.deepEqual(first.pagination, { page: 1, pageSize: 1, total: 2, totalPages: 2 });
    assert.equal(first.items[0].availability, "OUT_OF_STOCK");
    assert.deepEqual(
      new Set([first.items[0].id, second.items[0].id]),
      new Set([chatgpt.id, searchPeer.id]),
    );
    assert.equal(pastEnd.pagination.total, 2);
    assert.deepEqual(pastEnd.items, []);
  }

  assert.deepEqual(
    (await search("ChatGPT Plus", { featured: "true" })).items.map((item) => item.id),
    [chatgpt.id],
  );
  assert.equal((await search("ChatGPT Plus", { category: randomUUID() })).pagination.total, 0);
  for (const term of [
    "Retired fixture term",
    "Hidden Match",
    "Hidden Plan Match",
    "%",
    "_",
    "\u200c",
  ]) {
    assert.equal((await search(term)).pagination.total, 0, `Unexpected match for ${term}`);
  }

  const tooLong = new URLSearchParams({ q: "a".repeat(101) });
  assert.equal((await inject(app, { method: "GET", url: `/products?${tooLong}` })).statusCode, 400);
  await prisma.product.deleteMany({ where: { categoryId: category.id } });
  await prisma.category.delete({ where: { id: category.id } });
  console.log("PASS: normalized catalog search, aliases, active plans, filters and pagination");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
