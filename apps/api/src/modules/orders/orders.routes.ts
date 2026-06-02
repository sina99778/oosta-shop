// Authenticated order routes (all require a valid JWT).

import { Router } from "express";
import { authenticate } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { uploadReceiptImage } from "../../middleware/upload";
import { createOrderSchema, orderParamsSchema, uploadReceiptSchema } from "./orders.schemas";
import { createOrder, getOrder, listMyOrders, uploadReceipt } from "./orders.controller";

export const ordersRouter = Router();

ordersRouter.use(authenticate);
ordersRouter.post("/", validate({ body: createOrderSchema }), createOrder);
ordersRouter.get("/", listMyOrders);
ordersRouter.get("/:id", validate({ params: orderParamsSchema }), getOrder);
// Card-to-card receipt upload (multipart: field "receipt" + optional "reference").
ordersRouter.post(
  "/:id/receipt",
  validate({ params: orderParamsSchema }),
  uploadReceiptImage,
  validate({ body: uploadReceiptSchema }),
  uploadReceipt,
);
