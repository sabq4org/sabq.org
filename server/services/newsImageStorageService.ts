import { createHash, randomUUID } from "node:crypto";
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import sharp from "sharp";
import {
  cloudflareImagesService,
  type CloudflareUploadResult,
} from "./cloudflareImagesService";

const LIVE_BROWSER_TTL_SECONDS = 2 * 24 * 60 * 60;
const LIVE_STALE_WHILE_REVALIDATE_SECONDS = 2 * 60 * 60;
const VARIANT_WIDTHS = [480, 960, 1600] as const;

export const LIVE_NEWS_IMAGE_CACHE_CONTROL =
  `public, max-age=${LIVE_BROWSER_TTL_SECONDS}, s-maxage=${LIVE_BROWSER_TTL_SECONDS}, ` +
  `stale-while-revalidate=${LIVE_STALE_WHILE_REVALIDATE_SECONDS}`;

export type NewsImageProvider = "r2" | "cloudflare-images";

export interface NewsImageUploadInput {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  purpose: string;
  metadata?: Record<string, string>;
  rolloutKey?: string;
}

export interface NewsImageUploadResult extends CloudflareUploadResult {
  provider?: NewsImageProvider;
  thumbnailUrl?: string;
  objectKey?: string;
}

interface R2NewsImageConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl: string;
}

interface PreparedObject {
  key: string;
  body: Buffer;
  contentType: string;
}

/**
 * The web media endpoint is shared by articles, avatars, categories, ads, and
 * other surfaces. Only explicit editorial purposes may enter the R2 rollout.
 */
export function isNewsImagePurpose(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const purpose = value.trim().toLowerCase();
  return /^(article|en-article|ur-article|mobile-article|email-article|whatsapp-article)(?:-|$)/.test(
    purpose,
  );
}

export function parseNewsImageRolloutPercent(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? "0"));
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(100, Math.max(0, parsed));
}

/** Stable bucketing keeps the same upload source in the same rollout cohort. */
export function shouldRouteNewsImageToR2(rolloutKey: string, percent: number): boolean {
  const normalizedPercent = parseNewsImageRolloutPercent(percent);
  if (normalizedPercent <= 0) return false;
  if (normalizedPercent >= 100) return true;
  const digest = createHash("sha256").update(rolloutKey).digest();
  const bucket = digest.readUInt32BE(0) / 0x1_0000_0000;
  return bucket * 100 < normalizedPercent;
}

export function buildNewsImageObjectPrefix(now: Date, imageId: string): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `news/${year}/${month}/${imageId}`;
}

function getR2Config(): R2NewsImageConfig | null {
  const accountId = (process.env.NEWS_IMAGES_R2_ACCOUNT_ID || "").trim();
  const accessKeyId = (process.env.NEWS_IMAGES_R2_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = (process.env.NEWS_IMAGES_R2_SECRET_ACCESS_KEY || "").trim();
  const bucketName = (process.env.NEWS_IMAGES_R2_BUCKET_NAME || "").trim();
  const publicUrl = (process.env.NEWS_IMAGES_R2_PUBLIC_URL || "").trim().replace(/\/+$/, "");

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName || !publicUrl) {
    return null;
  }

  try {
    const parsedPublicUrl = new URL(publicUrl);
    if (parsedPublicUrl.protocol !== "https:") return null;
  } catch {
    return null;
  }

  return { accountId, accessKeyId, secretAccessKey, bucketName, publicUrl };
}

function extensionForMimeType(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
    "image/heic": "heic",
    "image/heif": "heif",
  };
  return map[normalized] || "bin";
}

