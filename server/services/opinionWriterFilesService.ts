// خدمة ملفات كتّاب الرأي (PDF): رفع خاص على ObjectStorage، عرض القائمة النشطة،
// توليد رابط تنزيل مؤقت، وحذف لطيف (deleted_at) دون مسح السجل.

import { randomUUID } from "crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { notificationsInbox, opinionWriterFiles, users } from "@shared/schema";
import {
  MAX_OPINION_WRITER_FILE_BYTES,
  buildPdfContentDisposition,
  isValidPdfBuffer,
} from "@shared/opinionWriterFiles";
import { db } from "../db";
import { ObjectStorageService } from "../objectStorage";
import { notificationBus } from "../notificationBus";
import { listActiveOpinionWriters } from "./opinionWriterAnnouncementsService";

export { MAX_OPINION_WRITER_FILE_BYTES, buildPdfContentDisposition, isValidPdfBuffer };

export class OpinionWriterFileError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type OpinionWriterFileDto = {
  id: string;
  title: string;
  description: string | null;
  originalFileName: string;
  mimeType: string;
  fileSizeBytes: number;
  uploadedBy: string;
  uploaderName: string;
  createdAt: string;
};

function formatUploaderName(firstName: string | null, lastName: string | null): string {
  const full = [firstName, lastName].filter(Boolean).join(" ").trim();
  return full || "إدارة التحرير";
}

