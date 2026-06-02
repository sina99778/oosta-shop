// Deterministic SEO analyzer — pure, dependency-free, always correct.
// Powers the "SEO assistant" score + checklist (Yoast/RankMath style).

export type SeoCheckStatus = "good" | "warn" | "bad" | "muted";
export type SeoCheck = { id: string; status: SeoCheckStatus; info: string };

export type SeoInput = {
  name: string;
  slug: string;
  shortDescription: string;
  description: string;
  metaTitle: string;
  metaDescription: string;
  hasImage: boolean;
  planCount: number;
  specCount: number;
};

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function analyzeSeo(
  v: SeoInput,
  focusKeyword: string,
): { score: number; checks: SeoCheck[] } {
  const checks: SeoCheck[] = [];
  const add = (id: string, status: SeoCheckStatus, info = "") => checks.push({ id, status, info });

  const title = (v.metaTitle || v.name).trim();
  const desc = (v.metaDescription || v.shortDescription).trim();
  const content = v.description.trim();
  const kw = focusKeyword.trim().toLowerCase();

  const tl = title.length;
  add("title", !title ? "bad" : tl >= 30 && tl <= 60 ? "good" : "warn", `${tl}`);

  const dl = desc.length;
  add("metaDesc", !desc ? "bad" : dl >= 120 && dl <= 160 ? "good" : "warn", `${dl}`);

  add("shortDesc", v.shortDescription.trim() ? "good" : "warn");

  const cl = content.length;
  add("content", cl >= 300 ? "good" : cl >= 120 ? "warn" : "bad", `${cl}`);

  add("image", v.hasImage ? "good" : "bad");

  const slugOk = SLUG_RE.test(v.slug) && v.slug.length <= 60;
  add("slug", !v.slug ? "bad" : slugOk ? "good" : "warn");

  add("plans", v.planCount >= 1 ? "good" : "bad");
  add("specs", v.specCount >= 1 ? "good" : "warn");

  if (!kw) {
    add("keyword", "muted");
  } else {
    const hits = [
      title.toLowerCase().includes(kw),
      desc.toLowerCase().includes(kw),
      content.toLowerCase().includes(kw),
    ].filter(Boolean).length;
    add("keyword", hits >= 2 ? "good" : hits === 1 ? "warn" : "bad", `${hits}/3`);
  }

  const weight: Record<SeoCheckStatus, number> = { good: 1, warn: 0.5, bad: 0, muted: 0 };
  const counted = checks.filter((c) => c.status !== "muted");
  const score = counted.length
    ? Math.round((counted.reduce((s, c) => s + weight[c.status], 0) / counted.length) * 100)
    : 0;

  return { score, checks };
}
