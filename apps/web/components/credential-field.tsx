"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CredentialField({
  label,
  value,
  reveal,
  hide,
  copy,
  copied,
}: {
  label: string;
  value: string;
  reveal: string;
  hide: string;
  copy: string;
  copied: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const [justCopied, setJustCopied] = useState(false);

  async function copyValue() {
    try {
      await navigator.clipboard.writeText(value);
      setJustCopied(true);
      setTimeout(() => setJustCopied(false), 1500);
    } catch {
      /* clipboard unavailable — ignore */
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2">
      <div className="min-w-0">
        <p className="text-xs text-muted">{label}</p>
        <p className="truncate font-mono text-sm" dir="ltr">
          {revealed ? value : "•".repeat(Math.min(value.length, 16))}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button type="button" variant="ghost" size="sm" onClick={() => setRevealed((v) => !v)}>
          {revealed ? hide : reveal}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={copyValue}>
          {justCopied ? copied : copy}
        </Button>
      </div>
    </div>
  );
}
