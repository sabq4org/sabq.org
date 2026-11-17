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

// Older JSON coordinates can contain numeric strings. A malformed coordinate
// invalidates only its vector, so other candidates can still be recommended.
function decodedCoordinates(embedding: ReturnType<typeof sql>) {
  // Decode as numeric first. Corrupt extreme values must never overflow the
  // float8 dot product or squared norm and fail the entire recommendation list.
  return sql`(
    SELECT idx, CASE WHEN abs(n) < 1e-140 THEN 0::float8
                     WHEN abs(n) <= 1e140 THEN n::float8 END AS x
    FROM (
      SELECT idx, CASE jsonb_typeof(value)
        WHEN 'number' THEN value::numeric
        WHEN 'null' THEN 0
        WHEN 'boolean' THEN CASE WHEN value = 'true'::jsonb THEN 1 ELSE 0 END
        WHEN 'string' THEN CASE WHEN trim(value #>> '{}') = '' THEN 0
          WHEN pg_input_is_valid(value #>> '{}', 'numeric') THEN (value #>> '{}')::numeric END
      END AS n
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(${embedding}) = 'array' THEN ${embedding} END)
        WITH ORDINALITY AS coordinate(value, idx)
      OFFSET 0
    ) parsed
    OFFSET 0
  ) decoded`;
}

// Jaccard similarity counts each label once and gives two empty sets a score of one.
function setOverlap(column: 'tags' | 'entities') {
  const field = sql.identifier(column);
  return sql`(SELECT coalesce(count(*) FILTER (WHERE in_reference AND in_candidate)::float8
      / nullif(count(*), 0), 1)
    FROM (
      SELECT label, bool_or(source = 1) AS in_reference, bool_or(source = 2) AS in_candidate
      FROM (SELECT unnest(r.${field}) AS label, 1 AS source
            UNION ALL SELECT unnest(c.${field}), 2) labels
      GROUP BY label
    ) membership)`;
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
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Preserve the original candidate cap before exclusions and the stable order
  // for equal scores. Keep the large JSON embeddings inside Postgres.
  const excluded = excludeArticleIds.length
    ? sql`AND c.article_id NOT IN (${sql.join(excludeArticleIds.map(id => sql`${id}`), sql`, `)})`
    : sql``;
  const result = await db.execute<{
    article_id: string; title: string; cosine: number; tag_overlap: number;
    entity_overlap: number; freshness: number; score: number;
  }>(sql`
    WITH ref AS MATERIALIZED (
      SELECT v.tags, v.entities,
        ARRAY(SELECT x FROM ${decodedCoordinates(sql`v.embedding`)}) AS coords
      FROM content_vectors v
      WHERE article_id = ${referenceArticleId} AND jsonb_typeof(embedding) = 'array'
    ), candidates AS (
      SELECT v.article_id, v.title, v.tags, v.entities, v.published_at, v.embedding
      FROM content_vectors v JOIN articles a ON a.id = v.article_id
      WHERE a.status = 'published' AND v.published_at > ${thirtyDaysAgo.toISOString()}::timestamp
        AND v.article_id <> ${referenceArticleId}
      LIMIT 200
    ), reference_norm AS MATERIALIZED (
      SELECT ref.*, sqrt((SELECT sum(x*x) FROM unnest(coords) x)) AS norm FROM ref
      WHERE array_position(coords, NULL) IS NULL
    ), factors AS MATERIALIZED (
      SELECT c.article_id, c.title, row_number() OVER () AS position,
        coalesce(products.dot / nullif(r.norm * sqrt(products.norm_sq), 0), 0) AS cosine,
        ${setOverlap('tags')} AS tag_overlap, ${setOverlap('entities')} AS entity_overlap,
        1 / (ln(greatest(extract(epoch FROM (${now.toISOString()}::timestamp - c.published_at))::float8 / 3600, 1) + 1) / ln(2::float8)) AS freshness
      FROM reference_norm r CROSS JOIN candidates c
      CROSS JOIN LATERAL (
        SELECT sum(x * r.coords[idx]) AS dot, sum(x*x) AS norm_sq
        FROM ${decodedCoordinates(sql`c.embedding`)}
        HAVING count(*) = count(x)
      ) products
      WHERE jsonb_typeof(c.embedding) = 'array' ${excluded}
    )
    SELECT *, 0.5*cosine + 0.2*tag_overlap + 0.2*entity_overlap + 0.1*freshness AS score
    FROM factors ORDER BY score DESC, position LIMIT ${limit}
  `);
  return result.rows.map(row => ({
    articleId: row.article_id,
    title: row.title,
    score: row.score,
    reasons: {
      cosineSimilarity: row.cosine,
      tagOverlap: row.tag_overlap,
      entityOverlap: row.entity_overlap,
      freshnessBoost: row.freshness,
      categoryMatch: false,
    },
  }));
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
