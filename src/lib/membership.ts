/**
 * One-time cooperative membership fee (₪). On a member's first payment this
 * amount is withheld before the remainder is credited to their balance
 * (e.g. a 200₪ payment credits 50₪; a 250₪ payment credits 100₪).
 */
export const MEMBERSHIP_FEE_NIS = 150;

/**
 * Minimum payment (₪) a non-member must make to join the cooperative. A
 * non-member paying at least this becomes a member (fee withheld, remainder
 * credited); a smaller payment from a non-member is rejected — no credit.
 */
export const MEMBERSHIP_JOIN_MIN_NIS = 200;

/** API / UI error codes for reservation gates. */
export const TERMS_REQUIRED_CODE = "TERMS_REQUIRED" as const;
export const MEMBERSHIP_REQUIRED_CODE = "MEMBERSHIP_REQUIRED" as const;

/** Read a member's firstPayout flag with the correct default (true). */
export function isFirstPayout(data: { firstPayout?: unknown } | undefined | null): boolean {
  return data?.firstPayout !== false;
}

/** Whether the member has accepted the תקנון. */
export function hasAcceptedTerms(
  data: { termsAcceptedAt?: unknown } | undefined | null
): boolean {
  return typeof data?.termsAcceptedAt === "string" && data.termsAcceptedAt.length > 0;
}

/** Paying cooperative member — skip join/PayBox offer. */
export function isPaidMember(
  data: { isAmember?: unknown } | undefined | null
): boolean {
  return data?.isAmember === true;
}

/**
 * Split a gross payment into the membership fee withheld and the amount to
 * credit, given whether this is the member's first payout.
 */
export function splitFirstPayout(
  amount: number,
  firstPayout: boolean
): { membershipFee: number; credited: number } {
  if (!firstPayout) return { membershipFee: 0, credited: amount };
  const membershipFee = Math.min(amount, MEMBERSHIP_FEE_NIS);
  const credited = Math.round((amount - membershipFee) * 100) / 100;
  return { membershipFee, credited };
}
