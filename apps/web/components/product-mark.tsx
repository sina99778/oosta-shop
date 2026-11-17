import { cn } from "@/lib/cn";
import type { ProductType } from "@/lib/types";
export function ProductMark({ type, className }: { type: ProductType; className?: string }) {
  return (
    <span className={cn("oosta-product-mark", className)} data-kind={type} aria-hidden="true">
      <svg
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {type === "GIFTCARD" ? (
          <path d="M3 9h18v4H3zM5 13v8h14v-8M12 9v12M12 9H8a2.5 2.5 0 1 1 2.3-3.5L12 9Zm0 0h4a2.5 2.5 0 1 0-2.3-3.5L12 9Z" />
        ) : type === "LICENSE" ? (
          <path d="M15 14a5 5 0 1 0-4.5-7.2L3 14.3V18h4v-3h3l2-2a5 5 0 0 0 3 1ZM16 8h.01" />
        ) : (
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" />
        )}
      </svg>
    </span>
  );
}
