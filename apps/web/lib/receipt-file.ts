// Mirror the upload boundary for immediate feedback; API authorization/limits remain authoritative.
export function receiptFileError(file: {
  type: string;
  size: number;
}): "type" | "size" | "empty" | null {
  if (
    !["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"].includes(file.type)
  )
    return "type";
  if (file.size > 5 * 1024 * 1024) return "size";
  if (file.size === 0) return "empty";
  return null;
}
