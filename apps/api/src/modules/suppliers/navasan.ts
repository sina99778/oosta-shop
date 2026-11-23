import { Prisma } from "@prisma/client";
import { z } from "zod";
import { AppError } from "../../utils/httpError";

export const FX_INTERVAL_MS = 8 * 3600000;
export const FX_MAX_AGE_MS = 10 * 3600000;
export const FX_WINDOW_MS = 31 * 86400000;
export const FX_BUDGET = 100;
const rateSchema = z
  .object({
    irr: z
      .string()
      .regex(/^\d{1,12}(\.\d{1,6})?$/)
      .refine((v) => new Prisma.Decimal(v).gt(0)),
    updatedAt: z.string().datetime(),
  })
  .strict();
export const fxSnapshotSchema = z
  .object({
    fetchedAt: z.string().datetime(),
    rates: z.object({ USD: rateSchema.optional(), USDT: rateSchema.optional() }).strict(),
  })
  .strict();
export type FxSnapshot = z.infer<typeof fxSnapshotSchema>;
export const fxStateSchema = z
  .object({
    createdAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    attempts: z.array(z.string().datetime()).max(120),
    blocked: z.boolean(),
    snapshot: fxSnapshotSchema.nullable(),
    lastError: z.enum(["AUTH", "LIMIT", "UNAVAILABLE", "INVALID"]).nullable(),
  })
  .strict();
export type FxState = z.infer<typeof fxStateSchema>;
export function mayAttempt(state: FxState, now = Date.now()) {
  const attempts = state.attempts.map(Date.parse);
  return (
    !state.blocked &&
    Date.parse(state.expiresAt) > now &&
    attempts.filter((t) => t > now - FX_WINDOW_MS).length < FX_BUDGET &&
    !attempts.some((t) => now - t < FX_INTERVAL_MS)
  );
}
export function usableFxRates(snapshot: FxSnapshot | null, now = Date.now()) {
  const rates: Partial<Record<"USD" | "USDT", string>> = {};
  if (!snapshot || Date.parse(snapshot.fetchedAt) > now + 60000) return rates;
  for (const currency of ["USD", "USDT"] as const) {
    const r = snapshot.rates[currency];
    if (
      r &&
      Date.parse(r.updatedAt) <= now + 60000 &&
      now - Date.parse(r.updatedAt) < FX_MAX_AGE_MS
    )
      rates[currency] = r.irr;
  }
  return rates;
}
export function normalizeNavasan(input: unknown, now = new Date()): FxSnapshot {
  const body = z.record(z.string(), z.unknown()).parse(input);
  const rates: FxSnapshot["rates"] = {};
  for (const [currency, symbol] of [
    ["USD", "usd_sell"],
    ["USDT", "usdt"],
  ] as const) {
    const item = z
      .object({
        value: z.union([
          z.string().regex(/^\d{1,11}(\.\d{1,6})?$/),
          z.number().finite().positive(),
        ]),
        timestamp: z.number().int().positive(),
      })
      .safeParse(body[symbol]);
    if (!item.success) continue;
    const { value, timestamp } = item.data;
    if (
      timestamp * 1000 > now.getTime() + 60000 ||
      now.getTime() - timestamp * 1000 >= FX_MAX_AGE_MS
    )
      continue;
    // usd_sell and usdt are Toman; official/central-bank symbols have different units and are not used.
    const parsed = rateSchema.safeParse({
      irr: new Prisma.Decimal(value).mul(10).toString(),
      updatedAt: new Date(timestamp * 1000).toISOString(),
    });
    if (parsed.success) rates[currency] = parsed.data;
  }
  if (!Object.keys(rates).length)
    throw new AppError(502, "FX_INVALID", "Exchange rate data is invalid or too old");
  return { fetchedAt: now.toISOString(), rates };
}
export async function fetchNavasan(key: string, now = new Date()): Promise<FxSnapshot> {
  try {
    const url = new URL("https://api.navasan.tech/latest/");
    url.searchParams.set("api_key", key);
    const response = await fetch(url, {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(12000),
      headers: { Accept: "application/json" },
    });
    if (response.status === 401 || response.status === 403)
      throw new AppError(502, "FX_AUTH", "Exchange rate subscription is unavailable");
    if (response.status === 429)
      throw new AppError(502, "FX_LIMIT", "Exchange rate request limit reached");
    if (!response.ok) throw new Error();
    const reader = response.body?.getReader();
    if (!reader) throw new Error();
    let length = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 1000000) {
        await reader.cancel();
        throw new Error();
      }
      chunks.push(value);
    }
    return normalizeNavasan(JSON.parse(Buffer.concat(chunks).toString("utf8")), now);
  } catch (error) {
    if (error instanceof AppError && ["FX_AUTH", "FX_LIMIT", "FX_INVALID"].includes(error.code))
      throw error;
    // Never expose transport errors: the API key is a required query parameter upstream.
    throw new AppError(502, "FX_UNAVAILABLE", "Exchange rate service is temporarily unavailable");
  }
}
