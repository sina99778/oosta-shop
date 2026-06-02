// HTTP handlers for admin endpoints. Auth + ADMIN role are enforced by the router.

import type { Request, Response } from "express";
import * as admin from "./admin.service";
import type {
  BulkInventoryInput,
  CreateCategoryInput,
  CreatePlanInput,
  CreateProductInput,
  InventoryQuery,
  OrdersQuery,
  ReceiptsQuery,
  ReviewReceiptInput,
  ReviewsQuery,
  UpdateCategoryInput,
  UpdatePlanInput,
  UpdateProductInput,
} from "./admin.schemas";

// Categories
export async function listCategories(_req: Request, res: Response): Promise<void> {
  res.json({ categories: await admin.listCategories() });
}
export async function createCategory(req: Request, res: Response): Promise<void> {
  res.status(201).json({ category: await admin.createCategory(req.body as CreateCategoryInput) });
}
export async function updateCategory(req: Request, res: Response): Promise<void> {
  res.json({
    category: await admin.updateCategory(String(req.params.id), req.body as UpdateCategoryInput),
  });
}
export async function deleteCategory(req: Request, res: Response): Promise<void> {
  res.json(await admin.deleteCategory(String(req.params.id)));
}

// Products
export async function listProducts(_req: Request, res: Response): Promise<void> {
  res.json({ products: await admin.listProducts() });
}
export async function createProduct(req: Request, res: Response): Promise<void> {
  res.status(201).json({ product: await admin.createProduct(req.body as CreateProductInput) });
}
export async function getProduct(req: Request, res: Response): Promise<void> {
  res.json({ product: await admin.getProduct(String(req.params.id)) });
}
export async function updateProduct(req: Request, res: Response): Promise<void> {
  res.json({
    product: await admin.updateProduct(String(req.params.id), req.body as UpdateProductInput),
  });
}
export async function deleteProduct(req: Request, res: Response): Promise<void> {
  res.json(await admin.deleteProduct(String(req.params.id)));
}
export async function setProductImage(req: Request, res: Response): Promise<void> {
  const file = req.file ? { buffer: req.file.buffer, mimetype: req.file.mimetype } : undefined;
  res.json(await admin.setProductImage(String(req.params.id), file));
}
export async function removeProductImage(req: Request, res: Response): Promise<void> {
  res.json(await admin.removeProductImage(String(req.params.id)));
}
export async function addGalleryImage(req: Request, res: Response): Promise<void> {
  const file = req.file ? { buffer: req.file.buffer, mimetype: req.file.mimetype } : undefined;
  res.status(201).json(await admin.addGalleryImage(String(req.params.id), file));
}
export async function removeGalleryImage(req: Request, res: Response): Promise<void> {
  res.json(await admin.removeGalleryImage(String(req.params.imageId)));
}

// Reviews moderation
export async function listReviews(_req: Request, res: Response): Promise<void> {
  res.json(await admin.listReviews(res.locals.query as ReviewsQuery));
}
export async function approveReview(req: Request, res: Response): Promise<void> {
  res.json({ review: await admin.setReviewStatus(String(req.params.id), "APPROVED") });
}
export async function rejectReview(req: Request, res: Response): Promise<void> {
  res.json({ review: await admin.setReviewStatus(String(req.params.id), "REJECTED") });
}
export async function deleteReview(req: Request, res: Response): Promise<void> {
  res.json(await admin.deleteReview(String(req.params.id)));
}

// Plans
export async function createPlan(req: Request, res: Response): Promise<void> {
  res.status(201).json({
    plan: await admin.createPlan(String(req.params.productId), req.body as CreatePlanInput),
  });
}
export async function updatePlan(req: Request, res: Response): Promise<void> {
  res.json({ plan: await admin.updatePlan(String(req.params.id), req.body as UpdatePlanInput) });
}
export async function deletePlan(req: Request, res: Response): Promise<void> {
  res.json(await admin.deletePlan(String(req.params.id)));
}

// Inventory
export async function bulkInventory(req: Request, res: Response): Promise<void> {
  res.status(201).json(await admin.bulkImportInventory(req.body as BulkInventoryInput));
}
export async function listInventory(_req: Request, res: Response): Promise<void> {
  res.json(await admin.listInventory(res.locals.query as InventoryQuery));
}

// Orders overview
export async function listOrders(_req: Request, res: Response): Promise<void> {
  res.json(await admin.listOrders(res.locals.query as OrdersQuery));
}
export async function getOrder(req: Request, res: Response): Promise<void> {
  res.json({ order: await admin.getOrder(String(req.params.id)) });
}

// Card-to-card receipts
export async function listReceipts(_req: Request, res: Response): Promise<void> {
  res.json(await admin.listReceipts(res.locals.query as ReceiptsQuery));
}
export async function getReceiptImage(req: Request, res: Response): Promise<void> {
  const { data, mimeType } = await admin.getReceiptImage(String(req.params.id));
  res.setHeader("Content-Type", mimeType);
  res.setHeader("Cache-Control", "private, no-store");
  res.send(data);
}
export async function approveReceipt(req: Request, res: Response): Promise<void> {
  res.json({
    receipt: await admin.approveReceipt(String(req.params.id), req.body as ReviewReceiptInput),
  });
}
export async function rejectReceipt(req: Request, res: Response): Promise<void> {
  res.json({
    receipt: await admin.rejectReceipt(String(req.params.id), req.body as ReviewReceiptInput),
  });
}
