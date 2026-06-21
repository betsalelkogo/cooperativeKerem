import type { DefectCategory } from "@/lib/types";

export const DEFECT_CATEGORIES: Array<{ id: DefectCategory; label: string }> = [
  { id: "broken", label: "שבר / נזק פיזי" },
  { id: "missing_part", label: "חסר חלק" },
  { id: "wont_start", label: "לא נדלק / לא עובד" },
  { id: "battery", label: "סוללה / חשמל" },
  { id: "other", label: "אחר" },
];

export function defectCategoryLabel(id: DefectCategory): string {
  return DEFECT_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}
