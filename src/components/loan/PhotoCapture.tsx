"use client";

import { useRef, useState } from "react";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

interface PhotoCaptureProps {
  label: string;
  onCapture: (file: File) => void;
}

export function PhotoCapture({ label, onCapture }: PhotoCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    onCapture(file);
  }

  return (
    <Card>
      <CardBody>
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-xl">
            📷
          </span>
          <div>
            <h3 className="font-bold text-stone-900">{label}</h3>
            <p className="text-sm text-[var(--muted)]">תמונה ברורה כהוכחה למצב הכלי</p>
          </div>
        </div>

        {preview ? (
          <div className="mb-4 overflow-hidden rounded-xl border border-[var(--border)] shadow-inner">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="מצב הכלי" className="h-52 w-full object-cover" />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="mb-4 flex h-52 w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-stone-200 bg-warm-50/50 text-[var(--muted)] transition hover:border-kerem-300 hover:bg-kerem-50/30 hover:text-kerem-700"
          >
            <span className="text-4xl">📸</span>
            <span className="text-sm font-medium">לחצו לצילום</span>
          </button>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleChange}
          className="hidden"
        />
        <Button
          type="button"
          variant="secondary"
          onClick={() => inputRef.current?.click()}
          className="w-full"
        >
          {preview ? "📷 צילום מחדש" : "📷 צילום"}
        </Button>
      </CardBody>
    </Card>
  );
}
