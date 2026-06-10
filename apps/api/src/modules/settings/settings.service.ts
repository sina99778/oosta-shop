// Site-wide settings (theme colors, hero text, announcement bar) stored as
// key/value rows. The web layout reads them at render time, so changes made by
// the admin or the AI agent restyle the storefront without a redeploy.

import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/httpError";
import { SETTING_KEYS, type SettingsPatch, type SiteSettings } from "./settings.schemas";

export async function getSettings(): Promise<SiteSettings> {
  // Only the public theme/copy keys — the SiteSetting table also stores internal
  // prefs (e.g. agent.* model choices) that must not leak through /site-settings.
  const rows = await prisma.siteSetting.findMany({
    where: { key: { in: [...SETTING_KEYS] } },
  });
  return Object.fromEntries(rows.map((r) => [r.key, r.value])) as SiteSettings;
}

// Upserts each provided key; null deletes the row (reverts to the default).
export async function patchSettings(patch: SettingsPatch): Promise<SiteSettings> {
  const ops = Object.entries(patch).map(([key, value]) =>
    value === null
      ? prisma.siteSetting.deleteMany({ where: { key } })
      : prisma.siteSetting.upsert({
          where: { key },
          create: { key, value },
          update: { value },
        }),
  );
  await prisma.$transaction(ops);
  return getSettings();
}

// ---- Enamad trust badge (binary asset; shown in the footer when present) ----
const ENAMAD_KEY = "enamad";

export async function hasEnamadBadge(): Promise<boolean> {
  const row = await prisma.siteAsset.findUnique({
    where: { key: ENAMAD_KEY },
    select: { key: true },
  });
  return row != null;
}

export async function getEnamadBadge() {
  const row = await prisma.siteAsset.findUnique({ where: { key: ENAMAD_KEY } });
  if (!row) throw new AppError(404, "NOT_FOUND", "No badge uploaded");
  return { data: Buffer.from(row.imageData), mimeType: row.mimeType };
}

// Raster types only — image/svg+xml is active content and must never be served
// from our origin, even when uploaded by an admin (defense in depth).
const BADGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export async function setEnamadBadge(file: { buffer: Buffer; mimetype: string } | undefined) {
  if (!file) throw new AppError(400, "NO_FILE", "An image file is required");
  if (!BADGE_MIMES.has(file.mimetype.toLowerCase())) {
    throw new AppError(400, "BAD_FILE_TYPE", "Badge must be a PNG/JPEG/WebP/GIF image");
  }
  await prisma.siteAsset.upsert({
    where: { key: ENAMAD_KEY },
    create: { key: ENAMAD_KEY, imageData: new Uint8Array(file.buffer), mimeType: file.mimetype },
    update: { imageData: new Uint8Array(file.buffer), mimeType: file.mimetype },
  });
  return { ok: true };
}

export async function deleteEnamadBadge() {
  await prisma.siteAsset.deleteMany({ where: { key: ENAMAD_KEY } });
  return { ok: true };
}
