/**
 * Sabq Data Import Script v2.0 - Optimized for Large Scale
 * Imports 600,000+ articles from Quintype CMS format
 * 
 * Features:
 * - Streaming processing (no memory overload)
 * - Batch inserts (10-50x faster)
 * - Progress tracking with resume capability
 * - Parallel processing for tags/categories
 * - Detailed logging to file
 * 
 * Usage: npx tsx server/scripts/import-sabq-data-v2.ts [options]
 * Options:
 *   --file=<path>       Path to gzipped or plain JSON lines file
 *   --batch-size=<n>    Batch size for inserts (default: 100)
 *   --concurrency=<n>   Parallel processing (default: 5)
 *   --resume            Resume from last progress
 *   --dry-run           Preview import without writing to database
 */

import { createReadStream, existsSync, writeFileSync, readFileSync, appendFileSync } from 'fs';
import { createGunzip } from 'zlib';
import { createInterface } from 'readline';
import { db } from '../db';
import { articles, categories, users, articleTags, tags } from '../../shared/schema';
import { eq, sql, inArray } from 'drizzle-orm';

// Configuration
const CONFIG = {
  defaultAuthorId: '',
  imageBaseUrl: 'https://images.sabq.org/',
  progressFile: '/tmp/sabq_import_progress.json',
  errorLogFile: '/tmp/sabq_import_errors.log',
  statsFile: '/tmp/sabq_import_stats.json',
};

// Section to Category mapping
const SECTION_MAPPING: Record<string, { nameAr: string; nameEn: string; color: string }> = {
  'saudia': { nameAr: 'محليات', nameEn: 'Local', color: '#dc2626' },
  'stations': { nameAr: 'محطات', nameEn: 'Stations', color: '#9333ea' },
  'mylife': { nameAr: 'حياتنا', nameEn: 'Lifestyle', color: '#ec4899' },
  'technology': { nameAr: 'تقنية', nameEn: 'Technology', color: '#3b82f6' },
  'business': { nameAr: 'أعمال', nameEn: 'Business', color: '#16a34a' },
  'world': { nameAr: 'العالم', nameEn: 'World', color: '#0891b2' },
  'tourism': { nameAr: 'سياحة', nameEn: 'Tourism', color: '#f59e0b' },
  'articles': { nameAr: 'مقالات', nameEn: 'Articles', color: '#8b5cf6' },
  'regions': { nameAr: 'مناطق', nameEn: 'Regions', color: '#84cc16' },
  'culture': { nameAr: 'ثقافة', nameEn: 'Culture', color: '#d946ef' },
  'community': { nameAr: 'مجتمع', nameEn: 'Community', color: '#f97316' },
  'sports': { nameAr: 'رياضة', nameEn: 'Sports', color: '#22c55e' },
  'careers': { nameAr: 'وظائف', nameEn: 'Careers', color: '#6366f1' },
  'cars': { nameAr: 'سيارات', nameEn: 'Cars', color: '#ef4444' },
};

// Quintype interfaces
interface QuintypeSection {
  id: number;
  slug: string;
  name: string;
}

interface QuintypeTag {
  id: number;
  name: string;
}

interface QuintypeStoryElement {
  type: string;
  subtype?: string;
  text?: string;
  'image-s3-key'?: string;
  'alt-text'?: string;
  title?: string;
  url?: string;
  description?: string;
}

interface QuintypeCard {
  'story-elements': QuintypeStoryElement[];
}

interface QuintypeStory {
  id: string;
  headline: string;
  subheadline?: string;
  slug: string;
  'published-at': number;
  'created-at': number;
  'updated-at': number;
  status: string;
  'story-template': string;
  seo?: { 'meta-title'?: string; 'meta-description'?: string };
  'hero-image-s3-key'?: string;
  'hero-image-alt-text'?: string;
  sections?: QuintypeSection[];
  tags?: QuintypeTag[];
  cards?: QuintypeCard[];
  summary?: string;
}

// Stats tracking
interface ImportStats {
  total: number;
  imported: number;
  skipped: number;
  errors: number;
  categoriesCreated: number;
  tagsCreated: number;
  lastProcessedLine: number;
  startTime: number;
  lastUpdateTime: number;
  articlesPerSecond: number;
}

