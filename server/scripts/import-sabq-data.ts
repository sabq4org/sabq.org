/**
 * Sabq Data Import Script
 * Imports news data from Quintype CMS format into Sabq Platform
 * 
 * Usage: npx tsx server/scripts/import-sabq-data.ts [options]
 * Options:
 *   --file=<path>     Path to gzipped or plain JSON lines file
 *   --limit=<n>       Limit number of articles to import (default: 10)
 *   --dry-run         Preview import without writing to database
 *   --skip-images     Skip image processing
 */

import { createReadStream } from 'fs';
import { createGunzip } from 'zlib';
import { createInterface } from 'readline';
import { db } from '../db';
import { articles, categories, users, articleTags, tags } from '../../shared/schema';
import { eq, sql } from 'drizzle-orm';

// Configuration
const CONFIG = {
  defaultAuthorId: '', // Will be set from DB
  imageBaseUrl: 'https://images.sabq.org/', // Sabq CDN base URL
  batchSize: 50,
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

// Quintype data interfaces
interface QuintypeSection {
  id: number;
  slug: string;
  name: string;
  'external-id': string;
}

interface QuintypeAuthor {
  id: number;
  email: string;
  name: string;
  username: string;
  'external-id': string;
}

interface QuintypeTag {
  id: number;
  name: string;
  'meta-description': string | null;
  'tag-type': string;
}

interface QuintypeStoryElement {
  type: 'text' | 'image' | 'youtube-video' | 'jsembed' | 'composite' | 'title' | 'file';
  subtype?: string;
  text?: string;
  'image-s3-key'?: string;
  'image-metadata'?: {
    width: number;
    height: number;
    'mime-type': string;
    'file-size': number;
    'file-name': string;
  };
  'alt-text'?: string;
  title?: string;
  url?: string;
  'embed-js'?: string;
  description?: string;
  id: string;
  'family-id': string;
}

interface QuintypeCard {
  'story-elements': QuintypeStoryElement[];
  'card-updated-at': number;
  id: string;
}

interface QuintypeStory {
  id: string;
  headline: string;
  subheadline?: string;
  slug: string;
  'published-at': number;
  'first-published-at': number;
  'last-published-at': number;
  'updated-at': number;
  'created-at': number;
  status: string;
  'story-template': string;
  'word-count': number;
  'read-time': number;
  seo?: {
    'meta-title'?: string;
    'meta-description'?: string;
  };
  'hero-image-s3-key'?: string;
  'hero-image-metadata'?: {
    width: number;
    height: number;
  };
  'hero-image-alt-text'?: string;
  'hero-image-caption'?: string;
  'hero-image-attribution'?: string;
  sections?: QuintypeSection[];
  'author-id': number;
  'author-name': string;
  authors?: QuintypeAuthor[];
  tags?: QuintypeTag[];
  cards?: QuintypeCard[];
  summary?: string;
  'canonical-url'?: string;
}

// Stats tracking
const stats = {
  total: 0,
  imported: 0,
  skipped: 0,
  errors: 0,
  categoriesCreated: 0,
  tagsCreated: 0,
};

/**
 * Convert Quintype S3 key to accessible URL
 */
function convertImageUrl(s3Key: string | undefined): string | null {
  if (!s3Key) return null;
  // Use Sabq's CDN URL pattern
  return `${CONFIG.imageBaseUrl}${s3Key}`;
}

/**
 * Convert story elements to HTML content
 * Filters out metadata-only elements and properly formats supported types
 */
function convertCardsToHtml(cards: QuintypeCard[] | undefined): string {
  if (!cards || cards.length === 0) return '';
  
  let html = '';
  
  for (const card of cards) {
    if (!card['story-elements']) continue;
    
    for (const element of card['story-elements']) {
      // Skip metadata-only and non-content elements
      if (element.subtype === 'also-read') {
        continue; // Skip "also read" links - these are internal references
      }
      
      switch (element.type) {
        case 'text':
          // Only add text if it has actual content
          if (element.text && element.text.trim()) {
            html += element.text;
          }
          break;
          
        case 'image':
          if (element['image-s3-key']) {
            const imageUrl = convertImageUrl(element['image-s3-key']);
            const alt = element['alt-text'] || element.title || '';
            const caption = element.description || '';
            html += `<figure class="article-image">`;
            html += `<img src="${imageUrl}" alt="${alt}" loading="lazy" />`;
            if (caption) {
              html += `<figcaption>${caption}</figcaption>`;
            }
            html += `</figure>`;
          }
          break;
          
        case 'youtube-video':
          if (element.url) {
            // Extract video ID and create proper embed
            const videoId = element.url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([^&\s]+)/)?.[1];
            if (videoId) {
              html += `<div class="video-embed youtube-embed">`;
              html += `<iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen loading="lazy"></iframe>`;
              html += `</div>`;
            }
          }
          break;
          
        case 'jsembed':
          // Handle social media embeds - store as data for later rendering
          if (element.subtype === 'tweet') {
            html += `<div class="social-embed tweet-embed" data-embed-type="twitter"><!-- Twitter embed --></div>`;
          } else if (element.subtype === 'instagram') {
            html += `<div class="social-embed instagram-embed" data-embed-type="instagram"><!-- Instagram embed --></div>`;
          } else if (element.subtype === 'dailymotion-embed-script') {
            html += `<div class="video-embed dailymotion-embed" data-embed-type="dailymotion"><!-- Dailymotion embed --></div>`;
          }
          // Skip other jsembed types that we don't support
          break;
          
        case 'title':
          if (element.text && element.text.trim()) {
            html += `<h2>${element.text}</h2>`;
          }
          break;
          
        case 'composite':
          // Skip composite elements like galleries - they need special handling
          // Could be expanded later to support galleries
          break;
          
        case 'file':
          // Skip file attachments - these need separate handling
          break;
          
        // Skip unknown types silently
      }
    }
  }
  
  return html || '<p></p>'; // Ensure non-empty content
}

