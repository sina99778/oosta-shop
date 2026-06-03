// Admin routes — all require a valid JWT AND the ADMIN role.

import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { uploadProductImage } from "../../middleware/upload";
import * as schemas from "./admin.schemas";
import * as ctrl from "./admin.controller";

export const adminRouter = Router();

adminRouter.use(authenticate, requireRole("ADMIN"));

// Dashboard
adminRouter.get("/stats", ctrl.stats);

// API keys (programmatic admin access)
adminRouter.get("/api-keys", ctrl.listApiKeys);
adminRouter.post("/api-keys", validate({ body: schemas.createApiKeySchema }), ctrl.createApiKey);
adminRouter.delete("/api-keys/:id", validate({ params: schemas.idParamSchema }), ctrl.deleteApiKey);

// AI SEO assistant
adminRouter.get("/ai/status", ctrl.aiStatus);
adminRouter.post("/seo/generate", validate({ body: schemas.seoGenerateSchema }), ctrl.generateSeo);

// Categories
adminRouter.get("/categories", ctrl.listCategories);
adminRouter.post(
  "/categories",
  validate({ body: schemas.createCategorySchema }),
  ctrl.createCategory,
);
adminRouter.patch(
  "/categories/:id",
  validate({ params: schemas.idParamSchema, body: schemas.updateCategorySchema }),
  ctrl.updateCategory,
);
adminRouter.delete(
  "/categories/:id",
  validate({ params: schemas.idParamSchema }),
  ctrl.deleteCategory,
);

// Products
adminRouter.get("/products", ctrl.listProducts);
adminRouter.post("/products", validate({ body: schemas.createProductSchema }), ctrl.createProduct);
adminRouter.get("/products/:id", validate({ params: schemas.idParamSchema }), ctrl.getProduct);
adminRouter.patch(
  "/products/:id",
  validate({ params: schemas.idParamSchema, body: schemas.updateProductSchema }),
  ctrl.updateProduct,
);
adminRouter.delete(
  "/products/:id",
  validate({ params: schemas.idParamSchema }),
  ctrl.deleteProduct,
);
// Primary product image (multipart field "image"): upload/replace + remove
adminRouter.post(
  "/products/:id/image",
  validate({ params: schemas.idParamSchema }),
  uploadProductImage,
  ctrl.setProductImage,
);
adminRouter.delete(
  "/products/:id/image",
  validate({ params: schemas.idParamSchema }),
  ctrl.removeProductImage,
);
// Gallery images (multipart field "image"): add one + remove by image id
adminRouter.post(
  "/products/:id/images",
  validate({ params: schemas.idParamSchema }),
  uploadProductImage,
  ctrl.addGalleryImage,
);
adminRouter.delete(
  "/product-images/:imageId",
  validate({ params: schemas.imageIdParamSchema }),
  ctrl.removeGalleryImage,
);

// Plans
adminRouter.post(
  "/products/:productId/plans",
  validate({ params: schemas.productIdParamSchema, body: schemas.createPlanSchema }),
  ctrl.createPlan,
);
adminRouter.patch(
  "/plans/:id",
  validate({ params: schemas.idParamSchema, body: schemas.updatePlanSchema }),
  ctrl.updatePlan,
);
adminRouter.delete("/plans/:id", validate({ params: schemas.idParamSchema }), ctrl.deletePlan);

// Inventory
adminRouter.post(
  "/inventory/bulk",
  validate({ body: schemas.bulkInventorySchema }),
  ctrl.bulkInventory,
);
adminRouter.get(
  "/inventory",
  validate({ query: schemas.inventoryQuerySchema }),
  ctrl.listInventory,
);

// Orders overview
adminRouter.get("/orders", validate({ query: schemas.ordersQuerySchema }), ctrl.listOrders);
adminRouter.get("/orders/:id", validate({ params: schemas.idParamSchema }), ctrl.getOrder);

// Card-to-card receipts (review queue + permanent history)
adminRouter.get("/receipts", validate({ query: schemas.receiptsQuerySchema }), ctrl.listReceipts);
adminRouter.get(
  "/receipts/:id/image",
  validate({ params: schemas.idParamSchema }),
  ctrl.getReceiptImage,
);
adminRouter.post(
  "/receipts/:id/approve",
  validate({ params: schemas.idParamSchema, body: schemas.reviewReceiptSchema }),
  ctrl.approveReceipt,
);
adminRouter.post(
  "/receipts/:id/reject",
  validate({ params: schemas.idParamSchema, body: schemas.reviewReceiptSchema }),
  ctrl.rejectReceipt,
);

// Customer reviews moderation
adminRouter.get("/reviews", validate({ query: schemas.reviewsQuerySchema }), ctrl.listReviews);
adminRouter.post(
  "/reviews/:id/approve",
  validate({ params: schemas.idParamSchema }),
  ctrl.approveReview,
);
adminRouter.post(
  "/reviews/:id/reject",
  validate({ params: schemas.idParamSchema }),
  ctrl.rejectReview,
);
adminRouter.delete("/reviews/:id", validate({ params: schemas.idParamSchema }), ctrl.deleteReview);

// Support tickets
adminRouter.get("/tickets", validate({ query: schemas.ticketsQuerySchema }), ctrl.listTickets);
adminRouter.get("/tickets/:id", validate({ params: schemas.idParamSchema }), ctrl.getTicket);
adminRouter.post(
  "/tickets/:id/messages",
  validate({ params: schemas.idParamSchema, body: schemas.ticketReplySchema }),
  ctrl.replyTicket,
);
adminRouter.post(
  "/tickets/:id/status",
  validate({ params: schemas.idParamSchema, body: schemas.ticketStatusSchema }),
  ctrl.setTicketStatus,
);
