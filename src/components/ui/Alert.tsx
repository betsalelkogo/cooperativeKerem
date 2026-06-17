import { cn } from "@/lib/cn";

export function Alert({
  variant = "error",
  children,
  className,
}: {
  variant?: "error" | "success" | "warning" | "info";
  children: React.ReactNode;
  className?: string;
}) {
  const styles = {
    error: "border-red-200 bg-red-50 text-red-800",
    success: "border-kerem-200 bg-kerem-50 text-kerem-800",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    info: "border-sky-200 bg-sky-50 text-sky-900",
  };

  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3 text-sm leading-relaxed",
        styles[variant],
        className
      )}
      role="alert"
    >
      {children}
    </div>
  );
}
