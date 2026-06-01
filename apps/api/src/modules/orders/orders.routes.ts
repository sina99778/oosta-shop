// Authenticated order routes (all require a valid JWT).

import { Router } from "express";
import { authenticate } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { createOrderSchema, orderParamsSchema } from "./orders.schemas";
import { createOrder, getOrder, listMyOrders } from "./orders.controller";

export const ordersRouter = Router();

ordersRouter.use(authenticate);
ordersRouter.post("/", validate({ body: createOrderSchema }), createOrder);
ordersRouter.get("/", listMyOrders);
ordersRouter.get("/:id", validate({ params: orderParamsSchema }), getOrder);
