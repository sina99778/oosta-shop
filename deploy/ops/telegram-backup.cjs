/* eslint-disable @typescript-eslint/no-require-imports */
const path = require("node:path");
async function deliverBackup({
  chatId,
  recipient,
  create,
  send,
  pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  if (!Number.isSafeInteger(chatId) || chatId <= 0) throw Error("Private admin required");
  const backup = await create(recipient);
  try {
    if (!backup.file.endsWith(".sql.gz.age")) throw Error("Encrypted archive required");
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await send(chatId, backup.file);
        if (
          result.chat?.id !== chatId ||
          result.chat?.type !== "private" ||
          !Number.isSafeInteger(result.message_id) ||
          result.document?.file_name !== path.basename(backup.file)
        )
          throw Error("Unconfirmed backup destination");
        return { messageId: result.message_id };
      } catch {
        if (attempt === 2) throw Error("Telegram backup delivery failed");
        await pause((attempt + 1) * 5000);
      }
    }
  } finally {
    await backup.cleanup();
  }
}
module.exports = { deliverBackup };
if (require.main === module || !process.argv[1]) {
  (async () => {
    if (!process.env.TELEGRAM_BOT_TOKEN) throw Error("Telegram backup not configured");
    const { Telegraf } = require("telegraf");
    const { createEncryptedBackup } = require("./dist/lib/backup");
    const telegram = new Telegraf(process.env.TELEGRAM_BOT_TOKEN).telegram;
    const result = await deliverBackup({
      chatId: Number(process.env.TELEGRAM_ADMIN_ID),
      recipient: process.env.BACKUP_AGE_RECIPIENT,
      create: createEncryptedBackup,
      send: (chatId, file) =>
        telegram.sendDocument(
          chatId,
          { source: file, filename: path.basename(file) },
          { caption: "بکاپ روزانهٔ رمز‌شدهٔ اوستا — کلید بازیابی را جدا و امن نگه دارید." },
        ),
    });
    console.log(`TELEGRAM_ENCRYPTED_BACKUP_SENT messageId=${result.messageId}`);
  })().catch(() => {
    console.error("TELEGRAM_ENCRYPTED_BACKUP_FAILED");
    process.exitCode = 1;
  });
}
