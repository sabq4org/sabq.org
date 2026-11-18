import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "../db";
import {
  articles,
  categories,
  publisherCampaignArticles,
  publisherCampaigns,
  publisherRequests,
  publishers,
  socialPosts,
  type Publisher,
  type PublisherCampaign,
  type PublisherRenewalOffer,
} from "@shared/schema";
import {
  ACTION_KIND_OWNER,
  CAMPAIGN_STAGE_ORDER,
  campaignArticleStage,
  countCampaignStages,
  sortActionQueue,
  type ActionQueueItem,
  type CampaignArticleStage,
  type CampaignInput,
  type CampaignCounts,
} from "@shared/publisherCampaigns";
import { compareToUsual, getArticlePlacements, getCategoryMedians } from "./publisherInsightsService";

/**
 * ملف الحملة للوكالات وقائمة العمل في لوحة إدارة الناشرين.
 * الجداول: publisher_campaigns + publisher_campaign_articles (migrations/20261118_publisher_campaigns.sql).
 * ربط خبر بحملة لا يخصم من الباقة ولا يغيّر الخبر نفسه.
 */

const CAMPAIGN_ARTICLES_LIMIT = 300;

function cleanText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function articleStagesByCampaign(campaignIds: string[]) {
  const map = new Map<string, { stages: CampaignArticleStage[]; views: number }>();
  if (campaignIds.length === 0) return map;
  const rows = await db
    .select({
      campaignId: publisherCampaignArticles.campaignId,
      status: articles.status,
      publisherStatus: articles.publisherStatus,
      views: articles.views,
    })
    .from(publisherCampaignArticles)
    .innerJoin(articles, eq(publisherCampaignArticles.articleId, articles.id))
    .where(inArray(publisherCampaignArticles.campaignId, campaignIds));
  for (const row of rows) {
    const entry = map.get(row.campaignId) ?? { stages: [], views: 0 };
    const stage = campaignArticleStage(row);
    entry.stages.push(stage);
    if (stage === "published") entry.views += Number(row.views) || 0;
    map.set(row.campaignId, entry);
  }
  return map;
}

export interface CampaignSummary extends PublisherCampaign {
  counts: CampaignCounts;
  views: number;
}

async function withCounts(rows: PublisherCampaign[]): Promise<CampaignSummary[]> {
  const stages = await articleStagesByCampaign(rows.map((r) => r.id));
  return rows.map((row) => {
    const entry = stages.get(row.id);
    return { ...row, counts: countCampaignStages(entry?.stages ?? []), views: entry?.views ?? 0 };
  });
}

export async function listPortalCampaigns(publisher: Publisher, status: "active" | "archived" | "all" = "active") {
  const rows = await db
    .select()
    .from(publisherCampaigns)
    .where(
      and(
        eq(publisherCampaigns.publisherId, publisher.id),
        status === "all" ? undefined : eq(publisherCampaigns.status, status),
      ),
    )
    .orderBy(desc(publisherCampaigns.updatedAt))
    .limit(100);
  return withCounts(rows);
}

export async function createCampaign(publisher: Publisher, userId: string, input: CampaignInput) {
  const [row] = await db
    .insert(publisherCampaigns)
    .values({
      publisherId: publisher.id,
      name: input.name.trim(),
      clientName: cleanText(input.clientName),
      startsOn: input.startsOn ?? null,
      endsOn: input.endsOn ?? null,
      note: cleanText(input.note),
      createdBy: userId,
    })
    .returning();
  return row;
}

async function findOwnCampaign(publisherId: string, campaignId: string) {
  const [row] = await db
    .select()
    .from(publisherCampaigns)
    .where(and(eq(publisherCampaigns.id, campaignId), eq(publisherCampaigns.publisherId, publisherId)))
    .limit(1);
  return row ?? null;
}

