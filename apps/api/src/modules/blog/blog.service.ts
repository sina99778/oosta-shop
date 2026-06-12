// Blog / educational content: public reads + admin CRUD. Body is Markdown.

import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/httpError";
import { isSafeRasterMime } from "../../middleware/upload";
import type { CreatePostInput, UpdatePostInput } from "./blog.schemas";

// ---------------- Public ----------------
export async function listPublished() {
  const posts = await prisma.blogPost.findMany({
    where: { status: "PUBLISHED" },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      excerpt: true,
      coverMime: true,
      publishedAt: true,
    },
  });
  return {
    posts: posts.map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      excerpt: p.excerpt,
      hasCover: p.coverMime != null,
      publishedAt: p.publishedAt,
    })),
  };
}

export async function getPublishedBySlug(slug: string) {
  const post = await prisma.blogPost.findFirst({
    where: { slug, status: "PUBLISHED" },
    select: {
      id: true,
      slug: true,
      title: true,
      excerpt: true,
      content: true,
      coverMime: true,
      publishedAt: true,
    },
  });
  if (!post) throw new AppError(404, "NOT_FOUND", "Post not found");
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    content: post.content,
    hasCover: post.coverMime != null,
    publishedAt: post.publishedAt,
  };
}

export async function getCover(id: string) {
  const post = await prisma.blogPost.findUnique({
    where: { id },
    select: { coverData: true, coverMime: true },
  });
  if (!post?.coverData || !post.coverMime) throw new AppError(404, "NOT_FOUND", "No cover");
  return { data: Buffer.from(post.coverData), mimeType: post.coverMime };
}

export async function getMedia(id: string) {
  const media = await prisma.blogMedia.findUnique({
    where: { id },
    select: { imageData: true, mimeType: true },
  });
  if (!media) throw new AppError(404, "NOT_FOUND", "Media not found");
  return { data: Buffer.from(media.imageData), mimeType: media.mimeType };
}

// ---------------- Admin ----------------
export async function listAll() {
  const posts = await prisma.blogPost.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      coverMime: true,
      publishedAt: true,
      createdAt: true,
    },
  });
  return {
    posts: posts.map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      status: p.status,
      hasCover: p.coverMime != null,
      publishedAt: p.publishedAt,
      createdAt: p.createdAt,
    })),
  };
}

export async function getById(id: string) {
  const post = await prisma.blogPost.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      title: true,
      excerpt: true,
      content: true,
      status: true,
      coverMime: true,
      publishedAt: true,
    },
  });
  if (!post) throw new AppError(404, "NOT_FOUND", "Post not found");
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    content: post.content,
    status: post.status,
    hasCover: post.coverMime != null,
    publishedAt: post.publishedAt,
  };
}

export async function createPost(input: CreatePostInput) {
  const status = input.status ?? "DRAFT";
  const post = await prisma.blogPost.create({
    data: {
      title: input.title,
      slug: input.slug,
      excerpt: input.excerpt ?? null,
      content: input.content,
      status,
      publishedAt: status === "PUBLISHED" ? new Date() : null,
    },
    select: { id: true, slug: true },
  });
  return { id: post.id, slug: post.slug };
}

export async function updatePost(id: string, input: UpdatePostInput) {
  const existing = await prisma.blogPost.findUnique({
    where: { id },
    select: { status: true, publishedAt: true },
  });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Post not found");

  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.slug !== undefined) data.slug = input.slug;
  if (input.excerpt !== undefined) data.excerpt = input.excerpt;
  if (input.content !== undefined) data.content = input.content;
  if (input.status !== undefined) {
    data.status = input.status;
    // First time it goes live, stamp publishedAt.
    if (input.status === "PUBLISHED" && !existing.publishedAt) data.publishedAt = new Date();
  }
  await prisma.blogPost.update({ where: { id }, data });
  return getById(id);
}

export async function deletePost(id: string) {
  await prisma.blogPost.delete({ where: { id } });
  return { id };
}

export async function setCover(id: string, file: { buffer: Buffer; mimetype: string } | undefined) {
  if (!file) throw new AppError(400, "NO_FILE", "An image file is required");
  if (!isSafeRasterMime(file.mimetype)) {
    throw new AppError(400, "BAD_FILE_TYPE", "Cover must be an image");
  }
  const exists = await prisma.blogPost.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new AppError(404, "NOT_FOUND", "Post not found");
  await prisma.blogPost.update({
    where: { id },
    data: { coverData: new Uint8Array(file.buffer), coverMime: file.mimetype },
  });
  return { ok: true, hasCover: true };
}

export async function addMedia(file: { buffer: Buffer; mimetype: string } | undefined) {
  if (!file) throw new AppError(400, "NO_FILE", "An image file is required");
  if (!isSafeRasterMime(file.mimetype)) {
    throw new AppError(400, "BAD_FILE_TYPE", "Media must be an image");
  }
  const media = await prisma.blogMedia.create({
    data: { imageData: new Uint8Array(file.buffer), mimeType: file.mimetype },
    select: { id: true },
  });
  // Relative URL — the client prefixes it with the API origin.
  return { id: media.id, url: `/blog-media/${media.id}` };
}