export async function listOpinionWriterFiles(): Promise<OpinionWriterFileDto[]> {
  const rows = await db
    .select({
      id: opinionWriterFiles.id,
      title: opinionWriterFiles.title,
      description: opinionWriterFiles.description,
      originalFileName: opinionWriterFiles.originalFileName,
      mimeType: opinionWriterFiles.mimeType,
      fileSizeBytes: opinionWriterFiles.fileSizeBytes,
      uploadedBy: opinionWriterFiles.uploadedBy,
      createdAt: opinionWriterFiles.createdAt,
      uploaderFirstName: users.firstName,
      uploaderLastName: users.lastName,
    })
    .from(opinionWriterFiles)
    .leftJoin(users, eq(opinionWriterFiles.uploadedBy, users.id))
    .where(isNull(opinionWriterFiles.deletedAt))
    .orderBy(desc(opinionWriterFiles.createdAt));

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    originalFileName: row.originalFileName,
    mimeType: row.mimeType,
    fileSizeBytes: row.fileSizeBytes,
    uploadedBy: row.uploadedBy,
    uploaderName: formatUploaderName(row.uploaderFirstName, row.uploaderLastName),
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function getActiveOpinionWriterFile(id: string) {
  const [row] = await db
    .select()
    .from(opinionWriterFiles)
    .where(and(eq(opinionWriterFiles.id, id), isNull(opinionWriterFiles.deletedAt)))
    .limit(1);
  return row ?? null;
}

export async function createOpinionWriterFile(input: {
  title: string;
  description?: string | null;
  fileBuffer: Buffer;
  originalFileName: string;
  mimeType: string;
  uploadedBy: string;
}): Promise<OpinionWriterFileDto> {
  const title = input.title.trim();
  if (title.length < 2 || title.length > 200) {
    throw new OpinionWriterFileError(400, "يرجى كتابة عنوان واضح للملف (بين حرفين و200 حرف)");
  }

  const description = input.description?.trim() ? input.description.trim().slice(0, 600) : null;

  if (!input.fileBuffer || input.fileBuffer.length === 0) {
    throw new OpinionWriterFileError(400, "الملف فارغ");
  }
  if (input.fileBuffer.length > MAX_OPINION_WRITER_FILE_BYTES) {
    throw new OpinionWriterFileError(413, "حجم الملف يتجاوز الحد المسموح به (25 ميجابايت)");
  }
  const normalizedMime = (input.mimeType || "").toLowerCase();
  const isPdfMime =
    normalizedMime === "application/pdf" ||
    normalizedMime === "application/x-pdf" ||
    (normalizedMime === "application/octet-stream" &&
      input.originalFileName.toLowerCase().endsWith(".pdf"));
  if (!isPdfMime || !isValidPdfBuffer(input.fileBuffer)) {
    throw new OpinionWriterFileError(400, "يُسمح برفع ملفات PDF صالحة فقط");
  }

  const objectId = randomUUID();
  const logicalKey = `opinion-writer-files/${objectId}.pdf`;
  const storage = new ObjectStorageService();
  const stored = await storage.uploadPrivateDocument(logicalKey, input.fileBuffer, "application/pdf");
  const storageKey = stored.path || logicalKey;

  const safeOriginalName = (input.originalFileName || `${title}.pdf`).slice(0, 255);

  const [inserted] = await db
    .insert(opinionWriterFiles)
    .values({
      title,
      description,
      storageKey,
      originalFileName: safeOriginalName,
      mimeType: "application/pdf",
      fileSizeBytes: input.fileBuffer.length,
      uploadedBy: input.uploadedBy,
    })
    .returning();

  const [uploader] = await db
    .select({ firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .where(eq(users.id, input.uploadedBy))
    .limit(1);

  return {
    id: inserted.id,
    title: inserted.title,
    description: inserted.description,
    originalFileName: inserted.originalFileName,
    mimeType: inserted.mimeType,
    fileSizeBytes: inserted.fileSizeBytes,
    uploadedBy: inserted.uploadedBy,
    uploaderName: formatUploaderName(uploader?.firstName ?? null, uploader?.lastName ?? null),
    createdAt: inserted.createdAt.toISOString(),
  };
}

export async function softDeleteOpinionWriterFile(id: string): Promise<boolean> {
  const updated = await db
    .update(opinionWriterFiles)
    .set({ deletedAt: new Date() })
    .where(and(eq(opinionWriterFiles.id, id), isNull(opinionWriterFiles.deletedAt)))
    .returning({ id: opinionWriterFiles.id });
  return updated.length > 0;
}

export async function getOpinionWriterFileDownload(id: string): Promise<{
  id: string;
  title: string;
  originalFileName: string;
  signedUrl: string;
} | null> {
  const file = await getActiveOpinionWriterFile(id);
  if (!file) return null;
  const signedUrl = await new ObjectStorageService().getPrivateFileDownloadURL(file.storageKey, 300);
  return {
    id: file.id,
    title: file.title,
    originalFileName: file.originalFileName,
    signedUrl,
  };
}

const WRITER_FILES_DEEPLINK = "/dashboard/opinion-author/files";

/**
 * إشعار كل كتّاب الرأي النشطين بملف جديد (صندوق الإشعارات + البث الحي).
 * لا يُفشل الرفع أبدًا: أي خطأ يُسجَّل فقط.
 */
export async function notifyWritersOfNewFile(file: { id: string; title: string }, uploadedBy: string): Promise<number> {
  try {
    const writers = (await listActiveOpinionWriters()).filter((w) => w.id !== uploadedBy);
    if (writers.length === 0) return 0;
    const type = "OpinionWriterFileNew";
    const title = "ملف جديد في «ملفاتي»";
    const body = file.title;
    for (let i = 0; i < writers.length; i += 200) {
      const chunk = writers.slice(i, i + 200);
      await db.insert(notificationsInbox).values(
        chunk.map((w) => ({
          userId: w.id,
          type,
          title,
          body,
          deeplink: WRITER_FILES_DEEPLINK,
          read: false,
          metadata: { fileId: file.id },
        })),
      );
    }
    for (const w of writers) {
      notificationBus.emit(w.id, { type, title, body, deeplink: WRITER_FILES_DEEPLINK });
    }
    return writers.length;
  } catch (error: unknown) {
    console.error("[opinion-writer-files] notify writers failed:", error instanceof Error ? error.message : error);
    return 0;
  }
}
