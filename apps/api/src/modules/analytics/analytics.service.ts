// First-party page-view analytics. The web app fires POST /track per page view;
// rows are aggregated here for the Telegram bot's «📈 بازدیدها» report. No cookies
// and no raw IPs — the visitor key is sha256(ip|ua|utc-day), rotating daily.

import { createHash } from "node:crypto";
import { prisma } from "../../lib/prisma";

// Tehran is UTC+03:30 year-round (Iran abolished DST in 2022).
const TEHRAN_OFFSET_MS = 3.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Start of the Tehran calendar day `daysAgo` days back, as a UTC Date.
function tehranDayStart(daysAgo: number): Date {
  const tehranNow = Date.now() + TEHRAN_OFFSET_MS;
  const dayStart = Math.floor(tehranNow / DAY_MS) * DAY_MS;
  return new Date(dayStart - TEHRAN_OFFSET_MS - daysAgo * DAY_MS);
}

export function visitorHashFor(ip: string, userAgent: string): string {
  // Rotate on the TEHRAN day so uniques line up with the Tehran-day report windows
  // (a UTC rotation would split one visitor in two at 03:30 local time).
  const tehranDay = new Date(Date.now() + TEHRAN_OFFSET_MS).toISOString().slice(0, 10);
  return createHash("sha256").update(`${ip}|${userAgent}|${tehranDay}`).digest("hex");
}

const BOT_UA = /bot|crawl|spider|preview|fetch|monitor|curl|wget|lighthouse|headless/i;

// Retention: rows older than this are pruned (piggybacked on inserts, ~1/1000).
const RETENTION_DAYS = 90;
let insertsSincePrune = 0;

export async function recordVisit(input: {
  path: string;
  country: string;
  ip: string;
  userAgent: string;
}): Promise<void> {
  if (BOT_UA.test(input.userAgent)) return;
  // Keep only the pathname (no query/hash) and skip non-storefront paths.
  const path = input.path.split(/[?#]/)[0].slice(0, 200);
  if (!path.startsWith("/") || /^\/(en|fa)?\/?admin/.test(path)) return;

  const country = /^[A-Za-z]{2}$/.test(input.country) ? input.country.toUpperCase() : "??";
  await prisma.visit.create({
    data: { path, country, visitorHash: visitorHashFor(input.ip, input.userAgent) },
  });

  if (++insertsSincePrune >= 1000) {
    insertsSincePrune = 0;
    const cutoff = new Date(Date.now() - RETENTION_DAYS * DAY_MS);
    void prisma.visit.deleteMany({ where: { createdAt: { lt: cutoff } } }).catch(() => {});
  }
}

type RangeStats = { views: number; visitors: number };

// COUNT(DISTINCT) in SQL — never materializes rows in the API process, so a
// spammed visits table cannot blow up memory when the admin opens the report.
async function rangeStats(since: Date): Promise<RangeStats> {
  const rows = await prisma.$queryRaw<Array<{ views: number; visitors: number }>>`
    SELECT COUNT(*)::int AS views, COUNT(DISTINCT "visitorHash")::int AS visitors
    FROM visits WHERE "createdAt" >= ${since}`;
  return rows[0] ?? { views: 0, visitors: 0 };
}

export type VisitStats = {
  today: RangeStats;
  week: RangeStats;
  month: RangeStats;
  countriesMonth: Array<{ country: string; views: number }>;
  daily: Array<{ day: string; views: number; visitors: number }>;
};

export async function getVisitStats(): Promise<VisitStats> {
  const [today, week, month, countries, daily] = await Promise.all([
    rangeStats(tehranDayStart(0)),
    rangeStats(tehranDayStart(6)),
    rangeStats(tehranDayStart(29)),
    prisma.visit.groupBy({
      by: ["country"],
      where: { createdAt: { gte: tehranDayStart(29) } },
      _count: { _all: true },
      orderBy: { _count: { country: "desc" } },
      take: 10,
    }),
    prisma.$queryRaw<Array<{ day: string; views: number; visitors: number }>>`
      SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tehran', 'YYYY-MM-DD') AS day,
             COUNT(*)::int AS views,
             COUNT(DISTINCT "visitorHash")::int AS visitors
      FROM visits
      WHERE "createdAt" >= ${tehranDayStart(6)}
      GROUP BY 1
      ORDER BY 1 DESC`,
  ]);

  return {
    today,
    week,
    month,
    countriesMonth: countries.map((c) => ({ country: c.country, views: c._count._all })),
    daily,
  };
}
