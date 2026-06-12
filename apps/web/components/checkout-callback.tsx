"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { Container } from "@/components/ui/container";
import { Spinner } from "@/components/ui/spinner";
import type { Locale } from "@/lib/i18n";
import type { Dictionary } from "@/app/[locale]/dictionaries";

export function CheckoutCallback({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [message, setMessage] = useState(dict.checkout.verifying);
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const authority = searchParams.get("Authority");
    const status = searchParams.get("Status");
    if (!authority || !status) {
      queueMicrotask(() => setMessage(dict.checkout.missingParams));
      return;
    }

    api
      .post<{ status: string }>("/payments/verify", { authority, status })
      .then((res) => {
        router.replace(`/${locale}/checkout/${res.status === "paid" ? "success" : "cancel"}`);
      })
      .catch(() => {
        router.replace(`/${locale}/checkout/cancel`);
      });
  }, [searchParams, router, locale, dict]);

  return (
    <Container className="py-24 text-center">
      <Spinner className="size-6" />
      <p className="mt-4 text-muted">{message}</p>
    </Container>
  );
}
