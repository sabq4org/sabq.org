// Reference: javascript_object_storage blueprint
import { Storage, File } from "@google-cloud/storage";
import { Response } from "express";
import { randomUUID } from "crypto";
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  ObjectAclPolicy,
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

type ResolvedStorageProvider = "s3" | "r2" | "gcs" | "local";

function hasS3Credentials(): boolean {
  return !!(
    process.env.S3_ENDPOINT &&
    process.env.S3_BUCKET &&
    process.env.S3_ACCESS_KEY_ID &&
    process.env.S3_SECRET_ACCESS_KEY
  );
}

/** Generic R2_* first; fall back to NEWS_IMAGES_R2_* (what production actually has). */
function r2AccountId(): string | undefined {
  return process.env.R2_ACCOUNT_ID || process.env.NEWS_IMAGES_R2_ACCOUNT_ID || undefined;
}

function r2AccessKeyId(): string | undefined {
  return process.env.R2_ACCESS_KEY_ID || process.env.NEWS_IMAGES_R2_ACCESS_KEY_ID || undefined;
}

function r2SecretAccessKey(): string | undefined {
  return (
    process.env.R2_SECRET_ACCESS_KEY ||
    process.env.NEWS_IMAGES_R2_SECRET_ACCESS_KEY ||
    undefined
  );
}

function hasR2Credentials(): boolean {
  return !!(r2AccountId() && r2AccessKeyId() && r2SecretAccessKey());
}

function isReplitRuntime(): boolean {
  return !!(
    process.env.REPL_ID ||
    process.env.REPL_SLUG ||
    process.env.REPLIT_DEPLOYMENT === "1"
  );
}

/**
 * Resolve the active object-storage backend.
 *
 * Production (sabq.org) has Cloudflare R2 via NEWS_IMAGES_R2_*. Railway often
 * still has STORAGE_PROVIDER=s3 + a dead Replit/Tigris bucket
 * (e.g. lightweight-holder-*) which returns NoSuchBucket for correspondent
 * license/CV uploads. Prefer R2 whenever its credentials exist, unless
 * OBJECT_STORAGE_FORCE_S3=1. Only use the Replit GCS path on Replit.
 */
function resolveStorageProvider(): ResolvedStorageProvider {
  const explicit = (process.env.STORAGE_PROVIDER || "").toLowerCase().trim();
  const forceS3 = process.env.OBJECT_STORAGE_FORCE_S3 === "1";

  // Live R2 wins over stale S3 env left over from the Replit → Railway move.
  if (hasR2Credentials() && !forceS3) {
    if (explicit === "s3") {
      console.warn(
        "[ObjectStorage] STORAGE_PROVIDER=s3 ignored — using R2 " +
          "(stale S3 buckets cause NoSuchBucket). Set OBJECT_STORAGE_FORCE_S3=1 to force S3.",
      );
    }
    return "r2";
  }

  if (explicit === "s3") return "s3";
  if (explicit === "r2") return "r2";
  if (explicit === "gcs") return "gcs";

  // unset / "local" / unknown → auto-detect
  if (hasS3Credentials()) return "s3";
  if (isReplitRuntime()) return "gcs";
  return "local";
}

const STORAGE_PROVIDER: ResolvedStorageProvider = resolveStorageProvider();
const R2_CRED_SOURCE = process.env.R2_ACCOUNT_ID
  ? "R2_*"
  : process.env.NEWS_IMAGES_R2_ACCOUNT_ID
    ? "NEWS_IMAGES_R2_*"
    : "none";

console.log(
  `[ObjectStorage] provider=${STORAGE_PROVIDER}` +
    ` (env STORAGE_PROVIDER=${process.env.STORAGE_PROVIDER || "(unset)"}` +
    (STORAGE_PROVIDER === "r2" ? `, r2Creds=${R2_CRED_SOURCE}` : "") +
    `)`,
);