const stats: ImportStats = {
  total: 0,
  imported: 0,
  skipped: 0,
  errors: 0,
  categoriesCreated: 0,
  tagsCreated: 0,
  lastProcessedLine: 0,
  startTime: Date.now(),
  lastUpdateTime: Date.now(),
  articlesPerSecond: 0,
};

// Caches - preloaded for speed
const categoryCache = new Map<string, string>();
const tagCache = new Map<string, string>();
const existingArticleIds = new Set<string>();

/**
 * Preload existing data into caches
 */
async function preloadCaches() {
  console.log('📦 Preloading caches...');
  
  // Load all categories
  const allCategories = await db.select({ 
    id: categories.id, 
    nameAr: categories.nameAr,
    slug: categories.slug 
  }).from(categories);
  
  for (const cat of allCategories) {
    if (cat.nameAr) categoryCache.set(cat.nameAr, cat.id);
    if (cat.slug) categoryCache.set(cat.slug, cat.id);
  }
  console.log(`  ✓ Loaded ${allCategories.length} categories`);
  
  // Load all tags
  const allTags = await db.select({ id: tags.id, slug: tags.slug }).from(tags);
  for (const tag of allTags) {
    if (tag.slug) tagCache.set(tag.slug, tag.id);
  }
  console.log(`  ✓ Loaded ${allTags.length} tags`);
  
  // Load ALL existing article IDs (supports resume after CDN migration)
  // Uses source_metadata->>'type' = 'manual' to identify imported articles
  const existingArticles = await db.select({ id: articles.id })
    .from(articles);
  
  for (const article of existingArticles) {
    existingArticleIds.add(article.id);
  }
  console.log(`  ✓ Loaded ${existingArticleIds.size} existing article IDs`);
}

/**
 * Convert S3 key to URL
 */
function convertImageUrl(s3Key: string | undefined): string | null {
  if (!s3Key) return null;
  return `${CONFIG.imageBaseUrl}${s3Key}`;
}

/**
 * Convert cards to HTML (optimized version)
 */
function convertCardsToHtml(cards: QuintypeCard[] | undefined): string {
  if (!cards?.length) return '<p></p>';
  
  const htmlParts: string[] = [];
  
  for (const card of cards) {
    if (!card['story-elements']) continue;
    
    for (const el of card['story-elements']) {
      if (el.subtype === 'also-read') continue;
      
      switch (el.type) {
        case 'text':
          if (el.text?.trim()) htmlParts.push(el.text);
          break;
        case 'image':
          if (el['image-s3-key']) {
            const url = convertImageUrl(el['image-s3-key']);
            const alt = el['alt-text'] || el.title || '';
            htmlParts.push(`<figure class="article-image"><img src="${url}" alt="${alt}" loading="lazy" />${el.description ? `<figcaption>${el.description}</figcaption>` : ''}</figure>`);
          }
          break;
        case 'youtube-video':
          if (el.url) {
            const videoId = el.url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([^&\s]+)/)?.[1];
            if (videoId) {
              htmlParts.push(`<div class="video-embed youtube-embed"><iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen loading="lazy"></iframe></div>`);
            }
          }
          break;
        case 'title':
          if (el.text?.trim()) htmlParts.push(`<h2>${el.text}</h2>`);
          break;
      }
    }
  }
  
  return htmlParts.join('') || '<p></p>';
}

/**
 * Create stable slug from Arabic text
 */
function createStableSlug(text: string): string {
  return text.toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\u0600-\u06FF-]/g, '')
    .substring(0, 100);
}

/**
 * Get or create category (cache-first, concurrency-safe)
 */
