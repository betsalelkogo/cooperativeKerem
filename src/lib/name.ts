/**
 * Name helpers for splitting a member's full display name into first/family
 * parts. Google login gives us distinct `given_name`/`family_name` fields, but
 * when only a single display string is available we fall back to splitting it.
 */

export interface NameParts {
  firstName: string;
  familyName: string;
}

/**
 * Split a full name into a first name (first token) and a family name (the
 * remaining tokens). Extra whitespace is collapsed. Returns empty strings when
 * there is nothing usable.
 */
export function splitFullName(full: string): NameParts {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", familyName: "" };
  if (parts.length === 1) return { firstName: parts[0], familyName: "" };
  return {
    firstName: parts[0],
    familyName: parts.slice(1).join(" "),
  };
}

/** Collapse whitespace and trim a single name part. */
export function cleanNamePart(value: string): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

/** True when a name part is present and long enough to be a real name. */
export function isValidNamePart(value: string): boolean {
  return cleanNamePart(value).length >= 2;
}
