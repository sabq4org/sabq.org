/**
 * Bulk Re-Indexing Script
 * 
 * Pushes recent articles from sitemap-news.xml to Google Indexing API
 * to fix delayed indexing after fixing GOOGLE_INDEXING_PRIVATE_KEY.
 * 
 * Usage:
 *   tsx scripts/reindex-recent-articles.ts
 * 
 * Quota: Google allows ~200 requests/day per project (safe for our ~170 articles)
 */

import { batchIndexUrls, isGoogleIndexingConfigured } from '../server/services/googleIndexingService';

const SITEMAP_URL = 'https://sabq.org/sitemap-news.xml';

async function fetchSitemapUrls(): Promise<string[]> {
  console.log(`📥 Fetching sitemap: ${SITEMAP_URL}`);
  const res = await fetch(SITEMAP_URL);
  if (!res.ok) throw new Error(`Failed to fetch sitemap: ${res.status}`);
  
  const xml = await res.text();
  const matches = xml.matchAll(/<loc>([^<]+)<\/loc>/g);
  const urls = Array.from(matches).map(m => m[1]).filter(u => u.includes('/article/'));
  
  console.log(`✅ Found ${urls.length} article URLs in sitemap`);
  return urls;
}

async function main() {
  console.log('🚀 Sabq Bulk Re-Indexing Script\n');
  
  // 1. تأكد من الإعدادات
  if (!isGoogleIndexingConfigured()) {
    console.error('❌ Google Indexing API not configured!');
    console.error('   Set GOOGLE_INDEXING_CLIENT_EMAIL and GOOGLE_INDEXING_PRIVATE_KEY first.');
    process.exit(1);
  }
  console.log('✅ Google Indexing API configured\n');
  
  // 2. جيب URLs من sitemap
  const urls = await fetchSitemapUrls();
  
  if (urls.length === 0) {
    console.log('⚠️ No URLs found. Exiting.');
    return;
  }
  
  // 3. تحذير لو الكمية كبيرة
  if (urls.length > 180) {
    console.warn(`⚠️ WARNING: ${urls.length} URLs may exceed Google's 200/day quota`);
    console.warn('   Consider running in batches.');
  }
  
  // 4. ابدأ batch indexing
  console.log(`📤 Pushing ${urls.length} URLs to Google Indexing API...\n`);
  const startTime = Date.now();
  
  const results = await batchIndexUrls(urls);
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  
  // 5. الإحصائيات
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`\n✨ Done in ${duration}s`);
  console.log(`   ✅ Successful: ${successful}`);
  console.log(`   ❌ Failed: ${failed}`);
  
  // 6. عرض الأخطاء (لو فيه)
  if (failed > 0) {
    console.log('\n❌ Failed URLs (first 10):');
    results
      .filter(r => !r.success)
      .slice(0, 10)
      .forEach(r => console.log(`   - ${r.url}: ${r.error}`));
  }
}

main().catch(err => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});
