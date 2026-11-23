"use client";

import { useId, useState } from "react";

const iconProps = {
  width: 17,
  height: 17,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

/** A delivered secret (Figma "Credential Field"): masked until revealed, with copy. */
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
  const labelId = useId();

  async function copyValue() {
    try {
      await navigator.clipboard.writeText(value);
      setJustCopied(true);
      setTimeout(() => setJustCopied(false), 1500);
    } catch {
      /* clipboard unavailable — ignore */
    }
  }

  const button =
    "inline-grid size-11 shrink-0 place-items-center rounded-xl border border-border bg-card text-muted transition-colors hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

  return (
    <div className="grid gap-1.5">
      <p id={labelId} className="text-xs font-semibold text-muted">
        {label}
      </p>
      <div className="flex items-center gap-2">
        <p
          aria-labelledby={labelId}
          className="min-w-0 flex-1 truncate rounded-xl bg-surface px-3.5 py-3 font-mono text-sm"
          dir="ltr"
        >
          {revealed ? value : "•".repeat(Math.min(value.length, 16))}
        </p>
        <button
          type="button"
          className={button}
          aria-label={`${revealed ? hide : reveal} — ${label}`}
          aria-pressed={revealed}
          onClick={() => setRevealed((v) => !v)}
        >
          <svg {...iconProps}>
            {revealed ? (
              <path d="M3 3l18 18 M10.6 6.1A9.8 9.8 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3 3.6 M6.6 6.6A17 17 0 0 0 2.5 12S6 18 12 18a9.6 9.6 0 0 0 4.4-1.1 M9.9 9.9a3 3 0 0 0 4.2 4.2" />
            ) : (
              <>
                <path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
                <circle cx="12" cy="12" r="3" />
              </>
            )}
          </svg>
        </button>
        <button
          type="button"
          className={button}
          aria-label={`${justCopied ? copied : copy} — ${label}`}
          onClick={copyValue}
          data-copied={justCopied || undefined}
        >
          <svg {...iconProps}>
            {justCopied ? (
              <path d="m5 12.5 4.5 4.5L19 7.5" />
            ) : (
              <>
                <rect x="8" y="8" width="12" height="12" rx="2" />
                <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
              </>
            )}
          </svg>
        </button>
        <span role="status" className="sr-only">
          {justCopied ? copied : ""}
        </span>
      </div>
    </div>
  );
}
