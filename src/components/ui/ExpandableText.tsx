"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

const clampClass: Record<number, string> = {
  3: "line-clamp-3",
  4: "line-clamp-4",
  5: "line-clamp-5",
  6: "line-clamp-6",
};

interface ExpandableTextProps {
  text: string;
  /** Collapsed line count (3–6). Default 3. */
  lines?: 3 | 4 | 5 | 6;
  className?: string;
}

export function ExpandableText({ text, lines = 3, className }: ExpandableTextProps) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [needsToggle, setNeedsToggle] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      // Only measure while collapsed so scrollHeight reflects full content.
      if (expanded) return;
      setNeedsToggle(el.scrollHeight > el.clientHeight + 1);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, lines, expanded]);

  if (!text.trim()) return null;

  return (
    <div>
      <p
        ref={ref}
        className={cn(
          "leading-relaxed whitespace-pre-line",
          !expanded && clampClass[lines],
          className
        )}
      >
        {text}
      </p>
      {needsToggle && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-sm font-semibold text-kerem-700 transition hover:text-kerem-800 hover:underline"
          aria-expanded={expanded}
        >
          {expanded ? "הצג פחות" : "הצג עוד"}
        </button>
      )}
    </div>
  );
}
