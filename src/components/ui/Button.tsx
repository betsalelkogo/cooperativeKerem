import { cn } from "@/lib/cn";

const variants = {
  primary:
    "bg-kerem-700 text-white shadow-md shadow-kerem-700/20 hover:bg-kerem-800 hover:shadow-lg hover:shadow-kerem-700/25 active:scale-[0.98]",
  secondary:
    "border border-[var(--border)] bg-white text-stone-700 shadow-sm hover:bg-warm-50 hover:border-stone-300 active:scale-[0.98]",
  ghost: "text-kerem-700 hover:bg-kerem-50 active:scale-[0.98]",
  danger:
    "bg-red-600 text-white shadow-md shadow-red-600/20 hover:bg-red-700 active:scale-[0.98]",
  accent:
    "bg-accent text-white shadow-md shadow-accent/25 hover:brightness-110 active:scale-[0.98]",
} as const;

const sizes = {
  sm: "min-h-[44px] px-3 py-2 text-sm rounded-xl",
  md: "min-h-[48px] px-5 py-2.5 text-sm rounded-xl",
  lg: "min-h-[52px] px-6 py-3.5 text-base rounded-xl w-full sm:w-auto",
} as const;

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 font-semibold transition-all duration-200",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:active:scale-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kerem-500 focus-visible:ring-offset-2",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

type ButtonLinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  href: string;
};

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <a
      className={cn(
        "inline-flex items-center justify-center gap-2 font-semibold transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kerem-500 focus-visible:ring-offset-2",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </a>
  );
}