export async function updateCampaign(
  publisher: Publisher,
  campaignId: string,
  patch: Partial<CampaignInput> & { status?: "active" | "archived" },
) {
  const existing = await findOwnCampaign(publisher.id, campaignId);
  if (!existing) return null;
  const startsOn = patch.startsOn !== undefined ? patch.startsOn : existing.startsOn;
  const endsOn = patch.endsOn !== undefined ? patch.endsOn : existing.endsOn;
  if (startsOn && endsOn && startsOn > endsOn) {
    throw Object.assign(new Error("تاريخ النهاية قبل تاريخ البداية"), { status: 400 });
  }
  const [row] = await db
    .update(publisherCampaigns)
    .set({
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.clientName !== undefined ? { clientName: cleanText(patch.clientName) } : {}),
      ...(patch.note !== undefined ? { note: cleanText(patch.note) } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      startsOn: startsOn ?? null,
      endsOn: endsOn ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(publisherCampaigns.id, campaignId), eq(publisherCampaigns.publisherId, publisher.id)))
    .returning();
  return row ?? null;
}

/**
 * ربط أخبار بالحملة. يُقبل فقط ما يحمل publisher_id للوكالة نفسها؛
 * غيره يُتجاهل بصمت ويُعاد عدد المقبول.
 */
export async function addCampaignArticles(publisher: Publisher, campaignId: string, articleIds: string[], userId: string) {
  const campaign = await findOwnCampaign(publisher.id, campaignId);
  if (!campaign) return null;
  const unique = Array.from(new Set(articleIds));
  const owned = await db
    .select({ id: articles.id })
    .from(articles)
    .where(and(inArray(articles.id, unique), eq(articles.publisherId, publisher.id)));
  let added = 0;
  if (owned.length > 0) {
    const inserted = await db
      .insert(publisherCampaignArticles)
      .values(owned.map((a) => ({ campaignId, articleId: a.id, addedBy: userId })))
      .onConflictDoNothing()
      .returning({ articleId: publisherCampaignArticles.articleId });
    added = inserted.length;
    if (added > 0) await db.update(publisherCampaigns).set({ updatedAt: new Date() }).where(eq(publisherCampaigns.id, campaignId));
  }
  // ignored = ليست من أخبار الوكالة؛ ما كان في الحملة أصلًا لا يُعد مضافًا ولا مرفوضًا
  return { added, ignored: unique.length - owned.length };
}

export async function removeCampaignArticle(publisher: Publisher, campaignId: string, articleId: string) {
  const campaign = await findOwnCampaign(publisher.id, campaignId);
  if (!campaign) return null;
  await db
    .delete(publisherCampaignArticles)
    .where(and(eq(publisherCampaignArticles.campaignId, campaignId), eq(publisherCampaignArticles.articleId, articleId)));
  await db.update(publisherCampaigns).set({ updatedAt: new Date() }).where(eq(publisherCampaigns.id, campaignId));
  return { ok: true };
}

/** حملات الوكالة النشطة التي يحتويها الخبر — للمحرر وقائمة الأخبار. */
export async function getArticleCampaignIds(publisher: Publisher, articleId: string) {
  const rows = await db
    .select({ campaignId: publisherCampaignArticles.campaignId })
    .from(publisherCampaignArticles)
    .innerJoin(publisherCampaigns, eq(publisherCampaignArticles.campaignId, publisherCampaigns.id))
    .where(and(eq(publisherCampaignArticles.articleId, articleId), eq(publisherCampaigns.publisherId, publisher.id)));
  return rows.map((r) => r.campaignId);
}

/**
 * ملف الحملة وتقرير العميل معًا: المواد بكل حالاتها، والمنشور منها بقراءاته
 * حتى الآن، ومقارنته بالمعتاد في قسمه، ومواضع ظهوره الفعلية.
 * `publisherId = null` = قراءة الإدارة لأي وكالة.
 */
