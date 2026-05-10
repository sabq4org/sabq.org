import type { Request, Response } from "express";
import { db } from "../db";
import { articles, categories, users, enArticles, urArticles, deepAnalyses } from "@shared/schema";
import { eq, or } from "drizzle-orm";

const ARTICLE_PATTERNS = [
  { pattern: /^\/article\/([^\/]+)$/, table: articles, slugField: 'slug', altSlugField: 'englishSlug', type: 'article' },
  { pattern: /^\/opinion\/([^\/]+)$/, table: articles, slugField: 'slug', altSlugField: 'englishSlug', type: 'opinion' },
  { pattern: /^\/en\/article\/([^\/]+)$/, table: enArticles, slugField: 'slug', altSlugField: 'englishSlug', type: 'en-article' },
  { pattern: /^\/ur\/article\/([^\/]+)$/, table: urArticles, slugField: 'slug', altSlugField: 'englishSlug', type: 'ur-article' },
  { pattern: /^\/omq\/([^\/]+)$/, table: deepAnalyses, slugField: 'id', altSlugField: null, type: 'deep-analysis' },
];

const CATEGORY_PATTERN = /^\/category\/([^\/]+)$/;
const REPORTER_PATTERN = /^\/reporter\/([^\/]+)$/;
const WRITER_PATTERN = /^\/writer\/([^\/]+)$/;
const SHORT_URL_PATTERN = /^\/([a-zA-Z0-9]{7})$/;

const KNOWN_SPA_ROUTES = new Set([
  '/', '/careers', '/privacy', '/login', '/register', '/forgot-password',
  '/reset-password', '/search', '/bookmarks', '/history', '/settings',
  '/notifications', '/profile', '/about', '/contact', '/terms',
  '/admin', '/staff', '/ifox', '/trending', '/latest', '/popular'
]);

const SPA_PREFIXES = [
  '/admin/', '/staff/', '/ifox/', '/en/', '/ur/', '/search/',
  '/notifications/', '/settings/', '/profile/'
];

export async function edgeExistsHandler(req: Request, res: Response) {
  const path = req.query.path as string;
  
  if (!path) {
    return res.status(200).json({ exists: false, error: 'path parameter required' });
  }

  try {
    let normalizedPath = path;
    try {
      normalizedPath = decodeURIComponent(path);
    } catch (e) {}
    normalizedPath = normalizedPath.replace(/\/$/, '');

    if (normalizedPath === '' || normalizedPath === '/') {
      return res.status(200).json({ exists: true, type: 'home' });
    }

    if (KNOWN_SPA_ROUTES.has(normalizedPath)) {
      return res.status(200).json({ exists: true, type: 'spa-route' });
    }

    for (const prefix of SPA_PREFIXES) {
      if (normalizedPath.startsWith(prefix)) {
        return res.status(200).json({ exists: true, type: 'spa-route' });
      }
    }

    for (const { pattern, table, slugField, altSlugField, type } of ARTICLE_PATTERNS) {
      const match = normalizedPath.match(pattern);
      if (match) {
        const slug = match[1];
        
        const whereClause = altSlugField 
          ? or(eq((table as any)[slugField], slug), eq((table as any)[altSlugField], slug))
          : eq((table as any)[slugField], slug);
        
        const [article] = await db
          .select({ id: (table as any).id })
          .from(table)
          .where(whereClause)
          .limit(1);

        return res.status(200).json({ 
          exists: !!article, 
          type: article ? type : undefined 
        });
      }
    }

    const categoryMatch = normalizedPath.match(CATEGORY_PATTERN);
    if (categoryMatch) {
      const slug = categoryMatch[1];
      const [category] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.slug, slug))
        .limit(1);

      return res.status(200).json({ 
        exists: !!category, 
        type: category ? 'category' : undefined 
      });
    }

    const reporterMatch = normalizedPath.match(REPORTER_PATTERN);
    if (reporterMatch) {
      const id = reporterMatch[1];
      const [reporter] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      return res.status(200).json({ 
        exists: !!reporter, 
        type: reporter ? 'reporter' : undefined 
      });
    }

    const writerMatch = normalizedPath.match(WRITER_PATTERN);
    if (writerMatch) {
      const id = writerMatch[1];
      const [writer] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      return res.status(200).json({ 
        exists: !!writer, 
        type: writer ? 'writer' : undefined 
      });
    }

    const shortUrlMatch = normalizedPath.match(SHORT_URL_PATTERN);
    if (shortUrlMatch) {
      const shortSlug = shortUrlMatch[1];
      
      const [arArticle] = await db
        .select({ id: articles.id })
        .from(articles)
        .where(eq(articles.englishSlug, shortSlug))
        .limit(1);
      
      if (arArticle) {
        return res.status(200).json({ exists: true, type: 'short-url-ar' });
      }
      
      const [enArticle] = await db
        .select({ id: enArticles.id })
        .from(enArticles)
        .where(eq(enArticles.englishSlug, shortSlug))
        .limit(1);
      
      if (enArticle) {
        return res.status(200).json({ exists: true, type: 'short-url-en' });
      }
      
      const [urArticle] = await db
        .select({ id: urArticles.id })
        .from(urArticles)
        .where(eq(urArticles.englishSlug, shortSlug))
        .limit(1);
      
      if (urArticle) {
        return res.status(200).json({ exists: true, type: 'short-url-ur' });
      }
      
      return res.status(200).json({ exists: false });
    }

    const singleSegmentMatch = normalizedPath.match(/^\/([^\/]+)$/);
    if (singleSegmentMatch) {
      const segment = singleSegmentMatch[1];
      
      const [arArticle] = await db
        .select({ id: articles.id })
        .from(articles)
        .where(or(
          eq(articles.slug, segment),
          eq(articles.englishSlug, segment)
        ))
        .limit(1);
      
      if (arArticle) {
        return res.status(200).json({ exists: true, type: 'article' });
      }
      
      return res.status(200).json({ exists: false });
    }

    return res.status(200).json({ exists: false });

  } catch (error) {
    console.error('[EdgeExists] Error checking path existence:', error);
    return res.status(200).json({ exists: false, error: 'internal error' });
  }
}
