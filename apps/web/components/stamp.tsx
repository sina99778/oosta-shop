// "Digital Post" brand graphics: every product is drawn as a perforated postage
// stamp, deliveries are franked with a postmark, and the logo is a tiny stamp.
// Pure SVG/CSS (see .stamp / .stamp-face in globals.css) — no image assets, and
// server-renderable. Product art is our own line drawings, not brand logos.

import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { ProductType } from "@/lib/types";

type ArtKind = "knot" | "burst" | "play" | "grid" | "spark" | "person" | "key" | "gift";

type StampStyle = { art: ArtKind; tile: string; ink: string };

// Picks the engraving + colours for a product from its slug, falling back to its type.
export function stampStyleFor(slug: string, type: ProductType): StampStyle {
  const s = slug.toLowerCase();
  if (/chatgpt|openai|gpt/.test(s)) return { art: "knot", tile: "#3f6b57", ink: "#ffffff" };
  if (/claude|anthropic/.test(s)) return { art: "burst", tile: "#d9a24a", ink: "#2a1d0a" };
  if (/google-play|play|app-store|itunes|steam/.test(s)) {
    return { art: "play", tile: "#1b2433", ink: "#f3d79a" };
  }
  if (/windows|office|microsoft/.test(s)) return { art: "grid", tile: "#34548a", ink: "#ffffff" };
  if (/gemini|midjourney|perplexity|grok/.test(s)) {
    return { art: "spark", tile: "#4b3f7a", ink: "#ffffff" };
  }
  if (type === "LICENSE") return { art: "key", tile: "#34548a", ink: "#ffffff" };
  if (type === "GIFTCARD") return { art: "gift", tile: "#1b2433", ink: "#f3d79a" };
  return { art: "person", tile: "#3f6b57", ink: "#ffffff" };
}

export function StampArt({ kind, className }: { kind: ArtKind; className?: string }) {
  const common = {
    viewBox: "0 0 48 48",
    className,
    "aria-hidden": true,
  } as const;
  switch (kind) {
    case "knot":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="2">
          <ellipse cx="24" cy="24" rx="6.5" ry="17" />
          <ellipse cx="24" cy="24" rx="6.5" ry="17" transform="rotate(60 24 24)" />
          <ellipse cx="24" cy="24" rx="6.5" ry="17" transform="rotate(120 24 24)" />
        </svg>
      );
    case "burst":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <path d="M24 6v36M6 24h36M11.3 11.3l25.4 25.4M36.7 11.3L11.3 36.7" />
          <circle cx="24" cy="24" r="5" fill="currentColor" />
        </svg>
      );
    case "play":
      return (
        <svg {...common} fill="currentColor">
          <path d="M16 11 L38 24 L16 37 Z" />
        </svg>
      );
    case "grid":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="2.6">
          <rect x="9" y="9" width="13" height="13" />
          <rect x="26" y="9" width="13" height="13" />
          <rect x="9" y="26" width="13" height="13" />
          <rect x="26" y="26" width="13" height="13" />
        </svg>
      );
    case "spark":
      return (
        <svg {...common} fill="currentColor">
          <path d="M24 5c1.6 9.8 9.2 17.4 19 19-9.8 1.6-17.4 9.2-19 19-1.6-9.8-9.2-17.4-19-19 9.8-1.6 17.4-9.2 19-19z" />
        </svg>
      );
    case "key":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
          <circle cx="16" cy="30" r="8" />
          <path d="M22 24L39 7M33 13l5 5M28 18l4 4" />
        </svg>
      );
    case "gift":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round">
          <rect x="8" y="18" width="32" height="22" />
          <path d="M8 26h32M24 18v22M24 18c-3-7-11-7-10-2s10 2 10 2zm0 0c3-7 11-7 10-2s-10 2-10 2z" />
        </svg>
      );
    default:
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="2.4">
          <circle cx="24" cy="17" r="7" />
          <path d="M10 41c0-8 6-12 14-12s14 4 14 12" />
        </svg>
      );
  }
}

const SIZES = {
  sm: { box: "w-[74px] h-[90px]", perf: 5, art: "size-8", meta: "text-[7px]" },
  md: { box: "w-[104px] h-[128px]", perf: 6, art: "size-10", meta: "text-[8.5px]" },
  lg: { box: "w-[150px] h-[184px]", perf: 8, art: "size-16", meta: "text-[10px]" },
} as const;

