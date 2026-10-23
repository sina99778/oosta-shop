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
  // Number of reverse proxies in front of Express (prod: ArvanCloud edge -> nginx = 2).
  // Must match reality: a higher number than the real hop count lets clients spoof
  // X-Forwarded-For and dodge the rate limiters.
  TRUST_PROXY_HOPS: z.preprocess(
    (value) => (value === "" || value === undefined ? undefined : value),
    z.coerce.number().int().min(0).max(5).optional(),
  ),
  // Session cookie "Secure" flag. Defaults to true in production (the site must be
  // served over HTTPS — e.g. TLS at the CDN edge); set "false" only for an HTTP-only test box.
  COOKIE_SECURE: z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? undefined : v.toLowerCase() === "true")),

  // AES-256-GCM key for deliverable credentials at rest (32 bytes: 64 hex chars or
  // base64). Generate: openssl rand -hex 32. KEEP A COPY OUTSIDE THE SERVER — without
  // it, encrypted stock (and DB backups) cannot be read.
  CREDENTIALS_ENCRYPTION_KEY: z.string().optional(),

  // Pending orders hold (RESERVE) their stock for this long, then expire.
  ORDER_EXPIRY_MINUTES_ONLINE: z.coerce
    .number()
    .int()
    .min(5)
    .max(24 * 60)
    .default(20),
  ORDER_EXPIRY_MINUTES_CARD: z.coerce
    .number()
    .int()
    .min(10)
    .max(7 * 24 * 60)
    .default(60),
  // Cap on a user's simultaneously unpaid orders (each one holds stock).
  MAX_OPEN_ORDERS_PER_USER: z.coerce.number().int().min(1).max(50).default(3),

  PAYMENT_PROVIDER: z.enum(["mock", "zarinpal"]).default("mock"),
  ALLOW_MOCK_PAYMENTS_IN_PRODUCTION: z
    .string()
    .default("false")
    .transform((v) => v.toLowerCase() === "true"),
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

  // OpenRouter (openrouter.ai) — preferred LLM provider for the Telegram AI agent
  // when set (Gemini stays as the fallback provider). One key unlocks every model.
  OPENROUTER_API_KEY: z.string().optional(),
  // GPT-5.5: strongest GPT for writing/SEO structure ($5/$30 per M tokens).
  // Note: June 2026 Persian evals (TARAZ/PerHalluEval) + blind copy tests actually
  // favor "anthropic/claude-sonnet-4.6" ($3/$15) for Persian copy — easy switch.
  // Cheaper: "openai/gpt-5.4" ($2.50/$15) or "google/gemini-3.5-flash" ($1.50/$9).
  OPENROUTER_MODEL: z.string().default("openai/gpt-5.5"),
  // Tried automatically when the primary model errors/overloads. Empty disables it.
  OPENROUTER_FALLBACK_MODEL: z.string().default("google/gemini-3.1-pro-preview"),
  // "Nano Banana Pro" — $0.134/image (1K & 2K same price), quality ≈ GPT Image 2
  // high tier ($0.211) and better at editing product photos. Cheaper: nano banana 2
  // "google/gemini-3.1-flash-image-preview" (~$0.067) or "google/gemini-2.5-flash-image" (~$0.04).
  OPENROUTER_IMAGE_MODEL: z.string().default("google/gemini-3-pro-image-preview"),

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
    if (data.PAYMENT_PROVIDER === "mock" && !data.ALLOW_MOCK_PAYMENTS_IN_PRODUCTION) {
      problems.push(
        "PAYMENT_PROVIDER=mock is disabled in production; use Zarinpal or explicitly set ALLOW_MOCK_PAYMENTS_IN_PRODUCTION=true for a controlled test environment",
      );
    }
    if (
      data.PAYMENT_PROVIDER === "zarinpal" &&
      data.ZARINPAL_MERCHANT_ID === "00000000-0000-0000-0000-000000000000"
    ) {
      problems.push(
        "ZARINPAL_MERCHANT_ID must be set when PAYMENT_PROVIDER=zarinpal in production",
      );
    }
    if (!data.CREDENTIALS_ENCRYPTION_KEY) {
      console.warn(
        "[oosta-api] WARNING: CREDENTIALS_ENCRYPTION_KEY is not set — delivered credentials are stored in plaintext (and in backups). Generate one with: openssl rand -hex 32",
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
    trustProxyHops: data.TRUST_PROXY_HOPS ?? (data.NODE_ENV === "production" ? 2 : 1),
    cookieSecure: data.COOKIE_SECURE ?? data.NODE_ENV === "production",
  };
}

export const env = loadEnv();
export type Env = typeof env;