export async function getCampaignReport(campaignId: string, publisherId: string | null) {
  const [campaign] = await db
    .select({
      campaign: publisherCampaigns,
      agencyName: publishers.agencyName,
      agencyLogoUrl: publishers.logoUrl,
      contactPerson: publishers.contactPerson,
    })
    .from(publisherCampaigns)
    .innerJoin(publishers, eq(publisherCampaigns.publisherId, publishers.id))
    .where(
      and(
        eq(publisherCampaigns.id, campaignId),
        publisherId ? eq(publisherCampaigns.publisherId, publisherId) : undefined,
      ),
    )
    .limit(1);
  if (!campaign) return null;

  const rows = await db
    .select({
      id: articles.id,
      title: articles.title,
      englishSlug: articles.englishSlug,
      status: articles.status,
      publisherStatus: articles.publisherStatus,
      publisherReviewNotes: articles.publisherReviewNotes,
      publisherSubmittedAt: articles.publisherSubmittedAt,
      publisherReviewedAt: articles.publisherReviewedAt,
      views: articles.views,
      publishedAt: articles.publishedAt,
      scheduledAt: articles.scheduledAt,
      createdAt: articles.createdAt,
      categoryId: articles.categoryId,
      categoryName: categories.nameAr,
      isFeatured: articles.isFeatured,
      newsType: articles.newsType,
      addedAt: publisherCampaignArticles.addedAt,
    })
    .from(publisherCampaignArticles)
    .innerJoin(articles, eq(publisherCampaignArticles.articleId, articles.id))
    .leftJoin(categories, eq(articles.categoryId, categories.id))
    .where(eq(publisherCampaignArticles.campaignId, campaignId))
    .orderBy(asc(articles.publishedAt), asc(articles.createdAt))
    .limit(CAMPAIGN_ARTICLES_LIMIT);

  const published = rows.filter((r) => r.status === "published");
  const [medians, placements] = await Promise.all([
    getCategoryMedians(published.map((r) => r.categoryId ?? "")),
    getArticlePlacements(published),
  ]);

  const items = rows
    .map((row) => {
      const stage = campaignArticleStage(row);
      return {
        id: row.id,
        title: row.title,
        englishSlug: row.englishSlug,
        stage,
        status: row.status,
        reviewNote: stage === "needs_changes" ? row.publisherReviewNotes : null,
        waitingSince:
          stage === "with_sabq"
            ? row.publisherSubmittedAt
            : stage === "needs_changes"
              ? row.publisherReviewedAt
              : null,
        views: stage === "published" ? Number(row.views) || 0 : null,
        publishedAt: row.publishedAt,
        scheduledAt: row.scheduledAt,
        createdAt: row.createdAt,
        categoryName: row.categoryName ?? null,
        vsUsual: stage === "published" ? compareToUsual(row, medians) : null,
        placements: stage === "published" ? (placements.get(row.id) ?? null) : null,
      };
    })
    .sort((a, b) => {
      const order = CAMPAIGN_STAGE_ORDER[a.stage] - CAMPAIGN_STAGE_ORDER[b.stage];
      if (order !== 0) return order;
      // المنشور: الأعلى قراءة أولًا
      if (a.stage === "published") return (b.views ?? 0) - (a.views ?? 0);
      return 0;
    });

  const counts = countCampaignStages(items.map((i) => i.stage));
  const totalViews = items.reduce((sum, i) => sum + (i.views ?? 0), 0);
  const compared = items.filter((i) => i.vsUsual);
  const usualSum = compared.reduce((sum, i) => sum + (i.vsUsual?.median ?? 0), 0);
  const comparedViews = compared.reduce((sum, i) => sum + (i.views ?? 0), 0);

  // عدد ما نُشر في كل يوم (بتوقيت الرياض) لشريط «خط الحملة»
  const byDay = new Map<string, number>();
  for (const item of items) {
    if (item.stage !== "published" || !item.publishedAt) continue;
    const day = new Date(new Date(item.publishedAt).getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }

  const placementTotals = {
    featured: items.filter((i) => i.placements?.featured).length,
    breaking: items.filter((i) => i.placements?.breaking).length,
    push: items.filter((i) => i.placements?.push).length,
    x: items.filter((i) => i.placements?.x).length,
  };

  return {
    campaign: campaign.campaign,
    agency: {
      name: campaign.agencyName,
      logoUrl: campaign.agencyLogoUrl,
      contactPerson: campaign.contactPerson,
    },
    counts,
    totals: {
      views: totalViews,
      averageViews: counts.published ? Math.round(totalViews / counts.published) : null,
      // نسبة قراءات المنشور المقارَن إلى مجموع «المعتاد» لأقسامه؛ null إن لم يكتمل أي خبر
      vsUsualRatio: usualSum > 0 ? comparedViews / usualSum : null,
      comparedCount: compared.length,
    },
    placementTotals,
    days: Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, published]) => ({ day, published })),
    articles: items,
    generatedAt: new Date(),
  };
}

