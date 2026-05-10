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
        const whereClause = containsArabic(decodedSlug)
          ? eq(articles.slug, decodedSlug)
          : or(eq(articles.englishSlug, decodedSlug), eq(articles.slug, decodedSlug));
        
        const article = await db
          .select({ englishSlug: articles.englishSlug })
          .from(articles)
          .where(whereClause!)
          .limit(1);
        
        if (article.length > 0 && article[0].englishSlug) {
          const newPath = `/article/${article[0].englishSlug}`;
          res.redirect(301, newPath);
          return;
        }
        if (routeType === 'news') {
          res.redirect(301, `/article/${slug}`);
          return;
        }
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
