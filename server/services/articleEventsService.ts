import { db } from '../db';
import { articleEvents, users } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';

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
