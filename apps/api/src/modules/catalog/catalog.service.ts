// Public catalog read model: categories, product listings (filter/sort/paginate),
// bestselling, and product detail with live per-plan stock counts.

import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/httpError";
import type { ListProductsQuery } from "./catalog.schemas";

type ProductWithRelations = Prisma.ProductGetPayload<{
  include: { category: true; plans: true };
}>;

type ProductSummary = {
  id: string;
  name: string;
  slug: string;
  image: string | null;
  type: ProductWithRelations["type"];
  category: { id: string; name: string; slug: string };
  priceFrom: number | null;
  currency: string;
  availableStock: number;
  inStock: boolean;
  createdAt: Date;
};

function toSummary(product: ProductWithRelations, availableStock: number): ProductSummary {
  const prices = product.plans.map((plan) => Number(plan.price));
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    image: product.image,
    type: product.type,
    category: {
      id: product.category.id,
      name: product.category.name,
      slug: product.category.slug,
    },
    priceFrom: prices.length ? Math.min(...prices) : null,
    currency: product.plans[0]?.currency ?? "IRR",
    availableStock,
    inStock: availableStock > 0,
    createdAt: product.createdAt,
  };
}

async function availableCountByProduct(productIds: string[]): Promise<Map<string, number>> {
  if (productIds.length === 0) return new Map();
  const rows = await prisma.inventoryItem.groupBy({
    by: ["productId"],
    where: { status: "AVAILABLE", productId: { in: productIds } },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.productId, row._count._all]));
}

export async function listCategories() {
  const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });
  const counts = await prisma.product.groupBy({
    by: ["categoryId"],
    where: { isActive: true },
    _count: { _all: true },
  });
  const countMap = new Map(counts.map((c) => [c.categoryId, c._count._all]));
  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    slug: category.slug,
    productCount: countMap.get(category.id) ?? 0,
  }));
}

export async function listProducts(query: ListProductsQuery) {
  const where: Prisma.ProductWhereInput = { isActive: true };
  if (query.category) where.category = { slug: query.category };
  if (query.q) where.name = { contains: query.q, mode: "insensitive" };

  const products = await prisma.product.findMany({
    where,
    include: { category: true, plans: { where: { isActive: true } } },
    orderBy: { createdAt: "desc" },
  });

  const availMap = await availableCountByProduct(products.map((p) => p.id));
  const summaries = products.map((product) => toSummary(product, availMap.get(product.id) ?? 0));

  if (query.sort === "price_asc") {
    summaries.sort((a, b) => (a.priceFrom ?? Infinity) - (b.priceFrom ?? Infinity));
  } else if (query.sort === "price_desc") {
    summaries.sort((a, b) => (b.priceFrom ?? -Infinity) - (a.priceFrom ?? -Infinity));
  }
  // "newest" is already ordered by the database query.

  const total = summaries.length;
  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const start = (query.page - 1) * query.pageSize;
  const items = summaries.slice(start, start + query.pageSize);

  return {
    items,
    pagination: { page: query.page, pageSize: query.pageSize, total, totalPages },
  };
}

export async function getBestselling(limit: number) {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    include: { category: true, plans: { where: { isActive: true } } },
  });
  const ids = products.map((p) => p.id);

  const [availMap, soldRows] = await Promise.all([
    availableCountByProduct(ids),
    prisma.inventoryItem.groupBy({
      by: ["productId"],
      where: { status: "SOLD", productId: { in: ids } },
      _count: { _all: true },
    }),
  ]);
  const soldMap = new Map(soldRows.map((row) => [row.productId, row._count._all]));

  return products
    .map((product) => ({
      summary: toSummary(product, availMap.get(product.id) ?? 0),
      sold: soldMap.get(product.id) ?? 0,
    }))
    .sort(
      (a, b) => b.sold - a.sold || b.summary.createdAt.getTime() - a.summary.createdAt.getTime(),
    )
    .slice(0, limit)
    .map((ranked) => ({ ...ranked.summary, soldCount: ranked.sold }));
}

export async function getProductBySlug(slug: string) {
  const product = await prisma.product.findFirst({
    where: { slug, isActive: true },
    include: { category: true, plans: { where: { isActive: true }, orderBy: { price: "asc" } } },
  });
  if (!product) {
    throw new AppError(404, "NOT_FOUND", "Product not found");
  }

  const counts = await prisma.inventoryItem.groupBy({
    by: ["planId"],
    where: { productId: product.id, status: "AVAILABLE" },
    _count: { _all: true },
  });
  const planAvail = new Map(counts.map((row) => [row.planId, row._count._all]));

  const plans = product.plans.map((plan) => {
    const availableStock = planAvail.get(plan.id) ?? 0;
    return {
      id: plan.id,
      label: plan.label,
      durationDays: plan.durationDays,
      price: Number(plan.price),
      currency: plan.currency,
      availableStock,
      inStock: availableStock > 0,
    };
  });

  const totalAvailable = plans.reduce((sum, plan) => sum + plan.availableStock, 0);

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    image: product.image,
    type: product.type,
    category: {
      id: product.category.id,
      name: product.category.name,
      slug: product.category.slug,
    },
    priceFrom: plans.length ? Math.min(...plans.map((plan) => plan.price)) : null,
    currency: plans[0]?.currency ?? "IRR",
    availableStock: totalAvailable,
    inStock: totalAvailable > 0,
    plans,
    createdAt: product.createdAt,
  };
}