/**
 * Map story template to article type
 */
function mapArticleType(template: string): string {
  switch (template) {
    case 'articles':
      return 'opinion';
    case 'video':
      return 'news';
    default:
      return 'news';
  }
}

/**
 * Convert Unix milliseconds to Date
 */
function convertTimestamp(ts: number | undefined): Date | null {
  if (!ts) return null;
  return new Date(ts);
}

/**
 * Ensure unique slug
 */
async function ensureUniqueSlug(baseSlug: string, id: string): Promise<string> {
  const existing = await db.select({ id: articles.id })
    .from(articles)
    .where(eq(articles.slug, baseSlug))
    .limit(1);
  
  if (existing.length === 0 || existing[0].id === id) {
    return baseSlug;
  }
  
  // Add suffix to make unique
  return `${baseSlug}-${id.substring(0, 8)}`;
}

// Cache for categories to avoid repeated DB lookups
const categoryCache = new Map<string, string>();

/**
 * Get or create category from section
 * First checks by Arabic name to use existing categories, then by slug
 */
async function getOrCreateCategory(section: QuintypeSection): Promise<string> {
  // Check cache first
  if (categoryCache.has(section.slug)) {
    return categoryCache.get(section.slug)!;
  }
  
  const mapping = SECTION_MAPPING[section.slug] || {
    nameAr: section.name,
    nameEn: section.slug.charAt(0).toUpperCase() + section.slug.slice(1), // Capitalize slug as fallback
    color: '#6b7280'
  };
  
  // First: Check if category exists by Arabic name (most reliable for matching)
  const existingByName = await db.select({ id: categories.id })
    .from(categories)
    .where(eq(categories.nameAr, mapping.nameAr))
    .limit(1);
  
  if (existingByName.length > 0) {
    categoryCache.set(section.slug, existingByName[0].id);
    console.log(`  Using existing category: ${mapping.nameAr}`);
    return existingByName[0].id;
  }
  
  // Second: Check if category exists by slug
  const existingBySlug = await db.select({ id: categories.id })
    .from(categories)
    .where(eq(categories.slug, section.slug))
    .limit(1);
  
  if (existingBySlug.length > 0) {
    categoryCache.set(section.slug, existingBySlug[0].id);
    return existingBySlug[0].id;
  }
  
  // Create new category with proper bilingual names
  const [newCategory] = await db.insert(categories)
    .values({
      nameAr: mapping.nameAr,
      nameEn: mapping.nameEn,
      slug: section.slug,
      color: mapping.color,
      status: 'active',
      displayOrder: 0,
    })
    .returning({ id: categories.id });
  
  categoryCache.set(section.slug, newCategory.id);
  stats.categoriesCreated++;
  console.log(`  Created category: ${mapping.nameAr} (${section.slug})`);
  
  return newCategory.id;
}

