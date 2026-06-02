// Admin business logic: catalog CRUD (with safe delete guards), type-validated bulk
// inventory import, inventory listing, and an orders overview.

import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/httpError";
import { deliverOrder } from "../orders/orders.service";
import type {
  BulkInventoryInput,
  CreateCategoryInput,
  CreatePlanInput,
  CreateProductInput,
  InventoryQuery,
  OrdersQuery,
  ReceiptsQuery,
  ReviewReceiptInput,
  UpdateCategoryInput,
  UpdatePlanInput,
  UpdateProductInput,
} from "./admin.schemas";

async function ensureCategory(id: string): Promise<void> {
  const found = await prisma.category.findUnique({ where: { id }, select: { id: true } });
  if (!found) throw new AppError(404, "NOT_FOUND", "Category not found");
}
async function ensureCategoryRef(id: string): Promise<void> {
  const found = await prisma.category.findUnique({ where: { id }, select: { id: true } });
  if (!found)
    throw new AppError(400, "VALIDATION_ERROR", "categoryId does not reference a category");
}
async function ensureProduct(id: string): Promise<void> {
  const found = await prisma.product.findUnique({ where: { id }, select: { id: true } });
  if (!found) throw new AppError(404, "NOT_FOUND", "Product not found");
}
async function ensurePlan(id: string): Promise<void> {
  const found = await prisma.productPlan.findUnique({ where: { id }, select: { id: true } });
  if (!found) throw new AppError(404, "NOT_FOUND", "Plan not found");
}

// ---------------- Categories ----------------
export async function listCategories() {
  const cats = await prisma.category.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { products: true } } },
  });
  return cats.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    productCount: c._count.products,
    createdAt: c.createdAt,
  }));
}
export function createCategory(input: CreateCategoryInput) {
  return prisma.category.create({ data: input });
}
export async function updateCategory(id: string, input: UpdateCategoryInput) {
  await ensureCategory(id);
  return prisma.category.update({ where: { id }, data: input });
}
export async function deleteCategory(id: string) {
  await ensureCategory(id);
  const products = await prisma.product.count({ where: { categoryId: id } });
  if (products > 0) {
    throw new AppError(409, "CONFLICT", "Category has products; move or delete them first");
  }
  await prisma.category.delete({ where: { id } });
  return { id };
}

// ---------------- Products ----------------
export async function listProducts() {
  const products = await prisma.product.findMany({
    orderBy: { createdAt: "desc" },
    include: { category: true, _count: { select: { plans: true, inventory: true } } },
    omit: { imageData: true },
  });
  return products.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    type: p.type,
    isActive: p.isActive,
    image: p.image,
    category: { id: p.category.id, name: p.category.name, slug: p.category.slug },
    planCount: p._count.plans,
    inventoryCount: p._count.inventory,
    createdAt: p.createdAt,
  }));
}
export async function createProduct(input: CreateProductInput) {
  await ensureCategoryRef(input.categoryId);
  return prisma.product.create({
    data: {
      name: input.name,
      slug: input.slug,
      description: input.description,
      image: input.image ?? null,
      type: input.type,
      categoryId: input.categoryId,
      isActive: input.isActive ?? true,
    },
  });
}
export async function getProduct(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: { category: true, plans: { orderBy: { price: "asc" } } },
    omit: { imageData: true },
  });
  if (!product) throw new AppError(404, "NOT_FOUND", "Product not found");
  const avail = await prisma.inventoryItem.groupBy({
    by: ["planId"],
    where: { productId: id, status: "AVAILABLE" },
    _count: { _all: true },
  });
  const availMap = new Map(avail.map((a) => [a.planId, a._count._all]));
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    image: product.image,
    hasImage: product.imageMimeType != null,
    type: product.type,
    isActive: product.isActive,
    category: { id: product.category.id, name: product.category.name, slug: product.category.slug },
    plans: product.plans.map((pl) => ({
      id: pl.id,
      label: pl.label,
      durationDays: pl.durationDays,
      price: Number(pl.price),
      currency: pl.currency,
      isActive: pl.isActive,
      availableStock: availMap.get(pl.id) ?? 0,
    })),
    createdAt: product.createdAt,
  };
}
export async function updateProduct(id: string, input: UpdateProductInput) {
  await ensureProduct(id);
  if (input.categoryId) await ensureCategoryRef(input.categoryId);
  const data: Prisma.ProductUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.slug !== undefined) data.slug = input.slug;
  if (input.description !== undefined) data.description = input.description;
  if (input.image !== undefined) data.image = input.image;
  if (input.type !== undefined) data.type = input.type;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.categoryId !== undefined) data.category = { connect: { id: input.categoryId } };
  return prisma.product.update({ where: { id }, data });
}
export async function deleteProduct(id: string) {
  await ensureProduct(id);
  const orderItems = await prisma.orderItem.count({ where: { productId: id } });
  if (orderItems > 0) {
    throw new AppError(409, "CONFLICT", "Product has orders; deactivate it instead of deleting");
  }
  await prisma.product.delete({ where: { id } }); // cascades plans + inventory
  return { id };
}

