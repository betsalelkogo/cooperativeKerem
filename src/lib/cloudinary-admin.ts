import { v2 as cloudinary } from "cloudinary";

export const UPLOAD_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export function isCloudinaryConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );
}

export function cloudinaryNotConfiguredMessage(): string {
  return "העלאת תמונות לא מוגדרת — הוסיפו CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET ל-.env (חינם ב-cloudinary.com)";
}

function getCloudinary() {
  if (!isCloudinaryConfigured()) {
    throw new Error(cloudinaryNotConfiguredMessage());
  }

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });

  return cloudinary;
}

function sanitizePublicId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_");
}

async function uploadCloudinaryImage(params: {
  folder: string;
  publicId: string;
  buffer: Buffer;
  overwrite?: boolean;
}): Promise<string> {
  const cld = getCloudinary();

  const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
    const stream = cld.uploader.upload_stream(
      {
        folder: params.folder,
        public_id: params.publicId,
        overwrite: params.overwrite ?? false,
        resource_type: "image",
        format: "jpg",
      },
      (error, uploadResult) => {
        if (error || !uploadResult?.secure_url) {
          reject(error ?? new Error("העלאה ל-Cloudinary נכשלה"));
          return;
        }
        resolve({ secure_url: uploadResult.secure_url });
      }
    );
    stream.end(params.buffer);
  });

  return result.secure_url;
}

export async function readImageUpload(file: File): Promise<Buffer> {
  if (!file.type.startsWith("image/")) {
    throw new Error("סוג קובץ לא נתמך — JPG, PNG או WebP");
  }
  if (file.size > UPLOAD_IMAGE_MAX_BYTES) {
    throw new Error("התמונה גדולה מדי — מקסימום 5MB");
  }
  return Buffer.from(await file.arrayBuffer());
}

function loanPhotoDate(at: Date): string {
  return at.toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
}

/** `{userName}_{YYYY-MM-DD}_loan` or `_return` — for tracking in Cloudinary. */
export function buildLoanPhotoPublicId(
  memberName: string,
  suffix: "loan" | "return",
  at: Date = new Date()
): string {
  const date = loanPhotoDate(at);
  const name = memberName
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[/\\?#%]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

  const safeName = name || "user";
  return `${safeName}_${date}_${suffix}`;
}

export async function uploadToolKindImage(params: {
  gemachId: string;
  kindId: string;
  buffer: Buffer;
}): Promise<string> {
  return uploadCloudinaryImage({
    folder: `kerem/tools/${sanitizePublicId(params.gemachId)}`,
    publicId: sanitizePublicId(params.kindId),
    buffer: params.buffer,
    overwrite: true,
  });
}

export async function uploadLoanCheckoutPhoto(params: {
  memberName: string;
  buffer: Buffer;
  at?: Date;
}): Promise<string> {
  return uploadCloudinaryImage({
    folder: "kerem/loans",
    publicId: buildLoanPhotoPublicId(params.memberName, "loan", params.at),
    buffer: params.buffer,
    overwrite: false,
  });
}

export async function uploadLoanReturnPhoto(params: {
  memberName: string;
  buffer: Buffer;
  at?: Date;
}): Promise<string> {
  return uploadCloudinaryImage({
    folder: "kerem/loans",
    publicId: buildLoanPhotoPublicId(params.memberName, "return", params.at),
    buffer: params.buffer,
    overwrite: false,
  });
}

export async function uploadLoanExtraPhoto(loanId: string, buffer: Buffer): Promise<string> {
  return uploadCloudinaryImage({
    folder: "kerem/loans",
    publicId: `${sanitizePublicId(loanId)}/extra_${Date.now()}`,
    buffer,
  });
}
