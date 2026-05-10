const CLOUDFLARE_ZONE_ID = process.env.CLOUDFLARE_ZONE_ID;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const SITE_URL = process.env.FRONTEND_URL || 'https://sabq.org';

const FLUSH_INTERVAL_MS = 30_000;
const MAX_URLS_PER_REQUEST = 30;
const MAX_RETRIES = 3;

interface PurgeResult {
  success: boolean;
  errors?: string[];
}

const purgeQueue = new Set<string>();
const retryCount = new Map<string, number>();
let isFlushing = false;
let flushTimer: NodeJS.Timeout | null = null;

function enqueue(urls: string[]): void {
  for (const url of urls) {
    purgeQueue.add(url);
  }
}

async function sendPurgeRequest(urls: string[]): Promise<PurgeResult> {
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/purge_cache`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ files: urls }),
      }
    );

    const data = await response.json() as any;

    if (data.success) {
      return { success: true };
    } else {
      return { success: false, errors: data.errors?.map((e: any) => e.message) };
    }
  } catch (error) {
    return { success: false, errors: [(error as Error).message] };
  }
}

async function flushQueue(): Promise<void> {
  if (isFlushing || purgeQueue.size === 0) return;
  if (!CLOUDFLARE_ZONE_ID || !CLOUDFLARE_API_TOKEN) {
    purgeQueue.clear();
    retryCount.clear();
    return;
  }

  isFlushing = true;

  try {
    const snapshot = Array.from(purgeQueue);
    purgeQueue.clear();

    for (let i = 0; i < snapshot.length; i += MAX_URLS_PER_REQUEST) {
      const batch = snapshot.slice(i, i + MAX_URLS_PER_REQUEST);
      const result = await sendPurgeRequest(batch);

      if (result.success) {
        console.log(`[Cloudflare Batch] Purged ${batch.length} URLs successfully`);
        for (const url of batch) {
          retryCount.delete(url);
        }
      } else {
        console.error(`[Cloudflare Batch] Failed to purge ${batch.length} URLs:`, result.errors);
        for (const url of batch) {
          const attempts = (retryCount.get(url) || 0) + 1;
          if (attempts < MAX_RETRIES) {
            purgeQueue.add(url);
            retryCount.set(url, attempts);
          } else {
            console.error(`[Cloudflare Batch] Dropping URL after ${MAX_RETRIES} attempts: ${url}`);
            retryCount.delete(url);
          }
        }
      }
    }
  } finally {
    isFlushing = false;
  }
}

function startFlushTimer(): void {
  if (flushTimer) return;
  flushTimer = setInterval(flushQueue, FLUSH_INTERVAL_MS);
  console.log(`[Cloudflare Batch] Flush timer started (every ${FLUSH_INTERVAL_MS / 1000}s)`);
}

function stopFlushTimer(): void {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}

async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`[Cloudflare Batch] ${signal} received — flushing ${purgeQueue.size} queued URLs before shutdown`);
  stopFlushTimer();
  await flushQueue();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

startFlushTimer();

export async function purgeUrls(urls: string[]): Promise<PurgeResult> {
  if (!CLOUDFLARE_ZONE_ID || !CLOUDFLARE_API_TOKEN) {
    console.log('[Cloudflare] Purge skipped - API credentials not configured');
    return { success: true };
  }
  enqueue(urls);
  return { success: true };
}

export async function purgeHomepage(): Promise<PurgeResult> {
  return purgeUrls([
    `${SITE_URL}/`,
    `${SITE_URL}/api/homepage-lite`,
    `${SITE_URL}/api/lite-feed`,
    `${SITE_URL}/api/ai-insights`,
  ]);
}

export async function purgeBreakingNews(): Promise<PurgeResult> {
  return purgeUrls([
    `${SITE_URL}/`,
    `${SITE_URL}/api/homepage-lite`,
    `${SITE_URL}/api/breaking-ticker/active`,
  ]);
}

export async function purgeArticle(slug: string): Promise<PurgeResult> {
  return purgeUrls([
    `${SITE_URL}/article/${slug}`,
    `${SITE_URL}/api/articles/${slug}`,
  ]);
}

export async function purgeCategory(slug: string): Promise<PurgeResult> {
  return purgeUrls([
    `${SITE_URL}/category/${slug}`,
    `${SITE_URL}/api/categories/${slug}/articles`,
  ]);
}

export async function purgeAll(): Promise<PurgeResult> {
  if (!CLOUDFLARE_ZONE_ID || !CLOUDFLARE_API_TOKEN) {
    console.log('[Cloudflare] Purge skipped - API credentials not configured');
    return { success: true };
  }

  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/purge_cache`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ purge_everything: true }),
      }
    );

    const data = await response.json() as any;

    if (data.success) {
      console.log('[Cloudflare] Purged entire cache successfully');
      return { success: true };
    } else {
      console.error('[Cloudflare] Purge all failed:', data.errors);
      return { success: false, errors: data.errors?.map((e: any) => e.message) };
    }
  } catch (error) {
    console.error('[Cloudflare] Purge all error:', error);
    return { success: false, errors: [(error as Error).message] };
  }
}

export function getPurgeQueueSize(): number {
  return purgeQueue.size;
}
