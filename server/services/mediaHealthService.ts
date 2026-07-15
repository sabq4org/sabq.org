import { sql } from "drizzle-orm";
import { db } from "../db";

/**
 * Library health report (Phase 4): the monthly-review numbers from the plan —
 * pipeline coverage (analysis / embedding / hashing), governance coverage
 * (alt text / rights), archive-cleanup candidates, and reuse leaders. Served
 * on demand by GET /api/media/health-report and logged monthly by the cron.
 */
export interface MediaHealthReport {
  generatedAt: string;
  totals: { images: number };
  pipeline: {
    analyzedPct: number;
    analyzedFailed: number;
    embeddedPct: number;
    hashedPct: number;
  };
  governance: {
    withAltTextPct: number;
    rightsDocumentedPct: number;
    sensitiveCount: number;
  };
  cleanup: {
    duplicateGroups: number;
    unusedOverOneYear: number;
  };
  reuse: {
    topLast30Days: Array<{ id: string; title: string | null; fileName: string; uses: number }>;
  };
}

function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
}

export async function getMediaHealthReport(): Promise<MediaHealthReport> {
  const rows = await db.execute(sql`
    SELECT
      count(*)::int                                                          AS images,
      count(*) FILTER (WHERE ai_analysis_status = 'done')::int               AS analyzed,
      count(*) FILTER (WHERE ai_analysis_status = 'failed')::int             AS analyze_failed,
      count(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM media_vectors v WHERE v.media_file_id = media_files.id
      ))::int                                                                AS embedded,
      count(*) FILTER (WHERE perceptual_hash IS NOT NULL
                         AND perceptual_hash <> 'unhashable')::int           AS hashed,
      count(*) FILTER (WHERE alt_text IS NOT NULL AND alt_text <> '')::int   AS with_alt,
      count(*) FILTER (WHERE rights_verified = true
                          OR (credit_text IS NOT NULL AND credit_text <> ''))::int AS rights_ok,
      count(*) FILTER (WHERE ai_has_sensitive_content = true)::int           AS sensitive
    FROM media_files
    WHERE type = 'image'
  `).then((r: any) => (Array.isArray(r) ? r : r.rows));
  const t = rows[0] || {};
  const images = Number(t.images) || 0;

  const dupRows = await db.execute(sql`
    SELECT count(*)::int AS n FROM (
      SELECT perceptual_hash FROM media_files
      WHERE type = 'image' AND perceptual_hash IS NOT NULL AND perceptual_hash <> 'unhashable'
      GROUP BY perceptual_hash HAVING count(*) > 1
    ) g
  `).then((r: any) => (Array.isArray(r) ? r : r.rows));

  const unusedRows = await db.execute(sql`
    SELECT count(*)::int AS n FROM media_files m
    WHERE m.type = 'image'
      AND m.created_at < now() - interval '1 year'
      AND NOT EXISTS (SELECT 1 FROM media_usage_log u WHERE u.media_id = m.id)
      AND NOT EXISTS (SELECT 1 FROM article_media_assets a WHERE a.media_file_id = m.id)
  `).then((r: any) => (Array.isArray(r) ? r : r.rows));

  const topRows = await db.execute(sql`
    SELECT m.id, m.title, m.file_name AS "fileName", count(u.id)::int AS uses
    FROM media_usage_log u
    JOIN media_files m ON m.id = u.media_id
    WHERE u.created_at > now() - interval '30 days'
    GROUP BY m.id, m.title, m.file_name
    ORDER BY uses DESC
    LIMIT 5
  `).then((r: any) => (Array.isArray(r) ? r : r.rows));

  return {
    generatedAt: new Date().toISOString(),
    totals: { images },
    pipeline: {
      analyzedPct: pct(Number(t.analyzed) || 0, images),
      analyzedFailed: Number(t.analyze_failed) || 0,
      embeddedPct: pct(Number(t.embedded) || 0, images),
      hashedPct: pct(Number(t.hashed) || 0, images),
    },
    governance: {
      withAltTextPct: pct(Number(t.with_alt) || 0, images),
      rightsDocumentedPct: pct(Number(t.rights_ok) || 0, images),
      sensitiveCount: Number(t.sensitive) || 0,
    },
    cleanup: {
      duplicateGroups: Number(dupRows[0]?.n) || 0,
      unusedOverOneYear: Number(unusedRows[0]?.n) || 0,
    },
    reuse: {
      topLast30Days: (topRows || []).map((r: any) => ({
        id: r.id,
        title: r.title ?? null,
        fileName: r.fileName,
        uses: Number(r.uses) || 0,
      })),
    },
  };
}
