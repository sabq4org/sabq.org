import { db } from '../db';
import { articleEvents, users } from '@shared/schema';
import { and, asc, desc, eq } from 'drizzle-orm';

interface LogArticleEventParams {
  articleId: string;
  eventType: 'created' | 'updated' | 'published' | 'unpublished' | 'deleted' | 'restored' | 'approved' | 'rejected';
  actorId?: string | null;
  summary: string;
  metadata?: Record<string, any>;
}

export async function logArticleEvent(params: LogArticleEventParams) {
  return db.insert(articleEvents).values({
    articleId: params.articleId,
    eventType: params.eventType,
    actorId: params.actorId || null,
    summary: params.summary,
    metadata: params.metadata || {},
  }).returning();
}

export async function getArticleEvents(articleId: string) {
  return db.select().from(articleEvents)
    .where(eq(articleEvents.articleId, articleId))
    .orderBy(desc(articleEvents.createdAt));
}

export async function getArticleEventsWithActor(articleId: string) {
  return db
    .select({
      id: articleEvents.id,
      articleId: articleEvents.articleId,
      eventType: articleEvents.eventType,
      actorId: articleEvents.actorId,
      summary: articleEvents.summary,
      metadata: articleEvents.metadata,
      createdAt: articleEvents.createdAt,
      actorFirstName: users.firstName,
      actorLastName: users.lastName,
      actorAvatarUrl: users.profileImageUrl,
    })
    .from(articleEvents)
    .leftJoin(users, eq(articleEvents.actorId, users.id))
    .where(eq(articleEvents.articleId, articleId))
    .orderBy(desc(articleEvents.createdAt));
}

/**
 * Returns the authenticated user who actually created the article row.
 *
 * This is the safe provenance fallback for legacy articles created before
 * `articles.submitter_id` was populated. It deliberately does not guess from
 * `author_id`: for opinion pieces that field is the public byline and may have
 * been selected by an editor who created the material on the writer's behalf.
 */
export async function getOriginalArticleSubmitterId(articleId: string): Promise<string | null> {
  const [creationEvent] = await db
    .select({ actorId: articleEvents.actorId })
    .from(articleEvents)
    .where(and(
      eq(articleEvents.articleId, articleId),
      eq(articleEvents.eventType, 'created'),
    ))
    .orderBy(asc(articleEvents.createdAt))
    .limit(1);

  return creationEvent?.actorId ?? null;
}
