import type { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { articles, categories } from '@shared/schema';
import { eq, or } from 'drizzle-orm';

const ARABIC_CHAR_REGEX = /[\u0600-\u06FF]/;

function containsArabic(text: string): boolean {
  return ARABIC_CHAR_REGEX.test(text);
}

const CRAWLER_USER_AGENTS = [
  'facebookexternalhit',
  'WhatsApp',
  'Twitterbot',
  'TelegramBot',
  'LinkedInBot',
  'Slackbot',
  'Discordbot',
  'SkypeUriPreview',
  'vkShare',
  'pinterest',
  'Googlebot',
  'bingbot',
  'YandexBot',
  'DuckDuckBot',
  'Baiduspider',
  'SemrushBot',
  'AhrefsBot',
  'MJ12bot',
];

function isCrawler(req: Request): boolean {
  const userAgent = (req.headers['user-agent'] || '').toLowerCase();
  return CRAWLER_USER_AGENTS.some(crawler => userAgent.includes(crawler.toLowerCase()));
}

export async function slugRedirectMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const path = req.path;
    
    const articleMatch = path.match(/^\/(article|news)\/([^/]+)/);
    if (articleMatch) {
      const [, routeType, slug] = articleMatch;
      const decodedSlug = decodeURIComponent(slug);
      
      const needsRedirect = containsArabic(decodedSlug) || routeType === 'news';
      if (needsRedirect) {
        // Match by either slug column — for `/news/<x>` the path may carry
        // an English short-hash that landed in the englishSlug column.
        const article = await db
          .select({ slug: articles.slug, englishSlug: articles.englishSlug })
          .from(articles)
          .where(or(eq(articles.englishSlug, decodedSlug), eq(articles.slug, decodedSlug))!)
          .limit(1);

        if (article.length > 0 && article[0].englishSlug) {
          // Article exists in DB — 301 to its canonical English-slug URL.
          // Preserves backlink equity for legacy /news/ + Arabic-slug links.
          const newPath = `/article/${article[0].englishSlug}`;
          res.redirect(301, newPath);
          return;
        }

        if (routeType === 'news') {
          // No matching article anywhere. The previous "always 301
          // /news/* → /article/*" was producing 195K dangling redirect
          // chains in GSC — Google kept retrying chains that lead
          // nowhere. Now return 410 Gone so Google drops them from index
          // in days instead of months. Bots respect 410 immediately;
          // humans rarely see this path (no internal links point at
          // /news/ anymore).
          res.setHeader('Cache-Control', 'public, max-age=86400');
          res.status(410).type('text/html').send(
            '<!DOCTYPE html><html lang="ar"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>410 — سبق</title></head><body><h1>410 Gone</h1><p>تم حذف هذا المحتوى نهائياً.</p></body></html>'
          );
          return;
        }
        // For /article/<arabic-slug> with no DB match we fall through to
        // the seoInjector — it returns a real 404 with the SPA shell
        // (commit 25ff1af), which is exactly what we want.
      }
    }
    
    const categoryMatch = path.match(/^\/category\/([^/]+)/);
    if (categoryMatch) {
      const [, slug] = categoryMatch;
      const decodedSlug = decodeURIComponent(slug);
      
      if (containsArabic(decodedSlug)) {
        const category = await db
          .select({ englishSlug: categories.englishSlug })
          .from(categories)
          .where(eq(categories.slug, decodedSlug))
          .limit(1);
        
        if (category.length > 0 && category[0].englishSlug) {
          const newPath = `/category/${category[0].englishSlug}`;
          res.redirect(301, newPath);
          return;
        }
      }
    }
    
    next();
  } catch (error) {
    console.error('SlugRedirect middleware error:', error);
    next();
  }
}
