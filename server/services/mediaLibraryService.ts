import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { mediaFiles, articleMediaAssets, mediaUsageLog } from "@shared/schema";
import { userHasPermission } from "../rbac";
import { deleteMediaBlob } from "./mediaStorage";

export type BulkMediaAction = "move" | "delete" | "favorite" | "unfavorite";

export interface BulkMediaResult {
  processed: number;
  skipped: number;   // not allowed (not owner and lacks the permission)
  blocked: string[]; // referenced by articles → cannot delete
}

const MAX_BULK = 200;

/**
 * Bulk move/delete/(un)favorite over multiple media files, enforcing the same
 * per-item ownership/permission rules as the single-item routes:
 *  - move / favorite  → owner OR media.edit
 *  - delete           → owner OR media.delete, and blocked if still referenced
 *    by article_media_assets / media_usage_log (same live check as DELETE /:id).
 */
export async function bulkMediaOperation(
  userId: string,
  action: BulkMediaAction,
  ids: string[],
  folderId?: string | null,
): Promise<BulkMediaResult> {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw Object.assign(new Error("لم يتم تحديد أي ملفات"), { statusCode: 400 });
  }
  if (ids.length > MAX_BULK) {
    throw Object.assign(new Error(`الحد الأقصى ${MAX_BULK} ملف في العملية الواحدة`), { statusCode: 400 });
  }

  const targets = await db
    .select({
      id: mediaFiles.id,
      uploadedBy: mediaFiles.uploadedBy,
      url: mediaFiles.url,
      usedIn: mediaFiles.usedIn,
    })
    .from(mediaFiles)
    .where(inArray(mediaFiles.id, ids));

  const canEditAny = await userHasPermission(userId, "media.edit");
  const canDeleteAny = await userHasPermission(userId, "media.delete");

  const result: BulkMediaResult = { processed: 0, skipped: 0, blocked: [] };

  if (action === "favorite" || action === "unfavorite") {
    const allowed = targets.filter((t) => t.uploadedBy === userId || canEditAny).map((t) => t.id);
    result.skipped = targets.length - allowed.length;
    if (allowed.length > 0) {
      await db.update(mediaFiles)
        .set({ isFavorite: action === "favorite", updatedAt: new Date() })
        .where(inArray(mediaFiles.id, allowed));
      result.processed = allowed.length;
    }
    return result;
  }

  if (action === "move") {
    const targetFolder = folderId && folderId !== "null" ? folderId : null;
    const allowed = targets.filter((t) => t.uploadedBy === userId || canEditAny).map((t) => t.id);
    result.skipped = targets.length - allowed.length;
    if (allowed.length > 0) {
      await db.update(mediaFiles)
        .set({ folderId: targetFolder, updatedAt: new Date() })
        .where(inArray(mediaFiles.id, allowed));
      result.processed = allowed.length;
    }
    return result;
  }

  // delete
  for (const t of targets) {
    if (t.uploadedBy !== userId && !canDeleteAny) {
      result.skipped++;
      continue;
    }
    const [assetRef] = await db
      .select({ id: articleMediaAssets.id })
      .from(articleMediaAssets)
      .where(eq(articleMediaAssets.mediaFileId, t.id))
      .limit(1);
    const [usageRef] = await db
      .select({ id: mediaUsageLog.id })
      .from(mediaUsageLog)
      .where(eq(mediaUsageLog.mediaId, t.id))
      .limit(1);
    if (assetRef || usageRef || (t.usedIn && t.usedIn.length > 0)) {
      result.blocked.push(t.id);
      continue;
    }
    await deleteMediaBlob(t.url);
    await db.delete(mediaFiles).where(eq(mediaFiles.id, t.id));
    result.processed++;
  }
  return result;
}
