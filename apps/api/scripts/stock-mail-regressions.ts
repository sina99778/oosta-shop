import assert from "node:assert/strict";
import { env } from "../src/config/env";
import { sendNextOrderEmail, type SendMail } from "../src/lib/mailer";
import { prisma } from "../src/lib/prisma";

async function main() {
  assert.equal(process.env.ISOLATED_REGRESSION_DB, "1");
  assert(!env.TELEGRAM_BOT_TOKEN);

  const email = "stock-mail@example.invalid";
  const user = await prisma.user.create({
    data: {
      email,
      verifiedRecoveryEmail: email,
      name: "Stock alert fixture",
      passwordHash: "unused",
    },
  });
  const href = "/en/products/stock-fixture?plan=fixture_plan-1";
  const kind = "STOCK_AVAILABLE";
  let sequence = 0;
  async function queue(changes: { href?: string; locale?: string; to?: string } = {}) {
    const notification = await prisma.userNotification.create({
      data: {
        userId: user.id,
        kind,
        key: `stock-mail-fixture:${++sequence}`,
        title: "Fixture <plan> is back",
        body: "This is a synthetic availability alert.",
        locale: changes.locale ?? "en",
        href: changes.href ?? href,
      },
    });
    return prisma.emailOutbox.create({
      data: { orderId: notification.id, to: changes.to ?? email, kind, nextAt: new Date(0) },
    });
  }
  const mails: Parameters<SendMail>[0][] = [];
  const send: SendMail = async (message) => {
    mails.push(message);
  };
  const status = (id: string) => prisma.emailOutbox.findUniqueOrThrow({ where: { id } });

  const valid = await queue();
  await Promise.all([sendNextOrderEmail(send), sendNextOrderEmail(send)]);
  assert.equal(mails.length, 1);
  assert.equal(mails[0].to, email);
  assert.equal(mails[0].subject, "Fixture <plan> is back");
  assert.match(mails[0].html ?? "", /Availability alert|Fixture &lt;plan&gt;/);
  assert(mails[0].text.includes(new URL(href, env.WEB_BASE_URL).href));
  assert.equal((await status(valid.id)).status, "SENT");

  const foreign = await queue({ to: "someone-else@example.invalid" });
  await sendNextOrderEmail(send);
  assert.equal((await status(foreign.id)).status, "SKIPPED");
  const external = await queue({
    href: "//fixture.example.invalid/en/products/stock-fixture?plan=fixture",
  });
  await sendNextOrderEmail(send);
  assert.equal((await status(external.id)).status, "SKIPPED");
  const extraQuery = await queue({ href: href + "&next=https://fixture.example.invalid" });
  await sendNextOrderEmail(send);
  assert.equal((await status(extraQuery.id)).status, "SKIPPED");
  const mismatchedLocale = await queue({ locale: "fa" });
  await sendNextOrderEmail(send);
  assert.equal((await status(mismatchedLocale.id)).status, "SKIPPED");

  const revoked = await queue();
  await prisma.user.update({ where: { id: user.id }, data: { verifiedRecoveryEmail: null } });
  await sendNextOrderEmail(send);
  assert.equal((await status(revoked.id)).status, "SKIPPED");
  assert.equal(mails.length, 1);
  await prisma.user.update({ where: { id: user.id }, data: { verifiedRecoveryEmail: email } });

  const retry = await queue();
  await sendNextOrderEmail(async () => {
    throw new Error("Synthetic provider failure");
  });
  const failed = await status(retry.id);
  assert.equal(failed.status, "PENDING");
  assert.equal(failed.attempts, 1);
  assert.equal(failed.lastError, "SMTP_SEND_FAILED");
  assert(failed.nextAt > new Date());
  await prisma.emailOutbox.update({ where: { id: retry.id }, data: { nextAt: new Date(0) } });
  await sendNextOrderEmail(send);
  assert.equal((await status(retry.id)).status, "SENT");
  assert.equal(mails.length, 2);
  console.log(
    "PASS: stock mail queue, verified recipient, safe plan links, concurrent claim, and retry",
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
