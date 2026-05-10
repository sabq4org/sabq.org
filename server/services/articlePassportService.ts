import { db } from "../db";
import {
  articles,
  enArticles,
  urArticles,
  categories,
  enCategories,
  urCategories,
  users,
  publishers,
  articleEvents,
  articleSeoHistory,
  aiImageGenerations,
  auditLogs,
} from "@shared/schema";
import { and, desc, eq, inArray, or } from "drizzle-orm";

// Detects UUID v4-shaped strings so /article/:slug/passport routes can fall back
// to ID lookup when the slug param is actually a UUID (mirrors /api/articles/:slug).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PassportLanguage = "ar" | "en" | "ur";

const STAFF_ROLES = new Set([
  "system_admin",
  "admin",
  "editor",
  "moderator",
  "journalist",
  "publisher",
]);

export function isStaffRole(role: string | null | undefined): boolean {
  if (!role) return false;
  return STAFF_ROLES.has(role);
}

export interface PassportPerson {
  id: string;
  firstName: string | null;
  lastName: string | null;
  firstNameEn: string | null;
  lastNameEn: string | null;
  profileImageUrl: string | null;
  role: string | null;
}

export interface PassportPublisher {
  id: string;
  agencyName: string;
  agencyNameEn: string | null;
  logoUrl: string | null;
}

export type PassportEventSource = "article_events" | "audit_log" | "synthetic";

export interface PassportTimelineEvent {
  id: string;
  eventType: string;
  summary: string | null;
  createdAt: Date | string;
  actor: PassportPerson | null;
  source: PassportEventSource;
  /** Sensitive change details, populated only for staff viewers */
  details: Record<string, unknown> | null;
}

export interface AiImageGenerationSummary {
  id: string;
  /** AI prompt — only included for staff viewers, null otherwise */
  prompt: string | null;
  model: string;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  aspectRatio: string | null;
  enableSearchGrounding: boolean | null;
  createdAt: Date | string;
}

export interface SeoHistorySummary {
  id: string;
  version: number;
  provider: string;
  model: string;
  status: string | null;
  manualOverride: boolean | null;
  generatedBy: string | null;
  generatedByName: string | null;
  createdAt: Date | string;
}

export type BodyAiTier = "human" | "assisted" | "ai_drafted";
export type TrustBadgeTier =
  | "human_edited"
  | "ai_assisted"
  | "ai_drafted_human_reviewed";

export type InboundChannel =
  | "manual"
  | "email"
  | "whatsapp"
  | "publisher"
  | "external";

export interface AiPercentageBreakdown {
  body: number; // 0 / 50 / 100
  cover: number; // 0 / 100
  seo: number; // 0 / 50 / 100
  /** Weighted average across the three surfaces */
  total: number;
}

export interface AiExplanation {
  ar: string;
  en: string;
  ur: string;
}

export interface SourceInfo {
  channel: InboundChannel;
  rawSource: string | null;
  sourceUrl: string | null;
  /** Public-safe metadata (sender identifier, original-message presence) */
  inbound: {
    from: string | null;
    hasOriginalMessage: boolean;
    type: string | null;
  } | null;
  /** Additional URLs discovered in `sourceMetadata` (excluding `sourceUrl`) */
  additionalLinks: string[];
}

interface SeoMetadataShape {
  status?: string;
  version?: number;
  generatedAt?: string;
  generatedBy?: string;
  provider?: string;
  model?: string;
  manualOverride?: boolean;
  overrideBy?: string;
  overrideReason?: string;
}

interface SourceMetadataShape {
  type?: "email" | "whatsapp" | "manual";
  from?: string;
  token?: string;
  originalMessage?: string;
  webhookLogId?: string;
}

function asSeoMetadata(value: unknown): SeoMetadataShape {
  if (!value || typeof value !== "object") return {};
  return value as SeoMetadataShape;
}

function asSourceMetadata(value: unknown): SourceMetadataShape | null {
  if (!value || typeof value !== "object") return null;
  return value as SourceMetadataShape;
}

