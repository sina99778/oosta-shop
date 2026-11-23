import nodemailer from "nodemailer";
import type { Prisma } from "@prisma/client";
import { env } from "../config/env";
import { prisma } from "./prisma";
import { renderEmail } from "./email-design";
import { addOrderNotification } from "../modules/orders/order-notifications";
import {
  isRenewalReminderDue,
  queueRenewalReminders,
  renewalEmailPrefix,
} from "../modules/orders/renewals";

const labels = {
  ORDER_DELIVERED: {
    subject: "سفارشت آماده است",
    body: "تحویل سفارش انجام شد. برای مشاهدهٔ محصول و راهنمای استفاده، وارد حساب اوستا شو و جزئیات سفارش را باز کن.",
  },
  ORDER_REJECTED: {
    subject: "رسید سفارش تأیید نشد",
    body: "برای دیدن نتیجهٔ بررسی و گزینه‌های پیگیری، وارد حساب اوستا شو و جزئیات سفارش را باز کن.",
  },
  ORDER_REFUNDED: {
    subject: "بازپرداخت سفارش ثبت شد",
    body: "وضعیت بازپرداخت و اطلاعات پیگیری را در جزئیات سفارش در حساب اوستا ببین.",
  },
};
export type SendMail = (message: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}) => Promise<unknown>;
export async function queueOrderEmail(
  tx: Prisma.TransactionClient,
  orderId: string,
  kind: keyof typeof labels,
  eventId = orderId,
) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: { userId: true, user: { select: { email: true } } },
  });
  if (!order) return;
  await addOrderNotification(tx, order.userId, orderId, kind, eventId);
  if (!order.user.email) return;
  await tx.emailOutbox.createMany({
    data: [{ orderId, kind, to: order.user.email }],
    skipDuplicates: true,
  });
}

