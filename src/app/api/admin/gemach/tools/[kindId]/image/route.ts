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
import { uploadToolKindImage, isCloudinaryConfigured, readImageUpload } from "@/lib/cloudinary-admin";
import { isPlatformAdmin } from "@/lib/admin";
import { isPlatformGemach } from "@/lib/gemach";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ kindId: string }> }
) {
  const adminAuth = await requireAdmin(request);
  if (adminAuth instanceof NextResponse) return adminAuth;

  if (!isCloudinaryConfigured()) {
    return NextResponse.json(
      {
        error:
          "העלאת תמונות לא מוגדרת — צרו חשבון חינמי ב-cloudinary.com והוסיפו CLOUDINARY_* ל-.env",
      },
      { status: 503 }
    );
  }

  try {
    const { kindId } = await params;
    const formData = await request.formData();
    const requestedGemachId = formData.get("gemachId") as string | null;
    const image = formData.get("image") as File | null;
    const remove = formData.get("remove") === "true";

    const gemachId = resolveGemachAdminScope(adminAuth.member, requestedGemachId ?? null);
    if (gemachId instanceof NextResponse) return gemachId;

    const scoped = await requireGemachAdmin(request, gemachId);
    if (scoped instanceof NextResponse) return scoped;

    const gemach = await getGemachById(gemachId);
    if (!gemach) {
      return NextResponse.json({ error: "גמ״ח לא נמצא" }, { status: 404 });
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

    const kind = await getToolKindForAdmin(gemachId, kindId);
    if (!kind) {
      return NextResponse.json({ error: "הכלי לא נמצא" }, { status: 404 });
    }

    if (remove) {
      await updateToolKindDetails({
        gemachId,
        kindId,
        name: kind.name,
        description: kind.description,
        category: kind.category,
        imageUrl: null,
      });
      return NextResponse.json({ imageUrl: null });
    }

    if (!image) {
      return NextResponse.json({ error: "נדרשת תמונה" }, { status: 400 });
    }

    const buffer = await readImageUpload(image);
    const imageUrl = await uploadToolKindImage({
      gemachId,
      kindId,
      buffer,
    });

    await updateToolKindDetails({
      gemachId,
      kindId,
      name: kind.name,
      description: kind.description,
      category: kind.category,
      imageUrl,
    });

    return NextResponse.json({ imageUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאת שרת";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
