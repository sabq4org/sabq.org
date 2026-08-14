// ============================================================
// SELECT HELPERS - API Payload Optimization
// ============================================================
// This file contains helper functions that define which fields
// should be returned for different API endpoints to minimize
// payload size and improve performance.
// ============================================================

import { articles, categories, users } from "@shared/schema";
import { toCdnUrl } from "./objectStorage";

// ============================================================
// IMAGE URL TRANSFORMATION
// ============================================================

/**
 * Transform GCS image URLs to CDN URLs for better performance
 * This converts storage.googleapis.com URLs to sabq.org/cdn-img/
 * for Cloudflare Polish optimization and edge caching.
 */
export function transformArticleImageUrls<T extends { imageUrl?: string | null; thumbnailUrl?: string | null }>(article: T): T {
  if (!article) return article;
  
  return {
    ...article,
    imageUrl: article.imageUrl ? toCdnUrl(article.imageUrl) : article.imageUrl,
    thumbnailUrl: article.thumbnailUrl ? toCdnUrl(article.thumbnailUrl) : article.thumbnailUrl,
  };
}

/**
 * Transform image URLs for an array of articles
 */
export function transformArticlesImageUrls<T extends { imageUrl?: string | null; thumbnailUrl?: string | null }>(articles: T[]): T[] {
  return articles.map(transformArticleImageUrls);
}

// ============================================================
// ARTICLE SELECT HELPERS
// ============================================================

/**
 * Minimal article fields for card/list display
 * Used in: homepage, category pages, search results
 * Excludes: content, seo, credibility data
 */
export const articleCardSelect = {
  id: articles.id,
  title: articles.title,
  subtitle: articles.subtitle,
  slug: articles.slug,
  excerpt: articles.excerpt,
  imageUrl: articles.imageUrl,
  thumbnailUrl: articles.thumbnailUrl,
  imageFocalPoint: articles.imageFocalPoint,
  categoryId: articles.categoryId,
  authorId: articles.authorId,
  reporterId: articles.reporterId,
  articleType: articles.articleType,
  newsType: articles.newsType,
  status: articles.status,
  hideFromHomepage: articles.hideFromHomepage,
  aiSummary: articles.aiSummary,
  aiGenerated: articles.aiGenerated,
  isFeatured: articles.isFeatured,
  isReading: articles.isReading,
  views: articles.views,
  publishedAt: articles.publishedAt,
  createdAt: articles.createdAt,
  updatedAt: articles.updatedAt,
} as const;

export const articleListSelect = {
  id: articles.id,
  title: articles.title,
  subtitle: articles.subtitle,
  slug: articles.slug,
  excerpt: articles.excerpt,
  imageUrl: articles.imageUrl,
  imageFocalPoint: articles.imageFocalPoint,
  thumbnailUrl: articles.thumbnailUrl,
  infographicBannerUrl: articles.infographicBannerUrl,
  categoryId: articles.categoryId,
  authorId: articles.authorId,
  reporterId: articles.reporterId,
  articleType: articles.articleType,
  newsType: articles.newsType,
  publishType: articles.publishType,
  scheduledAt: articles.scheduledAt,
  status: articles.status,
  reviewStatus: articles.reviewStatus,
  reviewedBy: articles.reviewedBy,
  reviewedAt: articles.reviewedAt,
  // Editorial note from rejection / archive / needs_revision actions.
  // Surfaced in the dashboard's "archived" tab so staff can see why a
  // piece was archived without opening it.
  reviewNotes: articles.reviewNotes,
  hideFromHomepage: articles.hideFromHomepage,
  aiSummary: articles.aiSummary,
  aiGenerated: articles.aiGenerated,
  isFeatured: articles.isFeatured,
  isReading: articles.isReading,
  views: articles.views,
  displayOrder: articles.displayOrder,
  seo: articles.seo,
  credibilityScore: articles.credibilityScore,
  source: articles.source,
  sourceUrl: articles.sourceUrl,
  isAiGeneratedImage: articles.isAiGeneratedImage,
  isAiGeneratedThumbnail: articles.isAiGeneratedThumbnail,
  aiImageModel: articles.aiImageModel,
  isPublisherContent: articles.isPublisherContent,
  publisherStatus: articles.publisherStatus,
  isPublisherNews: articles.isPublisherNews,
  publisherId: articles.publisherId,
  publishedAt: articles.publishedAt,
  createdAt: articles.createdAt,
  updatedAt: articles.updatedAt,
} as const;

/**
 * Full article fields for detail page
 * Used in: article detail page
 * Includes: everything except sensitive review data
 */
export const articleDetailSelect = {
  id: articles.id,
  title: articles.title,
  subtitle: articles.subtitle,
  slug: articles.slug,
  content: articles.content,
  excerpt: articles.excerpt,
  imageUrl: articles.imageUrl,
  imageFocalPoint: articles.imageFocalPoint,
  categoryId: articles.categoryId,
  authorId: articles.authorId,
  reporterId: articles.reporterId,
  articleType: articles.articleType,
  newsType: articles.newsType,
  status: articles.status,
  aiSummary: articles.aiSummary,
  aiGenerated: articles.aiGenerated,
  isFeatured: articles.isFeatured,
  isReading: articles.isReading,
  views: articles.views,
  seo: articles.seo,
  credibilityScore: articles.credibilityScore,
  credibilityAnalysis: articles.credibilityAnalysis,
  publishedAt: articles.publishedAt,
  createdAt: articles.createdAt,
  updatedAt: articles.updatedAt,
} as const;