// A product drawn as a stamp. With an uploaded image the image becomes the
// printed face; otherwise the engraved art. `hole` must match the background the
// stamp sits on (it paints the perforation holes).
export function ProductStamp({
  slug,
  type,
  image,
  name,
  size = "md",
  tilt = 0,
  hole = "var(--c-surface)",
  denomination,
  series,
  className,
}: {
  slug: string;
  type: ProductType;
  image?: string | null;
  name: string;
  size?: keyof typeof SIZES;
  tilt?: number;
  hole?: string;
  denomination?: string;
  series?: string;
  className?: string;
}) {
  const sz = SIZES[size];
  const style = stampStyleFor(slug, type);
  return (
    <span
      className={cn("stamp", sz.box, className)}
      style={
        {
          "--perf": `${sz.perf}px`,
          "--perf-hole": hole,
          transform: tilt ? `rotate(${tilt}deg)` : undefined,
        } as CSSProperties
      }
    >
      <span
        className="stamp-face"
        style={{ "--tile": style.tile, color: style.ink } as CSSProperties}
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt={name}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover p-[5px]"
          />
        ) : (
          <>
            <span className={cn("flex justify-between px-1 pt-1 font-bold", sz.meta)}>
              <span>اوستا</span>
              {denomination && <span>{denomination}</span>}
            </span>
            <span className="grid flex-1 place-items-center">
              <StampArt kind={style.art} className={sz.art} />
            </span>
            {series && <span className={cn("px-1 pb-1 text-center", sz.meta)}>{series}</span>}
          </>
        )}
      </span>
    </span>
  );
}

// Circular postmark with wavy cancellation lines. Text along the ring is Latin
// on purpose: browsers don't shape Persian reliably on an SVG textPath.
export function Postmark({
  label,
  date,
  className,
  id = "pm",
}: {
  label: string;
  date?: string;
  className?: string;
  id?: string;
}) {
  return (
    <svg viewBox="0 0 250 150" className={className} aria-hidden>
      <defs>
        <path id={id} d="M75 75 m-54 0 a54 54 0 1 1 108 0 a54 54 0 1 1 -108 0" />
      </defs>
      <circle cx="75" cy="75" r="66" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="75" cy="75" r="42" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <text
        fontFamily="var(--font-geist-mono), monospace"
        fontSize="10.5"
        fontWeight="600"
        letterSpacing="2.2"
        fill="currentColor"
      >
        <textPath href={`#${id}`}>OOSTA · DIGITAL POST · INSTANT ·</textPath>
      </text>
      <text
        x="75"
        y={date ? 72 : 80}
        textAnchor="middle"
        fontFamily="var(--font-vazirmatn), sans-serif"
        fontSize="15"
        fontWeight="800"
        fill="currentColor"
      >
        {label}
      </text>
      {date && (
        <text
          x="75"
          y="92"
          textAnchor="middle"
          fontFamily="var(--font-geist-mono), monospace"
          fontSize="10"
          fill="currentColor"
        >
          {date}
        </text>
      )}
      <path
        d="M146 52 q10 -10 20 0 t20 0 t20 0 t20 0 t20 0 M146 66 q10 -10 20 0 t20 0 t20 0 t20 0 t20 0 M146 80 q10 -10 20 0 t20 0 t20 0 t20 0 t20 0 M146 94 q10 -10 20 0 t20 0 t20 0 t20 0 t20 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

// The logo: a tiny red stamp with «او».
export function BrandStamp({
  className,
  hole = "var(--c-bg)",
}: {
  className?: string;
  hole?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-10 shrink-0 p-[3px]", className)}
      style={{
        background: `radial-gradient(circle at 3px 3px, ${hole} 1.8px, var(--c-primary) 2.2px) -3px -3px / 6px 6px`,
      }}
    >
      <span className="grid h-full w-full place-items-center bg-primary text-[15px] font-black text-primary-foreground shadow-[inset_0_0_0_1.5px_rgba(255,255,255,0.55)]">
        او
      </span>
    </span>
  );
}

// Small diamond bullet used in trust lists.
export function Diamond({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <span aria-hidden className="size-2 rotate-45 bg-primary" />
      {children}
    </li>
  );
}
