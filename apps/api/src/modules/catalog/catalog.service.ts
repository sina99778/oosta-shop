import { readVariant } from "../suppliers/variant";
import { sourceStates, type IndicativePrice } from "../suppliers/suppliers.service";
// Public catalog read model: categories, product listings (filter/sort/paginate),
// bestselling, product detail (gallery, specs, sale price, rating, related), and
// customer review submission.

import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/httpError";
import type { ListProductsQuery } from "./catalog.schemas";
import { searchProducts } from "./catalog.search";

const LOW_STOCK_THRESHOLD = 5;
const availabilityOrder = ["OUT_OF_STOCK", "ON_REQUEST", "SUPPLIER_STOCK", "LOCAL_STOCK"] as const;
type Availability = (typeof availabilityOrder)[number];

function bestAvailability(states: Availability[]): Availability {
  return availabilityOrder[Math.max(0, ...states.map((state) => availabilityOrder.indexOf(state)))];
}

function planAvailability(
  localStock: number,
  supplier?: { inStock: boolean; availableStock: number },
): Availability {
  if (localStock > 0) return "LOCAL_STOCK";
  if (supplier?.inStock) return supplier.availableStock > 0 ? "SUPPLIER_STOCK" : "ON_REQUEST";
  return "OUT_OF_STOCK";
}

// Editorial recognition order, independent of customer ratings and paid sales.
const familiarProducts = [
  "chatgpt",
  "gemini",
  "canva",
  "capcut",
  "claude",
  "netflix",
  "spotify",
  "youtube-premium",
  "microsoft-365",
  "microsoft-office",
  "adobe-creative-cloud",
  "figma",
  "github-education",
  "cursor",
  "perplexity",
  "grok",
  "copilot",
  "windows",
  "notion",
  "discord",
  "prime-video",
  "apple-music",
  "linkedin",
  "zoom",
  "grammarly",
  "duolingo",
  "coursera",
  "udemy",
  "jetbrains",
  "nord",
  "express",
  "surfshark",
  "proton",
  "kaspersky",
  "avira",
  "icloud",
  "deepseek",
  "qwen",
  "runway",
  "elevenlabs",
  "suno",
  "freepik",
  "picsart",
  "framer",
  "replit",
  "lovable",
  "n8n",
  "railway",
  "resend",
  "linear",
  "tradingview",
];

function familiarFirst(a: { slug: string }, b: { slug: string }) {
  const rank = (slug: string) => {
    const index = familiarProducts.indexOf(slug);
    return index === -1 ? familiarProducts.length : index;
  };
  return rank(a.slug) - rank(b.slug);
}

async function paidSales(productIds: string[]) {
  const rows = await prisma.orderItem.groupBy({
    by: ["productId"],
    where: {
      productId: { in: productIds },
      order: { paymentStatus: "PAID", supplierQaAttempt: { is: null } },
    },
    _sum: { quantity: true },
  });
  return new Map(rows.map((row) => [row.productId, row._sum.quantity ?? 0]));
}

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
  imageVersion: string;
  type: ProductWithRelations["type"];
  category: { id: string; name: string; slug: string };
  priceFrom: number | null;
  indicativePriceFrom: IndicativePrice | null;
  supplierStockUnconfirmed: boolean;
  pricePlanId: string | null;
  priceDurationDays: number | null;
  originalPriceFrom: number | null;
  discountPercent: number;
  currency: string;
  availableStock: number;
  availability: Availability;
  inStock: boolean;
  quoteRequired: boolean;
  lowStock: boolean;
  isFeatured: boolean;
  ratingAverage: number;
  ratingCount: number;
  createdAt: Date;
  updatedAt: Date;
};

// Compare hundredths of a rial in integer arithmetic (prices are Decimal(12, 2)).
function comparablePrice(amount: number, currency: string) {
  return Math.round(amount * 100) * (currency === "IRT" ? 10 : 1);
}

