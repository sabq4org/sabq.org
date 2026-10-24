import { and, ne, or, sql } from 'drizzle-orm';
import { articles, mediaFiles } from '@shared/schema';
import { db } from '../db';
import { cloudflareImagesService } from './cloudflareImagesService';
import { newsImageStorageService } from './newsImageStorageService';

/**
 * Delete the underlying blob for a media file from whichever backend stores it
 * (Cloudflare Images vs GCS/S3). The previous inline code piped EVERY url through
 * GCS logic, which silently failed for imagedelivery.net urls and orphaned the
 * blob on Cloudflare forever. Best-effort — a storage failure is logged and
 * swallowed so it never blocks the DB row deletion.
 */
export async function deleteMediaBlob(url: string): Promise<void> {
  try {
    if (await newsImageStorageService.deleteByPublicUrl(url)) {
      console.log('[Media Delete] Deleted R2 news image family');
      return;
    }
    const cfImageId = cloudflareImagesService.extractImageId(url);
    if (cfImageId) {
      await cloudflareImagesService.deleteImage(cfImageId);
      console.log('[Media Delete] Deleted Cloudflare image:', cfImageId);
      return;
    }
    if (url.startsWith('gs://') || url.includes('storage.googleapis.com')) {
      const { objectStorageClient, getBucketConfig } = await import('../objectStorage');
      let bucketName: string;
      let objectPath: string;
      if (url.startsWith('gs://')) {
        const parts = url.replace('gs://', '').split('/').filter(Boolean);
        bucketName = parts[0];
        objectPath = parts.slice(1).join('/');
      } else {
        const u = new URL(url);
        const parts = u.pathname.split('/').filter(Boolean);
        bucketName = parts[0];
        objectPath = parts.slice(1).join('/');
      }
      // Only touch our own bucket (mirrors the proxy's SSRF guard).
      const bucketConfig = getBucketConfig();
      if (bucketName === bucketConfig.bucketName) {
        await objectStorageClient.bucket(bucketName).file(objectPath).delete();
        console.log('[Media Delete] Deleted object from storage:', objectPath);
      }
    }
  } catch (storageError) {
    console.error('[Media Delete] Error deleting blob (continuing with DB delete):', storageError);
  }
}

/**
 * هوية الملف الفعلي خلف رابط وسائط: عائلة R2 (news/YYYY/MM/uuid/) التي يحذفها
 * deleteByPublicUrl كاملة، أو معرّف صورة Cloudflare. روابط مختلفة الشكل
 * (مقاس آخر، ?x=1) تشير إلى الملف نفسه، فالملكية لا تُقاس بنص الرابط.
 */
export function mediaBlobIdentity(url: string | null | undefined): string | null {
  if (!url) return null;
  const cfId = cloudflareImagesService.extractImageId(url);
  if (cfId) return `imagedelivery.net/%/${cfId}/`;
  try {
    const path = decodeURIComponent(new URL(url).pathname);
    const family = path.match(/\/(news\/\d{4}\/\d{2}\/[a-f0-9-]+)\//i);
    if (family) return `/${family[1]}/`;
  } catch {
    // ليس رابطًا مطلقًا
  }
  return null;
}

/**
 * يحذف الملف الفعلي فقط إذا لم يعد يشير إليه صف وسائط آخر ولا صورة مقال.
 * كان أي حساب media.view يسجّل رابط صورة غيره («حفظ رابط قائم» يُنشئ صفًا
 * يملكه) ثم يحذف صفه فيُحذف ملف المالك الأصلي معه.
 */
export async function deleteMediaBlobIfUnshared(row: { id: string; url: string }): Promise<void> {
  const identity = mediaBlobIdentity(row.url);
  const pattern = `%${identity ?? row.url.split('?')[0]}%`;
  try {
    const [otherMedia] = await db
      .select({ id: mediaFiles.id })
      .from(mediaFiles)
      .where(and(ne(mediaFiles.id, row.id), sql`${mediaFiles.url} LIKE ${pattern}`))
      .limit(1);
    const [articleRef] = otherMedia
      ? [null]
      : await db
          .select({ id: articles.id })
          .from(articles)
          .where(or(sql`${articles.imageUrl} LIKE ${pattern}`, sql`${articles.thumbnailUrl} LIKE ${pattern}`))
          .limit(1);
    if (otherMedia || articleRef) {
      console.log('[Media Delete] File still referenced elsewhere — keeping it');
      return;
    }
  } catch (err) {
    console.error('[Media Delete] Reference check failed — keeping the file:', err);
    return;
  }
  await deleteMediaBlob(row.url);
}