/** True when private file upload/download (license/CV, PDFs, etc.) can work. */
export function isPrivateObjectStorageConfigured(): boolean {
  // R2 (incl. NEWS_IMAGES_R2_*) wins for private docs even when a stale
  // STORAGE_PROVIDER=s3 / FORCE_S3 points at a dead Tigris bucket.
  if (hasR2Credentials()) return true;
  if (STORAGE_PROVIDER === "s3") return hasS3Credentials();
  if (STORAGE_PROVIDER === "r2") return hasR2Credentials();
  if (STORAGE_PROVIDER === "gcs") return isReplitRuntime();
  return false;
}

let r2Client: S3Client | null = null;
let s3Client: S3Client | null = null;

function getR2Client(): S3Client {
  if (!r2Client) {
    const accountId = r2AccountId();
    const accessKeyId = r2AccessKeyId();
    const secretAccessKey = r2SecretAccessKey();

    if (!accountId || !accessKeyId || !secretAccessKey) {
      throw new Error(
        "[R2] Missing R2 credentials. Set R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/" +
          "R2_SECRET_ACCESS_KEY (or NEWS_IMAGES_R2_* equivalents).",
      );
    }

    r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }
  return r2Client;
}

function getR2Bucket(): string {
  // Prefer dedicated private-docs bucket when set; else news-images bucket
  // (private keys still live under `.private/` and are served via signed URLs).
  return (
    process.env.R2_BUCKET_NAME ||
    process.env.NEWS_IMAGES_R2_BUCKET_NAME ||
    "sabq-media"
  );
}

// Generic S3-compatible client (Tigris on Railway, MinIO, Backblaze B2,
// AWS S3, etc.). Activated by STORAGE_PROVIDER=s3. Uses:
//   S3_ENDPOINT          full URL incl. https://, e.g. https://t3.storageapi.dev
//   S3_BUCKET            bucket name
//   S3_ACCESS_KEY_ID
//   S3_SECRET_ACCESS_KEY
//   S3_REGION            optional, defaults to "auto" (works for Tigris/R2)
//   S3_PUBLIC_URL        optional, full base URL for public reads. If unset,
//                        falls back to path-style ${S3_ENDPOINT}/${bucket}.
//   S3_FORCE_PATH_STYLE  optional, "true"/"false". Defaults to true since most
//                        S3-compat providers don't support virtual-hosted style
//                        without DNS setup.
function getS3Client(): S3Client {
  if (!s3Client) {
    const endpoint = process.env.S3_ENDPOINT;
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

    if (!endpoint || !accessKeyId || !secretAccessKey) {
      throw new Error(
        "[S3] Missing S3 credentials. Set S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY",
      );
    }

    s3Client = new S3Client({
      region: process.env.S3_REGION || "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
    });
  }
  return s3Client;
}

function getS3Bucket(): string {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error("[S3] S3_BUCKET env var is required");
  return bucket;
}

function getS3PublicUrl(bucket: string): string {
  const explicit = process.env.S3_PUBLIC_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  const endpoint = (process.env.S3_ENDPOINT || "").replace(/\/+$/, "");
  return `${endpoint}/${bucket}`;
}

/**
 * Convert GCS URL to Cloudflare CDN URL for better performance
 * This routes images through Cloudflare's Polish for WebP conversion
 * and edge caching for faster delivery.
 * 
 * Example:
 * Input:  https://storage.googleapis.com/bucket-name/public/image.jpg
 * Output: https://sabq.org/cdn-img/bucket-name/public/image.jpg
 */
export function toCdnUrl(gcsUrl: string): string {
  // Only convert GCS URLs in production
  const isProduction = process.env.NODE_ENV === 'production' || 
                       process.env.REPL_SLUG === 'sabq-smart' ||
                       process.env.REPLIT_DEPLOYMENT === '1';
  
  if (!isProduction) {
    return gcsUrl; // Keep original URL in development
  }
  
  // Check if it's a GCS URL
  if (!gcsUrl.startsWith('https://storage.googleapis.com/')) {
    return gcsUrl;
  }
  
  // Extract path after storage.googleapis.com/
  const gcsPath = gcsUrl.replace('https://storage.googleapis.com/', '');
  
  // Return CDN URL
  return `https://sabq.org/cdn-img/${gcsPath}`;
}

