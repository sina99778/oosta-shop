import { Prisma } from "@prisma/client";
import { z } from "zod";
import { AppError } from "../../utils/httpError";
const positive = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,6})?$/)
  .refine((v) => new Prisma.Decimal(v).gt(0));
const irr = z.string().regex(/^\d{1,10}$/);
export const pricingSchema = z
  .object({
    enabled: z.boolean(),
    rateSource: z.enum(["MANUAL", "NAVASAN_FREE"]).default("MANUAL"),
    rates: z.object({ USD: positive.optional(), USDT: positive.optional() }).strict(),
    markupPercent: z
      .string()
      .regex(/^\d{1,3}(\.\d{1,2})?$/)
      .refine((v) => new Prisma.Decimal(v).lte(100)),
    minimumProfitIrr: z.literal("0"), // Compatibility field; no Rial profit floor.
    fixedCostIrr: irr,
    ttlSeconds: z.number().int().min(60).max(900),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type Pricing = z.infer<typeof pricingSchema>;
export const pricingInput = pricingSchema.omit({ updatedAt: true });
export function rateExpiry(policy: Pricing): number {
  return Date.parse(policy.updatedAt) + policy.ttlSeconds * 1000;
}
export function indicativePrice(
  cost: string,
  currency: "USD" | "USDT",
  policy: Pricing,
  now = new Date(),
): Prisma.Decimal {
  if (
    !policy.enabled ||
    !policy.rates[currency] ||
    rateExpiry(policy) <= now.getTime() ||
    Date.parse(policy.updatedAt) > now.getTime() + 10000
  )
    throw new AppError(
      503,
      "PRICING_UNAVAILABLE",
      "A valid exchange rate and pricing policy are required",
    );
  const amount = new Prisma.Decimal(cost);
  if (!amount.isFinite() || amount.lte(0))
    throw new AppError(502, "INVALID_SUPPLIER_PRICE", "Supplier price is invalid");
  const markedUpCost = amount.mul(
    new Prisma.Decimal(1).add(new Prisma.Decimal(policy.markupPercent).div(100)),
  );
  const total = markedUpCost
    .mul(policy.rates[currency]!)
    .add(policy.fixedCostIrr)
    .div(10)
    .ceil()
    .mul(10); // Round once to whole Toman; fixed Rial fees receive no markup.
  if (total.gt("9999999990"))
    throw new AppError(503, "PRICE_OUT_OF_RANGE", "Price is outside the supported range");
  return total;
}
