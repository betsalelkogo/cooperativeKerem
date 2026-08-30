import Link from "next/link";

interface PeerDebtBannerProps {
  className?: string;
}

/** Shown when a reservation is blocked because of open peer-credit debt. */
export function PeerDebtBanner({ className = "" }: PeerDebtBannerProps) {
  return (
    <div
      className={`min-w-0 rounded-xl border border-red-200 bg-red-50 p-4 ${className}`}
    >
      <p className="text-sm font-bold text-red-900">יש חוב פתוח לחבר</p>
      <p className="mt-1 break-words text-xs leading-relaxed text-red-800">
        אי אפשר לשריין או לקחת כלי מהקואופרטיב עד שהחוב יוחזר במלואו.
      </p>
      <Link
        href="/account"
        className="mt-3 inline-flex min-h-[44px] items-center rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-red-700"
      >
        לעו״ש ולהחזרת חוב
      </Link>
    </div>
  );
}
