// Multer config for image uploads (receipts, product images). Files are kept in
// memory (no disk writes) and the buffer is persisted to Postgres, so uploads are
// part of DB backups and are never orphaned on the filesystem.

import multer from "multer";

export const SAFE_RASTER_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export function isSafeRasterMime(mimetype: string): boolean {
  return SAFE_RASTER_MIMES.has(mimetype.toLowerCase());
}

const uploadLimits: NonNullable<multer.Options["limits"]> & {
  fieldNestingDepth: number;
  fieldArrayIndexLimit: number;
} = {
  fileSize: 5 * 1024 * 1024,
  files: 1,
  fields: 2,
  parts: 3,
  fieldNameSize: 40,
  fieldSize: 1024,
  fieldNestingDepth: 0,
  fieldArrayIndexLimit: 0,
};
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: uploadLimits,
});

export const uploadReceiptImage = imageUpload.single("receipt");
export const uploadProductImage = imageUpload.single("image");
