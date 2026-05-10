import { db } from './db';
import { 
  contentVectors, 
  userEvents, 
  userAffinities,
  articles,
  userInterests,
  reactions,
  bookmarks,
  readingHistory,
  userFollowedTerms,
  tags
} from '@shared/schema';
import { eq, desc, and, sql, inArray } from 'drizzle-orm';
import { cosineSimilarity, jaccardSimilarity, EMBEDDING_DIMENSIONS } from './embeddingsService';

// ============================================
// User Profile Building
// ============================================

/**
 * Build user embedding profile from their interaction history
 * Returns weighted average of embeddings from articles they interacted with
 */
export async function buildUserProfileEmbedding(userId: string): Promise<{
  embedding: number[];
  topTags: string[];
  topEntities: string[];
}> {
  // Get user's recent interactions (last 100 articles)
  // Weight: like=3, save=2, read=1, share=4, comment=3
  const interactions = await db
    .select({
      articleId: userEvents.articleId,
      eventType: userEvents.eventType,
      eventValue: userEvents.eventValue,
    })
    .from(userEvents)
    .where(eq(userEvents.userId, userId))
    .orderBy(desc(userEvents.createdAt))
    .limit(100);

  if (interactions.length === 0) {
    // No interactions yet - return empty profile
    return {
      embedding: new Array(EMBEDDING_DIMENSIONS).fill(0),
      topTags: [],
      topEntities: [],
    };
  }

  // Get vectors for these articles
  const articleIds = interactions.map(i => i.articleId);
  const vectors = await db
    .select()
    .from(contentVectors)
    .where(inArray(contentVectors.articleId, articleIds));

  if (vectors.length === 0) {
    return {
      embedding: new Array(EMBEDDING_DIMENSIONS).fill(0),
      topTags: [],
      topEntities: [],
    };
  }

  // Create map of articleId -> weight
  const weightMap = new Map<string, number>();
  interactions.forEach(i => {
    weightMap.set(i.articleId, i.eventValue);
  });

  // Calculate weighted average embedding
  const embedding = new Array(EMBEDDING_DIMENSIONS).fill(0);
  let totalWeight = 0;

  const allTags: string[] = [];
  const allEntities: string[] = [];

  vectors.forEach(vector => {
    const weight = weightMap.get(vector.articleId) || 1;
    totalWeight += weight;

    if (vector.embedding && Array.isArray(vector.embedding)) {
      // Add weighted embedding
      (vector.embedding as number[]).forEach((val, idx) => {
        embedding[idx] += val * weight;
      });

      // Collect tags and entities
      allTags.push(...(vector.tags || []));
      allEntities.push(...(vector.entities || []));
    }
  });

  // Normalize by total weight
  if (totalWeight > 0) {
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] /= totalWeight;
    }
  }

  // Get top tags and entities by frequency
  let topTags = getTopItems(allTags, 10);
  const topEntities = getTopItems(allEntities, 10);

  // ENHANCEMENT: Include followed keywords in topTags
  // This ensures recommended articles match user's explicit interests
  const followedKeywords = await db
    .select({
      tagName: tags.nameAr,
    })
    .from(userFollowedTerms)
    .innerJoin(tags, eq(userFollowedTerms.tagId, tags.id))
    .where(eq(userFollowedTerms.userId, userId));

  // Add followed keywords to topTags (with higher priority)
  const followedTagNames = followedKeywords.map(k => k.tagName);
  const uniqueTags = Array.from(new Set([...followedTagNames, ...topTags]));
  topTags = uniqueTags.slice(0, 15);

  return {
    embedding,
    topTags,
    topEntities,
  };
}

/**
 * Helper function to get top N most frequent items
 */
function getTopItems(items: string[], n: number): string[] {
  const frequency = new Map<string, number>();
  
  items.forEach(item => {
    frequency.set(item, (frequency.get(item) || 0) + 1);
  });

  return Array.from(frequency.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([item]) => item);
}

// ============================================
// Content Scoring
// ============================================

