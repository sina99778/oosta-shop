// Payment provider abstraction. The active provider is selected by PAYMENT_PROVIDER.
//   mock     — simulates an instant successful payment (dev/testing; no network)
//   zarinpal — real Zarinpal v4 request/verify (activated once ZARINPAL_MERCHANT_ID is set)
//
// Flow (gateway-agnostic): createPayment() returns an `authority` (stored on the order)
// and a `redirectUrl` to send the user's browser to. After the user returns to the
// callback URL, verifyPayment() confirms the transaction and yields a `refId`.

import type { PaymentProvider } from "@prisma/client";
import { env } from "../../config/env";
import { assertOnlinePaymentAllowed, getGatewayConfig } from "../../lib/gatewayConfig";
import { AppError } from "../../utils/httpError";

export type CreatePaymentInput = {
  orderId: string;
  amount: number;
  currency: string;
  description: string;
  callbackUrl: string;
};
export type CreatePaymentResult = {
  provider: PaymentProvider;
  authority: string;
  redirectUrl: string;
  verificationContext?: Record<string, string | boolean>;
};
export type VerifyPaymentArgs = {
  authority: string;
  amount: number;
  currency: string;
  verificationContext?: unknown;
};
export type VerifyPaymentResult = { success: boolean; refId: string | null };

export interface PaymentProviderAdapter {
  readonly name: PaymentProvider;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  verifyPayment(input: VerifyPaymentArgs): Promise<VerifyPaymentResult>;
}

// --- Mock provider: simulates an instant, successful payment -------------------
const mockProvider: PaymentProviderAdapter = {
  name: "MANUAL",
  async createPayment({ orderId, callbackUrl, currency: _currency }) {
    const authority = `mock_${orderId}`;
    // Point the redirect straight back at the callback with a success status,
    // simulating the user paying on a hosted page.
    const url = new URL(callbackUrl);
    url.searchParams.set("Authority", authority);
    url.searchParams.set("Status", "OK");
    return { provider: "MANUAL", authority, redirectUrl: url.toString() };
  },
  async verifyPayment({ authority, amount: _amount, currency: _currency }) {
    return { success: true, refId: `mockref_${authority}` };
  },
};

// --- Zarinpal provider (real API) ----------------------------------------------
// Merchant id + sandbox come from the runtime gateway config (DB over env), so
// the admin can change them live from the panel / bot / agent.
function zarinpalBase(sandbox: boolean): string {
  return sandbox ? "https://sandbox.zarinpal.com" : "https://payment.zarinpal.com";
}

function sendZarinpal(sandbox: boolean, path: string, body: Record<string, unknown>) {
  return fetch(`${zarinpalBase(sandbox)}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
}

async function zarinpalRequest<T>(
  sandbox: boolean,
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  try {
    const response = await sendZarinpal(sandbox, path, body);
    if (!response.ok) {
      throw new AppError(502, "PAYMENT_GATEWAY_ERROR", `Zarinpal returned HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(502, "PAYMENT_GATEWAY_ERROR", "Zarinpal request failed or timed out");
  }
}

