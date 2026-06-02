// Google Gemini client for the AI SEO assistant. Uses structured JSON output
// (responseSchema) so the model can only return well-formed, parseable metadata —
// keeping the assistant reliable. Disabled unless GEMINI_API_KEY is set.

import { env } from "../config/env";
import { AppError } from "../utils/httpError";

export type SeoGenInput = {
  name: string;
  category?: string;
  type?: string;
  description?: string;
  locale?: string;
  focusKeyword?: string;
};

export type SeoGenResult = {
  metaTitle: string;
  metaDescription: string;
  shortDescription: string;
  keywords: string[];
};

export function isAiEnabled(): boolean {
  return Boolean(env.GEMINI_API_KEY);
}

export async function generateSeo(input: SeoGenInput): Promise<SeoGenResult> {
  if (!env.GEMINI_API_KEY) {
    throw new AppError(400, "AI_NOT_CONFIGURED", "AI is not configured (set GEMINI_API_KEY)");
  }
  const lang = input.locale === "fa" ? "Persian (Farsi)" : "English";
  const prompt = [
    "You are an expert e-commerce SEO copywriter for a digital products store.",
    `Write SEO metadata for the following product, entirely in ${lang}.`,
    `Product name: ${input.name}`,
    input.category ? `Category: ${input.category}` : "",
    input.type ? `Product type: ${input.type}` : "",
    input.description ? `Description: ${input.description.slice(0, 1500)}` : "",
    input.focusKeyword
      ? `Focus keyword (use it naturally in the title and description): ${input.focusKeyword}`
      : "",
    "",
    "Rules:",
    "- metaTitle: compelling, at most 60 characters, include the product name.",
    "- metaDescription: persuasive, 140-160 characters, with a clear call to action.",
    "- shortDescription: one punchy sentence, at most 120 characters.",
    "- keywords: 5-8 relevant search keywords.",
    `- Everything MUST be written in ${lang}.`,
  ]
    .filter(Boolean)
    .join("\n");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              metaTitle: { type: "string" },
              metaDescription: { type: "string" },
              shortDescription: { type: "string" },
              keywords: { type: "array", items: { type: "string" } },
            },
            required: ["metaTitle", "metaDescription", "shortDescription", "keywords"],
          },
        },
      }),
    });
  } catch (error) {
    throw new AppError(502, "AI_NETWORK", `Could not reach Gemini: ${String(error)}`);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new AppError(
      502,
      "AI_ERROR",
      `Gemini request failed (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`,
    );
  }

  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new AppError(502, "AI_EMPTY", "AI returned no content");

  let parsed: Partial<SeoGenResult>;
  try {
    parsed = JSON.parse(text) as Partial<SeoGenResult>;
  } catch {
    throw new AppError(502, "AI_PARSE", "AI returned malformed JSON");
  }

  return {
    metaTitle: String(parsed.metaTitle ?? "").slice(0, 70),
    metaDescription: String(parsed.metaDescription ?? "").slice(0, 200),
    shortDescription: String(parsed.shortDescription ?? "").slice(0, 200),
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords.map(String).slice(0, 12) : [],
  };
}
