import Link from "next/link";
import { cn } from "@/lib/cn";

export function PageHeader({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-stone-900">{title}</h1>
        {description && (
          <p className="mt-2 max-w-2xl text-base leading-relaxed text-[var(--muted)]">
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function BackLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-kerem-700 transition hover:text-kerem-800"
    >
      <span aria-hidden="true">→</span>
      {children}
    </Link>
  );
}
