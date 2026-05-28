import { cloudflareImagesService } from '../services/cloudflareImagesService';
import { ObjectStorageService } from '../objectStorage';
import { db } from '../db';
import { sql } from 'drizzle-orm';

const BATCH_SIZE = 20;
const DELAY_MS = 500;

function extractObjStoragePath(url: string): string | null {
  let u = url;
  u = u.replace(/^https?:\/\/sabq\.org/, '');
  if (u.startsWith('/public-objects/')) return u.replace('/public-objects/', '');
  if (u.startsWith('/api/public-media/public/')) return u.replace('/api/public-media/public/', '');
  const m = u.match(/^\/api\/public-media\/replit-objstore-[^/]+\/public\/(.+)$/);
  if (m) return m[1];
  return null;
}

function detectMimeFromBuffer(buf: Buffer): string {
  if (buf[0] === 0xFF && buf[1] === 0xD8) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf[0] === 0x47 && buf[1] === 0x49) return 'image/gif';
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf.length > 11 && buf[8] === 0x57 && buf[9] === 0x45) return 'image/webp';
  return 'image/webp';
}

async function downloadFile(filePath: string): Promise<Buffer | null> {
  try {
    const svc = new ObjectStorageService();
    const file = await svc.searchPublicObject(filePath);
    if (!file) return null;
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      file.createReadStream()
        .on('data', (c: Buffer) => chunks.push(c))
        .on('end', () => resolve(Buffer.concat(chunks)))
        .on('error', reject);
    });
  } catch { return null; }
}

async function uploadToCF(buffer: Buffer, filePath: string, metadata?: Record<string, string>): Promise<string | null> {
  const mime = detectMimeFromBuffer(buffer);
  const filename = filePath.split('/').pop() || 'image.webp';
  const result = await cloudflareImagesService.uploadToCloudflare(buffer, filename, metadata, mime);
  return result.success ? result.deliveryUrl || null : null;
}

interface MigrationJob {
  table: string;
  idColumn: string;
  urlColumn: string;
}

const JOBS: MigrationJob[] = [
  { table: 'articles', idColumn: 'id', urlColumn: 'image_url' },
  { table: 'articles', idColumn: 'id', urlColumn: 'thumbnail_url' },
  { table: 'en_articles', idColumn: 'id', urlColumn: 'image_url' },
  { table: 'ur_articles', idColumn: 'id', urlColumn: 'image_url' },
  { table: 'native_ads', idColumn: 'id', urlColumn: 'image_url' },
  { table: 'social_media_cards', idColumn: 'id', urlColumn: 'image_url' },
  { table: 'social_media_cards', idColumn: 'id', urlColumn: 'thumbnail_url' },
  { table: 'media_files', idColumn: 'id', urlColumn: 'thumbnail_url' },
];

async function migrateJob(job: MigrationJob): Promise<{ ok: number; fail: number }> {
  const { table, idColumn, urlColumn } = job;
  console.log(`\n[Migration] === ${table}.${urlColumn} ===`);

  const rows: any = await db.execute(sql.raw(
    `SELECT "${idColumn}" as id, "${urlColumn}" as url FROM "${table}" 
     WHERE "${urlColumn}" LIKE '/public-objects/%' 
        OR "${urlColumn}" LIKE '/api/public-media/public/%'
        OR "${urlColumn}" LIKE '/api/public-media/replit-objstore-%'
        OR "${urlColumn}" LIKE 'https://sabq.org/api/public-media/%'
        OR "${urlColumn}" LIKE 'https://sabq.org/public-objects/%'
     LIMIT 10000`
  ));

  const rowList = Array.isArray(rows) ? rows : (rows as any).rows || [];
  console.log(`[Migration] Found ${rowList.length} rows to migrate`);
  if (rowList.length === 0) return { ok: 0, fail: 0 };

  let ok = 0, fail = 0;

  for (let i = 0; i < rowList.length; i += BATCH_SIZE) {
    const batch = rowList.slice(i, i + BATCH_SIZE);
    
    const results = await Promise.all(batch.map(async (row: any) => {
      const filePath = extractObjStoragePath(row.url);
      if (!filePath) return false;

      const buffer = await downloadFile(filePath);
      if (!buffer) { console.warn(`  Not found: ${filePath}`); return false; }

      const cfUrl = await uploadToCF(buffer, filePath, { table, id: String(row.id) });
      if (!cfUrl) { console.warn(`  Upload failed: ${filePath}`); return false; }

      await db.execute(sql.raw(
        `UPDATE "${table}" SET "${urlColumn}" = '${cfUrl.replace(/'/g, "''")}' WHERE "${idColumn}" = '${String(row.id).replace(/'/g, "''")}'`
      ));
      return true;
    }));

    ok += results.filter(Boolean).length;
    fail += results.filter(r => !r).length;
    
    const progress = Math.min(i + BATCH_SIZE, rowList.length);
    console.log(`[Migration] ${table}.${urlColumn}: ${progress}/${rowList.length} (${ok} ok, ${fail} fail)`);
    
    if (i + BATCH_SIZE < rowList.length) await new Promise(r => setTimeout(r, DELAY_MS));
  }

  return { ok, fail };
}

async function main() {
  console.log('[Migration] Starting comprehensive migration to Cloudflare Images...');
  
  if (!cloudflareImagesService.isCloudflareConfigured()) {
    console.error('[Migration] CF not configured!');
    process.exit(1);
  }

  let totalOk = 0, totalFail = 0;

  for (const job of JOBS) {
    const { ok, fail } = await migrateJob(job);
    totalOk += ok;
    totalFail += fail;
  }

  console.log('\n[Migration] ========== ALL COMPLETE ==========');
  console.log(`[Migration] Total success: ${totalOk}`);
  console.log(`[Migration] Total failed: ${totalFail}`);
}

main().catch(err => { console.error('[Migration] Fatal:', err); process.exit(1); });
