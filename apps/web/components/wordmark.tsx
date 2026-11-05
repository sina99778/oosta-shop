import Image from "next/image";
import { cn } from "@/lib/cn";
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("oosta-wordmark", className)} dir="rtl">
      <Image src="/brand/oosta-ai.png" width={48} height={48} alt="" />
      <span>
        اوستا<span className="oosta-ai-label">ای‌آی</span>
      </span>
    </span>
  );
}
