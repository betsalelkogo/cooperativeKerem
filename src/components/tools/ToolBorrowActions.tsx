"use client";

import Link from "next/link";
import { useAuth } from "@/contexts/AuthProvider";
import { isKindReservable } from "@/lib/tool-kinds";
import { isPaidMember, MEMBERSHIP_REQUIRED_CODE } from "@/lib/membership";
import { InstantLoanButton } from "@/components/tools/InstantLoanButton";
import { JoinMembershipBanner } from "@/components/membership/JoinMembershipBanner";
import type { ToolKindWithAvailability } from "@/lib/types";

export function ToolBorrowActions({
  kind,
  variant = "detail",
}: {
  kind: ToolKindWithAvailability;
  variant?: "detail" | "card";
}) {
  const { member, loading } = useAuth();
  const reservable = isKindReservable(kind);
  const coopTool = !kind.isPartnerGemach;
  const needsMembership = coopTool && !isPaidMember(member);

  if (loading) return null;
  if (needsMembership) {
    if (variant === "card") return null;
    return <JoinMembershipBanner reason={MEMBERSHIP_REQUIRED_CODE} />;
  }
  if (!reservable) {
    if (variant === "card") {
      return (
        <div className="text-right sm:text-left">
          <span className="block text-sm text-[var(--muted)]">לא זמין</span>
          {kind.availabilityLabel && (
            <span className="mt-0.5 block text-xs font-semibold text-accent-800">
              {kind.availabilityLabel}
            </span>
          )}
        </div>
      );
    }
    return null;
  }

  if (variant === "card") {
    return (
      <div className="flex w-full min-w-0 flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center">
        {kind.availableUnits > 0 && (
          <InstantLoanButton
            kindId={kind.catalogId}
            availableUnits={kind.availableUnits}
            compact
          />
        )}
        <Link
          href={`/tools/${kind.catalogId}/reserve`}
          className="inline-flex items-center justify-center rounded-xl bg-kerem-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-kerem-800"
        >
          שריון
        </Link>
        {kind.availableUnits === 0 && (
          <span className="text-xs font-medium text-[var(--muted)]">
            {kind.availabilityLabel ?? "לא זמין עכשיו — אפשר לשריין למועד מאוחר יותר"}
          </span>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="flex min-w-0 flex-col gap-3">
        <Link
          href={`/tools/${kind.catalogId}/reserve`}
          className="inline-flex w-full items-center justify-center rounded-xl bg-kerem-700 py-3.5 text-base font-bold text-white transition hover:bg-kerem-800 sm:w-auto sm:px-8"
        >
          שריון {kind.totalUnits > 1 ? "יחידות" : "הכלי"}
        </Link>
        {kind.availableUnits > 0 && (
          <InstantLoanButton
            kindId={kind.catalogId}
            availableUnits={kind.availableUnits}
          />
        )}
      </div>
      {kind.availableUnits > 0 && (
        <p className="mt-2 text-xs text-[var(--muted)]">
          «השאלה מיידית» — דילוג על שלב השריון: הכלי נלקח עכשיו ומועבר ישירות לתשלום ולקיחה.
        </p>
      )}
      {kind.availableUnits === 0 && (
        <p className="mt-2 text-xs text-[var(--muted)]">
          הכלי מושאל או שמור עכשיו — אפשר לשריין חלון אחרי ההחזרה, או להאריך אם הוא כבר אצלכם.
        </p>
      )}
    </>
  );
}
