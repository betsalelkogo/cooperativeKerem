import { getStorage } from "firebase-admin/storage";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function extensionForContentType(contentType: string): string {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

export async function uploadToolKindImage(params: {
  gemachId: string;
  kindId: string;
  buffer: Buffer;
  contentType: string;
}): Promise<string> {
  if (!ALLOWED_TYPES.has(params.contentType)) {
    throw new Error("סוג קובץ לא נתמך — JPG, PNG או WebP בלבד");
  }
  if (params.buffer.length > MAX_IMAGE_BYTES) {
    throw new Error("התמונה גדולה מדי — מקסימום 5MB");
  }

  const ext = extensionForContentType(params.contentType);
  const objectPath = `tools/${params.gemachId}/${params.kindId}/cover.${ext}`;
  const bucket = getStorage().bucket();
  const file = bucket.file(objectPath);

  await file.save(params.buffer, {
    metadata: {
      contentType: params.contentType,
      cacheControl: "public, max-age=31536000",
    },
    resumable: false,
  });

  try {
    await file.makePublic();
  } catch {
    // Bucket may use uniform access — public URL still works if rules allow
  }

  return `https://storage.googleapis.com/${bucket.name}/${objectPath}`;
}
