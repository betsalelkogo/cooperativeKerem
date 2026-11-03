import { formatDatePartsHe } from "@/lib/dates";
import { cn } from "@/lib/cn";

const NAVY = "#1e2b42";
const CLAY = "#c46a3a";
const OLIVE = "#6e7a46";
const CREAM = "#f4efe4";
const WOOD = "#8a5a32";

export function BrandStripe() {
  return (
    <div className="flex h-1.5" aria-hidden>
      <span className="flex-1 bg-kerem-800" />
      <span className="flex-1 bg-accent" />
      <span className="flex-1 bg-olive" />
      <span className="w-[18%] bg-kerem-800" />
    </div>
  );
}

type MarkKind = "power" | "clean" | "ladder" | "kids" | "garden" | "chair" | "box";

function markKind(category?: string): MarkKind {
  const c = category ?? "";
  if (c.includes("חשמל")) return "power";
  if (c.includes("ניקוי")) return "clean";
  if (c.includes("גישה")) return "ladder";
  if (c.includes("תינוק") || c.includes("ילד")) return "kids";
  if (c.includes("גינון")) return "garden";
  if (c.includes("כיסא") || c.includes("ריהוט") || c.includes("שולח")) return "chair";
  return "box";
}

export function ToolMark({
  category,
  className,
}: {
  category?: string;
  className?: string;
}) {
  const kind = markKind(category);
  return (
    <svg viewBox="0 0 160 96" className={className} aria-hidden>
      {kind === "power" && <PowerTool />}
      {kind === "clean" && <Bucket />}
      {kind === "ladder" && <Ladder />}
      {kind === "kids" && <Wagon />}
      {kind === "garden" && <Garden />}
      {kind === "chair" && <Chair />}
      {kind === "box" && <Toolbox />}
    </svg>
  );
}

function PowerTool() {
  return (
    <g>
      <rect x="28" y="38" width="62" height="28" rx="6" fill={NAVY} />
      <path d="M36 66l14 16h22l-8-16" fill={NAVY} />
      <rect x="86" y="44" width="16" height="16" rx="2" fill={CLAY} />
      <rect x="102" y="49" width="28" height="6" rx="1" fill={OLIVE} />
      <circle cx="48" cy="52" r="4" fill={CREAM} />
    </g>
  );
}

function Bucket() {
  return (
    <g>
      <path d="M48 34h64l-8 40H56z" fill={NAVY} />
      <path d="M56 34c0-12 48-12 48 0" fill="none" stroke={CLAY} strokeWidth="5" />
      <rect x="58" y="48" width="44" height="6" rx="2" fill={CREAM} />
    </g>
  );
}

function Ladder() {
  return (
    <g>
      <path d="M58 18l-16 64" stroke={NAVY} strokeWidth="6" strokeLinecap="round" />
      <path d="M102 18l16 64" stroke={NAVY} strokeWidth="6" strokeLinecap="round" />
      <path d="M50 36h64M46 52h72M42 68h80" stroke={CLAY} strokeWidth="5" strokeLinecap="round" />
    </g>
  );
}

function Wagon() {
  return (
    <g>
      <path d="M36 58h78l-8-24H48z" fill={CLAY} />
      <path d="M114 58V40h12" fill="none" stroke={NAVY} strokeWidth="5" strokeLinecap="round" />
      <circle cx="58" cy="68" r="10" fill={NAVY} />
      <circle cx="98" cy="68" r="10" fill={NAVY} />
      <circle cx="58" cy="68" r="4" fill={CREAM} />
      <circle cx="98" cy="68" r="4" fill={CREAM} />
    </g>
  );
}

function Garden() {
  return (
    <g>
      <ellipse cx="80" cy="74" rx="46" ry="8" fill="#e4ead6" />
      <path d="M78 70V28" stroke={WOOD} strokeWidth="5" strokeLinecap="round" />
      <path d="M76 40c-22-4-28 16-10 22 8-10 10-16 10-22z" fill={OLIVE} />
      <path d="M80 36c20-10 32 8 14 22-8-8-12-14-14-22z" fill={CLAY} />
      <path d="M62 70l18-16 8 6-10 16z" fill={NAVY} />
    </g>
  );
}

function Chair() {
  return (
    <g>
      <path d="M48 28h10v28H48zM102 28h10v28h-10z" fill={NAVY} />
      <rect x="44" y="50" width="72" height="10" rx="2" fill={CLAY} />
      <path d="M52 60v16M108 60v16" stroke={NAVY} strokeWidth="6" strokeLinecap="round" />
    </g>
  );
}

