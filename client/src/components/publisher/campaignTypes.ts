import type { ArticlePlacements, VsUsual } from "@/components/publisher/ArticleInsights";
import { formatDate } from "@/lib/format";
import type { CampaignArticleStage, CampaignCounts } from "@shared/publisherCampaigns";

export interface CampaignRow {
  id: string;
  publisherId: string;
  name: string;
  clientName: string | null;
  startsOn: string | null;
  endsOn: string | null;
  note: string | null;
  status: "active" | "archived" | string;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignSummary extends CampaignRow {
  counts: CampaignCounts;
  views: number;
  agencyName?: string;
  agencyLogoUrl?: string | null;
}

export interface CampaignReportArticle {
  id: string;
  title: string;
  englishSlug: string | null;
  stage: CampaignArticleStage;
  status: string;
  reviewNote: string | null;
  waitingSince: string | null;
  views: number | null;
  publishedAt: string | null;
  scheduledAt: string | null;
  createdAt: string;
  categoryName: string | null;
  vsUsual: VsUsual | null;
  placements: ArticlePlacements | null;
}

export interface CampaignReport {
  campaign: CampaignRow;
  agency: { name: string; logoUrl: string | null; contactPerson: string | null };
  counts: CampaignCounts;
  totals: { views: number; averageViews: number | null; vsUsualRatio: number | null; comparedCount: number };
  placementTotals: { featured: number; breaking: number; push: number; x: number };
  days: Array<{ day: string; published: number }>;
  articles: CampaignReportArticle[];
  generatedAt: string;
}

/** «15 نوفمبر 2026 إلى 19 نوفمبر 2026» أو «من …» أو «حتى …» أو null. */
export function campaignPeriod(startsOn: string | null, endsOn: string | null): string | null {
  // منتصف النهار UTC حتى لا يزيح توقيت الرياض اليوم
  const fmt = (d: string) => formatDate(`${d}T12:00:00Z`);
  if (startsOn && endsOn) return startsOn === endsOn ? fmt(startsOn) : `${fmt(startsOn)} إلى ${fmt(endsOn)}`;
  if (startsOn) return `من ${fmt(startsOn)}`;
  if (endsOn) return `حتى ${fmt(endsOn)}`;
  return null;
}

export function articleHref(a: { englishSlug: string | null; id: string }) {
  return a.englishSlug ? `/article/${a.englishSlug}` : `/article/${a.id}`;
}

/** نسبة إلى المعتاد كنص: «+18%» / «-9%». */
export function ratioPercent(ratio: number | null): string | null {
  if (ratio == null) return null;
  const pct = Math.round((ratio - 1) * 100);
  return `${pct > 0 ? "+" : ""}${pct}%`;
}
