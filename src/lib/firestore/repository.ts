import { getFirestore, FieldValue, type Firestore, type DocumentData } from "firebase-admin/firestore";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import type {
  AdminDashboardData,
  Loan,
  MaintenanceTicket,
  Member,
  MemberPayment,
  PayboxPayout,
  PayboxSettings,
  Reservation,
  Tool,
  Transaction,
  DevicePot,
  OperationsPot,
} from "@/lib/types";
import { splitPayment, getOperationsPercent } from "@/lib/pots";
import { getDefaultPayboxSettings } from "@/lib/paybox/config";
import { roleFromMemberData, DEFAULT_MEMBER_ROLE } from "@/lib/admin";

function getAdminDb(): Firestore {
  if (!getApps().length) {
    const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error("Firebase Admin not configured");
    }

    initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
    });

    getFirestore().settings({ ignoreUndefinedProperties: true });
  }
  return getFirestore();
}

function tsToIso(value: unknown): string {
  if (value && typeof value === "object" && "toDate" in value) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof value === "string") return value;
  return new Date().toISOString();
}

function docWithId<T extends { id: string }>(
  id: string,
  data: DocumentData | undefined
): T | null {
  if (!data) return null;
  const { seededAt: _, createdAt, updatedAt, ...rest } = data;
  return {
    id,
    ...rest,
    ...(createdAt ? { createdAt: tsToIso(createdAt) } : {}),
    ...(updatedAt ? { updatedAt: tsToIso(updatedAt) } : {}),
  } as T;
}

function newId(prefix: string) {
  return `${prefix}-${Date.now()}`;
}

// ─── Tools ───────────────────────────────────────────────────────────────────

export async function getAllTools(): Promise<Tool[]> {
  const snap = await getAdminDb().collection("tools").get();
  return snap.docs.map((d) => docWithId<Tool>(d.id, d.data())!).filter(Boolean);
}

export async function getToolById(id: string): Promise<Tool | null> {
  const snap = await getAdminDb().collection("tools").doc(id).get();
  if (!snap.exists) return null;
  return docWithId<Tool>(snap.id, snap.data());
}

export async function getToolByQrCode(qrCode: string): Promise<Tool | null> {
  const snap = await getAdminDb()
    .collection("tools")
    .where("qrCode", "==", qrCode)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const d = snap.docs[0];
  return docWithId<Tool>(d.id, d.data());
}

export async function updateToolStatus(id: string, status: Tool["status"]) {
  await getAdminDb().collection("tools").doc(id).update({ status });
}

// ─── Reservations ──────────────────────────────────────────────────────────

export async function getReservationById(id: string): Promise<Reservation | null> {
  const snap = await getAdminDb().collection("reservations").doc(id).get();
  if (!snap.exists) return null;
  const r = docWithId<Reservation>(snap.id, snap.data());
  if (r && snap.data()?.createdAt) {
    r.createdAt = tsToIso(snap.data()!.createdAt);
  }
  return r;
}

export async function createReservation(
  data: Omit<Reservation, "id" | "createdAt">
): Promise<Reservation> {
  const id = newId("res");
  const ref = getAdminDb().collection("reservations").doc(id);
  const now = FieldValue.serverTimestamp();
  await ref.set({ ...data, createdAt: now });
  return { ...data, id, createdAt: new Date().toISOString() };
}

export async function updateReservationStatus(id: string, status: Reservation["status"]) {
  await getAdminDb().collection("reservations").doc(id).update({ status });
}

// ─── Loans ─────────────────────────────────────────────────────────────────

export async function getLoanById(id: string): Promise<Loan | null> {
  const snap = await getAdminDb().collection("loans").doc(id).get();
  if (!snap.exists) return null;
  return docWithId<Loan>(snap.id, snap.data());
}

export async function getLoansByMember(memberId: string): Promise<Loan[]> {
  const snap = await getAdminDb()
    .collection("loans")
    .where("memberId", "==", memberId)
    .get();
  return snap.docs.map((d) => docWithId<Loan>(d.id, d.data())!).filter(Boolean);
}

