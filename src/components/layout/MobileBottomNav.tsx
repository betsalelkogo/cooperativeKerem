"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const tabs = [
  { href: "/tools", label: "כלים", icon: "🔧", match: (p: string) => p.startsWith("/tools") },
  { href: "/my-loans", label: "השאלות", icon: "📋", match: (p: string) => p.startsWith("/my-loans") },
  {
    href: "/admin/pots",
    label: "קופות",
    icon: "💰",
    match: (p: string) => p.startsWith("/admin"),
  },
];

const HIDDEN_PREFIXES = ["/login", "/checkout", "/return"];

export function MobileBottomNav() {
  const pathname = usePathname();

  const hidden = HIDDEN_PREFIXES.some((p) => pathname.startsWith(p));
  if (hidden) return null;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--border)] bg-white/95 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] backdrop-blur-lg md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      aria-label="ניווט ראשי"
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around px-1 pt-1">
        {tabs.map((tab) => {
          const active = tab.match(pathname);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "relative flex min-h-[56px] min-w-[72px] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-2 transition-colors",
                "active:bg-kerem-50",
                active ? "text-kerem-800" : "text-[var(--muted)]"
              )}
            >
              {active && (
                <span className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-kerem-600" />
              )}
              <span className="text-[22px] leading-none">{tab.icon}</span>
              <span className={cn("text-[10px] font-bold leading-tight", active && "text-kerem-700")}>
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
