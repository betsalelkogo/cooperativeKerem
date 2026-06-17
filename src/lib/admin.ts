import type { MemberRole } from "@/lib/types";

export const DEFAULT_MEMBER_ROLE: MemberRole = "MEMBER";

export function normalizeMemberRole(value: unknown): MemberRole {
  return value === "ADMIN" ? "ADMIN" : "MEMBER";
}

export function isAdminRole(role: unknown): boolean {
  return role === "ADMIN";
}

export function isAdminMember(member: { role: MemberRole }): boolean {
  return isAdminRole(member.role);
}

/** Legacy docs may still have isAdmin: true — treat as ADMIN when reading. */
export function roleFromMemberData(data: {
  role?: unknown;
  isAdmin?: unknown;
}): MemberRole {
  if (data.role !== undefined) {
    return normalizeMemberRole(data.role);
  }
  if (data.isAdmin === true) {
    return "ADMIN";
  }
  return DEFAULT_MEMBER_ROLE;
}