export async function getAllLoans(): Promise<Loan[]> {
  const snap = await getAdminDb().collection("loans").get();
  return snap.docs
    .map((d) => {
      const loan = docWithId<Loan>(d.id, d.data());
      if (loan && d.data()?.checkedOutAt) {
        loan.checkedOutAt = tsToIso(d.data()!.checkedOutAt);
      }
      if (loan && d.data()?.returnedAt) {
        loan.returnedAt = tsToIso(d.data()!.returnedAt);
      }
      return loan;
    })
    .filter(Boolean) as Loan[];
}

// ─── Members ───────────────────────────────────────────────────────────────

function memberFromDoc(id: string, data: DocumentData): Member {
  return {
    id,
    name: (data.name as string) ?? "חבר",
    email: (data.email as string) ?? "",
    hasPaymentMethod: (data.hasPaymentMethod as boolean) ?? false,
    role: roleFromMemberData(data),
  };
}

export async function getMemberById(uid: string): Promise<Member | null> {
  const snap = await getAdminDb().collection("members").doc(uid).get();
  if (!snap.exists) return null;
  return memberFromDoc(snap.id, snap.data()!);
}

export async function syncMemberFromAuth(params: {
  uid: string;
  name: string;
  email: string;
  photoURL?: string | null;
}): Promise<Member> {
  const ref = getAdminDb().collection("members").doc(params.uid);
  const existing = await ref.get();
  const existingData = existing.exists ? existing.data() : undefined;
  const role = existing.exists
    ? roleFromMemberData(existingData ?? {})
    : DEFAULT_MEMBER_ROLE;

  await ref.set(
    {
      name: params.name,
      email: params.email,
      photoURL: params.photoURL ?? null,
      hasPaymentMethod: existing.exists
        ? ((existingData?.hasPaymentMethod as boolean) ?? false)
        : false,
      role,
      updatedAt: FieldValue.serverTimestamp(),
      ...(existing.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    },
    { merge: true }
  );

  return {
    id: params.uid,
    name: params.name,
    email: params.email,
    hasPaymentMethod: existing.exists
      ? ((existingData?.hasPaymentMethod as boolean) ?? false)
      : false,
    role,
  };
}

export async function getAdminDashboard(): Promise<AdminDashboardData> {
  const [tools, loans] = await Promise.all([getAllTools(), getAllLoans()]);

  const activeLoans = loans.filter(
    (l) => l.status === "active" || l.status === "checkout_pending" || l.status === "return_pending"
  );

  const memberIds = [...new Set(activeLoans.map((l) => l.memberId))];
  const members = await Promise.all(memberIds.map((id) => getMemberById(id)));
  const memberMap = new Map(
    members.filter(Boolean).map((m) => [m!.id, m!])
  );

  const loanByTool = new Map<string, (typeof activeLoans)[0]>();
  for (const loan of activeLoans) {
    if (loan.status === "active") loanByTool.set(loan.toolId, loan);
  }

  const toolRows = tools.map((tool) => {
    const loan = loanByTool.get(tool.id);
    const member = loan ? memberMap.get(loan.memberId) : undefined;
    return {
      id: tool.id,
      name: tool.name,
      category: tool.category,
      status: tool.status,
      borrowerName: member?.name,
      borrowerEmail: member?.email,
      checkedOutAt: loan?.checkedOutAt,
    };
  });

  const toolMap = new Map(tools.map((t) => [t.id, t]));

  return {
    stats: {
      totalTools: tools.length,
      available: tools.filter((t) => t.status === "available").length,
      onLoan: tools.filter((t) => t.status === "on_loan").length,
      reserved: tools.filter((t) => t.status === "reserved").length,
      maintenance: tools.filter((t) => t.status === "maintenance").length,
      disabled: tools.filter((t) => t.status === "disabled").length,
      activeLoans: activeLoans.length,
    },
    tools: toolRows,
    activeLoans: activeLoans.map((loan) => {
      const member = memberMap.get(loan.memberId);
      const tool = toolMap.get(loan.toolId);
      return {
        id: loan.id,
        toolId: loan.toolId,
        toolName: tool?.name ?? loan.toolId,
        memberId: loan.memberId,
        memberName: member?.name ?? "לא ידוע",
        memberEmail: member?.email ?? "",
        status: loan.status,
        checkedOutAt: loan.checkedOutAt,
      };
    }),
  };
}

export async function createLoanFromCheckout(params: {
  reservation: Reservation;
  checkoutPhotoUrl: string;
}): Promise<Loan> {
  const payment = await getPaidPaymentForReservation(params.reservation.id);
  if (!payment) {
    throw new Error("Payment required before checkout");
  }

  const db = getAdminDb();
  const split = splitPayment(params.reservation.feeAmount);
  const loanId = newId("loan");
  const txnId = newId("txn");

  const loan: Loan = {
    id: loanId,
    reservationId: params.reservation.id,
    memberId: params.reservation.memberId,
    toolId: params.reservation.toolId,
    status: "active",
    safetyAcknowledged: true,
    checkoutPhotoUrl: params.checkoutPhotoUrl,
    checkedOutAt: new Date().toISOString(),
  };

  const transaction: Transaction = {
    id: txnId,
    memberId: params.reservation.memberId,
    toolId: params.reservation.toolId,
    loanId,
    amount: split.totalAmount,
    operationsAmount: split.operationsAmount,
    deviceAmount: split.deviceAmount,
    createdAt: new Date().toISOString(),
  };

  const batch = db.batch();

  batch.set(db.collection("loans").doc(loanId), {
    ...loan,
    checkedOutAt: FieldValue.serverTimestamp(),
  });
  batch.set(db.collection("transactions").doc(txnId), {
    ...transaction,
    createdAt: FieldValue.serverTimestamp(),
  });
  batch.update(db.collection("reservations").doc(params.reservation.id), {
    status: "completed",
  });
  batch.update(db.collection("tools").doc(params.reservation.toolId), {
    status: "on_loan",
  });
  batch.update(db.collection("device_pots").doc(params.reservation.toolId), {
    balance: FieldValue.increment(split.deviceAmount),
    totalEarned: FieldValue.increment(split.deviceAmount),
  });
  batch.update(db.collection("operations_pot").doc("main"), {
    balance: FieldValue.increment(split.operationsAmount),
    totalEarned: FieldValue.increment(split.operationsAmount),
  });

  await batch.commit();
  return loan;
}

export async function completeLoanReturn(
  loanId: string,
  returnPhotoUrl: string
): Promise<Loan> {
  const db = getAdminDb();
  const loan = await getLoanById(loanId);
  if (!loan) throw new Error("Loan not found");

  const returnedAt = new Date().toISOString();
  const batch = db.batch();

  batch.update(db.collection("loans").doc(loanId), {
    status: "returned",
    returnPhotoUrl,
    returnedAt: FieldValue.serverTimestamp(),
  });
  batch.update(db.collection("tools").doc(loan.toolId), { status: "available" });

  await batch.commit();
  return { ...loan, status: "returned", returnPhotoUrl, returnedAt };
}

// ─── Maintenance ───────────────────────────────────────────────────────────

export async function createMaintenanceTicket(
  data: Omit<MaintenanceTicket, "id" | "createdAt" | "status">
): Promise<MaintenanceTicket> {
  const id = newId("ticket");
  const db = getAdminDb();
  const batch = db.batch();

  batch.set(db.collection("maintenance_tickets").doc(id), {
    ...data,
    status: "open",
    createdAt: FieldValue.serverTimestamp(),
  });
  batch.update(db.collection("tools").doc(data.toolId), { status: "disabled" });

  await batch.commit();
  return { ...data, id, status: "open", createdAt: new Date().toISOString() };
}

// ─── Pots ──────────────────────────────────────────────────────────────────

export async function getDevicePots(): Promise<(DevicePot & { id: string })[]> {
  const snap = await getAdminDb().collection("device_pots").get();
  return snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<DevicePot, "toolId">),
    toolId: d.data().toolId ?? d.id,
  }));
}