export interface PassportResponse {
  language: PassportLanguage;
  viewer: { isStaff: boolean };
  article: {
    id: string;
    title: string;
    subtitle: string | null;
    slug: string;
    excerpt: string | null;
    imageUrl: string | null;
    articleType: string;
    status: string;
    publishedAt: Date | string | null;
    createdAt: Date | string;
    updatedAt: Date | string;
    category: { id: string; name: string; slug: string } | null;
    credibilityScore: number | null;
    verifiedAt: Date | string | null;
    isPublisherNews: boolean;
    canonicalUrl: string | null;
  };
  source: SourceInfo;
  people: {
    author: PassportPerson | null;
    submitter: PassportPerson | null;
    reporter: PassportPerson | null;
    reviewer: PassportPerson | null;
    verifier: PassportPerson | null;
    publisherApprover: PassportPerson | null;
  };
  publisher: PassportPublisher | null;
  aiFootprint: {
    body: {
      tier: BodyAiTier;
      aiGenerated: boolean;
      hasSummary: boolean;
      hasBullets: boolean;
      /** Number of AI-edit audit-log entries detected for this article */
      aiEditCount: number;
    };
    cover: {
      isAiGenerated: boolean;
      model: string | null;
      /** Prompt — null for non-staff viewers */
      prompt: string | null;
    };
    seo: {
      status: string | null;
      version: number | null;
      provider: string | null;
      model: string | null;
      generatedBy: string | null;
      manualOverride: boolean | null;
      generatedAt: string | null;
    };
    percentages: AiPercentageBreakdown;
    explanation: AiExplanation;
  };
  trustBadge: {
    tier: TrustBadgeTier;
    label: { ar: string; en: string; ur: string };
    credibilityScore: number | null;
  };
  aiImageGenerations: AiImageGenerationSummary[];
  seoHistoryLatest: SeoHistorySummary | null;
  timeline: PassportTimelineEvent[];
}

const TRUST_LABELS: Record<TrustBadgeTier, { ar: string; en: string; ur: string }> = {
  human_edited: {
    ar: "تحرير بشري",
    en: "Human-edited",
    ur: "انسانی ترتیب",
  },
  ai_assisted: {
    ar: "بمساعدة الذكاء الاصطناعي",
    en: "AI-assisted",
    ur: "AI کی مدد سے",
  },
  ai_drafted_human_reviewed: {
    ar: "مسودة بالذكاء الاصطناعي بمراجعة بشرية",
    en: "AI-drafted, human-reviewed",
    ur: "AI کا مسودہ، انسانی جائزہ",
  },
};

function computeBodyAiTier(params: {
  aiGenerated: boolean | null | undefined;
  aiSummary: string | null | undefined;
  aiBullets: string[] | null | undefined;
  aiEditCount?: number;
}): BodyAiTier {
  if (params.aiGenerated) return "ai_drafted";
  const hasSummary = !!(params.aiSummary && params.aiSummary.trim().length > 0);
  const hasBullets = Array.isArray(params.aiBullets) && params.aiBullets.length > 0;
  const hasAiEdits = (params.aiEditCount ?? 0) > 0;
  if (hasSummary || hasBullets || hasAiEdits) return "ai_assisted";
  return "human";
}

/**
 * Return the count of audit-log entries that represent AI-driven edits to the
 * article (e.g. SEO regeneration, summary/title rewrite, smart classification).
 */
async function fetchAiEditCount(articleId: string): Promise<number> {
  const rows = await db
    .select({ action: auditLogs.action })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.entityType, "article"),
        eq(auditLogs.entityId, articleId),
      ),
    )
    .limit(200);
  const AI_EDIT_PATTERN =
    /^(ai[_-]|generate|enhance|smart[_-]|rewrite|translate|summari|auto[_-]|seo[_-]|calendar_ai)/i;
  return rows.filter((r) => AI_EDIT_PATTERN.test(r.action)).length;
}

const URL_PATTERN = /^https?:\/\/[^\s]+$/i;

