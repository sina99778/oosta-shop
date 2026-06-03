// Minimal, dependency-free, XSS-safe Markdown renderer. Supports headings (#, ##),
// unordered lists (- / *), bold (**x**), links ([t](url)), images (![alt](url)),
// and video embeds (`!video <url>` — YouTube / Aparat / .mp4). All text is rendered
// as React nodes; only http(s) URLs are accepted, so no HTML injection is possible.

import type { ReactNode } from "react";

const safe = (url: string) => /^https?:\/\//i.test(url) || url.startsWith("/");

function inline(text: string, keyPrefix: string): ReactNode[] {
  // Split on **bold**, [link](url), ![image](url)
  return text.split(/(!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*)/g).map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    const img = part.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (img && safe(img[2])) {
      // eslint-disable-next-line @next/next/no-img-element
      return (
        <img
          key={key}
          src={img[2]}
          alt={img[1]}
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

export function Markdown({ text, className }: { text: string; className?: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let list: string[] = [];

  const flushList = () => {
    if (list.length === 0) return;
    const items = [...list];
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="my-2 list-disc space-y-1 ps-5">
        {items.map((it, i) => (
          <li key={i}>{inline(it, `li-${blocks.length}-${i}`)}</li>
        ))}
      </ul>,
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
    if (/^\s*[-*]\s+/.test(raw)) {
      list.push(raw.replace(/^\s*[-*]\s+/, ""));
      return;
    }
    flushList();
    if (line.startsWith("## ")) {
      blocks.push(
        <h4 key={`h4-${idx}`} className="mt-4 mb-1 text-lg font-semibold">
          {inline(line.slice(3), `h4-${idx}`)}
        </h4>,
      );
    } else if (line.startsWith("# ")) {
      blocks.push(
        <h3 key={`h3-${idx}`} className="mt-4 mb-1 text-xl font-bold">
          {inline(line.slice(2), `h3-${idx}`)}
        </h3>,
      );
    } else if (line === "") {
      // spacing handled by block margins
    } else {
      blocks.push(
        <p key={`p-${idx}`} className="my-2 leading-relaxed">
          {inline(line, `p-${idx}`)}
        </p>,
      );
    }
  });
  flushList();

  return <div className={className}>{blocks}</div>;
}