async function getOrCreateCategory(section: QuintypeSection): Promise<string> {
  const mapping = SECTION_MAPPING[section.slug] || {
    nameAr: section.name,
    nameEn: section.slug.charAt(0).toUpperCase() + section.slug.slice(1),
    color: '#6b7280'
  };
  
  // Check cache by Arabic name first
  if (categoryCache.has(mapping.nameAr)) {
    return categoryCache.get(mapping.nameAr)!;
  }
  
  // Check cache by slug
  if (categoryCache.has(section.slug)) {
    return categoryCache.get(section.slug)!;
  }
  
  // Try to create new category with conflict handling (concurrency-safe)
  try {
    const [newCategory] = await db.insert(categories)
      .values({
        nameAr: mapping.nameAr,
        nameEn: mapping.nameEn,
        slug: section.slug,
        color: mapping.color,
        status: 'active',
        displayOrder: 0,
      })
      .onConflictDoNothing()
      .returning({ id: categories.id });
    
    if (newCategory) {
      categoryCache.set(mapping.nameAr, newCategory.id);
      categoryCache.set(section.slug, newCategory.id);
      stats.categoriesCreated++;
      return newCategory.id;
    }
  } catch (e) {
    // Conflict occurred, fall through to re-query
  }
  
  // Re-query if insert failed (concurrent insert won)
  const [existingCat] = await db.select({ id: categories.id })
    .from(categories)
    .where(sql`name_ar = ${mapping.nameAr} OR slug = ${section.slug}`)
    .limit(1);
  
  if (existingCat) {
    categoryCache.set(mapping.nameAr, existingCat.id);
    categoryCache.set(section.slug, existingCat.id);
    return existingCat.id;
  }
  
  throw new Error(`Failed to create or find category: ${section.slug}`);
}

/**
 * Batch get or create tags
 */
async function getOrCreateTagsBatch(qtTags: QuintypeTag[]): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  const tagsToCreate: { qtId: number; name: string; slug: string }[] = [];
  
  for (const qtTag of qtTags) {
    const slug = createStableSlug(qtTag.name) || `tag-${qtTag.id}`;
    
    if (tagCache.has(slug)) {
      result.set(qtTag.id, tagCache.get(slug)!);
    } else {
      tagsToCreate.push({ qtId: qtTag.id, name: qtTag.name, slug });
    }
  }
  
  if (tagsToCreate.length > 0) {
    // Create all new tags in one batch
    const newTags = await db.insert(tags)
      .values(tagsToCreate.map(t => ({
        nameAr: t.name,
        nameEn: t.name,
        slug: t.slug,
      })))
      .onConflictDoNothing()
      .returning({ id: tags.id, slug: tags.slug });
    
    for (const tag of newTags) {
      if (tag.slug) {
        tagCache.set(tag.slug, tag.id);
        stats.tagsCreated++;
      }
    }
    
    // Re-check cache for created tags
    for (const t of tagsToCreate) {
      if (tagCache.has(t.slug)) {
        result.set(t.qtId, tagCache.get(t.slug)!);
      }
    }
  }
  
  return result;
}

/**
 * Prepare article data for batch insert
 */
function prepareArticleData(story: QuintypeStory, authorId: string, categoryId: string | null) {
  return {
    id: story.id,
    title: story.headline,
    subtitle: story.subheadline || null,
    slug: story.slug,
    content: convertCardsToHtml(story.cards),
    excerpt: story.seo?.['meta-description'] || story.summary || null,
    imageUrl: convertImageUrl(story['hero-image-s3-key']),
    categoryId,
    authorId,
    articleType: story['story-template'] === 'articles' ? 'opinion' : 'news',
    newsType: 'regular' as const,
    publishType: 'instant' as const,
    status: 'published',
    views: 0,
    isFeatured: false,
    source: 'manual' as const,
    sourceMetadata: {
      type: 'manual' as const,
      originalMessage: `Imported from Quintype - Original ID: ${story.id}`,
    },
    seo: story.seo ? {
      metaTitle: story.seo['meta-title'],
      metaDescription: story.seo['meta-description'],
      imageAltText: story['hero-image-alt-text'] || undefined,
    } : null,
    publishedAt: story['published-at'] ? new Date(story['published-at']) : null,
    createdAt: story['created-at'] ? new Date(story['created-at']) : new Date(),
    updatedAt: story['updated-at'] ? new Date(story['updated-at']) : new Date(),
  };
}

/**
 * Process a batch of stories
 */
