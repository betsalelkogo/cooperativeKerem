/** Max raw file size before base64 encoding (Firestore-safe). */
export const TOOL_IMAGE_MAX_BYTES = 400 * 1024;

/** Max stored value length (base64 data URL or https URL). */
export const TOOL_IMAGE_MAX_STORED_CHARS = 700_000;

const ALLOWED_DATA_PREFIXES = ["data:image/jpeg;base64,", "data:image/png;base64,", "data:image/webp;base64,"];

export function validateToolImageUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.length > TOOL_IMAGE_MAX_STORED_CHARS) {
    return "התמונה גדולה מדי — נסו קובץ קטן יותר (עד 400KB) או קישור חיצוני";
  }

  if (trimmed.startsWith("data:")) {
    const ok = ALLOWED_DATA_PREFIXES.some((p) => trimmed.startsWith(p));
    if (!ok) return "סוג קובץ לא נתמך — JPG, PNG או WebP בלבד";
    return null;
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return "קישור תמונה לא תקין";
  }

  if (url.protocol !== "https:") {
    return "קישור תמונה חייב להיות HTTPS";
  }

  return null;
}

export function resolveToolImageUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  const error = validateToolImageUrl(trimmed);
  if (error) throw new Error(error);
  return trimmed;
}

export async function readImageFileAsDataUrl(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("סוג קובץ לא נתמך — JPG, PNG או WebP בלבד");
  }
  if (file.size > TOOL_IMAGE_MAX_BYTES) {
    throw new Error("התמונה גדולה מדי — מקסימום 400KB (ללא Firebase Storage)");
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result) {
        reject(new Error("קריאת הקובץ נכשלה"));
        return;
      }
      if (result.length > TOOL_IMAGE_MAX_STORED_CHARS) {
        reject(new Error("התמונה גדולה מדי לאחר המרה — נסו קובץ קטן יותר"));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(new Error("קריאת הקובץ נכשלה"));
    reader.readAsDataURL(file);
  });
}
