"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { Locale } from "@/lib/i18n";
import type { Dictionary } from "@/app/[locale]/dictionaries";

export function CheckoutCallback({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<"verifying" | "unknown" | "missing">("verifying");
  const authority = searchParams.get("Authority");
  const status = searchParams.get("Status");
  useEffect(() => {
    if (!authority || !status) {
      queueMicrotask(() => setState("missing"));
      return;
    }
    let active = true;
    queueMicrotask(() => {
      if (active) setState("verifying");
    });
    api
      .post<{ status: "paid" | "failed" | "pending"; orderId?: string }>("/payments/verify", {
        authority,
        status,
      })
      .then((result) => {
        if (!active) return;
        if (result.status === "paid" && result.orderId)
          router.replace(`/${locale}/dashboard/orders/${encodeURIComponent(result.orderId)}`);
        else if (result.status === "failed") router.replace(`/${locale}/checkout/cancel`);
        else setState("unknown");
      })
      .catch(() => {
        if (active) setState("unknown");
      });
    return () => {
      active = false;
    };
  }, [authority, status, attempt, locale, router]);
  return (
    <Container className="space-y-4 py-24 text-center">
      {state === "verifying" && <Spinner className="size-6" />}
      <p role="status">
        {state === "verifying"
          ? dict.checkout.verifying
          : state === "missing"
            ? dict.checkout.missingParams
            : locale === "fa"
              ? "نتیجه پرداخت هنوز مشخص نیست. پیش از پرداخت دوباره، وضعیت سفارش را بررسی کنید."
              : "The payment result is not confirmed yet. Check your order before paying again."}
      </p>
      {state === "unknown" && (
        <Button onClick={() => setAttempt((n) => n + 1)}>
          {locale === "fa" ? "بررسی دوباره" : "Check again"}
        </Button>
      )}
      {state !== "verifying" && (
        <Link className="block text-primary underline" href={`/${locale}/dashboard`}>
          {dict.checkout.viewOrders}
        </Link>
      )}
    </Container>
  );
}
