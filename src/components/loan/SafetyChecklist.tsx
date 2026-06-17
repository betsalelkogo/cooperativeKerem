"use client";

import { useState } from "react";
import type { SafetyRule } from "@/lib/types";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

interface SafetyChecklistProps {
  rules: SafetyRule[];
  onComplete: () => void;
}

export function SafetyChecklist({ rules, onComplete }: SafetyChecklistProps) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const allChecked = rules.every((rule) => checked[rule.id]);

  function toggleRule(id: string) {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <Card className="overflow-hidden border-amber-200/80">
      <div className="bg-gradient-to-l from-amber-500 to-orange-500 px-6 py-4">
        <h3 className="text-lg font-bold text-white">⚠️ רשימת בטיחות</h3>
        <p className="mt-0.5 text-sm text-amber-100">
          יש לאשר את כל הכללים לפני שחרור הכלי
        </p>
      </div>
      <CardBody>
        <ul className="space-y-3">
          {rules.map((rule) => {
            const isChecked = !!checked[rule.id];
            return (
              <li key={rule.id}>
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
                    onChange={() => toggleRule(rule.id)}
                    className="mt-1 h-5 w-5 shrink-0 rounded-md border-stone-300 text-kerem-700 focus:ring-kerem-500"
                  />
                  <span className="text-sm leading-relaxed text-stone-800">{rule.text}</span>
                </label>
              </li>
            );
          })}
        </ul>
        <Button
          type="button"
          disabled={!allChecked}
          onClick={onComplete}
          className="mt-5 w-full"
          size="lg"
        >
          אישור כללי הבטיחות
        </Button>
      </CardBody>
    </Card>
  );
}
