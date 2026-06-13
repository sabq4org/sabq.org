import { cloudflareImagesService } from './cloudflareImagesService';

/**
 * Delete the underlying blob for a media file from whichever backend stores it
 * (Cloudflare Images vs GCS/S3). The previous inline code piped EVERY url through
 * GCS logic, which silently failed for imagedelivery.net urls and orphaned the
 * blob on Cloudflare forever. Best-effort — a storage failure is logged and
 * swallowed so it never blocks the DB row deletion.
 */
export async function deleteMediaBlob(url: string): Promise<void> {
  try {
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
