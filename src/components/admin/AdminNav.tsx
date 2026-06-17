"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const adminTabs = [
  { href: "/admin", label: "לוח בקרה", match: (p: string) => p === "/admin" },
  { href: "/admin/pots", label: "קופות", match: (p: string) => p.startsWith("/admin/pots") },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="mb-6 flex gap-2 overflow-x-auto rounded-xl bg-warm-50 p-1 ring-1 ring-[var(--border)]">
      {adminTabs.map((tab) => {
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
    </nav>
  );
}
