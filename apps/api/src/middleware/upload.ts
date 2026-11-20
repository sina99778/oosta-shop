// Multer config for image uploads (receipts, product images). Files are kept in
// memory (no disk writes) and the buffer is persisted to Postgres, so uploads are
// part of DB backups and are never orphaned on the filesystem.

import multer from "multer";
import type { RequestHandler } from "express";
import { AppError } from "../utils/httpError";

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

const signatures = new Map([
  ["image/jpeg", Buffer.from("ffd8ff", "hex")],
  ["image/png", Buffer.from("89504e470d0a1a0a", "hex")],
  ["image/gif", Buffer.from("GIF89a")],
  ["image/webp", Buffer.from("RIFF")],
  ["application/pdf", Buffer.from("%PDF-")],
]);
const gif87 = Buffer.from("GIF87a");
const webpType = Buffer.from("WEBP");

function validSignature(buffer: Buffer, mimeType: string, receipt: boolean): boolean {
  if (!receipt && !SAFE_RASTER_MIMES.has(mimeType)) return false;
  if (mimeType === "image/gif" && buffer.subarray(0, 6).equals(gif87)) {
    return true;
  }
  if (mimeType === "image/webp" && !buffer.subarray(8, 12).equals(webpType)) {
    return false;
  }
  const signature = signatures.get(mimeType);
  return !!signature && buffer.subarray(0, signature.length).equals(signature);
}

function singleImage(field: "receipt" | "image"): RequestHandler {
  const parse = imageUpload.single(field);
  return (req, res, next) => {
    parse(req, res, (error: unknown) => {
      if (error) return next(error);
      if (!req.file) return next();
      const mimeType = req.file.mimetype.toLowerCase();
      if (!validSignature(req.file.buffer, mimeType, field === "receipt")) {
        return next(new AppError(400, "BAD_FILE_TYPE", "File contents must match an allowed type"));
      }
      req.file.mimetype = mimeType;
      next();
    });
  };
}

export const uploadReceiptImage = singleImage("receipt");
export const uploadProductImage = singleImage("image");
