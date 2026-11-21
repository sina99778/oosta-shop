import type { Prisma } from "@prisma/client";

const messages = {
  ORDER_DELIVERED: ["سفارشت تحویل شد", "اطلاعات تحویل در جزئیات سفارش در دسترس است."],
  ORDER_REJECTED: ["رسید سفارش تأیید نشد", "برای مشاهدهٔ نتیجه و ادامهٔ پیگیری، سفارش را باز کن."],
  ORDER_REFUNDED: ["بازپرداخت ثبت شد", "وضعیت بازپرداخت را در جزئیات سفارش ببین."],
  SUBSCRIPTION_RENEWAL: [
    "یادآوری تمدید اشتراک",
    "تاریخ تقریبی پایان اشتراک و گزینهٔ تمدید را در سفارش ببین.",
  ],
} as const;

export async function addOrderNotification(
  tx: Pick<Prisma.TransactionClient, "userNotification">,
  userId: string,
  orderId: string,
  kind: keyof typeof messages,
  eventId = orderId,
) {
  const [title, body] = messages[kind];
  await tx.userNotification.createMany({
    data: [
      {
        userId,
        kind,
        key: `${kind}:${eventId}`,
        locale: "fa",
        title,
        body,
        href: `/fa/dashboard/orders/${encodeURIComponent(orderId)}`,
      },
    ],
    skipDuplicates: true,
  });
}
