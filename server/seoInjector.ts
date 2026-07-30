import type { Request, Response, NextFunction } from "express";
import { db } from "./db";
import { articles, categories, users, enArticles, urArticles, gulfEvents, deepAnalyses, worldDays, tags, articleTags, angles, topics, staff } from "@shared/schema";
import { eq, or, desc, and, sql, aliasedTable, inArray } from "drizzle-orm";
import { sanitizeArticleHtml } from "./utils/sanitizeHtml";

// Pulled into a module-level alias so we can join the `users` table twice in
// the same query — once for `authorId` (the staff member who entered the
// article into the dashboard) and once for `reporterId` (the actual byline
// chosen from a dropdown). The SEO `article:author` meta tag should reflect
// the reporter whenever one is set.
const reporterUsers = aliasedTable(users, "reporter_user");
const reporterStaff = aliasedTable(staff, "reporter_staff");
const authorStaff = aliasedTable(staff, "author_staff");
const angleManagerStaff = aliasedTable(staff, "angle_manager_staff");
import fs from "fs";
import path from "path";
import { withCache, CACHE_TTL } from "./memoryCache";
import { VALID_PREFIXES } from "./utils/spaRouteMatcher";
import { isNoindexPath } from "./utils/noindexPaths";
import { buildNewsArticleSchemaExtras } from "./utils/newsArticleSchema";
import { withOgImageCacheBust } from "./utils/ogImageUrl";
import {
  buildPersonJsonLd,
  buildProfilePageJsonLd,
  buildArticleAuthorPerson,
  reporterProfileUrl,
  muqtarabAngleUrl,
  SABQ_ORG_AR,
  SABQ_ORG_EN,
} from "./utils/creatorSchema";
import { resolveMuqtarabOgImage } from "./utils/muqtarabShareImage";
import { getTeamSeoMeta } from "./services/saudiLeagueService";

const SKIP_PREFIXES = ['/api/', '/src/', '/@fs/', '/assets/', '/@vite/', '/node_modules/'];
const FILE_EXT_REGEX = /\.\w{2,5}$/;

let cachedTemplate: string | null = null;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getSocialImageFilename(url: string): string | null {
  let storagePath: string | null = null;
  if (url.startsWith('/public-objects/uploads/')) {
    storagePath = `uploads/${url.replace('/public-objects/uploads/', '')}`;
  } else if (url.startsWith('/public-objects/')) {
    storagePath = url.replace('/public-objects/', '');
  } else {
    const bucketMatch = url.match(/^\/api\/public-media\/replit-objstore-[a-f0-9-]+\/public\/(.+)$/);
    if (bucketMatch) {
      storagePath = bucketMatch[1];
    } else if (url.startsWith('/api/public-media/public/')) {
      storagePath = url.replace('/api/public-media/public/', '');
    } else if (url.startsWith('/api/public-media/')) {
      storagePath = url.replace('/api/public-media/', '');
    }
  }
  if (!storagePath) return null;
  return storagePath.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9\-_\/]/g, '').replace(/\//g, '_') + '.jpg';
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
    const parsed = parseStorageUrl(url);
    if (parsed) {
      absolute = `${baseUrl}/social-image/${parsed}.jpg`;
    } else {
      absolute = `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
    }
  }
  return withOgImageCacheBust(absolute, version);
}

function parseStorageUrl(url: string): string | null {
  if (url.startsWith('/public-objects/uploads/')) {
    return `uploads/${url.replace('/public-objects/uploads/', '')}`;
  }
  if (url.startsWith('/public-objects/')) {
    const rest = url.replace('/public-objects/', '');
    return rest;
  }
  const bucketMatch = url.match(/^\/api\/public-media\/replit-objstore-[a-f0-9-]+\/public\/(.+)$/);
  if (bucketMatch) {
    return bucketMatch[1].replace(/\.[^.]+$/, '');
  }
  if (url.startsWith('/api/public-media/public/')) {
    return url.replace('/api/public-media/public/', '').replace(/\.[^.]+$/, '');
  }
  if (url.startsWith('/api/public-media/')) {
    return url.replace('/api/public-media/', '').replace(/\.[^.]+$/, '');
  }
  return null;
}

function truncate(str: string, len: number): string {
  if (!str) return '';
  if (str.length <= len) return str;
  return str.substring(0, len).replace(/\s+\S*$/, '') + '...';
}

// Sanitizes stored article HTML before injecting it into the SSR response.
// Delegates to the shared DOMPurify-based sanitizer — the previous regex missed
// unquoted event handlers (`<img src=x onerror=...>`) → stored XSS (audit #5).
function stripUnsafeHtml(html: string): string {
  return sanitizeArticleHtml(html);
}

function getBaseUrl(req: Request): string {
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction) return 'https://sabq.org';
  const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
  const host = (req.headers['host'] as string) || 'sabq.org';
  return `${proto}://${host}`;
}

async function getTemplate(): Promise<string> {
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction && cachedTemplate) return cachedTemplate;

  const templatePath = isProduction
    ? path.resolve(import.meta.dirname, 'public', 'index.html')
    : path.resolve(import.meta.dirname, '..', 'client', 'index.html');

  const template = await fs.promises.readFile(templatePath, 'utf-8');
  if (isProduction) {
    cachedTemplate = template;
  }
  return template;
}

interface SeoData {
  title: string;
  description: string;
  canonicalUrl: string;
  ogType: string;
  ogImage: string;
  ogLocale: string;
  ogSiteName: string;
  publishedTime?: string;
  modifiedTime?: string;
  articleSection?: string;
  articleTags?: string[];
  articleAuthor?: string;
  twitterSite: string;
  jsonLd?: object;
  semanticHtml?: string;
  preloadImage?: string;
  robots?: string;
  hreflangLinks?: Array<{ lang: string; href: string }>;
}

function injectSeoIntoHtml(html: string, seo: SeoData): string {
  const safeTitle = escapeHtml(seo.title);
  const safeDesc = escapeHtml(seo.description);
  const safeCanonical = escapeHtml(seo.canonicalUrl);
  const safeImage = escapeHtml(seo.ogImage);
  const safeSiteName = escapeHtml(seo.ogSiteName);

  let result = html.replace(/<title>[^<]*<\/title>/, `<title>${safeTitle}</title>`);

  result = result.replace(
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
    `<meta name="description" content="${safeDesc}">`
  );

  result = result.replace(/<meta\s+property="og:[^"]*"\s+content="[^"]*"\s*\/?>\s*\n?/g, '');
  result = result.replace(/<meta\s+name="twitter:[^"]*"\s+content="[^"]*"\s*\/?>\s*\n?/g, '');
  result = result.replace(/<meta\s+property="twitter:[^"]*"\s+content="[^"]*"\s*\/?>\s*\n?/g, '');

  const isArticlePage = seo.ogType === 'article' && !!seo.publishedTime;
  let robotsContent = seo.robots || (isArticlePage ? 'index, follow, max-image-preview:large' : 'index, follow');

  let googleNewsRobotsTag = '';
  if (isArticlePage && seo.publishedTime) {
    const pubDate = new Date(seo.publishedTime);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    if (pubDate < thirtyDaysAgo) {
      googleNewsRobotsTag = '\n  <meta name="googlebot-news" content="noindex">';
    }
    if (pubDate < oneYearAgo) {
      robotsContent = 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1, noarchive';
    }
  }

  const hreflangTags = seo.hreflangLinks
    ? seo.hreflangLinks.map(hl => `<link rel="alternate" hreflang="${escapeHtml(hl.lang)}" href="${escapeHtml(hl.href)}">`).join('\n  ')
    : '';

  const metaTags = `
  <!-- SEO Injected Meta Tags -->
  <link rel="canonical" href="${safeCanonical}">
  <meta name="robots" content="${escapeHtml(robotsContent)}">${googleNewsRobotsTag}
  ${hreflangTags}
  <meta property="og:type" content="${escapeHtml(seo.ogType)}">
  <meta property="og:url" content="${safeCanonical}">
  <meta property="og:title" content="${safeTitle}">
  <meta property="og:description" content="${safeDesc}">
  <meta property="og:image" content="${safeImage}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:site_name" content="${safeSiteName}">
  <meta property="og:locale" content="${escapeHtml(seo.ogLocale)}">
  ${seo.publishedTime ? `<meta property="article:published_time" content="${escapeHtml(seo.publishedTime)}">` : ''}
  ${seo.modifiedTime ? `<meta property="article:modified_time" content="${escapeHtml(seo.modifiedTime)}">` : ''}
  ${seo.articleSection ? `<meta property="article:section" content="${escapeHtml(seo.articleSection)}">` : ''}
  ${seo.articleTags ? seo.articleTags.map(tag => `<meta property="article:tag" content="${escapeHtml(tag)}">`).join('\n  ') : ''}
  <meta property="article:author" content="${escapeHtml(seo.articleAuthor || 'صحيفة سبق الإلكترونية')}">
  <meta property="article:publisher" content="https://www.facebook.com/sabqdotcom">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="${escapeHtml(seo.twitterSite)}">
  <meta name="twitter:title" content="${safeTitle}">
  <meta name="twitter:description" content="${safeDesc}">
  <meta name="twitter:image" content="${safeImage}">
  ${seo.jsonLd ? `<script type="application/ld+json">${JSON.stringify(seo.jsonLd).replace(/</g, '\\u003c')}</script>` : ''}
  <!-- End SEO Injected -->`;

  result = result.replace('</head>', `${metaTags}\n</head>`);

  if (seo.preloadImage) {
    const preloadTag = `<link rel="preload" as="image" href="${escapeHtml(seo.preloadImage)}" fetchpriority="high">\n`;
    result = result.replace('</head>', `${preloadTag}</head>`);
  }

  if (seo.semanticHtml) {
    result = result.replace(
      '<div id="root">',
      `<div id="root">${seo.semanticHtml}`
    );
  }

  return result;
}

