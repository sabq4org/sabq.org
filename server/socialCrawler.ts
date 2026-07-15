import type { Request, Response, NextFunction } from "express";
import { db } from "./db";
import { articles, categories, users, enArticles, urArticles, gulfEvents, angles, topics } from "@shared/schema";
import { eq, or, and, desc } from "drizzle-orm";
import { withCache, CACHE_TTL } from "./memoryCache";
import path from "path";
import fs from "fs/promises";
import { resolveMuqtarabOgImage } from "./utils/muqtarabShareImage";
import { withOgImageCacheBust } from "./utils/ogImageUrl";

/**
 * Social Media Crawler Middleware
 * 
 * Detects crawlers from WhatsApp, Facebook, Twitter, etc. and serves
 * static HTML with proper Open Graph meta tags for proper link previews.
 * 
 * This solves the SPA problem where meta tags are generated client-side
 * but crawlers need them server-side.
 */

// User agents for social media crawlers and search engines
const CRAWLER_USER_AGENTS = [
  'facebookexternalhit',      // Facebook
  'WhatsApp',                 // WhatsApp
  'Twitterbot',               // Twitter
  'TelegramBot',              // Telegram
  'LinkedInBot',              // LinkedIn
  'Slackbot',                 // Slack
  'Discordbot',               // Discord
  'SkypeUriPreview',          // Skype
  'vkShare',                  // VK
  'pinterest',                // Pinterest
  'bot.html',                 // Generic bot detector
  'Googlebot',                // Google Search
  'bingbot',                  // Bing Search
  'YandexBot',                // Yandex Search
  'DuckDuckBot',              // DuckDuckGo
  'Baiduspider',              // Baidu Search
];

/**
 * Checks if the request is from a social media crawler
 */
function isCrawler(req: Request): boolean {
  const userAgent = req.headers['user-agent'] || '';
  return CRAWLER_USER_AGENTS.some(crawler => 
    userAgent.toLowerCase().includes(crawler.toLowerCase())
  );
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Ensures image URL is absolute and accessible by social media crawlers.
 * Converts relative storage paths to proper absolute URLs.
 */
const socialImgDir = path.join(process.cwd(), 'dist', 'public', 'social-images');

function parseObjectStorageUrl(url: string): { storagePath: string; gcsPath: string; bucketId?: string } | null {
  if (url.startsWith('/public-objects/uploads/')) {
    const id = url.replace('/public-objects/uploads/', '');
    return { storagePath: `uploads/${id}`, gcsPath: `public/uploads/${id}` };
  }
  if (url.startsWith('/public-objects/')) {
    const rest = url.replace('/public-objects/', '');
    return { storagePath: rest, gcsPath: rest.includes('/') ? `public/${rest}` : `public/uploads/${rest}` };
  }
  const bucketMatch = url.match(/^\/api\/public-media\/(replit-objstore-[a-f0-9-]+)\/public\/(.+)$/);
  if (bucketMatch) {
    return { storagePath: bucketMatch[2], gcsPath: `public/${bucketMatch[2]}`, bucketId: bucketMatch[1] };
  }
  if (url.startsWith('/api/public-media/public/')) {
    const rest = url.replace('/api/public-media/public/', '');
    return { storagePath: rest, gcsPath: `public/${rest}` };
  }
  if (url.startsWith('/api/public-media/')) {
    const rest = url.replace('/api/public-media/', '');
    return { storagePath: rest, gcsPath: rest.includes('/') ? `public/${rest}` : `public/uploads/${rest}` };
  }
  return null;
}

function getSocialImageFilename(url: string): string | null {
  const parsed = parseObjectStorageUrl(url);
  if (!parsed) return null;
  return parsed.storagePath.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9\-_\/]/g, '').replace(/\//g, '_') + '.jpg';
}

async function prepareSocialImage(imageUrl: string): Promise<void> {
  const parsed = parseObjectStorageUrl(imageUrl);
  if (!parsed) return;

  const filename = getSocialImageFilename(imageUrl);
  if (!filename) return;

  const cachedPath = path.join(socialImgDir, filename);

  try {
    await fs.access(cachedPath);
    return;
  } catch {}

  try {
    await fs.mkdir(socialImgDir, { recursive: true });

    const { objectStorageClient, getBucketConfig } = await import('./objectStorage');
    const { bucketName } = getBucketConfig();

    const bucketsToTry = parsed.bucketId
      ? [parsed.bucketId, bucketName]
      : [bucketName, 'replit-objstore-3dc2325c-bbbe-4e54-9a00-e6f10b243138'];

    let imageBuffer: Buffer | null = null;

    for (const bName of bucketsToTry) {
      try {
        const bucket = objectStorageClient.bucket(bName);
        const file = bucket.file(parsed.gcsPath);
        const [exists] = await file.exists();
        if (!exists) continue;

        const chunks: Buffer[] = [];
        await new Promise<void>((resolve, reject) => {
          file.createReadStream()
            .on('data', (chunk: Buffer) => chunks.push(chunk))
            .on('end', () => resolve())
            .on('error', reject);
        });
        imageBuffer = Buffer.concat(chunks);
        break;
      } catch {}
    }

    if (!imageBuffer) {
      console.log(`[Social Image] File not found in any bucket: ${parsed.gcsPath}`);
      return;
    }

    const sharp = (await import('sharp')).default;
    const jpegBuffer = await sharp(imageBuffer)
      .resize(1200, 630, { fit: 'cover' })
      .jpeg({ quality: 85 })
      .toBuffer();

    await fs.writeFile(cachedPath, jpegBuffer);
    console.log(`[Social Image] Generated: ${filename} (${jpegBuffer.length} bytes)`);
  } catch (err) {
    console.error('[Social Image] Failed to generate:', filename, err);
  }
}