export async function setProductImage(
  id: string,
  file: { buffer: Buffer; mimetype: string } | undefined,
) {
  if (!file) throw new AppError(400, "NO_FILE", "An image file is required");
  if (!file.mimetype.startsWith("image/")) {
    throw new AppError(400, "BAD_FILE_TYPE", "Product image must be an image (JPG/PNG/WebP)");
  }
  await ensureProduct(id);
  await prisma.product.update({
    where: { id },
    data: { imageData: new Uint8Array(file.buffer), imageMimeType: file.mimetype },
  });
  return { ok: true, hasImage: true };
}

export async function removeProductImage(id: string) {
  await ensureProduct(id);
  await prisma.product.update({
    where: { id },
    data: { imageData: null, imageMimeType: null },
  });
  return { ok: true, hasImage: false };
}

// ---------------- Plans ----------------
export async function createPlan(productId: string, input: CreatePlanInput) {
  await ensureProduct(productId);
  return prisma.productPlan.create({
    data: {
      productId,
      label: input.label,
      durationDays: input.durationDays ?? null,
      price: input.price,
      currency: input.currency ?? "IRR",
      isActive: input.isActive ?? true,
    },
  });
}
export async function updatePlan(id: string, input: UpdatePlanInput) {
  await ensurePlan(id);
  const data: Prisma.ProductPlanUpdateInput = {};
  if (input.label !== undefined) data.label = input.label;
  if (input.durationDays !== undefined) data.durationDays = input.durationDays;
  if (input.price !== undefined) data.price = input.price;
  if (input.currency !== undefined) data.currency = input.currency;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  return prisma.productPlan.update({ where: { id }, data });
}
export async function deletePlan(id: string) {
  await ensurePlan(id);
  const [orderItems, inventory] = await Promise.all([
    prisma.orderItem.count({ where: { planId: id } }),
    prisma.inventoryItem.count({ where: { planId: id } }),
  ]);
  if (orderItems > 0 || inventory > 0) {
    throw new AppError(
      409,
      "CONFLICT",
      "Plan has inventory or orders; deactivate it instead of deleting",
    );
  }
  await prisma.productPlan.delete({ where: { id } });
  return { id };
}

// ---------------- Inventory ----------------
export async function bulkImportInventory(input: BulkInventoryInput) {
  const plan = await prisma.productPlan.findUnique({
    where: { id: input.planId },
    include: { product: true },
  });
  if (!plan) throw new AppError(404, "NOT_FOUND", "Plan not found");
  const type = plan.product.type;

  const data: Prisma.InventoryItemCreateManyInput[] = input.items.map((item, idx) => {
    const base = { productId: plan.productId, planId: plan.id, type };
    if (type === "ACCOUNT") {
      if (!item.accountEmail || !item.accountPassword) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          `Item ${idx + 1}: accountEmail and accountPassword are required for ACCOUNT products`,
        );
      }
      return { ...base, accountEmail: item.accountEmail, accountPassword: item.accountPassword };
    }
    if (type === "LICENSE") {
      if (!item.licenseKey) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          `Item ${idx + 1}: licenseKey is required for LICENSE products`,
        );
      }
      return { ...base, licenseKey: item.licenseKey };
    }
    if (!item.giftCardCode) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        `Item ${idx + 1}: giftCardCode is required for GIFTCARD products`,
      );
    }
    return { ...base, giftCardCode: item.giftCardCode };
  });

  const result = await prisma.inventoryItem.createMany({ data });
  return { created: result.count };
}

export async function listInventory(query: InventoryQuery) {
  const where: Prisma.InventoryItemWhereInput = {};
  if (query.productId) where.productId = query.productId;
  if (query.planId) where.planId = query.planId;
  if (query.status) where.status = query.status;

  const [total, items] = await Promise.all([
    prisma.inventoryItem.count({ where }),
    prisma.inventoryItem.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        product: { select: { id: true, name: true } },
        plan: { select: { id: true, label: true } },
      },
    }),
  ]);

  return {
    items: items.map((it) => ({
      id: it.id,
      type: it.type,
      status: it.status,
      product: it.product,
      plan: it.plan,
      accountEmail: it.accountEmail,
      accountPassword: it.accountPassword,
      licenseKey: it.licenseKey,
      giftCardCode: it.giftCardCode,
      soldAt: it.soldAt,
      createdAt: it.createdAt,
    })),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
  };
}

// ---------------- Orders overview ----------------
export async function listOrders(query: OrdersQuery) {
  const where: Prisma.OrderWhereInput = {};
  if (query.status) where.paymentStatus = query.status;

  const [total, orders] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        _count: { select: { items: true } },
      },
    }),
  ]);

  return {
    items: orders.map((o) => ({
      id: o.id,
      totalAmount: Number(o.totalAmount),
      currency: o.currency,
      paymentStatus: o.paymentStatus,
      paymentProvider: o.paymentProvider,
      user: o.user,
      itemCount: o._count.items,
      createdAt: o.createdAt,
      paidAt: o.paidAt,
    })),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
  };
}