async function handleArticlePage(slug: string, baseUrl: string, urlPrefix: string): Promise<SeoData | null> {
  const article = await withCache(`seo:article:${slug}`, CACHE_TTL.LONG, async () =>
    db
      .select({
        id: articles.id,
        title: articles.title,
        slug: articles.slug,
        englishSlug: articles.englishSlug,
        excerpt: articles.excerpt,
        content: articles.content,
        imageUrl: articles.imageUrl,
        aiSummary: articles.aiSummary,
        publishedAt: articles.publishedAt,
        updatedAt: articles.updatedAt,
        seo: articles.seo,
        status: articles.status,
        categoryName: categories.nameAr,
        authorId: articles.authorId,
        reporterId: articles.reporterId,
        authorFirstName: users.firstName,
        authorLastName: users.lastName,
        reporterFirstName: reporterUsers.firstName,
        reporterLastName: reporterUsers.lastName,
        reporterStaffSlug: reporterStaff.slug,
        authorStaffSlug: authorStaff.slug,
      })
      .from(articles)
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .leftJoin(users, eq(articles.authorId, users.id))
      .leftJoin(reporterUsers, eq(articles.reporterId, reporterUsers.id))
      .leftJoin(reporterStaff, eq(articles.reporterId, reporterStaff.userId))
      .leftJoin(authorStaff, eq(articles.authorId, authorStaff.userId))
      .where(or(eq(articles.slug, slug), eq(articles.englishSlug, slug)))
      .limit(1)
  );

  if (!article.length) return null;
  if (article[0].status === 'deleted') return { _gone: true } as any;

  const a = article[0];
  const seoData = (a.seo as any) || {};
  const title = a.title || seoData.metaTitle || '';
  // Priority for the shareable description that crawlers (Twitter, WhatsApp,
  // Facebook) read: explicit editorial `metaDescription` wins, then the
  // AI-generated `aiSummary` (so the smart summary appears in shares — user
  // request 2026-05-15), then the editor's `excerpt` as a last resort.
  const description = truncate(seoData.metaDescription || a.aiSummary || a.excerpt || '', 220);
  const image = ensureAbsoluteUrl(a.imageUrl || '', baseUrl, a.updatedAt || a.publishedAt);
  const canonicalSlug = a.englishSlug || a.slug;
  const canonicalUrl = `${baseUrl}/${urlPrefix}/${canonicalSlug}`;
  // Byline prefers the reporter (chosen from a dropdown in the editor) over
  // the author (staff member who entered the article). Falls back to the
  // newspaper brand when neither is available.
  const reporterName = [a.reporterFirstName, a.reporterLastName].filter(Boolean).join(' ');
  const editorName = [a.authorFirstName, a.authorLastName].filter(Boolean).join(' ');
  const authorName = reporterName || editorName || 'صحيفة سبق الإلكترونية';
  const publishedTime = a.publishedAt ? new Date(a.publishedAt).toISOString() : undefined;
  let modifiedTime = a.updatedAt ? new Date(a.updatedAt).toISOString() : publishedTime;
  if (publishedTime && modifiedTime && a.publishedAt && a.updatedAt) {
    const pubMs = new Date(a.publishedAt).getTime();
    const updMs = new Date(a.updatedAt).getTime();
    const articleAgeMs = Date.now() - pubMs;
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    if (articleAgeMs > thirtyDaysMs && (updMs - pubMs) > 7 * 24 * 60 * 60 * 1000) {
      modifiedTime = publishedTime;
    }
  }
  const keywords = seoData.keywords || [];
  const schemaExtras = buildNewsArticleSchemaExtras(a.content, image, baseUrl);
  const authorPerson = buildArticleAuthorPerson(baseUrl, {
    reporterName,
    editorName,
    reporterId: a.reporterId,
    reporterStaffSlug: a.reporterStaffSlug,
    authorId: a.authorId,
    authorStaffSlug: a.authorStaffSlug,
  });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "mainEntityOfPage": { "@type": "WebPage", "@id": canonicalUrl },
    "headline": title,
    "description": description,
    "image": schemaExtras.image,
    "datePublished": publishedTime,
    "dateModified": modifiedTime,
    "author": authorPerson,
    "publisher": {
      "@type": "NewsMediaOrganization",
      "name": "صحيفة سبق الإلكترونية",
      "logo": { "@type": "ImageObject", "url": `${baseUrl}/branding/sabq-og-image.png` }
    },
    "articleSection": a.categoryName || undefined,
    "keywords": keywords.length > 0 ? keywords : undefined,
    "speakable": schemaExtras.speakable,
    ...(schemaExtras.articleBody ? { articleBody: schemaExtras.articleBody } : {}),
    ...(schemaExtras.wordCount ? { wordCount: schemaExtras.wordCount } : {}),
  };

  const safeTitle = escapeHtml(title);
  const safeExcerpt = escapeHtml(truncate(a.excerpt || a.aiSummary || '', 300));
  // Strip <script>/<iframe>/<style>/event-handlers and javascript: hrefs from stored HTML before SSR-injecting
  const safeBody = stripUnsafeHtml(a.content || '');
  const semanticHtml = `<article style="position:absolute;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;" aria-hidden="true"><h1>${safeTitle}</h1>${publishedTime ? `<time datetime="${publishedTime}">${publishedTime}</time>` : ''}<p>${safeExcerpt}</p>${safeBody ? `<div>${safeBody}</div>` : ''}</article>`;

  const hreflangLinks: Array<{ lang: string; href: string }> = [
    { lang: 'ar', href: canonicalUrl },
    { lang: 'x-default', href: canonicalUrl },
  ];
  if (a.englishSlug) {
    hreflangLinks.push({ lang: 'en', href: `${baseUrl}/en/article/${a.englishSlug}` });
  }

  return {
    title: `${title} — سبق`,
    description,
    canonicalUrl,
    ogType: 'article',
    ogImage: image,
    ogLocale: 'ar_SA',
    ogSiteName: 'صحيفة سبق الإلكترونية',
    publishedTime,
    modifiedTime,
    articleSection: a.categoryName || undefined,
    articleTags: keywords.length > 0 ? keywords : undefined,
    articleAuthor: authorName,
    twitterSite: '@sabq',
    jsonLd,
    semanticHtml,
    preloadImage: image,
    hreflangLinks,
  };
}

async function handleEnArticlePage(slug: string, baseUrl: string): Promise<SeoData | null> {
  const article = await withCache(`seo:en-article:${slug}`, CACHE_TTL.LONG, async () =>
    db
      .select({
        id: enArticles.id,
        title: enArticles.title,
        slug: enArticles.slug,
        englishSlug: enArticles.englishSlug,
        excerpt: enArticles.excerpt,
        content: enArticles.content,
        imageUrl: enArticles.imageUrl,
        aiSummary: enArticles.aiSummary,
        publishedAt: enArticles.publishedAt,
        updatedAt: enArticles.updatedAt,
        seo: enArticles.seo,
        authorId: enArticles.authorId,
        reporterId: enArticles.reporterId,
        authorFirstName: users.firstName,
        authorLastName: users.lastName,
        reporterFirstName: reporterUsers.firstName,
        reporterLastName: reporterUsers.lastName,
        reporterStaffSlug: reporterStaff.slug,
        authorStaffSlug: authorStaff.slug,
      })
      .from(enArticles)
      .leftJoin(users, eq(enArticles.authorId, users.id))
      .leftJoin(reporterUsers, eq(enArticles.reporterId, reporterUsers.id))
      .leftJoin(reporterStaff, eq(enArticles.reporterId, reporterStaff.userId))
      .leftJoin(authorStaff, eq(enArticles.authorId, authorStaff.userId))
      .where(or(eq(enArticles.slug, slug), eq(enArticles.englishSlug, slug)))
      .limit(1)
  );

  if (!article.length) return null;

  const a = article[0];
  const seoData = (a.seo as any) || {};
  const title = a.title || seoData.metaTitle || '';
  // Priority for the shareable description that crawlers (Twitter, WhatsApp,
  // Facebook) read: explicit editorial `metaDescription` wins, then the
  // AI-generated `aiSummary` (so the smart summary appears in shares — user
  // request 2026-05-15), then the editor's `excerpt` as a last resort.
  const description = truncate(seoData.metaDescription || a.aiSummary || a.excerpt || '', 220);
  const image = ensureAbsoluteUrl(a.imageUrl || '', baseUrl, a.updatedAt || a.publishedAt);
  const articleSlug = a.englishSlug || a.slug;
  const canonicalUrl = `${baseUrl}/en/article/${articleSlug}`;
  const reporterName = [a.reporterFirstName, a.reporterLastName].filter(Boolean).join(' ');
  const editorName = [a.authorFirstName, a.authorLastName].filter(Boolean).join(' ');
  const authorName = reporterName || editorName || 'Sabq News';
  const publishedTime = a.publishedAt ? new Date(a.publishedAt).toISOString() : undefined;
  let modifiedTime = a.updatedAt ? new Date(a.updatedAt).toISOString() : publishedTime;
  if (publishedTime && modifiedTime && a.publishedAt && a.updatedAt) {
    const pubMs = new Date(a.publishedAt).getTime();
    const updMs = new Date(a.updatedAt).getTime();
    const articleAgeMs = Date.now() - pubMs;
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    if (articleAgeMs > thirtyDaysMs && (updMs - pubMs) > 7 * 24 * 60 * 60 * 1000) {
      modifiedTime = publishedTime;
    }
  }
  const keywords = seoData.keywords || [];
  const schemaExtras = buildNewsArticleSchemaExtras(a.content, image, baseUrl);
  const authorPerson = buildArticleAuthorPerson(baseUrl, {
    reporterName,
    editorName,
    reporterId: a.reporterId,
    reporterStaffSlug: a.reporterStaffSlug,
    authorId: a.authorId,
    authorStaffSlug: a.authorStaffSlug,
    lang: "en",
  });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "mainEntityOfPage": { "@type": "WebPage", "@id": canonicalUrl },
    "headline": title,
    "description": description,
    "image": schemaExtras.image,
    "datePublished": publishedTime,
    "dateModified": modifiedTime,
    "author": authorPerson,
    "publisher": {
      "@type": "NewsMediaOrganization",
      "name": "Sabq News",
      "logo": { "@type": "ImageObject", "url": `${baseUrl}/branding/sabq-og-image.png` }
    },
    "keywords": keywords.length > 0 ? keywords : undefined,
    "speakable": schemaExtras.speakable,
    ...(schemaExtras.articleBody ? { articleBody: schemaExtras.articleBody } : {}),
    ...(schemaExtras.wordCount ? { wordCount: schemaExtras.wordCount } : {}),
  };

  const safeTitle = escapeHtml(title);
  const safeExcerpt = escapeHtml(truncate(a.excerpt || a.aiSummary || '', 300));
  const semanticHtml = `<article style="position:absolute;left:-9999px;"><h1>${safeTitle}</h1>${publishedTime ? `<time datetime="${publishedTime}">${publishedTime}</time>` : ''}<p>${safeExcerpt}</p></article>`;

  const arSlug = a.englishSlug || a.slug;
  const hreflangLinks: Array<{ lang: string; href: string }> = [
    { lang: 'en', href: canonicalUrl },
  ];
  if (arSlug) {
    hreflangLinks.push(
      { lang: 'ar', href: `${baseUrl}/article/${arSlug}` },
      { lang: 'x-default', href: `${baseUrl}/article/${arSlug}` },
    );
  }

  return {
    title: `${title} — Sabq`,
    description,
    canonicalUrl,
    ogType: 'article',
    ogImage: image,
    ogLocale: 'en_US',
    ogSiteName: 'Sabq News',
    publishedTime,
    modifiedTime,
    twitterSite: '@sabq',
    jsonLd,
    semanticHtml,
    preloadImage: image,
    hreflangLinks,
  };
}