/**
 * Convert CDN URL back to GCS URL (for internal operations)
 */
export function fromCdnUrl(cdnUrl: string): string {
  if (!cdnUrl.startsWith('https://sabq.org/cdn-img/')) {
    return cdnUrl;
  }
  
  const gcsPath = cdnUrl.replace('https://sabq.org/cdn-img/', '');
  return `https://storage.googleapis.com/${gcsPath}`;
}

export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

/**
 * Get the correct bucket configuration with fallbacks
 * Prioritizes DEFAULT_OBJECT_STORAGE_BUCKET_ID over env-configured bucket names
 */
export interface BucketConfig {
  bucketName: string;
  privatePrefix: string;  // e.g., ".private"
  publicPrefix: string;   // e.g., "public"
}

// Legacy bucket ID for fallback reads (old articles have images in this bucket)
const LEGACY_BUCKET_ID = 'replit-objstore-3dc2325c-bbbe-4e54-9a00-e6f10b243138';

export function getLegacyBucketConfig(): BucketConfig | null {
  if (!LEGACY_BUCKET_ID) return null;
  return {
    bucketName: LEGACY_BUCKET_ID,
    privatePrefix: '.private',
    publicPrefix: 'public'
  };
}

// Cached bucket config to avoid repeated parsing and logging
let _cachedBucketConfig: BucketConfig | null = null;

export function getBucketConfig(): BucketConfig {
  // Return cached config if available
  if (_cachedBucketConfig) {
    return _cachedBucketConfig;
  }
  const defaultBucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID || '';
  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR || '';
  const publicSearchPaths = process.env.PUBLIC_OBJECT_SEARCH_PATHS || '';
  
  let bucketName: string = '';
  let privatePrefix: string = '.private';
  let publicPrefix: string = 'public';
  
  // Helper to extract prefix from path, stripping bucket/objects segments
  const extractPrefix = (path: string): string | null => {
    const parts = path.split('/').filter(Boolean);
    // Format: /objects/<bucket>/<prefix> or /<bucket>/<prefix> or just /<prefix>
    if (parts.length === 0) return null;
    
    // Skip 'objects' if present
    let startIdx = parts[0] === 'objects' ? 1 : 0;
    
    // Skip bucket name segment (non-prefix part that doesn't start with '.' or isn't a known prefix)
    if (startIdx < parts.length && !parts[startIdx].startsWith('.') && parts[startIdx] !== 'public') {
      startIdx++;
    }
    
    // Return remaining parts as prefix
    if (startIdx < parts.length) {
      return parts.slice(startIdx).join('/');
    }
    return null;
  };
  
  // Extract private prefix
  if (privateObjectDir) {
    const extracted = extractPrefix(privateObjectDir);
    if (extracted) {
      privatePrefix = extracted;
    }
  }
  
  // Extract public prefix
  if (publicSearchPaths) {
    const firstPath = publicSearchPaths.split(',')[0].trim();
    const extracted = extractPrefix(firstPath);
    if (extracted) {
      publicPrefix = extracted;
    }
  }
  
  // Use DEFAULT_OBJECT_STORAGE_BUCKET_ID as the authoritative bucket name
  if (defaultBucketId) {
    bucketName = defaultBucketId;
  } else if (privateObjectDir) {
    // Fallback: extract bucket from PRIVATE_OBJECT_DIR
    const parts = privateObjectDir.split('/').filter(Boolean);
    const startIdx = parts[0] === 'objects' ? 1 : 0;
    if (startIdx < parts.length && !parts[startIdx].startsWith('.')) {
      bucketName = parts[startIdx];
    }
  } else if (publicSearchPaths) {
    // Fallback: extract bucket from PUBLIC_OBJECT_SEARCH_PATHS
    const firstPath = publicSearchPaths.split(',')[0].trim();
    const parts = firstPath.split('/').filter(Boolean);
    const startIdx = parts[0] === 'objects' ? 1 : 0;
    if (startIdx < parts.length) {
      bucketName = parts[startIdx];
    }
  }
  
  if (!bucketName) {
    throw new Error('No object storage bucket configured. Set DEFAULT_OBJECT_STORAGE_BUCKET_ID or PRIVATE_OBJECT_DIR.');
  }
  
  // Log only once on first call
  console.log(`[ObjectStorage] getBucketConfig: bucket=${bucketName}, private=${privatePrefix}, public=${publicPrefix}`);
  
  // Cache the result for subsequent calls
  _cachedBucketConfig = {
    bucketName,
    privatePrefix,
    publicPrefix
  };
  
  return _cachedBucketConfig;
}