export interface ScoredArticle {
  articleId: string;
  title: string;
  score: number;
  reasons: {
    cosineSimilarity: number;
    tagOverlap: number;
    entityOverlap: number;
    freshnessBoost: number;
    categoryMatch: boolean;
  };
}

/**
 * Score a content item against user profile
 * Formula: 0.5*cosine + 0.2*tagOverlap + 0.2*entityOverlap + 0.1*freshness
 */
export function scoreContent(
  userProfile: { embedding: number[]; topTags: string[]; topEntities: string[] },
  contentVector: {
    embedding: number[] | null;
    tags: string[];
    entities: string[];
    publishedAt: Date;
    title: string;
    articleId: string;
  }
): ScoredArticle {
  // Cosine similarity (0.5 weight)
  let cosine = 0;
  if (contentVector.embedding && Array.isArray(contentVector.embedding)) {
    cosine = cosineSimilarity(userProfile.embedding, contentVector.embedding as number[]);
  }

  // Tag overlap (0.2 weight)
  const tagOverlap = jaccardSimilarity(userProfile.topTags, contentVector.tags);

  // Entity overlap (0.2 weight)
  const entityOverlap = jaccardSimilarity(userProfile.topEntities, contentVector.entities);

  // Freshness boost (0.1 weight)
  const ageHours = (Date.now() - new Date(contentVector.publishedAt).getTime()) / (1000 * 60 * 60);
  const freshBoost = 1 / Math.log2(Math.max(ageHours, 1) + 1);

  // Final score
  const score = 0.5 * cosine + 0.2 * tagOverlap + 0.2 * entityOverlap + 0.1 * freshBoost;

  return {
    articleId: contentVector.articleId,
    title: contentVector.title,
    score,
    reasons: {
      cosineSimilarity: cosine,
      tagOverlap,
      entityOverlap,
      freshnessBoost: freshBoost,
      categoryMatch: false, // Will be filled by caller if needed
    },
  };
}

/**
 * Find similar articles to a given article
 * Useful for "Because You Liked" recommendations
 */
