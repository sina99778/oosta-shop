// Admin routes — all require a valid JWT AND the ADMIN role.

import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import * as schemas from "./admin.schemas";
import * as ctrl from "./admin.controller";

export const adminRouter = Router();

adminRouter.use(authenticate, requireRole("ADMIN"));

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