function Toolbox() {
  return (
    <g>
      <rect x="36" y="40" width="88" height="36" rx="4" fill={NAVY} />
      <path d="M62 40v-8a18 18 0 0 1 36 0v8" fill="none" stroke={CLAY} strokeWidth="5" />
      <rect x="70" y="52" width="20" height="12" rx="2" fill={OLIVE} />
    </g>
  );
}

export function YardBand({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 720 96"
      preserveAspectRatio="xMidYMax slice"
      className={className}
      aria-hidden
    >
      <circle cx="86" cy="28" r="13" fill={CLAY} />
      <path
        d="M0 74c70-10 120 8 190 2s110-14 180-4 120 12 190 0 100-16 160-6v30H0z"
        fill={OLIVE}
      />
      <path d="M248 74V48h64v26" fill={CREAM} stroke={NAVY} strokeWidth="2.5" />
      <path d="M238 50l42-24 42 24" fill={CLAY} />
      <rect x="272" y="56" width="16" height="18" fill={NAVY} />
      <rect x="430" y="58" width="6" height="16" fill={WOOD} />
      <circle cx="433" cy="50" r="14" fill="#5f6b38" />
      <circle cx="448" cy="56" r="10" fill={OLIVE} />
      <path d="M520 74V52h52v22" fill={CREAM} stroke={NAVY} strokeWidth="2.5" />
      <path d="M512 54l26-16 26 16" fill={NAVY} />
      <rect x="538" y="60" width="14" height="14" fill={CLAY} />
      <rect x="620" y="56" width="40" height="18" rx="2" fill={NAVY} />
      <path d="M632 56v-7h16v7" fill="none" stroke={CLAY} strokeWidth="3" />
    </svg>
  );
}

const glyphProps = {
  viewBox: "0 0 32 32",
  className: "h-6 w-6",
  "aria-hidden": true as const,
};

export function NavGlyph({ name }: { name: "tools" | "calendar" | "clipboard" | "key" | "house" }) {
  if (name === "calendar") {
    return (
      <svg {...glyphProps}>
        <rect x="6" y="7" width="20" height="19" rx="2" fill="currentColor" />
        <rect x="6" y="7" width="20" height="6" fill={CLAY} />
        <path d="M11 5v4M21 5v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "clipboard") {
    return (
      <svg {...glyphProps}>
        <rect x="8" y="6" width="16" height="21" rx="2" fill="currentColor" />
        <rect x="12" y="4" width="8" height="4" rx="1" fill={CLAY} />
        <path d="M12 15h8M12 19h6" stroke={CREAM} strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "key") {
    return (
      <svg {...glyphProps}>
        <circle cx="11" cy="16" r="6" fill="currentColor" />
        <circle cx="11" cy="16" r="2.2" fill={CREAM} />
        <rect x="16" y="14.4" width="12" height="3.2" fill={CLAY} />
        <rect x="22" y="17.2" width="2.4" height="3.4" fill={CLAY} />
        <rect x="26" y="17.2" width="2.2" height="2.6" fill={CLAY} />
      </svg>
    );
  }
  if (name === "house") {
    return (
      <svg {...glyphProps}>
        <path d="M6 15l10-9 10 9v11H6z" fill="currentColor" />
        <path d="M4 16l12-11 12 11" fill={CLAY} />
        <rect x="13" y="18" width="6" height="8" fill={CREAM} />
      </svg>
    );
  }
  return (
    <svg {...glyphProps}>
      <rect x="5" y="13" width="22" height="12" rx="2" fill="currentColor" />
      <path d="M11 13v-3a5 5 0 0 1 10 0v3" fill="none" stroke={CLAY} strokeWidth="2.4" />
      <rect x="14" y="17" width="4" height="4" rx="0.5" fill={OLIVE} />
    </svg>
  );
}

export function DateSlip({
  label,
  iso,
  tone = "navy",
}: {
  label: string;
  iso?: string;
  tone?: "navy" | "olive" | "clay";
}) {
  const parts = formatDatePartsHe(iso);
  return (
    <div
      className={cn(
        "flex w-[4.6rem] shrink-0 flex-col items-center justify-center px-1 py-3 text-center text-white",
        tone === "olive" ? "bg-olive" : tone === "clay" ? "bg-accent" : "bg-kerem-800"
      )}
    >
      <span className="text-[10px] font-semibold text-white/75">{label}</span>
      <span className="mt-1 text-[1.65rem] font-bold leading-none">{parts?.day ?? "—"}</span>
      <span className="mt-1 max-w-full truncate px-1 text-[11px] font-medium">{parts?.month ?? ""}</span>
    </div>
  );
}
