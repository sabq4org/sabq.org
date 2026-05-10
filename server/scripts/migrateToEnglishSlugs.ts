import { db } from '../db';
import { articles, categories } from '@shared/schema';
import { eq, isNull, and, isNotNull } from 'drizzle-orm';
import { transliterateToEnglish } from '../utils/slugTransliterator';

const BATCH_SIZE = 100;

async function generateUniqueEnglishSlug(
  baseSlug: string,
  table: 'articles' | 'categories'
): Promise<string> {
  let slug = baseSlug;
  let counter = 0;
  const maxAttempts = 100;
  
  while (counter < maxAttempts) {
    const finalSlug = counter === 0 ? slug : `${slug}-${counter}`;
    
    const existing = table === 'articles'
      ? await db.select({ id: articles.id }).from(articles).where(eq(articles.englishSlug, finalSlug)).limit(1)
      : await db.select({ id: categories.id }).from(categories).where(eq(categories.englishSlug, finalSlug)).limit(1);
    
    if (existing.length === 0) {
      return finalSlug;
    }
    counter++;
  }
  
  return `${slug}-${Date.now()}`;
}

async function migrateArticles(): Promise<{ processed: number; errors: number }> {
  let processed = 0;
  let errors = 0;
  
  console.log('Starting articles migration...');
  
  // No OFFSET - always fetch first 100 unmigrated records
  // As we process them, they're removed from the result set
  while (true) {
    const batch = await db
      .select({ id: articles.id, slug: articles.slug })
      .from(articles)
      .where(
        and(
          isNotNull(articles.slug),
          isNull(articles.englishSlug)
        )
      )
      .limit(BATCH_SIZE);
    
    if (batch.length === 0) {
      break;
    }
    
    for (const article of batch) {
      try {
        const baseEnglishSlug = transliterateToEnglish(article.slug);
        const englishSlug = await generateUniqueEnglishSlug(
          baseEnglishSlug.replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-+|-+$/g, '') || 'article',
          'articles'
        );
        
        await db
          .update(articles)
          .set({ englishSlug })
          .where(eq(articles.id, article.id));
        
        processed++;
      } catch (error) {
        console.error(`Error migrating article ${article.id}:`, error);
        errors++;
      }
    }
    
    console.log(`Articles progress: ${processed} processed, ${errors} errors`);
  }
  
  return { processed, errors };
}

async function migrateCategories(): Promise<{ processed: number; errors: number }> {
  let processed = 0;
  let errors = 0;
  
  console.log('Starting categories migration...');
  
  // No OFFSET - always fetch first 100 unmigrated records
  // As we process them, they're removed from the result set
  while (true) {
    const batch = await db
      .select({ id: categories.id, slug: categories.slug })
      .from(categories)
      .where(
        and(
          isNotNull(categories.slug),
          isNull(categories.englishSlug)
        )
      )
      .limit(BATCH_SIZE);
    
    if (batch.length === 0) {
      break;
    }
    
    for (const category of batch) {
      try {
        const baseEnglishSlug = transliterateToEnglish(category.slug);
        const englishSlug = await generateUniqueEnglishSlug(
          baseEnglishSlug.replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-+|-+$/g, '') || 'category',
          'categories'
        );
        
        await db
          .update(categories)
          .set({ englishSlug })
          .where(eq(categories.id, category.id));
        
        processed++;
      } catch (error) {
        console.error(`Error migrating category ${category.id}:`, error);
        errors++;
      }
    }
    
    console.log(`Categories progress: ${processed} processed, ${errors} errors`);
  }
  
  return { processed, errors };
}

export async function migrateToEnglishSlugs(): Promise<{
  articles: { processed: number; errors: number };
  categories: { processed: number; errors: number };
}> {
  console.log('=== Starting English Slug Migration ===');
  console.log(`Batch size: ${BATCH_SIZE}`);
  
  const articlesResult = await migrateArticles();
  const categoriesResult = await migrateCategories();
  
  console.log('=== Migration Complete ===');
  console.log(`Articles: ${articlesResult.processed} processed, ${articlesResult.errors} errors`);
  console.log(`Categories: ${categoriesResult.processed} processed, ${categoriesResult.errors} errors`);
  
  return {
    articles: articlesResult,
    categories: categoriesResult,
  };
}

// Run if executed directly (ES Module compatible)
const isMainModule = import.meta.url.endsWith(process.argv[1]?.replace(/^file:\/\//, '') || '__no_match__') ||
  process.argv[1]?.includes('migrateToEnglishSlugs');

if (isMainModule) {
  migrateToEnglishSlugs()
    .then((result) => {
      console.log('Migration finished:', result);
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}