function ensureAbsoluteUrl(
  url: string,
  baseUrl: string,
  version?: Date | string | number | null,
): string {
  if (!url) return `${baseUrl}/icon.png`;
  
  let absolute: string;
  if (url.startsWith('http://') || url.startsWith('https://')) {
    absolute = url;
  } else {
    const parsed = parseObjectStorageUrl(url);
    if (parsed) {
      const cleanPath = parsed.storagePath.replace(/\.[^.]+$/, '');
      absolute = `${baseUrl}/social-image/${cleanPath}.jpg`;
    } else {
      absolute = `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
    }
  }
  return withOgImageCacheBust(absolute, version);
}

/**
 * Generates static HTML with Open Graph meta tags for an article
 */
function generateArticleHTML(article: any, baseUrl: string): string {
  // Extract SEO data from article.seo JSON field or fallback to article fields
  const seoData = article.seo || {};
  const seoTitle = seoData.title || article.title || 'خبر من سبق';
  // Support both camelCase and snake_case for aiSummary
  const seoDescription = seoData.description || article.excerpt || article.aiSummary || article.ai_summary || 'اقرأ المزيد';
  // Support both camelCase and snake_case for imageUrl - ensure absolute URL
  const rawImageUrl = article.imageUrl || article.image_url || '';
  const seoImage = ensureAbsoluteUrl(
    rawImageUrl,
    baseUrl,
    article.updatedAt || article.updated_at || article.publishedAt || article.published_at,
  );
  const articleUrl = `${baseUrl}/article/${article.slug}`;
  
  const safeSeoTitle = escapeHtml(seoTitle);
  const safeSeoDescription = escapeHtml(seoDescription);
  const safeSeoImage = escapeHtml(seoImage);
  const safeArticleUrl = escapeHtml(articleUrl);
  
  // Use x-default hreflang since we don't have cross-language article relationships in the schema
  const alternateLanguages: { lang: string; url: string }[] = [
    { lang: 'ar', url: articleUrl }
  ];
  
  // NewsArticle structured data
  const publishedAt = article.publishedAt || article.published_at;
  const publishedIso = publishedAt ? new Date(publishedAt).toISOString() : undefined;
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": articleUrl
    },
    "headline": seoTitle,
    "description": seoDescription,
    "image": [seoImage],
    "datePublished": publishedIso,
    "dateModified": publishedIso,
    "author": {
      "@type": "Organization",
      "name": "صحيفة سبق الإلكترونية",
      "url": baseUrl
    },
    "publisher": {
      "@type": "Organization",
      "name": "صحيفة سبق الإلكترونية",
      "logo": {
        "@type": "ImageObject",
        "url": `${baseUrl}/branding/sabq-og-image.png`
      }
    }
  };
  
  return generateMetaHTML({
    title: safeSeoTitle,
    description: safeSeoDescription,
    url: safeArticleUrl,
    image: safeSeoImage,
    type: 'article',
    baseUrl,
    publishedTime: publishedIso,
    modifiedTime: publishedIso,
    twitterSite: '@sabq',
    alternateLanguages,
    structuredData,
    articleBody: article.content || '',
    heroImage: rawImageUrl ? seoImage : undefined,
  });
}

/**
 * Generates static HTML with Open Graph meta tags for an opinion article
 */
function generateOpinionArticleHTML(article: any, baseUrl: string): string {
  // Extract SEO data from article.seo JSON field or fallback to article fields
  const seoData = article.seo || {};
  const seoTitle = seoData.title || article.title || 'مقال رأي من سبق';
  // Support both camelCase and snake_case for aiSummary
  const seoDescription = seoData.description || article.excerpt || article.aiSummary || article.ai_summary || 'اقرأ مقال الرأي';
  // Support both camelCase and snake_case for imageUrl - ensure absolute URL
  const rawImageUrl = article.imageUrl || article.image_url || '';
  const seoImage = ensureAbsoluteUrl(
    rawImageUrl,
    baseUrl,
    article.updatedAt || article.updated_at || article.publishedAt || article.published_at,
  );
  const articleUrl = `${baseUrl}/opinion/${article.slug}`;
  
  const safeSeoTitle = escapeHtml(seoTitle);
  const safeSeoDescription = escapeHtml(seoDescription);
  const safeSeoImage = escapeHtml(seoImage);
  const safeArticleUrl = escapeHtml(articleUrl);
  
  // NewsArticle structured data
  const publishedAt = article.publishedAt || article.published_at;
  const publishedIso = publishedAt ? new Date(publishedAt).toISOString() : undefined;
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": articleUrl
    },
    "headline": seoTitle,
    "description": seoDescription,
    "image": [seoImage],
    "datePublished": publishedIso,
    "dateModified": publishedIso,
    "author": {
      "@type": "Organization",
      "name": "صحيفة سبق الإلكترونية",
      "url": baseUrl
    },
    "publisher": {
      "@type": "Organization",
      "name": "صحيفة سبق الإلكترونية",
      "logo": {
        "@type": "ImageObject",
        "url": `${baseUrl}/branding/sabq-og-image.png`
      }
    }
  };
  
  return generateMetaHTML({
    title: safeSeoTitle,
    description: safeSeoDescription,
    url: safeArticleUrl,
    image: safeSeoImage,
    type: 'article',
    baseUrl,
    publishedTime: publishedIso,
    modifiedTime: publishedIso,
    twitterSite: '@sabq',
    structuredData,
    articleBody: article.content || '',
    heroImage: rawImageUrl ? seoImage : undefined,
  });
}

/**
 * Generates static HTML with Open Graph meta tags for a category
 */
function generateCategoryHTML(category: any, baseUrl: string): string {
  const seoTitle = `${category.nameAr} - صحيفة سبق الإلكترونية`;
  const seoDescription = category.description || `أخبار ${category.nameAr} على مدار الساعة من صحيفة سبق الإلكترونية`;
  // Support both camelCase and snake_case for heroImageUrl - ensure absolute URL
  const rawImageUrl = category.heroImageUrl || category.hero_image_url || '';
  const seoImage = ensureAbsoluteUrl(rawImageUrl, baseUrl);
  const categoryUrl = `${baseUrl}/category/${category.slug}`;
  
  const safeSeoTitle = escapeHtml(seoTitle);
  const safeSeoDescription = escapeHtml(seoDescription);
  const safeSeoImage = escapeHtml(seoImage);
  const safeCategoryUrl = escapeHtml(categoryUrl);
  
  return generateMetaHTML({
    title: safeSeoTitle,
    description: safeSeoDescription,
    url: safeCategoryUrl,
    image: safeSeoImage,
    type: 'website',
    baseUrl,
    twitterSite: '@sabq',
  });
}

/**
 * Generates static HTML with Open Graph meta tags for a reporter/user profile
 */
function generateReporterHTML(user: any, baseUrl: string): string {
  const fullName = user.firstName && user.lastName 
    ? `${user.firstName} ${user.lastName}` 
    : user.email;
  const seoTitle = `${fullName} - مراسل صحيفة سبق الإلكترونية`;
  const seoDescription = user.bio || `تابع أخبار ${fullName} على صحيفة سبق الإلكترونية`;
  // Support both camelCase and snake_case for profileImageUrl - ensure absolute URL
  const rawImageUrl = user.profileImageUrl || user.profile_image_url || '';
  const seoImage = ensureAbsoluteUrl(rawImageUrl, baseUrl);
  const reporterUrl = `${baseUrl}/reporter/${user.id}`;
  
  const safeSeoTitle = escapeHtml(seoTitle);
  const safeSeoDescription = escapeHtml(seoDescription);
  const safeSeoImage = escapeHtml(seoImage);
  const safeReporterUrl = escapeHtml(reporterUrl);
  
  return generateMetaHTML({
    title: safeSeoTitle,
    description: safeSeoDescription,
    url: safeReporterUrl,
    image: safeSeoImage,
    type: 'profile',
    baseUrl,
    twitterSite: '@sabq',
  });
}

/**
 * Generates static HTML with Open Graph meta tags for a writer/muqtarab profile
 */
function generateWriterHTML(user: any, baseUrl: string): string {
  const fullName = user.firstName && user.lastName 
    ? `${user.firstName} ${user.lastName}` 
    : user.email;
  const seoTitle = `${fullName} - كاتب رأي في صحيفة سبق الإلكترونية`;
  const seoDescription = user.bio || `تابع مقالات ${fullName} على صحيفة سبق الإلكترونية`;
  // Support both camelCase and snake_case for profileImageUrl - ensure absolute URL
  const rawImageUrl = user.profileImageUrl || user.profile_image_url || '';
  const seoImage = ensureAbsoluteUrl(rawImageUrl, baseUrl);
  const writerUrl = `${baseUrl}/muqtarab/${user.id}`;
  
  const safeSeoTitle = escapeHtml(seoTitle);
  const safeSeoDescription = escapeHtml(seoDescription);
  const safeSeoImage = escapeHtml(seoImage);
  const safeWriterUrl = escapeHtml(writerUrl);
  
  return generateMetaHTML({
    title: safeSeoTitle,
    description: safeSeoDescription,
    url: safeWriterUrl,
    image: safeSeoImage,
    type: 'profile',
    baseUrl,
    twitterSite: '@sabq',
  });
}

/**
 * Generates static HTML with Open Graph meta tags for Deep Analysis (Omq)
 */
function generateOmqHTML(article: any, baseUrl: string): string {
  const seoTitle = article.title ? `${article.title} - عُمق` : 'تحليل عميق - عُمق';
  // Support both camelCase and snake_case for aiSummary
  const seoDescription = article.excerpt || article.aiSummary || article.ai_summary || 'تحليل عميق متعدد النماذج من آي فوكس';
  // Support both camelCase and snake_case for imageUrl - ensure absolute URL
  const rawImageUrl = article.imageUrl || article.image_url || '';
  const seoImage = ensureAbsoluteUrl(rawImageUrl, baseUrl);
  const omqUrl = `${baseUrl}/ai/omq/${article.id}`;
  
  const safeSeoTitle = escapeHtml(seoTitle);
  const safeSeoDescription = escapeHtml(seoDescription);
  const safeSeoImage = escapeHtml(seoImage);
  const safeOmqUrl = escapeHtml(omqUrl);
  
  return generateMetaHTML({
    title: safeSeoTitle,
    description: safeSeoDescription,
    url: safeOmqUrl,
    image: safeSeoImage,
    type: 'article',
    baseUrl,
    publishedTime: (article.publishedAt || article.published_at) ? new Date(article.publishedAt || article.published_at).toISOString() : undefined,
    twitterSite: '@sabq',
  });
}

/**
 * Generates static HTML with Open Graph meta tags for iFox AI Homepage
 */
function generateIFoxHTML(baseUrl: string): string {
  const seoTitle = 'آي فوكس - بوابة الذكاء الاصطناعي | صحيفة سبق';
  const seoDescription = 'اكتشف مستقبل الأخبار مع آي فوكس - بوابة الذكاء الاصطناعي المتطورة التي تقدم تحليلات عميقة ومحتوى مخصص بتقنيات الذكاء الاصطناعي';
  const seoImage = `${baseUrl}/icon.png`;
  const ifoxUrl = `${baseUrl}/ai/ifox`;
  
  const safeSeoTitle = escapeHtml(seoTitle);
  const safeSeoDescription = escapeHtml(seoDescription);
  const safeSeoImage = escapeHtml(seoImage);
  const safeIfoxUrl = escapeHtml(ifoxUrl);
  
  return generateMetaHTML({
    title: safeSeoTitle,
    description: safeSeoDescription,
    url: safeIfoxUrl,
    image: safeSeoImage,
    type: 'website',
    baseUrl,
    twitterSite: '@sabq',
  });
}

/**
 * Generates static HTML with Open Graph meta tags for Homepage
 * This ensures WhatsApp and other social crawlers get proper meta tags with logo
 */
function generateHomepageHTML(baseUrl: string): string {
  const seoTitle = 'سبق الذكية - منصة الأخبار الذكية | صحيفة سبق الإلكترونية';
  const seoDescription = 'أخبار محدثة مع تلخيص تلقائي بالذكاء الاصطناعي ونظام توصيات شخصي - صحيفة سبق الإلكترونية';
  // Use the proper OG image (1200x630) for social sharing
  const seoImage = `${baseUrl}/branding/sabq-og-image.png`;
  const homeUrl = baseUrl;
  
  const safeSeoTitle = escapeHtml(seoTitle);
  const safeSeoDescription = escapeHtml(seoDescription);
  const safeSeoImage = escapeHtml(seoImage);
  const safeHomeUrl = escapeHtml(homeUrl);
  
  return generateMetaHTML({
    title: safeSeoTitle,
    description: safeSeoDescription,
    url: safeHomeUrl,
    image: safeSeoImage,
    type: 'website',
    baseUrl,
    twitterSite: '@sabq',
  });
}

const GULF_COUNTRY_AR: Record<string, string> = {
  saudi_arabia: "السعودية",
  uae: "الإمارات",
  bahrain: "البحرين",
  kuwait: "الكويت",
  qatar: "قطر",
  oman: "عُمان",
  yemen: "اليمن",
};

function toSaudiIso(date: Date | string | null): string {
  if (!date) return new Date().toISOString();
  const d = new Date(date);
  const offset = 3 * 60;
  const local = new Date(d.getTime() + offset * 60000);
  return local.toISOString().replace('Z', '+03:00');
}

async function buildGulfLiveJsonLd(baseUrl: string): Promise<object> {
  const events = await withCache(
    'gulf-live-schema',
    CACHE_TTL.LONG,
    async () => {
      return db
        .select({
          id: gulfEvents.id,
          content: gulfEvents.content,
          country: gulfEvents.country,
          sourceName: gulfEvents.sourceName,
          publishedAt: gulfEvents.publishedAt,
        })
        .from(gulfEvents)
        .where(eq(gulfEvents.status, "published"))
        .orderBy(desc(gulfEvents.publishedAt))
        .limit(50);
    }
  );

  const firstPublished = events.length > 0 ? events[events.length - 1].publishedAt : null;
  const lastModified = events.length > 0 ? events[0].publishedAt : null;

  return {
    "@context": "https://schema.org",
    "@type": "LiveBlogPosting",
    "headline": "البث الحي – الاعتداءات على دول الخليج",
    "url": `${baseUrl}/gulf-live`,
    "datePublished": toSaudiIso(firstPublished),
    "dateModified": toSaudiIso(lastModified),
    "coverageStartTime": toSaudiIso(firstPublished),
    "inLanguage": "ar",
    "keywords": "الاعتداءات على دول الخليج, مسيّرات, صواريخ باليستية, السعودية, الإمارات, البحرين, الكويت, قطر",
    "publisher": {
      "@type": "Organization",
      "name": "صحيفة سبق الإلكترونية",
      "url": baseUrl,
      "logo": {
        "@type": "ImageObject",
        "url": `${baseUrl}/logo.png`
      }
    },
    "liveBlogUpdate": events.map(event => ({
      "@type": "BlogPosting",
      "headline": (event.content || "").substring(0, 110),
      "datePublished": toSaudiIso(event.publishedAt),
      "articleBody": event.content || "",
      "locationCreated": {
        "@type": "Place",
        "name": GULF_COUNTRY_AR[event.country] || event.country
      },
      "author": {
        "@type": "Organization",
        "name": event.sourceName || "بيان رسمي"
      }
    }))
  };
}

/**
 * Generates static HTML with Open Graph meta tags for Gulf Live Coverage page
 */
async function generateGulfLiveHTML(baseUrl: string): Promise<string> {
  const seoTitle = 'البث الحي — الاعتداءات على دول الخليج | صحيفة سبق';
  const seoDescription = 'تغطية لحظية مباشرة لجميع الاعتداءات على دول الخليج العربي — اعتراض مسيّرات وصواريخ باليستية وكروز مع تحديثات فورية من المصادر الرسمية';
  const seoImage = `${baseUrl}/branding/sabq-og-image.png`;
  const pageUrl = `${baseUrl}/gulf-live`;

  const safeSeoTitle = escapeHtml(seoTitle);
  const safeSeoDescription = escapeHtml(seoDescription);
  const safeSeoImage = escapeHtml(seoImage);
  const safePageUrl = escapeHtml(pageUrl);

  const jsonLd = await buildGulfLiveJsonLd(baseUrl);

  return generateMetaHTML({
    title: safeSeoTitle,
    description: safeSeoDescription,
    url: safePageUrl,
    image: safeSeoImage,
    type: 'website',
    baseUrl,
    twitterSite: '@sabq',
    structuredData: jsonLd,
  });
}

/**
 * Generates 404 Not Found HTML for crawlers (SEO-friendly)
 * Returns proper 404 status with minimal HTML for search engines
 */
function generate404HTML(baseUrl: string, lang: string = 'ar'): string {
  const isRtl = lang === 'ar' || lang === 'ur';
  
  let title: string, description: string, homeText: string;
  
  if (lang === 'ar') {
    title = 'الصفحة غير موجودة - صحيفة سبق الإلكترونية';
    description = 'عذراً، الصفحة التي تبحث عنها غير متوفرة. قد تكون قد نُقلت أو حُذفت.';
    homeText = 'العودة للصفحة الرئيسية';
  } else if (lang === 'ur') {
    title = 'صفحہ نہیں ملا - سبق نیوز';
    description = 'معذرت، آپ جس صفحے کی تلاش کر رہے ہیں وہ دستیاب نہیں ہے۔ ہو سکتا ہے اسے منتقل یا حذف کر دیا گیا ہو۔';
    homeText = 'ہوم پیج پر واپس جائیں';
  } else {
    title = 'Page Not Found - Sabq News';
    description = 'Sorry, the page you are looking for is not available. It may have been moved or deleted.';
    homeText = 'Go to Homepage';
  }
  
  const dir = isRtl ? 'rtl' : 'ltr';
  const fontFamily = lang === 'en' ? "'Inter', Arial, sans-serif" : "'Tajawal', Arial, sans-serif";
  
  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
</head>
<body style="font-family: ${fontFamily}; direction: ${dir}; text-align: center; padding: 50px; background: #f5f5f5;">
  <h1 style="color: #333; font-size: 72px; margin-bottom: 20px;">404</h1>
  <h2 style="color: #666; font-size: 24px; margin-bottom: 12px;">${escapeHtml(title)}</h2>
  <p style="color: #888; font-size: 16px; line-height: 1.6; max-width: 500px; margin: 0 auto 30px;">${escapeHtml(description)}</p>
  <a href="${baseUrl}" style="display: inline-block; padding: 12px 24px; background: #0066cc; color: white; text-decoration: none; border-radius: 6px;">${escapeHtml(homeText)}</a>
</body>
</html>`;
}

/**
 * Generic function to generate meta HTML with Open Graph tags
 */
interface MetaHTMLOptions {
  title: string;
  description: string;
  url: string;
  image: string;
  type: string;
  baseUrl: string;
  publishedTime?: string;
  modifiedTime?: string;
  twitterSite?: string;
  twitterCreator?: string;
  lang?: string;
  dir?: 'rtl' | 'ltr';
  locale?: string;
  siteName?: string;
  readMoreText?: string;
  alternateLanguages?: { lang: string; url: string }[];
  structuredData?: object;
  // Full sanitized article HTML body (rendered for crawlers so they index the actual text)
  articleBody?: string;
  // Hero image URL to render at the top of the body (already absolute)
  heroImage?: string;
  // Optional category label
  categoryLabel?: string;
  // Author display name
  authorName?: string;
}

// Defense-in-depth: strip <script>/<iframe>/<style>/event-handlers and javascript: URLs
function stripUnsafeArticleHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<embed\b[^>]*>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/(href|src)\s*=\s*"\s*javascript:[^"]*"/gi, '$1="#"')
    .replace(/(href|src)\s*=\s*'\s*javascript:[^']*'/gi, "$1='#'");
}

