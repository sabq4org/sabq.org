import cron from '../leaderCron';
import { backfillUntagged } from '../services/mediaAutoTagService';
import { backfillMediaEmbeddings } from '../services/mediaSearchService';
import { backfillPerceptualHashes } from '../services/mediaHashService';
import { getMediaHealthReport } from '../services/mediaHealthService';

// Nightly media pipeline: drains the analyze + embed backlog in bounded batches
// so the archive becomes fully tagged and semantically searchable without an
// admin looping the backfill endpoints from the browser.
//
// Nightly caps keep the Gemini spend predictable (~ANALYZE_CAP vision calls per
// night); embeddings are cheap text calls so their cap is higher. Both are
// env-tunable to speed up or throttle the archive catch-up.
const ANALYZE_CAP = Math.max(0, parseInt(process.env.MEDIA_PIPELINE_ANALYZE_CAP || '400', 10) || 0);
const EMBED_CAP = Math.max(0, parseInt(process.env.MEDIA_PIPELINE_EMBED_CAP || '2000', 10) || 0);
// Hashing costs no AI tokens (bandwidth + CPU only), so its cap can be higher.
const HASH_CAP = Math.max(0, parseInt(process.env.MEDIA_PIPELINE_HASH_CAP || '3000', 10) || 0);
const BATCH_SIZE = 20;
const BATCH_PAUSE_MS = 2000;

let running = false;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface MediaPipelineRunResult {
  analyzed: number;
  analyzeRemaining: number;
  embedded: number;
  embedRemaining: number;
  hashed: number;
  hashRemaining: number;
}

/** One full nightly pass. Safe to invoke manually; overlapping runs are skipped. */
export async function runMediaPipelineOnce(): Promise<MediaPipelineRunResult | null> {
  if (running) {
    console.log('[Media Pipeline] Previous run still in progress, skipping.');
    return null;
  }
  running = true;
  const result: MediaPipelineRunResult = {
    analyzed: 0, analyzeRemaining: -1,
    embedded: 0, embedRemaining: -1,
    hashed: 0, hashRemaining: -1,
  };

  try {
    console.log(`[Media Pipeline] Nightly run started (analyze cap ${ANALYZE_CAP}, embed cap ${EMBED_CAP})`);

    // 1) AI analysis (Gemini) — fills quality score, tags, alt text, and
    //    re-embeds each analyzed file with the enriched metadata.
    while (result.analyzed < ANALYZE_CAP) {
      const batch = await backfillUntagged(Math.min(BATCH_SIZE, ANALYZE_CAP - result.analyzed));
      result.analyzed += batch.processed;
      result.analyzeRemaining = batch.remaining;
      if (batch.remaining === 0 || batch.processed === 0) break;
      await sleep(BATCH_PAUSE_MS);
    }

    // 2) Embeddings for files that still have no vector (e.g. rows that predate
    //    the pipeline, or whose analysis is done but embed failed).
    while (result.embedded < EMBED_CAP) {
      const batch = await backfillMediaEmbeddings(Math.min(BATCH_SIZE, EMBED_CAP - result.embedded));
      result.embedded += batch.processed;
      result.embedRemaining = batch.remaining;
      if (batch.remaining === 0 || batch.processed === 0) break;
      await sleep(BATCH_PAUSE_MS);
    }

    // 3) Perceptual hashes (Phase 4 dedup) — no AI cost, just bytes + CPU.
    while (result.hashed < HASH_CAP) {
      const batch = await backfillPerceptualHashes(Math.min(BATCH_SIZE, HASH_CAP - result.hashed));
      result.hashed += batch.processed;
      result.hashRemaining = batch.remaining;
      if (batch.remaining === 0 || batch.processed === 0) break;
      await sleep(BATCH_PAUSE_MS);
    }

    console.log(
      `[Media Pipeline] Nightly run finished: analyzed ${result.analyzed} (remaining ${result.analyzeRemaining}), ` +
      `embedded ${result.embedded} (remaining ${result.embedRemaining}), ` +
      `hashed ${result.hashed} (remaining ${result.hashRemaining})`,
    );
    return result;
  } catch (error: any) {
    console.error('[Media Pipeline] Nightly run failed:', error?.message || error);
    return result;
  } finally {
    running = false;
  }
}

export function startMediaPipelineJob(): void {
  // 02:45 KSA — after the nightly cleanup jobs, before morning traffic.
  cron.schedule('45 2 * * *', () => { void runMediaPipelineOnce(); }, { timezone: 'Asia/Riyadh' });

  // Monthly health report (1st, 06:00 KSA): pipeline/governance coverage,
  // duplicate groups, unused-over-a-year candidates, reuse leaders. Logged
  // for ops; the same numbers are served live by GET /api/media/health-report.
  cron.schedule('0 6 1 * *', async () => {
    try {
      const report = await getMediaHealthReport();
      console.log('[Media Pipeline] Monthly health report:', JSON.stringify(report));
    } catch (error: any) {
      console.error('[Media Pipeline] Monthly health report failed:', error?.message || error);
    }
  }, { timezone: 'Asia/Riyadh' });

  console.log('[Media Pipeline] Jobs scheduled (nightly 02:45 + monthly report 1st 06:00 Asia/Riyadh)');
}
