// Multer config for receipt uploads. Files are kept in memory (no disk writes) and
// the buffer is persisted to Postgres, so receipts are part of DB backups and are
// never orphaned on the filesystem.

import multer from "multer";

export const uploadReceiptImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 }, // 5 MB
}).single("receipt");
