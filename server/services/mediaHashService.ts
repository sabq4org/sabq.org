import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import sharp from "sharp";
import { db } from "../db";
import { mediaFiles } from "@shared/schema";
import { isSafeImageUrl } from "../utils/safeImageUrl";

// 64-bit dHash: resize to 9x8 grayscale, compare each pixel to its horizontal
// neighbor. Robust to re-encoding, resizing, and mild compression — the exact
// same photo uploaded twice as different files lands on the same hash.
const HASH_W = 9;
const HASH_H = 8;
/** Terminal marker so the nightly backfill never reselects a broken file. */
export const UNHASHABLE = "unhashable";
const MAX_HASH_FETCH_BYTES = 15 * 1024 * 1024;

export async function computeDHash(buffer: Buffer): Promise<string | null> {
  try {
    const raw = await sharp(buffer)
      .grayscale()
      .resize(HASH_W, HASH_H, { fit: "fill" })
      .raw()
      .toBuffer();

    let hash = 0n;
    for (let y = 0; y < HASH_H; y++) {
      for (let x = 0; x < HASH_W - 1; x++) {
        const left = raw[y * HASH_W + x];
        const right = raw[y * HASH_W + x + 1];
        hash = (hash << 1n) | (left > right ? 1n : 0n);
      }
    }
    return hash.toString(16).padStart(16, "0");
  } catch {
    return null;
  }
}

export interface DuplicateInfo {
  id: string;
  url: string;
  title: string | null;
  createdAt: Date | null;
}

function displayUrl(id: string, url: string): string {
  return url.startsWith("https://") || url.startsWith("/uploads/") ? url : `/api/media/proxy/${id}`;
}

/**
 * Compute + persist the perceptual hash for a freshly-uploaded image and
 * return the oldest visually-identical file already in the library (if any),
 * so the upload response can warn "هذه الصورة موجودة مسبقًا". Best-effort:
 * never throws, never blocks an upload on failure.
 */
export async function assignPerceptualHash(
  mediaFileId: string,
  buffer: Buffer,
): Promise<DuplicateInfo | null> {
  try {
    const hash = await computeDHash(buffer);
    await db
      .update(mediaFiles)
      .set({ perceptualHash: hash ?? UNHASHABLE })
      .where(eq(mediaFiles.id, mediaFileId));
    if (!hash) return null;

    const [dup] = await db
      .select({
        id: mediaFiles.id,
        url: mediaFiles.url,
        title: mediaFiles.title,
        createdAt: mediaFiles.createdAt,
      })
      .from(mediaFiles)
      .where(and(
        eq(mediaFiles.perceptualHash, hash),
        ne(mediaFiles.id, mediaFileId),
        eq(mediaFiles.type, "image"),
      ))
      .orderBy(mediaFiles.createdAt)
      .limit(1);

    if (!dup) return null;
    return { ...dup, url: displayUrl(dup.id, dup.url) };
  } catch (error: any) {
    console.warn("[Media Hash] assign failed:", mediaFileId, error?.message || error);
    return null;
  }
}

async function fetchImageBytes(id: string, url: string, size: number | null): Promise<Buffer | null> {
  if (size && size > MAX_HASH_FETCH_BYTES) return null;
  try {
    if (url.startsWith("https://")) {
      if (!isSafeImageUrl(url)) return null; // SSRF guard on DB-sourced URL (audit #3)
      const resp = await fetch(url, { redirect: "error" }); // no redirect past the allowlist check
      if (!resp.ok) return null;
      const buf = Buffer.from(await resp.arrayBuffer());
      return buf.length > 0 && buf.length <= MAX_HASH_FETCH_BYTES ? buf : null;
    }
    if (url.startsWith("gs://")) {
      const parts = url.replace("gs://", "").split("/");
      const bucketName = parts[0];
      const objectPath = parts.slice(1).join("/");
      const { objectStorageClient, getBucketConfig } = await import("../objectStorage");
      if (bucketName !== getBucketConfig().bucketName) return null;
      const file = objectStorageClient.bucket(bucketName).file(objectPath);
      const [exists] = await file.exists();
      if (!exists) return null;
      const [buf] = await file.download();
      return buf && buf.length > 0 && buf.length <= MAX_HASH_FETCH_BYTES ? buf : null;
    }
    return null;
  } catch {
    return null;
  }
}

