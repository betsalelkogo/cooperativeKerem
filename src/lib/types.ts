export type ToolStatus = "available" | "reserved" | "on_loan" | "maintenance" | "disabled";

export interface SafetyRule {
  id: string;
  text: string;
}

export interface IncludedItem {
  id: string;
  label: string;
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
  /** Accessories / parts that ship with the tool — checked at pickup and return. */
  includedItems?: IncludedItem[];
  imageUrl?: string;
  /** Internal admin notes — not shown to borrowers. */
  adminNotes?: string;
  /** Owning gemach — defaults to platform (kerem). */
  gemachId: string;
  /** Groups identical physical units in the catalog (defaults to tool id). */
  kindId?: string;
  /** Optional label for this unit in admin views, e.g. "יחידה 2". */
  unitLabel?: string;
  /** Override gemach default loan length (fixed_hours mode, hours). */
  defaultLoanHours?: number;
  /** Override gemach max loan length borrowers may select (fixed_hours). */
  maxLoanHours?: number;
  /** Physical storage location (e.g. מחסן קרem). */
  location?: string;
  brand?: string;
  supplier?: string;
  /** Intended use / purpose description. */
  purpose?: string;
  /** Product age in years (approximate). */
  productAge?: number;
  /** Additional gallery images (first may duplicate imageUrl). */
  imageUrls?: string[];
}

/** Tool plus catalog availability hint for list/detail views. */
export interface ToolWithAvailability extends Tool {
  availableFrom?: string;
  availabilityLabel?: string;
  gemachName?: string;
  gemachPricingMode?: GemachPricingMode;
  gemachReservationMode?: GemachReservationMode;
  gemachDefaultLoanHours?: number;
  gemachMaxLoanHours?: number;
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
  /** Units free for a specific reservation window (when computed). */
  availableUnitsInWindow?: number;
  location?: string;
  brand?: string;
  supplier?: string;
  purpose?: string;
  productAge?: number;
  imageUrls?: string[];
  /** Catalog popularity / usage stats (when loaded for detail page). */
  stats?: ToolKindStats;
}

export interface ToolKindStats {
  totalLoans: number;
  activeLoans: number;
  uniqueBorrowers: number;
}

export type GemachPricingMode = "free" | "loan_fee" | "maintenance_only";

/** How borrowers schedule reservations for this gemach. */
export type GemachReservationMode = "fixed_hours" | "date_range";

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
  /** fixed_hours = start time + duration; date_range = separate pickup/return windows. */
  reservationMode?: GemachReservationMode;
  /** Default loan length for fixed_hours mode (hours). */
  defaultLoanHours?: number;
  /** Maximum loan length borrowers may select (fixed_hours). */
  maxLoanHours?: number;
  /** Set when the gemach is permanently closed. */
  closedAt?: string;
  /** Platform cooperative fee (₪) charged on free gemach reservations. */
  cooperativeFee?: number;
  /** Default pickup / storage location for tools in this gemach. */
  location?: string;
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
  pickupTimeStart?: string;
  pickupTimeEnd?: string;
  /** Expected return date (YYYY-MM-DD). */
  returnDate: string;
  returnTimeStart?: string;
  returnTimeEnd?: string;
  status: ReservationStatus;
  feeAmount: number;
  /** Loan length in hours (fixed_hours mode). */
  loanDurationHours?: number;
  /** When the reservation was created. */
  createdAt: string;
  /** Catalog kind — all units in a multi-qty booking share this. */
  kindId?: string;
  /** Number of units reserved (default 1). */
  quantity?: number;
  /** All tool unit IDs held by this reservation. */
  toolIds?: string[];
  /** Links multi-unit reservations created together. */
  groupId?: string;
  /** Cooperative platform fee portion (free gemachim). */
  cooperativeFeeAmount?: number;
  /** Why the reservation was cancelled. */
  cancelReason?: "member" | "no_show";
  cancelledAt?: string;
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
  /** Free-text tool condition at pickup. */
  checkoutConditionNotes?: string;
  /** Free-text tool condition at return / closure. */
  returnConditionNotes?: string;
  /** IDs of included items verified at pickup. */
  checkoutItemsChecked?: string[];
  /** IDs of included items verified at return. */
  returnItemsChecked?: string[];
  /** Optional follow-up photos during active loan. */
  additionalPhotoUrls?: string[];
  /** When the tool was physically picked up. */
  checkedOutAt?: string;
  /** Expected return date from reservation (YYYY-MM-DD). */
  dueReturnDate?: string;
  /** Expected return time end (HH:MM). */
  dueReturnTimeEnd?: string;
  /** When the tool was actually returned. */
  returnedAt?: string;
  /** Links loans from the same multi-unit checkout. */
  groupId?: string;
  /** Structured defect reported at checkout. */
  checkoutDefect?: DefectRecord;
  /** Structured defect reported at return. */
  returnDefect?: DefectRecord;
  /** Borrower confirmed tool returned in good condition. */
  returnOk?: boolean;
  /** Active dispute for this loan. */
  disputeId?: string;
}

