// Runtime model selection for the Telegram AI agent. The admin picks a text /
// image model from the bot's "🧠 مدل‌ها" menu (or per-request via "با کلود …");
// the choice is persisted in SiteSetting (keys below) so it survives restarts.
// The OPENROUTER_* env vars remain the defaults when nothing is stored.

import { prisma } from "./prisma";
import { env } from "../config/env";

export const TEXT_MODEL_KEY = "agent.textModel";
export const IMAGE_MODEL_KEY = "agent.imageModel";

export type ModelOption = { slug: string; label: string; price: string };

// Curated catalog shown in the bot (slugs verified on openrouter.ai, June 2026).
export const TEXT_MODELS: ModelOption[] = [
  { slug: "openai/gpt-5.5", label: "GPT-5.5", price: "$5/$30 per M" },
  { slug: "openai/gpt-5.4", label: "GPT-5.4", price: "$2.50/$15 per M" },
  { slug: "anthropic/claude-opus-4.8", label: "Claude Opus 4.8", price: "$5/$25 per M" },
  { slug: "anthropic/claude-sonnet-4.6", label: "Claude Sonnet 4.6", price: "$3/$15 per M" },
  { slug: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro", price: "$2/$12 per M" },
  { slug: "google/gemini-3.5-flash", label: "Gemini 3.5 Flash", price: "$1.50/$9 per M" },
];

export const IMAGE_MODELS: ModelOption[] = [
  {
    slug: "google/gemini-3-pro-image-preview",
    label: "Nano Banana Pro",
    price: "~$0.13/img (2K incl.)",
  },
  {
    slug: "google/gemini-3.1-flash-image-preview",
    label: "Nano Banana 2",
    price: "~$0.07/img",
  },
  { slug: "openai/gpt-5.4-image-2", label: "GPT Image 2", price: "~$0.05/img (best text)" },
  { slug: "google/gemini-2.5-flash-image", label: "Nano Banana 1", price: "~$0.04/img" },
];

const SLUG_RE = /^[\w.-]+\/[\w.:-]+$/;

function assertSlug(slug: string): void {
  if (!SLUG_RE.test(slug)) throw new Error(`Invalid model slug: ${slug}`);
}

// Effective models: stored choice -> env default.
export async function getAgentModels(): Promise<{ text: string; image: string }> {
  const rows = await prisma.siteSetting.findMany({
    where: { key: { in: [TEXT_MODEL_KEY, IMAGE_MODEL_KEY] } },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    text: map.get(TEXT_MODEL_KEY) ?? env.OPENROUTER_MODEL,
    image: map.get(IMAGE_MODEL_KEY) ?? env.OPENROUTER_IMAGE_MODEL,
  };
}

async function setPref(key: string, slug: string): Promise<void> {
  assertSlug(slug);
  await prisma.siteSetting.upsert({
    where: { key },
    create: { key, value: slug },
    update: { value: slug },
  });
}

export const setAgentTextModel = (slug: string) => setPref(TEXT_MODEL_KEY, slug);
export const setAgentImageModel = (slug: string) => setPref(IMAGE_MODEL_KEY, slug);

// Per-request override: "با کلود …" / "with gpt …" picks a model for that single
// instruction without changing the stored default. (JS \b is ASCII-only, so the
// Persian patterns anchor on whitespace/start instead.)
const HINTS: Array<{ re: RegExp; text?: string; image?: string }> = [
  { re: /(^|\s)با\s+اوپوس|\bwith\s+opus\b/i, text: "anthropic/claude-opus-4.8" },
  { re: /(^|\s)با\s+کلود|\bwith\s+claude\b/i, text: "anthropic/claude-sonnet-4.6" },
  {
    re: /(^|\s)با\s+(چت\s*)?جی[\s‌]?پی[\s‌]?تی|\bwith\s+(chat)?gpt\b/i,
    text: "openai/gpt-5.5",
    image: "openai/gpt-5.4-image-2",
  },
  {
    re: /(^|\s)با\s+(جمنای|جیمینای|جیمینی)|\bwith\s+gemini\b/i,
    text: "google/gemini-3.1-pro-preview",
    image: "google/gemini-3-pro-image-preview",
  },
  {
    re: /(^|\s)با\s+نانو\s*بنانا|\bwith\s+nano\s*banana\b/i,
    image: "google/gemini-3-pro-image-preview",
  },
];

export function parseModelHints(instruction: string): { text?: string; image?: string } {
  for (const hint of HINTS) {
    if (hint.re.test(instruction)) return { text: hint.text, image: hint.image };
  }
  return {};
}
