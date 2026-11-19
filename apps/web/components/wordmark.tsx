import Image from "next/image";
import { cn } from "@/lib/cn";
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("oosta-wordmark", className)} dir="rtl">
      <Image src="/brand/oosta-mark-v1-96.webp" width={48} height={48} alt="" unoptimized />
      <span>
        اوستا<span className="oosta-ai-label">ای‌آی</span>
      </span>
    </span>
  );
}
