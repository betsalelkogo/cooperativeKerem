import type { LoanStatus, ReservationStatus, ToolStatus } from "./types";

export const toolStatusLabels: Record<ToolStatus, string> = {
  available: "זמין",
  reserved: "שמור",
  on_loan: "מושאל",
  maintenance: "בתחזוקה",
  disabled: "מושבת",
};

export const loanStatusLabels: Record<LoanStatus, string> = {
  checkout_pending: "ממתין ללקיחה",
  active: "פעיל",
  return_pending: "ממתין להחזרה",
  returned: "הוחזר",
  disputed: "במחלוקת",
};

export const reservationStatusLabels: Record<ReservationStatus, string> = {
  pending: "ממתין",
  confirmed: "שמור — ממתין ללקיחה",
  cancelled: "בוטל",
  completed: "הושלם",
};
