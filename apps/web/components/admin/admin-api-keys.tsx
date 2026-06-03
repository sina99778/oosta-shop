"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";
import { api, ApiError, assetUrl } from "@/lib/api";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { formatDate } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { Dictionary } from "@/app/[locale]/dictionaries";

type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  createdAt: string;
};

export function AdminApiKeys({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const { token } = useAuth();
  const t = dict.admin.apiKeys;
  const [reload, setReload] = useState(0);
  const { data, loading } = useApi<{ keys: ApiKey[] }>(
    token ? `/admin/api-keys?_r=${reload}` : null,
    token ?? undefined,
  );

  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setErr(null);
    setNewKey(null);
    try {
      const res = await api.post<{ key: string }>("/admin/api-keys", { name }, token);
      setNewKey(res.key);
      setName("");
      setReload((r) => r + 1);
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : dict.common.somethingWrong);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (!token) return;
    await api.del(`/admin/api-keys/${id}`, token).catch(() => {});
    setReload((r) => r + 1);
  }

  async function copyKey() {
    if (!newKey) return;
    try {
      await navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  const base = assetUrl("");

  return (
    <Container className="max-w-3xl space-y-6 py-8">
      <div>
        <h1 className="text-2xl font-bold">{t.title}</h1>
        <p className="mt-1 text-sm text-muted">{t.intro}</p>
      </div>

      <Card className="space-y-3">
        <form onSubmit={create} className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1">
            <label className="mb-1 block text-sm text-muted">{t.name}</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="My AI assistant"
            />
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? <Spinner /> : t.create}
          </Button>
        </form>

        {newKey && (
          <div className="rounded-lg border border-success/40 bg-success/10 p-3">
            <p className="mb-2 text-sm font-medium text-success">{t.saveNow}</p>
            <div className="flex items-center gap-2">
              <code
                dir="ltr"
                className="flex-1 overflow-x-auto rounded bg-card px-3 py-2 font-mono text-sm"
              >
                {newKey}
              </code>
              <Button size="sm" variant="outline" onClick={copyKey} type="button">
                {copied ? t.copied : t.copy}
              </Button>
            </div>
          </div>
        )}
        {err && <p className="text-sm text-danger">{err}</p>}

        <p className="text-xs text-muted" dir="ltr">
          {t.usage} <code className="font-mono">{base}</code>
        </p>
      </Card>

      {loading ? (
        <Spinner className="size-6" />
      ) : !data || data.keys.length === 0 ? (
        <p className="text-muted">{t.none}</p>
      ) : (
        <div className="space-y-2">
          {data.keys.map((k) => (
            <Card key={k.id} className="flex items-center justify-between gap-3">
              <div className="text-sm">
                <p className="font-medium">{k.name}</p>
                <p className="font-mono text-xs text-muted" dir="ltr">
                  {k.prefix}
                </p>
                <p className="text-xs text-muted">
                  {t.lastUsed}: {k.lastUsedAt ? formatDate(k.lastUsedAt, locale) : t.never}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => revoke(k.id)}>
                {t.revoke}
              </Button>
            </Card>
          ))}
        </div>
      )}
    </Container>
  );
}