export async function getOperationsPot(): Promise<OperationsPot> {
  const snap = await getAdminDb().collection("operations_pot").doc("main").get();
  if (!snap.exists) {
    return { balance: 0, totalEarned: 0, totalSpent: 0 };
  }
  const data = snap.data()!;
  return {
    balance: data.balance ?? 0,
    totalEarned: data.totalEarned ?? 0,
    totalSpent: data.totalSpent ?? 0,
  };
}

export async function getPotsOverview() {
  const [tools, devicePots, operationsPot] = await Promise.all([
    getAllTools(),
    getDevicePots(),
    getOperationsPot(),
  ]);
  const operationsPercent = getOperationsPercent();
  return { tools, devicePots, operationsPot, operationsPercent };
}

// ─── PayBox settings ─────────────────────────────────────────────────────────

export async function getPayboxSettings(): Promise<PayboxSettings> {
  const snap = await getAdminDb().collection("settings").doc("paybox").get();
  if (!snap.exists) return getDefaultPayboxSettings();

  const data = snap.data()!;
  const defaults = getDefaultPayboxSettings();
  return {
    enabled: (data.enabled as boolean) ?? defaults.enabled,
    operationsGroupUrl:
      (data.operationsGroupUrl as string) || defaults.operationsGroupUrl,
    deviceGroupUrl: (data.deviceGroupUrl as string) || defaults.deviceGroupUrl,
    groupName: (data.groupName as string) || undefined,
    growPageCode: (data.growPageCode as string) || defaults.growPageCode,
  };
}