// ============================================
// الإدارة
// ============================================

export async function listActiveCampaignsAdmin() {
  const rows = await db
    .select({ campaign: publisherCampaigns, agencyName: publishers.agencyName, agencyLogoUrl: publishers.logoUrl })
    .from(publisherCampaigns)
    .innerJoin(publishers, eq(publisherCampaigns.publisherId, publishers.id))
    .where(eq(publisherCampaigns.status, "active"))
    .orderBy(desc(publisherCampaigns.updatedAt))
    .limit(50);
  const counted = await withCounts(rows.map((r) => r.campaign));
  return counted.map((c, i) => ({ ...c, agencyName: rows[i].agencyName, agencyLogoUrl: rows[i].agencyLogoUrl }));
}

const REQUEST_TYPE_LABELS: Record<string, string> = {
  renewal: "تجديد الباقة",
  window_extension: "تمديد فترة النشر",
  other: "طلب آخر",
};

const QUEUE_LIMIT = 100;

/**
 * «بانتظار إجراء من سبق» و«بانتظار الوكالة» من البيانات القائمة:
 * مواد الوكالات للمراجعة والمعادة، طلبات الوكالات وعروضها، وتغريدات الوكالات المقترحة.
 */
export async function getAdminActionQueue(): Promise<{ sabq: ActionQueueItem[]; agency: ActionQueueItem[] }> {
  const [reviewRows, requestRows, tweetRows] = await Promise.all([
    db
      .select({
        id: articles.id,
        title: articles.title,
        publisherStatus: articles.publisherStatus,
        submittedAt: articles.publisherSubmittedAt,
        reviewedAt: articles.publisherReviewedAt,
        createdAt: articles.createdAt,
        notes: articles.publisherReviewNotes,
        publisherId: publishers.id,
        agencyName: publishers.agencyName,
      })
      .from(articles)
      .innerJoin(publishers, eq(articles.publisherId, publishers.id))
      .where(and(eq(articles.status, "draft"), inArray(articles.publisherStatus, ["pending", "needs_changes"])))
      .orderBy(asc(articles.updatedAt))
      .limit(QUEUE_LIMIT),
    db
      .select({
        id: publisherRequests.id,
        type: publisherRequests.type,
        status: publisherRequests.status,
        message: publisherRequests.message,
        offer: publisherRequests.offer,
        createdAt: publisherRequests.createdAt,
        publisherId: publishers.id,
        agencyName: publishers.agencyName,
      })
      .from(publisherRequests)
      .innerJoin(publishers, eq(publisherRequests.publisherId, publishers.id))
      .where(inArray(publisherRequests.status, ["open", "offered", "accepted"]))
      .limit(QUEUE_LIMIT),
    db
      .select({
        id: socialPosts.id,
        createdAt: socialPosts.createdAt,
        articleTitle: articles.title,
        publisherId: publishers.id,
        agencyName: publishers.agencyName,
      })
      .from(socialPosts)
      .innerJoin(publishers, eq(socialPosts.publisherId, publishers.id))
      .leftJoin(articles, eq(socialPosts.articleId, articles.id))
      .where(and(eq(socialPosts.status, "draft"), isNotNull(socialPosts.publisherId)))
      .limit(QUEUE_LIMIT),
  ]);

  const sabq: ActionQueueItem[] = [];
  const agency: ActionQueueItem[] = [];
  const iso = (d: Date | string | null | undefined, fallback: Date | string) => new Date(d ?? fallback).toISOString();

  for (const row of reviewRows) {
    if (row.publisherStatus === "pending") {
      sabq.push({
        id: `article:${row.id}`,
        side: "sabq",
        kind: "article_review",
        publisherId: row.publisherId,
        agencyName: row.agencyName,
        title: row.title,
        detail: null,
        waitingSince: iso(row.submittedAt, row.createdAt),
        owner: ACTION_KIND_OWNER.article_review,
        action: "مراجعة المادة",
        href: `/dashboard/admin/publisher-articles?status=draft`,
      });
    } else {
      agency.push({
        id: `article:${row.id}`,
        side: "agency",
        kind: "article_returned",
        publisherId: row.publisherId,
        agencyName: row.agencyName,
        title: row.title,
        detail: row.notes ? `الملاحظة: ${row.notes.slice(0, 140)}` : null,
        waitingSince: iso(row.reviewedAt, row.createdAt),
        owner: ACTION_KIND_OWNER.article_returned,
        action: "فتح الوكالة",
        href: `/dashboard/admin/publishers/${row.publisherId}`,
      });
    }
  }

  for (const row of requestRows) {
    const offer = row.offer as PublisherRenewalOffer | null;
    const typeLabel = REQUEST_TYPE_LABELS[row.type] ?? "طلب";
    const base = { publisherId: row.publisherId, agencyName: row.agencyName, href: "/dashboard/admin/publishers#requests" };
    if (row.status === "open" || (row.status === "offered" && offer?.response === "contact")) {
      const contact = row.status === "offered";
      sabq.push({
        ...base,
        id: `request:${row.id}`,
        side: "sabq",
        kind: "request_open",
        title: contact ? `${typeLabel}: طلبت الوكالة التواصل` : typeLabel,
        detail: row.message ? row.message.slice(0, 140) : null,
        waitingSince: iso(contact ? offer?.respondedAt : row.createdAt, row.createdAt),
        owner: ACTION_KIND_OWNER.request_open,
        action: row.type === "renewal" && !contact ? "إرسال عرض" : "معالجة الطلب",
      });
    } else if (row.status === "accepted") {
      sabq.push({
        ...base,
        id: `request:${row.id}`,
        side: "sabq",
        kind: "renewal_accepted",
        title: `${typeLabel}: قبلت الوكالة العرض`,
        detail: "بانتظار تأكيد الدفع وتفعيل الباقة",
        waitingSince: iso(offer?.respondedAt, row.createdAt),
        owner: ACTION_KIND_OWNER.renewal_accepted,
        action: "تفعيل الباقة",
      });
    } else if (row.status === "offered") {
      agency.push({
        ...base,
        id: `request:${row.id}`,
        side: "agency",
        kind: "offer_sent",
        title: `${typeLabel}: عرض بانتظار رد الوكالة`,
        detail: offer?.validUntil ? `صالح حتى ${offer.validUntil.slice(0, 10)}` : null,
        waitingSince: iso(offer?.sentAt, row.createdAt),
        owner: ACTION_KIND_OWNER.offer_sent,
        action: "فتح الطلب",
      });
    }
  }

  for (const row of tweetRows) {
    sabq.push({
      id: `tweet:${row.id}`,
      side: "sabq",
      kind: "agency_tweet",
      publisherId: row.publisherId,
      agencyName: row.agencyName,
      title: row.articleTitle ? `تغريدة لخبر: ${row.articleTitle}` : "تغريدة مقترحة",
      detail: null,
      waitingSince: iso(row.createdAt, row.createdAt),
      owner: ACTION_KIND_OWNER.agency_tweet,
      action: "مراجعة التغريدة",
      href: "/dashboard/social-publishing?filter=agency",
    });
  }

  return { sabq: sortActionQueue(sabq), agency: sortActionQueue(agency) };
}

