const CODE_MAX = 16;
const NOTE_MAX = 120;
const CODE_PATTERN = /^[0-9A-Za-z]{3,16}$/;

export function normalizeAccessCode(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, "").trim();
}

export function normalizeAccessNote(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, NOTE_MAX);
}

/** Empty is allowed (code not set yet). Otherwise 3–16 letters/digits, no spaces. */
export function validateAccessCode(value: string): string | null {
  if (!value) return null;
  if (value.length > CODE_MAX) return "הקוד ארוך מדי";
  if (!CODE_PATTERN.test(value)) {
    return "הקוד חייב להיות 3–16 תווים, ספרות או אותיות באנגלית בלבד";
  }
  return null;
}