/** Extract any URL-shaped string values from arbitrary jsonb metadata. */
function extractAdditionalLinks(
  metadata: unknown,
  excludeUrl: string | null | undefined,
): string[] {
  const out = new Set<string>();
  const walk = (val: unknown) => {
    if (!val) return;
    if (typeof val === "string") {
      const s = val.trim();
      if (URL_PATTERN.test(s)) out.add(s);
      return;
    }
    if (Array.isArray(val)) {
      for (const item of val) walk(item);
      return;
    }
    if (typeof val === "object") {
      for (const v of Object.values(val as Record<string, unknown>)) walk(v);
    }
  };
  walk(metadata);
  if (excludeUrl) out.delete(excludeUrl);
  return Array.from(out).slice(0, 10);
}

function tierToBadge(tier: BodyAiTier): TrustBadgeTier {
  if (tier === "ai_drafted") return "ai_drafted_human_reviewed";
  if (tier === "ai_assisted") return "ai_assisted";
  return "human_edited";
}

function bodyTierPct(tier: BodyAiTier): number {
  if (tier === "ai_drafted") return 100;
  if (tier === "ai_assisted") return 50;
  return 0;
}

function seoPct(seo: SeoMetadataShape | null): number {
  if (!seo) return 0;
  if (seo.manualOverride) return 50; // human took over
  if (seo.provider || seo.model || seo.status === "generated" || seo.status === "approved") return 100;
  return 0;
}

function buildExplanation(opts: {
  bodyTier: BodyAiTier;
  coverIsAi: boolean;
  seoPctVal: number;
}): AiExplanation {
  const { bodyTier, coverIsAi, seoPctVal } = opts;
  const bodyAr = bodyTier === "human" ? "كُتب بشريًا"
    : bodyTier === "ai_assisted" ? "ساعد الذكاء الاصطناعي في الملخص"
    : "تمت صياغته بالذكاء الاصطناعي ثم روجع بشريًا";
  const coverAr = coverIsAi ? "الصورة الرئيسية مُولَّدة بالذكاء الاصطناعي" : "الصورة الرئيسية من مصدر بشري";
  const seoAr = seoPctVal === 100 ? "تم توليد بيانات الـSEO بالذكاء الاصطناعي"
    : seoPctVal === 50 ? "تم توليد بيانات الـSEO ثم تعديلها يدويًا"
    : "بيانات الـSEO يدوية";

  const bodyEn = bodyTier === "human" ? "Written by a human"
    : bodyTier === "ai_assisted" ? "AI helped with the summary"
    : "AI-drafted then human-reviewed";
  const coverEn = coverIsAi ? "Cover image generated by AI" : "Cover image from a human source";
  const seoEn = seoPctVal === 100 ? "SEO metadata generated by AI"
    : seoPctVal === 50 ? "AI-generated SEO with manual edits"
    : "Manual SEO metadata";

  const bodyUr = bodyTier === "human" ? "انسان نے تحریر کیا"
    : bodyTier === "ai_assisted" ? "خلاصے میں AI کی مدد لی گئی"
    : "AI کا مسودہ، پھر انسانی جائزہ";
  const coverUr = coverIsAi ? "سرورق تصویر AI سے بنی" : "سرورق تصویر انسانی ماخذ سے";
  const seoUr = seoPctVal === 100 ? "SEO ڈیٹا AI سے تیار"
    : seoPctVal === 50 ? "AI کا SEO، دستی ترامیم کے ساتھ"
    : "دستی SEO ڈیٹا";

  return {
    ar: [bodyAr, coverAr, seoAr].join(" · "),
    en: [bodyEn, coverEn, seoEn].join(" · "),
    ur: [bodyUr, coverUr, seoUr].join(" · "),
  };
}

function deriveInboundChannel(opts: {
  source: string | null | undefined;
  publisherId: string | null | undefined;
  sourceUrl: string | null | undefined;
}): InboundChannel {
  if (opts.publisherId) return "publisher";
  const s = (opts.source || "").toLowerCase();
  if (s === "email") return "email";
  if (s === "whatsapp") return "whatsapp";
  if (s === "manual") return "manual";
  if (opts.sourceUrl) return "external";
  return "manual";
}

async function fetchPeople(ids: Array<string | null | undefined>): Promise<Map<string, PassportPerson>> {
  const unique = Array.from(new Set(ids.filter((x): x is string => !!x)));
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      firstNameEn: users.firstNameEn,
      lastNameEn: users.lastNameEn,
      profileImageUrl: users.profileImageUrl,
      role: users.role,
    })
    .from(users)
    .where(inArray(users.id, unique));
  const map = new Map<string, PassportPerson>();
  for (const r of rows) map.set(r.id, r);
  return map;
}

