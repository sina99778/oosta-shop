// Blog / educational content: public reads + admin CRUD. Body is Markdown.

import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/httpError";
import { isSafeRasterMime } from "../../middleware/upload";
import type { CreatePostInput, UpdatePostInput } from "./blog.schemas";

// ---------------- Public ----------------
// Persian reading speed is close to 200 words a minute; code blocks count as words.
export function readingMinutes(content: string): number {
  const words = content
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/[#*_>`~\-|]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

const summarySelect = {
  id: true,
  slug: true,
  title: true,
  excerpt: true,
  tag: true,
  content: true,
  coverMime: true,
  coverAlt: true,
  publishedAt: true,
  updatedAt: true,
} as const;

type SummaryRow = Prisma.BlogPostGetPayload<{ select: typeof summarySelect }>;

function toSummary(p: SummaryRow) {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt,
    tag: p.tag,
    readingMinutes: readingMinutes(p.content),
    hasCover: p.coverMime != null,
    coverAlt: p.coverAlt,
    publishedAt: p.publishedAt,
    updatedAt: p.updatedAt,
  };
}

const publishedOrder = [
  { publishedAt: "desc" },
  { createdAt: "desc" },
] satisfies Prisma.BlogPostOrderByWithRelationInput[];

export async function listPublished(tag?: string) {
  const [posts, tagRows] = await Promise.all([
    prisma.blogPost.findMany({
      where: { status: "PUBLISHED", ...(tag ? { tag } : {}) },
      orderBy: publishedOrder,
      select: summarySelect,
    }),
    prisma.blogPost.groupBy({
      by: ["tag"],
      where: { status: "PUBLISHED", tag: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { tag: "desc" } },
    }),
  ]);
  return {
    posts: posts.map(toSummary),
    tags: tagRows.map((row) => ({ tag: row.tag!, count: row._count._all })),
  };
}

// Products linked from the article body (/products/<slug> or /fa|en/products/<slug>).
export function linkedProductSlugs(content: string): string[] {
  const slugs = new Set<string>();
  for (const match of content.matchAll(/\/(?:(?:fa|en)\/)?products\/([a-z0-9]+(?:-[a-z0-9]+)*)/g))
    slugs.add(match[1]);
  return [...slugs].slice(0, 6);
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
      tag: true,
      coverMime: true,
      coverAlt: true,
      publishedAt: true,
      updatedAt: true,
    },
  });
  if (!post) throw new AppError(404, "NOT_FOUND", "Post not found");
  const linked = linkedProductSlugs(post.content);
  const [related, products] = await Promise.all([
    prisma.blogPost.findMany({
      where: { status: "PUBLISHED", id: { not: post.id } },
      orderBy: publishedOrder,
      select: summarySelect,
      take: 12,
    }),
    linked.length
      ? prisma.product.findMany({
          where: { slug: { in: linked }, isActive: true },
          select: { id: true, slug: true, name: true, type: true },
        })
      : Promise.resolve([]),
  ]);
  // Same-topic posts first, then the newest others.
  related.sort((a, b) => Number(b.tag === post.tag) - Number(a.tag === post.tag));
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    content: post.content,
    tag: post.tag,
    readingMinutes: readingMinutes(post.content),
    hasCover: post.coverMime != null,
    coverAlt: post.coverAlt,
    publishedAt: post.publishedAt,
    updatedAt: post.updatedAt,
    related: related.slice(0, 3).map(toSummary),
    products: linked.flatMap((slug) => products.filter((p) => p.slug === slug)),
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
      tag: true,
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
      tag: p.tag,
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
      tag: true,
      coverMime: true,
      coverAlt: true,
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
    tag: post.tag,
    hasCover: post.coverMime != null,
    coverAlt: post.coverAlt,
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
      coverAlt: input.coverAlt || null,
      tag: input.tag ?? null,
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
  if (input.coverAlt !== undefined) data.coverAlt = input.coverAlt || null;
  if (input.tag !== undefined) data.tag = input.tag;
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