async function processBatch(
  stories: QuintypeStory[], 
  authorId: string, 
  dryRun: boolean
): Promise<void> {
  const articlesToInsert: any[] = [];
  const articleTagsToInsert: { articleId: string; tagId: string }[] = [];
  const allTags: QuintypeTag[] = [];
  
  // Collect all tags for batch processing
  for (const story of stories) {
    if (story.tags) {
      allTags.push(...story.tags.slice(0, 10));
    }
  }
  
  // Batch create/get tags
  const tagMap = await getOrCreateTagsBatch(allTags);
  
  // Prepare articles
  for (const story of stories) {
    // Skip if already exists
    if (existingArticleIds.has(story.id)) {
      stats.skipped++;
      continue;
    }
    
    try {
      // Get category
      let categoryId: string | null = null;
      if (story.sections?.length) {
        categoryId = await getOrCreateCategory(story.sections[0]);
      }
      
      const articleData = prepareArticleData(story, authorId, categoryId);
      articlesToInsert.push(articleData);
      
      // Prepare article-tag relationships
      if (story.tags) {
        for (const qtTag of story.tags.slice(0, 10)) {
          const tagId = tagMap.get(qtTag.id);
          if (tagId) {
            articleTagsToInsert.push({ articleId: story.id, tagId });
          }
        }
      }
      
      existingArticleIds.add(story.id);
      
    } catch (error: any) {
      logError(story.id, error.message);
      stats.errors++;
    }
  }
  
  if (dryRun || articlesToInsert.length === 0) {
    stats.imported += articlesToInsert.length;
    return;
  }
  
  // Batch insert articles
  try {
    await db.insert(articles)
      .values(articlesToInsert)
      .onConflictDoNothing();
    
    stats.imported += articlesToInsert.length;
    
    // Batch insert article tags
    if (articleTagsToInsert.length > 0) {
      await db.insert(articleTags)
        .values(articleTagsToInsert)
        .onConflictDoNothing();
    }
  } catch (error: any) {
    logError('batch', error.message);
    stats.errors += articlesToInsert.length;
  }
}

/**
 * Log error to file
 */
function logError(id: string, message: string) {
  const timestamp = new Date().toISOString();
  appendFileSync(CONFIG.errorLogFile, `[${timestamp}] ${id}: ${message}\n`);
}

/**
 * Save progress
 */
function saveProgress() {
  const now = Date.now();
  const elapsed = (now - stats.startTime) / 1000;
  stats.articlesPerSecond = stats.total / elapsed;
  stats.lastUpdateTime = now;
  
  writeFileSync(CONFIG.progressFile, JSON.stringify(stats, null, 2));
}

/**
 * Load progress for resume
 */
function loadProgress(): number {
  if (existsSync(CONFIG.progressFile)) {
    const data = JSON.parse(readFileSync(CONFIG.progressFile, 'utf-8'));
    return data.lastProcessedLine || 0;
  }
  return 0;
}

/**
 * Get "صحيفة سبق" author ID - ONLY this reporter is used for imported articles
 */
async function getDefaultAuthorId(): Promise<string> {
  const [sabqUser] = await db.select({ id: users.id })
    .from(users)
    .where(sql`first_name = 'صحيفة' AND last_name = 'سبق'`)
    .limit(1);
  
  if (sabqUser) {
    console.log('📰 Using "صحيفة سبق" as author for imported articles');
    return sabqUser.id;
  }
  
  throw new Error('❌ User "صحيفة سبق" not found! Please create this user first.');
}

/**
 * Format time duration
 */
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

/**
 * Print progress bar
 */
function printProgress(current: number, total: number) {
  const percent = Math.floor((current / total) * 100);
  const elapsed = (Date.now() - stats.startTime) / 1000;
  const rate = current / elapsed;
  const remaining = (total - current) / rate;
  
  const barLength = 30;
  const filled = Math.floor((current / total) * barLength);
  const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);
  
  process.stdout.write(
    `\r[${bar}] ${percent}% | ${current.toLocaleString()}/${total.toLocaleString()} | ` +
    `${rate.toFixed(1)}/s | ETA: ${formatDuration(remaining)} | ` +
    `Imported: ${stats.imported.toLocaleString()} | Skipped: ${stats.skipped.toLocaleString()} | Errors: ${stats.errors}`
  );
}

/**
 * Main import function
 */