// ─── Member payments (PayBox group) ──────────────────────────────────────────

export async function getPaymentById(id: string): Promise<MemberPayment | null> {
  const snap = await getAdminDb().collection("payments").doc(id).get();
  if (!snap.exists) return null;
  const payment = docWithId<MemberPayment>(snap.id, snap.data());
  if (payment && snap.data()?.createdAt) {
    payment.createdAt = tsToIso(snap.data()!.createdAt);
  }
  if (payment && snap.data()?.paidAt) {
    payment.paidAt = tsToIso(snap.data()!.paidAt);
  }
  return payment;
}

export async function getPendingPaymentForReservation(
  reservationId: string
): Promise<MemberPayment | null> {
  const snap = await getAdminDb()
    .collection("payments")
    .where("reservationId", "==", reservationId)
    .limit(5)
    .get();

  const pendingDoc = snap.docs.find((d) => d.data().status === "pending");
  if (!pendingDoc) return null;

  const payment = docWithId<MemberPayment>(pendingDoc.id, pendingDoc.data());
  if (payment && pendingDoc.data()?.createdAt) {
    payment.createdAt = tsToIso(pendingDoc.data()!.createdAt);
  }
  return payment;
}

export async function getPaidPaymentForReservation(
  reservationId: string
): Promise<MemberPayment | null> {
  const snap = await getAdminDb()
    .collection("payments")
    .where("reservationId", "==", reservationId)
    .limit(5)
    .get();

  const paidDoc = snap.docs.find((d) => d.data().status === "paid");
  if (!paidDoc) return null;

  const payment = docWithId<MemberPayment>(paidDoc.id, paidDoc.data());
  if (payment && paidDoc.data()?.createdAt) {
    payment.createdAt = tsToIso(paidDoc.data()!.createdAt);
  }
  if (payment && paidDoc.data()?.paidAt) {
    payment.paidAt = tsToIso(paidDoc.data()!.paidAt);
  }
  return payment;
}

export async function createMemberPayment(params: {
  reservation: Reservation;
  payboxGroupUrl: string;
  growPaymentUrl?: string;
  provider: MemberPayment["provider"];
}): Promise<MemberPayment> {
  const id = newId("pay");
  const payment: MemberPayment = {
    id,
    reservationId: params.reservation.id,
    memberId: params.reservation.memberId,
    toolId: params.reservation.toolId,
    amount: params.reservation.feeAmount,
    status: "pending",
    provider: params.provider,
    payboxGroupUrl: params.payboxGroupUrl,
    growPaymentUrl: params.growPaymentUrl,
    createdAt: new Date().toISOString(),
  };

  await getAdminDb()
    .collection("payments")
    .doc(id)
    .set({
      id,
      reservationId: payment.reservationId,
      memberId: payment.memberId,
      toolId: payment.toolId,
      amount: payment.amount,
      status: payment.status,
      provider: payment.provider,
      payboxGroupUrl: payment.payboxGroupUrl,
      ...(payment.growPaymentUrl ? { growPaymentUrl: payment.growPaymentUrl } : {}),
      createdAt: FieldValue.serverTimestamp(),
    });

  return payment;
}

