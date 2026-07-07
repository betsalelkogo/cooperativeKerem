/**
 * Phone helpers shared by the member phone form and the PayBox importer.
 *
 * Numbers arrive in many shapes: what a member types ("054-734-5662",
 * "0547345662") and what PayBox exports ("972-547345662", "+972 54 734 5662").
 * We reduce every variant to a canonical key so they compare equal.
 */

/** Keep only the digits of an input. */
export function phoneDigits(value: string): string {
  return (value ?? "").replace(/\D+/g, "");
}

/**
 * Canonical comparison key for a phone number. Strips a leading Israeli country
 * code (972) and leading zeros, then keeps the last 9 significant digits.
 * Returns "" when there aren't enough digits to be a real number.
 */
export function normalizePhone(value: string): string {
  let digits = phoneDigits(value);
  if (!digits) return "";
  if (digits.startsWith("972")) digits = digits.slice(3);
  digits = digits.replace(/^0+/, "");
  if (digits.length > 9) digits = digits.slice(-9);
  return digits.length >= 8 ? digits : "";
}

/** True when the input looks like a usable phone number. */
export function isValidPhone(value: string): boolean {
  return normalizePhone(value).length >= 8;
}
