import { NextResponse } from "next/server";
import {
  canAssignDisputeMediators,
  canVoteOnDispute,
  isBoardMember,
  isPlatformAdmin,
} from "@/lib/admin";
import { requireDisputeViewer, requirePlatformAdmin } from "@/lib/firebase/admin-auth";
import {
  getDisputeById,
  getDisputeDetailForAdmin,
  updateDisputeMediators,
} from "@/lib/firestore/repository";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireDisputeViewer(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const viewAll =
      isPlatformAdmin(auth.member) || isBoardMember(auth.member);
    const dispute = await getDisputeById(id);
    if (!dispute) {
      return NextResponse.json({ error: "המחלוקת לא נמצאה" }, { status: 404 });
    }

    const detail = await getDisputeDetailForAdmin({
      disputeId: id,
      viewerId: auth.uid,
      viewAll,
      canVote: canVoteOnDispute(auth.member, dispute),
      canAssignMediators: canAssignDisputeMediators(auth.member),
    });

    if (!detail) {
      return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
    }

    return NextResponse.json(detail);
  } catch {
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePlatformAdmin(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const body = await request.json();
    const { mediatorIds } = body as { mediatorIds?: string[] };

    if (!Array.isArray(mediatorIds)) {
      return NextResponse.json({ error: "נדרש מערך מיישבים" }, { status: 400 });
    }

    const dispute = await updateDisputeMediators(id, mediatorIds);
    const detail = await getDisputeDetailForAdmin({
      disputeId: id,
      viewerId: auth.uid,
      viewAll: true,
      canVote: canVoteOnDispute(auth.member, dispute),
      canAssignMediators: true,
    });

    return NextResponse.json(detail);
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאת שרת";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
