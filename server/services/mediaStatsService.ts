import { desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { mediaFiles, mediaVectors, articleMediaAssets, mediaUsageLog } from "@shared/schema";

export interface MediaStats {
  totalImages: number;
  aiGenerated: number;
  rightsVerified: number;
  pendingAnalysis: number; // not yet auto-tagged (Phase 2)
  indexed: number; // has a semantic vector (Phase 3)
  sensitive: number;
  totalStorageBytes: number;
  byLicense: { licenseType: string; count: number }[];
  topUsed: { id: string; title: string | null; originalName: string; url: string; usage: number }[];
}

/** Library governance dashboard (Phase 6): counts, license mix, storage, top-used. */
export async function getMediaStats(): Promise<MediaStats> {
  const [agg] = await db
    .select({
      total: sql<number>`count(*) filter (where ${mediaFiles.type} = 'image')`,
      aiGen: sql<number>`count(*) filter (where ${mediaFiles.isAiGenerated})`,
      rights: sql<number>`count(*) filter (where ${mediaFiles.rightsVerified})`,
      pending: sql<number>`count(*) filter (where ${mediaFiles.type} = 'image' and (${mediaFiles.aiAnalysisStatus} is null or ${mediaFiles.aiAnalysisStatus} in ('pending','failed')))`,
      sensitive: sql<number>`count(*) filter (where ${mediaFiles.aiHasSensitiveContent})`,
      storage: sql<number>`coalesce(sum(${mediaFiles.size}), 0)`,
    })
    .from(mediaFiles);

  const [idx] = await db.select({ n: sql<number>`count(*)` }).from(mediaVectors);

  const byLicenseRows = await db
    .select({
      licenseType: sql<string>`coalesce(${mediaFiles.licenseType}, 'unknown')`,
      count: sql<number>`count(*)`,
    })
    .from(mediaFiles)
    .where(eq(mediaFiles.type, "image"))
    .groupBy(sql`coalesce(${mediaFiles.licenseType}, 'unknown')`)
    .orderBy(desc(sql`count(*)`));

  const usageExpr = sql<number>`((select count(*) from ${articleMediaAssets} where ${articleMediaAssets.mediaFileId} = ${mediaFiles.id}) + (select count(*) from ${mediaUsageLog} where ${mediaUsageLog.mediaId} = ${mediaFiles.id}))`;
  const topUsedRows = await db
    .select({
      id: mediaFiles.id,
      title: mediaFiles.title,
      originalName: mediaFiles.originalName,
      url: mediaFiles.url,
      usage: usageExpr,
    })
    .from(mediaFiles)
    .where(eq(mediaFiles.type, "image"))
    .orderBy(desc(usageExpr))
    .limit(5);

  return {
    totalImages: Number(agg?.total) || 0,
    aiGenerated: Number(agg?.aiGen) || 0,
    rightsVerified: Number(agg?.rights) || 0,
    pendingAnalysis: Number(agg?.pending) || 0,
    indexed: Number(idx?.n) || 0,
    sensitive: Number(agg?.sensitive) || 0,
    totalStorageBytes: Number(agg?.storage) || 0,
    byLicense: byLicenseRows.map((r) => ({ licenseType: r.licenseType, count: Number(r.count) || 0 })),
    topUsed: topUsedRows
      .filter((r) => (Number(r.usage) || 0) > 0)
      .map((r) => ({
        id: r.id,
        title: r.title,
        originalName: r.originalName,
        url: r.url.startsWith("https://") ? r.url : `/api/media/proxy/${r.id}`,
        usage: Number(r.usage) || 0,
      })),
  };
}