export async function sendNextOrderEmail(send: SendMail) {
  const now = new Date();
  // Expired leases may be from a process that died after SMTP accepted the message.
  await prisma.emailOutbox.updateMany({
    where: { status: "SENDING", nextAt: { lte: now } },
    data: { status: "REVIEW", lastError: "SMTP_RESULT_UNKNOWN" },
  });
  const job = await prisma.emailOutbox.findFirst({
    where: { status: "PENDING", nextAt: { lte: now }, attempts: { lt: 5 } },
    orderBy: { nextAt: "asc" },
  });
  if (!job) return;
  const claimed = await prisma.emailOutbox.updateMany({
    where: { id: job.id, status: "PENDING", attempts: job.attempts },
    data: {
      status: "SENDING",
      attempts: { increment: 1 },
      nextAt: new Date(Date.now() + 120000),
    },
  });
  if (!claimed.count) return;
  try {
    if (job.kind === "STOCK_AVAILABLE") {
      const alert = await prisma.userNotification.findUnique({
        where: { id: job.orderId },
        select: {
          kind: true,
          locale: true,
          title: true,
          body: true,
          href: true,
          user: { select: { email: true, verifiedRecoveryEmail: true } },
        },
      });
      const path = alert?.href.match(
        /^\/(fa|en)\/products\/[a-z0-9]+(?:-[a-z0-9]+)*\?plan=[a-zA-Z0-9_-]{1,100}$/,
      );
      if (
        !alert ||
        alert.kind !== job.kind ||
        alert.user.email !== job.to ||
        alert.user.verifiedRecoveryEmail !== job.to ||
        !path ||
        path[0] !== alert.href ||
        path[1] !== alert.locale ||
        (alert.locale !== "fa" && alert.locale !== "en")
      ) {
        await prisma.emailOutbox.update({
          where: { id: job.id },
          data: { status: "SKIPPED", lastError: "STOCK_ALERT_NO_LONGER_ELIGIBLE" },
        });
        return;
      }
      await send({
        to: job.to,
        ...renderEmail({
          locale: alert.locale,
          kind: "stock",
          subject: alert.title,
          body: alert.body,
          action: {
            label: alert.locale === "fa" ? "مشاهدهٔ پلن" : "View plan",
            url: new URL(alert.href, env.WEB_BASE_URL).href,
          },
        }),
      });
    } else if (job.kind.startsWith(renewalEmailPrefix)) {
      if (!(await isRenewalReminderDue(job.orderId, job.kind, job.to, now))) {
        await prisma.emailOutbox.update({
          where: { id: job.id },
          data: { status: "SKIPPED", lastError: "RENEWAL_NO_LONGER_ELIGIBLE" },
        });
        return;
      }
      await send({
        to: job.to,
        ...renderEmail({
          locale: "fa",
          kind: "notice",
          subject: "یادآوری تمدید اشتراک",
          body: "تاریخ تقریبی پایان اشتراک و گزینه‌های تمدید را در حساب اوستا ببین.",
          action: {
            label: "ورود به حساب اوستا",
            url: new URL("/fa/dashboard", env.WEB_BASE_URL).href,
          },
        }),
      });
    } else {
      const order = await prisma.order.findUniqueOrThrow({
        where: { id: job.orderId },
        select: {
          user: { select: { email: true, verifiedRecoveryEmail: true } },
        },
      });
      if (order.user.email !== job.to) {
        await prisma.emailOutbox.update({
          where: { id: job.id },
          data: { status: "REVIEW", lastError: "RECIPIENT_CHANGED" },
        });
        return;
      }
      if (!Object.hasOwn(labels, job.kind)) {
        await prisma.emailOutbox.update({
          where: { id: job.id },
          data: { status: "REVIEW", lastError: "UNKNOWN_EMAIL_KIND" },
        });
        return;
      }
      const copy = labels[job.kind as keyof typeof labels];
      const verified = order.user.verifiedRecoveryEmail === job.to;
      const link = new URL(
        verified ? "/fa/dashboard/orders/" + encodeURIComponent(job.orderId) : "/fa/dashboard",
        env.WEB_BASE_URL,
      );
      await send({
        to: job.to,
        ...renderEmail({
          locale: "fa",
          kind: job.kind === "ORDER_DELIVERED" ? "delivery" : "notice",
          ...copy,
          details: verified ? ["شمارهٔ سفارش " + job.orderId.slice(-8)] : [],
          action: { label: verified ? "مشاهدهٔ سفارش" : "ورود به حساب اوستا", url: link.href },
        }),
      });
    }
  } catch {
    await prisma.emailOutbox.update({
      where: { id: job.id },
      data: {
        status: job.attempts >= 4 ? "FAILED" : "PENDING",
        lastError: "SMTP_SEND_FAILED",
        nextAt: new Date(Date.now() + 60000 * 2 ** job.attempts),
      },
    });
    return;
  }
  await prisma.emailOutbox.update({
    where: { id: job.id },
    data: { status: "SENT", sentAt: new Date(), lastError: null },
  });
}

export function createSmtpSender(): SendMail | undefined {
  if (process.env.MAIL_ENABLED !== "true") return;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM } = process.env;
  const port = Number(SMTP_PORT ?? 587);
  if (
    !SMTP_HOST ||
    !MAIL_FROM ||
    !SMTP_USER ||
    !SMTP_PASS ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    console.error("[mail] SMTP configuration missing or invalid");
    return;
  }
  const smtp = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
  return (message) => smtp.sendMail({ ...message, from: MAIL_FROM });
}

export function startOrderMail() {
  const send = createSmtpSender();
  if (!send) return () => {};
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await sendNextOrderEmail(send);
    } catch {
      console.error("[order-mail] worker pending");
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void run(), 15000);
  timer.unref();
  let sweeping = false;
  const sweep = async () => {
    if (sweeping) return;
    sweeping = true;
    try {
      await queueRenewalReminders();
    } catch {
      console.error("[order-mail] renewal reminder sweep failed");
    } finally {
      sweeping = false;
    }
  };
  void sweep();
  const reminderTimer = setInterval(() => void sweep(), 60 * 60 * 1000);
  reminderTimer.unref();
  return () => {
    clearInterval(timer);
    clearInterval(reminderTimer);
  };
}
