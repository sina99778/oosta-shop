// Payment provider abstraction. The active provider is selected by PAYMENT_PROVIDER.
//   mock     — simulates an instant successful payment (dev/testing; no network)
//   zarinpal — real Zarinpal v4 request/verify (activated once ZARINPAL_MERCHANT_ID is set)
//
// Flow (gateway-agnostic): createPayment() returns an `authority` (stored on the order)
// and a `redirectUrl` to send the user's browser to. After the user returns to the
// callback URL, verifyPayment() confirms the transaction and yields a `refId`.

import type { PaymentProvider } from "@prisma/client";
import { env } from "../../config/env";
import { AppError } from "../../utils/httpError";

export type CreatePaymentInput = {
  orderId: string;
  amount: number;
  description: string;
  callbackUrl: string;
};
export type CreatePaymentResult = {
  provider: PaymentProvider;
  authority: string;
  redirectUrl: string;
};
export type VerifyPaymentArgs = { authority: string; amount: number };
export type VerifyPaymentResult = { success: boolean; refId: string | null };

export interface PaymentProviderAdapter {
  readonly name: PaymentProvider;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  verifyPayment(input: VerifyPaymentArgs): Promise<VerifyPaymentResult>;
}

// --- Mock provider: simulates an instant, successful payment -------------------
const mockProvider: PaymentProviderAdapter = {
  name: "MANUAL",
  async createPayment({ orderId, callbackUrl }) {
    const authority = `mock_${orderId}`;
    // Point the redirect straight back at the callback with a success status,
    // simulating the user paying on a hosted page.
    const url = new URL(callbackUrl);
    url.searchParams.set("Authority", authority);
    url.searchParams.set("Status", "OK");
    return { provider: "MANUAL", authority, redirectUrl: url.toString() };
  },
  async verifyPayment({ authority }) {
    return { success: true, refId: `mockref_${authority}` };
  },
};

// --- Zarinpal provider (real API) ----------------------------------------------
function zarinpalBase(): string {
  return env.ZARINPAL_SANDBOX ? "https://sandbox.zarinpal.com" : "https://payment.zarinpal.com";
}

const zarinpalProvider: PaymentProviderAdapter = {
  name: "ZARINPAL",
  async createPayment({ amount, description, callbackUrl }) {
    const response = await fetch(`${zarinpalBase()}/pg/v4/payment/request.json`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        merchant_id: env.ZARINPAL_MERCHANT_ID,
        amount: Math.round(amount),
        currency: env.ZARINPAL_CURRENCY,
        description,
        callback_url: callbackUrl,
      }),
    });
    const json = (await response.json()) as { data?: { code?: number; authority?: string } };
    const authority = json.data?.authority;
    if (!authority || json.data?.code !== 100) {
      throw new AppError(502, "PAYMENT_INIT_FAILED", "Failed to initialize Zarinpal payment");
    }
    return {
      provider: "ZARINPAL",
      authority,
      redirectUrl: `${zarinpalBase()}/pg/StartPay/${authority}`,
    };
  },
  async verifyPayment({ authority, amount }) {
    const response = await fetch(`${zarinpalBase()}/pg/v4/payment/verify.json`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        merchant_id: env.ZARINPAL_MERCHANT_ID,
        amount: Math.round(amount),
        authority,
      }),
    });
    const json = (await response.json()) as { data?: { code?: number; ref_id?: number } };
    const code = json.data?.code;
    // 100 = verified now, 101 = already verified
    if (code === 100 || code === 101) {
      return { success: true, refId: json.data?.ref_id ? String(json.data.ref_id) : null };
    }
    return { success: false, refId: null };
  },
};

export function getPaymentProvider(): PaymentProviderAdapter {
  return env.PAYMENT_PROVIDER === "zarinpal" ? zarinpalProvider : mockProvider;
}
