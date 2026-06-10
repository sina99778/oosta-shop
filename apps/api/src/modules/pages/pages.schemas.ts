import { z } from "zod";

const slug = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Must be a lowercase, hyphenated slug");

export const createPageSchema = z.object({
  title: z.string().trim().min(1).max(200),
  slug,
  content: z.string().trim().min(1).max(100000),
  status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
});

export const updatePageSchema = createPageSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, "No fields to update");

export const pageParamsSchema = z.object({ id: z.string().min(1) });
export const pageSlugSchema = z.object({ slug: z.string().trim().min(1) });

export type CreatePageInput = z.infer<typeof createPageSchema>;
export type UpdatePageInput = z.infer<typeof updatePageSchema>;
