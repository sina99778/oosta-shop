// Validated, typed environment configuration.
// Parsed once at startup; throws (fail-fast) if required vars are missing/invalid.
// NOTE: `import "dotenv/config"` must run before this module is imported (see index.ts).

import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z
    .string()
    .min(8, "JWT_SECRET must be at least 8 characters")
    .default("dev-only-secret-change-me"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),

  PAYMENT_PROVIDER: z.enum(["mock", "zarinpal"]).default("mock"),
  ZARINPAL_MERCHANT_ID: z.string().default("00000000-0000-0000-0000-000000000000"),
  ZARINPAL_SANDBOX: z
    .string()
    .default("true")
    .transform((v) => v.toLowerCase() === "true"),
  ZARINPAL_CURRENCY: z.enum(["IRR", "IRT"]).default("IRR"),
  WEB_BASE_URL: z.string().default("http://localhost:3000"),

  // Manual card-to-card payment (buyer transfers, uploads a receipt, admin approves).
  // When enabled, the storefront offers it as a payment option and shows the card below.
  CARD_TO_CARD_ENABLED: z
    .string()
    .default("false")
    .transform((v) => v.toLowerCase() === "true"),
  CARD_NUMBER: z.string().optional(),
  CARD_HOLDER: z.string().optional(),
  CARD_BANK: z.string().optional(),

  // AI SEO assistant (Google Gemini). Optional — the deterministic analyzer always
  // works; AI generation is enabled only when GEMINI_API_KEY is set.
  GEMINI_API_KEY: z.string().optional(),
  // Newest stable Flash (great + cheap for SEO text). For max intelligence set
  // "gemini-3.1-pro"; for lowest cost "gemini-3.1-flash-lite".
  GEMINI_MODEL: z.string().default("gemini-3.5-flash"),
  // Tried automatically if the primary model is overloaded (503). Empty disables it.
  GEMINI_FALLBACK_MODEL: z.string().default("gemini-2.5-flash"),

  // Telegram admin bot (optional; the bot stays disabled unless both are set).
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_ADMIN_ID: z.preprocess(
    (value) => (value === "" || value === undefined ? undefined : value),
    z.coerce.number().int().positive().optional(),
  ),

  // Automatic Telegram DB backups: send a dump every N hours (0 disables).
  // Only runs when the bot is enabled.
  BACKUP_INTERVAL_HOURS: z.preprocess(
    (value) => (value === "" || value === undefined ? undefined : value),
    z.coerce.number().int().min(0).max(168).default(24),
  ),
});

function loadEnv() {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  const data = parsed.data;

  // Production safety guards: refuse to boot with insecure placeholder values.
  if (data.NODE_ENV === "production") {
    const problems: string[] = [];
    if (data.JWT_SECRET === "dev-only-secret-change-me") {
      problems.push("JWT_SECRET must be set to a strong, unique value in production");
    }
    if (
      data.PAYMENT_PROVIDER === "zarinpal" &&
      data.ZARINPAL_MERCHANT_ID === "00000000-0000-0000-0000-000000000000"
    ) {
      problems.push(
        "ZARINPAL_MERCHANT_ID must be set when PAYMENT_PROVIDER=zarinpal in production",
      );
    }
    if (problems.length > 0) {
      throw new Error(
        `Unsafe production configuration:\n${problems.map((p) => `  - ${p}`).join("\n")}`,
      );
    }
  }

  return {
    ...data,
    isProduction: data.NODE_ENV === "production",
    isDevelopment: data.NODE_ENV === "development",
    corsOrigins: data.CORS_ORIGIN.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  };
}

export const env = loadEnv();
export type Env = typeof env;