async function handleUrArticlePage(slug: string, baseUrl: string): Promise<SeoData | null> {
  const article = await withCache(`seo:ur-article:${slug}`, CACHE_TTL.LONG, async () =>
    db
      .select({
        id: urArticles.id,
        title: urArticles.title,
        slug: urArticles.slug,
        englishSlug: urArticles.englishSlug,
        excerpt: urArticles.excerpt,
        content: urArticles.content,
        imageUrl: urArticles.imageUrl,
        aiSummary: urArticles.aiSummary,
        publishedAt: urArticles.publishedAt,
        updatedAt: urArticles.updatedAt,
        seo: urArticles.seo,
        authorId: urArticles.authorId,
        reporterId: urArticles.reporterId,
        authorFirstName: users.firstName,
        authorLastName: users.lastName,
        reporterFirstName: reporterUsers.firstName,
        reporterLastName: reporterUsers.lastName,
        reporterStaffSlug: reporterStaff.slug,
        authorStaffSlug: authorStaff.slug,
      })
      .from(urArticles)
      .leftJoin(users, eq(urArticles.authorId, users.id))
      .leftJoin(reporterUsers, eq(urArticles.reporterId, reporterUsers.id))
      .leftJoin(reporterStaff, eq(urArticles.reporterId, reporterStaff.userId))
      .leftJoin(authorStaff, eq(urArticles.authorId, authorStaff.userId))
      .where(or(eq(urArticles.slug, slug), eq(urArticles.englishSlug, slug)))
      .limit(1)
  );

  if (!article.length) return null;

  const a = article[0];
  const seoData = (a.seo as any) || {};
  const title = a.title || seoData.metaTitle || '';
  // Priority for the shareable description that crawlers (Twitter, WhatsApp,
  // Facebook) read: explicit editorial `metaDescription` wins, then the
  // AI-generated `aiSummary` (so the smart summary appears in shares — user
  // request 2026-05-15), then the editor's `excerpt` as a last resort.
  const description = truncate(seoData.metaDescription || a.aiSummary || a.excerpt || '', 220);
  const image = ensureAbsoluteUrl(a.imageUrl || '', baseUrl, a.updatedAt || a.publishedAt);
  const articleSlug = a.englishSlug || a.slug;
  const canonicalUrl = `${baseUrl}/ur/article/${articleSlug}`;
  const reporterName = [a.reporterFirstName, a.reporterLastName].filter(Boolean).join(' ');
  const editorName = [a.authorFirstName, a.authorLastName].filter(Boolean).join(' ');
  const authorName = reporterName || editorName || 'سبق نیوز';
  const publishedTime = a.publishedAt ? new Date(a.publishedAt).toISOString() : undefined;
  let modifiedTime = a.updatedAt ? new Date(a.updatedAt).toISOString() : publishedTime;
  if (publishedTime && modifiedTime && a.publishedAt && a.updatedAt) {
    const pubMs = new Date(a.publishedAt).getTime();
    const updMs = new Date(a.updatedAt).getTime();
    const articleAgeMs = Date.now() - pubMs;
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    if (articleAgeMs > thirtyDaysMs && (updMs - pubMs) > 7 * 24 * 60 * 60 * 1000) {
      modifiedTime = publishedTime;
    }
  }
  const keywords = seoData.keywords || [];
  const schemaExtras = buildNewsArticleSchemaExtras(a.content, image, baseUrl);
  const authorPerson = buildArticleAuthorPerson(baseUrl, {
    reporterName,
    editorName,
    reporterId: a.reporterId,
    reporterStaffSlug: a.reporterStaffSlug,
    authorId: a.authorId,
    authorStaffSlug: a.authorStaffSlug,
  });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "mainEntityOfPage": { "@type": "WebPage", "@id": canonicalUrl },
    "headline": title,
    "description": description,
    "image": schemaExtras.image,
    "datePublished": publishedTime,
    "dateModified": modifiedTime,
    "author": authorPerson,
    "publisher": {
      "@type": "NewsMediaOrganization",
      "name": "سبق نیوز",
      "logo": { "@type": "ImageObject", "url": `${baseUrl}/branding/sabq-og-image.png` }
    },
    "keywords": keywords.length > 0 ? keywords : undefined,
    "speakable": schemaExtras.speakable,
    ...(schemaExtras.articleBody ? { articleBody: schemaExtras.articleBody } : {}),
    ...(schemaExtras.wordCount ? { wordCount: schemaExtras.wordCount } : {}),
  };

  const safeTitle = escapeHtml(title);
  const safeExcerpt = escapeHtml(truncate(a.excerpt || a.aiSummary || '', 300));
  const semanticHtml = `<article style="position:absolute;left:-9999px;"><h1>${safeTitle}</h1>${publishedTime ? `<time datetime="${publishedTime}">${publishedTime}</time>` : ''}<p>${safeExcerpt}</p></article>`;

  const arSlug = a.englishSlug || a.slug;
  const hreflangLinks: Array<{ lang: string; href: string }> = [
    { lang: 'ur', href: canonicalUrl },
  ];
  if (arSlug) {
    hreflangLinks.push(
      { lang: 'ar', href: `${baseUrl}/article/${arSlug}` },
      { lang: 'x-default', href: `${baseUrl}/article/${arSlug}` },
    );
  }

  return {
    title: `${title} — سبق`,
    description,
    canonicalUrl,
    ogType: 'article',
    ogImage: image,
    ogLocale: 'ur_PK',
    ogSiteName: 'سبق نیوز',
    publishedTime,
    modifiedTime,
    twitterSite: '@sabq',
    jsonLd,
    semanticHtml,
    preloadImage: image,
    hreflangLinks,
  };
}

async function handleCategoryPage(slug: string, baseUrl: string): Promise<SeoData | null> {
  const category = await withCache(`seo:category:${slug}`, CACHE_TTL.LONG, async () =>
    db
      .select({
        id: categories.id,
        nameAr: categories.nameAr,
        slug: categories.slug,
        englishSlug: categories.englishSlug,
        description: categories.description,
        heroImageUrl: categories.heroImageUrl,
      })
      .from(categories)
      .where(or(eq(categories.slug, slug), eq(categories.englishSlug, slug)))
      .limit(1)
  );

  if (!category.length) return null;

  const c = category[0];
  const title = `${c.nameAr} — سبق`;
  const description = c.description || `أخبار ${c.nameAr} على مدار الساعة من صحيفة سبق الإلكترونية`;
  const image = ensureAbsoluteUrl(c.heroImageUrl || '', baseUrl);
  const canonicalSlug = c.englishSlug || c.slug;
  const canonicalUrl = `${baseUrl}/category/${canonicalSlug}`;

  return {
    title,
    description,
    canonicalUrl,
    ogType: 'website',
    ogImage: image,
    ogLocale: 'ar_SA',
    ogSiteName: 'صحيفة سبق الإلكترونية',
    twitterSite: '@sabq',
  };
}