export async function findSimilarArticles(
  referenceArticleId: string,
  limit: number = 10,
  excludeArticleIds: string[] = []
): Promise<ScoredArticle[]> {
  // Get reference article vector
  const refVector = await db.query.contentVectors.findFirst({
    where: eq(contentVectors.articleId, referenceArticleId),
  });

  if (!refVector || !refVector.embedding || !Array.isArray(refVector.embedding)) {
    return [];
  }

  // Get all other article vectors (published in last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Join with articles table to filter only published articles
  const candidateVectors = await db
    .select({
      articleId: contentVectors.articleId,
      embedding: contentVectors.embedding,
      tags: contentVectors.tags,
      entities: contentVectors.entities,
      title: contentVectors.title,
      publishedAt: contentVectors.publishedAt,
    })
    .from(contentVectors)
    .innerJoin(articles, eq(contentVectors.articleId, articles.id))
    .where(
      and(
        eq(articles.status, 'published'), // Only published articles
        sql`${contentVectors.publishedAt} > ${thirtyDaysAgo}`,
        sql`${contentVectors.articleId} != ${referenceArticleId}`
      )
    )
    .limit(200); // Limit for performance

  // Score each candidate
  const scored: ScoredArticle[] = [];

  for (const candidate of candidateVectors) {
    if (excludeArticleIds.includes(candidate.articleId)) {
      continue;
    }

    if (!candidate.embedding || !Array.isArray(candidate.embedding)) {
      continue;
    }

    // Calculate cosine similarity
    const cosine = cosineSimilarity(
      refVector.embedding as number[],
      candidate.embedding as number[]
    );

    // Tag overlap
    const tagOverlap = jaccardSimilarity(refVector.tags, candidate.tags);

    // Entity overlap
    const entityOverlap = jaccardSimilarity(refVector.entities, candidate.entities);

    // Freshness
    const ageHours = (Date.now() - new Date(candidate.publishedAt).getTime()) / (1000 * 60 * 60);
    const freshBoost = 1 / Math.log2(Math.max(ageHours, 1) + 1);

    const score = 0.5 * cosine + 0.2 * tagOverlap + 0.2 * entityOverlap + 0.1 * freshBoost;

    scored.push({
      articleId: candidate.articleId,
      title: candidate.title,
      score,
      reasons: {
        cosineSimilarity: cosine,
        tagOverlap,
        entityOverlap,
        freshnessBoost: freshBoost,
        categoryMatch: false,
      },
    });
  }

  // Sort by score and return top N
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Get personalized recommendations for a user
 * Returns articles that match user's profile
 */
export async function getPersonalizedRecommendations(
  userId: string,
  limit: number = 10,
  excludeArticleIds: string[] = []
): Promise<ScoredArticle[]> {
  // Build user profile
  const userProfile = await buildUserProfileEmbedding(userId);

  // If no interactions yet, return trending articles
  if (userProfile.topTags.length === 0) {
    return getTrendingArticles(limit, excludeArticleIds);
  }

  // Get candidate articles (published in last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Join with articles table to filter only published articles
  const candidates = await db
    .select({
      articleId: contentVectors.articleId,
      embedding: contentVectors.embedding,
      tags: contentVectors.tags,
      entities: contentVectors.entities,
      title: contentVectors.title,
      publishedAt: contentVectors.publishedAt,
    })
    .from(contentVectors)
    .innerJoin(articles, eq(contentVectors.articleId, articles.id))
    .where(
      and(
        eq(articles.status, 'published'), // Only published articles
        sql`${contentVectors.publishedAt} > ${sevenDaysAgo}`
      )
    )
    .limit(100);

  // Score each candidate
  const scored = candidates
    .filter(c => !excludeArticleIds.includes(c.articleId))
    .filter(c => c.embedding && Array.isArray(c.embedding))
    .map(c => scoreContent(userProfile, c as any));

  // Sort by score and return top N
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Get trending articles (fallback when no user history)
 */
export async function getTrendingArticles(
  limit: number = 10,
  excludeArticleIds: string[] = []
): Promise<any[]> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const trending = await db
    .select({
      id: articles.id,
      title: articles.title,
      views: articles.views,
      publishedAt: articles.publishedAt,
      slug: articles.slug,
      englishSlug: articles.englishSlug,
      imageUrl: articles.imageUrl,
      thumbnailUrl: articles.thumbnailUrl,
      infographicBannerUrl: articles.infographicBannerUrl,
      imageFocalPoint: articles.imageFocalPoint,
      excerpt: articles.excerpt,
      articleType: articles.articleType,
      categoryId: articles.categoryId,
    })
    .from(articles)
    .where(
      and(
        eq(articles.status, 'published'),
        sql`${articles.publishedAt} > ${sevenDaysAgo}`
      )
    )
    .orderBy(desc(articles.views))
    .limit(limit + excludeArticleIds.length);

  // Fetch categories for the articles
  const categoryIds = Array.from(new Set(trending.map(a => a.categoryId).filter((id): id is string => id !== null)));
  let categoryMap: Record<string, { id: string; nameAr: string }> = {};
  
  if (categoryIds.length > 0) {
    const { categories } = await import('@shared/schema');
    const cats = await db
      .select({ id: categories.id, nameAr: categories.nameAr })
      .from(categories)
      .where(sql`${categories.id} IN ${categoryIds}`);
    categoryMap = Object.fromEntries(cats.map(c => [c.id, c]));
  }

  return trending
    .filter(a => !excludeArticleIds.includes(a.id))
    .slice(0, limit)
    .map(a => ({
      id: a.id,
      title: a.title,
      slug: a.slug,
      englishSlug: a.englishSlug,
      imageUrl: a.imageUrl,
      thumbnailUrl: a.thumbnailUrl,
      infographicBannerUrl: a.infographicBannerUrl,
      imageFocalPoint: a.imageFocalPoint,
      excerpt: a.excerpt,
      articleType: a.articleType,
      views: a.views,
      publishedAt: a.publishedAt,
      category: a.categoryId ? categoryMap[a.categoryId] || null : null,
    }));
}
