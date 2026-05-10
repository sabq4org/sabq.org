import type { Request, Response, NextFunction } from "express";
import { db } from "./db";
import { articles, categories, users, enArticles, urArticles, deepAnalyses, worldDays, tags, articleTags } from "@shared/schema";
import { and, eq, or } from "drizzle-orm";
import fs from "fs";
import path from "path";
import { VALID_PREFIXES } from "./utils/spaRouteMatcher";
import { memoryCache } from "./memoryCache";
import { sendIndexHtml } from "./utils/sendIndexHtml";

const isProduction = process.env.NODE_ENV === "production" || 
                     process.env.REPLIT_DEPLOYMENT === "1";

const distPath = path.resolve(import.meta.dirname, "public");
const indexPath = path.resolve(distPath, "index.html");

const CACHE_TTL_FOUND = 120000;
const CACHE_TTL_NOT_FOUND = 60000;

const ARTICLE_PATTERNS = [
  { pattern: /^\/article\/([^\/]+)$/, table: articles, slugField: 'slug', altSlugField: 'englishSlug' },
  { pattern: /^\/opinion\/([^\/]+)$/, table: articles, slugField: 'slug', altSlugField: 'englishSlug' },
  { pattern: /^\/en\/article\/([^\/]+)$/, table: enArticles, slugField: 'slug', altSlugField: 'englishSlug' },
  { pattern: /^\/ur\/article\/([^\/]+)$/, table: urArticles, slugField: 'slug', altSlugField: 'englishSlug' },
  { pattern: /^\/omq\/([^\/]+)$/, table: deepAnalyses, slugField: 'id', altSlugField: null },
];

const CATEGORY_PATTERN = /^\/(?:en\/|ur\/)?category\/([^\/]+)$/;
const REPORTER_PATTERN = /^\/(?:en\/|ur\/)?reporter\/([^\/]+)$/;
const WRITER_PATTERN = /^\/writer\/([^\/]+)$/;
const MUQTARAB_PATTERN = /^\/muqtarab\/([^\/]+)$/;
const WORLD_DAY_PATTERN = /^\/world-day\/([^\/]+)$/;
const KEYWORD_PATTERN = /^\/(?:en\/)?keyword\/([^\/]+)$/;
const SHORT_URL_PATTERN = /^\/([a-zA-Z0-9]{7})$/;