async function handleHomepage(baseUrl: string): Promise<SeoData> {
  const recentArticles = await db
    .select({
      title: articles.title,
      slug: articles.slug,
      englishSlug: articles.englishSlug,
      imageUrl: articles.imageUrl,
      publishedAt: articles.publishedAt,
    })
    .from(articles)
    .where(eq(articles.status, 'published'))
    .orderBy(desc(articles.publishedAt))
    .limit(30);

  const heroImage = recentArticles.length > 0 ? ensureAbsoluteUrl(recentArticles[0].imageUrl || '', baseUrl) : undefined;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "سبق الذكية",
    "url": baseUrl,
    "potentialAction": {
      "@type": "SearchAction",
      "target": `${baseUrl}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string"
    }
  };

  let semanticHtml = '';
  if (recentArticles.length > 0) {
    const links = recentArticles.map(a => {
      const safeTitle = escapeHtml(a.title || '');
      const href = `/article/${a.englishSlug || a.slug}`;
      return `<li><a href="${href}">${safeTitle}</a></li>`;
    }).join('');
    semanticHtml = `<nav aria-label="آخر الأخبار" style="position:absolute;left:-9999px;"><h2>آخر الأخبار</h2><ul>${links}</ul></nav>`;
  }

  return {
    title: 'سبق الذكية - صحيفة سبق الإلكترونية',
    description: 'سبق الذكية - منصة الأخبار السعودية الأولى المدعومة بالذكاء الاصطناعي. أخبار عاجلة ومحلية ورياضية وعالمية مع تلخيص تلقائي، نظام توصيات شخصي، وتغطية حصرية على مدار الساعة.',
    canonicalUrl: baseUrl,
    ogType: 'website',
    ogImage: `${baseUrl}/branding/sabq-og-image.png`,
    ogLocale: 'ar_SA',
    ogSiteName: 'صحيفة سبق الإلكترونية',
    twitterSite: '@sabq',
    jsonLd,
    semanticHtml,
    preloadImage: heroImage,
  };
}

const STATIC_INDEXABLE_PAGES: Record<string, { title: string; desc: string; locale?: string; siteName?: string }> = {
  '/categories': { title: 'التصنيفات — سبق', desc: 'استكشف تصنيفات الأخبار في صحيفة سبق الإلكترونية' },
  '/opinion': { title: 'الرأي — سبق', desc: 'مقالات الرأي والتحليل في صحيفة سبق الإلكترونية' },
  '/about': { title: 'من نحن — سبق', desc: 'تعرف على صحيفة سبق الإلكترونية ورسالتها' },
  '/privacy': { title: 'سياسة الخصوصية — سبق', desc: 'سياسة خصوصية صحيفة سبق الإلكترونية' },
  '/ar/privacy': { title: 'سياسة الخصوصية — سبق', desc: 'سياسة خصوصية صحيفة سبق الإلكترونية' },
  '/terms': { title: 'شروط الاستخدام — سبق', desc: 'شروط استخدام صحيفة سبق الإلكترونية' },
  '/ar/terms': { title: 'شروط الاستخدام — سبق', desc: 'شروط استخدام صحيفة سبق الإلكترونية' },
  '/contact': { title: 'اتصل بنا — سبق', desc: 'تواصل مع فريق صحيفة سبق الإلكترونية' },
  '/accessibility-statement': { title: 'بيان إمكانية الوصول — سبق', desc: 'بيان إمكانية الوصول في صحيفة سبق الإلكترونية' },
  '/ar/accessibility-statement': { title: 'بيان إمكانية الوصول — سبق', desc: 'بيان إمكانية الوصول في صحيفة سبق الإلكترونية' },
  '/daily-brief': { title: 'الموجز اليومي — سبق', desc: 'ملخص يومي لأهم الأحداث والأخبار من صحيفة سبق الإلكترونية' },
  '/shorts': { title: 'أخبار قصيرة — سبق', desc: 'أخبار سريعة ومختصرة من صحيفة سبق الإلكترونية' },
  '/moment-by-moment': { title: 'لحظة بلحظة — سبق', desc: 'متابعة لحظية للأحداث الجارية على صحيفة سبق الإلكترونية' },
  '/newsletters': { title: 'النشرات الإخبارية — سبق', desc: 'اشترك في نشرات سبق الإخبارية لتصلك أهم الأخبار' },
  '/audio-newsletter': { title: 'النشرة الصوتية — سبق', desc: 'استمع إلى أهم الأخبار في النشرة الصوتية من صحيفة سبق' },
  '/archive': { title: 'الأرشيف — سبق', desc: 'تصفح أرشيف الأخبار في صحيفة سبق الإلكترونية' },
  '/world-days': { title: 'الأيام العالمية — سبق', desc: 'تغطية الأيام العالمية والمناسبات على صحيفة سبق الإلكترونية' },
  '/store': { title: 'المتجر — سبق', desc: 'متجر سبق الإلكتروني' },
  '/advertise': { title: 'أعلن معنا — سبق', desc: 'فرص الإعلان على صحيفة سبق الإلكترونية' },
  '/careers': { title: 'الوظائف — سبق', desc: 'فرص العمل في صحيفة سبق الإلكترونية' },
  '/rss': { title: 'خلاصات RSS — سبق', desc: 'خلاصات RSS لأخبار صحيفة سبق الإلكترونية' },
  '/developers': { title: 'المطورون — سبق', desc: 'موارد المطورين على صحيفة سبق الإلكترونية' },
  '/api-docs': { title: 'وثائق الواجهة البرمجية — سبق', desc: 'وثائق الواجهة البرمجية لصحيفة سبق الإلكترونية' },
  '/news': { title: 'آخر الأخبار — سبق', desc: 'تصفح أحدث الأخبار العاجلة والمستجدات على صحيفة سبق الإلكترونية.' },
  '/newsletter': { title: 'النشرة الإخبارية — سبق', desc: 'اشترك في نشرة سبق الإخبارية لتصلك أهم الأخبار والمستجدات يوميًا.' },
  '/quiz': { title: 'الاختبارات — سبق', desc: 'شارك في اختبارات وألعاب سبق التفاعلية واختبر معلوماتك.' },
  '/polls': { title: 'استطلاعات الرأي — سبق', desc: 'شارك في استطلاعات الرأي على صحيفة سبق الإلكترونية وتعرّف على آراء القرّاء.' },
  '/poll': { title: 'استطلاعات الرأي — سبق', desc: 'شارك في استطلاعات الرأي على صحيفة سبق الإلكترونية وتعرّف على آراء القرّاء.' },
  '/ai': { title: 'iFox — مساعد سبق الذكي', desc: 'iFox هو مساعد سبق الذكي للأخبار والمعلومات والإجابات الفورية.' },
  '/sabq-ai': { title: 'عقل سبق — الذكاء الاصطناعي في خدمة الصحافة | سبق', desc: 'كيف طوّعت سبق الذكاء الاصطناعي في خدمة الإعلام السعودي: أول صحيفة سعودية وعربية تدمج الذكاء في كامل دورة العمل التحريري — بقرار بشري في كل مادة، ووفق ميثاق معلن من ثماني مواد.' },
  '/roshn': { title: 'دوري روشن السعودي — مباريات وترتيب وهدّافون | سبق', desc: 'تغطية حية لدوري روشن السعودي: جدول المباريات بتوقيت الرياض، ترتيب الدوري، الهدّافون، ومركز مباراة تفصيلي على صحيفة سبق.' },
  '/predictions': { title: 'مركز التوقعات — توقّع ونافس على النقاط | سبق', desc: 'توقّع نتائج مباريات دوري روشن وبطولات الخليج ونافس على جوائز النقاط المتراكمة على صحيفة سبق.' },
  '/en/news': { title: 'Latest News — Sabq', desc: 'Browse the latest breaking news and updates on Sabq News.', locale: 'en_US', siteName: 'Sabq News' },
  '/ur/news': { title: 'تازہ خبریں — سبق نیوز', desc: 'سبق نیوز پر تازہ ترین خبریں اور بریکنگ نیوز پڑھیں۔', locale: 'ur_PK', siteName: 'سبق نیوز' },
  // English mirrors
  '/en/categories': { title: 'Categories — Sabq', desc: 'Browse all news categories on Sabq', locale: 'en_US', siteName: 'Sabq News' },
  '/en/about': { title: 'About — Sabq', desc: 'Learn about Sabq News', locale: 'en_US', siteName: 'Sabq News' },
  '/en/privacy': { title: 'Privacy Policy — Sabq', desc: 'Privacy policy of Sabq News', locale: 'en_US', siteName: 'Sabq News' },
  '/en/terms': { title: 'Terms of Use — Sabq', desc: 'Terms of use for Sabq News', locale: 'en_US', siteName: 'Sabq News' },
  '/en/accessibility-statement': { title: 'Accessibility Statement — Sabq', desc: 'Accessibility statement of Sabq News', locale: 'en_US', siteName: 'Sabq News' },
  '/en/daily-brief': { title: 'Daily Brief — Sabq', desc: 'A daily roundup of the most important news from Sabq', locale: 'en_US', siteName: 'Sabq News' },
  '/en/moment-by-moment': { title: 'Moment by Moment — Sabq', desc: 'Live coverage of breaking events from Sabq News', locale: 'en_US', siteName: 'Sabq News' },
};

// Legacy section root pages that should be indexable when reached via SPA fallback.
// Only the single-segment root (e.g. /saudia) is indexable; deeper SPA paths remain noindex.
const INDEXABLE_SECTION_PREFIXES = new Map<string, { title: string; desc: string }>([
  ['saudia', { title: 'السعودية — سبق', desc: 'أخبار السعودية والمحافظات على صحيفة سبق الإلكترونية.' }],
  ['world', { title: 'العالم — سبق', desc: 'الأخبار العالمية وأهم أحداث الدول من حول العالم على صحيفة سبق الإلكترونية.' }],
  ['business', { title: 'الأعمال — سبق', desc: 'أخبار الأعمال والشركات والاقتصاد على صحيفة سبق الإلكترونية.' }],
  ['economy', { title: 'الاقتصاد — سبق', desc: 'الأخبار الاقتصادية والمالية على صحيفة سبق الإلكترونية.' }],
  ['technology', { title: 'التقنية — سبق', desc: 'أخبار التقنية والذكاء الاصطناعي والابتكار على صحيفة سبق الإلكترونية.' }],
  ['sports', { title: 'رياضة سبق — مباريات مباشرة وانتقالات وترتيب الدوريات | سبق', desc: 'بوابة سبق الرياضية: نتائج مباشرة وجدول المباريات بتوقيت الرياض، ترتيب دوري روشن وكبرى الدوريات العالمية، ومركز الانتقالات لحظة بلحظة.' }],
  ['sport', { title: 'رياضة سبق — مباريات مباشرة وانتقالات وترتيب الدوريات | سبق', desc: 'بوابة سبق الرياضية: نتائج مباشرة وجدول المباريات بتوقيت الرياض، ترتيب دوري روشن وكبرى الدوريات العالمية، ومركز الانتقالات لحظة بلحظة.' }],
  ['cars', { title: 'السيارات — سبق', desc: 'أخبار السيارات والمراجعات والأسعار على صحيفة سبق الإلكترونية.' }],
  ['tourism', { title: 'السياحة — سبق', desc: 'أخبار السياحة والوجهات والترفيه على صحيفة سبق الإلكترونية.' }],
  ['mylife', { title: 'حياتي — سبق', desc: 'أخبار الحياة والصحة والأسرة والمجتمع على صحيفة سبق الإلكترونية.' }],
  ['stations', { title: 'محطات — سبق', desc: 'تغطيات وأحداث محطات سبق على صحيفة سبق الإلكترونية.' }],
  ['media', { title: 'الإعلام — سبق', desc: 'أخبار الإعلام والمحتوى الرقمي على صحيفة سبق الإلكترونية.' }],
  ['local', { title: 'محليات — سبق', desc: 'الأخبار المحلية ومستجدات المناطق السعودية على صحيفة سبق الإلكترونية.' }],
  ['articles', { title: 'المقالات — سبق', desc: 'مقالات وتحليلات الكتّاب على صحيفة سبق الإلكترونية.' }],
]);

// Routes that should never be indexed (privacy, UI-only, auth, dashboard) live
// in `./utils/noindexPaths` so the dev-mode Cache-Control assertion in
// server/index.ts can share the exact same allow-list and never drift.

function firstSegmentOf(pathname: string): string {
  return pathname.split('/').filter(Boolean)[0]?.toLowerCase() ?? '';
}

function matchRoute(pathname: string): { type: string; slug?: string; angleSlug?: string; pathname: string } | null {
  if (pathname === '/' || pathname === '') return { type: 'homepage', pathname };
  if (pathname === '/en' || pathname === '/ar' || pathname === '/ur') return { type: 'homepage', pathname };

  // البوابة الرياضية — صفحة النادي (/sports/team/:id؛ ويُقبل المسار القديم /sports2/team
  // الذي يُحوَّل في العميل). يُفحص قبل isNoindexPath لأن المسار القديم /sports2 ضمن
  // قائمة noindex: نريد ميتا مشاركة غنية + canonical يشير للمسار المعتمد /sports/team.
  let sportsTeamMatch = pathname.match(/^\/sports2?\/team\/(\d+)$/);
  if (sportsTeamMatch) return { type: 'sports-team', slug: sportsTeamMatch[1], pathname };

  // Noindex routes — emit self-canonical + noindex,follow
  if (isNoindexPath(pathname)) return { type: 'noindex-page', pathname };

  let match = pathname.match(/^\/article\/([^/]+)$/);
  if (match) return { type: 'article', slug: match[1], pathname };

  match = pathname.match(/^\/opinion\/([^/]+)$/);
  if (match) return { type: 'opinion', slug: match[1], pathname };

  match = pathname.match(/^\/en\/article\/([^/]+)$/);
  if (match) return { type: 'en-article', slug: match[1], pathname };

  match = pathname.match(/^\/ur\/article\/([^/]+)$/);
  if (match) return { type: 'ur-article', slug: match[1], pathname };

  match = pathname.match(/^\/category\/([^/]+)$/);
  if (match) return { type: 'category', slug: match[1], pathname };

  match = pathname.match(/^\/(?:en|ur)\/category\/([^/]+)$/);
  if (match) return { type: 'category-localized', slug: match[1], pathname };

  match = pathname.match(/^\/keyword\/([^/]+)$/);
  if (match) return { type: 'keyword', slug: decodeURIComponent(match[1]), pathname };

  match = pathname.match(/^\/en\/keyword\/([^/]+)$/);
  if (match) return { type: 'keyword-en', slug: decodeURIComponent(match[1]), pathname };

  match = pathname.match(/^\/reporter\/([^/]+)$/);
  if (match) return { type: 'reporter', slug: match[1], pathname };

  match = pathname.match(/^\/en\/reporter\/([^/]+)$/);
  if (match) return { type: 'reporter-en', slug: match[1], pathname };

  // Muqtarab topic (3 segments) — must be checked before the single-segment angle route
  match = pathname.match(/^\/muqtarab\/([^/]+)\/topic\/([^/]+)$/);
  if (match) return { type: 'muqtarab-topic', angleSlug: decodeURIComponent(match[1]), slug: decodeURIComponent(match[2]), pathname };

  match = pathname.match(/^\/muqtarab\/([^/]+)$/);
  if (match) return { type: 'muqtarab', slug: decodeURIComponent(match[1]), pathname };

  match = pathname.match(/^\/omq\/([^/]+)$/);
  if (match) return { type: 'omq', slug: match[1], pathname };

  match = pathname.match(/^\/world-day\/([^/]+)$/);
  if (match) return { type: 'world-day', slug: decodeURIComponent(match[1]), pathname };

  if (pathname === '/sponsored') return { type: 'sponsored', pathname };
  if (pathname === '/gulf-live') return { type: 'gulf-live', pathname };

  if (STATIC_INDEXABLE_PAGES[pathname]) return { type: 'static-page', slug: pathname, pathname };

  const first = firstSegmentOf(pathname);
  if (first && VALID_PREFIXES.has(first)) {
    return { type: 'spa-fallback', pathname };
  }

  return null;
}

interface RouteMatch {
  type: string;
  slug?: string;
  query?: Record<string, string>;
}

async function handleSponsoredPage(baseUrl: string, mvi?: string): Promise<SeoData> {
  const canonicalUrl = mvi ? `${baseUrl}/sponsored?mvi=${mvi}` : `${baseUrl}/sponsored`;
  
  let title = 'محتوى مُموّل — سبق';
  let description = 'محتوى مُموّل على صحيفة سبق الإلكترونية';
  let ogImage = `${baseUrl}/branding/sabq-og-image.png`;
  
  if (mvi) {
    try {
      const data = await withCache(`seo:sponsored:${mvi}`, CACHE_TTL.MEDIUM, async () => {
        const response = await fetch(`https://polarcdn-terrax.com/nativeads/v1.4.0/json/creative/${mvi}`, {
          signal: AbortSignal.timeout(3000),
        });
        if (response.ok) {
          return response.json();
        }
        return null;
      });
      if (data?.experience?.title) {
        title = `${data.experience.title} — سبق`;
        description = data.experience.title;
      }
      if (data?.primaryMedia?.content?.href) {
        const imgHref = data.primaryMedia.content.href;
        ogImage = imgHref.startsWith('http') ? imgHref : `https://polarcdn-terrax.com${imgHref.startsWith('/') ? '' : '/'}${imgHref}`;
      }
    } catch (e) {
      console.warn('[SEO] Failed to fetch sponsored content for OG tags:', e);
    }
  }
  
  return {
    title,
    description,
    canonicalUrl,
    ogType: 'article',
    ogImage,
    ogLocale: 'ar_SA',
    ogSiteName: 'صحيفة سبق الإلكترونية',
    twitterSite: '@sabq',
  };
}