export async function markPaymentPaid(paymentId: string): Promise<MemberPayment> {
  const payment = await getPaymentById(paymentId);
  if (!payment) throw new Error("Payment not found");
  if (payment.status === "paid") return payment;

  await getAdminDb().collection("payments").doc(paymentId).update({
    status: "paid",
    paidAt: FieldValue.serverTimestamp(),
  });

  return {
    ...payment,
    status: "paid",
    paidAt: new Date().toISOString(),
  };
}

// ─── PayBox payouts (admin → group) ──────────────────────────────────────────

export async function getPayboxPayouts(limit = 20): Promise<PayboxPayout[]> {
  const snap = await getAdminDb().collection("paybox_payouts").limit(limit).get();

  const payouts = snap.docs.map((d) => {
    const payout = docWithId<PayboxPayout>(d.id, d.data())!;
    if (d.data()?.createdAt) payout.createdAt = tsToIso(d.data()!.createdAt);
    if (d.data()?.completedAt) payout.completedAt = tsToIso(d.data()!.completedAt);
    return payout;
  });

  return payouts.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function createPayboxPayout(params: {
  potTarget: PayboxPayout["potTarget"];
  toolId?: string;
  amount: number;
  groupUrl: string;
  note?: string;
  createdBy: string;
}): Promise<PayboxPayout> {
  if (params.amount <= 0) throw new Error("Invalid payout amount");

  const db = getAdminDb();
  if (params.potTarget === "operations") {
    const pot = await getOperationsPot();
    if (pot.balance < params.amount) throw new Error("Insufficient operations pot balance");
  } else {
    if (!params.toolId) throw new Error("Device pot requires toolId");
    const potSnap = await db.collection("device_pots").doc(params.toolId).get();
    const balance = (potSnap.data()?.balance as number) ?? 0;
    if (balance < params.amount) throw new Error("Insufficient device pot balance");
  }

  const id = newId("payout");
  const payout: PayboxPayout = {
    id,
    potTarget: params.potTarget,
    toolId: params.toolId,
    amount: params.amount,
    groupUrl: params.groupUrl,
    status: "pending",
    note: params.note,
    createdBy: params.createdBy,
    createdAt: new Date().toISOString(),
  };

  await db.collection("paybox_payouts").doc(id).set({
    ...payout,
    createdAt: FieldValue.serverTimestamp(),
  });

  return payout;
}

export async function completePayboxPayout(payoutId: string): Promise<PayboxPayout> {
  const db = getAdminDb();
  const ref = db.collection("paybox_payouts").doc(payoutId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Payout not found");

  const data = snap.data()!;
  if (data.status === "completed") {
    return docWithId<PayboxPayout>(snap.id, data)!;
  }
  if (data.status === "cancelled") {
    throw new Error("Payout was cancelled");
  }

  const amount = data.amount as number;
  const potTarget = data.potTarget as PayboxPayout["potTarget"];
  const toolId = data.toolId as string | undefined;

  const batch = db.batch();
  batch.update(ref, {
    status: "completed",
    completedAt: FieldValue.serverTimestamp(),
  });

  if (potTarget === "operations") {
    batch.update(db.collection("operations_pot").doc("main"), {
      balance: FieldValue.increment(-amount),
      totalSpent: FieldValue.increment(amount),
    });
  } else if (toolId) {
    batch.update(db.collection("device_pots").doc(toolId), {
      balance: FieldValue.increment(-amount),
      totalSpent: FieldValue.increment(amount),
    });
  }

  await batch.commit();

  const payout = docWithId<PayboxPayout>(snap.id, data)!;
  payout.status = "completed";
  payout.completedAt = new Date().toISOString();
  return payout;
}

export { getAdminDb };
