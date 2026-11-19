import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PRIVATE_PAGE_METADATA } from "@/lib/page-metadata";

// Account-only pages: never indexed and no canonical inherited from the home page.
export const metadata: Metadata = PRIVATE_PAGE_METADATA;

export default function PrivateSegmentLayout({ children }: { children: ReactNode }) {
  return children;
}