export async function getOrder(id: string) {
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true } },
      items: { include: { product: true, plan: true, fulfilledItems: true } },
    },
  });
  if (!order) throw new AppError(404, "NOT_FOUND", "Order not found");
  return {
    id: order.id,
    totalAmount: Number(order.totalAmount),
    currency: order.currency,
    paymentStatus: order.paymentStatus,
    paymentProvider: order.paymentProvider,
    paymentAuthority: order.paymentAuthority,
    paymentRefId: order.paymentRefId,
    user: order.user,
    createdAt: order.createdAt,
    paidAt: order.paidAt,
    items: order.items.map((it) => ({
      id: it.id,
      product: { id: it.product.id, name: it.product.name },
      plan: { id: it.plan.id, label: it.plan.label },
      quantity: it.quantity,
      unitPrice: Number(it.unitPrice),
      lineTotal: Number(it.lineTotal),
      fulfilledCount: it.fulfilledItems.length,
    })),
  };
}

// ---------------- Card-to-card receipts ----------------
// Receipts are never deleted; this is the review queue + permanent history.

const receiptUserSelect = { id: true, name: true, email: true, phone: true } as const;

type ReceiptWithOrder = Prisma.ReceiptGetPayload<{
  include: {
    order: {
      include: { user: { select: { id: true; name: true; email: true; phone: true } } };
    };
  };
}>;

function serializeReceipt(r: ReceiptWithOrder) {
  return {
    id: r.id,
    status: r.status,
    reference: r.reference,
    reviewerNote: r.reviewerNote,
    mimeType: r.mimeType,
    createdAt: r.createdAt,
    reviewedAt: r.reviewedAt,
    order: {
      id: r.order.id,
      totalAmount: Number(r.order.totalAmount),
      currency: r.order.currency,
      paymentStatus: r.order.paymentStatus,
      paymentProvider: r.order.paymentProvider,
      createdAt: r.order.createdAt,
      user: {
        id: r.order.user.id,
        name: r.order.user.name,
        email: r.order.user.email,
        phone: r.order.user.phone,
      },
    },
  };
}

export async function listReceipts(query: ReceiptsQuery) {
  const where: Prisma.ReceiptWhereInput = {};
  if (query.status) where.status = query.status;

  const [total, pending, receipts] = await Promise.all([
    prisma.receipt.count({ where }),
    prisma.receipt.count({ where: { status: "PENDING" } }),
    prisma.receipt.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { order: { include: { user: { select: receiptUserSelect } } } },
    }),
  ]);

  return {
    items: receipts.map(serializeReceipt),
    pendingCount: pending,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
  };
}

// Raw image bytes for streaming back to the admin (web preview / bot photo).
export async function getReceiptImage(id: string) {
  const receipt = await prisma.receipt.findUnique({
    where: { id },
    select: { imageData: true, mimeType: true },
  });
  if (!receipt) throw new AppError(404, "NOT_FOUND", "Receipt not found");
  return { data: Buffer.from(receipt.imageData), mimeType: receipt.mimeType };
}

async function loadReceiptForReview(id: string) {
  const receipt = await prisma.receipt.findUnique({
    where: { id },
    include: { order: { include: { user: { select: receiptUserSelect } } } },
  });
  if (!receipt) throw new AppError(404, "NOT_FOUND", "Receipt not found");
  return receipt;
}

// Approve: deliver the order (atomic inventory claim) and mark the receipt APPROVED.
// If delivery fails (e.g. out of stock) the receipt stays PENDING so it can be retried.
export async function approveReceipt(id: string, input: ReviewReceiptInput) {
  const receipt = await loadReceiptForReview(id);
  if (receipt.order.paymentProvider !== "CARD_TO_CARD") {
    throw new AppError(400, "NOT_CARD_TO_CARD", "This receipt is not for a card-to-card order");
  }
  await deliverOrder(receipt.orderId, `card:${receipt.id}`);
  await prisma.receipt.update({
    where: { id },
    data: { status: "APPROVED", reviewedAt: new Date(), reviewerNote: input.note ?? null },
  });
  return serializeReceipt(await loadReceiptForReview(id));
}

// Reject: keep the receipt (status REJECTED) and move the order back out of "paid".
// If the order was already PAID (undoing an accidental approval) it becomes REFUNDED.
export async function rejectReceipt(id: string, input: ReviewReceiptInput) {
  const receipt = await loadReceiptForReview(id);
  await prisma.receipt.update({
    where: { id },
    data: { status: "REJECTED", reviewedAt: new Date(), reviewerNote: input.note ?? null },
  });
  const nextStatus = receipt.order.paymentStatus === "PAID" ? "REFUNDED" : "REJECTED";
  await prisma.order.update({
    where: { id: receipt.orderId },
    data: { paymentStatus: nextStatus },
  });
  return serializeReceipt(await loadReceiptForReview(id));
}
