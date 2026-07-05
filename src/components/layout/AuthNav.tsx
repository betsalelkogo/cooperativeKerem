"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthProvider";
import { isAdminMember, isGemachAdmin, isPlatformAdmin } from "@/lib/admin";
import { formatCredits } from "@/lib/pots";
import { cn } from "@/lib/cn";
import type { Member } from "@/lib/types";
import { SiteLogo } from "@/components/layout/SiteLogo";

const baseNavItems = [
  { href: "/tools", label: "כלים" },
  { href: "/my-reservations", label: "שריונים" },
  { href: "/my-loans", label: "השאלות" },
  { href: "/account", label: "עו״ש" },
];

const platformAdminNavItems = [
  { href: "/admin", label: "ניהול" },
  { href: "/admin/members", label: "חברים" },
  { href: "/admin/pots", label: "קופות" },
];

const gemachAdminNavItems = [
  { href: "/admin/gemach", label: "ניהול גמ״ח" },
  { href: "/admin/gemach/pots", label: "קופות גמ״ח" },
];

const addGemachNavItem = { href: "/gemach/new", label: "הוסף גמ״ח" };

function adminNavItemsForMember(member: Member) {
  if (isPlatformAdmin(member)) return platformAdminNavItems;
  if (isGemachAdmin(member)) return gemachAdminNavItems;
  return [];
}

export function AuthNav() {
  const { user, member, loading, configured, signOut } = useAuth();
  const pathname = usePathname();
  const isLoginPage = pathname.startsWith("/login");
  const navItems =
    member && isAdminMember(member)
      ? [...baseNavItems, ...adminNavItemsForMember(member)]
      : user
        ? [...baseNavItems, addGemachNavItem]
        : baseNavItems;

  if (isLoginPage) {
    return (
      <header
        className="border-b border-[var(--border)] bg-white/90 backdrop-blur-lg"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-center px-4 py-4">
          <div className="flex items-center gap-3">
            <SiteLogo size="sm" priority />
            <span className="text-xl font-bold text-kerem-900">כרם רעים</span>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header
      className="sticky top-0 z-50 border-b border-[var(--border)] bg-white/90 backdrop-blur-lg"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6 sm:py-3">
        <Link href="/tools" className="group flex shrink-0 items-center gap-3">
          <SiteLogo size="sm" priority />
          <div>
            <span className="block text-base font-bold leading-tight text-kerem-900 sm:text-lg">
              כרם רעים
            </span>
            <span className="hidden text-[10px] font-medium text-[var(--muted)] sm:block">
              קואופרטיב הציוד
            </span>
          </div>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-xl px-3.5 py-2 text-sm font-medium transition-all",
                  active
                    ? "bg-kerem-50 text-kerem-800"
                    : "text-[var(--muted)] hover:bg-warm-50 hover:text-stone-800"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          {user && member && (
            <Link
              href="/account"
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800 transition hover:bg-emerald-100"
              title="העו״ש שלי — היתרה"
            >
              <span aria-hidden>💰</span>
              {formatCredits(member.creditBalance ?? 0)}
            </Link>
          )}
          {loading ? (
            <div className="h-10 w-16 animate-pulse rounded-xl bg-warm-100" />
          ) : user ? (
            <button
              type="button"
              onClick={() => signOut()}
              className="min-h-[44px] rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-medium text-stone-600 active:bg-warm-50"
            >
              יציאה
            </button>
          ) : configured ? (
            <Link
              href="/login"
              className="min-h-[44px] rounded-xl bg-kerem-700 px-4 py-2.5 text-sm font-semibold text-white shadow-md active:bg-kerem-800"
            >
              התחברות
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mt-auto hidden border-t border-[var(--border)] bg-white/60 py-8 md:block">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-3">
            <SiteLogo size="sm" />
            <span className="font-semibold text-kerem-900">כרם רעים — קואופרטיב הציוד</span>
          </div>
          <p className="text-sm text-[var(--muted)]">שיתוף ציוד · קופות חכמות · בטיחות קודמת</p>
        </div>
      </div>
    </footer>
  );
}