export class ObjectStorageService {
  constructor() {}

  getPublicObjectSearchPaths(): Array<string> {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths = Array.from(
      new Set(
        pathsStr
          .split(",")
          .map((path) => path.trim())
          .filter((path) => path.length > 0)
      )
    );
    if (paths.length === 0) {
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS not set. Create a bucket in 'Object Storage' " +
          "tool and set PUBLIC_OBJECT_SEARCH_PATHS env var (comma-separated paths)."
      );
    }
    return paths;
  }

  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set PRIVATE_OBJECT_DIR env var."
      );
    }
    return dir;
  }

  async searchPublicObject(filePath: string): Promise<File | null> {
    // First search in public paths (new bucket)
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath}/${filePath}`;
      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      const [exists] = await file.exists();
      if (exists) {
        return file;
      }
    }

    // Fallback: Also search in private directory for files that have public ACL
    // This handles legacy uploads that went to .private/uploads/ but are marked public
    try {
      const privateDir = this.getPrivateObjectDir();
      const fullPath = `${privateDir}/${filePath}`;
      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      const [exists] = await file.exists();
      if (exists) {
        // Check if this file is marked as public before serving
        const aclPolicy = await getObjectAclPolicy(file);
        if (aclPolicy?.visibility === "public") {
          return file;
        }
      }
    } catch (error) {
      // Ignore errors from private dir search - it's a fallback
    }

    // LEGACY BUCKET FALLBACK: Search in the old bucket for historic articles
    const legacyConfig = getLegacyBucketConfig();
    if (legacyConfig) {
      try {
        // Try public directory in legacy bucket
        const legacyPublicPath = `public/${filePath}`;
        const legacyBucket = objectStorageClient.bucket(legacyConfig.bucketName);
        const legacyPublicFile = legacyBucket.file(legacyPublicPath);
        
        const [publicExists] = await legacyPublicFile.exists();
        if (publicExists) {
          console.log(`[ObjectStorage] Found in legacy bucket (public): ${filePath}`);
          return legacyPublicFile;
        }
        
        // Try private directory in legacy bucket
        const legacyPrivatePath = `.private/${filePath}`;
        const legacyPrivateFile = legacyBucket.file(legacyPrivatePath);
        
        const [privateExists] = await legacyPrivateFile.exists();
        if (privateExists) {
          console.log(`[ObjectStorage] Found in legacy bucket (private): ${filePath}`);
          return legacyPrivateFile;
        }
      } catch (error) {
        // Ignore errors from legacy bucket search - it's a fallback
        console.log(`[ObjectStorage] Legacy bucket search error for ${filePath}:`, error);
      }
    }

    return null;
  }

  async downloadObject(file: File, res: Response, options?: { cacheTtlSec?: number; forcePublic?: boolean }) {
    try {
      const [metadata] = await file.getMetadata();
      // If forcePublic is true (e.g., /public-objects/ route), skip ACL check
      const isPublic = options?.forcePublic || (await getObjectAclPolicy(file))?.visibility === "public";
      
      // Determine content type with validation
      const contentType = metadata.contentType || "application/octet-stream";
      
      // Only treat as safe inline image if content type is a safe raster image type
      // SVG is excluded because it can contain embedded JavaScript (XSS risk)
      const safeImageTypes = [
        'image/webp', 'image/png', 'image/jpeg', 'image/jpg', 
        'image/gif', 'image/avif'
      ];
      const isSafeImage = safeImageTypes.includes(contentType.toLowerCase());
      const isImage = isSafeImage;
      const isWebP = contentType.toLowerCase() === "image/webp";
      
      // Cache durations:
      // - WebP images: 1 year (optimized, immutable content)
      // - Other images: 1 week
      // - Other files: 1 hour
      let defaultCacheTtl = 3600; // 1 hour default
      let useImmutable = false;
      
      if (isImage) {
        if (isWebP) {
          defaultCacheTtl = 31536000; // 1 year
          useImmutable = true;
        } else {
          defaultCacheTtl = 604800; // 1 week
        }
      }
      
      const finalCacheTtl = options?.cacheTtlSec ?? defaultCacheTtl;
      
      // CDN-optimized cache control for public content
      // s-maxage controls CDN cache, max-age controls browser cache
      // stale-while-revalidate allows serving stale content during revalidation
      const cdnMaxAge = isImage ? 86400 : 3600; // 1 day for images, 1 hour for others
      const cacheControl = isPublic 
        ? `public, max-age=${finalCacheTtl}, s-maxage=${cdnMaxAge}, stale-while-revalidate=86400${useImmutable ? ", immutable" : ""}`
        : `private, max-age=${finalCacheTtl}`;
      
      const headers: Record<string, string | number> = {
        "Content-Type": contentType,
        "Cache-Control": cacheControl,
      };
      
      // Add Content-Length if available
      if (metadata.size) {
        headers["Content-Length"] = metadata.size;
      }
      
      // Add ETag for conditional requests (helps with caching validation)
      if (metadata.etag) {
        headers["ETag"] = metadata.etag;
      }
      
      // Add Vary header for content negotiation on images
      if (isImage) {
        headers["Vary"] = "Accept";
      }
      
      headers["X-Content-Type-Options"] = "nosniff";
      
      if (!isImage) {
        const fileName = file.name.split('/').pop() || 'download';
        headers["Content-Disposition"] = `attachment; filename="${fileName}"`;
      }
      
      if (contentType.toLowerCase() === 'image/svg+xml') {
        const fileName = file.name.split('/').pop() || 'download.svg';
        headers["Content-Disposition"] = `attachment; filename="${fileName}"`;
      }
      
      res.set(headers);

      const stream = file.createReadStream();

      stream.on("error", (err) => {
        console.error("Stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error streaming file" });
        }
      });

      stream.pipe(res);
    } catch (error) {
      console.error("Error downloading file:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error downloading file" });
      }
    }
  }

  async getObjectEntityUploadURL(): Promise<string> {
    // S3-compatible backend (Tigris on Railway, etc.) — sign a PUT URL
    // directly against the configured S3 endpoint. The browser will PUT
    // the file at this URL, then the client calls /api/article-images
    // (or similar) to finalize. Files are placed under uploads/<uuid>
    // with NO public/private prefix here; finalize handlers decide
    // whether to copy/move them.
    if (STORAGE_PROVIDER === 's3') {
      const client = getS3Client();
      const bucket = getS3Bucket();
      const objectId = randomUUID();
      // Place under public/ so the resulting URL is immediately
      // publicly readable (matches uploadFileS3's public path layout).
      // ACL is signed into the URL — providers that support per-object
      // ACLs (Tebi, R2, S3, etc.) will mark the upload public-read
      // automatically. The browser PUT doesn't need to send an extra
      // header. If your provider rejects ACL (rare), set
      // S3_DISABLE_ACL=true and configure the bucket public elsewhere.
      const key = `public/uploads/${objectId}`;
      const useAcl = process.env.S3_DISABLE_ACL !== "true";
      const cmd = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ...(useAcl ? { ACL: "public-read" as const } : {}),
      });
      return getSignedUrl(client, cmd, { expiresIn: 900 });
    }

    if (STORAGE_PROVIDER === 'r2') {
      const client = getR2Client();
      const bucket = getR2Bucket();
      const objectId = randomUUID();
      const key = `public/uploads/${objectId}`;
      const cmd = new PutObjectCommand({ Bucket: bucket, Key: key });
      return getSignedUrl(client, cmd, { expiresIn: 900 });
    }

    if (STORAGE_PROVIDER !== 'gcs') {
      throw new Error(
        "[ObjectStorage] Upload URL unavailable — configure STORAGE_PROVIDER=s3 or r2.",
      );
    }

    // GCS-via-Replit-sidecar path (legacy, Replit only)
    const privateObjectDir = this.getPrivateObjectDir();
    if (!privateObjectDir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set PRIVATE_OBJECT_DIR env var."
      );
    }

    const objectId = randomUUID();
    const fullPath = `${privateObjectDir}/uploads/${objectId}`;

    const { bucketName, objectName } = parseObjectPath(fullPath);

    return signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900,
    });
  }

  async uploadFileR2(
    path: string,
    buffer: Buffer,
    contentType: string,
    visibility: "public" | "private" = "private"
  ): Promise<{ url: string; path: string }> {
    const client = getR2Client();
    const bucket = getR2Bucket();
    const prefix = visibility === "public" ? "public" : ".private";
    const key = `${prefix}/${path}`;

    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }));

    const r2PublicUrl = process.env.R2_PUBLIC_URL || `https://${bucket}.r2.dev`;
    const url = visibility === "public" ? `${r2PublicUrl}/${key}` : key;

    return { url, path: key };
  }

  // Generic S3-compatible upload (Tebi/Tigris on Railway, MinIO, AWS S3, etc.).
  // Public files go under `public/` and are served via S3_PUBLIC_URL;
  // private files go under `.private/` and are returned by key only — fetch
  // them via signed URLs when needed.
  //
  // ACL: public files get x-amz-acl=public-read. Tebi doesn't support
  // bucket policies (PutBucketPolicy → 501) but accepts per-object ACLs.
  // AWS S3, R2, Backblaze, MinIO all accept this too. If your provider
  // rejects ACLs (rare), set S3_DISABLE_ACL=true and either configure the
  // bucket as public via the provider's console or front it with a CDN.
  async uploadFileS3(
    path: string,
    buffer: Buffer,
    contentType: string,
    visibility: "public" | "private" = "private",
  ): Promise<{ url: string; path: string }> {
    const client = getS3Client();
    const bucket = getS3Bucket();
    const prefix = visibility === "public" ? "public" : ".private";
    const key = `${prefix}/${path}`;
    const wantPublic = visibility === "public";
    const useAcl = process.env.S3_DISABLE_ACL !== "true";

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ...(useAcl && wantPublic ? { ACL: "public-read" as const } : {}),
      }),
    );

    const url = wantPublic ? `${getS3PublicUrl(bucket)}/${key}` : key;
    return { url, path: key };
  }

  // Short-lived signed GET URL for a PRIVATE file previously stored via
  // uploadFile(..., 'private'). `key` is the stored `path` return value:
  // `.private/<path>` on s3/r2, or a full `/bucket/...` path on legacy GCS.
  // Used by admin-only routes (e.g. correspondent license/CV downloads) —
  // never embed these keys in public payloads.
  async getPrivateFileDownloadURL(key: string, ttlSec: number = 300): Promise<string> {
    if (STORAGE_PROVIDER === 's3') {
      const client = getS3Client();
      const bucket = getS3Bucket();
      return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: ttlSec });
    }
    if (STORAGE_PROVIDER === 'r2') {
      const client = getR2Client();
      const bucket = getR2Bucket();
      return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: ttlSec });
    }
    if (STORAGE_PROVIDER !== 'gcs') {
      throw new Error(
        "[ObjectStorage] Private download unavailable — configure STORAGE_PROVIDER=s3 or r2.",
      );
    }
    const fullPath = key.startsWith('/') ? key : `${this.getPrivateObjectDir()}/${key}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    return signObjectURL({ bucketName, objectName, method: "GET", ttlSec });
  }

  /**
   * Private documents (media licenses, CVs). Always prefers R2 when credentials
   * exist — ignores OBJECT_STORAGE_FORCE_S3 so a dead legacy S3 bucket cannot
   * block writer/reporter license uploads.
   */
  async uploadPrivateDocument(
    path: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<{ url: string; path: string }> {
    if (hasR2Credentials()) {
      return this.uploadFileR2(path, buffer, contentType, "private");
    }
    if (hasS3Credentials()) {
      return this.uploadFileS3(path, buffer, contentType, "private");
    }
    throw new Error(
      "[ObjectStorage] Private document upload unavailable — configure R2 " +
        "(R2_* or NEWS_IMAGES_R2_*) or S3 credentials.",
    );
  }

  async uploadFile(
    path: string,
    buffer: Buffer,
    contentType: string,
    visibility: "public" | "private" = "private"
  ): Promise<{ url: string; path: string }> {
    if (STORAGE_PROVIDER === 's3') {
      return this.uploadFileS3(path, buffer, contentType, visibility);
    }
    if (STORAGE_PROVIDER === 'r2') {
      return this.uploadFileR2(path, buffer, contentType, visibility);
    }

    if (STORAGE_PROVIDER !== 'gcs') {
      // Avoid the Replit sidecar (127.0.0.1:1106) on Railway/local — it always
      // ECONNREFUSED outside Replit and surfaces as a raw GaxiosError to users.
      throw new Error(
        "[ObjectStorage] No usable storage backend. Set STORAGE_PROVIDER=s3 " +
          "(with S3_ENDPOINT/S3_BUCKET/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY) " +
          "or STORAGE_PROVIDER=r2 (with R2_* credentials).",
      );
    }

    // Use public or private directory based on visibility
    const baseDir = visibility === "public" 
      ? this.getPublicObjectSearchPaths()[0] 
      : this.getPrivateObjectDir();
    
    if (!baseDir) {
      throw new Error(
        `${visibility === "public" ? "PUBLIC_OBJECT_SEARCH_PATHS" : "PRIVATE_OBJECT_DIR"} not set. ` +
        "Create a bucket in 'Object Storage' tool and set the env var."
      );
    }

    const fullPath = `${baseDir}/${path}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);

    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);

    await file.save(buffer, {
      metadata: {
        contentType,
      },
    });

    // For public files in the public/ directory, they're automatically accessible
    // No need to call makePublic() as Replit Object Storage doesn't allow it
    
    // Return CDN URL for better performance (Cloudflare Polish + edge caching)
    const gcsUrl = `https://storage.googleapis.com/${bucketName}/${objectName}`;
    return {
      url: toCdnUrl(gcsUrl),
      path: fullPath,
    };
  }

  async getObjectEntityFile(objectPath: string): Promise<File> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }

    const entityId = parts.slice(1).join("/");
    
    // Use bucket ID from environment configuration
    const config = getBucketConfig();
    const objectName = `.private/${entityId}`;
    
    // Try new bucket first
    const bucket = objectStorageClient.bucket(config.bucketName);
    const objectFile = bucket.file(objectName);
    const [exists] = await objectFile.exists();
    if (exists) {
      return objectFile;
    }
    
    // LEGACY BUCKET FALLBACK: Try old bucket for historic articles
    const legacyConfig = getLegacyBucketConfig();
    if (legacyConfig) {
      const legacyBucket = objectStorageClient.bucket(legacyConfig.bucketName);
      const legacyFile = legacyBucket.file(objectName);
      const [legacyExists] = await legacyFile.exists();
      if (legacyExists) {
        console.log(`[ObjectStorage] Found in legacy bucket: ${objectName}`);
        return legacyFile;
      }
    }
    
    throw new ObjectNotFoundError();
  }

  normalizeObjectEntityPath(rawPath: string): string {
    console.log("[ObjectStorage] normalizeObjectEntityPath - Input:", rawPath);
    
    if (!rawPath.startsWith("https://storage.googleapis.com/")) {
      console.log("[ObjectStorage] Not a GCS URL, returning as-is");
      return rawPath;
    }

    const url = new URL(rawPath);
    const rawObjectPath = url.pathname;
    console.log("[ObjectStorage] URL pathname:", rawObjectPath);

    // Extract bucket name from the URL path (first segment after /)
    const pathParts = rawObjectPath.split('/').filter(p => p);
    const urlBucketName = pathParts[0] || '';
    console.log("[ObjectStorage] URL bucket name:", urlBucketName);

    // Check if this matches our configured bucket ID
    const config = getBucketConfig();
    const isOurBucket = urlBucketName === config.bucketName || urlBucketName === 'sabq-production-bucket';
    
    if (!isOurBucket) {
      console.log("[ObjectStorage] Not our bucket:", urlBucketName, "expected:", config.bucketName);
      return rawObjectPath;
    }

    // Check if it's in the .private directory
    const remainingPath = pathParts.slice(1).join('/');
    if (!remainingPath.startsWith('.private/')) {
      console.log("[ObjectStorage] Not in .private directory, returning pathname");
      return rawObjectPath;
    }

    // Extract the entity ID (path after .private/)
    const entityId = remainingPath.slice('.private/'.length);
    const result = `/objects/${entityId}`;
    console.log("[ObjectStorage] Normalized to:", result);
    return result;
  }

  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy
  ): Promise<string> {
    // S3-compatible (Tigris/R2/etc.): files were uploaded directly under
    // public/ via the presigned URL, so they're already public-readable.
    // Strip any AWS query params left behind by the presigned PUT and
    // return the canonical URL — this is what gets saved as the article's
    // imageUrl.
    if (STORAGE_PROVIDER === 's3' || STORAGE_PROVIDER === 'r2') {
      try {
        const u = new URL(rawPath);
        // Drop signing query params (X-Amz-*, etc.)
        u.search = "";
        return u.toString();
      } catch {
        return rawPath;
      }
    }

    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) {
      return normalizedPath;
    }

    const objectFile = await this.getObjectEntityFile(normalizedPath);
    
    // If visibility is public, move file from .private to public directory
    if (aclPolicy.visibility === "public") {
      const privateDir = this.getPrivateObjectDir();
      const publicPaths = this.getPublicObjectSearchPaths();
      const publicDir = publicPaths[0]; // Use first public path
      
      // Get the relative path (e.g., "uploads/xxx")
      // objectFile.name is like ".private/uploads/xxx", we want just "uploads/xxx"
      const relativePath = objectFile.name.replace('.private/', '');
      
      // Create new public path
      const newObjectName = `public/${relativePath}`;
      const newFile = objectStorageClient.bucket(objectFile.bucket.name).file(newObjectName);
      
      console.log("[ObjectStorage] Moving file from private to public:");
      console.log("  From:", objectFile.name);
      console.log("  To:", newObjectName);
      
      // Copy file to public location
      await objectFile.copy(newFile);
      
      // Set ACL policy in metadata
      await setObjectAclPolicy(newFile, aclPolicy);
      
      // Delete original private file
      await objectFile.delete();
      
      // Return public object path (served via /public-objects/ route)
      const publicPath = `/public-objects/${relativePath}`;
      console.log("[ObjectStorage] Returning public path:", publicPath);
      return publicPath;
    }
    
    // For private files, just set ACL
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }

  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: File;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }
}

// Bucket alias to actual bucket name mapping
// The env vars use "sabq-production-bucket" as an alias, but the actual GCS bucket has a different name
function getBucketAliasMap(): Record<string, string> {
  const config = getBucketConfig();
  return {
    "sabq-production-bucket": config.bucketName,
  };
}

function resolveBucketAlias(bucketAlias: string): string {
  const aliasMap = getBucketAliasMap();
  return aliasMap[bucketAlias] || bucketAlias;
}

function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }

  const bucketAlias = pathParts[1];
  const bucketName = resolveBucketAlias(bucketAlias);
  const objectName = pathParts.slice(2).join("/");

  return {
    bucketName,
    objectName,
  };
}

async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec,
}: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
}): Promise<string> {
  const request = {
    bucket_name: bucketName,
    object_name: objectName,
    method,
    expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
  };
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    }
  );
  if (!response.ok) {
    throw new Error(
      `Failed to sign object URL, errorcode: ${response.status}, ` +
        `make sure you're running on Replit`
    );
  }

  const { signed_url: signedURL } = await response.json();
  return signedURL;
}