export interface HashBackfillResult {
  processed: number;
  hashed: number;
  remaining: number;
}

/**
 * Backfill perceptual hashes over the archive in bounded batches (no AI cost —
 * just bandwidth + CPU). Every processed row gets a terminal value (hash or
 * "unhashable"), so `remaining` strictly decreases and the nightly loop ends.
 */
export async function backfillPerceptualHashes(batchSize = 20): Promise<HashBackfillResult> {
  const size = Math.min(50, Math.max(1, batchSize));

  const pendingCond = and(
    eq(mediaFiles.type, "image"),
    isNull(mediaFiles.perceptualHash),
    sql`(${mediaFiles.url} LIKE 'https://%' OR ${mediaFiles.url} LIKE 'gs://%')`,
  );

  const rows = await db
    .select({ id: mediaFiles.id, url: mediaFiles.url, size: mediaFiles.size })
    .from(mediaFiles)
    .where(pendingCond)
    .orderBy(desc(mediaFiles.createdAt))
    .limit(size);

  let hashed = 0;
  for (let i = 0; i < rows.length; i += 4) {
    const slice = rows.slice(i, i + 4);
    await Promise.all(slice.map(async (r) => {
      const buf = await fetchImageBytes(r.id, r.url, r.size ?? null);
      const hash = buf ? await computeDHash(buf) : null;
      await db
        .update(mediaFiles)
        .set({ perceptualHash: hash ?? UNHASHABLE })
        .where(eq(mediaFiles.id, r.id));
      if (hash) hashed++;
    }));
  }

  const [remainingRow] = await db
    .select({ n: sql<number>`count(*)` })
    .from(mediaFiles)
    .where(pendingCond);

  return { processed: rows.length, hashed, remaining: Number(remainingRow?.n) || 0 };
}

export interface DuplicateGroup {
  perceptualHash: string;
  count: number;
  files: Array<{
    id: string;
    url: string;
    title: string | null;
    fileName: string;
    size: number;
    usageCount: number;
    createdAt: Date | null;
  }>;
}

/**
 * Visually-identical groups in the archive (same dHash, 2+ files), largest
 * groups first — the librarian's cleanup worklist.
 */
export async function getDuplicateGroups(limit = 20): Promise<{ groups: DuplicateGroup[]; totalGroups: number }> {
  const groupLimit = Math.min(50, Math.max(1, limit));

  const grouped = await db
    .select({
      perceptualHash: mediaFiles.perceptualHash,
      count: sql<number>`count(*)`,
    })
    .from(mediaFiles)
    .where(and(
      eq(mediaFiles.type, "image"),
      sql`${mediaFiles.perceptualHash} IS NOT NULL AND ${mediaFiles.perceptualHash} <> ${UNHASHABLE}`,
    ))
    .groupBy(mediaFiles.perceptualHash)
    .having(sql`count(*) > 1`)
    .orderBy(desc(sql`count(*)`))
    .limit(groupLimit);

  const [totalRow] = await db.execute(sql`
    SELECT count(*)::int AS n FROM (
      SELECT perceptual_hash FROM media_files
      WHERE type = 'image' AND perceptual_hash IS NOT NULL AND perceptual_hash <> ${UNHASHABLE}
      GROUP BY perceptual_hash HAVING count(*) > 1
    ) g
  `).then((r: any) => (Array.isArray(r) ? r : r.rows));

  const groups: DuplicateGroup[] = [];
  for (const g of grouped) {
    if (!g.perceptualHash) continue;
    const files = await db
      .select({
        id: mediaFiles.id,
        url: mediaFiles.url,
        title: mediaFiles.title,
        fileName: mediaFiles.fileName,
        size: mediaFiles.size,
        usageCount: mediaFiles.usageCount,
        createdAt: mediaFiles.createdAt,
      })
      .from(mediaFiles)
      .where(eq(mediaFiles.perceptualHash, g.perceptualHash))
      .orderBy(mediaFiles.createdAt)
      .limit(10);
    groups.push({
      perceptualHash: g.perceptualHash,
      count: Number(g.count),
      files: files.map((f) => ({ ...f, url: displayUrl(f.id, f.url) })),
    });
  }

  return { groups, totalGroups: Number(totalRow?.n) || groups.length };
}