/**
 * Admin article fields
 * Used in: dashboard article list
 * Includes: all fields for management
 */
export const articleAdminSelect = {
  id: articles.id,
  title: articles.title,
  subtitle: articles.subtitle,
  slug: articles.slug,
  excerpt: articles.excerpt,
  imageUrl: articles.imageUrl,
  thumbnailUrl: articles.thumbnailUrl,
  imageFocalPoint: articles.imageFocalPoint,
  categoryId: articles.categoryId,
  authorId: articles.authorId,
  reporterId: articles.reporterId,
  articleType: articles.articleType,
  newsType: articles.newsType,
  publishType: articles.publishType,
  scheduledAt: articles.scheduledAt,
  status: articles.status,
  reviewStatus: articles.reviewStatus,
  reviewedBy: articles.reviewedBy,
  reviewedAt: articles.reviewedAt,
  // Editorial note from rejection / archive / needs_revision actions.
  // Surfaced in the dashboard's "archived" tab so staff can see why a
  // piece was archived without opening it.
  reviewNotes: articles.reviewNotes,
  hideFromHomepage: articles.hideFromHomepage,
  aiGenerated: articles.aiGenerated,
  isFeatured: articles.isFeatured,
  isReading: articles.isReading,
  views: articles.views,
  displayOrder: articles.displayOrder,
  source: articles.source,
  sourceUrl: articles.sourceUrl,
  isAiGeneratedImage: articles.isAiGeneratedImage,
  isAiGeneratedThumbnail: articles.isAiGeneratedThumbnail,
  aiImageModel: articles.aiImageModel,
  isPublisherContent: articles.isPublisherContent,
  publisherStatus: articles.publisherStatus,
  isPublisherNews: articles.isPublisherNews,
  publisherId: articles.publisherId,
  albumImages: articles.albumImages,
  publishedAt: articles.publishedAt,
  createdAt: articles.createdAt,
  updatedAt: articles.updatedAt,
} as const;

// ============================================================
// CATEGORY SELECT HELPERS
// ============================================================

/**
 * Basic category fields
 * Used in: navigation, filters, dropdowns
 */
export const categoryBasicSelect = {
  id: categories.id,
  nameAr: categories.nameAr,
  nameEn: categories.nameEn,
  slug: categories.slug,
  type: categories.type,
  icon: categories.icon,
  displayOrder: categories.displayOrder,
  status: categories.status,
} as const;

/**
 * Full category fields
 * Used in: category detail pages, admin
 */
export const categoryFullSelect = {
  id: categories.id,
  nameAr: categories.nameAr,
  nameEn: categories.nameEn,
  slug: categories.slug,
  type: categories.type,
  icon: categories.icon,
  description: categories.description,
  heroImageUrl: categories.heroImageUrl,
  displayOrder: categories.displayOrder,
  status: categories.status,
  features: categories.features,
  createdAt: categories.createdAt,
  updatedAt: categories.updatedAt,
} as const;

// ============================================================
// USER SELECT HELPERS
// ============================================================

/**
 * Public user fields for article author display
 * Used in: article cards, author bylines
 * Excludes: email, sensitive data
 */
export const userPublicSelect = {
  id: users.id,
  firstName: users.firstName,
  lastName: users.lastName,
  profileImageUrl: users.profileImageUrl,
  bio: users.bio,
} as const;

/**
 * Byline fields for a joined author/reporter, bound to a table or alias.
 *
 * SECURITY: a bare `db.select()` over a join that includes `users` returns the
 * WHOLE row — `passwordHash`, `twoFactorSecret`, `twoFactorBackupCodes`,
 * `phoneNumber`, `fcmToken`. Public article endpoints serialize that object
 * straight to the client, so every join against `users` on a public surface
 * must project through this helper. Takes the table so it also works for
 * `aliasedTable(users, 'reporter')`.
 *
 * Excludes email deliberately: it is staff PII and was never needed for a
 * byline — callers fall back to a generic label when no name is set.
 */
export function userBylineSelect(t: typeof users) {
  return {
    id: t.id,
    firstName: t.firstName,
    lastName: t.lastName,
    firstNameEn: t.firstNameEn,
    lastNameEn: t.lastNameEn,
    profileImageUrl: t.profileImageUrl,
    bio: t.bio,
  } as const;
}

/**
 * Basic user fields with email
 * Used in: admin lists, user management
 */
export const userBasicSelect = {
  id: users.id,
  firstName: users.firstName,
  lastName: users.lastName,
  email: users.email,
  profileImageUrl: users.profileImageUrl,
  createdAt: users.createdAt,
} as const;

/**
 * Full user profile fields
 * Used in: profile pages, user detail
 */
export const userProfileSelect = {
  id: users.id,
  firstName: users.firstName,
  lastName: users.lastName,
  email: users.email,
  profileImageUrl: users.profileImageUrl,
  bio: users.bio,
  createdAt: users.createdAt,
} as const;

// ============================================================
// COMPOSITE SELECT HELPERS
// ============================================================

/**
 * Combined select for article with category and author
 * Used in: most article list endpoints
 */
export const articleWithDetailsSelect = {
  article: articleCardSelect,
  category: categoryBasicSelect,
  author: userPublicSelect,
  reporter: userPublicSelect,
} as const;

/**
 * Combined select for full article details
 * Used in: article detail page
 */
export const articleFullDetailsSelect = {
  article: articleDetailSelect,
  category: categoryFullSelect,
  author: userProfileSelect,
  reporter: userProfileSelect,
} as const;
