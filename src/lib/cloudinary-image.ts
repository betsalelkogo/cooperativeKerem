/** Client-safe Cloudinary URL helpers (no SDK). */

const CLOUDINARY_UPLOAD = "/image/upload/";

export function normalizeImageUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

export function isCloudinaryImageUrl(url: string): boolean {
  const normalized = normalizeImageUrl(url);
  return normalized.includes("res.cloudinary.com") && normalized.includes(CLOUDINARY_UPLOAD);
}

/** True when the segment after /image/upload/ is already a transformation chain. */
function hasCloudinaryTransforms(afterUpload: string): boolean {
  if (/^v\d+\//.test(afterUpload)) return false;
  return /^[a-z0-9_,]+(?:,[a-z0-9_,]+)*\//i.test(afterUpload);
}

export function isDisplayableImageUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("data:")) return false;
  if (trimmed.startsWith("/")) return false;
  const normalized = normalizeImageUrl(trimmed);
  return /^https?:\/\//i.test(normalized);
}

export function cloudinaryThumbnailUrl(url: string, size = 96): string {
  const normalized = normalizeImageUrl(url);
  if (!isCloudinaryImageUrl(normalized)) return normalized;

  const markerIdx = normalized.indexOf(CLOUDINARY_UPLOAD);
  const prefix = normalized.slice(0, markerIdx + CLOUDINARY_UPLOAD.length);
  const suffix = normalized.slice(markerIdx + CLOUDINARY_UPLOAD.length);

  if (hasCloudinaryTransforms(suffix)) return normalized;

  const transform = `w_${size},h_${size},c_fill,f_auto,q_auto/`;
  if (suffix.startsWith(transform)) return normalized;

  return `${prefix}${transform}${suffix}`;
}
