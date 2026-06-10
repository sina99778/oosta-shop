// Runtime payment-gateway configuration. Values live in SiteSetting (pay.* keys)
// so the admin can switch gateways / edit the card-to-card details from the
// admin panel, the Telegram bot or the AI agent — without touching .env or
// restarting. The PAYMENT_* / CARD_* env vars remain the defaults.

import { z } from "zod";
import { prisma } from "./prisma";
import { env } from "../config/env";
import { AppError } from "../utils/httpError";

export type GatewayConfig = {
  provider: "mock" | "zarinpal";
  zarinpalMerchantId: string;
  zarinpalSandbox: boolean;
  cardEnabled: boolean;
  cardNumber: string;
  cardHolder: string;
  cardBank: string;
};

const KEY_PREFIX = "pay.";
const KEYS = [
  "provider",
  "zarinpalMerchantId",
  "zarinpalSandbox",
  "cardEnabled",
  "cardNumber",
  "cardHolder",
  "cardBank",
] as const;
type GatewayKey = (typeof KEYS)[number];

// PATCH body: booleans accepted as booleans; null (or "") reverts to the env default.
const clearable = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === "" ? null : v), schema.nullable());

export const gatewayPatchSchema = z
  .object({
    provider: z.enum(["mock", "zarinpal"]).nullable(),
    zarinpalMerchantId: clearable(z.string().trim().min(8).max(60)),
    zarinpalSandbox: z.boolean().nullable(),
    cardEnabled: z.boolean().nullable(),
    // Persian/latin digits, spaces and dashes allowed; normalized on save.
    cardNumber: clearable(
      z
        .string()
        .trim()
        .transform((v) =>
          v.replace(/[-\s]/g, "").replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))),
        )
        .pipe(z.string().regex(/^\d{16}$/, "Card number must be 16 digits")),
    ),
    cardHolder: clearable(z.string().trim().min(2).max(100)),
    cardBank: clearable(z.string().trim().min(2).max(60)),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, "No fields to update");

export type GatewayPatch = z.infer<typeof gatewayPatchSchema>;

const parseBool = (value: string | undefined, dflt: boolean) =>
  value === undefined ? dflt : value === "true";

export async function getGatewayConfig(): Promise<GatewayConfig> {
  const rows = await prisma.siteSetting.findMany({
    where: { key: { in: KEYS.map((k) => KEY_PREFIX + k) } },
  });
  const map = new Map(rows.map((r) => [r.key.slice(KEY_PREFIX.length) as GatewayKey, r.value]));
  const provider = map.get("provider");
  return {
    provider: provider === "zarinpal" || provider === "mock" ? provider : env.PAYMENT_PROVIDER,
    zarinpalMerchantId: map.get("zarinpalMerchantId") ?? env.ZARINPAL_MERCHANT_ID,
    zarinpalSandbox: parseBool(map.get("zarinpalSandbox"), env.ZARINPAL_SANDBOX),
    cardEnabled: parseBool(map.get("cardEnabled"), env.CARD_TO_CARD_ENABLED),
    cardNumber: map.get("cardNumber") ?? env.CARD_NUMBER ?? "",
    cardHolder: map.get("cardHolder") ?? env.CARD_HOLDER ?? "",
    cardBank: map.get("cardBank") ?? env.CARD_BANK ?? "",
  };
}

const PLACEHOLDER_MERCHANT = "00000000-0000-0000-0000-000000000000";

export async function patchGatewayConfig(patch: GatewayPatch): Promise<GatewayConfig> {
  // Refuse a state where the REAL gateway is active with the placeholder merchant
  // (mirrors the env.ts production boot guard — one mis-tap in the bot would
  // otherwise break every online checkout).
  const current = await getGatewayConfig();
  const next = {
    provider:
      patch.provider === undefined ? current.provider : (patch.provider ?? env.PAYMENT_PROVIDER),
    merchant:
      patch.zarinpalMerchantId === undefined
        ? current.zarinpalMerchantId
        : (patch.zarinpalMerchantId ?? env.ZARINPAL_MERCHANT_ID),
  };
  if (next.provider === "zarinpal" && (!next.merchant || next.merchant === PLACEHOLDER_MERCHANT)) {
    throw new AppError(
      400,
      "MERCHANT_REQUIRED",
      "Set a real Zarinpal merchant id before enabling the Zarinpal gateway",
    );
  }

  const ops = Object.entries(patch).map(([key, value]) => {
    const dbKey = KEY_PREFIX + key;
    return value === null
      ? prisma.siteSetting.deleteMany({ where: { key: dbKey } })
      : prisma.siteSetting.upsert({
          where: { key: dbKey },
          create: { key: dbKey, value: String(value) },
          update: { value: String(value) },
        });
  });
  await prisma.$transaction(ops);
  return getGatewayConfig();
}

// "6219861012345678" -> "6219 86** **** 5678" (for status displays).
export function maskCard(number: string): string {
  if (!/^\d{16}$/.test(number)) return number || "—";
  return `${number.slice(0, 4)} ${number.slice(4, 6)}** **** ${number.slice(12)}`;
}
