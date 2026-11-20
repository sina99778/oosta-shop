/* eslint-disable @typescript-eslint/no-require-imports */
(async () => {
  if (!process.env.TELEGRAM_BOT_TOKEN) throw Error("Telegram backup not configured");
  const { Telegraf } = require("telegraf");
  const { createEncryptedBackup } = require("./dist/lib/backup");
  const { deliverBackup } = require("./dist/lib/telegram-backup");
  const telegram = new Telegraf(process.env.TELEGRAM_BOT_TOKEN).telegram;
  const result = await deliverBackup({
    chatId: Number(process.env.TELEGRAM_ADMIN_ID),
    recipient: process.env.BACKUP_AGE_RECIPIENT,
    create: createEncryptedBackup,
    send: (chatId, document, caption) => telegram.sendDocument(chatId, document, { caption }),
  });
  console.log(`TELEGRAM_ENCRYPTED_BACKUP_SENT messageId=${result.messageId} parts=${result.parts}`);
})().catch(() => {
  console.error("TELEGRAM_ENCRYPTED_BACKUP_FAILED");
  process.exitCode = 1;
});
