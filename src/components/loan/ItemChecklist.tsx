"use client";

import { useState } from "react";
import type { IncludedItem } from "@/lib/types";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

interface ItemChecklistProps {
  items: IncludedItem[];
  title: string;
  description: string;
  confirmLabel: string;
  onComplete: (checkedIds: string[]) => void;
}

export function ItemChecklist({
  items,
  title,
  description,
  confirmLabel,
  onComplete,
}: ItemChecklistProps) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const allChecked = items.every((item) => checked[item.id]);

  function toggleItem(id: string) {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <Card className="overflow-hidden border-sky-200/80">
      <div className="bg-gradient-to-l from-sky-600 to-blue-600 px-6 py-4">
        <h3 className="text-lg font-bold text-white">{title}</h3>
        <p className="mt-0.5 text-sm text-sky-100">{description}</p>
      </div>
      <CardBody>
        <ul className="space-y-3">
          {items.map((item) => {
            const isChecked = !!checked[item.id];
            return (
              <li key={item.id}>
                <label
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-xl border p-4 min-h-[56px] transition-all",
                    isChecked
                      ? "border-kerem-300 bg-kerem-50"
                      : "border-[var(--border)] bg-warm-50/50 hover:border-stone-300"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleItem(item.id)}
                    className="mt-1 h-5 w-5 shrink-0 rounded-md border-stone-300 text-kerem-700 focus:ring-kerem-500"
                  />
                  <span className="text-sm leading-relaxed text-stone-800">{item.label}</span>
                </label>
              </li>
            );
          })}
        </ul>
        <Button
          type="button"
          disabled={!allChecked}
          onClick={() => onComplete(items.filter((i) => checked[i.id]).map((i) => i.id))}
          className="mt-5 w-full"
          size="lg"
        >
          {confirmLabel}
        </Button>
      </CardBody>
    </Card>
  );
}

interface ConditionNotesProps {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onContinue: () => void;
  continueLabel: string;
  required?: boolean;
}

export function ConditionNotes({
  label,
  placeholder,
  value,
  onChange,
  onContinue,
  continueLabel,
  required = false,
}: ConditionNotesProps) {
  return (
    <Card>
      <CardBody className="space-y-4">
        <div>
          <label htmlFor="condition-notes" className="mb-2 block text-sm font-bold text-stone-900">
            {label}
          </label>
          <textarea
            id="condition-notes"
            rows={4}
            required={required}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full rounded-xl border border-[var(--border)] px-4 py-3 text-sm focus:border-kerem-500 focus:outline-none focus:ring-2 focus:ring-kerem-200"
          />
          <p className="mt-1.5 text-xs text-[var(--muted)]">
            תארו שריטות, חלקים חסרים, או מצב כללי — לתיעוד לפני/אחרי השימוש.
          </p>
        </div>
        <Button
          type="button"
          disabled={required && !value.trim()}
          onClick={onContinue}
          className="w-full"
          size="lg"
        >
          {continueLabel}
        </Button>
      </CardBody>
    </Card>
  );
}
