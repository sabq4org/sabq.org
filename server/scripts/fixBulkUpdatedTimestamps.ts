import { db } from '../db';
import { sql } from 'drizzle-orm';

const BATCH_SIZE = 5000;

export async function fixBulkUpdatedTimestamps(): Promise<{ fixed: number; errors: number }> {
  let totalFixed = 0;
  let errors = 0;

  console.log('=== Fix Bulk-Updated Timestamps ===');
  console.log('Resetting updated_at to published_at for articles that were bulk-modified on 2026-03-13');
  console.log('Criteria: published_at < 2026-01-01 AND updated_at between 2026-03-13 and 2026-03-14');

  const countResult = await db.execute(sql`
    SELECT COUNT(*) as cnt FROM articles
    WHERE published_at < '2026-01-01'
      AND updated_at >= '2026-03-13'
      AND updated_at < '2026-03-14'
      AND status = 'published'
  `);
  const totalToFix = Number((countResult as any).rows?.[0]?.cnt || 0);
  console.log(`Found ${totalToFix} articles to fix`);

  if (totalToFix === 0) {
    console.log('No articles need fixing. Done.');
    return { fixed: 0, errors: 0 };
  }

  while (true) {
    try {
      const result = await db.execute(sql`
        UPDATE articles
        SET updated_at = published_at
        WHERE id IN (
          SELECT id FROM articles
          WHERE published_at < '2026-01-01'
            AND updated_at >= '2026-03-13'
            AND updated_at < '2026-03-14'
            AND status = 'published'
          LIMIT ${BATCH_SIZE}
        )
      `);

      const rowCount = (result as any).rowCount || 0;
      if (rowCount === 0) break;

      totalFixed += rowCount;
      console.log(`Progress: ${totalFixed}/${totalToFix} fixed`);

      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      console.error('Batch error:', error);
      errors++;
      if (errors > 10) {
        console.error('Too many errors, stopping.');
        break;
      }
    }
  }

  console.log(`=== Done: ${totalFixed} articles fixed, ${errors} errors ===`);
  return { fixed: totalFixed, errors };
}

const isDirectRun = process.argv[1]?.includes('fixBulkUpdatedTimestamps');
if (isDirectRun) {
  fixBulkUpdatedTimestamps()
    .then(result => {
      console.log('Result:', result);
      process.exit(0);
    })
    .catch(err => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}
