// Public payment-verification route. The frontend's checkout callback page reads the
// gateway's redirect params (Authority + Status) and POSTs them here to finalize the
// order (verify + instant delivery).

import { Router } from "express";
import { validate } from "../../middleware/validate";
import { verifyPaymentSchema } from "../orders/orders.schemas";
import { verifyPayment, paymentConfig } from "../orders/orders.controller";

export const paymentsRouter = Router();

// Public: which payment methods the storefront should offer (+ card details).
paymentsRouter.get("/config", paymentConfig);
paymentsRouter.post("/verify", validate({ body: verifyPaymentSchema }), verifyPayment);
