"use client";

import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

export default function StoreError({ reset }: { reset: () => void }) {
  const { locale } = useParams();
  return (
    <Container className="space-y-4 py-20 text-center">
      <p role="alert">
        {locale === "fa"
          ? "ارتباط با فروشگاه برقرار نشد. لطفاً دوباره تلاش کنید."
          : "The store is temporarily unavailable. Please try again."}
      </p>
      <Button onClick={reset}>{locale === "fa" ? "تلاش دوباره" : "Try again"}</Button>
    </Container>
  );
}
