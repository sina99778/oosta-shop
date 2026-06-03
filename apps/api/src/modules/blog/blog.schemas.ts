import { z } from "zod";

const slug = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Must be a lowercase, hyphenated slug");

export const createPostSchema = z.object({
  title: z.string().trim().min(1).max(200),
  slug,
  excerpt: z.string().trim().max(500).nullable().optional(),
  content: z.string().trim().min(1).max(100000),
  status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
});

export const updatePostSchema = createPostSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, "No fields to update");

export const postParamsSchema = z.object({ id: z.string().min(1) });
export const postSlugSchema = z.object({ slug: z.string().trim().min(1) });

export type CreatePostInput = z.infer<typeof createPostSchema>;
export type UpdatePostInput = z.infer<typeof updatePostSchema>;
