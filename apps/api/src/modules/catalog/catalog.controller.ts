// HTTP handlers for the public catalog. Coerced query params are read from
// res.locals.query (set by the validate() middleware — see Express 5 note there).

import type { Request, Response } from "express";
import * as catalog from "./catalog.service";
import type { BestsellingQuery, ListProductsQuery } from "./catalog.schemas";

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
