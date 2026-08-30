"use client";

import { useState } from "react";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export function AccessCodeCard({
  title,
  hint,
  code,
  note,
  updatedAt,
  emptyLabel,
  tone = "caravan",
}: {
  title: string;
  hint?: string;
  code: string | null;
  note: string | null;
  updatedAt?: string | null;
  emptyLabel: string;
  tone?: "caravan" | "club";
}) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const well =
    tone === "club"
      ? "bg-kerem-900 text-kerem-50"
      : "bg-warm-100 text-stone-900";

  return (
    <Card>
      <CardBody className="py-5">
        <p className="text-xs font-bold uppercase tracking-widest text-[var(--muted)]">
          {title}
        </p>
        {hint && <p className="mt-1 text-sm text-[var(--muted)]">{hint}</p>}

        {code ? (
          <>
            <div className={`mt-4 rounded-xl px-4 py-6 ${well}`}>
              <p
                className="text-center font-mono text-3xl font-bold tracking-[0.35em] sm:text-4xl"
                dir="ltr"
              >
                {revealed ? code : "••••••"}
              </p>
            </div>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setRevealed((v) => !v)}>
                {revealed ? "הסתרה" : "הצגת הקוד"}
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => void copy()}>
                {copied ? "הועתק" : "העתקה"}
              </Button>
            </div>
            {updatedAt && (
              <p className="mt-3 text-center text-xs text-[var(--muted)]">
                עודכן לאחרונה: {new Date(updatedAt).toLocaleDateString("he-IL")}
              </p>
            )}
          </>
        ) : (
          <p className="mt-4 text-sm font-medium text-stone-600">{emptyLabel}</p>
        )}

        {note && <p className="mt-3 text-sm leading-relaxed text-stone-700">{note}</p>}
      </CardBody>
    </Card>
  );
}