export type DefectCategory =
  | "broken"
  | "missing_part"
  | "wont_start"
  | "battery"
  | "other";

export interface DefectRecord {
  category: DefectCategory;
  description: string;
  /** Who is responsible: borrower or gemach (cooperative). */
  responsibility?: "member" | "gemach" | "unknown";
  reportedAt: string;
}

export type DisputeStatus =
  | "new"
  | "mediators_assigned"
  | "deliberating"
  | "resolved_charge"
  | "resolved_waive"
  | "closed";

export type MediatorDecision = "charge_member" | "waive_member" | "abstain";

export interface Dispute {
  id: string;
  loanId: string;
  toolId: string;
  memberId: string;
  gemachId: string;
  status: DisputeStatus;
  /** Defect details that triggered the dispute. */
  defect: DefectRecord;
  /** Assessed damage amount (₪) if mediators charge member. */
  damageAmount?: number;
  mediatorIds: string[];
  /** Mediator memberId → decision (blind until all voted). */
  mediatorDecisions?: Record<string, MediatorDecision>;
  resolvedAt?: string;
  createdAt: string;
}

export interface LateReturnFee {
  id: string;
  loanId: string;
  reservationId: string;
  memberId: string;
  toolId: string;
  gemachId: string;
  dueAt: string;
  returnedAt: string;
  lateMinutes: number;
  amount: number;
  paid: boolean;
  paidAt?: string;
  markedPaidBy?: string;
  createdAt: string;
}

export interface AdminLateReturnRow {
  id: string;
  loanId: string;
  memberId: string;
  memberName: string;
  memberEmail: string;
  toolId: string;
  toolName: string;
  gemachId: string;
  gemachName?: string;
  dueAt: string;
  returnedAt: string;
  lateMinutes: number;
  lateDurationLabel: string;
  amount: number;
  paid: boolean;
  paidAt?: string;
  createdAt: string;
}

export interface MaintenanceTicket {
  id: string;
  toolId: string;
  loanId?: string;
  memberId: string;
  description: string;
  status: "open" | "in_progress" | "resolved";
  adminReply?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  createdAt: string;
}

export type MemberRole =
  | "ADMIN"
  | "GEMACH_ADMIN"
  | "BOARD"
  | "DISPUTE_RESOLVER"
  | "MEMBER";

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
  checkoutPhotoUrl?: string;
  returnPhotoUrl?: string;
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

export interface AdminMaintenanceReport {
  id: string;
  toolId: string;
  toolName: string;
  gemachId: string;
  gemachName?: string;
  memberId: string;
  memberName: string;
  memberEmail: string;
  loanId?: string;
  description: string;
  status: MaintenanceTicket["status"];
  adminReply?: string;
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
    openProblemReports: number;
    unpaidLateFees: number;
  };
  tools: AdminDashboardToolKindRow[];
  activeLoans: AdminDashboardLoan[];
  activeReservations: AdminDashboardReservation[];
  problemReports: AdminMaintenanceReport[];
  lateReturnFees: AdminLateReturnRow[];
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
  reservationMode: GemachReservationMode;
  /** Stored per-tool override; undefined = inherit from gemach. */
  defaultLoanHours?: number;
  maxLoanHours?: number;
  /** Resolved values for UI hints. */
  gemachDefaultLoanHours: number;
  gemachMaxLoanHours: number;
  imageUrl?: string;
  imageUrls?: string[];
  location?: string;
  brand?: string;
  supplier?: string;
  purpose?: string;
  productAge?: number;
  adminNotes?: string;
  /** Gemach default location — shown when tool has no override. */
  gemachLocation?: string;
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
    checkoutPhotoUrl?: string;
    returnPhotoUrl?: string;
    additionalPhotoCount?: number;
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

export interface BoardLogisticsStats {
  totalUnits: number;
  availableUnits: number;
  onLoanUnits: number;
  reservedUnits: number;
  maintenanceUnits: number;
  disabledUnits: number;
  activeDisputes: number;
  openProblemReports: number;
}

export interface BoardFinanceStats {
  operationsBalance: number;
  deviceBalanceTotal: number;
  totalIncome: number;
  totalExpenses: number;
  unpaidLateFees: number;
  pendingPayouts: number;
}

export interface BoardDashboardData {
  logistics: BoardLogisticsStats;
  finance: BoardFinanceStats;
  recentDisputes: Array<{
    id: string;
    toolName: string;
    memberName: string;
    status: DisputeStatus;
    createdAt: string;
  }>;
}
