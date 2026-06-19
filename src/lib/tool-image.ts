/** Validate external HTTPS image URLs stored in Firestore. */

export function validateToolImageUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("data:")) {
    return "העלו תמונה מהמחשב או הדביקו קישור HTTPS — לא ניתן לשמור base64";
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
