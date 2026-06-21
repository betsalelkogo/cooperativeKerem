import type { Member, MemberRole } from "@/lib/types";

export const DEFAULT_MEMBER_ROLE: MemberRole = "MEMBER";

export function normalizeMemberRole(value: unknown): MemberRole {
  if (
    value === "ADMIN" ||
    value === "GEMACH_ADMIN" ||
    value === "BOARD" ||
    value === "DISPUTE_RESOLVER"
  ) {
    return value;
  }
  return "MEMBER";
}

export function isPlatformAdmin(member: {
  role: MemberRole;
}): boolean {
  return member.role === "ADMIN";
}

export function gemachAdminIdsFromData(data: { gemachAdminIds?: unknown }): string[] {
  if (!Array.isArray(data.gemachAdminIds)) return [];
  return data.gemachAdminIds.filter((id): id is string => typeof id === "string");
}

/** Member owns one or more gemachim (any role — including platform ADMIN). */
export function hasOwnedGemachim(member: { gemachAdminIds?: string[] }): boolean {
  return (member.gemachAdminIds?.length ?? 0) > 0;
}

/** Gemach-only admin (role GEMACH_ADMIN, not platform ADMIN). */
export function isGemachAdmin(member: {
  role: MemberRole;
  gemachAdminIds?: string[];
}): boolean {
  return member.role === "GEMACH_ADMIN" && hasOwnedGemachim(member);
}

/** Can use scoped gemach dashboard for a gemach they own. */
export function isGemachScopedAdmin(member: {
  role: MemberRole;
  gemachAdminIds?: string[];
}): boolean {
  return isGemachAdmin(member) || (isPlatformAdmin(member) && hasOwnedGemachim(member));
}

/** Platform admin or gemach admin with access to a specific gemach. */
export function canAdminGemach(
  member: { role: MemberRole; gemachAdminIds?: string[] },
  gemachId: string
): boolean {
  if (member.role === "ADMIN") return true;
  return (
    member.role === "GEMACH_ADMIN" &&
    (member.gemachAdminIds?.includes(gemachId) ?? false)
  );
}

export function isAdminMember(member: { role: MemberRole }): boolean {
  return (
    member.role === "ADMIN" ||
    member.role === "GEMACH_ADMIN" ||
    member.role === "BOARD"
  );
}

export function isBoardMember(member: { role: MemberRole }): boolean {
  return member.role === "BOARD" || member.role === "ADMIN";
}

export function isDisputeResolver(member: { role: MemberRole }): boolean {
  return member.role === "DISPUTE_RESOLVER" || member.role === "ADMIN";
}

export function canAccessAdminPath(
  member: { role: MemberRole; gemachAdminIds?: string[] },
  pathname: string
): boolean {
  if (pathname.startsWith("/admin/gemach")) {
    return isPlatformAdmin(member) || isGemachScopedAdmin(member);
  }
  if (pathname.startsWith("/admin/board") || pathname.startsWith("/admin/finance")) {
    return isBoardMember(member);
  }
  if (pathname.startsWith("/admin/disputes")) {
    return isDisputeResolver(member) || isBoardMember(member);
  }
  return isPlatformAdmin(member);
}

/** Legacy docs may still have isAdmin: true — treat as ADMIN when reading. */
export function roleFromMemberData(data: {
  role?: unknown;
  isAdmin?: unknown;
  gemachAdminIds?: unknown;
}): MemberRole {
  if (data.role !== undefined) {
    return normalizeMemberRole(data.role);
  }
  if (data.isAdmin === true) {
    return "ADMIN";
  }
  return DEFAULT_MEMBER_ROLE;
}
