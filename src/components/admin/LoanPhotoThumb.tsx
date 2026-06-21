"use client";

import { useState } from "react";
import {
  cloudinaryThumbnailUrl,
  isDisplayableImageUrl,
  normalizeImageUrl,
} from "@/lib/cloudinary-image";

interface LoanPhotoThumbProps {
  url: string;
  label: string;
  size?: number;
}

export function LoanPhotoThumb({ url, label, size = 72 }: LoanPhotoThumbProps) {
  const [expanded, setExpanded] = useState(false);
  const fullSrc = normalizeImageUrl(url);
  const canDisplay = isDisplayableImageUrl(url);
  const thumbSrc = canDisplay ? cloudinaryThumbnailUrl(fullSrc, size) : "";
  const [imgSrc, setImgSrc] = useState(thumbSrc);
  const [failed, setFailed] = useState(!canDisplay);

  function handleImgError() {
    if (imgSrc !== fullSrc && canDisplay) {
      setImgSrc(fullSrc);
      return;
    }
    setFailed(true);
  }

  if (failed) {
    return (
      <div
        className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-[var(--border)] bg-warm-50 p-1"
        title="התמונה לא זמינה"
      >
        <div
          className="flex items-center justify-center rounded-md bg-warm-100 text-[var(--muted)]"
          style={{ width: size, height: size }}
        >
          <span className="text-lg">📷</span>
        </div>
        <span className="text-[10px] font-semibold text-[var(--muted)]">{label}</span>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="group flex flex-col items-center gap-1 rounded-lg border border-[var(--border)] bg-warm-50 p-1 transition hover:border-kerem-300 hover:bg-kerem-50"
        title={`${label} — לחצו להגדלה`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imgSrc}
          alt={label}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={handleImgError}
          className="rounded-md object-cover bg-warm-100"
          style={{ width: size, height: size }}
        />
        <span className="text-[10px] font-semibold text-[var(--muted)] group-hover:text-kerem-800">
          {label}
        </span>
      </button>

      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setExpanded(false)}
          role="dialog"
          aria-modal="true"
          aria-label={label}
        >
          <div
            className="relative max-h-[90vh] max-w-[90vw]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={fullSrc}
              alt={label}
              referrerPolicy="no-referrer"
              className="max-h-[85vh] max-w-full rounded-xl object-contain shadow-2xl"
            />
            <p className="mt-2 text-center text-sm font-semibold text-white">{label}</p>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="absolute -top-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full bg-white text-stone-700 shadow-md hover:bg-warm-100"
              aria-label="סגור"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  );
}
