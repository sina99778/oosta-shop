"use client";

import { cn } from "@/lib/cn";

// − [n] + control. Buttons are 40px touch targets; value is announced politely.
export function QuantityStepper({
  value,
  min = 1,
  max,
  onChange,
  labels,
  className,
}: {
  value: number;
  min?: number;
  max: number;
  onChange: (value: number) => void;
  labels: { quantity: string; increase: string; decrease: string };
  className?: string;
}) {
  const button =
    "inline-flex size-10 items-center justify-center text-lg transition-colors hover:text-primary disabled:opacity-40 disabled:hover:text-current";
  return (
    <div
      role="group"
      aria-label={labels.quantity}
      className={cn("inline-flex items-center border border-border bg-card", className)}
    >
      <button
        type="button"
        className={button}
        aria-label={labels.decrease}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        −
      </button>
      <span aria-live="polite" className="min-w-8 text-center text-sm font-semibold tabular-nums">
        {value}
      </span>
      <button
        type="button"
        className={button}
        aria-label={labels.increase}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        +
      </button>
    </div>
  );
}
