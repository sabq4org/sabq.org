import { db } from '../db';
import { articles, categories, enArticles, urArticles } from '@shared/schema';
import { eq, isNotNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';

const BATCH_SIZE = 100;

async function generateUniqueShortSlug(
  table: 'articles' | 'categories' | 'enArticles' | 'urArticles'
): Promise<string> {
  let attempts = 0;
  const maxAttempts = 100;
  
  while (attempts < maxAttempts) {
    const slug = nanoid(7);
    
    let existing: { id: string }[] = [];
    switch (table) {
      case 'articles':
        existing = await db.select({ id: articles.id }).from(articles).where(eq(articles.englishSlug, slug)).limit(1);
        break;
      case 'categories':
        existing = await db.select({ id: categories.id }).from(categories).where(eq(categories.englishSlug, slug)).limit(1);
        break;
      case 'enArticles':
        existing = await db.select({ id: enArticles.id }).from(enArticles).where(eq(enArticles.englishSlug, slug)).limit(1);
        break;
      case 'urArticles':
        existing = await db.select({ id: urArticles.id }).from(urArticles).where(eq(urArticles.englishSlug, slug)).limit(1);
        break;
    }
    
    if (existing.length === 0) {
      return slug;
    }
    attempts++;
  }
  
  return nanoid(10);
}

async function migrateArticlesToShortSlugs(): Promise<{ processed: number; errors: number }> {
  let processed = 0;
  let errors = 0;
  
  console.log('Starting articles migration to short slugs...');
  
  // No OFFSET - fetch records with long slugs (>7 chars) that need migration
  while (true) {
    const batch = await db
      .select({ id: articles.id, englishSlug: articles.englishSlug })
      .from(articles)
      .where(isNotNull(articles.slug))
      .limit(BATCH_SIZE);
    
    // Filter to only records that need updating (slug length != 7)
    const needsUpdate = batch.filter(a => !a.englishSlug || a.englishSlug.length !== 7);
    
    if (needsUpdate.length === 0) {
      break;
    }
    
    for (const article of needsUpdate) {
      try {
        const shortSlug = await generateUniqueShortSlug('articles');
        
        await db
          .update(articles)
          .set({ englishSlug: shortSlug })
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

async function migrateCategoriesToShortSlugs(): Promise<{ processed: number; errors: number }> {
  let processed = 0;
  let errors = 0;
  
  console.log('Starting categories migration to short slugs...');
  
  while (true) {
    const batch = await db
      .select({ id: categories.id, englishSlug: categories.englishSlug })
      .from(categories)
      .where(isNotNull(categories.slug))
      .limit(BATCH_SIZE);
    
    const needsUpdate = batch.filter(c => !c.englishSlug || c.englishSlug.length !== 7);
    
    if (needsUpdate.length === 0) {
      break;
    }
    
    for (const category of needsUpdate) {
      try {
        const shortSlug = await generateUniqueShortSlug('categories');
        
        await db
          .update(categories)
          .set({ englishSlug: shortSlug })
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

async function migrateEnArticlesToShortSlugs(): Promise<{ processed: number; errors: number }> {
  let processed = 0;
  let errors = 0;
  
  console.log('Starting English articles migration to short slugs...');
  
  while (true) {
    const batch = await db
      .select({ id: enArticles.id, englishSlug: enArticles.englishSlug })
      .from(enArticles)
      .where(isNotNull(enArticles.slug))
      .limit(BATCH_SIZE);
    
    const needsUpdate = batch.filter(a => !a.englishSlug || a.englishSlug.length !== 7);
    
    if (needsUpdate.length === 0) {
      break;
    }
    
    for (const article of needsUpdate) {
      try {
        const shortSlug = await generateUniqueShortSlug('enArticles');
        
        await db
          .update(enArticles)
          .set({ englishSlug: shortSlug })
          .where(eq(enArticles.id, article.id));
        
        processed++;
      } catch (error) {
        console.error(`Error migrating EN article ${article.id}:`, error);
        errors++;
      }
    }
    
    console.log(`EN Articles progress: ${processed} processed, ${errors} errors`);
  }
  
  return { processed, errors };
}

async function migrateUrArticlesToShortSlugs(): Promise<{ processed: number; errors: number }> {
  let processed = 0;
  let errors = 0;
  
  console.log('Starting Urdu articles migration to short slugs...');
  
  while (true) {
    const batch = await db
      .select({ id: urArticles.id, englishSlug: urArticles.englishSlug })
      .from(urArticles)
      .where(isNotNull(urArticles.slug))
      .limit(BATCH_SIZE);
    
    const needsUpdate = batch.filter(a => !a.englishSlug || a.englishSlug.length !== 7);
    
    if (needsUpdate.length === 0) {
      break;
    }
    
    for (const article of needsUpdate) {
      try {
        const shortSlug = await generateUniqueShortSlug('urArticles');
        
        await db
          .update(urArticles)
          .set({ englishSlug: shortSlug })
          .where(eq(urArticles.id, article.id));
        
        processed++;
      } catch (error) {
        console.error(`Error migrating UR article ${article.id}:`, error);
        errors++;
      }
    }
    
    console.log(`UR Articles progress: ${processed} processed, ${errors} errors`);
  }
  
  return { processed, errors };
}

export async function migrateToShortSlugs(): Promise<{
  articles: { processed: number; errors: number };
  categories: { processed: number; errors: number };
  enArticles: { processed: number; errors: number };
  urArticles: { processed: number; errors: number };
}> {
  console.log('=== Starting Short Slug Migration ===');
  console.log('Converting all englishSlug values to 7-character random IDs');
  console.log(`Batch size: ${BATCH_SIZE}`);
  
  const articlesResult = await migrateArticlesToShortSlugs();
  const categoriesResult = await migrateCategoriesToShortSlugs();
  const enArticlesResult = await migrateEnArticlesToShortSlugs();
  const urArticlesResult = await migrateUrArticlesToShortSlugs();
  
  console.log('=== Migration Complete ===');
  console.log(`Articles: ${articlesResult.processed} processed, ${articlesResult.errors} errors`);
  console.log(`Categories: ${categoriesResult.processed} processed, ${categoriesResult.errors} errors`);
  console.log(`EN Articles: ${enArticlesResult.processed} processed, ${enArticlesResult.errors} errors`);
  console.log(`UR Articles: ${urArticlesResult.processed} processed, ${urArticlesResult.errors} errors`);
  
  return {
    articles: articlesResult,
    categories: categoriesResult,
    enArticles: enArticlesResult,
    urArticles: urArticlesResult,
  };
}

const isMainModule = import.meta.url.endsWith(process.argv[1]?.replace(/^file:\/\//, '') || '__no_match__') ||
  process.argv[1]?.includes('migrateToShortSlugs');

if (isMainModule) {
  migrateToShortSlugs()
    .then((result) => {
      console.log('Migration finished:', result);
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}
