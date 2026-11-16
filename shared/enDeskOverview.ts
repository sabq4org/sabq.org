/**
 * English Desk overview (the /en/dashboard home): pure helpers shared by
 * server/services/enDeskOverviewService.ts and the dashboard page.
 * Riyadh has no DST, so a fixed UTC+3 offset is exact.
 */

export const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Start of the current Riyadh calendar day, as a UTC Date. */
export function riyadhDayStart(now: Date): Date {
  const local = now.getTime() + RIYADH_OFFSET_MS;
  const dayStartLocal = local - (((local % 86_400_000) + 86_400_000) % 86_400_000);
  return new Date(dayStartLocal - RIYADH_OFFSET_MS);
}

/** Next Riyadh midnight, as a UTC Date. */
export function riyadhNextMidnight(now: Date): Date {
  return new Date(riyadhDayStart(now).getTime() + 86_400_000);
}

/**
 * Next run of enAutoTranslateJob: cron "5 *\/2 * * *" in Asia/Riyadh,
 * i.e. :05 past every even Riyadh hour.
 */
export function nextEnAutoTranslateRun(now: Date): Date {
  const dayStart = riyadhDayStart(now).getTime();
  for (let h = 0; h <= 24; h += 2) {
    const t = dayStart + h * 3_600_000 + 5 * 60_000;
    if (t > now.getTime()) return new Date(t);
  }
  return new Date(dayStart + 86_400_000 + 5 * 60_000);
}

export type EnDeskNeedKind = "scheduled" | "hidden" | "draft" | "in_review";

export interface EnDeskNeedRow {
  id: string;
  title: string;
  status: string;
  reviewStatus: string | null;
  imageUrl: string | null;
  hasSeoTitle: boolean;
  hideFromHomepage: boolean;
  isAutoTranslated: boolean;
  scheduledAt: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
  categoryName: string | null;
}

export interface EnDeskNeed {
  id: string;
  title: string;
  kind: EnDeskNeedKind;
  categoryName: string | null;
  /** Short reason shown under the title, e.g. "no image yet". */
  hint: string;
  scheduledAt: string | null;
  updatedAt: string | null;
}

const KIND_ORDER: Record<EnDeskNeedKind, number> = { scheduled: 0, in_review: 1, hidden: 2, draft: 3 };

/** Turn candidate rows into the "Needs you" list, most urgent first. */
export function buildEnDeskNeeds(rows: readonly EnDeskNeedRow[], limit = 8): EnDeskNeed[] {
  const out: EnDeskNeed[] = [];
  for (const r of rows) {
    if (r.status === "scheduled") {
      out.push({ id: r.id, title: r.title, kind: "scheduled", categoryName: r.categoryName, hint: r.imageUrl ? "check before it goes out" : "no image yet", scheduledAt: r.scheduledAt, updatedAt: r.updatedAt });
    } else if (r.status === "published" && r.hideFromHomepage) {
      const hint = r.isAutoTranslated ? "auto-translated · hidden from homepage" : "hidden from homepage";
      out.push({ id: r.id, title: r.title, kind: "hidden", categoryName: r.categoryName, hint, scheduledAt: null, updatedAt: r.updatedAt });
    } else if (r.status === "draft") {
      const inReview = r.reviewStatus === "pending_review";
      const hint = !r.imageUrl ? "no image yet" : !r.hasSeoTitle ? "SEO missing" : inReview ? "waiting for review" : "ready to finish";
      out.push({ id: r.id, title: r.title, kind: inReview ? "in_review" : "draft", categoryName: r.categoryName, hint, scheduledAt: null, updatedAt: r.updatedAt });
    }
  }
  const time = (n: EnDeskNeed) => {
    if (n.kind === "scheduled") return n.scheduledAt ? Date.parse(n.scheduledAt) : Infinity;
    return n.updatedAt ? -Date.parse(n.updatedAt) : 0;
  };
  return out
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || time(a) - time(b))
    .slice(0, limit);
}

export type EnPulseState = "translated" | "draft" | "not_translated";

export interface EnDeskPulseItem {
  arArticleId: string;
  title: string;
  publishedAt: string | null;
  state: EnPulseState;
  enArticleId: string | null;
}

export interface EnDeskPublishedItem {
  id: string;
  title: string;
  slug: string;
  categoryName: string | null;
  publishedAt: string | null;
  views: number;
  /** editor | bot | auto (auto-translate job) | translated (dashboard button) */
  source: "editor" | "bot" | "auto" | "translated";
}

export interface EnDeskOverview {
  now: string;
  counts: {
    enLast24h: number;
    arLast24h: number;
    waiting: number;
    scheduledTonight: number;
  };
  needs: EnDeskNeed[];
  pulse: {
    enabled: boolean;
    nextRunAt: string;
    items: EnDeskPulseItem[];
  };
  publishedRecent: EnDeskPublishedItem[];
}

export function enPublishedSource(meta: { source?: string; trigger?: string; sourceArticleId?: string } | null | undefined): EnDeskPublishedItem["source"] {
  if (meta?.source === "bot") return "bot";
  if (meta?.trigger === "auto") return "auto";
  if (meta?.sourceArticleId) return "translated";
  return "editor";
}
