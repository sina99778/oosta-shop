import type { Prisma } from "@prisma/client";

// All receipt/payment transitions use the same lock order: order first, then stock.
export async function lockOrder(tx: Prisma.TransactionClient, id: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM orders WHERE id = ${id} FOR UPDATE`;
}