export async function contentExistenceMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const urlPath = req.path;
  
  if (urlPath.startsWith('/api/') || 
      urlPath.startsWith('/@') || 
      urlPath.startsWith('/node_modules/') ||
      urlPath.startsWith('/src/') ||
      urlPath.includes('.')) {
    return next();
  }

  try {
    let normalizedPath = urlPath;
    try {
      normalizedPath = decodeURIComponent(urlPath);
    } catch (e) {}
    normalizedPath = normalizedPath.replace(/\/$/, '');

    const cacheKey = `content-exists:${normalizedPath}`;
    const cached = memoryCache.get<{ exists: boolean; statusCode?: number }>(cacheKey);
    if (cached !== null) {
      if (!cached.exists) {
        if (cached.statusCode === 410) {
          return res.status(410).send('<!DOCTYPE html><html><head><meta name="robots" content="noindex"></head><body><h1>410 Gone</h1><p>This content has been permanently removed.</p></body></html>');
        }
        if (isProduction && fs.existsSync(indexPath)) {
          return sendIndexHtml(res, indexPath, 404);
        }
        res.status(404);
      }
      return next();
    }

    for (const { pattern, table, slugField, altSlugField } of ARTICLE_PATTERNS) {
      const match = normalizedPath.match(pattern);
      if (match) {
        const slug = match[1];
        
        const whereClause = altSlugField 
          ? or(eq((table as any)[slugField], slug), eq((table as any)[altSlugField], slug))
          : eq((table as any)[slugField], slug);
        
        const hasStatusField = 'status' in (table as any);
        const selectFields: any = { id: (table as any).id };
        if (hasStatusField) selectFields.status = (table as any).status;

        const [article] = await db
          .select(selectFields)
          .from(table)
          .where(whereClause)
          .limit(1);

        if (!article) {
          memoryCache.set(cacheKey, { exists: false }, CACHE_TTL_NOT_FOUND);
          console.log(`[Content404] Article not found: ${slug} - returning 404 status`);
          if (isProduction && fs.existsSync(indexPath)) {
            return sendIndexHtml(res, indexPath, 404);
          }
          res.status(404);
        } else if (hasStatusField && (article as any).status === 'deleted') {
          memoryCache.set(cacheKey, { exists: false, statusCode: 410 }, CACHE_TTL_NOT_FOUND);
          console.log(`[Content410] Article deleted: ${slug} - returning 410 Gone`);
          return res.status(410).send('<!DOCTYPE html><html><head><meta name="robots" content="noindex"></head><body><h1>410 Gone</h1><p>This content has been permanently removed.</p></body></html>');
        } else {
          memoryCache.set(cacheKey, { exists: true }, CACHE_TTL_FOUND);
        }
        return next();
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

      if (!category) {
        memoryCache.set(cacheKey, { exists: false }, CACHE_TTL_NOT_FOUND);
        console.log(`[Content404] Category not found: ${slug} - returning 404 status`);
        if (isProduction && fs.existsSync(indexPath)) {
          return sendIndexHtml(res, indexPath, 404);
        }
        res.status(404);
      } else {
        memoryCache.set(cacheKey, { exists: true }, CACHE_TTL_FOUND);
      }
      return next();
    }

    const reporterMatch = normalizedPath.match(REPORTER_PATTERN);
    if (reporterMatch) {
      const id = reporterMatch[1];
      const [reporter] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      if (!reporter) {
        memoryCache.set(cacheKey, { exists: false }, CACHE_TTL_NOT_FOUND);
        console.log(`[Content404] Reporter not found: ${id} - returning 404 status`);
        if (isProduction && fs.existsSync(indexPath)) {
          return sendIndexHtml(res, indexPath, 404);
        }
        res.status(404);
      } else {
        memoryCache.set(cacheKey, { exists: true }, CACHE_TTL_FOUND);
      }
      return next();
    }

    const writerMatch = normalizedPath.match(WRITER_PATTERN);
    if (writerMatch) {
      const id = writerMatch[1];
      const [writer] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      if (!writer) {
        memoryCache.set(cacheKey, { exists: false }, CACHE_TTL_NOT_FOUND);
        console.log(`[Content404] Writer not found: ${id} - returning 404 status`);
        if (isProduction && fs.existsSync(indexPath)) {
          return sendIndexHtml(res, indexPath, 404);
        }
        res.status(404);
      } else {
        memoryCache.set(cacheKey, { exists: true }, CACHE_TTL_FOUND);
      }
      return next();
    }

    const muqtarabMatch = normalizedPath.match(MUQTARAB_PATTERN);
    if (muqtarabMatch) {
      const id = muqtarabMatch[1];
      const [writer] = await db
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      if (!writer || writer.role !== 'opinion_writer') {
        memoryCache.set(cacheKey, { exists: false }, CACHE_TTL_NOT_FOUND);
        console.log(`[Content404] Muqtarab writer not found: ${id} - returning 404 status`);
        if (isProduction && fs.existsSync(indexPath)) {
          return sendIndexHtml(res, indexPath, 404);
        }
        res.status(404);
      } else {
        memoryCache.set(cacheKey, { exists: true }, CACHE_TTL_FOUND);
      }
      return next();
    }

    const worldDayMatch = normalizedPath.match(WORLD_DAY_PATTERN);
    if (worldDayMatch) {
      const id = worldDayMatch[1];
      const [day] = await db
        .select({ id: worldDays.id, isActive: worldDays.isActive })
        .from(worldDays)
        .where(eq(worldDays.id, id))
        .limit(1);

      if (!day || !day.isActive) {
        memoryCache.set(cacheKey, { exists: false }, CACHE_TTL_NOT_FOUND);
        console.log(`[Content404] World day not found: ${id} - returning 404 status`);
        if (isProduction && fs.existsSync(indexPath)) {
          return sendIndexHtml(res, indexPath, 404);
        }
        res.status(404);
      } else {
        memoryCache.set(cacheKey, { exists: true }, CACHE_TTL_FOUND);
      }
      return next();
    }

    const keywordMatch = normalizedPath.match(KEYWORD_PATTERN);
    if (keywordMatch) {
      const slug = keywordMatch[1];
      const [row] = await db
        .select({ id: articles.id })
        .from(articleTags)
        .innerJoin(tags, eq(tags.id, articleTags.tagId))
        .innerJoin(articles, eq(articles.id, articleTags.articleId))
        .where(and(eq(tags.slug, slug), eq(articles.status, 'published')))
        .limit(1);

      if (!row) {
        memoryCache.set(cacheKey, { exists: false }, CACHE_TTL_NOT_FOUND);
        console.log(`[Content404] Keyword has no published articles: ${slug} - returning 404 status`);
        if (isProduction && fs.existsSync(indexPath)) {
          return sendIndexHtml(res, indexPath, 404);
        }
        res.status(404);
      } else {
        memoryCache.set(cacheKey, { exists: true }, CACHE_TTL_FOUND);
      }
      return next();
    }

    const shortUrlMatch = normalizedPath.match(SHORT_URL_PATTERN);
    if (shortUrlMatch) {
      const shortSlug = shortUrlMatch[1];
      
      if (VALID_PREFIXES.has(shortSlug.toLowerCase())) {
        return next();
      }
      
      const [arArticle] = await db
        .select({ id: articles.id })
        .from(articles)
        .where(eq(articles.englishSlug, shortSlug))
        .limit(1);
      
      if (arArticle) {
        memoryCache.set(cacheKey, { exists: true }, CACHE_TTL_FOUND);
        return next();
      }
      
      const [enArticle] = await db
        .select({ id: enArticles.id })
        .from(enArticles)
        .where(eq(enArticles.englishSlug, shortSlug))
        .limit(1);
      
      if (enArticle) {
        memoryCache.set(cacheKey, { exists: true }, CACHE_TTL_FOUND);
        return next();
      }
      
      const [urArticle] = await db
        .select({ id: urArticles.id })
        .from(urArticles)
        .where(eq(urArticles.englishSlug, shortSlug))
        .limit(1);
      
      if (urArticle) {
        memoryCache.set(cacheKey, { exists: true }, CACHE_TTL_FOUND);
        return next();
      }
      
      memoryCache.set(cacheKey, { exists: false }, CACHE_TTL_NOT_FOUND);
      console.log(`[Content404] Short URL not found: ${shortSlug} - returning 404 status`);
      if (isProduction && fs.existsSync(indexPath)) {
        return sendIndexHtml(res, indexPath, 404);
      }
      res.status(404);
      return next();
    }

    next();
  } catch (error) {
    console.error('[Content404] Error checking content existence:', error);
    next();
  }
}