function publicObjectUrl(publicUrl: string, key: string): string {
  return `${publicUrl}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

function safeMetadataValue(value: string): string {
  return value.replace(/[^\x20-\x7E]/g, "_").slice(0, 256);
}

async function prepareR2Objects(
  input: NewsImageUploadInput,
  prefix: string,
): Promise<{ objects: PreparedObject[]; deliveryKey: string; thumbnailKey: string }> {
  const originalExtension = extensionForMimeType(input.mimeType);
  const originalKey = `${prefix}/original.${originalExtension}`;
  const original: PreparedObject = {
    key: originalKey,
    body: input.buffer,
    contentType: input.mimeType,
  };

  // Preserve animated GIFs byte-for-byte. The original remains the delivery
  // object because flattening an animation into a WebP still would be a visible
  // editorial change. Static formats get right-sized WebP renditions.
  if (input.mimeType.toLowerCase() === "image/gif") {
    return { objects: [original], deliveryKey: originalKey, thumbnailKey: originalKey };
  }

  const metadata = await sharp(input.buffer, { failOn: "truncated" }).metadata();
  const sourceWidth = metadata.width || 1600;
  const widths = Array.from(
    new Set([
      ...VARIANT_WIDTHS.filter((width) => width < sourceWidth),
      Math.min(sourceWidth, VARIANT_WIDTHS[VARIANT_WIDTHS.length - 1]),
    ]),
  ).sort((a, b) => a - b);

  const variants = await Promise.all(
    widths.map(async (width): Promise<PreparedObject> => ({
      key: `${prefix}/w${width}.webp`,
      body: await sharp(input.buffer, { failOn: "truncated" })
        .rotate()
        .resize({ width, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82, effort: 4, smartSubsample: true })
        .toBuffer(),
      contentType: "image/webp",
    })),
  );

  return {
    objects: [original, ...variants],
    deliveryKey: variants[variants.length - 1]?.key || originalKey,
    thumbnailKey: variants[0]?.key || originalKey,
  };
}

export class NewsImageStorageService {
  private r2Client: S3Client | null = null;
  private r2ClientFingerprint = "";

  isR2Configured(): boolean {
    return getR2Config() !== null;
  }

  getRolloutPercent(): number {
    return parseNewsImageRolloutPercent(process.env.NEWS_IMAGES_R2_ROLLOUT_PERCENT);
  }

  isUploadAvailable(): boolean {
    return (
      cloudflareImagesService.isCloudflareConfigured() ||
      (this.isR2Configured() && this.getRolloutPercent() > 0)
    );
  }

  async upload(input: NewsImageUploadInput): Promise<NewsImageUploadResult> {
    const rolloutPercent = this.getRolloutPercent();
    const rolloutKey = input.rolloutKey || input.metadata?.uploadedBy || input.filename;
    const shouldUseR2 =
      isNewsImagePurpose(input.purpose) &&
      shouldRouteNewsImageToR2(rolloutKey, rolloutPercent);

    if (shouldUseR2) {
      const config = getR2Config();
      if (config) {
        try {
          return await this.uploadToR2(input, config);
        } catch (error) {
          const message = error instanceof Error ? error.message : "unknown R2 error";
          console.error(`[News Images] R2 upload failed; using Cloudflare fallback: ${message}`);
        }
      } else {
        console.error(
          "[News Images] R2 rollout selected but NEWS_IMAGES_R2_* is incomplete; using Cloudflare fallback",
        );
      }
    }

    const fallback = await cloudflareImagesService.uploadToCloudflare(
      input.buffer,
      input.filename,
      { ...input.metadata, type: input.purpose },
      input.mimeType,
    );
    return {
      ...fallback,
      provider: fallback.success ? "cloudflare-images" : undefined,
    };
  }

  async deleteByPublicUrl(rawUrl: string): Promise<boolean> {
    const config = getR2Config();
    if (!config) return false;

    let parsedUrl: URL;
    let publicBase: URL;
    try {
      parsedUrl = new URL(rawUrl);
      publicBase = new URL(config.publicUrl);
    } catch {
      return false;
    }

    if (parsedUrl.origin !== publicBase.origin) return false;
    const key = decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, ""));
    const match = key.match(/^(news\/\d{4}\/\d{2}\/[a-f0-9-]+)\/[^/]+$/i);
    if (!match) return false;
    const prefix = `${match[1]}/`;
    const client = this.getClient(config);
    let continuationToken: string | undefined;
    let deletedAny = false;

    do {
      const listed = await client.send(
        new ListObjectsV2Command({
          Bucket: config.bucketName,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
        { abortSignal: AbortSignal.timeout(20_000) },
      );
      const keys = (listed.Contents || []).flatMap((item) => (item.Key ? [item.Key] : []));
      if (keys.length > 0) {
        await client.send(
          new DeleteObjectsCommand({
            Bucket: config.bucketName,
            Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
          }),
          { abortSignal: AbortSignal.timeout(20_000) },
        );
        deletedAny = true;
      }
      continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
    } while (continuationToken);

    return deletedAny;
  }

  private getClient(config: R2NewsImageConfig): S3Client {
    const fingerprint = `${config.accountId}:${config.accessKeyId}`;
    if (!this.r2Client || this.r2ClientFingerprint !== fingerprint) {
      this.r2Client?.destroy();
      this.r2Client = new S3Client({
        region: "auto",
        endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
      });
      this.r2ClientFingerprint = fingerprint;
    }
    return this.r2Client;
  }

  private async uploadToR2(
    input: NewsImageUploadInput,
    config: R2NewsImageConfig,
  ): Promise<NewsImageUploadResult> {
    const imageId = randomUUID();
    const prefix = buildNewsImageObjectPrefix(new Date(), imageId);
    const prepared = await prepareR2Objects(input, prefix);
    const client = this.getClient(config);
    const metadata = {
      purpose: safeMetadataValue(input.purpose),
      source: safeMetadataValue(input.metadata?.source || "sabq"),
    };

    const results = await Promise.allSettled(
      prepared.objects.map((object) =>
        client.send(
          new PutObjectCommand({
            Bucket: config.bucketName,
            Key: object.key,
            Body: object.body,
            ContentType: object.contentType,
            ContentDisposition: "inline",
            CacheControl: LIVE_NEWS_IMAGE_CACHE_CONTROL,
            Metadata: metadata,
          }),
          { abortSignal: AbortSignal.timeout(25_000) },
        ),
      ),
    );

    const failed = results.find((result) => result.status === "rejected");
    if (failed) {
      const uploadedKeys = prepared.objects
        .filter((_, index) => results[index]?.status === "fulfilled")
        .map((object) => ({ Key: object.key }));
      if (uploadedKeys.length > 0) {
        try {
          await client.send(
            new DeleteObjectsCommand({
              Bucket: config.bucketName,
              Delete: { Objects: uploadedKeys, Quiet: true },
            }),
            { abortSignal: AbortSignal.timeout(15_000) },
          );
        } catch (cleanupError) {
          console.error("[News Images] Failed to clean up partial R2 upload", cleanupError);
        }
      }
      throw failed.reason;
    }

    return {
      success: true,
      provider: "r2",
      imageId,
      objectKey: prepared.deliveryKey,
      deliveryUrl: publicObjectUrl(config.publicUrl, prepared.deliveryKey),
      thumbnailUrl: publicObjectUrl(config.publicUrl, prepared.thumbnailKey),
      filename: input.filename,
      uploaded: new Date().toISOString(),
    };
  }
}

export const newsImageStorageService = new NewsImageStorageService();
