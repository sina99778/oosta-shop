import nodemailer from "nodemailer";
import type { Prisma } from "@prisma/client";
import { env } from "../config/env";
import { prisma } from "./prisma";
import {
  isRenewalReminderDue,
  queueRenewalReminders,
  renewalEmailPrefix,
} from "../modules/orders/renewals";

const labels = {
  ORDER_DELIVERED: "سفارش تحویل شد",
  ORDER_REJECTED: "رسید سفارش رد شد",
  ORDER_REFUNDED: "بازپرداخت سفارش ثبت شد",
};
export type SendMail = (message: { to: string; subject: string; text: string }) => Promise<unknown>;
export async function queueOrderEmail(
  tx: Prisma.TransactionClient,
  orderId: string,
  kind: keyof typeof labels,
) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: { user: { select: { email: true } } },
  });
  if (!order?.user.email) return;
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
    if (job.kind.startsWith(renewalEmailPrefix)) {
      if (!(await isRenewalReminderDue(job.orderId, job.kind, job.to, now))) {
        await prisma.emailOutbox.update({
          where: { id: job.id },
          data: { status: "SKIPPED", lastError: "RENEWAL_NO_LONGER_ELIGIBLE" },
        });
        return;
      }
      await send({
        to: job.to,
        subject: "یادآوری حساب اوستا",
        text: [
          "برای بررسی تاریخ تقریبی پایان اشتراک‌ها و گزینه‌های تمدید، وارد حساب کاربری خود در اوستا شوید.",
          new URL("/fa/dashboard", env.WEB_BASE_URL).href,
        ].join("\n"),
      });
    } else {
      const order = await prisma.order.findUniqueOrThrow({
        where: { id: job.orderId },
        select: {
          user: { select: { email: true } },
          items: {
            select: {
              product: { select: { name: true } },
              plan: { select: { label: true } },
            },
          },
        },
      });
      if (order.user.email !== job.to) {
        await prisma.emailOutbox.update({
          where: { id: job.id },
          data: { status: "REVIEW", lastError: "RECIPIENT_CHANGED" },
        });
        return;
      }
      const subject = labels[job.kind as keyof typeof labels];
      const link = new URL(
        "/fa/dashboard/orders/" + encodeURIComponent(job.orderId),
        env.WEB_BASE_URL,
      );
      await send({
        to: job.to,
        subject,
        text: [
          subject,
          "سفارش " + job.orderId.slice(-8),
          ...order.items.map((item) => item.product.name + " · " + item.plan.label),
          link.href,
        ].join("\n"),
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
