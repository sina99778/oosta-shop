import { cn } from "@/lib/cn";

// Placeholder block shown while content loads (keeps layout stable, no spinner jump).
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-lg bg-border/50 motion-reduce:animate-none", className)}
    />
  );
}
