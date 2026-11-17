import { prisma } from "../lib/prisma";
import { pendingBluQaReceipts } from "../modules/orders/blu-qa-poll";

pendingBluQaReceipts()
  .then((jobs) => process.stdout.write(JSON.stringify(jobs) + "\n"))
  .catch(() => {
    console.error("BLU_QA_QUEUE_UNAVAILABLE");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
