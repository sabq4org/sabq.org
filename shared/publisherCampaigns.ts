import { z } from "zod";

/**
 * ملف الحملة وقائمة العمل في نظام الوكالات — منطق نقي مشترك بين الخادم والواجهة.
 * الخدمة: server/services/publisherCampaignService.ts
 */

const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "التاريخ بصيغة YYYY-MM-DD")
  .nullable()
  .optional();

export const campaignInputSchema = z
  .object({
    name: z.string().trim().min(3, "اسم الحملة 3 أحرف على الأقل").max(140),
    clientName: z.string().trim().max(140).nullable().optional(),
    startsOn: isoDay,
    endsOn: isoDay,
    note: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((v) => !v.startsOn || !v.endsOn || v.startsOn <= v.endsOn, {
    message: "تاريخ النهاية قبل تاريخ البداية",
    path: ["endsOn"],
  });

export type CampaignInput = z.infer<typeof campaignInputSchema>;

export const campaignUpdateSchema = z
  .object({
    name: z.string().trim().min(3).max(140).optional(),
    clientName: z.string().trim().max(140).nullable().optional(),
    startsOn: isoDay,
    endsOn: isoDay,
    note: z.string().trim().max(1000).nullable().optional(),
    status: z.enum(["active", "archived"]).optional(),
  })
  .refine((v) => !v.startsOn || !v.endsOn || v.startsOn <= v.endsOn, {
    message: "تاريخ النهاية قبل تاريخ البداية",
    path: ["endsOn"],
  });

export const campaignArticlesInputSchema = z.object({
  articleIds: z.array(z.string().min(1)).min(1).max(50),
});

/** حالة المادة كما تراها الوكالة في ملف الحملة. */
export type CampaignArticleStage = "published" | "scheduled" | "with_sabq" | "needs_changes" | "draft" | "archived";

export function campaignArticleStage(row: {
  status: string | null;
  publisherStatus: string | null;
}): CampaignArticleStage {
  if (row.status === "published") return "published";
  if (row.status === "scheduled") return "scheduled";
  if (row.status === "archived") return "archived";
  if (row.publisherStatus === "needs_changes") return "needs_changes";
  if (row.publisherStatus === "pending") return "with_sabq";
  return "draft";
}

export const CAMPAIGN_STAGE_LABELS: Record<CampaignArticleStage, string> = {
  published: "منشور",
  scheduled: "مجدول",
  with_sabq: "عند المحرر",
  needs_changes: "تحتاج تعديلك",
  draft: "مسودة",
  archived: "مؤرشف",
};

/** ترتيب عرض مواد الحملة: ما يحتاج الوكالة أولًا، ثم ما عند سبق، ثم المنشور. */
export const CAMPAIGN_STAGE_ORDER: Record<CampaignArticleStage, number> = {
  needs_changes: 0,
  with_sabq: 1,
  scheduled: 2,
  published: 3,
  draft: 4,
  archived: 5,
};

export interface CampaignCounts {
  total: number;
  published: number;
  scheduled: number;
  withSabq: number;
  needsChanges: number;
  drafts: number;
}

export function countCampaignStages(stages: CampaignArticleStage[]): CampaignCounts {
  const counts: CampaignCounts = { total: 0, published: 0, scheduled: 0, withSabq: 0, needsChanges: 0, drafts: 0 };
  for (const stage of stages) {
    if (stage === "archived") continue;
    counts.total += 1;
    if (stage === "published") counts.published += 1;
    else if (stage === "scheduled") counts.scheduled += 1;
    else if (stage === "with_sabq") counts.withSabq += 1;
    else if (stage === "needs_changes") counts.needsChanges += 1;
    else counts.drafts += 1;
  }
  return counts;
}

// ============================================
// قائمة العمل: «بانتظار إجراء من سبق» / «بانتظار الوكالة»
// ============================================

export type ActionQueueSide = "sabq" | "agency";

export type ActionQueueKind =
  | "article_review"
  | "agency_tweet"
  | "request_open"
  | "renewal_accepted"
  | "article_returned"
  | "offer_sent";

export interface ActionQueueItem {
  id: string;
  side: ActionQueueSide;
  kind: ActionQueueKind;
  publisherId: string;
  agencyName: string;
  title: string;
  detail: string | null;
  /** ISO — منذ متى ينتظر هذا العنصر */
  waitingSince: string;
  owner: string;
  action: string;
  href: string;
}

export const ACTION_KIND_LABELS: Record<ActionQueueKind, string> = {
  article_review: "مادة للمراجعة",
  agency_tweet: "طلب تغريدة",
  request_open: "طلب من الوكالة",
  renewal_accepted: "قبلت العرض",
  article_returned: "مادة أُعيدت",
  offer_sent: "عرض مُرسل",
};

/** من عليه الدور في كل نوع — دور لا شخص، لأن النظام لا يُسند العناصر لأفراد. */
export const ACTION_KIND_OWNER: Record<ActionQueueKind, string> = {
  article_review: "محرر الشراكات",
  agency_tweet: "محرر السوشال",
  request_open: "مسؤول الشراكات",
  renewal_accepted: "مسؤول الشراكات",
  article_returned: "الوكالة",
  offer_sent: "الوكالة",
};

export type WaitTone = "calm" | "warn" | "late";

/** لون عمر الانتظار: أقل من 12 ساعة هادئ، حتى 24 تنبيه، وما بعدها متأخر. */
export function waitTone(waitingSince: string | Date, now: Date = new Date()): WaitTone {
  const hours = (now.getTime() - new Date(waitingSince).getTime()) / 3_600_000;
  if (hours >= 24) return "late";
  if (hours >= 12) return "warn";
  return "calm";
}

/** «منذ 40 دقيقة» / «منذ 6 ساعات» / «منذ يومين». */
export function waitLabel(waitingSince: string | Date, now: Date = new Date()): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(waitingSince).getTime()) / 60_000));
  if (minutes < 60) {
    if (minutes <= 1) return "منذ دقيقة";
    if (minutes === 2) return "منذ دقيقتين";
    return minutes <= 10 ? `منذ ${minutes} دقائق` : `منذ ${minutes} دقيقة`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    if (hours === 1) return "منذ ساعة";
    if (hours === 2) return "منذ ساعتين";
    return hours <= 10 ? `منذ ${hours} ساعات` : `منذ ${hours} ساعة`;
  }
  const days = Math.floor(hours / 24);
  if (days === 2) return "منذ يومين";
  return days <= 10 ? `منذ ${days} أيام` : `منذ ${days} يومًا`;
}

/** الأقدم أولًا. */
export function sortActionQueue<T extends { waitingSince: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => new Date(a.waitingSince).getTime() - new Date(b.waitingSince).getTime());
}
