import { desc, eq } from "drizzle-orm";
import { articleEvents, articleRevisions, enArticleEvents, enArticleRevisions } from "@shared/schema";
import { db } from "../db";

// Track editorial fields only; counters and timestamps are not content revisions.
const FIELDS = ["title", "subtitle", "excerpt", "content", "categoryId", "imageUrl", "imageFocalPoint", "albumImages", "thumbnailUrl", "isVideoTemplate", "videoUrl", "videoThumbnailUrl", "isAiGeneratedImage", "status", "newsType", "articleType", "seo", "seoMetadata", "source", "sourceMetadata", "keywords", "riskLabel", "scheduledAt", "publishedAt", "resurfacedAt", "hideFromHomepage", "isFeatured", "isBreaking", "isReading", "displayOrder", "publishType", "reviewStatus", "reviewNotes", "reviewerVerdict", "authorId", "reporterId", "sourceUrl", "infographicType", "infographicBannerUrl", "imageCaption", "imageCaptionHtml", "imageAltText", "tagIds"] as const;
export interface BotEditorAuditInput {
  language: "ar" | "en";
  articleId: string;
  actorId: string | null;
  operation: string;
  originalSource: unknown;
  before: object;
  after: object;
  updateReason?: string | null;
  pushId?: string;
  /** Defaults to the product name already stored on the existing editor routes. */
  actorName?: string;
}

export function botEditorChanges(before: object, after: object) {
  const old = before as Record<string, unknown>;
  const next = after as Record<string, unknown>;
  const changedFields: string[] = [];
  const previousValues: Record<string, unknown> = {};
  for (const field of FIELDS) {
    if (JSON.stringify(old[field] ?? null) !== JSON.stringify(next[field] ?? null)) {
      changedFields.push(field);
      previousValues[field] = old[field] ?? null;
    }
  }
  return { changedFields, previousValues };
}

/** Must be called inside the same transaction as the article mutation. */
export async function recordBotEditorAudit(tx: Pick<typeof db, "insert">, input: BotEditorAuditInput) {
  const { changedFields, previousValues } = botEditorChanges(input.before, input.after);
  const reason = input.updateReason?.trim() || null;
  const actorName = input.actorName?.trim() || "نشر سبق";
  const originalSource = input.originalSource ?? (input.language === "en" ? "manual" : null);
  const eventType = ({ created: "created", published: "published", archive: "archived", unpublish: "unpublished", restore: "restored" } as Record<string, string>)[input.operation] ?? "updated";
  const event = {
    articleId: input.articleId, actorId: input.actorId, eventType,
    summary: `${actorName}: ${input.operation}${reason ? ` — ${reason}` : ""}`,
    metadata: { actorName, operation: input.operation, originalSource, changedFields, updateReason: reason, ...(input.pushId ? { pushId: input.pushId } : {}) },
  };
  const revision = { articleId: input.articleId, editorUserId: input.actorId, editorName: actorName, changedFields, previousValues: input.pushId ? { ...previousValues, pushId: input.pushId } : previousValues, updateReason: reason, originalSource: typeof originalSource === "string" ? originalSource : null };
  if (input.language === "ar") {
    await tx.insert(articleEvents).values(event);
    await tx.insert(articleRevisions).values(revision);
  } else {
    await tx.insert(enArticleEvents).values(event);
    await tx.insert(enArticleRevisions).values(revision);
  }
}
