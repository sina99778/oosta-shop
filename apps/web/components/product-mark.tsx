import { cn } from "@/lib/cn";
import type { ProductType } from "@/lib/types";

export function ProductMark({
  name,
  slug,
  type,
  className,
}: {
  name: string;
  slug: string;
  type: ProductType;
  className?: string;
}) {
  const base = "grid shrink-0 place-items-center overflow-hidden rounded-md border border-white/10";

  if (slug.includes("chatgpt")) {
    return (
      <span className={cn(base, "bg-emerald-500 text-white", className)} aria-hidden>
        <svg
          viewBox="0 0 48 48"
          className="h-[68%] w-[68%]"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.2"
        >
          <path d="M24 8a9 9 0 0 1 15 8v5a9 9 0 0 1-2 17l-4 2a9 9 0 0 1-16 0l-4-2a9 9 0 0 1-2-17v-5a9 9 0 0 1 13-8Z" />
          <path d="m16 16 16 9-16 9V16Zm16 0-16 9 16 9V16Z" />
        </svg>
      </span>
    );
  }

  if (slug.includes("claude")) {
    return (
      <span className={cn(base, "bg-[#e9783d] text-2xl font-black text-black", className)}>AI</span>
    );
  }

  if (slug.includes("windows")) {
    return (
      <span className={cn(base, "bg-[#0678d8]", className)} aria-hidden>
        <span className="grid h-1/2 w-1/2 grid-cols-2 gap-1">
          {[0, 1, 2, 3].map((part) => (
            <i key={part} className="bg-white" />
          ))}
        </span>
      </span>
    );
  }

  if (slug.includes("google-play")) {
    return (
      <span className={cn(base, "bg-[#171717]", className)} aria-hidden>
        <span className="h-0 w-0 border-y-[17px] border-s-[27px] border-y-transparent border-s-[#42d77d]" />
      </span>
    );
  }

  if (slug.includes("gemini")) {
    return (
      <span className={cn(base, "bg-[#172033] text-3xl text-blue-400", className)} aria-hidden>
        ✦
      </span>
    );
  }

  const fallback = type === "ACCOUNT" ? "AI" : type === "LICENSE" ? "KEY" : "GIFT";
  return (
    <span className={cn(base, "bg-primary text-xs font-black text-white", className)} aria-hidden>
      {fallback || name.charAt(0)}
    </span>
  );
}