const GULF_COUNTRY_AR_SEO: Record<string, string> = {
  saudi_arabia: "السعودية", uae: "الإمارات", bahrain: "البحرين",
  kuwait: "الكويت", qatar: "قطر", oman: "عُمان", yemen: "اليمن",
};

function toSaudiIso(date: Date | string | null): string {
  if (!date) return new Date().toISOString();
  const d = new Date(date);
  const offset = 3 * 60;
  const local = new Date(d.getTime() + offset * 60000);
  return local.toISOString().replace('Z', '+03:00');
}

async function handleGulfLivePage(baseUrl: string): Promise<SeoData> {
  const events = await withCache(
    'seo:gulf-live-schema',
    CACHE_TTL.LONG,
    async () => {
      return db
        .select({
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

  const jsonLd = {
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
      "logo": { "@type": "ImageObject", "url": `${baseUrl}/logo.png` }
    },
    "liveBlogUpdate": events.map(event => ({
      "@type": "BlogPosting",
      "headline": (event.content || "").substring(0, 110),
      "datePublished": toSaudiIso(event.publishedAt),
      "articleBody": event.content || "",
      "locationCreated": { "@type": "Place", "name": GULF_COUNTRY_AR_SEO[event.country] || event.country },
      "author": { "@type": "Organization", "name": event.sourceName || "بيان رسمي" }
    }))
  };

  return {
    title: 'البث الحي — الاعتداءات على دول الخليج | صحيفة سبق',
    description: 'تغطية لحظية مباشرة لجميع الاعتداءات على دول الخليج العربي — اعتراض مسيّرات وصواريخ باليستية وكروز مع تحديثات فورية من المصادر الرسمية',
    canonicalUrl: `${baseUrl}/gulf-live`,
    ogType: 'website',
    ogImage: `${baseUrl}/branding/sabq-og-image.png`,
    ogLocale: 'ar_SA',
    ogSiteName: 'صحيفة سبق الإلكترونية',
    twitterSite: '@sabq',
    publishedTime: toSaudiIso(firstPublished),
    modifiedTime: toSaudiIso(lastModified),
    jsonLd,
  };
}

async function handleKeywordPage(slug: string, baseUrl: string, lang: 'ar' | 'en'): Promise<SeoData> {
  const display = slug.replace(/[-_]+/g, ' ');
  const isEn = lang === 'en';
  const title = isEn
    ? `${display} — Sabq`
    : `${display} — سبق`;
  const description = isEn
    ? `Latest news, articles, and Muqtarab topics tagged with ${display} on Sabq News.`
    : `أحدث الأخبار والمقالات ومواضيع مُقترب المتعلقة بـ ${display} على صحيفة سبق الإلكترونية.`;
  const canonicalUrl = `${baseUrl}${isEn ? '/en' : ''}/keyword/${encodeURIComponent(slug)}`;

  const hasContent = await withCache(`seo:keyword-exists:${slug}`, CACHE_TTL.MEDIUM, async () => {
    const rows = await db
      .select({ id: articles.id })
      .from(articleTags)
      .innerJoin(tags, eq(tags.id, articleTags.tagId))
      .innerJoin(articles, eq(articles.id, articleTags.articleId))
      .where(and(
        eq(tags.slug, slug),
        eq(articles.status, 'published'),
      ))
      .limit(1);
    if (rows.length > 0) return true;

    const seoRows = await db.execute(sql`
      SELECT a.id FROM articles a
      WHERE a.status = 'published'
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(a.seo -> 'keywords') AS kw
          WHERE lower(kw) = lower(${slug})
        )
      LIMIT 1
    `);
    if (((seoRows as any).rows || seoRows).length > 0) return true;

    const topicRows = await db.execute(sql`
      SELECT t.id FROM topics t
      WHERE t.status = 'published'
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(t.seo_meta -> 'keywords') AS kw
          WHERE lower(kw) = lower(${slug})
        )
      LIMIT 1
    `);
    return ((topicRows as any).rows || topicRows).length > 0;
  });

  return {
    title,
    description,
    canonicalUrl,
    ogType: 'website',
    ogImage: `${baseUrl}/branding/sabq-og-image.png`,
    ogLocale: isEn ? 'en_US' : 'ar_SA',
    ogSiteName: isEn ? 'Sabq News' : 'صحيفة سبق الإلكترونية',
    twitterSite: '@sabq',
    robots: hasContent ? undefined : 'noindex, follow',
  };
}

async function handleReporterPage(idOrSlug: string, baseUrl: string, lang: 'ar' | 'en'): Promise<SeoData> {
  const isEn = lang === 'en';
  const rows = await withCache(`seo:reporter:${lang}:${idOrSlug}`, CACHE_TTL.LONG, async () =>
    db
      .select({
        slug: staff.slug,
        userId: staff.userId,
        name: staff.name,
        nameAr: staff.nameAr,
        title: staff.title,
        titleAr: staff.titleAr,
        bio: staff.bio,
        bioAr: staff.bioAr,
        profileImage: staff.profileImage,
        userProfileImage: users.profileImageUrl,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(staff)
      .leftJoin(users, eq(staff.userId, users.id))
      .where(and(
        or(eq(staff.slug, idOrSlug), eq(staff.userId, idOrSlug)),
        eq(staff.isActive, true),
        inArray(staff.staffType, ['reporter', 'writer', 'opinion_author', 'content_creator']),
      ))
      .limit(1)
  );

  const profileSlug = rows[0]?.slug || rows[0]?.userId || idOrSlug;
  const canonicalUrl = reporterProfileUrl(baseUrl, profileSlug, lang);

  if (!rows.length) {
    return {
      title: isEn ? 'Reporter — Sabq' : 'كاتب — سبق',
      description: isEn
        ? 'Reporter profile on Sabq News.'
        : 'صفحة كاتب على صحيفة سبق الإلكترونية.',
      canonicalUrl,
      ogType: 'profile',
      ogImage: `${baseUrl}/branding/sabq-og-image.png`,
      ogLocale: isEn ? 'en_US' : 'ar_SA',
      ogSiteName: isEn ? 'Sabq News' : 'صحيفة سبق الإلكترونية',
      twitterSite: '@sabq',
      robots: 'noindex, follow',
    };
  }

  const r = rows[0];
  const fullName = (isEn ? r.name : r.nameAr)
    || [r.firstName, r.lastName].filter(Boolean).join(' ')
    || profileSlug;
  const bioText = truncate((isEn ? r.bio : r.bioAr) || '', 220);
  const description = isEn
    ? (bioText || `Articles by ${fullName} on Sabq News.`)
    : (bioText || `مقالات وأخبار الكاتب ${fullName} على صحيفة سبق الإلكترونية.`);
  const rawImage = r.profileImage || r.userProfileImage || '';
  const ogImage = rawImage
    ? ensureAbsoluteUrl(rawImage, baseUrl)
    : `${baseUrl}/branding/sabq-og-image.png`;
  const jobTitle = (isEn ? r.title : r.titleAr) || (isEn ? 'Sabq Contributor' : 'كاتب — سبق');

  const person = buildPersonJsonLd({
    name: fullName,
    url: canonicalUrl,
    image: ogImage,
    description,
    jobTitle,
    worksFor: isEn ? SABQ_ORG_EN : SABQ_ORG_AR,
  });

  return {
    title: isEn ? `${fullName} — Sabq` : `${fullName} — سبق`,
    description,
    canonicalUrl,
    ogType: 'profile',
    ogImage,
    ogLocale: isEn ? 'en_US' : 'ar_SA',
    ogSiteName: isEn ? 'Sabq News' : 'صحيفة سبق الإلكترونية',
    twitterSite: '@sabq',
    robots: 'index, follow, max-image-preview:large',
    jsonLd: buildProfilePageJsonLd({
      name: fullName,
      url: canonicalUrl,
      description,
      image: ogImage,
      person,
    }),
    preloadImage: ogImage !== `${baseUrl}/branding/sabq-og-image.png` ? ogImage : undefined,
  };
}

// صفحة الزاوية: /muqtarab/:angleSlug — تقرأ جدول angles الجديد.
async function handleMuqtarabAnglePage(slug: string, baseUrl: string): Promise<SeoData | null> {
  const rows = await withCache(`seo:muqtarab-angle:${slug}`, CACHE_TTL.LONG, async () =>
    db
      .select({
        nameAr: angles.nameAr,
        slug: angles.slug,
        shortDesc: angles.shortDesc,
        coverImageUrl: angles.coverImageUrl,
        isActive: angles.isActive,
        managerFirstName: users.firstName,
        managerLastName: users.lastName,
        managerBio: users.bio,
        managerImage: users.profileImageUrl,
        managerStaffSlug: angleManagerStaff.slug,
        managerStaffNameAr: angleManagerStaff.nameAr,
        managerStaffBioAr: angleManagerStaff.bioAr,
        managerStaffImage: angleManagerStaff.profileImage,
      })
      .from(angles)
      .leftJoin(users, eq(angles.managerUserId, users.id))
      .leftJoin(angleManagerStaff, eq(angles.managerUserId, angleManagerStaff.userId))
      .where(eq(angles.slug, slug))
      .limit(1)
  );
  if (!rows.length || !rows[0].isActive) return null;
  const ang = rows[0];
  const canonicalUrl = muqtarabAngleUrl(baseUrl, ang.slug);
  const description = truncate(
    ang.shortDesc || `زاوية ${ang.nameAr} على منصة مُقترب من صحيفة سبق الإلكترونية.`,
    220,
  );
  const { absolute: image } = await resolveMuqtarabOgImage(baseUrl, ang.coverImageUrl);

  const writerName = ang.managerStaffNameAr
    || [ang.managerFirstName, ang.managerLastName].filter(Boolean).join(' ')
    || ang.nameAr;
  const writerBio = truncate(ang.managerStaffBioAr || ang.managerBio || description, 220);
  const writerImageRaw = ang.managerStaffImage || ang.managerImage || ang.coverImageUrl || '';
  const writerImage = writerImageRaw ? ensureAbsoluteUrl(writerImageRaw, baseUrl) : image;
  const writerProfileUrl = ang.managerStaffSlug
    ? reporterProfileUrl(baseUrl, ang.managerStaffSlug, 'ar')
    : canonicalUrl;

  const person = buildPersonJsonLd({
    name: writerName,
    url: writerProfileUrl,
    image: writerImage,
    description: writerBio,
    jobTitle: `كاتب زاوية ${ang.nameAr} — مُقترب`,
    worksFor: SABQ_ORG_AR,
  });

  return {
    title: `${ang.nameAr} — مُقترب — سبق`,
    description,
    canonicalUrl,
    ogType: 'profile',
    ogImage: image,
    ogLocale: 'ar_SA',
    ogSiteName: 'صحيفة سبق الإلكترونية',
    twitterSite: '@sabq',
    robots: 'index, follow, max-image-preview:large',
    jsonLd: buildProfilePageJsonLd({
      name: `${ang.nameAr} — مُقترب`,
      url: canonicalUrl,
      description,
      image,
      person,
    }),
    preloadImage: image,
  };
}

// صفحة الموضوع: /muqtarab/:angleSlug/topic/:topicSlug — ميتا مشاركة + OG + NewsArticle.
async function handleMuqtarabTopicPage(
  angleSlug: string,
  topicSlug: string,
  baseUrl: string,
): Promise<SeoData | null> {
  const rows = await withCache(`seo:muqtarab-topic:${angleSlug}:${topicSlug}`, CACHE_TTL.LONG, async () =>
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
        writerSignature: angles.writerSignature,
      })
      .from(topics)
      .innerJoin(angles, eq(topics.angleId, angles.id))
      .where(and(eq(angles.slug, angleSlug), eq(topics.slug, topicSlug)))
      .limit(1)
  );
  if (!rows.length) return null;
  const t = rows[0];
  const canonicalUrl = `${baseUrl}/muqtarab/${encodeURIComponent(t.angleSlug)}/topic/${encodeURIComponent(t.topicSlug)}`;
  const seoMeta = (t.seoMeta as any) || {};
  const plain = (t.content as any)?.plainText as string | undefined;
  const title = seoMeta.metaTitle || t.title || '';
  const description = truncate(
    seoMeta.metaDescription || t.excerpt || plain || `${t.title} — زاوية ${t.angleNameAr} على مُقترب من صحيفة سبق الإلكترونية.`,
    220,
  );
  const { absolute: image } = await resolveMuqtarabOgImage(
    baseUrl,
    seoMeta.ogImage,
    t.heroImageUrl,
    t.angleCover,
  );
  const publishedTime = t.publishedAt ? new Date(t.publishedAt).toISOString() : undefined;
  const modifiedTime = t.updatedAt ? new Date(t.updatedAt).toISOString() : publishedTime;

  // المواضيع غير المنشورة: noindex (قد تُنشر لاحقاً) لكن نُبقي ميتا المشاركة.
  if (t.status !== 'published') {
    return {
      title: `${title} — مُقترب — سبق`,
      description,
      canonicalUrl,
      ogType: 'article',
      ogImage: image,
      ogLocale: 'ar_SA',
      ogSiteName: 'صحيفة سبق الإلكترونية',
      twitterSite: '@sabq',
      robots: 'noindex, follow',
    };
  }

  const anglePageUrl = muqtarabAngleUrl(baseUrl, t.angleSlug);
  const authorPerson = buildPersonJsonLd({
    name: t.writerSignature || t.angleNameAr,
    url: anglePageUrl,
    jobTitle: `كاتب زاوية ${t.angleNameAr} — مُقترب`,
    worksFor: SABQ_ORG_AR,
  });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "mainEntityOfPage": { "@type": "WebPage", "@id": canonicalUrl },
    "headline": title,
    "description": description,
    "image": [image],
    "datePublished": publishedTime,
    "dateModified": modifiedTime,
    "author": authorPerson,
    "publisher": {
      "@type": "NewsMediaOrganization",
      "name": "صحيفة سبق الإلكترونية",
      "logo": { "@type": "ImageObject", "url": `${baseUrl}/branding/sabq-og-image.png` },
    },
    "articleSection": t.angleNameAr || undefined,
    "keywords": seoMeta.keywords?.length ? seoMeta.keywords.join(", ") : undefined,
  };

  return {
    title: `${title} — مُقترب — سبق`,
    description,
    canonicalUrl,
    ogType: 'article',
    ogImage: image,
    articleTags: seoMeta.keywords?.length ? seoMeta.keywords : undefined,
    ogLocale: 'ar_SA',
    ogSiteName: 'صحيفة سبق الإلكترونية',
    publishedTime,
    modifiedTime,
    articleSection: t.angleNameAr || undefined,
    twitterSite: '@sabq',
    jsonLd,
    preloadImage: image,
  };
}

async function handleOmqPage(id: string, baseUrl: string): Promise<SeoData> {
  const analysis = await withCache(`seo:omq:${id}`, CACHE_TTL.LONG, async () =>
    db
      .select({
        id: deepAnalyses.id,
        title: deepAnalyses.title,
        description: deepAnalyses.description,
        executiveSummary: deepAnalyses.executiveSummary,
        status: deepAnalyses.status,
        createdAt: deepAnalyses.createdAt,
        updatedAt: deepAnalyses.updatedAt,
      })
      .from(deepAnalyses)
      .where(eq(deepAnalyses.id, id))
      .limit(1)
  );
  const canonicalUrl = `${baseUrl}/omq/${encodeURIComponent(id)}`;
  if (!analysis.length) {
    return {
      title: 'تحليل عميق — سبق',
      description: 'تحليل عميق على صحيفة سبق الإلكترونية.',
      canonicalUrl,
      ogType: 'article',
      ogImage: `${baseUrl}/branding/sabq-og-image.png`,
      ogLocale: 'ar_SA',
      ogSiteName: 'صحيفة سبق الإلكترونية',
      twitterSite: '@sabq',
      robots: 'noindex, follow',
    };
  }
  const a = analysis[0];
  if (a.status !== 'published' && a.status !== 'completed') {
    return {
      title: `${a.title} — سبق`,
      description: truncate(a.description || a.executiveSummary || '', 220),
      canonicalUrl,
      ogType: 'article',
      ogImage: `${baseUrl}/branding/sabq-og-image.png`,
      ogLocale: 'ar_SA',
      ogSiteName: 'صحيفة سبق الإلكترونية',
      twitterSite: '@sabq',
      robots: 'noindex, follow',
    };
  }
  return {
    title: `${a.title} — سبق`,
    description: truncate(a.description || a.executiveSummary || `تحليل عميق على صحيفة سبق الإلكترونية.`, 220),
    canonicalUrl,
    ogType: 'article',
    ogImage: `${baseUrl}/branding/sabq-og-image.png`,
    ogLocale: 'ar_SA',
    ogSiteName: 'صحيفة سبق الإلكترونية',
    twitterSite: '@sabq',
    publishedTime: a.createdAt ? new Date(a.createdAt).toISOString() : undefined,
    modifiedTime: a.updatedAt ? new Date(a.updatedAt).toISOString() : undefined,
  };
}

async function handleWorldDayPage(slug: string, baseUrl: string): Promise<SeoData> {
  const day = await withCache(`seo:worldday:${slug}`, CACHE_TTL.LONG, async () =>
    db
      .select({
        id: worldDays.id,
        nameAr: worldDays.nameAr,
        nameEn: worldDays.nameEn,
        description: worldDays.description,
        isActive: worldDays.isActive,
        updatedAt: worldDays.updatedAt,
      })
      .from(worldDays)
      .where(eq(worldDays.id, slug))
      .limit(1)
  );
  const canonicalUrl = `${baseUrl}/world-day/${encodeURIComponent(slug)}`;
  if (!day.length || !day[0].isActive) {
    return {
      title: 'الأيام العالمية — سبق',
      description: 'تغطية الأيام العالمية على صحيفة سبق الإلكترونية.',
      canonicalUrl,
      ogType: 'website',
      ogImage: `${baseUrl}/branding/sabq-og-image.png`,
      ogLocale: 'ar_SA',
      ogSiteName: 'صحيفة سبق الإلكترونية',
      twitterSite: '@sabq',
      robots: 'noindex, follow',
    };
  }
  const d = day[0];
  const display = d.nameAr || slug.replace(/[-_]+/g, ' ');
  return {
    title: `${display} — اليوم العالمي — سبق`,
    description: truncate(d.description || `تغطية ${display} على صحيفة سبق الإلكترونية ضمن سلسلة الأيام العالمية.`, 220),
    canonicalUrl,
    ogType: 'website',
    ogImage: `${baseUrl}/branding/sabq-og-image.png`,
    ogLocale: 'ar_SA',
    ogSiteName: 'صحيفة سبق الإلكترونية',
    twitterSite: '@sabq',
    modifiedTime: d.updatedAt ? new Date(d.updatedAt).toISOString() : undefined,
  };
}

// البوابة الرياضية — صفحة النادي (/sports/team/:id).
// ميتا غنية باسم النادي وترتيبه وملعبه، وصورة OG = صورة الملعب (بديل لوقو
// سبق) مع تدرّج احتياطي إلى شعار النادي ثم علامة سبق. صورة الملعب/الشعار
// روابط https كاملة من المزوّد فتُمرَّر كما هي.
async function handleSportsTeamPage(id: string, baseUrl: string): Promise<SeoData | null> {
  const teamId = Number(id);
  if (!Number.isFinite(teamId) || teamId <= 0) return null;
  const t = await withCache(`seo:sports-team:${teamId}`, CACHE_TTL.MEDIUM, async () =>
    getTeamSeoMeta(teamId).catch(() => null)
  );
  const canonicalUrl = `${baseUrl}/sports/team/${teamId}`;
  if (!t) return null;

  const parts: string[] = [];
  if (t.rank && t.points != null && t.competitionName) {
    parts.push(`يحتل ${t.name} المركز ${t.rank} برصيد ${t.points} نقطة في ${t.competitionName}.`);
  } else if (t.competitionName) {
    parts.push(`${t.name} يشارك في ${t.competitionName}.`);
  }
  if (t.founded) parts.push(`تأسّس عام ${t.founded}.`);
  if (t.venueName) parts.push(`ملعبه ${t.venueName}${t.venueCity ? ` بـ${t.venueCity}` : ''}.`);
  parts.push(`تابع نتائج ${t.name} ومبارياته القادمة وترتيبه وتشكيلته وهدّافيه على سبق.`);

  // بطاقة OG مولّدة 1200×630 (معتمة) بدل صور المزوّد 150×150 الشفّافة.
  const ogImage = `${baseUrl}/api/sports/og/team/${teamId}`;

  return {
    title: `${t.name} — المباريات والترتيب والتشكيلة | الرياضة - سبق`,
    description: truncate(parts.join(' '), 220),
    canonicalUrl,
    ogType: 'website',
    ogImage,
    ogLocale: 'ar_SA',
    ogSiteName: 'صحيفة سبق الإلكترونية',
    twitterSite: '@sabq',
    // القسم تجريبي → مخفيّ عن قوقل، مع إبقاء معاينة المشاركة غنية.
    robots: 'noindex, follow',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'SportsTeam',
      name: t.name,
      sport: 'Association football',
      url: canonicalUrl,
      ...(t.logo ? { logo: ensureAbsoluteUrl(t.logo, baseUrl) } : {}),
      ...(t.founded ? { foundingDate: String(t.founded) } : {}),
      ...(t.venueName
        ? {
            location: {
              '@type': 'StadiumOrArena',
              name: t.venueName,
              ...(t.venueCity
                ? { address: { '@type': 'PostalAddress', addressLocality: t.venueCity } }
                : {}),
            },
          }
        : {}),
      ...(t.competitionName
        ? { memberOf: { '@type': 'SportsOrganization', name: t.competitionName } }
        : {}),
    },
  };
}

async function handleLocalizedCategoryPage(slug: string, baseUrl: string, pathname: string): Promise<SeoData | null> {
  const isEn = pathname.startsWith('/en/');
  const display = slug.replace(/[-_]+/g, ' ');
  return {
    title: isEn ? `${display} — Sabq` : `${display} — سبق`,
    description: isEn
      ? `Latest ${display} news on Sabq News.`
      : `آخر أخبار ${display} على صحيفة سبق الإلكترونية.`,
    canonicalUrl: `${baseUrl}${pathname}`,
    ogType: 'website',
    ogImage: `${baseUrl}/branding/sabq-og-image.png`,
    ogLocale: isEn ? 'en_US' : 'ur_PK',
    ogSiteName: isEn ? 'Sabq News' : 'سبق نیوز',
    twitterSite: '@sabq',
  };
}

async function resolveSeoData(route: { type: string; slug?: string; angleSlug?: string; mvi?: string; pathname?: string }, baseUrl: string): Promise<SeoData | null> {
  switch (route.type) {
    case 'article':
      return handleArticlePage(route.slug!, baseUrl, 'article');
    case 'opinion':
      return handleArticlePage(route.slug!, baseUrl, 'opinion');
    case 'en-article':
      return handleEnArticlePage(route.slug!, baseUrl);
    case 'ur-article':
      return handleUrArticlePage(route.slug!, baseUrl);
    case 'category':
      return handleCategoryPage(route.slug!, baseUrl);
    case 'category-localized':
      return handleLocalizedCategoryPage(route.slug!, baseUrl, route.pathname!);
    case 'keyword':
      return handleKeywordPage(route.slug!, baseUrl, 'ar');
    case 'keyword-en':
      return handleKeywordPage(route.slug!, baseUrl, 'en');
    case 'reporter':
      return handleReporterPage(route.slug!, baseUrl, 'ar');
    case 'reporter-en':
      return handleReporterPage(route.slug!, baseUrl, 'en');
    case 'muqtarab':
      return handleMuqtarabAnglePage(route.slug!, baseUrl);
    case 'muqtarab-topic':
      return handleMuqtarabTopicPage(route.angleSlug!, route.slug!, baseUrl);
    case 'omq':
      return handleOmqPage(route.slug!, baseUrl);
    case 'world-day':
      return handleWorldDayPage(route.slug!, baseUrl);
    case 'sports-team':
      return handleSportsTeamPage(route.slug!, baseUrl);
    case 'homepage':
      return handleHomepage(baseUrl);
    case 'sponsored':
      return handleSponsoredPage(baseUrl, route.mvi);
    case 'gulf-live':
      return handleGulfLivePage(baseUrl);
    case 'noindex-page':
    case 'spa-fallback': {
      const pathname = route.pathname || '/';
      const isEn = pathname.startsWith('/en/') || pathname === '/en';
      const isUr = pathname.startsWith('/ur/') || pathname === '/ur';
      const segments = pathname.split('/').filter(Boolean);
      const isSectionRoot =
        route.type === 'spa-fallback' &&
        segments.length === 1 &&
        INDEXABLE_SECTION_PREFIXES.has(segments[0].toLowerCase());
      const sectionMeta = isSectionRoot ? INDEXABLE_SECTION_PREFIXES.get(segments[0].toLowerCase())! : null;
      return {
        title: sectionMeta
          ? sectionMeta.title
          : isEn ? 'Sabq News' : isUr ? 'سبق نیوز' : 'صحيفة سبق الإلكترونية',
        description: sectionMeta
          ? sectionMeta.desc
          : isEn
            ? 'Sabq News — Saudi Arabia\'s premier news platform.'
            : isUr
              ? 'سبق نیوز — سعودی عرب کا معروف خبر رساں ادارہ۔'
              : 'صحيفة سبق الإلكترونية — منصة الأخبار السعودية الأولى.',
        canonicalUrl: `${baseUrl}${pathname}`,
        ogType: 'website',
        ogImage: `${baseUrl}/branding/sabq-og-image.png`,
        ogLocale: isEn ? 'en_US' : isUr ? 'ur_PK' : 'ar_SA',
        ogSiteName: isEn ? 'Sabq News' : isUr ? 'سبق نیوز' : 'صحيفة سبق الإلكترونية',
        twitterSite: '@sabq',
        robots: isSectionRoot ? 'index, follow, max-image-preview:large' : 'noindex, follow',
      };
    }
    case 'static-page': {
      const page = STATIC_INDEXABLE_PAGES[route.slug!];
      if (!page) return null;
      const isEn = route.slug!.startsWith('/en');
      return {
        title: page.title,
        description: page.desc,
        canonicalUrl: `${baseUrl}${route.slug}`,
        ogType: 'website',
        ogImage: `${baseUrl}/branding/sabq-og-image.png`,
        ogLocale: page.locale || (isEn ? 'en_US' : 'ar_SA'),
        ogSiteName: page.siteName || (isEn ? 'Sabq News' : 'صحيفة سبق الإلكترونية'),
        twitterSite: '@sabq',
      };
    }
    default:
      return null;
  }
}

export async function seoInjectorMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const pathname = req.path;

    if (SKIP_PREFIXES.some(prefix => pathname.startsWith(prefix))) return next();
    if (FILE_EXT_REGEX.test(pathname)) return next();
    if (req.method !== 'GET') return next();

    const hasTrackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'fbclid', 'gclid', 'ref'].some(p => req.query[p]);
    const hasFilterParams = ['sort', 'filter'].some(p => req.query[p]);
    const pageNum = parseInt(req.query.page as string) || 0;
    const shouldNoindex = hasTrackingParams || hasFilterParams || pageNum > 5;

    const route = matchRoute(pathname);
    if (!route) return next();

    if (route.type === 'sponsored' && req.query.mvi) {
      (route as any).mvi = String(req.query.mvi);
    }

    const baseUrl = getBaseUrl(req);
    const seoData = await resolveSeoData(route, baseUrl);

    if (!seoData) {
      // For article-shaped routes, an unknown slug is a real 404 (the
      // article was deleted or never existed). Previously we fell through
      // to `next()` which served the SPA shell with HTTP 200 — Google
      // recorded those as Soft 404 and kept them in the index for months.
      // Returning a real 404 status here gets them removed in weeks
      // instead. This is the single biggest lever against the 57K
      // "Not found (404)" backlog in GSC (2026-05-16 audit).
      const ARTICLE_LIKE = new Set([
        "article", "opinion", "en-article", "ur-article",
        "keyword", "keyword-en", "reporter", "reporter-en",
        "muqtarab", "muqtarab-topic", "omq", "world-day", "category", "category-localized",
      ]);
      if (ARTICLE_LIKE.has(route.type)) {
        console.log(`[SEO/404] Unknown ${route.type}: ${route.slug || pathname} — returning 404`);
        try {
          const template = await getTemplate();
          const notFoundSeo: SeoData = {
            title: "الصفحة غير موجودة | سبق",
            description: "الصفحة التي تبحث عنها غير موجودة أو تم حذفها.",
            canonicalUrl: `${baseUrl}${pathname}`,
            ogType: "website",
            ogImage: `${baseUrl}/branding/sabq-og-image.png`,
            ogLocale: "ar_SA",
            ogSiteName: "صحيفة سبق الإلكترونية",
            twitterSite: "@sabq",
            robots: "noindex, follow",
          };
          const html = injectSeoIntoHtml(template, notFoundSeo);
          res.setHeader("Cache-Control", "private, no-store");
          res.status(404).type("text/html").send(html);
          return;
        } catch (err) {
          // Template load failed — degrade to minimal 404 body.
          res.setHeader("Cache-Control", "private, no-store");
          res.status(404).type("text/html").send(
            '<!DOCTYPE html><html lang="ar"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>404 — سبق</title></head><body><h1>404</h1></body></html>'
          );
          return;
        }
      }
      console.log(`[SEO] No data found for ${route.type}: ${route.slug}`);
      return next();
    }

    if ((seoData as any)._gone) {
      console.log(`[SEO/410] Deleted content: ${route.slug} - returning 410 Gone`);
      return res.status(410).send('<!DOCTYPE html><html><head><meta name="robots" content="noindex"></head><body><h1>410 Gone</h1><p>This content has been permanently removed.</p></body></html>');
    }

    if (shouldNoindex) {
      seoData.robots = 'noindex, follow';
    }

    const isProduction = process.env.NODE_ENV === 'production';

    if (isProduction) {
      const template = await getTemplate();
      let html = injectSeoIntoHtml(template, seoData);

      if (route.type === 'homepage') {
        try {
          const { swrCache } = await import("./memoryCache");
          const cacheKey = 'homepage-lite';
          const cached = swrCache.get<any>(cacheKey);
          if (cached.data) {
            const safeJson = JSON.stringify(cached.data).replace(/</g, '\\u003c');
            const inlineScript = `<script>window.__HOMEPAGE_DATA__=${safeJson};</script>`;
            html = html.replace('</head>', `${inlineScript}\n</head>`);
          }
        } catch (e) {
        }
      }

      console.log(`[SEO] Injected meta tags for ${route.type}: ${route.slug || '/'}`);

      // Tag every <script> with the per-request CSP nonce so the strict
      // Report-Only policy reflects reality (and so a future enforced policy
      // can drop 'unsafe-inline'). Report-only never blocks, so this is safe.
      const cspNonce = (res as any).locals?.cspNonce;
      if (cspNonce) {
        html = html.replace(/<script(?![^>]*\bnonce=)/gi, `<script nonce="${cspNonce}"`);
      }

      const isNoindex = (seoData.robots || '').toLowerCase().includes('noindex');
      const headers: Record<string, string> = {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': isNoindex
          ? 'private, no-store'
          : 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
      };

      if (seoData.publishedTime) {
        const pubAge = Date.now() - new Date(seoData.publishedTime).getTime();
        if (pubAge > 365 * 24 * 60 * 60 * 1000) {
          headers['X-Robots-Tag'] = 'max-snippet:-1, noarchive';
        }
      }

      res.status(200).set(headers).send(html);
    } else {
      const isNoindex = (seoData.robots || '').toLowerCase().includes('noindex');
      if (isNoindex) {
        res.setHeader('Cache-Control', 'private, no-store');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
      }

      if (seoData.publishedTime) {
        const pubAge = Date.now() - new Date(seoData.publishedTime).getTime();
        if (pubAge > 365 * 24 * 60 * 60 * 1000) {
          res.set('X-Robots-Tag', 'max-snippet:-1, noarchive');
        }
      }

      const origEnd = res.end.bind(res);

      (res as any).end = function(chunk: any, encoding?: any, cb?: any): Response {
        const body = typeof chunk === 'string'
          ? chunk
          : (Buffer.isBuffer(chunk) ? chunk.toString('utf-8') : '');

        if (body && body.includes('<title>') && body.includes('<div id="root">')) {
          const injected = injectSeoIntoHtml(body, seoData!);
          console.log(`[SEO:dev] Injected meta tags for ${route.type}: ${route.slug || '/'}`);
          return origEnd(injected, 'utf-8', cb);
        }

        return origEnd(chunk, encoding, cb);
      };

      next();
    }
  } catch (error) {
    console.error('[SEO] Error in SEO injector middleware:', error);
    next();
  }
}
