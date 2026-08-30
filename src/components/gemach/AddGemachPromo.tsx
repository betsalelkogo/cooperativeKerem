"use client";

import Link from "next/link";
import { useAuth } from "@/contexts/AuthProvider";
import { hasOwnedGemachim } from "@/lib/admin";
import { Card, CardBody } from "@/components/ui/Card";

export function AddGemachPromo() {
  const { user, member, loading } = useAuth();

  if (loading || !user) return null;
  if (member && hasOwnedGemachim(member)) return null;

  return (
    <Card className="mb-8 overflow-hidden">
      <CardBody className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-lg font-bold text-stone-900">יש לכם גמ״ח קהילתי?</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            הוסיפו אותו לפלטפורמת כרם רעים — כלים, שריונים ולוח בקרה משלכם.
          </p>
        </div>
        <Link
          href="/gemach/new"
          className="shrink-0 rounded-xl bg-kerem-700 px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-kerem-800"
        >
          הוסיפו את הגמ״ח שלכם
        </Link>
      </CardBody>
    </Card>
  );
}
