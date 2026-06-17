"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthProvider";
import { isGemachAdmin, isPlatformAdmin, isGemachScopedAdmin, hasOwnedGemachim } from "@/lib/admin";
import { cn } from "@/lib/cn";

const platformTabs = [
  { href: "/admin", label: "לוח בקרה", match: (p: string) => p === "/admin" },
  { href: "/admin/pots", label: "קופות", match: (p: string) => p.startsWith("/admin/pots") },
];

const gemachTabs = [
  { href: "/admin/gemach", label: "לוח בקרה", match: (p: string) => p === "/admin/gemach" },
  {
    href: "/admin/gemach/tools/new",
    label: "הוסף כלי",
    match: (p: string) => p.startsWith("/admin/gemach/tools"),
  },
  {
    href: "/admin/gemach/pots",
    label: "קופות",
    match: (p: string) => p.startsWith("/admin/gemach/pots"),
  },
];

export function AdminNav() {
  const pathname = usePathname();
  const { member } = useAuth();

  const isGemachRoute = pathname.startsWith("/admin/gemach");
  const showPlatform = member && isPlatformAdmin(member) && !isGemachRoute;
  const showGemach =
    member &&
    isGemachScopedAdmin(member) &&
    (isGemachRoute || !isPlatformAdmin(member));

  const tabs = showPlatform ? platformTabs : showGemach ? gemachTabs : platformTabs;

  return (
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
          href={isGemachRoute ? "/admin" : "/admin/gemach"}
          className="mr-auto shrink-0 rounded-lg px-3 py-2.5 text-xs font-medium text-[var(--muted)] hover:text-stone-800"
        >
          {isGemachRoute ? "← מנהל פלטפורמה" : "גמ״ח שלי →"}
        </Link>
      )}
    </nav>
  );
}