function toSummary(
  product: ProductWithRelations,
  stock: Map<string, number> | undefined,
  rating: Rating | undefined,
  supplierStates: Awaited<ReturnType<typeof sourceStates>>,
): ProductSummary {
  let cheapest: (ReturnType<typeof priceView> & { plan: PlanRow; amount: number }) | null = null;
  let availableStock = 0;
  for (const plan of product.plans) {
    const count = stock?.get(plan.id) ?? 0;
    if (plan.source === "SUPPLIER" || count === 0) continue;
    availableStock += count;
    const view = priceView(plan);
    const amount = comparablePrice(view.effectivePrice, plan.currency);
    if (
      !cheapest ||
      amount < cheapest.amount ||
      (amount === cheapest.amount && plan.id < cheapest.plan.id)
    )
      cheapest = { ...view, plan, amount };
  }
  const availability = bestAvailability([
    planAvailability(availableStock),
    ...product.plans.map((p) => planAvailability(0, supplierStates.get(p.id))),
  ]);
  let indicativePriceFrom: IndicativePrice | null = null;
  if (availability === "SUPPLIER_STOCK") {
    for (const plan of product.plans) {
      const estimate = supplierStates.get(plan.id)?.indicativePrice;
      if (
        estimate &&
        (!indicativePriceFrom ||
          estimate.amount < indicativePriceFrom.amount ||
          (estimate.amount === indicativePriceFrom.amount &&
            estimate.expiresAt > indicativePriceFrom.expiresAt))
      )
        indicativePriceFrom = estimate;
    }
  }
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    image: product.image,
    hasImage: product.imageMimeType != null,
    imageVersion: String(product.updatedAt.getTime()),
    type: product.type,
    category: {
      id: product.category.id,
      name: product.category.name,
      slug: product.category.slug,
    },
    priceFrom: cheapest ? cheapest.effectivePrice : null,
    indicativePriceFrom,
    supplierStockUnconfirmed:
      availability === "OUT_OF_STOCK" &&
      product.plans.some((plan) => supplierStates.get(plan.id)?.stockUnconfirmed),
    pricePlanId: cheapest?.plan.id ?? null,
    priceDurationDays: cheapest?.plan.durationDays ?? null,
    originalPriceFrom: cheapest?.onSale ? cheapest.price : null,
    discountPercent: cheapest?.discountPercent ?? 0,
    currency: cheapest?.plan.currency ?? "IRR",
    availableStock,
    availability,
    inStock: availability !== "OUT_OF_STOCK",
    lowStock: availableStock > 0 && availableStock <= LOW_STOCK_THRESHOLD,
    quoteRequired: availability === "SUPPLIER_STOCK" || availability === "ON_REQUEST",
    isFeatured: product.isFeatured,
    ratingAverage: rating ? Math.round(rating.average * 10) / 10 : 0,
    ratingCount: rating?.count ?? 0,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

async function availableCountByProduct(productIds: string[]) {
  const counts = new Map<string, Map<string, number>>();
  if (productIds.length === 0) return counts;
  const rows = await prisma.inventoryItem.groupBy({
    by: ["productId", "planId"],
    where: {
      status: "AVAILABLE",
      productId: { in: productIds },
      plan: { isActive: true, source: { not: "SUPPLIER" } },
    },
    _count: { _all: true },
  });
  for (const row of rows) {
    if (!row.planId) continue;
    const plans = counts.get(row.productId) ?? new Map<string, number>();
    plans.set(row.planId, row._count._all);
    counts.set(row.productId, plans);
  }
  return counts;
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
  const categories = await prisma.category.findMany({
    where: { slug: { not: "internal-supplier-qa" } },
    orderBy: { name: "asc" },
  });
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
  if (query.featured) where.isFeatured = true;

  // For these orders, stock and ratings are display data rather than sort inputs.
  // Rank lightweight candidates and load the richer data only for the visible page.
  const orderBy = [
    { sortOrder: "desc" },
    { createdAt: "desc" },
    { id: "asc" },
  ] satisfies Prisma.ProductOrderByWithRelationInput[];
  const start = (query.page - 1) * query.pageSize;
  const searchMatches = query.q ? await searchProducts(query.q, query) : null;
  const rankedSort = ["recommended", "newest", "popular", "bestselling"].includes(query.sort);
  const ranked = rankedSort
    ? (searchMatches ??
      (await prisma.product.findMany({
        where,
        orderBy,
        select: { id: true, slug: true, createdAt: true, sortOrder: true },
      })))
    : null;
  if (ranked) {
    if (query.sort === "popular") {
      const ratings = await ratingByProduct(ranked.map((item) => item.id));
      ranked.sort((a, b) => {
        const left = ratings.get(a.id);
        const right = ratings.get(b.id);
        return (
          Number((right?.count ?? 0) > 0) - Number((left?.count ?? 0) > 0) ||
          Math.round((right?.average ?? 0) * 10) - Math.round((left?.average ?? 0) * 10) ||
          (right?.count ?? 0) - (left?.count ?? 0) ||
          familiarFirst(a, b)
        );
      });
    } else if (query.sort === "bestselling") {
      const sales = await paidSales(ranked.map((item) => item.id));
      ranked.sort((a, b) => (sales.get(b.id) ?? 0) - (sales.get(a.id) ?? 0) || familiarFirst(a, b));
    } else {
      ranked.sort(
        (a, b) =>
          Math.max(0, b.sortOrder) - Math.max(0, a.sortOrder) ||
          (query.sort === "recommended" ? familiarFirst(a, b) : 0) ||
          b.createdAt.getTime() - a.createdAt.getTime() ||
          a.id.localeCompare(b.id),
      );
    }
  }
  const pageIds = ranked?.slice(start, start + query.pageSize).map((item) => item.id);
  const matchingIds = pageIds ?? searchMatches?.map((item) => item.id);
  const products = await prisma.product.findMany({
    where: matchingIds ? { ...where, id: { in: matchingIds } } : where,
    include: { category: true, plans: { where: { isActive: true } } },
    omit: omitImageData,
    orderBy,
  });

  const ids = products.map((p) => p.id);
  const [sourceStatus, availMap, ratingMap] = await Promise.all([
    sourceStates(
      products.flatMap((p) => p.plans),
      true,
    ),
    availableCountByProduct(ids),
    ratingByProduct(ids),
  ]);
  const summaries = products.map((product) =>
    toSummary(product, availMap.get(product.id), ratingMap.get(product.id), sourceStatus),
  );

  if (query.sort === "price_asc" || query.sort === "price_desc") {
    const direction = query.sort === "price_asc" ? 1 : -1;
    const displayedPrice = (product: ProductSummary) => {
      if (product.priceFrom !== null) return comparablePrice(product.priceFrom, product.currency);
      const estimate = product.indicativePriceFrom;
      return estimate ? comparablePrice(estimate.amount, estimate.currency) : null;
    };
    summaries.sort((a, b) => {
      const left = displayedPrice(a);
      const right = displayedPrice(b);
      if (left === null || right === null)
        return Number(left === null) - Number(right === null) || a.id.localeCompare(b.id);
      return direction * (left - right) || a.id.localeCompare(b.id);
    });
  } else if (query.sort === "available") {
    summaries.sort(
      (a, b) =>
        availabilityOrder.indexOf(b.availability) - availabilityOrder.indexOf(a.availability) ||
        familiarFirst(a, b),
    );
  }

  const total = ranked?.length ?? summaries.length;
  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const byId = pageIds ? new Map(summaries.map((item) => [item.id, item])) : null;
  const items =
    pageIds && byId
      ? pageIds.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []))
      : summaries.slice(start, start + query.pageSize);

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
  const sourceStatus = await sourceStates(
    products.flatMap((p) => p.plans),
    true,
  );

  const [availMap, ratingMap, soldRows] = await Promise.all([
    availableCountByProduct(ids),
    ratingByProduct(ids),
    paidSales(ids),
  ]);
  const soldMap = soldRows;

  return products
    .map((product) => ({
      summary: toSummary(
        product,
        availMap.get(product.id),
        ratingMap.get(product.id),
        sourceStatus,
      ),
      sold: soldMap.get(product.id) ?? 0,
    }))
    .sort(
      (a, b) =>
        b.sold - a.sold ||
        familiarFirst(a.summary, b.summary) ||
        a.summary.id.localeCompare(b.summary.id),
    )
    .slice(0, limit)
    .map((ranked) => ({ ...ranked.summary, soldCount: ranked.sold }));
}

