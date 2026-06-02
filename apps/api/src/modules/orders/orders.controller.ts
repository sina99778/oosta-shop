// HTTP handlers for orders + payment verification.

import type { Request, Response } from "express";
import * as orders from "./orders.service";
import type { CreateOrderInput, VerifyPaymentInput } from "./orders.schemas";

export async function createOrder(req: Request, res: Response): Promise<void> {
  const result = await orders.createOrder(req.user!.id, req.body as CreateOrderInput);
  res.status(201).json(result);
}

export async function listMyOrders(req: Request, res: Response): Promise<void> {
  res.json({ orders: await orders.listOrders(req.user!.id) });
}

export async function getOrder(req: Request, res: Response): Promise<void> {
  res.json({ order: await orders.getOrderDetail(req.user!.id, String(req.params.id)) });
}

export async function verifyPayment(req: Request, res: Response): Promise<void> {
  const { authority, status } = req.body as VerifyPaymentInput;
  res.json(await orders.verifyAndDeliver(authority, status));
}

export async function uploadReceipt(req: Request, res: Response): Promise<void> {
  const reference = typeof req.body?.reference === "string" ? req.body.reference : undefined;
  const result = await orders.uploadReceipt(
    req.user!.id,
    String(req.params.id),
    req.file ? { buffer: req.file.buffer, mimetype: req.file.mimetype } : undefined,
    reference,
  );
  res.status(201).json(result);
}

export function paymentConfig(_req: Request, res: Response): void {
  res.json(orders.getPaymentConfig());
}
