// One-time, idempotent upgrade: encrypts inventory secrets that were stored in
// plaintext before encryption at rest existed. Runs at API boot; rows already in
// the "enc:v1:" format are skipped, so repeated runs are no-ops.

import { prisma } from "./prisma";
import { encryptSecret, isEncrypted } from "./secretBox";

export async function encryptLegacyInventory(): Promise<number> {
  let migrated = 0;
  let cursor: string | undefined;
  for (;;) {
    const batch = await prisma.inventoryItem.findMany({
      where: {
        OR: [
          {
            AND: [
              { accountPassword: { not: null } },
              { NOT: { accountPassword: { startsWith: "enc:v1:" } } },
            ],
          },
          {
            AND: [
              { licenseKey: { not: null } },
              { NOT: { licenseKey: { startsWith: "enc:v1:" } } },
            ],
          },
          {
            AND: [
              { giftCardCode: { not: null } },
              { NOT: { giftCardCode: { startsWith: "enc:v1:" } } },
            ],
          },
        ],
      },
      select: { id: true, accountPassword: true, licenseKey: true, giftCardCode: true },
      orderBy: { id: "asc" },
      take: 500,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (batch.length === 0) break;
    for (const row of batch) {
      const data: Record<string, string> = {};
      if (row.accountPassword && !isEncrypted(row.accountPassword))
        data.accountPassword = encryptSecret(row.accountPassword);
      if (row.licenseKey && !isEncrypted(row.licenseKey))
        data.licenseKey = encryptSecret(row.licenseKey);
      if (row.giftCardCode && !isEncrypted(row.giftCardCode))
        data.giftCardCode = encryptSecret(row.giftCardCode);
      if (Object.keys(data).length > 0) {
        await prisma.inventoryItem.update({ where: { id: row.id }, data });
        migrated++;
      }
    }
    cursor = batch[batch.length - 1].id;
  }
  return migrated;
}
