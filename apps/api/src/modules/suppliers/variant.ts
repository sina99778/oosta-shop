import { createHash } from "node:crypto";
import { z } from "zod";

const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .transform((s) => s.normalize("NFC"));
const warranty = z.preprocess(
  (v) => v ?? { kind: "UNKNOWN" },
  z
    .object({
      kind: z.enum(["NONE", "UNKNOWN", "WARRANTED"]),
      days: z.number().int().min(0).max(3650).optional(),
      coverage: z.enum(["NONE", "LOGIN", "FULL"]).optional(),
    })
    .strict()
    .superRefine((v, ctx) => {
      if (
        v.kind === "WARRANTED" &&
        (!(v.days && v.days > 0) || !v.coverage || v.coverage === "NONE")
      )
        ctx.addIssue({ code: "custom", message: "A warranty requires its duration and coverage" });
    })
    .transform((v) =>
      v.kind === "WARRANTED"
        ? { kind: "WARRANTED" as const, days: v.days!, coverage: v.coverage! }
        : { kind: "NONE" as const, days: 0, coverage: "NONE" as const },
    ),
);

export const variantSchema = z
  .object({
    plan: text(100),
    access: z.enum(["PERSONAL", "SHARED", "TEAM"]),
    fulfillment: z.enum(["ACCOUNT", "INVITE", "CODE", "UPGRADE"]),
    delivery: z.enum(["AUTOMATIC", "MANUAL"]),
    warranty,
    region: text(60),
    quota: text(100),
  })
  .strict();
export type Variant = z.output<typeof variantSchema>;
export function readVariant(value: unknown): Variant | null {
  const result = variantSchema.safeParse(value);
  return result.success ? result.data : null;
}
export function variantKey(value: Variant, durationDays: number | null): string {
  const v = variantSchema.parse(value);
  return createHash("sha256")
    .update(
      JSON.stringify([
        v.plan.toUpperCase(),
        durationDays,
        v.access,
        v.fulfillment,
        v.delivery,
        v.warranty.kind,
        v.warranty.days,
        v.warranty.coverage,
        v.region.toUpperCase(),
        v.quota.toUpperCase(),
      ]),
    )
    .digest("hex");
}
export const supplierIds = [
  "toolsmarket",
  "aitoolify",
  "canboso",
  "canboso2",
  "ventebot",
  "getdigitaltools",
] as const;
export const mappingSchema = z
  .object({
    supplier: z.enum(supplierIds),
    externalId: text(100),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    automaticVerified: z.boolean().optional(),
  })
  .strict();
export type Mapping = z.infer<typeof mappingSchema> & { variantKey: string };
export function readMappings(value: unknown): Mapping[] {
  const result = z
    .array(mappingSchema.extend({ variantKey: z.string().regex(/^[a-f0-9]{64}$/) }))
    .max(20)
    .safeParse(value);
  return result.success ? result.data : [];
}
