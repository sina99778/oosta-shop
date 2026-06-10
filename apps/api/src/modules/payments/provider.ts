// Payment provider abstraction. The active provider is selected by PAYMENT_PROVIDER.
//   mock     — simulates an instant successful payment (dev/testing; no network)
//   zarinpal — real Zarinpal v4 request/verify (activated once ZARINPAL_MERCHANT_ID is set)
//
// Flow (gateway-agnostic): createPayment() returns an `authority` (stored on the order)
// and a `redirectUrl` to send the user's browser to. After the user returns to the
// callback URL, verifyPayment() confirms the transaction and yields a `refId`.

import type { PaymentProvider } from "@prisma/client";
import { env } from "../../config/env";
import { getGatewayConfig } from "../../lib/gatewayConfig";
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
};
export type VerifyPaymentArgs = { authority: string; amount: number; currency: string };
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

const zarinpalProvider: PaymentProviderAdapter = {
  name: "ZARINPAL",
  async createPayment({ amount, currency: orderCurrency, description, callbackUrl }) {
    const gw = await getGatewayConfig();
    let finalAmount = amount;
    const targetCurrency = env.ZARINPAL_CURRENCY; // "IRR" or "IRT"

    if (orderCurrency === "IRR" && targetCurrency === "IRT") {
      finalAmount = amount / 10;
    } else if (orderCurrency === "IRT" && targetCurrency === "IRR") {
      finalAmount = amount * 10;
    }

    const response = await fetch(`${zarinpalBase(gw.zarinpalSandbox)}/pg/v4/payment/request.json`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        merchant_id: gw.zarinpalMerchantId,
        amount: Math.round(finalAmount),
        currency: targetCurrency,
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
      redirectUrl: `${zarinpalBase(gw.zarinpalSandbox)}/pg/StartPay/${authority}`,
    };
  },
  async verifyPayment({ authority, amount, currency: orderCurrency }) {
    const gw = await getGatewayConfig();
    let finalAmount = amount;
    const targetCurrency = env.ZARINPAL_CURRENCY; // "IRR" or "IRT"

    if (orderCurrency === "IRR" && targetCurrency === "IRT") {
      finalAmount = amount / 10;
    } else if (orderCurrency === "IRT" && targetCurrency === "IRR") {
      finalAmount = amount * 10;
    }

    const response = await fetch(`${zarinpalBase(gw.zarinpalSandbox)}/pg/v4/payment/verify.json`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        merchant_id: gw.zarinpalMerchantId,
        amount: Math.round(finalAmount),
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

export async function getPaymentProvider(): Promise<PaymentProviderAdapter> {
  const gw = await getGatewayConfig();
  return gw.provider === "zarinpal" ? zarinpalProvider : mockProvider;
}
