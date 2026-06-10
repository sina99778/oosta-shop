// Site-wide settings (theme colors, hero text, announcement bar) stored as
// key/value rows. The web layout reads them at render time, so changes made by
// the admin or the AI agent restyle the storefront without a redeploy.

import { prisma } from "../../lib/prisma";
import type { SettingsPatch, SiteSettings } from "./settings.schemas";

export async function getSettings(): Promise<SiteSettings> {
  const rows = await prisma.siteSetting.findMany();
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