// ============================================
// البوابة: ما ينتظر إجراء الوكالة، وما عند سبق
// ============================================

export async function getPortalActionItems(publisher: Publisher) {
  const [draftRows, requestRows] = await Promise.all([
    db
      .select({
        id: articles.id,
        title: articles.title,
        publisherStatus: articles.publisherStatus,
        notes: articles.publisherReviewNotes,
        submittedAt: articles.publisherSubmittedAt,
        reviewedAt: articles.publisherReviewedAt,
        createdAt: articles.createdAt,
      })
      .from(articles)
      .where(
        and(
          eq(articles.publisherId, publisher.id),
          eq(articles.status, "draft"),
          inArray(articles.publisherStatus, ["pending", "needs_changes"]),
        ),
      )
      .orderBy(asc(articles.updatedAt))
      .limit(50),
    db
      .select({
        id: publisherRequests.id,
        type: publisherRequests.type,
        offer: publisherRequests.offer,
        createdAt: publisherRequests.createdAt,
      })
      .from(publisherRequests)
      .where(and(eq(publisherRequests.publisherId, publisher.id), eq(publisherRequests.status, "offered")))
      .limit(10),
  ]);

  const campaignsByArticle = new Map<string, string>();
  // اسم الحملة زينة: إن لم تُنشأ جداول الحملات بعد على قاعدة ما تبقى القائمة تعمل
  if (draftRows.length) {
    const links = await db
      .select({ articleId: publisherCampaignArticles.articleId, name: publisherCampaigns.name })
      .from(publisherCampaignArticles)
      .innerJoin(publisherCampaigns, eq(publisherCampaignArticles.campaignId, publisherCampaigns.id))
      .where(
        and(
          inArray(publisherCampaignArticles.articleId, draftRows.map((r) => r.id)),
          eq(publisherCampaigns.publisherId, publisher.id),
        ),
      )
      .catch((error) => {
        console.warn("[Publisher Campaigns] campaign names unavailable:", (error as Error)?.message);
        return [] as Array<{ articleId: string; name: string }>;
      });
    for (const link of links) if (!campaignsByArticle.has(link.articleId)) campaignsByArticle.set(link.articleId, link.name);
  }

  const iso = (d: Date | string | null | undefined, fallback: Date | string) => new Date(d ?? fallback).toISOString();
  const yours = [
    ...draftRows
      .filter((r) => r.publisherStatus === "needs_changes")
      .map((r) => ({
        kind: "needs_changes" as const,
        id: r.id,
        title: r.title,
        note: r.notes,
        campaignName: campaignsByArticle.get(r.id) ?? null,
        waitingSince: iso(r.reviewedAt, r.createdAt),
        href: `/dashboard/publisher/article/${r.id}/edit`,
      })),
    ...requestRows
      .filter((r) => !(r.offer as PublisherRenewalOffer | null)?.response)
      .map((r) => {
        const offer = r.offer as PublisherRenewalOffer | null;
        return {
          kind: "offer" as const,
          id: r.id,
          title: REQUEST_TYPE_LABELS[r.type] ?? "عرض من سبق",
          note: offer
            ? [
                offer.price != null ? `السعر ${offer.price.toLocaleString("en-US")} ${offer.currency || "ر.س"}` : null,
                offer.validUntil ? `صالح حتى ${offer.validUntil.slice(0, 10)}` : null,
              ]
                .filter(Boolean)
                .join(" · ")
            : null,
          campaignName: null,
          waitingSince: iso(offer?.sentAt, r.createdAt),
          href: "/dashboard/publisher/credits",
        };
      }),
  ];

  const withSabq = draftRows
    .filter((r) => r.publisherStatus === "pending")
    .map((r) => ({
      id: r.id,
      title: r.title,
      campaignName: campaignsByArticle.get(r.id) ?? null,
      waitingSince: iso(r.submittedAt, r.createdAt),
    }));

  return { yours: sortActionQueue(yours), withSabq: sortActionQueue(withSabq) };
}