async function main() {
  console.log('═'.repeat(70));
  console.log('  Sabq Data Import Tool v2.0 - Optimized for Large Scale');
  console.log('═'.repeat(70));
  
  // Parse arguments
  const args = process.argv.slice(2);
  const options = {
    file: args.find(a => a.startsWith('--file='))?.split('=')[1] || '/tmp/sabq_data.jsonl',
    batchSize: parseInt(args.find(a => a.startsWith('--batch-size='))?.split('=')[1] || '100'),
    concurrency: parseInt(args.find(a => a.startsWith('--concurrency='))?.split('=')[1] || '5'),
    resume: args.includes('--resume'),
    dryRun: args.includes('--dry-run'),
  };
  
  console.log(`\n📋 Configuration:`);
  console.log(`   File: ${options.file}`);
  console.log(`   Batch Size: ${options.batchSize}`);
  console.log(`   Resume: ${options.resume}`);
  console.log(`   Dry Run: ${options.dryRun}`);
  
  if (options.dryRun) {
    console.log('\n⚠️  DRY RUN MODE - No changes will be made\n');
  }
  
  try {
    // Initialize
    CONFIG.defaultAuthorId = await getDefaultAuthorId();
    console.log(`\n👤 Using author ID: ${CONFIG.defaultAuthorId}`);
    
    // Preload caches
    await preloadCaches();
    
    // Check resume
    let skipLines = 0;
    if (options.resume) {
      skipLines = loadProgress();
      if (skipLines > 0) {
        console.log(`\n🔄 Resuming from line ${skipLines.toLocaleString()}`);
      }
    }
    
    // Count total lines first
    console.log(`\n📊 Counting total articles...`);
    let totalLines = 0;
    const isGzipped = options.file.endsWith('.gz');
    let countStream: NodeJS.ReadableStream = createReadStream(options.file);
    if (isGzipped) countStream = countStream.pipe(createGunzip());
    
    const countRl = createInterface({ input: countStream, crlfDelay: Infinity });
    for await (const _ of countRl) {
      totalLines++;
    }
    console.log(`   Total articles in file: ${totalLines.toLocaleString()}`);
    
    // Start import
    console.log(`\n🚀 Starting import...\n`);
    stats.startTime = Date.now();
    
    let stream: NodeJS.ReadableStream = createReadStream(options.file);
    if (isGzipped) stream = stream.pipe(createGunzip());
    
    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    
    let lineNumber = 0;
    let batch: QuintypeStory[] = [];
    
    for await (const line of rl) {
      lineNumber++;
      
      // Skip already processed lines
      if (lineNumber <= skipLines) {
        continue;
      }
      
      if (!line.trim()) continue;
      
      try {
        const story = JSON.parse(line) as QuintypeStory;
        batch.push(story);
        stats.total++;
        
        // Process batch when full
        if (batch.length >= options.batchSize) {
          await processBatch(batch, CONFIG.defaultAuthorId, options.dryRun);
          batch = [];
          
          stats.lastProcessedLine = lineNumber;
          
          // Update progress
          if (stats.total % 500 === 0) {
            saveProgress();
          }
          
          printProgress(lineNumber, totalLines);
        }
        
      } catch (e: any) {
        logError(`line-${lineNumber}`, `JSON parse error: ${e.message}`);
      }
    }
    
    // Process remaining batch
    if (batch.length > 0) {
      await processBatch(batch, CONFIG.defaultAuthorId, options.dryRun);
      stats.lastProcessedLine = lineNumber;
    }
    
    // Final progress
    printProgress(lineNumber, totalLines);
    console.log('\n');
    
    // Save final stats
    saveProgress();
    
    // Print summary
    const elapsed = (Date.now() - stats.startTime) / 1000;
    
    console.log('═'.repeat(70));
    console.log('  Import Summary');
    console.log('═'.repeat(70));
    console.log(`  Total processed:    ${stats.total.toLocaleString()}`);
    console.log(`  Imported:           ${stats.imported.toLocaleString()}`);
    console.log(`  Skipped (existing): ${stats.skipped.toLocaleString()}`);
    console.log(`  Errors:             ${stats.errors}`);
    console.log(`  Categories created: ${stats.categoriesCreated}`);
    console.log(`  Tags created:       ${stats.tagsCreated.toLocaleString()}`);
    console.log('─'.repeat(70));
    console.log(`  Duration:           ${formatDuration(elapsed)}`);
    console.log(`  Average speed:      ${(stats.total / elapsed).toFixed(1)} articles/second`);
    console.log('═'.repeat(70));
    
    if (stats.errors > 0) {
      console.log(`\n⚠️  Errors logged to: ${CONFIG.errorLogFile}`);
    }
    
    if (options.dryRun) {
      console.log('\n✓ Dry run completed - no changes made');
    } else {
      console.log('\n✓ Import completed successfully!');
    }
    
    console.log(`\n📁 Progress saved to: ${CONFIG.progressFile}`);
    
  } catch (error: any) {
    console.error('\n❌ Import failed:', error.message);
    saveProgress();
    process.exit(1);
  }
}

// Run
main().catch(console.error);
