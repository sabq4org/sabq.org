import { MetricCard } from "@/components/analytics/MetricCard";
import { Eye, ThumbsUp, MessageCircle, Bookmark } from "lucide-react";

interface ContributorStatsRowProps {
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalBookmarks: number;
  comparison?: {
    viewsThisMonth: number;
    viewsLastMonth: number;
    likesThisMonth: number;
    likesLastMonth: number;
  };
  loading?: boolean;
}

function pctChange(current: number, previous: number): number | undefined {
  if (!previous) return current > 0 ? 100 : undefined;
  return ((current - previous) / previous) * 100;
}

export function ContributorStatsRow({
  totalViews,
  totalLikes,
  totalComments,
  totalBookmarks,
  comparison,
  loading,
}: ContributorStatsRowProps) {
  const viewsTrend = comparison
    ? pctChange(comparison.viewsThisMonth, comparison.viewsLastMonth)
    : undefined;
  const likesTrend = comparison
    ? pctChange(comparison.likesThisMonth, comparison.likesLastMonth)
    : undefined;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <MetricCard
        title="المشاهدات"
        value={totalViews}
        icon={Eye}
        loading={loading}
        trend={viewsTrend !== undefined ? { value: viewsTrend, label: "عن الشهر الماضي" } : undefined}
      />
      <MetricCard
        title="الإعجابات"
        value={totalLikes}
        icon={ThumbsUp}
        loading={loading}
        trend={likesTrend !== undefined ? { value: likesTrend, label: "عن الشهر الماضي" } : undefined}
      />
      <MetricCard
        title="التعليقات"
        value={totalComments}
        icon={MessageCircle}
        loading={loading}
      />
      <MetricCard
        title="المفضلة"
        value={totalBookmarks}
        icon={Bookmark}
        loading={loading}
      />
    </div>
  );
}
