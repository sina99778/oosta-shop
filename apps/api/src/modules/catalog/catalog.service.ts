// Public catalog read model: categories, product listings (filter/sort/paginate),
// bestselling, product detail (gallery, specs, sale price, rating, related), and
// customer review submission.

import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/httpError";
import type { ListProductsQuery } from "./catalog.schemas";

const LOW_STOCK_THRESHOLD = 5;

// imageData (Bytes) is deliberately omitted from list/detail reads so we never load
// image blobs for catalog pages; bytes are only selected by the image endpoints.
const omitImageData = { imageData: true } as const;

type ProductWithRelations = Prisma.ProductGetPayload<{
  include: { category: true; plans: true };
  omit: { imageData: true };
}>;

type PlanRow = ProductWithRelations["plans"][number];
type Rating = { average: number; count: number };

// Effective price = sale price when it is set and genuinely lower than the regular price.
function priceView(plan: PlanRow) {
  const price = Number(plan.price);
  const sale = plan.salePrice != null ? Number(plan.salePrice) : null;
  const onSale = sale != null && sale < price;
  const effective = onSale ? (sale as number) : price;
  return {
    price,
    salePrice: onSale ? (sale as number) : null,
    effectivePrice: effective,
    onSale,
    discountPercent: onSale ? Math.round((1 - effective / price) * 100) : 0,
  };
}

function specsOf(value: Prisma.JsonValue | null): Array<{ label: string; value: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      const r = row as { label?: unknown; value?: unknown };
      return { label: String(r?.label ?? ""), value: String(r?.value ?? "") };
    })
    .filter((r) => r.label || r.value);
}

type ProductSummary = {
  id: string;
  name: string;
  slug: string;
  image: string | null;
  hasImage: boolean;
  type: ProductWithRelations["type"];
  category: { id: string; name: string; slug: string };
  priceFrom: number | null;
  originalPriceFrom: number | null;
  discountPercent: number;
  currency: string;
  availableStock: number;
  inStock: boolean;
  lowStock: boolean;
  isFeatured: boolean;
  ratingAverage: number;
  ratingCount: number;
  createdAt: Date;
};

