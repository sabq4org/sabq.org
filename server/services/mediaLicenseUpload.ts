/**
 * رفع مستندات الترخيص المهني (كاتب رأي / مراسل).
 * يفضّل R2 دائماً حتى لو OBJECT_STORAGE_FORCE_S3=1 (دلو S3 القديم يفشل الرفع)،
 * ويحوّل HEIC/HEIF من الآيفون إلى JPEG قبل التخزين.
 */
import { ObjectStorageService, isPrivateObjectStorageConfigured } from "../objectStorage";

const HEIC_TYPES = new Set(["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"]);

export type PreparedLicenseFile = {
  buffer: Buffer;
  contentType: string;
  extension: string;
};

/** يجهّز الملف للتخزين: HEIC → JPEG، ويُبقي PDF/الصور الشائعة كما هي. */
export async function prepareLicenseFile(
  buffer: Buffer,
  contentType: string,
): Promise<PreparedLicenseFile> {
  const mime = (contentType || "").toLowerCase().split(";")[0].trim();

  if (mime === "application/pdf") {
    return { buffer, contentType: "application/pdf", extension: "pdf" };
  }

  if (HEIC_TYPES.has(mime) || mime === "image/heic" || mime === "image/heif") {
    const sharp = (await import("sharp")).default;
    const jpeg = await sharp(buffer, { failOn: "truncated" }).rotate().jpeg({ quality: 88 }).toBuffer();
    return { buffer: jpeg, contentType: "image/jpeg", extension: "jpg" };
  }

  if (mime === "image/png") {
    return { buffer, contentType: "image/png", extension: "png" };
  }
  if (mime === "image/webp") {
    return { buffer, contentType: "image/webp", extension: "webp" };
  }
  if (mime === "image/jpeg" || mime === "image/jpg") {
    return { buffer, contentType: "image/jpeg", extension: "jpg" };
  }

  // محاولة أخيرة عبر sharp لأي صورة أخرى يدعمها
  if (mime.startsWith("image/")) {
    const sharp = (await import("sharp")).default;
    const jpeg = await sharp(buffer, { failOn: "truncated" }).rotate().jpeg({ quality: 88 }).toBuffer();
    return { buffer: jpeg, contentType: "image/jpeg", extension: "jpg" };
  }

  throw new Error("الترخيص يجب أن يكون صورة أو ملف PDF");
}

export function assertPrivateLicenseStorageReady(): void {
  if (!isPrivateObjectStorageConfigured()) {
    throw new Error(
      "خدمة رفع المستندات غير متاحة حالياً. حاول لاحقاً.",
    );
  }
}

/**
 * يرفع مستند ترخيص تحت `.private/` مع تفضيل R2 الصريح
 * (يتجاوز مسار S3 الميت عند FORCE_S3).
 */
export async function uploadMediaLicenseDocument(opts: {
  relativeKey: string;
  buffer: Buffer;
  contentType: string;
}): Promise<{ path: string }> {
  assertPrivateLicenseStorageReady();
  const prepared = await prepareLicenseFile(opts.buffer, opts.contentType);
  // استبدال الامتداد في المفتاح إن تغيّر بعد التحويل
  const base = opts.relativeKey.replace(/\.[^.]+$/, "");
  const key = `${base}.${prepared.extension}`;

  const storage = new ObjectStorageService();
  // uploadPrivateDocument يفضّل R2 عند توفّر مفاتيحه
  return storage.uploadPrivateDocument(key, prepared.buffer, prepared.contentType);
}
