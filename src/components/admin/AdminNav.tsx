"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthProvider";
import {
  isPlatformAdmin,
  isGemachScopedAdmin,
  hasOwnedGemachim,
  isBoardMember,
} from "@/lib/admin";
import { cn } from "@/lib/cn";
import { useSelectedGemachId } from "@/hooks/useSelectedGemachId";
import { GemachSelector } from "@/components/admin/GemachSelector";

const disputesTab = {
  href: "/admin/disputes",
  label: "מחלוקות",
  match: (p: string) => p.startsWith("/admin/disputes"),
};

const platformTabs = [
  { href: "/admin", label: "לוח בקרה", match: (p: string) => p === "/admin" },
  { href: "/admin/members", label: "חברים", match: (p: string) => p.startsWith("/admin/members") },
  { href: "/admin/pots", label: "קופות", match: (p: string) => p.startsWith("/admin/pots") },
  { href: "/admin/board", label: "לוגיסטיקה", match: (p: string) => p.startsWith("/admin/board") },
  { href: "/admin/finance", label: "כספים", match: (p: string) => p.startsWith("/admin/finance") },
  disputesTab,
];

const boardTabs = [
  { href: "/admin/board", label: "לוגיסטיקה", match: (p: string) => p.startsWith("/admin/board") },
  { href: "/admin/finance", label: "כספים", match: (p: string) => p.startsWith("/admin/finance") },
  disputesTab,
];

const gemachTabPaths = [
  { path: "/admin/gemach", label: "לוח בקרה", match: (p: string) => p === "/admin/gemach" },
  {
    path: "/admin/gemach/tools/new",
    label: "הוסף כלי",
    match: (p: string) => p.startsWith("/admin/gemach/tools"),
  },
  {
    path: "/admin/gemach/settings",
    label: "הגדרות",
    match: (p: string) => p.startsWith("/admin/gemach/settings"),
  },
  {
    path: "/admin/gemach/pots",
    label: "קופות",
    match: (p: string) => p.startsWith("/admin/gemach/pots"),
  },
];

export function AdminNav() {
  const pathname = usePathname();
  const { member } = useAuth();
  const { hrefWithGemachId } = useSelectedGemachId();

  const isGemachRoute = pathname.startsWith("/admin/gemach");
  const showPlatform = member && isPlatformAdmin(member) && !isGemachRoute;
  const showBoard =
    member && isBoardMember(member) && !isPlatformAdmin(member) && !isGemachRoute;
  const showDisputeResolverOnly =
    member &&
    member.role === "DISPUTE_RESOLVER" &&
    !isBoardMember(member) &&
    !isPlatformAdmin(member);
  const showGemach =
    member &&
    isGemachScopedAdmin(member) &&
    (isGemachRoute || (!isPlatformAdmin(member) && !showBoard && !showDisputeResolverOnly));

  const tabs: { href: string; label: string; match: (p: string) => boolean }[] = showPlatform
    ? platformTabs
    : showBoard
      ? boardTabs
      : showDisputeResolverOnly
        ? [disputesTab]
        : showGemach
          ? gemachTabPaths.map((tab) => ({ ...tab, href: hrefWithGemachId(tab.path) }))
          : platformTabs;

  return (
    <>
      <nav className="mb-6 flex gap-2 overflow-x-auto rounded-xl bg-warm-50 p-1 ring-1 ring-[var(--border)]">
        {tabs.map((tab) => {
          const active = tab.match(pathname);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "shrink-0 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors",
                active
                  ? "bg-white text-kerem-800 shadow-sm"
                  : "text-[var(--muted)] hover:text-stone-800"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
        {member && isPlatformAdmin(member) && hasOwnedGemachim(member) && (
          <Link
            href={isGemachRoute ? "/admin" : hrefWithGemachId("/admin/gemach")}
            className="mr-auto shrink-0 rounded-lg px-3 py-2.5 text-xs font-medium text-[var(--muted)] hover:text-stone-800"
          >
            {isGemachRoute ? "← מנהל פלטפורמה" : "גמ״ח שלי →"}
          </Link>
        )}
      </nav>
      {showGemach && isGemachRoute && <GemachSelector />}
    </>
  );
}