function toSummary(
  product: ProductWithRelations,
  availableStock: number,
  rating?: Rating,
): ProductSummary {
  const views = product.plans.map(priceView);
  // The "from" badge follows the cheapest *effective* plan.
  const cheapest = views.reduce<(typeof views)[number] | null>(
    (best, v) => (best === null || v.effectivePrice < best.effectivePrice ? v : best),
    null,
  );
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    image: product.image,
    hasImage: product.imageMimeType != null,
    type: product.type,
    category: {
      id: product.category.id,
      name: product.category.name,
      slug: product.category.slug,
    },
    priceFrom: cheapest ? cheapest.effectivePrice : null,
    originalPriceFrom: cheapest?.onSale ? cheapest.price : null,
    discountPercent: cheapest?.discountPercent ?? 0,
    currency: product.plans[0]?.currency ?? "IRR",
    availableStock,
    inStock: availableStock > 0,
    lowStock: availableStock > 0 && availableStock <= LOW_STOCK_THRESHOLD,
    isFeatured: product.isFeatured,
    ratingAverage: rating ? Math.round(rating.average * 10) / 10 : 0,
    ratingCount: rating?.count ?? 0,
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

async function ratingByProduct(productIds: string[]): Promise<Map<string, Rating>> {
  if (productIds.length === 0) return new Map();
  const rows = await prisma.review.groupBy({
    by: ["productId"],
    where: { status: "APPROVED", productId: { in: productIds } },
    _avg: { rating: true },
    _count: { _all: true },
  });
  return new Map(
    rows.map((r) => [r.productId, { average: r._avg.rating ?? 0, count: r._count._all }]),
  );
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
  if (query.featured) where.isFeatured = true;

  const products = await prisma.product.findMany({
    where,
    include: { category: true, plans: { where: { isActive: true } } },
    omit: omitImageData,
    orderBy: { createdAt: "desc" },
  });

  const ids = products.map((p) => p.id);
  const [availMap, ratingMap] = await Promise.all([
    availableCountByProduct(ids),
    ratingByProduct(ids),
  ]);
  const summaries = products.map((product) =>
    toSummary(product, availMap.get(product.id) ?? 0, ratingMap.get(product.id)),
  );

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
    omit: omitImageData,
  });
  const ids = products.map((p) => p.id);

  const [availMap, ratingMap, soldRows] = await Promise.all([
    availableCountByProduct(ids),
    ratingByProduct(ids),
    prisma.inventoryItem.groupBy({
      by: ["productId"],
      where: { status: "SOLD", productId: { in: ids } },
      _count: { _all: true },
    }),
  ]);
  const soldMap = new Map(soldRows.map((row) => [row.productId, row._count._all]));

  return products
    .map((product) => ({
      summary: toSummary(product, availMap.get(product.id) ?? 0, ratingMap.get(product.id)),
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
    include: {
      category: true,
      plans: { where: { isActive: true }, orderBy: { price: "asc" } },
      images: { orderBy: { sortOrder: "asc" }, select: { id: true } },
    },
    omit: omitImageData,
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
    const view = priceView(plan);
    return {
      id: plan.id,
      label: plan.label,
      durationDays: plan.durationDays,
      price: view.price,
      salePrice: view.salePrice,
      effectivePrice: view.effectivePrice,
      onSale: view.onSale,
      discountPercent: view.discountPercent,
      currency: plan.currency,
      availableStock,
      inStock: availableStock > 0,
    };
  });

  const totalAvailable = plans.reduce((sum, plan) => sum + plan.availableStock, 0);
  const effectivePrices = plans.map((p) => p.effectivePrice);

  // Approved reviews + rating, and related products from the same category.
  const [reviews, ratingAgg, related] = await Promise.all([
    prisma.review.findMany({
      where: { productId: product.id, status: "APPROVED" },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { user: { select: { name: true } } },
    }),
    prisma.review.aggregate({
      where: { productId: product.id, status: "APPROVED" },
      _avg: { rating: true },
      _count: { _all: true },
    }),
    getRelated(product.id, product.categoryId, 4),
  ]);

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    shortDescription: product.shortDescription,
    description: product.description,
    specs: specsOf(product.specs),
    isFeatured: product.isFeatured,
    image: product.image,
    hasImage: product.imageMimeType != null,
    galleryImageIds: product.images.map((img) => img.id),
    type: product.type,
    category: {
      id: product.category.id,
      name: product.category.name,
      slug: product.category.slug,
    },
    priceFrom: effectivePrices.length ? Math.min(...effectivePrices) : null,
    currency: plans[0]?.currency ?? "IRR",
    availableStock: totalAvailable,
    inStock: totalAvailable > 0,
    lowStock: totalAvailable > 0 && totalAvailable <= LOW_STOCK_THRESHOLD,
    plans,
    rating: {
      average: Math.round((ratingAgg._avg.rating ?? 0) * 10) / 10,
      count: ratingAgg._count._all,
    },
    reviews: reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      userName: r.user.name,
      createdAt: r.createdAt,
    })),
    related,
    createdAt: product.createdAt,
  };
}

async function getRelated(productId: string, categoryId: string, limit: number) {
  const products = await prisma.product.findMany({
    where: { isActive: true, categoryId, id: { not: productId } },
    include: { category: true, plans: { where: { isActive: true } } },
    omit: omitImageData,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  const ids = products.map((p) => p.id);
  const [availMap, ratingMap] = await Promise.all([
    availableCountByProduct(ids),
    ratingByProduct(ids),
  ]);
  return products.map((p) => toSummary(p, availMap.get(p.id) ?? 0, ratingMap.get(p.id)));
}

// Public: raw bytes of a product's primary image (the only query that selects imageData).
export async function getProductImage(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    select: { imageData: true, imageMimeType: true },
  });
  if (!product?.imageData || !product.imageMimeType) {
    throw new AppError(404, "NOT_FOUND", "Image not found");
  }
  return { data: Buffer.from(product.imageData), mimeType: product.imageMimeType };
}

// Public: raw bytes of a single gallery image.
export async function getGalleryImage(imageId: string) {
  const image = await prisma.productImage.findUnique({
    where: { id: imageId },
    select: { imageData: true, mimeType: true },
  });
  if (!image) throw new AppError(404, "NOT_FOUND", "Image not found");
  return { data: Buffer.from(image.imageData), mimeType: image.mimeType };
}

// Authenticated buyer: submit/update a star rating + review (held for admin approval).
export async function submitReview(
  userId: string,
  productId: string,
  rating: number,
  comment?: string,
) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });
  if (!product) throw new AppError(404, "NOT_FOUND", "Product not found");

  await prisma.review.upsert({
    where: { productId_userId: { productId, userId } },
    create: { productId, userId, rating, comment: comment?.trim() || null, status: "PENDING" },
    // Re-submitting resets to PENDING for re-moderation.
    update: { rating, comment: comment?.trim() || null, status: "PENDING" },
  });
  return { ok: true, status: "PENDING" as const };
}
