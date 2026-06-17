export type ToolStatus = "available" | "reserved" | "on_loan" | "maintenance" | "disabled";

export interface SafetyRule {
  id: string;
  text: string;
}

export interface Tool {
  id: string;
  name: string;
  description: string;
  category: string;
  qrCode: string;
  status: ToolStatus;
  loanFeeMin: number;
  loanFeeMax: number;
  safetyRules: SafetyRule[];
  imageUrl?: string;
}

export interface DevicePot {
  toolId: string;
  balance: number;
  totalEarned: number;
  totalSpent: number;
}

export interface OperationsPot {
  balance: number;
  totalEarned: number;
  totalSpent: number;
}

export interface FundSplit {
  totalAmount: number;
  operationsAmount: number;
  deviceAmount: number;
  operationsPercent: number;
}

export type ReservationStatus = "pending" | "confirmed" | "cancelled" | "completed";

export interface Reservation {
  id: string;
  memberId: string;
  toolId: string;
  date: string;
  status: ReservationStatus;
  feeAmount: number;
  createdAt: string;
}

export type LoanStatus = "checkout_pending" | "active" | "return_pending" | "returned" | "disputed";

export interface Loan {
  id: string;
  reservationId: string;
  memberId: string;
  toolId: string;
  status: LoanStatus;
  safetyAcknowledged: boolean;
  checkoutPhotoUrl?: string;
  returnPhotoUrl?: string;
  checkedOutAt?: string;
  returnedAt?: string;
}

export interface MaintenanceTicket {
  id: string;
  toolId: string;
  loanId?: string;
  memberId: string;
  description: string;
  status: "open" | "in_progress" | "resolved";
  createdAt: string;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  hasPaymentMethod: boolean;
}

export interface Transaction {
  id: string;
  memberId: string;
  toolId: string;
  loanId: string;
  amount: number;
  operationsAmount: number;
  deviceAmount: number;
  createdAt: string;
}

export interface PayboxSettings {
  enabled: boolean;
  operationsGroupUrl: string;
  deviceGroupUrl: string;
  groupName?: string;
  /** Optional Grow payment page for PayBox checkout */
  growPageCode?: string;
}

export type PaymentStatus = "pending" | "paid" | "failed";
export type PaymentProvider = "paybox_group" | "grow";

export interface MemberPayment {
  id: string;
  reservationId: string;
  memberId: string;
  toolId: string;
  amount: number;
  status: PaymentStatus;
  provider: PaymentProvider;
  payboxGroupUrl: string;
  growPaymentUrl?: string;
  createdAt: string;
  paidAt?: string;
}

export type PayoutPotTarget = "operations" | "device";
export type PayoutStatus = "pending" | "completed" | "cancelled";

export interface PayboxPayout {
  id: string;
  potTarget: PayoutPotTarget;
  toolId?: string;
  amount: number;
  groupUrl: string;
  status: PayoutStatus;
  note?: string;
  createdBy: string;
  createdAt: string;
  completedAt?: string;
}
