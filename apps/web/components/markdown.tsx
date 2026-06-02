// Minimal, dependency-free, XSS-safe Markdown renderer. Supports headings (#, ##),
// unordered lists (- / *), bold (**x**), and paragraphs with line breaks. All text
// is rendered as React text nodes, so no HTML injection is possible.

import type { ReactNode } from "react";

function inline(text: string, keyPrefix: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>
      ) : (
        part
      ),
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
    const line = raw.trimEnd();
    if (/^\s*[-*]\s+/.test(line)) {
      list.push(line.replace(/^\s*[-*]\s+/, ""));
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
    } else if (line.trim() === "") {
      // paragraph break — ignore (spacing handled by block margins)
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