function buildSyntheticTimeline(
  article: {
    id: string;
    createdAt: Date | string | null;
    publishedAt: Date | string | null;
    updatedAt: Date | string | null;
  },
  people: {
    author: PassportPerson | null;
    submitter: PassportPerson | null;
    verifier: PassportPerson | null;
    reviewer: PassportPerson | null;
    reporter: PassportPerson | null;
  },
  verifiedAt: Date | string | null,
  reviewedAt: Date | string | null,
): PassportTimelineEvent[] {
  const out: PassportTimelineEvent[] = [];
  if (article.createdAt) {
    out.push({
      id: `synthetic-created-${article.id}`,
      eventType: "created",
      summary: null,
      createdAt: article.createdAt,
      actor: people.reporter || people.submitter || people.author,
      source: "synthetic",
      details: null,
    });
  }
  if (reviewedAt && people.reviewer) {
    out.push({
      id: `synthetic-reviewed-${article.id}`,
      eventType: "approved",
      summary: null,
      createdAt: reviewedAt,
      actor: people.reviewer,
      source: "synthetic",
      details: null,
    });
  }
  if (verifiedAt && people.verifier) {
    out.push({
      id: `synthetic-verified-${article.id}`,
      eventType: "verified",
      summary: null,
      createdAt: verifiedAt,
      actor: people.verifier,
      source: "synthetic",
      details: null,
    });
  }
  if (article.publishedAt) {
    out.push({
      id: `synthetic-published-${article.id}`,
      eventType: "published",
      summary: null,
      createdAt: article.publishedAt,
      actor: people.reporter || people.author,
      source: "synthetic",
      details: null,
    });
  }
  // Track "last edited" if updatedAt is materially after publishedAt/createdAt
  const refMs = article.publishedAt
    ? new Date(article.publishedAt as string).getTime()
    : article.createdAt
      ? new Date(article.createdAt as string).getTime()
      : 0;
  const updMs = article.updatedAt ? new Date(article.updatedAt as string).getTime() : 0;
  if (article.updatedAt && updMs - refMs > 60_000) {
    out.push({
      id: `synthetic-updated-${article.id}`,
      eventType: "updated",
      summary: null,
      createdAt: article.updatedAt,
      actor: people.reporter || people.author,
      source: "synthetic",
      details: null,
    });
  }
  return out.sort((a, b) => {
    const da = new Date(a.createdAt as string).getTime();
    const dbb = new Date(b.createdAt as string).getTime();
    return dbb - da;
  });
}

async function fetchAuditEvents(
  articleId: string,
  viewerIsStaff: boolean,
): Promise<PassportTimelineEvent[]> {
  const rows = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      timestamp: auditLogs.timestamp,
      userId: auditLogs.userId,
      changes: auditLogs.changes,
    })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.entityType, "article"),
        eq(auditLogs.entityId, articleId),
      ),
    )
    .orderBy(desc(auditLogs.timestamp))
    .limit(50);

  const actorIds = rows.map((r) => r.userId).filter((x): x is string => !!x);
  const actors = await fetchPeople(actorIds);

  const PUBLIC_ACTIONS = new Set([
    "create",
    "update",
    "approve",
    "reject",
    "publish",
    "verify",
    "unpublish",
  ]);

  return rows
    .filter((r) => PUBLIC_ACTIONS.has(r.action))
    .map((r) => ({
      id: `audit-${r.id}`,
      eventType: r.action,
      summary: null,
      createdAt: r.timestamp,
      actor: r.userId ? actors.get(r.userId) || null : null,
      source: "audit_log" as const,
      details: viewerIsStaff && r.changes ? (r.changes as Record<string, unknown>) : null,
    }));
}