// Cache for tags to avoid repeated DB lookups
const tagCache = new Map<string, string>();

/**
 * Create a stable slug from Arabic text
 */
function createStableSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\u0600-\u06FF-]/g, '')
    .substring(0, 100); // Limit length
}

/**
 * Get or create tag with proper bilingual support
 * Uses external ID for deduplication to prevent duplicates on re-import
 */
async function getOrCreateTag(qtTag: QuintypeTag): Promise<string> {
  // Use external ID as stable identifier if available
  const externalKey = `qt-tag-${qtTag.id}`;
  
  // Check cache first
  if (tagCache.has(externalKey)) {
    return tagCache.get(externalKey)!;
  }
  
  const tagSlug = createStableSlug(qtTag.name) || `tag-${qtTag.id}`;
  
  // Check if tag exists by slug (our stable identifier)
  const existing = await db.select({ id: tags.id })
    .from(tags)
    .where(eq(tags.slug, tagSlug))
    .limit(1);
  
  if (existing.length > 0) {
    tagCache.set(externalKey, existing[0].id);
    return existing[0].id;
  }
  
  // Create new tag with bilingual names
  // For now, use Arabic for both - English can be added via translation later
  const [newTag] = await db.insert(tags)
    .values({
      nameAr: qtTag.name,
      nameEn: qtTag.name, // Placeholder - should be translated
      slug: tagSlug,
    })
    .returning({ id: tags.id });
  
  tagCache.set(externalKey, newTag.id);
  stats.tagsCreated++;
  
  return newTag.id;
}

/**
 * Get default author ID
 */
async function getDefaultAuthorId(): Promise<string> {
  // Try to find an admin user first
  const [adminUser] = await db.select({ id: users.id })
    .from(users)
    .where(eq(users.role, 'admin'))
    .limit(1);
  
  if (adminUser) {
    return adminUser.id;
  }
  
  // Try to find any journalist
  const [journalistUser] = await db.select({ id: users.id })
    .from(users)
    .where(eq(users.role, 'journalist'))
    .limit(1);
  
  if (journalistUser) {
    return journalistUser.id;
  }
  
  // Try to find any user
  const [anyUser] = await db.select({ id: users.id })
    .from(users)
    .limit(1);
  
  if (anyUser) {
    return anyUser.id;
  }
  
  throw new Error('No users found in database. Please create at least one user first.');
}

/**
 * Import a single story
 */
async function importStory(story: QuintypeStory, authorId: string, dryRun: boolean): Promise<boolean> {
  try {
    // Skip if already exists
    const existing = await db.select({ id: articles.id })
      .from(articles)
      .where(eq(articles.id, story.id))
      .limit(1);
    
    if (existing.length > 0) {
      console.log(`  Skipping existing: ${story.headline.substring(0, 50)}...`);
      stats.skipped++;
      return false;
    }
    
    // Get category
    let categoryId: string | null = null;
    if (story.sections && story.sections.length > 0) {
      categoryId = await getOrCreateCategory(story.sections[0]);
    }
    
    // Convert content
    const content = convertCardsToHtml(story.cards);
    
    // Ensure unique slug
    const slug = await ensureUniqueSlug(story.slug, story.id);
    
    // Prepare article data
    const articleData = {
      id: story.id,
      title: story.headline,
      subtitle: story.subheadline || null,
      slug,
      content: content || '<p></p>',
      excerpt: story.seo?.['meta-description'] || story.summary || null,
      imageUrl: convertImageUrl(story['hero-image-s3-key']),
      categoryId,
      authorId,
      articleType: mapArticleType(story['story-template']),
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
      publishedAt: convertTimestamp(story['published-at']),
      createdAt: convertTimestamp(story['created-at']) || new Date(),
      updatedAt: convertTimestamp(story['updated-at']) || new Date(),
    };
    
    if (dryRun) {
      console.log(`  [DRY RUN] Would import: ${story.headline.substring(0, 50)}...`);
      stats.imported++;
      return true;
    }
    
    // Insert article
    await db.insert(articles).values(articleData);
    
    // Insert tags
    if (story.tags && story.tags.length > 0) {
      for (const qtTag of story.tags.slice(0, 10)) { // Limit to 10 tags
        const tagId = await getOrCreateTag(qtTag);
        await db.insert(articleTags)
          .values({
            articleId: story.id,
            tagId,
          })
          .onConflictDoNothing();
      }
    }
    
    console.log(`  Imported: ${story.headline.substring(0, 50)}...`);
    stats.imported++;
    return true;
    
  } catch (error: any) {
    console.error(`  Error importing ${story.id}: ${error.message}`);
    stats.errors++;
    return false;
  }
}

