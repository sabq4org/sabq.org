import { sanitizeArticleHtml } from '../server/utils/sanitizeArticleHtml';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
neonConfig.webSocketConstructor = ws as any;
neonConfig.useSecureWebSocket = true;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const { rows } = await pool.query(
  `SELECT id, content FROM articles WHERE content IS NOT NULL AND (content LIKE '%color: rgb(0, 0, 0)%' OR content LIKE '%<span></span>%' OR content LIKE '%color:rgb(0,0,0)%')`
);
console.log(`Found ${rows.length} articles`);
let updated = 0;
for (const r of rows) {
  const cleaned = sanitizeArticleHtml(r.content);
  if (cleaned !== r.content) {
    await pool.query(`UPDATE articles SET content = $1 WHERE id = $2`, [cleaned, r.id]);
    updated++;
  }
}
console.log(`Updated: ${updated}`);
await pool.end();