export async function getPublicCartPlans(planIds: string[]) {
  const plans = await prisma.productPlan.findMany({
    where: { id: { in: planIds }, isActive: true, product: { isActive: true } },
    include: { product: { select: { name: true, slug: true } } },
  });
  const [stock, suppliers] = await Promise.all([
    availableCountByProduct([...new Set(plans.map((plan) => plan.productId))]),
    sourceStates(plans, true),
  ]);
  return plans.map((plan) => {
    const supplier = suppliers.get(plan.id);
    const localStock = plan.source === "SUPPLIER" ? 0 : (stock.get(plan.productId)?.get(plan.id) ?? 0);
    return {
      planId: plan.id,
      product: plan.product.name,
      slug: plan.product.slug,
      label: plan.label,
      availability: planAvailability(localStock, supplier),
      currency: plan.currency,
      amount: localStock > 0 ? priceView(plan).effectivePrice : null,
      indicativePrice: supplier?.indicativePrice ?? null,
    };
  });
}

export async function getProductBySlug(slug: string) {
  const product = await prisma.product.findFirst({
    where: { slug, isActive: true },
    include: {
      category: true,
      plans: { where: { isActive: true }, orderBy: [{ price: "asc" }, { id: "asc" }] },
      images: { orderBy: { sortOrder: "asc" }, select: { id: true } },
    },
    omit: omitImageData,
  });
  if (!product) {
    throw new AppError(404, "NOT_FOUND", "Product not found");
  }

  const [counts, external] = await Promise.all([
    availableCountByProduct([product.id]),
    sourceStates(product.plans, true),
  ]);
  const planAvail = counts.get(product.id);

  const plans = product.plans.map((plan) => {
    const source = external.get(plan.id);
    const localStock = plan.source === "SUPPLIER" ? 0 : (planAvail?.get(plan.id) ?? 0);
    const availableStock = source?.availableStock ?? localStock;
    const availability = planAvailability(localStock, source);
    const view = priceView(plan);
    return {
      id: plan.id,
      label: plan.label,
      durationDays: plan.durationDays,
      sortOrder: plan.sortOrder,
      variant: readVariant(plan.variant),
      source: plan.source,
      quoteRequired: plan.source === "SUPPLIER",
      indicativePrice: source?.indicativePrice ?? null,
      supplierStockUnconfirmed: source?.stockUnconfirmed ?? false,
      price: plan.source === "SUPPLIER" ? 0 : view.price,
      salePrice: plan.source === "SUPPLIER" ? null : view.salePrice,
      effectivePrice: plan.source === "SUPPLIER" ? 0 : view.effectivePrice,
      onSale: plan.source === "SUPPLIER" ? false : view.onSale,
      discountPercent: plan.source === "SUPPLIER" ? 0 : view.discountPercent,
      currency: plan.currency,
      availableStock,
      availability,
      inStock: availability !== "OUT_OF_STOCK",
    };
  });
  if (product.slug === "chatgpt") {
    const preferred = plans.find(
      (plan) =>
        plan.durationDays === 30 &&
        plan.variant?.plan === "ChatGPT Plus" &&
        plan.variant.access === "PERSONAL" &&
        plan.variant.fulfillment === "ACCOUNT" &&
        plan.variant.warranty.kind === "WARRANTED" &&
        plan.variant.warranty.days === 30 &&
        plan.variant.warranty.coverage === "FULL",
    );
    if (preferred)
      plans.sort((a, b) => Number(b.id === preferred.id) - Number(a.id === preferred.id));
  }

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

  const rating = { average: ratingAgg._avg.rating ?? 0, count: ratingAgg._count._all };
  const summary = toSummary(product, planAvail, rating, external);
  return {
    ...summary,
    shortDescription: product.shortDescription,
    description: product.description,
    metaTitle: product.metaTitle,
    metaDescription: product.metaDescription,
    specs: specsOf(product.specs),
    galleryImageIds: product.images.map((img) => img.id),
    plans,
    rating: {
      average: summary.ratingAverage,
      count: summary.ratingCount,
    },
    reviews: reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      userName: r.user.name,
      createdAt: r.createdAt,
    })),
    related,
  };
}