async function fetchSeoHistoryLatest(
  articleId: string,
  language: PassportLanguage,
): Promise<SeoHistorySummary | null> {
  const rows = await db
    .select()
    .from(articleSeoHistory)
    .where(
      and(
        eq(articleSeoHistory.articleId, articleId),
        eq(articleSeoHistory.language, language),
      ),
    )
    .orderBy(desc(articleSeoHistory.version))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  let generatedByName: string | null = null;
  if (row.generatedBy) {
    const [u] = await db
      .select({ firstName: users.firstName, lastName: users.lastName })
      .from(users)
      .where(eq(users.id, row.generatedBy))
      .limit(1);
    if (u) {
      generatedByName = [u.firstName, u.lastName].filter(Boolean).join(" ") || null;
    }
  }

  const meta = asSeoMetadata(row.seoMetadata);
  return {
    id: row.id,
    version: row.version,
    provider: row.provider,
    model: row.model,
    status: meta.status ?? null,
    manualOverride: meta.manualOverride ?? null,
    generatedBy: row.generatedBy,
    generatedByName,
    createdAt: row.createdAt,
  };
}

/**
 * Normalize many event-type aliases (e.g. "create"/"created", "publish"/"published")
 * into a canonical milestone key for de-duplication.
 */
function milestoneKey(eventType: string): string | null {
  const t = eventType.toLowerCase();
  if (t === "create" || t === "created") return "created";
  if (t === "publish" || t === "published") return "published";
  if (t === "update" || t === "updated" || t === "edited") return "updated";
  if (t === "verify" || t === "verified") return "verified";
  if (t === "approve" || t === "approved") return "approved";
  if (t === "reject" || t === "rejected") return "rejected";
  if (t === "unpublish" || t === "unpublished") return "unpublished";
  return null;
}

/**
 * Merge real (article_events + audit_log) events with synthetic milestones,
 * always preserving the four required milestones (created/published/updated/verified)
 * even when partial real events exist. Real events win over synthetic for
 * the same milestone+actor pair.
 */
function mergeAndSortTimelines(
  realLists: PassportTimelineEvent[][],
  synthetic: PassportTimelineEvent[],
): PassportTimelineEvent[] {
  const seen = new Set<string>();
  const merged: PassportTimelineEvent[] = [];
  const realMilestones = new Set<string>();

  for (const list of realLists) {
    for (const ev of list) {
      if (seen.has(ev.id)) continue;
      seen.add(ev.id);
      merged.push(ev);
      const m = milestoneKey(ev.eventType);
      if (m) realMilestones.add(m);
    }
  }
  // Always include synthetic milestones that aren't already covered
  for (const ev of synthetic) {
    if (seen.has(ev.id)) continue;
    const m = milestoneKey(ev.eventType);
    if (m && realMilestones.has(m)) continue;
    seen.add(ev.id);
    merged.push(ev);
  }
  merged.sort((a, b) => {
    const da = new Date(a.createdAt as string).getTime();
    const db2 = new Date(b.createdAt as string).getTime();
    return db2 - da;
  });
  return merged.slice(0, 100);
}