const zarinpalProvider: PaymentProviderAdapter = {
  name: "ZARINPAL",
  async createPayment({ amount, currency: orderCurrency, description, callbackUrl }) {
    const gw = await getGatewayConfig();
    assertOnlinePaymentAllowed(gw);
    if (!["IRR", "IRT"].includes(orderCurrency)) {
      throw new AppError(400, "UNSUPPORTED_CURRENCY", "Unsupported payment currency");
    }
    let finalAmount = amount;
    const targetCurrency = env.ZARINPAL_CURRENCY; // "IRR" or "IRT"

    if (orderCurrency === "IRR" && targetCurrency === "IRT") {
      finalAmount = amount / 10;
    } else if (orderCurrency === "IRT" && targetCurrency === "IRR") {
      finalAmount = amount * 10;
    }

    if (!Number.isSafeInteger(finalAmount) || finalAmount <= 0)
      throw new AppError(
        400,
        "INVALID_PAYMENT_AMOUNT",
        "Payment amount must be a whole positive unit in the gateway currency",
      );
    const json = await zarinpalRequest<{ data?: { code?: number; authority?: string } }>(
      gw.zarinpalSandbox,
      "/pg/v4/payment/request.json",
      {
        merchant_id: gw.zarinpalMerchantId,
        amount: finalAmount,
        currency: targetCurrency,
        description,
        callback_url: callbackUrl,
      },
    );
    const authority = json.data?.authority;
    if (!authority || json.data?.code !== 100) {
      throw new AppError(502, "PAYMENT_INIT_FAILED", "Failed to initialize Zarinpal payment");
    }
    return {
      provider: "ZARINPAL",
      authority,
      redirectUrl: `${zarinpalBase(gw.zarinpalSandbox)}/pg/StartPay/${authority}`,
      verificationContext: {
        merchantId: gw.zarinpalMerchantId,
        sandbox: gw.zarinpalSandbox,
        targetCurrency,
      },
    };
  },
  async verifyPayment({ authority, amount, currency: orderCurrency, verificationContext }) {
    const saved =
      verificationContext && typeof verificationContext === "object"
        ? (verificationContext as Record<string, unknown>)
        : null;
    const hasCompleteSavedContext =
      typeof saved?.merchantId === "string" &&
      typeof saved?.sandbox === "boolean" &&
      (saved?.targetCurrency === "IRR" || saved?.targetCurrency === "IRT");
    const current = hasCompleteSavedContext ? null : await getGatewayConfig();
    const merchantId =
      typeof saved?.merchantId === "string" ? saved.merchantId : current!.zarinpalMerchantId;
    const sandbox = typeof saved?.sandbox === "boolean" ? saved.sandbox : current!.zarinpalSandbox;
    if (env.isProduction && sandbox) {
      throw new AppError(
        409,
        "SANDBOX_DISABLED",
        "Sandbox payments cannot fulfill production orders",
      );
    }
    if (!["IRR", "IRT"].includes(orderCurrency)) {
      throw new AppError(400, "UNSUPPORTED_CURRENCY", "Unsupported payment currency");
    }
    const savedCurrency = saved?.targetCurrency;
    const targetCurrency =
      savedCurrency === "IRR" || savedCurrency === "IRT" ? savedCurrency : env.ZARINPAL_CURRENCY;
    let finalAmount = amount;

    if (orderCurrency === "IRR" && targetCurrency === "IRT") {
      finalAmount = amount / 10;
    } else if (orderCurrency === "IRT" && targetCurrency === "IRR") {
      finalAmount = amount * 10;
    }

    if (!Number.isSafeInteger(finalAmount) || finalAmount <= 0)
      throw new AppError(
        400,
        "INVALID_PAYMENT_AMOUNT",
        "Payment amount must be a whole positive unit in the gateway currency",
      );
    const json = await zarinpalRequest<{ data?: { code?: number; ref_id?: number } }>(
      sandbox,
      "/pg/v4/payment/verify.json",
      {
        merchant_id: merchantId,
        amount: finalAmount,
        authority,
      },
    );
    const code = json.data?.code;
    // 100 = verified now, 101 = already verified
    if (code === 100 || code === 101) {
      return { success: true, refId: json.data?.ref_id ? String(json.data.ref_id) : null };
    }
    return { success: false, refId: null };
  },
};

export async function getPaymentProvider(): Promise<PaymentProviderAdapter> {
  const gw = await getGatewayConfig();
  // Block starting a real online payment through the test gateway in production.
  assertOnlinePaymentAllowed(gw);
  return gw.provider === "zarinpal" ? zarinpalProvider : mockProvider;
}

export async function inquireZarinpalPayment(
  authority: string,
  verificationContext: unknown,
): Promise<"FAILED" | "REVERSED" | "PAID" | "VERIFIED" | "IN_BANK" | "INVALID_AUTHORITY" | null> {
  const saved = verificationContext as Record<string, unknown> | null;
  if (
    typeof saved?.merchantId !== "string" ||
    typeof saved.sandbox !== "boolean" ||
    (env.isProduction && saved.sandbox)
  )
    return null;
  const response = await sendZarinpal(saved.sandbox, "/pg/v4/payment/inquiry.json", {
    merchant_id: saved.merchantId,
    authority,
  });
  if (response.status === 400) {
    const json = (await response.json().catch(() => null)) as {
      errors?: { code?: unknown; authority?: unknown };
    } | null;
    const errors = json?.errors;
    const codes: unknown[] = [errors?.code];
    if (Array.isArray(errors?.authority)) codes.push(...errors.authority);
    return codes.some((code) => code === -54 || code === "-54") ? "INVALID_AUTHORITY" : null;
  }
  if (!response.ok) return null;
  const json = (await response.json()) as { data?: { code?: number; status?: string } } | null;
  if (json?.data?.code !== 100) return null;
  switch (json.data.status) {
    case "FAILED":
    case "REVERSED":
    case "PAID":
    case "VERIFIED":
    case "IN_BANK":
      return json.data.status;
    default:
      return null;
  }
}

// Payment callbacks must use the provider stored on the order. Looking at the
// current runtime setting would let a gateway switch change how an old session
// is verified (most dangerously, Zarinpal -> mock).
export function getPaymentProviderForOrder(
  provider: PaymentProvider | null,
): PaymentProviderAdapter {
  if (provider === "ZARINPAL") return zarinpalProvider;
  if (provider === "MANUAL") {
    if (
      env.isProduction &&
      (!env.ALLOW_MOCK_PAYMENTS_IN_PRODUCTION || env.BLU_STOCK_CHECKOUT_ENABLED)
    ) {
      throw new AppError(409, "MOCK_DISABLED", "Mock payments cannot fulfill production orders");
    }
    return mockProvider;
  }
  throw new AppError(409, "INVALID_PAYMENT_PROVIDER", "Order has no online payment provider");
}
