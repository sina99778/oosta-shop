"use client";

import { useState } from "react";
import { useApi } from "@/lib/use-api";
import { api, ApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { analyzeSeo, type SeoCheckStatus, type SeoInput } from "@/lib/seo-analyzer";
import type { Locale } from "@/lib/i18n";
import type { Dictionary } from "@/app/[locale]/dictionaries";

type GenResult = {
  metaTitle: string;
  metaDescription: string;
  shortDescription: string;
  keywords: string[];
};

export type SeoAssistantValues = SeoInput & { category: string; type: string };

const dotClass: Record<SeoCheckStatus, string> = {
  good: "bg-success",
  warn: "bg-amber-400",
  bad: "bg-danger",
  muted: "bg-muted/40",
};

export function SeoAssistant({
  locale,
  dict,
  token,
  values,
  onApply,
}: {
  locale: Locale;
  dict: Dictionary;
  token: string | undefined;
  values: SeoAssistantValues;
  onApply: (r: { metaTitle: string; metaDescription: string; shortDescription: string }) => void;
}) {
  const t = dict.admin.seoAssistant;
  const checkLabels = t.checks as Record<string, string>;
  const [keyword, setKeyword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [applied, setApplied] = useState(false);

  const ai = useApi<{ enabled: boolean }>(token ? "/admin/ai/status" : null, token ?? undefined);
  const { score, checks } = analyzeSeo(values, keyword);

  const scoreClass = score >= 80 ? "text-success" : score >= 50 ? "text-amber-400" : "text-danger";

  async function generate() {
    if (!token) return;
    setBusy(true);
    setErr(null);
    setApplied(false);
    try {
      const res = await api.post<GenResult>(
        "/admin/seo/generate",
        {
          name: values.name,
          category: values.category || undefined,
          type: values.type || undefined,
          description: values.description || undefined,
          locale,
          focusKeyword: keyword.trim() || undefined,
        },
        token,
      );
      onApply({
        metaTitle: res.metaTitle,
        metaDescription: res.metaDescription,
        shortDescription: res.shortDescription,
      });
      setKeywords(res.keywords ?? []);
      setApplied(true);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : dict.common.somethingWrong);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-4">
        <div
          className={cn("grid size-20 shrink-0 place-items-center rounded-full", scoreClass)}
          style={{
            background: `conic-gradient(currentColor ${score * 3.6}deg, color-mix(in oklab, currentColor 12%, transparent) 0)`,
          }}
        >
          <div className="grid size-16 place-items-center rounded-full bg-card">
            <span className="text-xl font-bold text-foreground">{score}</span>
          </div>
        </div>
        <div>
          <h2 className="font-semibold">{t.title}</h2>
          <p className="text-sm text-muted">{t.score}</p>
        </div>
      </div>

      <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
        {checks.map((c) => (
          <div key={c.id} className="flex items-center gap-2 text-sm">
            <span className={cn("size-2 shrink-0 rounded-full", dotClass[c.status])} />
            <span className={c.status === "muted" ? "text-muted" : ""}>{checkLabels[c.id]}</span>
            {c.info && <span className="ms-auto font-mono text-xs text-muted">{c.info}</span>}
          </div>
        ))}
      </div>

      <div className="border-t border-border pt-3">
        <label className="mb-1 block text-sm text-muted">{t.focusKeyword}</label>
        <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} />
      </div>

      {ai.data?.enabled ? (
        <div className="space-y-2">
          <Button type="button" onClick={generate} disabled={busy || !values.name.trim()}>
            {busy ? (
              <>
                <Spinner /> {t.generating}
              </>
            ) : (
              <>✨ {t.generate}</>
            )}
          </Button>
          {applied && <p className="text-sm text-success">{t.applied}</p>}
          {err && <p className="text-sm text-danger">{err}</p>}
          {keywords.length > 0 && (
            <div>
              <p className="mb-1 text-sm text-muted">{t.keywords}</p>
              <div className="flex flex-wrap gap-1.5">
                {keywords.map((k) => (
                  <span
                    key={k}
                    className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary"
                  >
                    {k}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted">{t.aiDisabled}</p>
      )}
    </Card>
  );
}