export async function buildArabicPassport(
  slug: string,
  viewerIsStaff: boolean = false,
): Promise<PassportResponse | null> {
  // Resolve the article by slug, english_slug (short code), or UUID id —
  // mirrors the /api/articles/:slug fallback so passport links work for any
  // identifier the public article URL accepts.
  const matcher = UUID_RE.test(slug)
    ? or(eq(articles.slug, slug), eq(articles.englishSlug, slug), eq(articles.id, slug))
    : or(eq(articles.slug, slug), eq(articles.englishSlug, slug));
  const [art] = await db
    .select()
    .from(articles)
    .where(matcher)
    .limit(1);
  if (!art) return null;
  if (art.status !== "published") return null;

  const peopleIds = [
    art.authorId,
    art.submitterId,
    art.reporterId,
    art.reviewedBy,
    art.verifiedBy,
    art.publisherApprovedBy,
  ];
  const peopleMap = await fetchPeople(peopleIds);

  const author = art.authorId ? peopleMap.get(art.authorId) || null : null;
  const submitter = art.submitterId ? peopleMap.get(art.submitterId) || null : null;
  const reporter = art.reporterId ? peopleMap.get(art.reporterId) || null : null;
  const reviewer = art.reviewedBy ? peopleMap.get(art.reviewedBy) || null : null;
  const verifier = art.verifiedBy ? peopleMap.get(art.verifiedBy) || null : null;
  const publisherApprover = art.publisherApprovedBy
    ? peopleMap.get(art.publisherApprovedBy) || null
    : null;

  let category: { id: string; name: string; slug: string } | null = null;
  if (art.categoryId) {
    const [cat] = await db
      .select({ id: categories.id, name: categories.nameAr, slug: categories.slug })
      .from(categories)
      .where(eq(categories.id, art.categoryId))
      .limit(1);
    if (cat) category = cat;
  }

  let publisher: PassportPublisher | null = null;
  if (art.publisherId) {
    const [pub] = await db
      .select({
        id: publishers.id,
        agencyName: publishers.agencyName,
        agencyNameEn: publishers.agencyNameEn,
        logoUrl: publishers.logoUrl,
      })
      .from(publishers)
      .where(eq(publishers.id, art.publisherId))
      .limit(1);
    if (pub) publisher = pub;
  }

  // articleEvents
  const eventRows = await db
    .select({
      id: articleEvents.id,
      eventType: articleEvents.eventType,
      summary: articleEvents.summary,
      createdAt: articleEvents.createdAt,
      actorId: articleEvents.actorId,
    })
    .from(articleEvents)
    .where(eq(articleEvents.articleId, art.id))
    .orderBy(desc(articleEvents.createdAt))
    .limit(50);

  const actorIdsForEvents = eventRows
    .map((e) => e.actorId)
    .filter((x): x is string => !!x);
  const eventActorMap = await fetchPeople(actorIdsForEvents);

  const articleEventTimeline: PassportTimelineEvent[] = eventRows.map((e) => ({
    id: `evt-${e.id}`,
    eventType: e.eventType,
    summary: e.summary,
    createdAt: e.createdAt,
    actor: e.actorId ? eventActorMap.get(e.actorId) || null : null,
    source: "article_events",
    details: null,
  }));

  const auditTimeline = await fetchAuditEvents(art.id, viewerIsStaff);
  const aiEditCount = await fetchAiEditCount(art.id);

  const synthetic = buildSyntheticTimeline(
    {
      id: art.id,
      createdAt: art.createdAt,
      publishedAt: art.publishedAt,
      updatedAt: art.updatedAt,
    },
    { author, submitter, verifier, reviewer, reporter },
    art.verifiedAt,
    art.reviewedAt,
  );

  const timeline = mergeAndSortTimelines(
    [articleEventTimeline, auditTimeline],
    synthetic,
  );

  // AI image generations linked to this article
  const aiImageRows = await db
    .select({
      id: aiImageGenerations.id,
      prompt: aiImageGenerations.prompt,
      model: aiImageGenerations.model,
      imageUrl: aiImageGenerations.imageUrl,
      thumbnailUrl: aiImageGenerations.thumbnailUrl,
      aspectRatio: aiImageGenerations.aspectRatio,
      enableSearchGrounding: aiImageGenerations.enableSearchGrounding,
      createdAt: aiImageGenerations.createdAt,
    })
    .from(aiImageGenerations)
    .where(
      and(
        eq(aiImageGenerations.articleId, art.id),
        eq(aiImageGenerations.status, "completed"),
      ),
    )
    .orderBy(desc(aiImageGenerations.createdAt))
    .limit(10);

  const seoHistoryLatest = await fetchSeoHistoryLatest(art.id, "ar");

  const bodyTier = computeBodyAiTier({
    aiGenerated: art.aiGenerated,
    aiSummary: art.aiSummary,
    aiBullets: art.aiBullets as string[] | null,
    aiEditCount,
  });
  const badgeTier = tierToBadge(bodyTier);
  const seoMeta = asSeoMetadata(art.seoMetadata);

  const bodyPct = bodyTierPct(bodyTier);
  const coverPct = art.isAiGeneratedImage ? 100 : 0;
  const seoPctVal = seoPct(seoMeta);
  const totalPct = Math.round((bodyPct * 0.6 + coverPct * 0.2 + seoPctVal * 0.2));

  const sourceMeta = asSourceMetadata(art.sourceMetadata);
  const inboundChannel = deriveInboundChannel({
    source: art.source,
    publisherId: art.publisherId,
    sourceUrl: art.sourceUrl,
  });
  const additionalLinks = extractAdditionalLinks(art.sourceMetadata, art.sourceUrl);

  return {
    language: "ar",
    viewer: { isStaff: viewerIsStaff },
    article: {
      id: art.id,
      title: art.title,
      subtitle: art.subtitle,
      slug: art.slug,
      excerpt: art.excerpt,
      imageUrl: art.imageUrl,
      articleType: art.articleType,
      status: art.status,
      publishedAt: art.publishedAt,
      createdAt: art.createdAt,
      updatedAt: art.updatedAt,
      category,
      credibilityScore: art.credibilityScore,
      verifiedAt: art.verifiedAt,
      isPublisherNews: !!art.isPublisherNews,
      canonicalUrl: `/article/${art.slug}`,
    },
    source: {
      channel: inboundChannel,
      rawSource: art.source,
      sourceUrl: art.sourceUrl,
      inbound: sourceMeta
        ? {
            from: sourceMeta.from ?? null,
            hasOriginalMessage: !!sourceMeta.originalMessage,
            type: sourceMeta.type ?? null,
          }
        : null,
      additionalLinks,
    },
    people: {
      author,
      submitter,
      reporter,
      reviewer,
      verifier,
      publisherApprover,
    },
    publisher,
    aiFootprint: {
      body: {
        tier: bodyTier,
        aiGenerated: !!art.aiGenerated,
        hasSummary: !!(art.aiSummary && art.aiSummary.trim().length > 0),
        hasBullets:
          Array.isArray(art.aiBullets) && (art.aiBullets as string[]).length > 0,
        aiEditCount,
      },
      cover: {
        isAiGenerated: !!art.isAiGeneratedImage,
        model: art.aiImageModel,
        prompt: viewerIsStaff ? art.aiImagePrompt : null,
      },
      seo: {
        status: seoMeta.status ?? null,
        version: seoMeta.version ?? null,
        provider: seoMeta.provider ?? null,
        model: seoMeta.model ?? null,
        generatedBy: seoMeta.generatedBy ?? null,
        manualOverride: seoMeta.manualOverride ?? null,
        generatedAt: seoMeta.generatedAt ?? null,
      },
      percentages: {
        body: bodyPct,
        cover: coverPct,
        seo: seoPctVal,
        total: totalPct,
      },
      explanation: buildExplanation({
        bodyTier,
        coverIsAi: !!art.isAiGeneratedImage,
        seoPctVal,
      }),
    },
    trustBadge: {
      tier: badgeTier,
      label: TRUST_LABELS[badgeTier],
      credibilityScore: art.credibilityScore,
    },
    aiImageGenerations: aiImageRows.map((row) => ({
      id: row.id,
      prompt: viewerIsStaff ? row.prompt : null,
      model: row.model,
      imageUrl: row.imageUrl,
      thumbnailUrl: row.thumbnailUrl,
      aspectRatio: row.aspectRatio,
      enableSearchGrounding: row.enableSearchGrounding,
      createdAt: row.createdAt,
    })),
    seoHistoryLatest,
    timeline,
  };
}

