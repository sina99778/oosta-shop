"use client";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";

export function QueryError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { locale } = useParams();
  return (
    <div className="space-y-3 py-6">
      <p role="alert" className="text-danger">
        {message}
      </p>
      <Button variant="outline" onClick={onRetry}>
        {locale === "fa" ? "تلاش دوباره" : "Try again"}
      </Button>
    </div>
  );
}
