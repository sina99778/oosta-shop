"use client";
import { Button } from "@/components/ui/button";
import type { Pagination } from "@/lib/types";
import type { Dictionary } from "@/app/[locale]/dictionaries";

export function PaginationControls({
  pagination,
  onPage,
  labels,
}: {
  pagination: Pagination;
  onPage: (page: number) => void;
  labels: Dictionary["common"];
}) {
  if (pagination.totalPages <= 1) return null;
  return (
    <nav aria-label={labels.page} className="mt-6 flex items-center justify-center gap-3">
      <Button
        size="sm"
        variant="outline"
        disabled={pagination.page <= 1}
        onClick={() => onPage(pagination.page - 1)}
      >
        {labels.previous}
      </Button>
      <span aria-live="polite">
        {labels.page} {pagination.page} / {pagination.totalPages}
      </span>
      <Button
        size="sm"
        variant="outline"
        disabled={pagination.page >= pagination.totalPages}
        onClick={() => onPage(pagination.page + 1)}
      >
        {labels.next}
      </Button>
    </nav>
  );
}
