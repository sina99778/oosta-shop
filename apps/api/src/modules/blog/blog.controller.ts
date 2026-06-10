import type { Request, Response } from "express";
import * as blog from "./blog.service";
import type { CreatePostInput, UpdatePostInput } from "./blog.schemas";

function sendImage(res: Response, data: Buffer, mimeType: string, cache: string): void {
  res.setHeader("Content-Type", mimeType);
  res.setHeader("Cache-Control", cache);
  res.send(data);
}

// Public
export async function listPublished(_req: Request, res: Response): Promise<void> {
  res.json(await blog.listPublished());
}
export async function getBySlug(req: Request, res: Response): Promise<void> {
  res.json({ post: await blog.getPublishedBySlug(String(req.params.slug)) });
}
export async function cover(req: Request, res: Response): Promise<void> {
  const { data, mimeType } = await blog.getCover(String(req.params.id));
  sendImage(res, data, mimeType, "public, max-age=3600, stale-while-revalidate=86400");
}
export async function media(req: Request, res: Response): Promise<void> {
  const { data, mimeType } = await blog.getMedia(String(req.params.id));
  // Media ids are immutable (every upload gets a new id) — cache for a year.
  sendImage(res, data, mimeType, "public, max-age=31536000, immutable");
}

// Admin
export async function listAll(_req: Request, res: Response): Promise<void> {
  res.json(await blog.listAll());
}
export async function getOne(req: Request, res: Response): Promise<void> {
  res.json({ post: await blog.getById(String(req.params.id)) });
}
export async function create(req: Request, res: Response): Promise<void> {
  res.status(201).json(await blog.createPost(req.body as CreatePostInput));
}
export async function update(req: Request, res: Response): Promise<void> {
  res.json({ post: await blog.updatePost(String(req.params.id), req.body as UpdatePostInput) });
}
export async function remove(req: Request, res: Response): Promise<void> {
  res.json(await blog.deletePost(String(req.params.id)));
}
export async function setCover(req: Request, res: Response): Promise<void> {
  const file = req.file ? { buffer: req.file.buffer, mimetype: req.file.mimetype } : undefined;
  res.json(await blog.setCover(String(req.params.id), file));
}
export async function addMedia(req: Request, res: Response): Promise<void> {
  const file = req.file ? { buffer: req.file.buffer, mimetype: req.file.mimetype } : undefined;
  res.status(201).json(await blog.addMedia(file));
}
