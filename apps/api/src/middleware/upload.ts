// Multer config for image uploads (receipts, product images). Files are kept in
// memory (no disk writes) and the buffer is persisted to Postgres, so uploads are
// part of DB backups and are never orphaned on the filesystem.

import multer from "multer";

export const SAFE_RASTER_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export function isSafeRasterMime(mimetype: string): boolean {
  return SAFE_RASTER_MIMES.has(mimetype.toLowerCase());
}

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 }, // 5 MB
});

export const uploadReceiptImage = imageUpload.single("receipt");
export const uploadProductImage = imageUpload.single("image");
