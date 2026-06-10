// Standalone CMS pages (about, terms, …) rendered at /p/<slug> on the web.
// Body is Markdown, same renderer as blog posts. Public reads + admin CRUD.

import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/httpError";
import type { CreatePageInput, UpdatePageInput } from "./pages.schemas";

// ---------------- Public ----------------
export async function listPublished() {
  const pages = await prisma.page.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { createdAt: "asc" },
    select: { id: true, slug: true, title: true },
  });
  return { pages };
}

export async function getPublishedBySlug(slug: string) {
  const page = await prisma.page.findFirst({
    where: { slug, status: "PUBLISHED" },
    select: { id: true, slug: true, title: true, content: true, updatedAt: true },
  });
  if (!page) throw new AppError(404, "NOT_FOUND", "Page not found");
  return page;
}

// ---------------- Admin ----------------
export async function listAll() {
  const pages = await prisma.page.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, slug: true, title: true, status: true, updatedAt: true },
  });
  return { pages };
}

export async function getById(id: string) {
  const page = await prisma.page.findUnique({
    where: { id },
    select: { id: true, slug: true, title: true, content: true, status: true, updatedAt: true },
  });
  if (!page) throw new AppError(404, "NOT_FOUND", "Page not found");
  return page;
}

export async function createPage(input: CreatePageInput) {
  const page = await prisma.page.create({
    data: {
      title: input.title,
      slug: input.slug,
      content: input.content,
      status: input.status ?? "PUBLISHED",
    },
    select: { id: true, slug: true },
  });
  return page;
}

export async function updatePage(id: string, input: UpdatePageInput) {
  const exists = await prisma.page.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new AppError(404, "NOT_FOUND", "Page not found");

  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.slug !== undefined) data.slug = input.slug;
  if (input.content !== undefined) data.content = input.content;
  if (input.status !== undefined) data.status = input.status;
  await prisma.page.update({ where: { id }, data });
  return getById(id);
}

export async function deletePage(id: string) {
  await prisma.page.delete({ where: { id } });
  return { id };
}
