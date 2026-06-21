"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { loanStatusLabels, reservationStatusLabels } from "@/lib/labels";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatDateHe, formatReservationSchedule } from "@/lib/dates";
import { canStartCheckout } from "@/lib/reservation-checkout";
import { formatNoShowDeadlineHe } from "@/lib/reservation-expiry";
import { authFetch } from "@/lib/api-client";
import { compressImageFile } from "@/lib/compress-image";
import type { Loan, Reservation, Tool } from "@/lib/types";

export interface LoanWithTool {
  loan: Loan;
  tool: Tool | null;
}

export interface ReservationWithTool {
  reservation: Reservation;
  tool: Tool | null;
}

export function formatActivityDate(iso?: string) {
  return formatDateHe(iso, Boolean(iso?.includes("T")));
}

interface ReservationCardProps {
  reservation: Reservation;
  tool: Tool | null;
  cancelling?: boolean;
  onCancel?: (reservationId: string) => void;
}

export function ReservationCard({
  reservation,
  tool,
  cancelling,
  onCancel,
}: ReservationCardProps) {
  const schedule = formatReservationSchedule(reservation);
  const checkoutGate = canStartCheckout(reservation, tool);

  return (
    <Card className="border-amber-200 bg-amber-50/40">
      <CardBody className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-2xl">
            📅
          </span>
          <div>
            <p className="font-bold text-stone-900">{tool?.name ?? reservation.toolId}</p>
            <p className="text-sm text-[var(--muted)]">
              {reservation.cancelReason === "no_show"
                ? "בוטל — לא הגיע לקיחה בזמן"
                : reservationStatusLabels[reservation.status]}
            </p>
            <p className="text-xs text-[var(--muted)]">
              נשמר: {formatActivityDate(reservation.createdAt)}
            </p>
            <p className="text-xs text-[var(--muted)]">
              {schedule.duration ? `משך: ${schedule.duration} · ` : ""}
              איסוף: {schedule.pickup}
            </p>
            <p className="text-xs text-[var(--muted)]">החזרה עד: {schedule.return}</p>
            {(reservation.status === "confirmed" || reservation.status === "pending") && (
              <p className="text-xs font-medium text-amber-800">
                לקיחה עד: {formatNoShowDeadlineHe(reservation)} (2 שעות ממועד האיסוף)
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {tool && <StatusBadge status={tool.status} />}
          {onCancel && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={cancelling}
              onClick={() => onCancel(reservation.id)}
            >
              {cancelling ? "מבטל..." : "בטל שריון"}
            </Button>
          )}
          {checkoutGate.allowed ? (
            <Link
              href={`/checkout/${reservation.id}`}
              className="rounded-xl bg-kerem-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-kerem-800"
            >
              המשך ללקיחה
            </Link>
          ) : (
            <span
              className="max-w-[12rem] rounded-xl bg-stone-100 px-3 py-2 text-xs font-medium text-stone-600"
              title={checkoutGate.reason}
            >
              {checkoutGate.reason}
            </span>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

interface LoanCardProps {
  loan: Loan;
  tool: Tool | null;
  getToken?: () => Promise<string | null>;
  onPhotoAdded?: () => void;
}

export function LoanCard({ loan, tool, getToken, onPhotoAdded }: LoanCardProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const extraPhotos = loan.additionalPhotoUrls?.length ?? 0;

  async function handleExtraPhoto(file: File) {
    if (!getToken) return;
    setUploading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const compressed = await compressImageFile(file);
      const formData = new FormData();
      formData.append("photo", compressed, "photo.jpg");
      const res = await authFetch(`/api/loans/${loan.id}/photos`, {
        method: "POST",
        token,
        body: formData,
      });
      if (res.ok) onPhotoAdded?.();
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card className="transition hover:shadow-md">
      <CardBody className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-warm-100 text-2xl">
            🔧
          </span>
          <div>
            <p className="font-bold text-stone-900">{tool?.name ?? loan.toolId}</p>
            <p className="text-sm text-[var(--muted)]">{loanStatusLabels[loan.status]}</p>
            {loan.checkedOutAt && (
              <p className="text-xs text-[var(--muted)]">
                נלקח: {formatActivityDate(loan.checkedOutAt)}
              </p>
            )}
            {loan.dueReturnDate && (
              <p className="text-xs text-[var(--muted)]">
                החזרה מתוכננת: {formatDateHe(loan.dueReturnDate)}
              </p>
            )}
            {loan.checkoutConditionNotes && (
              <p className="mt-1 text-xs text-stone-600">
                מצב בלקיחה: {loan.checkoutConditionNotes}
              </p>
            )}
            {extraPhotos > 0 && (
              <p className="text-xs text-sky-700">{extraPhotos} צילומים נוספים בתיעוד</p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {tool && <StatusBadge status={tool.status} />}
          {loan.status === "active" && getToken && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleExtraPhoto(file);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? "מעלה…" : "צילום נוסף"}
              </Button>
            </>
          )}
          {loan.status === "active" && (
            <Link
              href={`/return/${loan.id}`}
              className="rounded-xl bg-kerem-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-kerem-800"
            >
              החזרה וסגירה
            </Link>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

export function ActivityLoading() {
  return (
    <div className="flex justify-center py-20">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-kerem-200 border-t-kerem-700" />
    </div>
  );
}
