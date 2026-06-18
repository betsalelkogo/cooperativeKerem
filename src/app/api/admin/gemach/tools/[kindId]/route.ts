import { NextResponse } from "next/server";
import {
  requireAdmin,
  requireGemachAdmin,
  resolveGemachAdminScope,
} from "@/lib/firebase/admin-auth";
import {
  getToolKindForAdmin,
  updateToolKindDetails,
  getGemachById,
} from "@/lib/firestore/repository";
import { isPlatformAdmin } from "@/lib/admin";
import { isPlatformGemach } from "@/lib/gemach";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ kindId: string }> }
) {
  const adminAuth = await requireAdmin(request);
  if (adminAuth instanceof NextResponse) return adminAuth;

  try {
    const { kindId } = await params;
    const { searchParams } = new URL(request.url);
    const gemachId = resolveGemachAdminScope(
      adminAuth.member,
      searchParams.get("gemachId")
    );
    if (gemachId instanceof NextResponse) return gemachId;

    const scoped = await requireGemachAdmin(request, gemachId);
    if (scoped instanceof NextResponse) return scoped;

    const kind = await getToolKindForAdmin(gemachId, kindId);
    if (!kind) {
      return NextResponse.json({ error: "הכלי לא נמצא" }, { status: 404 });
    }

    return NextResponse.json(kind);
  } catch {
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ kindId: string }> }
) {
  const adminAuth = await requireAdmin(request);
  if (adminAuth instanceof NextResponse) return adminAuth;

  try {
    const { kindId } = await params;
    const body = await request.json();
    const {
      gemachId: requestedGemachId,
      name,
      description,
      category,
      loanFeeMin,
      loanFeeMax,
      defaultLoanHours,
      maxLoanHours,
      adminNotes,
    } = body as {
      gemachId?: string;
      name?: string;
      description?: string;
      category?: string;
      loanFeeMin?: number;
      loanFeeMax?: number;
      defaultLoanHours?: number | null;
      maxLoanHours?: number | null;
      adminNotes?: string | null;
    };

    const gemachId = resolveGemachAdminScope(adminAuth.member, requestedGemachId ?? null);
    if (gemachId instanceof NextResponse) return gemachId;

    const scoped = await requireGemachAdmin(request, gemachId);
    if (scoped instanceof NextResponse) return scoped;

    const gemach = await getGemachById(gemachId);
    if (!gemach) {
      return NextResponse.json({ error: "גמ״ח לא נמצא" }, { status: 404 });
    }
    if (!gemach.active) {
      return NextResponse.json({ error: "הגמ״ח סגור" }, { status: 403 });
    }

    if (
      isPlatformAdmin(adminAuth.member) &&
      !isPlatformGemach(gemach) &&
      !adminAuth.member.gemachAdminIds?.includes(gemachId)
    ) {
      return NextResponse.json(
        { error: "מנהל פלטפורמה יכול לערוך רק כלי קואופרטיב" },
        { status: 403 }
      );
    }

    const result = await updateToolKindDetails({
      gemachId,
      kindId,
      name: name ?? "",
      description: description ?? "",
      category: category ?? "",
      loanFeeMin: gemach.pricingMode === "loan_fee" ? Number(loanFeeMin) : undefined,
      loanFeeMax: gemach.pricingMode === "loan_fee" ? Number(loanFeeMax) : undefined,
      defaultLoanHours:
        defaultLoanHours === null
          ? null
          : defaultLoanHours !== undefined
            ? Number(defaultLoanHours)
            : undefined,
      maxLoanHours:
        maxLoanHours === null
          ? null
          : maxLoanHours !== undefined
            ? Number(maxLoanHours)
            : undefined,
      adminNotes:
        adminNotes === null
          ? null
          : adminNotes !== undefined
            ? adminNotes
            : undefined,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאת שרת";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
