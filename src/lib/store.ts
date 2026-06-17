import type { Loan, MaintenanceTicket, Member, Reservation, Tool, Transaction } from "./types";

export const mockTools: Tool[] = [
  {
    id: "tool-001",
    name: "מסור עגול",
    description: "מסור עגול מקצועי לחיתוך עץ",
    category: "כלי עבודה חשמליים",
    qrCode: "KEREM-TOOL-001",
    status: "available",
    loanFeeMin: 20,
    loanFeeMax: 50,
    safetyRules: [
      { id: "sr-1", text: "חובה לעטות משקפי מגן בכל עת" },
      { id: "sr-2", text: "אין להפעיל את המכשיר ליד מקור מים" },
      { id: "sr-3", text: "קראתי את הוראות השימוש" },
    ],
  },
  {
    id: "tool-002",
    name: "מכונת שטיפה בלחץ",
    description: "מכונת שטיפה בלחץ לניקוי חוץ",
    category: "ניקוי",
    qrCode: "KEREM-TOOL-002",
    status: "available",
    loanFeeMin: 30,
    loanFeeMax: 50,
    safetyRules: [
      { id: "sr-4", text: "אין לכוון את המכשיר לעבר אנשים או בעלי חיים" },
      { id: "sr-5", text: "יש לעטות נעליים מונעות החלקה" },
      { id: "sr-6", text: "קראתי את הוראות השימוש" },
    ],
  },
  {
    id: "tool-003",
    name: "סולם (3 מ')",
    description: "סולם אלומיניום טלסקופי",
    category: "גישה",
    qrCode: "KEREM-TOOL-003",
    status: "available",
    loanFeeMin: 20,
    loanFeeMax: 30,
    safetyRules: [
      { id: "sr-7", text: "יש לוודא שהסולם על קרקע יציבה ומישורית" },
      { id: "sr-8", text: "אין לחרוג ממשקל העומס המרבי" },
      { id: "sr-9", text: "קראתי את הוראות השימוש" },
    ],
  },
];

export const mockMember: Member = {
  id: "member-001",
  name: "חבר לדוגמה",
  email: "member@example.com",
  hasPaymentMethod: true,
};

export const mockReservations: Reservation[] = [];
export const mockLoans: Loan[] = [];
export const mockTransactions: Transaction[] = [];
export const mockTickets: MaintenanceTicket[] = [];

export function findToolById(id: string): Tool | undefined {
  return mockTools.find((t) => t.id === id);
}

export function findToolByQrCode(qrCode: string): Tool | undefined {
  return mockTools.find((t) => t.qrCode === qrCode);
}

export function findReservationById(id: string): Reservation | undefined {
  return mockReservations.find((r) => r.id === id);
}

export function findLoanById(id: string): Loan | undefined {
  return mockLoans.find((l) => l.id === id);
}

export function findActiveLoanForMember(memberId: string): Loan | undefined {
  return mockLoans.find(
    (l) => l.memberId === memberId && (l.status === "active" || l.status === "checkout_pending")
  );
}