async function getRelated(productId: string, categoryId: string, limit: number) {
  const products = await prisma.product.findMany({
    where: { isActive: true, categoryId, id: { not: productId } },
    include: { category: true, plans: { where: { isActive: true } } },
    omit: omitImageData,
    orderBy: [{ sortOrder: "desc" }, { createdAt: "desc" }],
  });
  const selected = products.sort(familiarFirst).slice(0, limit);
  const ids = selected.map((p) => p.id);
  const [sourceStatus, availMap, ratingMap] = await Promise.all([
    sourceStates(
      selected.flatMap((p) => p.plans),
      true,
    ),
    availableCountByProduct(ids),
    ratingByProduct(ids),
  ]);
  return selected.map((p) => toSummary(p, availMap.get(p.id), ratingMap.get(p.id), sourceStatus));
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
    where: { id: productId, isActive: true },
    select: { id: true },
  });
  if (!product) throw new AppError(404, "NOT_FOUND", "Product not found");

  const purchase = await prisma.orderItem.findFirst({
    where: { productId, order: { userId, paymentStatus: "PAID" } },
    select: { id: true },
  });
  if (!purchase) {
    throw new AppError(403, "REVIEW_REQUIRES_PURCHASE", "Only buyers can review this product");
  }

  await prisma.review.upsert({
    where: { productId_userId: { productId, userId } },
    create: { productId, userId, rating, comment: comment?.trim() || null, status: "PENDING" },
    // Re-submitting resets to PENDING for re-moderation.
    update: { rating, comment: comment?.trim() || null, status: "PENDING" },
  });
  return { ok: true, status: "PENDING" as const };
}
