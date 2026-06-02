// HTTP handlers for the public catalog. Coerced query params are read from
// res.locals.query (set by the validate() middleware — see Express 5 note there).

import type { Request, Response } from "express";
import * as catalog from "./catalog.service";
import type { BestsellingQuery, ListProductsQuery, SubmitReviewInput } from "./catalog.schemas";

export async function listCategories(_req: Request, res: Response): Promise<void> {
  res.json({ categories: await catalog.listCategories() });
}

export async function listProducts(_req: Request, res: Response): Promise<void> {
  const query = res.locals.query as ListProductsQuery;
  res.json(await catalog.listProducts(query));
}

export async function bestselling(_req: Request, res: Response): Promise<void> {
  const { limit } = res.locals.query as BestsellingQuery;
  res.json({ products: await catalog.getBestselling(limit) });
}

export async function productBySlug(req: Request, res: Response): Promise<void> {
  res.json({ product: await catalog.getProductBySlug(String(req.params.slug)) });
}

export async function productImage(req: Request, res: Response): Promise<void> {
  const { data, mimeType } = await catalog.getProductImage(String(req.params.id));
  res.setHeader("Content-Type", mimeType);
  res.setHeader("Cache-Control", "public, max-age=300");
  res.send(data);
}

export async function galleryImage(req: Request, res: Response): Promise<void> {
  const { data, mimeType } = await catalog.getGalleryImage(String(req.params.id));
  res.setHeader("Content-Type", mimeType);
  res.setHeader("Cache-Control", "public, max-age=300");
  res.send(data);
}

export async function submitReview(req: Request, res: Response): Promise<void> {
  const { rating, comment } = req.body as SubmitReviewInput;
  res
    .status(201)
    .json(await catalog.submitReview(req.user!.id, String(req.params.id), rating, comment));
}
