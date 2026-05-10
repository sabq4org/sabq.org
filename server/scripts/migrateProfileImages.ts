import { cloudflareImagesService } from '../services/cloudflareImagesService';
import { ObjectStorageService } from '../objectStorage';
import { db } from '../db';
import { sql } from 'drizzle-orm';

const BATCH_SIZE = 10;
const DELAY_MS = 1000;

function detectMimeFromBuffer(buf: Buffer): string {
  if (buf[0] === 0xFF && buf[1] === 0xD8) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf[0] === 0x47 && buf[1] === 0x49) return 'image/gif';
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf.length > 11 && buf[8] === 0x57 && buf[9] === 0x45) return 'image/webp';
  return 'image/jpeg';
}

function extractStoragePath(url: string): string | null {
  if (url.startsWith('/public-objects/')) return url.replace('/public-objects/', '');
  if (url.startsWith('/objects/')) return url.replace('/objects/', '');
  return null;
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

async function main() {
  console.log('[ProfileMigration] Starting profile image migration to Cloudflare...');
  
  if (!cloudflareImagesService.isCloudflareConfigured()) {
    console.error('[ProfileMigration] CF not configured!');
    process.exit(1);
  }

  const rows: any[] = await db.execute(sql.raw(
    `SELECT id, profile_image_url as url FROM users 
     WHERE profile_image_url LIKE '/public-objects/%' 
        OR profile_image_url LIKE '/objects/%'
     ORDER BY id`
  ));
  const rowList = Array.isArray(rows) ? rows : (rows as any).rows || [];
  console.log(`[ProfileMigration] Found ${rowList.length} profile images to migrate`);

  let ok = 0, fail = 0;

  for (let i = 0; i < rowList.length; i += BATCH_SIZE) {
    const batch = rowList.slice(i, i + BATCH_SIZE);
    
    const results = await Promise.all(batch.map(async (row: any) => {
      const storagePath = extractStoragePath(row.url);
      if (!storagePath) return false;

      const buffer = await downloadFile(storagePath);
      if (!buffer || buffer.length < 100) {
        console.warn(`  Not found or empty: ${row.url}`);
        return false;
      }

      const mime = detectMimeFromBuffer(buffer);
      const filename = storagePath.split('/').pop() || 'profile.jpg';
      
      const result = await cloudflareImagesService.uploadToCloudflare(
        buffer, filename, { userId: row.id, type: 'profile' }, mime
      );
      
      if (!result.success || !result.deliveryUrl) {
        console.warn(`  Upload failed: ${row.url}`);
        return false;
      }

      await db.execute(sql.raw(
        `UPDATE users SET profile_image_url = '${result.deliveryUrl.replace(/'/g, "''")}' WHERE id = '${String(row.id).replace(/'/g, "''")}'`
      ));
      return true;
    }));

    ok += results.filter(Boolean).length;
    fail += results.filter(r => !r).length;
    
    const progress = Math.min(i + BATCH_SIZE, rowList.length);
    console.log(`[ProfileMigration] ${progress}/${rowList.length} (${ok} ok, ${fail} fail)`);
    
    if (i + BATCH_SIZE < rowList.length) await new Promise(r => setTimeout(r, DELAY_MS));
  }

  console.log(`\n[ProfileMigration] ========== COMPLETE ==========`);
  console.log(`[ProfileMigration] Success: ${ok}, Failed: ${fail}`);
}

main().catch(err => { console.error('[ProfileMigration] Fatal:', err); process.exit(1); });
