import OpenAI from 'openai';
import { db } from './db';
import { contentVectors, articles, articleTags, tags } from '@shared/schema';
import { eq } from 'drizzle-orm';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ============================================
// Constants
// ============================================

/**
 * Embedding dimensions for OpenAI text-embedding-3-large model
 * Used consistently across all vector operations
 */
export const EMBEDDING_DIMENSIONS = 1536;

// ============================================
// Embedding Generation
// ============================================

/**
 * Generate embedding vector for text using OpenAI text-embedding-3-large
 * Supports Arabic and returns 1536-dimensional vector
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-large',
      input: text,
      dimensions: EMBEDDING_DIMENSIONS,
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw new Error('Failed to generate embedding');
  }
}

/**
 * Generate embedding for an article (title + excerpt)
 */
export async function generateArticleEmbedding(articleId: string): Promise<{
  embedding: number[];
  tags: string[];
  entities: string[];
}> {
  // Fetch article with tags
  const article = await db.query.articles.findFirst({
    where: eq(articles.id, articleId),
    with: {
      articleTags: {
        with: {
          tag: true,
        },
      },
    },
  });

  if (!article) {
    throw new Error(`Article not found: ${articleId}`);
  }

  // Combine title and excerpt for embedding
  const textToEmbed = `${article.title}\n${article.excerpt || article.aiSummary || ''}`;
  
  // Generate embedding
  const embedding = await generateEmbedding(textToEmbed);

  // Extract tag slugs
  const tagSlugs = article.articleTags?.map((at: any) => at.tag.slug) || [];

  // Extract entities from article content
  const entities = await extractEntities(article.title, article.content);

  return {
    embedding,
    tags: tagSlugs,
    entities,
  };
}

/**
 * Extract named entities from Arabic text using GPT-4
 * Returns people, places, organizations mentioned in the text
 */
export async function extractEntities(title: string, content: string): Promise<string[]> {
  try {
    const prompt = `حلل النص التالي واستخرج الكيانات المذكورة (أشخاص، أماكن، مؤسسات، أندية، شركات).
أرجع قائمة مفصولة بفواصل فقط، بدون شرح.

العنوان: ${title}

النص: ${content.substring(0, 1000)}

الكيانات:`;

    const response = await openai.chat.completions.create({
      model: 'gpt-5.1', // Faster and cheaper for entity extraction
      messages: [
        {
          role: 'system',
          content: 'أنت مساعد متخصص في استخراج الكيانات من النصوص العربية. ارجع قائمة مفصولة بفواصل فقط.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_completion_tokens: 200,
    });

    const entitiesText = response.choices[0]?.message?.content?.trim() || '';
    const entities = entitiesText
      .split(/[،,]/)
      .map(e => e.trim())
      .filter(e => e.length > 0)
      .slice(0, 20); // Limit to 20 entities

    return entities;
  } catch (error) {
    console.error('Error extracting entities:', error);
    return []; // Return empty array on error
  }
}

// ============================================
// Similarity Calculations
// ============================================

/**
 * Calculate cosine similarity between two vectors
 * Returns value between 0 and 1 (1 = identical, 0 = completely different)
 * Handles vectors of different lengths by padding with zeros (graceful degradation for migration)
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  // Handle length mismatch gracefully (for backward compatibility during migration)
  let vecA = a;
  let vecB = b;
  
  if (a.length !== b.length) {
    const maxLen = Math.max(a.length, b.length);
    vecA = a.length < maxLen ? [...a, ...new Array(maxLen - a.length).fill(0)] : a;
    vecB = b.length < maxLen ? [...b, ...new Array(maxLen - b.length).fill(0)] : b;
    
    // Log warning for monitoring
    console.warn(`[EMBEDDINGS] Vector length mismatch: ${a.length} vs ${b.length}, padded to ${maxLen}`);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
}

/**
 * Calculate Jaccard similarity between two arrays
 * Returns value between 0 and 1 (1 = identical sets, 0 = no overlap)
 */
export function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) {
    return 1;
  }

  if (a.length === 0 || b.length === 0) {
    return 0;
  }

  const setA = new Set(a);
  const setB = new Set(b);

  const intersection = new Set(Array.from(setA).filter(x => setB.has(x)));
  const union = new Set(Array.from(setA).concat(Array.from(setB)));

  return intersection.size / union.size;
}

// ============================================
// Content Vectorization
// ============================================

/**
 * Generate and store content vector for an article
 * This should be called when an article is published
 */
export async function vectorizeArticle(articleId: string): Promise<void> {
  console.log(`📊 [VECTORIZATION] Starting vectorization for article: ${articleId}`);

  try {
    const article = await db.query.articles.findFirst({
      where: eq(articles.id, articleId),
    });

    if (!article) {
      throw new Error(`Article not found: ${articleId}`);
    }

    // Generate embedding and extract metadata
    const { embedding, tags, entities } = await generateArticleEmbedding(articleId);

    // Check if vector already exists
    const existing = await db.query.contentVectors.findFirst({
      where: eq(contentVectors.articleId, articleId),
    });

    if (existing) {
      // Update existing vector
      await db.update(contentVectors)
        .set({
          title: article.title,
          excerpt: article.excerpt || article.aiSummary || '',
          tags,
          entities,
          embedding,
          embeddingModel: 'text-embedding-3-large',
          publishedAt: article.publishedAt || new Date(),
          updatedAt: new Date(),
        })
        .where(eq(contentVectors.articleId, articleId));

      console.log(`✅ [VECTORIZATION] Updated vector for article: ${article.title}`);
    } else {
      // Insert new vector
      await db.insert(contentVectors).values({
        articleId,
        title: article.title,
        excerpt: article.excerpt || article.aiSummary || '',
        tags,
        entities,
        embedding,
        embeddingModel: 'text-embedding-3-large',
        publishedAt: article.publishedAt || new Date(),
      });

      console.log(`✅ [VECTORIZATION] Created vector for article: ${article.title}`);
    }
  } catch (error) {
    console.error(`❌ [VECTORIZATION] Error vectorizing article ${articleId}:`, error);
    throw error;
  }
}

/**
 * Batch vectorize multiple articles
 * Useful for initial setup or re-vectorization
 */
export async function batchVectorizeArticles(articleIds: string[]): Promise<void> {
  console.log(`📊 [BATCH VECTORIZATION] Starting batch vectorization for ${articleIds.length} articles`);

  for (const articleId of articleIds) {
    try {
      await vectorizeArticle(articleId);
      // Add small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`❌ [BATCH VECTORIZATION] Failed to vectorize article ${articleId}:`, error);
      // Continue with next article
    }
  }

  console.log(`✅ [BATCH VECTORIZATION] Completed batch vectorization`);
}
