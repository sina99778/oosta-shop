import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Tone = "default" | "success" | "danger" | "muted";

const tones: Record<Tone, string> = {
  default: "border border-border bg-surface text-foreground",
  success: "bg-success/15 text-success",
  danger: "bg-danger/15 text-danger",
  muted: "bg-surface text-muted",
};

export function Badge({
  tone = "default",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
