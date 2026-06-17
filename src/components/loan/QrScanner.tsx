"use client";

import { useState } from "react";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

interface QrScannerProps {
  onScan: (code: string) => void;
}

export function QrScanner({ onScan }: QrScannerProps) {
  const [manualCode, setManualCode] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (manualCode.trim()) {
      onScan(manualCode.trim().toUpperCase());
    }
  }

  return (
    <Card>
      <CardBody>
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-xl">
            📱
          </span>
          <div>
            <h3 className="font-bold text-stone-900">סריקת קוד QR</h3>
            <p className="text-sm text-[var(--muted)]">כוונו למדבקה על הכלי או הזינו ידנית</p>
          </div>
        </div>

        <div className="relative mb-4 flex h-44 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-stone-800 to-stone-900">
          <div className="absolute inset-8 rounded-lg border-2 border-dashed border-white/30" />
          <div className="absolute left-1/2 top-1/2 h-0.5 w-3/4 -translate-x-1/2 -translate-y-1/2 animate-pulse bg-kerem-400/60" />
          <p className="relative z-10 text-sm font-medium text-stone-400">סורק מצלמה — בקרוב</p>
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            placeholder="KEREM-TOOL-001"
            dir="ltr"
            className="flex-1 rounded-xl border border-[var(--border)] bg-warm-50/50 px-4 py-2.5 text-sm transition focus:border-kerem-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-kerem-200"
          />
          <Button type="submit">אימות</Button>
        </form>
      </CardBody>
    </Card>
  );
}