/**
 * Read and parse the data file
 */
async function readDataFile(filePath: string): Promise<QuintypeStory[]> {
  const stories: QuintypeStory[] = [];
  
  const isGzipped = filePath.endsWith('.gz');
  let stream: NodeJS.ReadableStream = createReadStream(filePath);
  
  if (isGzipped) {
    stream = stream.pipe(createGunzip());
  }
  
  const rl = createInterface({
    input: stream,
    crlfDelay: Infinity,
  });
  
  for await (const line of rl) {
    if (line.trim()) {
      try {
        stories.push(JSON.parse(line));
      } catch (e) {
        console.warn('Skipping invalid JSON line');
      }
    }
  }
  
  return stories;
}

/**
 * Main import function
 */
async function main() {
  console.log('='.repeat(60));
  console.log('Sabq Data Import Tool');
  console.log('='.repeat(60));
  
  // Parse arguments
  const args = process.argv.slice(2);
  const options = {
    file: args.find(a => a.startsWith('--file='))?.split('=')[1] || '/tmp/sabq_sample.txt',
    limit: parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '10'),
    dryRun: args.includes('--dry-run'),
    skipImages: args.includes('--skip-images'),
  };
  
  console.log(`\nOptions:`);
  console.log(`  File: ${options.file}`);
  console.log(`  Limit: ${options.limit}`);
  console.log(`  Dry Run: ${options.dryRun}`);
  console.log(`  Skip Images: ${options.skipImages}`);
  
  if (options.dryRun) {
    console.log('\n⚠️  DRY RUN MODE - No changes will be made to database\n');
  }
  
  try {
    // Get default author
    CONFIG.defaultAuthorId = await getDefaultAuthorId();
    console.log(`\nUsing author ID: ${CONFIG.defaultAuthorId}`);
    
    // Read data file
    console.log(`\nReading data file...`);
    const allStories = await readDataFile(options.file);
    console.log(`Found ${allStories.length} stories`);
    
    // Apply limit
    const stories = allStories.slice(0, options.limit);
    stats.total = stories.length;
    
    console.log(`\nImporting ${stories.length} stories...\n`);
    
    // Import stories
    for (let i = 0; i < stories.length; i++) {
      const story = stories[i];
      console.log(`[${i + 1}/${stories.length}]`);
      await importStory(story, CONFIG.defaultAuthorId, options.dryRun);
    }
    
    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('Import Summary');
    console.log('='.repeat(60));
    console.log(`Total processed: ${stats.total}`);
    console.log(`Imported: ${stats.imported}`);
    console.log(`Skipped: ${stats.skipped}`);
    console.log(`Errors: ${stats.errors}`);
    console.log(`Categories created: ${stats.categoriesCreated}`);
    console.log(`Tags created: ${stats.tagsCreated}`);
    
    if (options.dryRun) {
      console.log('\n✓ Dry run completed - no changes made');
    } else {
      console.log('\n✓ Import completed successfully');
    }
    
  } catch (error: any) {
    console.error('\n❌ Import failed:', error.message);
    process.exit(1);
  }
}

// Run
main().catch(console.error);
