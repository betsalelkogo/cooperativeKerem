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
  /** Owning gemach — defaults to platform (kerem). */
  gemachId: string;
  /** Groups identical physical units in the catalog (defaults to tool id). */
  kindId?: string;
  /** Optional label for this unit in admin views, e.g. "יחידה 2". */
  unitLabel?: string;
}

/** Tool plus catalog availability hint for list/detail views. */
export interface ToolWithAvailability extends Tool {
  availableFrom?: string;
  availabilityLabel?: string;
  gemachName?: string;
  gemachPricingMode?: GemachPricingMode;
  priceLabel?: string;
  isPartnerGemach?: boolean;
}

/** Catalog row — one or more physical units of the same kind. */
export interface ToolKindWithAvailability extends Omit<
  ToolWithAvailability,
  "id" | "qrCode" | "status"
> {
  catalogId: string;
  kindId: string;
  status: ToolStatus;
  totalUnits: number;
  availableUnits: number;
  representativeToolId: string;
}

export type GemachPricingMode = "free" | "loan_fee" | "maintenance_only";

export interface Gemach {
  id: string;
  name: string;
  slug: string;
  description?: string;
  pricingMode: GemachPricingMode;
  maintenanceFee?: number;
  /** Partner gemach PayBox group link for loan/maintenance payments. */
  payboxGroupUrl?: string;
  isPlatform: boolean;
  active: boolean;
  /** Set when the gemach is permanently closed. */
  closedAt?: string;
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
  /** Planned pickup date (YYYY-MM-DD). */
  pickupDate: string;
  /** Expected return date (YYYY-MM-DD). */
  returnDate: string;
  status: ReservationStatus;
  feeAmount: number;
  /** When the reservation was created. */
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
  /** When the tool was physically picked up. */
  checkedOutAt?: string;
  /** Expected return date from reservation (YYYY-MM-DD). */
  dueReturnDate?: string;
  /** When the tool was actually returned. */
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

export type MemberRole = "ADMIN" | "GEMACH_ADMIN" | "MEMBER";

export interface Member {
  id: string;
  name: string;
  email: string;
  hasPaymentMethod: boolean;
  role: MemberRole;
  /** Gemach IDs this member can admin (when role is GEMACH_ADMIN). */
  gemachAdminIds?: string[];
}

export interface AdminDashboardLoan {
  id: string;
  toolId: string;
  toolName: string;
  memberId: string;
  memberName: string;
  memberEmail: string;
  status: LoanStatus;
  checkedOutAt?: string;
  dueReturnDate?: string;
}

export interface AdminDashboardReservation {
  id: string;
  toolId: string;
  toolName: string;
  memberId: string;
  memberName: string;
  memberEmail: string;
  status: ReservationStatus;
  pickupDate: string;
  returnDate: string;
  createdAt: string;
}

export interface AdminDashboardToolUnitRow {
  id: string;
  unitLabel?: string;
  status: ToolStatus;
  borrowerName?: string;
  borrowerEmail?: string;
  holderKind?: "reservation" | "loan";
}

/** One catalog row in admin — may represent multiple physical units. */
export interface AdminDashboardToolKindRow {
  kindId: string;
  name: string;
  category: string;
  gemachId: string;
  gemachName?: string;
  status: ToolStatus;
  totalUnits: number;
  availableUnits: number;
  onLoanUnits: number;
  reservedUnits: number;
  disabledUnits: number;
  maintenanceUnits: number;
  units: AdminDashboardToolUnitRow[];
}

export interface AdminDashboardToolRow {
  id: string;
  name: string;
  category: string;
  status: ToolStatus;
  borrowerName?: string;
  borrowerEmail?: string;
  holderKind?: "reservation" | "loan";
  pickupDate?: string;
  returnDate?: string;
  checkedOutAt?: string;
  reservedAt?: string;
  gemachName?: string;
  unitLabel?: string;
}

export interface AdminDashboardData {
  stats: {
    totalTools: number;
    available: number;
    onLoan: number;
    reserved: number;
    maintenance: number;
    disabled: number;
    activeLoans: number;
    activeReservations: number;
  };
  tools: AdminDashboardToolKindRow[];
  activeLoans: AdminDashboardLoan[];
  activeReservations: AdminDashboardReservation[];
  gemach?: Gemach;
  gemachim?: Gemach[];
}

export interface AdminToolKindEdit {
  kindId: string;
  gemachId: string;
  name: string;
  description: string;
  category: string;
  loanFeeMin: number;
  loanFeeMax: number;
  totalUnits: number;
  pricingMode: GemachPricingMode;
}

export interface AdminMemberSummary {
  id: string;
  name: string;
  email: string;
  role: MemberRole;
  gemachAdminIds?: string[];
}

export interface AdminMemberHistory {
  member: AdminMemberSummary;
  loans: Array<{
    id: string;
    toolId: string;
    toolName: string;
    status: LoanStatus;
    checkedOutAt?: string;
    dueReturnDate?: string;
    returnedAt?: string;
  }>;
  reservations: Array<{
    id: string;
    toolId: string;
    toolName: string;
    status: ReservationStatus;
    pickupDate: string;
    returnDate: string;
    createdAt: string;
  }>;
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