async function buildLocalizedPassport(
  slug: string,
  language: "en" | "ur",
  viewerIsStaff: boolean,
): Promise<PassportResponse | null> {
  const table = language === "en" ? enArticles : urArticles;
  const catTable = language === "en" ? enCategories : urCategories;

  // Resolve by slug, english_slug, or UUID id — same fallback as the AR builder.
  const matcher = UUID_RE.test(slug)
    ? or(eq(table.slug, slug), eq(table.englishSlug, slug), eq(table.id, slug))
    : or(eq(table.slug, slug), eq(table.englishSlug, slug));
  const [art] = await db
    .select()
    .from(table)
    .where(matcher)
    .limit(1);
  if (!art) return null;
  if (art.status !== "published") return null;

  const peopleIds = [art.authorId, art.reporterId, art.reviewedBy];
  const peopleMap = await fetchPeople(peopleIds);
  const author = art.authorId ? peopleMap.get(art.authorId) || null : null;
  const reporter = art.reporterId ? peopleMap.get(art.reporterId) || null : null;
  const reviewer = art.reviewedBy ? peopleMap.get(art.reviewedBy) || null : null;

  let category: { id: string; name: string; slug: string } | null = null;
  if (art.categoryId) {
    const [cat] = await db
      .select({ id: catTable.id, name: catTable.name, slug: catTable.slug })
      .from(catTable)
      .where(eq(catTable.id, art.categoryId))
      .limit(1);
    if (cat) category = cat;
  }

  const seoHistoryLatest = await fetchSeoHistoryLatest(art.id, language);
  const auditTimeline = await fetchAuditEvents(art.id, viewerIsStaff);
  const aiEditCount = await fetchAiEditCount(art.id);

  const bodyTier = computeBodyAiTier({
    aiGenerated: art.aiGenerated,
    aiSummary: art.aiSummary,
    aiBullets: null,
    aiEditCount,
  });
  const badgeTier = tierToBadge(bodyTier);
  const seoMeta = asSeoMetadata(art.seoMetadata);

  const synthetic = buildSyntheticTimeline(
    {
      id: art.id,
      createdAt: art.createdAt,
      publishedAt: art.publishedAt,
      updatedAt: art.updatedAt,
    },
    { author, submitter: null, verifier: null, reviewer, reporter },
    null,
    art.reviewedAt,
  );

  const timeline = mergeAndSortTimelines([auditTimeline], synthetic);

  const bodyPct = bodyTierPct(bodyTier);
  const coverPct = 0; // EN/UR articles don't track AI cover generation
  const seoPctVal = seoPct(seoMeta);
  const totalPct = Math.round((bodyPct * 0.6 + coverPct * 0.2 + seoPctVal * 0.2));

  const canonicalPrefix = language === "en" ? "/en/article/" : "/ur/article/";

  return {
    language,
    viewer: { isStaff: viewerIsStaff },
    article: {
      id: art.id,
      title: art.title,
      subtitle: art.subtitle,
      slug: art.slug,
      excerpt: art.excerpt,
      imageUrl: art.imageUrl,
      articleType: art.articleType,
      status: art.status,
      publishedAt: art.publishedAt,
      createdAt: art.createdAt,
      updatedAt: art.updatedAt,
      category,
      credibilityScore: null,
      verifiedAt: null,
      isPublisherNews: false,
      canonicalUrl: `${canonicalPrefix}${art.slug}`,
    },
    source: {
      channel: "manual",
      rawSource: null,
      sourceUrl: null,
      inbound: null,
      additionalLinks: [],
    },
    people: {
      author,
      submitter: null,
      reporter,
      reviewer,
      verifier: null,
      publisherApprover: null,
    },
    publisher: null,
    aiFootprint: {
      body: {
        tier: bodyTier,
        aiGenerated: !!art.aiGenerated,
        hasSummary: !!(art.aiSummary && art.aiSummary.trim().length > 0),
        hasBullets: false,
        aiEditCount,
      },
      cover: {
        isAiGenerated: false,
        model: null,
        prompt: null,
      },
      seo: {
        status: seoMeta.status ?? null,
        version: seoMeta.version ?? null,
        provider: seoMeta.provider ?? null,
        model: seoMeta.model ?? null,
        generatedBy: seoMeta.generatedBy ?? null,
        manualOverride: seoMeta.manualOverride ?? null,
        generatedAt: seoMeta.generatedAt ?? null,
      },
      percentages: {
        body: bodyPct,
        cover: coverPct,
        seo: seoPctVal,
        total: totalPct,
      },
      explanation: buildExplanation({
        bodyTier,
        coverIsAi: false,
        seoPctVal,
      }),
    },
    trustBadge: {
      tier: badgeTier,
      label: TRUST_LABELS[badgeTier],
      credibilityScore: null,
    },
    aiImageGenerations: [],
    seoHistoryLatest,
    timeline,
  };
}

export async function buildEnglishPassport(
  slug: string,
  viewerIsStaff: boolean = false,
): Promise<PassportResponse | null> {
  return buildLocalizedPassport(slug, "en", viewerIsStaff);
}

export async function buildUrduPassport(
  slug: string,
  viewerIsStaff: boolean = false,
): Promise<PassportResponse | null> {
  return buildLocalizedPassport(slug, "ur", viewerIsStaff);
}
