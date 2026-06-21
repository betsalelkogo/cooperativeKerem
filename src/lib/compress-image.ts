/** Client-side resize/compress before upload. */

const MAX_WIDTH = 960;
const TARGET_MAX_BYTES = 280_000;
const MIN_QUALITY = 0.45;

export async function compressImageFile(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) {
    throw new Error("סוג קובץ לא נתמך — JPG, PNG או WebP בלבד");
  }

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_WIDTH / bitmap.width);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("לא ניתן לעבד את התמונה");

    ctx.drawImage(bitmap, 0, 0, width, height);

    let quality = 0.82;
    let blob = await canvasToJpeg(canvas, quality);

    while (blob.size > TARGET_MAX_BYTES && quality > MIN_QUALITY) {
      quality -= 0.1;
      blob = await canvasToJpeg(canvas, quality);
    }

    if (blob.size > 900_000) {
      throw new Error("התמונה גדולה מדי גם לאחר דחיסה — נסו תמונה קטנה יותר");
    }

    return blob;
  } catch (err) {
    if (err instanceof Error && err.message.includes("memory")) {
      throw new Error("התמונה גדולה מדי לעיבוד במכשיר — נסו שוב או צלמו ממרחק");
    }
    throw err;
  } finally {
    bitmap?.close();
  }
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("דחיסת התמונה נכשלה"))),
      "image/jpeg",
      quality
    );
  });
}
