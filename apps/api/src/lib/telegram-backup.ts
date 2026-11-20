import { createReadStream, type ReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename } from "node:path";
import { finished } from "node:stream/promises";

// Leave room below Telegram's 20 MB Bot API download limit as well as its 50 MB upload limit.
const partBytes = 19_000_000;

type BackupDelivery = {
  chatId: number;
  recipient?: string;
  create: (recipient?: string) => Promise<{ file: string; cleanup: () => Promise<void> }>;
  send: (
    chatId: number,
    document: { source: ReadStream; filename: string },
    caption: string,
  ) => Promise<{
    chat?: { id: number; type: string };
    message_id: number;
    document?: { file_name?: string };
  }>;
  pause?: (ms: number) => Promise<void>;
};

export async function deliverBackup({
  chatId,
  recipient,
  create,
  send,
  pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}: BackupDelivery) {
  if (!Number.isSafeInteger(chatId) || chatId <= 0) throw Error("Private admin required");
  const backup = await create(recipient);
  try {
    if (!backup.file.endsWith(".sql.gz.age")) throw Error("Encrypted archive required");
    const { size } = await stat(backup.file);
    if (size === 0) throw Error("Encrypted archive is empty");
    const parts = Math.ceil(size / partBytes);
    const width = Math.max(4, String(parts).length);
    const partLabel = (value: number) => String(value).padStart(width, "0");
    let messageId = 0;
    for (let part = 1; part <= parts; part++) {
      const filename =
        basename(backup.file) +
        (parts === 1 ? "" : `.part-${partLabel(part)}-of-${partLabel(parts)}`);
      const caption =
        "بکاپ رمزنگاری‌شدهٔ اوستا — کلید بازیابی را جدا و امن نگه دارید." +
        (parts === 1 ? "" : `\nبخش ${part} از ${parts} — همهٔ بخش‌ها برای بازیابی لازم‌اند.`);
      for (let attempt = 0; attempt < 3; attempt++) {
        const source = createReadStream(backup.file, {
          start: (part - 1) * partBytes,
          end: Math.min(part * partBytes, size) - 1,
        });
        try {
          const result = await send(chatId, { source, filename }, caption);
          if (
            result.chat?.id !== chatId ||
            result.chat?.type !== "private" ||
            !Number.isSafeInteger(result.message_id) ||
            result.message_id <= 0 ||
            result.document?.file_name !== filename
          ) {
            throw Error("Unconfirmed backup destination");
          }
          messageId = result.message_id;
          break;
        } catch {
          if (attempt === 2) throw Error("Telegram backup delivery failed");
        } finally {
          source.destroy();
          await finished(source, { cleanup: true }).catch(() => {});
        }
        await pause((attempt + 1) * 5000);
      }
    }
    return { messageId, parts };
  } finally {
    await backup.cleanup();
  }
}
