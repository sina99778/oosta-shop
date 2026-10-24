"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import { ReturnedEnvelope } from "@/components/returned-envelope";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ReturnedEnvelope
      kind="error"
      action={(label) => (
        <button
          type="button"
          onClick={() => unstable_retry()}
          className="inline-flex h-11 items-center rounded-[10px] bg-primary px-5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-hover"
        >
          {label}
        </button>
      )}
    />
  );
}
