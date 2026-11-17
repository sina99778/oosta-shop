// Background housekeeping jobs (in-process timers). Every job is an idempotent
// conditional UPDATE, so running several API replicas at once is safe.

import { prisma } from "./prisma";
import { env } from "../config/env";

const MINUTE = 60 * 1000;

// Abandoned checkouts: an online order still PENDING after ORDER_EXPIRY_MINUTES
// (the buyer never came back from the gateway) and a card-to-card order with no
// receipt after CARD_ORDER_EXPIRY_HOURS become EXPIRED. A late but genuine
// gateway callback is still honoured (verify accepts EXPIRED orders), and a late
// card-to-card receipt still moves the order to PENDING_REVIEW.
export async function expireStaleOrders(now = new Date()): Promise<number> {
  const onlineCutoff = new Date(now.getTime() - env.ORDER_EXPIRY_MINUTES * MINUTE);
  const cardCutoff = new Date(now.getTime() - env.CARD_ORDER_EXPIRY_HOURS * 60 * MINUTE);
  const [online, card] = await prisma.$transaction([
    prisma.order.updateMany({
      where: {
        paymentStatus: "PENDING",
        paymentProvider: { not: "CARD_TO_CARD" },
        createdAt: { lt: onlineCutoff },
      },
      data: { paymentStatus: "EXPIRED" },
    }),
    prisma.order.updateMany({
      where: {
        paymentStatus: "PENDING",
        paymentProvider: "CARD_TO_CARD",
        createdAt: { lt: cardCutoff },
      },
      data: { paymentStatus: "EXPIRED" },
    }),
  ]);
  return online.count + card.count;
}

export function startJobs(): () => void {
  const tick = () => {
    expireStaleOrders()
      .then((n) => {
        if (n > 0) console.log(`[jobs] expired ${n} abandoned order(s)`);
      })
      .catch((error) => console.error("[jobs] order expiry failed", error));
  };
  tick();
  const timer = setInterval(tick, 5 * MINUTE);
  timer.unref();
  return () => clearInterval(timer);
}
