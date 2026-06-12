/* eslint-disable @next/next/no-img-element */
// Minimal, dependency-free, XSS-safe Markdown renderer. Supports headings
// (# … ####), unordered (- / *) and ordered (1.) lists, blockquotes (>),
// horizontal rules (---), bold (**x**), italic (*x*), inline code (`x`),
// links ([t](url)), images (![alt](url)), and video embeds (`!video <url>` —
// YouTube / Aparat / .mp4). All text is rendered as React nodes; only
// http(s)/root-relative URLs are accepted, so no HTML injection is possible.

import type { ReactNode } from "react";

const safe = (url: string) => /^https?:\/\//i.test(url) || url.startsWith("/");

const INLINE_SPLIT =
  /(!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g;

function inline(text: string, keyPrefix: string): ReactNode[] {
  // Split on ![image](url), [link](url), **bold**, *italic*, `code`
  return text.split(INLINE_SPLIT).map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code key={key} className="rounded bg-surface px-1.5 py-0.5 font-mono text-[0.9em]">
          {part.slice(1, -1)}
        </code>
      );
    }
    const img = part.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (img && safe(img[2])) {
      return (
        <img
          key={key}
          src={img[2]}
          alt={img[1]}
          loading="lazy"
          decoding="async"
          className="my-3 inline-block max-h-[28rem] rounded-xl border border-border"
        />
      );
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link && safe(link[2])) {
      return (
        <a
          key={key}
          href={link[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          {link[1]}
        </a>
      );
    }
    return part;
  });
}

function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}
function aparatHash(url: string): string | null {
  const m = url.match(/aparat\.com\/v\/([A-Za-z0-9]+)/);
  return m ? m[1] : null;
}

function videoEmbed(url: string, key: string): ReactNode {
  if (!safe(url)) return null;
  const yt = youtubeId(url);
  const ap = aparatHash(url);
  if (yt || ap) {
    const src = yt
      ? `https://www.youtube.com/embed/${yt}`
      : `https://www.aparat.com/video/video/embed/videohash/${ap}/vt/frame`;
    return (
      <div key={key} className="my-4 aspect-video overflow-hidden rounded-xl border border-border">
        <iframe
          src={src}
          title="video"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="h-full w-full"
        />
      </div>
    );
  }
  if (/\.(mp4|webm|ogg)(\?.*)?$/i.test(url)) {
    return (
      <video key={key} controls className="my-4 w-full rounded-xl border border-border">
        <source src={url} />
      </video>
    );
  }
  return (
    <a
      key={key}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary hover:underline"
    >
      {url}
    </a>
  );
}

// Longest prefix first so "### " is not swallowed by "## ".
const HEADINGS: Array<{ prefix: string; cls: string; tag: "h3" | "h4" | "h5" | "h6" }> = [
  { prefix: "#### ", cls: "mt-3 mb-1 text-base font-semibold", tag: "h6" },
  { prefix: "### ", cls: "mt-4 mb-1 text-base font-bold", tag: "h5" },
  { prefix: "## ", cls: "mt-4 mb-1 text-lg font-semibold", tag: "h4" },
  { prefix: "# ", cls: "mt-4 mb-1 text-xl font-bold", tag: "h3" },
];

export function Markdown({ text, className }: { text: string; className?: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  let listType: "ul" | "ol" = "ul";

  const flushList = () => {
    if (list.length === 0) return;
    const items = [...list];
    const Tag = listType;
    blocks.push(
      <Tag
        key={`${listType}-${blocks.length}`}
        className={`my-2 space-y-1 ps-5 ${listType === "ul" ? "list-disc" : "list-decimal"}`}
      >
        {items.map((it, i) => (
          <li key={i}>{inline(it, `li-${blocks.length}-${i}`)}</li>
        ))}
      </Tag>,
    );
    list = [];
  };

  lines.forEach((raw, idx) => {
    const line = raw.trim();

    const video = line.match(/^!video\s+(\S+)$/i);
    if (video) {
      flushList();
      blocks.push(videoEmbed(video[1], `v-${idx}`));
      return;
    }

    // Unordered (- / *) and ordered (1. / 1)) list items accumulate; a type
    // change flushes the previous list.
    if (/^\s*[-*]\s+/.test(raw)) {
      if (listType !== "ul") flushList();
      listType = "ul";
      list.push(raw.replace(/^\s*[-*]\s+/, ""));
      return;
    }
    if (/^\s*\d+[.)]\s+/.test(raw)) {
      if (listType !== "ol") flushList();
      listType = "ol";
      list.push(raw.replace(/^\s*\d+[.)]\s+/, ""));
      return;
    }
    flushList();

    if (/^([-*_])\1{2,}$/.test(line)) {
      blocks.push(<hr key={`hr-${idx}`} className="my-5 border-border" />);
      return;
    }
    if (line.startsWith("> ")) {
      blocks.push(
        <blockquote key={`q-${idx}`} className="my-3 border-s-2 border-primary/60 ps-4 text-muted">
          {inline(line.slice(2), `q-${idx}`)}
        </blockquote>,
      );
      return;
    }
    const heading = HEADINGS.find((h) => line.startsWith(h.prefix));
    if (heading) {
      const Tag = heading.tag;
      blocks.push(
        <Tag key={`h-${idx}`} className={heading.cls}>
          {inline(line.slice(heading.prefix.length), `h-${idx}`)}
        </Tag>,
      );
      return;
    }
    if (line === "") return; // spacing handled by block margins

    blocks.push(
      <p key={`p-${idx}`} className="my-2 leading-relaxed">
        {inline(line, `p-${idx}`)}
      </p>,
    );
  });
  flushList();

  return <div className={className}>{blocks}</div>;
}
