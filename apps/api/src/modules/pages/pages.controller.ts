import type { Request, Response } from "express";
import * as pages from "./pages.service";
import type { CreatePageInput, UpdatePageInput } from "./pages.schemas";

// Public
export async function listPublished(_req: Request, res: Response): Promise<void> {
  res.json(await pages.listPublished());
}
export async function getBySlug(req: Request, res: Response): Promise<void> {
  res.json({ page: await pages.getPublishedBySlug(String(req.params.slug)) });
}

// Admin
export async function listAll(_req: Request, res: Response): Promise<void> {
  res.json(await pages.listAll());
}
export async function getOne(req: Request, res: Response): Promise<void> {
  res.json({ page: await pages.getById(String(req.params.id)) });
}
export async function create(req: Request, res: Response): Promise<void> {
  res.status(201).json(await pages.createPage(req.body as CreatePageInput));
}
export async function update(req: Request, res: Response): Promise<void> {
  res.json({ page: await pages.updatePage(String(req.params.id), req.body as UpdatePageInput) });
}
export async function remove(req: Request, res: Response): Promise<void> {
  res.json(await pages.deletePage(String(req.params.id)));
}
