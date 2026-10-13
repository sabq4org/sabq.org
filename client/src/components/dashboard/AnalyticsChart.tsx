import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import ReactApexChart from "react-apexcharts";
import { ApexOptions } from "apexcharts";
import { useTheme } from "@/components/ThemeProvider";
import { TrendingUp } from "lucide-react";

interface ChartData {
  months?: string[];
  views?: number[];
  users?: number[];
  articles?: number[];
}

const MONTH_MAP_AR: Record<string, string> = {
  Jan: "يناير",
  Feb: "فبراير",
  Mar: "مارس",
  Apr: "أبريل",
  May: "مايو",
  Jun: "يونيو",
  Jul: "يوليو",
  Aug: "أغسطس",
  Sep: "سبتمبر",
  Oct: "أكتوبر",
  Nov: "نوفمبر",
  Dec: "ديسمبر",
};

function formatMonthLabelAr(raw: string): string {
  const parts = raw.trim().split(/\s+/);
  if (parts.length === 2 && MONTH_MAP_AR[parts[0]]) {
    return `${MONTH_MAP_AR[parts[0]]} ${parts[1]}`;
  }
  return MONTH_MAP_AR[raw] || raw;
}

export default function AnalyticsChart() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const { data: chartData, isLoading } = useQuery<ChartData>({
    queryKey: ["/api/analytics/chart"],
  });

  const categories = Array.isArray(chartData?.months) && chartData.months.length > 0
    ? chartData.months.map(formatMonthLabelAr)
    : [
        "يناير",
        "فبراير",
        "مارس",
        "أبريل",
        "مايو",
        "يونيو",
        "يوليو",
        "أغسطس",
        "سبتمبر",
        "أكتوبر",
        "نوفمبر",
        "ديسمبر",
      ];

  const viewsSeries = Array.isArray(chartData?.views) ? chartData.views : [];
  const usersSeries = Array.isArray(chartData?.users) ? chartData.users : [];
  const articlesSeries = Array.isArray(chartData?.articles) ? chartData.articles : [];

  const total12MViews = viewsSeries.reduce((a, b) => a + (b || 0), 0);
  const total12MArticles = articlesSeries.reduce((a, b) => a + (b || 0), 0);

  const series = [
    {
      name: "القراءات الشهرية",
      data: viewsSeries,
    },
    {
      name: "المقالات المنشورة",
      data: articlesSeries,
    },
    {
      name: "المستخدمون الجدد",
      data: usersSeries,
    },
  ];

  const options: ApexOptions = {
    chart: {
      type: "area",
      height: 360,
      toolbar: {
        show: false,
      },
      background: "transparent",
      fontFamily: "Tajawal, sans-serif",
    },
    dataLabels: {
      enabled: false,
    },
    stroke: {
      curve: "smooth",
      width: [2.5, 2, 2],
    },
    xaxis: {
      categories,
      labels: {
        style: {
          colors: isDark ? "#94a3b8" : "#64748b",
          fontSize: "11px",
        },
      },
      axisBorder: {
        show: false,
      },
      axisTicks: {
        show: false,
      },
    },
    yaxis: {
      labels: {
        formatter: (val: number) => Math.round(val).toLocaleString("en-US"),
        style: {
          colors: isDark ? "#94a3b8" : "#64748b",
          fontSize: "11px",
        },
      },
    },
    colors: ["#3b82f6", "#8b5cf6", "#10b981"],
    fill: {
      type: "gradient",
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.35,
        opacityTo: 0.03,
        stops: [0, 90, 100],
      },
    },
    grid: {
      borderColor: isDark ? "#1e293b" : "#e2e8f0",
      strokeDashArray: 4,
    },
    legend: {
      position: "top",
      horizontalAlign: "right",
      labels: {
        colors: isDark ? "#cbd5e1" : "#475569",
      },
    },
    tooltip: {
      theme: isDark ? "dark" : "light",
      y: {
        formatter: (val: number) => `${Math.round(val).toLocaleString("en-US")}`,
      },
    },
  };

  if (isLoading) {
    return (
      <Card className="border-border/60">
        <CardHeader>
          <div className="h-6 w-44 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-4 w-64 animate-pulse rounded bg-muted" />
        </CardHeader>
        <CardContent>
          <div className="h-[360px] animate-pulse rounded-xl bg-muted/40" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-col gap-3 border-b border-border/50 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingUp className="h-5 w-5 text-primary" />
            منحنى النمو والنشاط خلال 12 شهراً
          </CardTitle>
          <CardDescription className="mt-1">
            تطور حجم القراءات والمقالات المنشورة والمستخدمين الجدد شهرياً
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="tabular-nums">
            قراءات 12 شهراً: {total12MViews.toLocaleString("en-US")}
          </Badge>
          <Badge variant="outline" className="tabular-nums">
            مقالات منشورة: {total12MArticles.toLocaleString("en-US")}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <ReactApexChart options={options} series={series} type="area" height={360} />
      </CardContent>
    </Card>
  );
}
