import { useState } from "react";
import { TrendChart } from "@/components/analytics/TrendChart";

interface DailyStat {
  date: string;
  views: number;
  likes: number;
  comments: number;
}

interface PerformanceChartProps {
  dailyStats: DailyStat[];
  loading?: boolean;
  title?: string;
  description?: string;
}

export function PerformanceChart({
  dailyStats,
  loading,
  title = "أداء المقالات",
  description = "المشاهدات والتفاعل خلال الفترة",
}: PerformanceChartProps) {
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("daily");

  const aggregated = aggregateByPeriod(dailyStats, period);

  const chartData = aggregated.map((d) => ({
    date: d.date,
    value: d.views,
    likes: d.likes,
    comments: d.comments,
  }));

  return (
    <TrendChart
      data={chartData}
      title={title}
      description={description}
      type="area"
      height={280}
      period={period}
      onPeriodChange={(p) => setPeriod(p as any)}
      valueKey="value"
      loading={loading}
      additionalLines={[
        { key: "likes", color: "#f43f5e", name: "إعجابات" },
        { key: "comments", color: "#8b5cf6", name: "تعليقات" },
      ]}
      formatValue={(v) => v.toLocaleString()}
    />
  );
}

function aggregateByPeriod(
  data: DailyStat[],
  period: "daily" | "weekly" | "monthly",
): DailyStat[] {
  if (period === "daily") return data;

  const buckets = new Map<string, DailyStat>();

  for (const d of data) {
    const dt = new Date(d.date);
    let key: string;

    if (period === "weekly") {
      const day = dt.getDay();
      const weekStart = new Date(dt);
      weekStart.setDate(dt.getDate() - day);
      key = weekStart.toISOString().split("T")[0];
    } else {
      key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-01`;
    }

    const existing = buckets.get(key);
    if (existing) {
      existing.views += d.views;
      existing.likes += d.likes;
      existing.comments += d.comments;
    } else {
      buckets.set(key, { date: key, views: d.views, likes: d.likes, comments: d.comments });
    }
  }

  return Array.from(buckets.values()).sort((a, b) => a.date.localeCompare(b.date));
}