function generateMetaHTML(options: MetaHTMLOptions): string {
  const { 
    title, 
    description, 
    url, 
    image, 
    type, 
    baseUrl, 
    publishedTime, 
    modifiedTime, 
    twitterSite, 
    twitterCreator,
    lang = 'ar',
    dir = 'rtl',
    locale = 'ar_SA',
    siteName = 'صحيفة سبق الإلكترونية',
    readMoreText = 'اقرأ المزيد',
    alternateLanguages,
    structuredData
  } = options;
  
  // Note: title, description, url, and image are already escaped by the calling functions
  // We use them directly without double-escaping
  
  const textAlign = dir === 'rtl' ? 'right' : 'left';
  const fontFamily = lang === 'en' ? "'Inter', Arial, sans-serif" : "'Tajawal', Arial, sans-serif";
  
  // Generate hreflang tags
  const hreflangTags = alternateLanguages 
    ? alternateLanguages.map(alt => `<link rel="alternate" hreflang="${escapeHtml(alt.lang)}" href="${escapeHtml(alt.url)}">`).join('\n  ')
    : '';
  
  // Generate JSON-LD structured data
  const structuredDataScript = structuredData 
    ? `<script type="application/ld+json">
${JSON.stringify(structuredData, null, 2)}
</script>`
    : '';
  
  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${description}">
  
  <!-- Canonical URL -->
  <link rel="canonical" href="${url}">
  
  <!-- Hreflang Tags for Multilingual Content -->
  ${hreflangTags}
  <link rel="alternate" hreflang="x-default" href="${url}">
  
  <!-- Open Graph / Facebook / WhatsApp -->
  <meta property="og:type" content="${type}">
  <meta property="og:url" content="${url}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${image}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${title}">
  <meta property="og:site_name" content="${escapeHtml(siteName)}">
  <meta property="og:locale" content="${locale}">
  ${publishedTime ? `<meta property="article:published_time" content="${publishedTime}">` : ''}
  ${modifiedTime ? `<meta property="article:modified_time" content="${modifiedTime}">` : ''}
  
  <!-- Twitter / X -->
  <meta name="twitter:card" content="summary_large_image">
  ${twitterSite ? `<meta name="twitter:site" content="${escapeHtml(twitterSite)}">` : ''}
  ${twitterCreator ? `<meta name="twitter:creator" content="${escapeHtml(twitterCreator)}">` : ''}
  <meta name="twitter:url" content="${url}">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${image}">
  <meta name="twitter:image:alt" content="${title}">
  
  ${structuredDataScript}
</head>
<body style="font-family: ${fontFamily}; direction: ${dir}; text-align: ${textAlign}; padding: 20px; background: #f5f5f5; max-width: 800px; margin: 0 auto;">
  ${options.categoryLabel ? `<div style="color: #0066cc; font-size: 14px; margin-bottom: 8px;">${escapeHtml(options.categoryLabel)}</div>` : ''}
  <h1 style="color: #333; font-size: 26px; margin-bottom: 12px; line-height: 1.4;">${title}</h1>
  ${options.authorName || options.publishedTime ? `<div style="color: #888; font-size: 13px; margin-bottom: 16px;">${options.authorName ? escapeHtml(options.authorName) : ''}${options.authorName && options.publishedTime ? ' • ' : ''}${options.publishedTime ? `<time datetime="${options.publishedTime}">${options.publishedTime.slice(0,10)}</time>` : ''}</div>` : ''}
  ${options.heroImage ? `<img src="${escapeHtml(options.heroImage)}" alt="${title}" style="width: 100%; height: auto; border-radius: 8px; margin-bottom: 20px;">` : ''}
  <p style="color: #444; font-size: 18px; line-height: 1.7; font-weight: 500; margin-bottom: 24px;">${description}</p>
  ${options.articleBody ? `<article style="color: #222; font-size: 16px; line-height: 1.9;">${stripUnsafeArticleHtml(options.articleBody)}</article>` : ''}
  <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #ddd;">
    <a href="${url}" style="display: inline-block; padding: 12px 24px; background: #0066cc; color: white; text-decoration: none; border-radius: 6px;">${escapeHtml(readMoreText)}</a>
  </div>
</body>
</html>`;
}

/**
 * Generates static HTML with Open Graph meta tags for an English article
 */
function generateEnglishArticleHTML(article: any, baseUrl: string): string {
  const seoData = article.seo || {};
  const seoTitle = seoData.title || article.title || 'News from Sabq';
  const seoDescription = seoData.description || article.excerpt || article.aiSummary || article.ai_summary || 'Read more';
  const rawImageUrl = article.imageUrl || article.image_url || '';
  const seoImage = ensureAbsoluteUrl(
    rawImageUrl,
    baseUrl,
    article.updatedAt || article.updated_at || article.publishedAt || article.published_at,
  );
  const articleSlug = article.englishSlug || article.slug;
  const articleUrl = `${baseUrl}/en/article/${articleSlug}`;
  
  const safeSeoTitle = escapeHtml(seoTitle);
  const safeSeoDescription = escapeHtml(seoDescription);
  const safeSeoImage = escapeHtml(seoImage);
  const safeArticleUrl = escapeHtml(articleUrl);
  
  // Use x-default hreflang since we don't have cross-language article relationships in the schema
  const alternateLanguages: { lang: string; url: string }[] = [
    { lang: 'en', url: articleUrl }
  ];
  
  // NewsArticle structured data
  const publishedAt = article.publishedAt || article.published_at;
  const publishedIso = publishedAt ? new Date(publishedAt).toISOString() : undefined;
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": articleUrl
    },
    "headline": seoTitle,
    "description": seoDescription,
    "image": [seoImage],
    "datePublished": publishedIso,
    "dateModified": publishedIso,
    "author": {
      "@type": "Organization",
      "name": "Sabq News",
      "url": baseUrl
    },
    "publisher": {
      "@type": "Organization",
      "name": "Sabq News",
      "logo": {
        "@type": "ImageObject",
        "url": `${baseUrl}/branding/sabq-og-image.png`
      }
    }
  };
  
  return generateMetaHTML({
    title: safeSeoTitle,
    description: safeSeoDescription,
    url: safeArticleUrl,
    image: safeSeoImage,
    type: 'article',
    baseUrl,
    publishedTime: publishedIso,
    modifiedTime: publishedIso,
    twitterSite: '@sabq',
    lang: 'en',
    dir: 'ltr',
    locale: 'en_US',
    siteName: 'Sabq News',
    readMoreText: 'Read More',
    alternateLanguages,
    structuredData,
  });
}

/**
 * Generates static HTML with Open Graph meta tags for an Urdu article
 */
function generateUrduArticleHTML(article: any, baseUrl: string): string {
  const seoData = article.seo || {};
  const seoTitle = seoData.title || article.title || 'صبق نیوز سے خبر';
  const seoDescription = seoData.description || article.excerpt || article.aiSummary || article.ai_summary || 'مزید پڑھیں';
  const rawImageUrl = article.imageUrl || article.image_url || '';
  const seoImage = ensureAbsoluteUrl(
    rawImageUrl,
    baseUrl,
    article.updatedAt || article.updated_at || article.publishedAt || article.published_at,
  );
  const articleSlug = article.englishSlug || article.slug;
  const articleUrl = `${baseUrl}/ur/article/${articleSlug}`;
  
  const safeSeoTitle = escapeHtml(seoTitle);
  const safeSeoDescription = escapeHtml(seoDescription);
  const safeSeoImage = escapeHtml(seoImage);
  const safeArticleUrl = escapeHtml(articleUrl);
  
  // Use x-default hreflang since we don't have cross-language article relationships in the schema
  const alternateLanguages: { lang: string; url: string }[] = [
    { lang: 'ur', url: articleUrl }
  ];
  
  // NewsArticle structured data
  const publishedAt = article.publishedAt || article.published_at;
  const publishedIso = publishedAt ? new Date(publishedAt).toISOString() : undefined;
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": articleUrl
    },
    "headline": seoTitle,
    "description": seoDescription,
    "image": [seoImage],
    "datePublished": publishedIso,
    "dateModified": publishedIso,
    "author": {
      "@type": "Organization",
      "name": "صبق نیوز",
      "url": baseUrl
    },
    "publisher": {
      "@type": "Organization",
      "name": "صبق نیوز",
      "logo": {
        "@type": "ImageObject",
        "url": `${baseUrl}/branding/sabq-og-image.png`
      }
    }
  };
  
  return generateMetaHTML({
    title: safeSeoTitle,
    description: safeSeoDescription,
    url: safeArticleUrl,
    image: safeSeoImage,
    type: 'article',
    baseUrl,
    publishedTime: publishedIso,
    modifiedTime: publishedIso,
    twitterSite: '@sabq',
    lang: 'ur',
    dir: 'rtl',
    locale: 'ur_PK',
    siteName: 'صبق نیوز',
    readMoreText: 'مزید پڑھیں',
    alternateLanguages,
    structuredData,
  });
}

/**
 * Middleware to handle social media crawlers
 */
export async function socialCrawlerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Skip API routes and static assets - they should handle their own responses
  if (req.path.startsWith('/api/') || req.path.startsWith('/src/') || req.path.startsWith('/@fs/') || req.path.startsWith('/assets/')) {
    return next();
  }
  
  // Only process if it's a crawler
  if (!isCrawler(req)) {
    return next();
  }

  console.log(`[SocialCrawler] Detected crawler: ${req.headers['user-agent']}`);
  console.log(`[SocialCrawler] Path: ${req.path}`);
  
  // Normalize path: decode URI components and remove trailing slash
  let normalizedPath = req.path;
  try {
    normalizedPath = decodeURIComponent(req.path);
  } catch (e) {
    console.warn(`[SocialCrawler] Failed to decode path: ${req.path}`);
  }
  normalizedPath = normalizedPath.replace(/\/$/, ''); // Remove trailing slash
  
  console.log(`[SocialCrawler] Normalized path: ${normalizedPath}`);

  // Get base URL from request (used by all handlers)
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['host'] || 'sabq.org';
  const baseUrl = `${protocol}://${host}`;

  try {
    // 1️⃣ Handle article pages: /article/:slug
    const articleMatch = normalizedPath.match(/^\/article\/([^\/]+)$/);
    if (articleMatch) {
      const slug = articleMatch[1];
      console.log(`[SocialCrawler] Handling article: ${slug}`);
      
      const crawlerArticleColumns = {
          id: articles.id,
          title: articles.title,
          slug: articles.slug,
          englishSlug: articles.englishSlug,
          excerpt: articles.excerpt,
          content: articles.content,
          aiSummary: articles.aiSummary,
          imageUrl: articles.imageUrl,
          thumbnailUrl: articles.thumbnailUrl,
          publishedAt: articles.publishedAt,
          updatedAt: articles.updatedAt,
          seo: articles.seo,
          categoryId: articles.categoryId,
          articleType: articles.articleType,
          newsType: articles.newsType,
          source: articles.source,
          sourceUrl: articles.sourceUrl,
          authorId: articles.authorId,
        };
      const [article] = await withCache(`crawler:article:${slug}`, CACHE_TTL.LONG, async () =>
        db.select(crawlerArticleColumns).from(articles).where(or(eq(articles.slug, slug), eq(articles.englishSlug, slug))).limit(1)
      );

      if (!article) {
        console.log(`[SocialCrawler] Article not found: ${slug} - returning 404`);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        return res.status(404).send(generate404HTML(baseUrl, 'ar'));
      }

      // Use englishSlug (short URL) for social sharing if available
      const articleWithSlug = { ...article, slug: article.englishSlug || article.slug };
      const rawImg = article.imageUrl || '';
      // Fire-and-forget — do not block the request on social image transcoding
      prepareSocialImage(rawImg).catch(() => {});
      const html = generateArticleHTML(articleWithSlug, baseUrl);
      console.log(`[SocialCrawler] ✅ Serving article: ${article.title}`);
      
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(html);
    }

    // 1.5️⃣ Handle opinion article pages: /opinion/:slug
    const opinionMatch = normalizedPath.match(/^\/opinion\/([^\/]+)$/);
    if (opinionMatch) {
      const slug = opinionMatch[1];
      console.log(`[SocialCrawler] Handling opinion article: ${slug}`);
      
      const crawlerOpinionColumns = {
          id: articles.id,
          title: articles.title,
          slug: articles.slug,
          englishSlug: articles.englishSlug,
          excerpt: articles.excerpt,
          content: articles.content,
          aiSummary: articles.aiSummary,
          imageUrl: articles.imageUrl,
          thumbnailUrl: articles.thumbnailUrl,
          publishedAt: articles.publishedAt,
          updatedAt: articles.updatedAt,
          seo: articles.seo,
          categoryId: articles.categoryId,
          articleType: articles.articleType,
          newsType: articles.newsType,
          source: articles.source,
          sourceUrl: articles.sourceUrl,
          authorId: articles.authorId,
        };
      const [article] = await withCache(`crawler:opinion:${slug}`, CACHE_TTL.LONG, async () =>
        db.select(crawlerOpinionColumns).from(articles).where(or(eq(articles.slug, slug), eq(articles.englishSlug, slug))).limit(1)
      );

      if (!article) {
        console.log(`[SocialCrawler] Opinion article not found: ${slug} - returning 404`);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        return res.status(404).send(generate404HTML(baseUrl, 'ar'));
      }

      // Use englishSlug (short URL) for social sharing if available
      const articleWithSlug = { ...article, slug: article.englishSlug || article.slug };
      const rawOpImg = article.imageUrl || '';
      // Fire-and-forget — do not block the request on social image transcoding
      prepareSocialImage(rawOpImg).catch(() => {});
      const html = generateOpinionArticleHTML(articleWithSlug, baseUrl);
      console.log(`[SocialCrawler] ✅ Serving opinion article: ${article.title}`);
      
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(html);
    }

    // 1.6️⃣ Handle English article pages: /en/article/:slug
    const enArticleMatch = normalizedPath.match(/^\/en\/article\/([^\/]+)$/);
    if (enArticleMatch) {
      const slug = enArticleMatch[1];
      console.log(`[SocialCrawler] Handling English article: ${slug}`);
      
      const crawlerEnColumns = {
          id: enArticles.id,
          title: enArticles.title,
          slug: enArticles.slug,
          englishSlug: enArticles.englishSlug,
          excerpt: enArticles.excerpt,
          imageUrl: enArticles.imageUrl,
          thumbnailUrl: enArticles.imageUrl,
          publishedAt: enArticles.publishedAt,
          updatedAt: enArticles.updatedAt,
          seo: enArticles.seo,
          categoryId: enArticles.categoryId,
        };
      const [article] = await withCache(`crawler:en-article:${slug}`, CACHE_TTL.LONG, async () =>
        db.select(crawlerEnColumns).from(enArticles).where(or(eq(enArticles.slug, slug), eq(enArticles.englishSlug, slug))).limit(1)
      );

      if (!article) {
        console.log(`[SocialCrawler] English article not found: ${slug} - returning 404`);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        return res.status(404).send(generate404HTML(baseUrl, 'en'));
      }

      // Fire-and-forget — do not block the request on social image transcoding
      prepareSocialImage(article.imageUrl || '').catch(() => {});
      const html = generateEnglishArticleHTML(article, baseUrl);
      console.log(`[SocialCrawler] ✅ Serving English article: ${article.title}`);
      
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(html);
    }

    // 1.7️⃣ Handle Urdu article pages: /ur/article/:slug
    const urArticleMatch = normalizedPath.match(/^\/ur\/article\/([^\/]+)$/);
    if (urArticleMatch) {
      const slug = urArticleMatch[1];
      console.log(`[SocialCrawler] Handling Urdu article: ${slug}`);
      
      const crawlerUrColumns = {
          id: urArticles.id,
          title: urArticles.title,
          slug: urArticles.slug,
          englishSlug: urArticles.englishSlug,
          excerpt: urArticles.excerpt,
          imageUrl: urArticles.imageUrl,
          thumbnailUrl: urArticles.imageUrl,
          publishedAt: urArticles.publishedAt,
          updatedAt: urArticles.updatedAt,
          seo: urArticles.seo,
          categoryId: urArticles.categoryId,
        };
      const [article] = await withCache(`crawler:ur-article:${slug}`, CACHE_TTL.LONG, async () =>
        db.select(crawlerUrColumns).from(urArticles).where(or(eq(urArticles.slug, slug), eq(urArticles.englishSlug, slug))).limit(1)
      );

      if (!article) {
        console.log(`[SocialCrawler] Urdu article not found: ${slug} - returning 404`);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        return res.status(404).send(generate404HTML(baseUrl, 'ur'));
      }

      // Fire-and-forget — do not block the request on social image transcoding
      prepareSocialImage(article.imageUrl || '').catch(() => {});
      const html = generateUrduArticleHTML(article, baseUrl);
      console.log(`[SocialCrawler] ✅ Serving Urdu article: ${article.title}`);
      
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(html);
    }

    // 2️⃣ Handle category pages: /category/:slug
    const categoryMatch = normalizedPath.match(/^\/category\/([^\/]+)$/);
    if (categoryMatch) {
      const slug = categoryMatch[1];
      console.log(`[SocialCrawler] Handling category: ${slug}`);
      
      const [category] = await withCache(`crawler:category:${slug}`, CACHE_TTL.LONG, async () =>
        db.select().from(categories).where(eq(categories.slug, slug)).limit(1)
      );

      if (!category) {
        console.log(`[SocialCrawler] Category not found: ${slug} - returning 404`);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        return res.status(404).send(generate404HTML(baseUrl, 'ar'));
      }

      const html = generateCategoryHTML(category, baseUrl);
      console.log(`[SocialCrawler] ✅ Serving category: ${category.nameAr}`);
      
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(html);
    }

    // 3️⃣ Handle reporter pages: /reporter/:id
    const reporterMatch = normalizedPath.match(/^\/reporter\/([^\/]+)$/);
    if (reporterMatch) {
      const id = reporterMatch[1];
      console.log(`[SocialCrawler] Handling reporter: ${id}`);
      
      const crawlerUserColumns = {
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        role: users.role,
        bio: users.bio,
        profileImageUrl: users.profileImageUrl,
      };
      const [reporter] = await withCache(`crawler:user:${id}`, CACHE_TTL.LONG, async () =>
        db.select(crawlerUserColumns).from(users).where(eq(users.id, id)).limit(1)
      );

      if (!reporter) {
        console.log(`[SocialCrawler] Reporter not found: ${id} - returning 404`);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        return res.status(404).send(generate404HTML(baseUrl, 'ar'));
      }

      // Role filtering: only serve if user has reporter role
      if (reporter.role !== 'reporter') {
        console.log(`[SocialCrawler] User ${id} is not a reporter (role: ${reporter.role})`);
        return next();
      }

      const html = generateReporterHTML(reporter, baseUrl);
      const name = reporter.firstName && reporter.lastName 
        ? `${reporter.firstName} ${reporter.lastName}` 
        : reporter.email;
      console.log(`[SocialCrawler] ✅ Serving reporter: ${name}`);
      
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(html);
    }

    // 4️⃣ Muqtarab topic: /muqtarab/:angleSlug/topic/:topicSlug
    const muqtarabTopicMatch = normalizedPath.match(/^\/muqtarab\/([^/]+)\/topic\/([^/]+)$/);
    if (muqtarabTopicMatch) {
      const angleSlug = decodeURIComponent(muqtarabTopicMatch[1]);
      const topicSlug = decodeURIComponent(muqtarabTopicMatch[2]);
      console.log(`[SocialCrawler] Handling Muqtarab topic: ${angleSlug}/${topicSlug}`);

      const [row] = await withCache(`crawler:muqtarab-topic:${angleSlug}:${topicSlug}`, CACHE_TTL.LONG, async () =>
        db
          .select({
            title: topics.title,
            excerpt: topics.excerpt,
            content: topics.content,
            heroImageUrl: topics.heroImageUrl,
            status: topics.status,
            publishedAt: topics.publishedAt,
            updatedAt: topics.updatedAt,
            seoMeta: topics.seoMeta,
            topicSlug: topics.slug,
            angleNameAr: angles.nameAr,
            angleSlug: angles.slug,
            angleCover: angles.coverImageUrl,
          })
          .from(topics)
          .innerJoin(angles, eq(topics.angleId, angles.id))
          .where(and(eq(angles.slug, angleSlug), eq(topics.slug, topicSlug)))
          .limit(1)
      );

      if (!row) {
        console.log(`[SocialCrawler] Muqtarab topic not found: ${angleSlug}/${topicSlug}`);
        return next();
      }

      const seoMeta = (row.seoMeta as { ogImage?: string; metaTitle?: string; metaDescription?: string }) || {};
      const plain = (row.content as { plainText?: string } | null)?.plainText || "";
      const title = seoMeta.metaTitle || row.title || "";
      const description = escapeHtml(
        (seoMeta.metaDescription || row.excerpt || plain || `${row.title} — زاوية ${row.angleNameAr} على مُقترب`)
          .slice(0, 220),
      );
      const canonicalUrl = `${baseUrl}/muqtarab/${encodeURIComponent(row.angleSlug)}/topic/${encodeURIComponent(row.topicSlug)}`;
      const { raw: rawImg, absolute: resolvedOg } = await resolveMuqtarabOgImage(
        baseUrl,
        seoMeta.ogImage,
        row.heroImageUrl,
        row.angleCover,
      );
      if (rawImg) prepareSocialImage(rawImg).catch(() => {});
      const ogImage = escapeHtml(resolvedOg);
      const safeTitle = escapeHtml(`${title} — مُقترب — سبق`);

      const html = generateMetaHTML({
        title: safeTitle,
        description,
        url: escapeHtml(canonicalUrl),
        image: ogImage,
        type: "article",
        baseUrl,
        twitterSite: "@sabq",
        publishedTime: row.publishedAt ? new Date(row.publishedAt).toISOString() : undefined,
        modifiedTime: row.updatedAt ? new Date(row.updatedAt).toISOString() : undefined,
        heroImage: ogImage,
        readMoreText: "اقرأ المزيد",
      });

      console.log(`[SocialCrawler] ✅ Serving Muqtarab topic: ${row.title}`);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=3600");
      return res.send(html);
    }

    // 4.5️⃣ Muqtarab angle: /muqtarab/:angleSlug
    const muqtarabAngleMatch = normalizedPath.match(/^\/muqtarab\/([^/]+)$/);
    if (muqtarabAngleMatch) {
      const slug = decodeURIComponent(muqtarabAngleMatch[1]);
      console.log(`[SocialCrawler] Handling Muqtarab angle: ${slug}`);

      const [ang] = await withCache(`crawler:muqtarab-angle:${slug}`, CACHE_TTL.LONG, async () =>
        db
          .select({
            nameAr: angles.nameAr,
            slug: angles.slug,
            shortDesc: angles.shortDesc,
            coverImageUrl: angles.coverImageUrl,
            isActive: angles.isActive,
          })
          .from(angles)
          .where(eq(angles.slug, slug))
          .limit(1)
      );

      if (!ang || !ang.isActive) {
        console.log(`[SocialCrawler] Muqtarab angle not found: ${slug}`);
        return next();
      }

      const canonicalUrl = `${baseUrl}/muqtarab/${encodeURIComponent(ang.slug)}`;
      const description = escapeHtml(
        (ang.shortDesc || `زاوية ${ang.nameAr} على منصة مُقترب من صحيفة سبق الإلكترونية.`).slice(0, 220),
      );
      const { raw: rawImg, absolute: resolvedOg } = await resolveMuqtarabOgImage(
        baseUrl,
        ang.coverImageUrl,
      );
      if (rawImg) prepareSocialImage(rawImg).catch(() => {});
      const ogImage = escapeHtml(resolvedOg);
      const safeTitle = escapeHtml(`${ang.nameAr} — مُقترب — سبق`);

      const html = generateMetaHTML({
        title: safeTitle,
        description,
        url: escapeHtml(canonicalUrl),
        image: ogImage,
        type: "website",
        baseUrl,
        twitterSite: "@sabq",
        heroImage: ogImage,
        readMoreText: "اقرأ المزيد",
      });

      console.log(`[SocialCrawler] ✅ Serving Muqtarab angle: ${ang.nameAr}`);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=3600");
      return res.send(html);
    }

    // 5️⃣ Handle deep analysis (Omq) pages: /ai/omq/:id
    const omqMatch = normalizedPath.match(/^\/ai\/omq\/([^\/]+)$/);
    if (omqMatch) {
      const id = omqMatch[1];
      console.log(`[SocialCrawler] Handling Omq: ${id}`);
      
      const crawlerOmqColumns = {
          id: articles.id,
          title: articles.title,
          slug: articles.slug,
          englishSlug: articles.englishSlug,
          excerpt: articles.excerpt,
          aiSummary: articles.aiSummary,
          imageUrl: articles.imageUrl,
          thumbnailUrl: articles.thumbnailUrl,
          publishedAt: articles.publishedAt,
          updatedAt: articles.updatedAt,
          seo: articles.seo,
          categoryId: articles.categoryId,
          articleType: articles.articleType,
          newsType: articles.newsType,
        };
      const [analysis] = await withCache(`crawler:omq:${id}`, CACHE_TTL.LONG, async () =>
        db.select(crawlerOmqColumns).from(articles).where(eq(articles.id, id)).limit(1)
      );

      if (!analysis) {
        console.log(`[SocialCrawler] Omq analysis not found: ${id} - returning 404`);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        return res.status(404).send(generate404HTML(baseUrl, 'ar'));
      }

      const html = generateOmqHTML(analysis, baseUrl);
      console.log(`[SocialCrawler] ✅ Serving Omq: ${analysis.title}`);
      
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(html);
    }

    // 6️⃣ Handle sponsored content pages: /sponsored?mvi=...
    if (normalizedPath === '/sponsored') {
      const mvi = String(req.query.mvi || '');
      console.log(`[SocialCrawler] Handling sponsored page, mvi=${mvi}`);
      
      let title = 'محتوى مُموّل — سبق';
      let description = 'محتوى مُموّل على صحيفة سبق الإلكترونية';
      let ogImage = `${baseUrl}/branding/sabq-og-image.png`;
      const canonicalUrl = mvi ? `${baseUrl}/sponsored?mvi=${mvi}` : `${baseUrl}/sponsored`;
      
      if (mvi) {
        try {
          const data = await withCache(`crawler:sponsored:${mvi}`, CACHE_TTL.LONG, async () => {
            const response = await fetch(`https://polarcdn-terrax.com/nativeads/v1.4.0/json/creative/${mvi}`, {
              signal: AbortSignal.timeout(5000),
            });
            if (response.ok) {
              return response.json();
            }
            return null;
          });
          if (data?.experience?.title) {
            title = `${data.experience.title} — سبق`;
            description = data.experience.description || data.experience.title;
          }
          if (data?.primaryMedia?.content?.href) {
            const imgHref = data.primaryMedia.content.href;
            ogImage = imgHref.startsWith('http') ? imgHref : `https://polarcdn-terrax.com${imgHref.startsWith('/') ? '' : '/'}${imgHref}`;
          }
        } catch (e) {
          console.warn('[SocialCrawler] Failed to fetch sponsored content:', e);
        }
      }
      
      const safeTitle = escapeHtml(title);
      const safeDescription = escapeHtml(description);
      const safeImage = escapeHtml(ogImage);
      const safeUrl = escapeHtml(canonicalUrl);
      
      const html = generateMetaHTML({
        title: safeTitle,
        description: safeDescription,
        url: safeUrl,
        image: safeImage,
        type: 'article',
        baseUrl,
        twitterSite: '@sabq',
        readMoreText: 'اقرأ المزيد',
      });
      
      console.log(`[SocialCrawler] ✅ Serving sponsored: ${title}`);
      
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(html);
    }

    // 8️⃣ Handle Gulf Live Coverage page: /gulf-live
    if (normalizedPath === '/gulf-live') {
      console.log(`[SocialCrawler] Handling Gulf Live Coverage page`);

      const html = await generateGulfLiveHTML(baseUrl);
      console.log(`[SocialCrawler] ✅ Serving Gulf Live Coverage page`);

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(html);
    }

    // 9️⃣ Handle iFox AI homepage: /ai/ifox
    if (normalizedPath === '/ai/ifox') {
      console.log(`[SocialCrawler] Handling iFox homepage`);
      
      const html = generateIFoxHTML(baseUrl);
      console.log(`[SocialCrawler] ✅ Serving iFox homepage`);
      
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(html);
    }

    // 9️⃣ Handle main homepage: / or empty path
    if (normalizedPath === '' || normalizedPath === '/') {
      console.log(`[SocialCrawler] Handling main homepage`);
      
      const html = generateHomepageHTML(baseUrl);
      console.log(`[SocialCrawler] ✅ Serving main homepage with logo`);
      
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(html);
    }

    // For other pages, let the normal flow handle it
    // The meta tags in index.html will be served
    next();
  } catch (error) {
    console.error(`[SocialCrawler] Error processing request:`, error);
    return next();
  }
}
