import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  flexRender,
  ColumnDef,
} from "@tanstack/react-table";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Mail,
  Send,
  Eye,
  MousePointer,
  Users,
  TrendingUp,
  ChevronRight,
  ChevronLeft,
  Clock,
  AlertCircle,
  Link as LinkIcon,
  Activity,
  BarChart3,
  FileDown,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { arSA } from "date-fns/locale";
import { formatNumber } from "@/lib/format";
import { apiUrl } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { NewsletterEditorialPanel } from "@/components/newsletter/NewsletterEditorialPanel";

interface Campaign {
  id: string;
  subject: string;
  templateType: string;
  recipientCount: number;
  openCount: number;
  clickCount: number;
  sentAt: string | null;
  status: string;
  createdAt: string;
}

interface CampaignDetail extends Campaign {
  events: Array<{
    id: string;
    email: string;
    eventType: string;
    linkUrl: string | null;
    ipAddress: string | null;
    createdAt: string;
  }>;
  eventStats: Record<string, number>;
}

interface CampaignsResponse {
  campaigns: Campaign[];
  total: number;
  limit: number;
  offset: number;
}

interface SubscribersResponse {
  total: number;
  active: number;
  unsubscribed: number;
  pending?: number;
}

type SubscriberSegmentFilter = "all" | "active" | "pending" | "unsubscribed";
type CampaignStatusFilter = "all" | "sent" | "sending" | "failed";
type FrequencyFilter = "all" | "daily" | "weekly";

const TEMPLATE_TYPES: Record<string, string> = {
  morning_brief: "ملخص صباحي",
  evening_digest: "ملخص مسائي",
  weekly_roundup: "ملخص أسبوعي",
  breaking_news: "أخبار عاجلة",
  personalized_digest: "ملخص مخصص",
};

const STATUS_LABELS: Record<string, { label: string; color: "default" | "secondary" | "destructive" }> = {
  sent: { label: "تم الإرسال", color: "default" },
  sending: { label: "جاري الإرسال", color: "secondary" },
  failed: { label: "فشل", color: "destructive" },
};

const CHART_COLORS = {
  opens: "#10b981",
  clicks: "#3b82f6",
  morning_brief: "#10b981",
  evening_digest: "#3b82f6",
  weekly_roundup: "#f59e0b",
  breaking_news: "#ef4444",
  personalized_digest: "#8b5cf6",
};

function StatCard({
  icon: Icon,
  label,
  value,
  subValue,
  color = "primary",
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  subValue?: string;
  color?: "primary" | "emerald" | "amber" | "violet";
}) {
  const colorClasses: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  };

  return (
    <Card className="rounded-2xl border-border/70 shadow-xs">
      <CardContent className="p-4 flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <div
            className="text-xl sm:text-2xl font-bold tabular-nums tracking-tight"
            data-testid={`stat-${label.replace(/\s/g, "-")}`}
          >
            {typeof value === "number" ? formatNumber(value) : value}
          </div>
          {subValue && (
            <p className="text-[11px] sm:text-xs text-muted-foreground tabular-nums truncate">
              {subValue}
            </p>
          )}
        </div>
        <div className={cn("p-2.5 rounded-xl shrink-0", colorClasses[color])}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

function LoadingState() {
  return (
    <DashboardLayout>
      <DashboardPageShell
        maxWidthClassName="max-w-[1600px]"
        contentClassName="px-4 pb-12 sm:px-6 space-y-6"
      >
        <div className="space-y-6" data-testid="newsletter-analytics-loading">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-80 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      </DashboardPageShell>
    </DashboardLayout>
  );
}

function CampaignDetailsDialog({
  campaignId,
  open,
  onClose,
}: {
  campaignId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const { data: campaign, isLoading } = useQuery<CampaignDetail>({
    queryKey: ["/api/newsletter/analytics/campaigns", campaignId],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/newsletter/analytics/campaigns/${campaignId}`), {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch campaign");
      return res.json();
    },
    enabled: !!campaignId && open,
  });

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh]" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            تفاصيل الحملة
          </DialogTitle>
          <DialogDescription>
            معلومات شاملة عن أداء الحملة
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4 py-4">
            <Skeleton className="h-8 w-full" />
            <div className="grid grid-cols-2 gap-3">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
            <Skeleton className="h-40" />
          </div>
        ) : campaign ? (
          <ScrollArea className="max-h-[70vh] pr-4">
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-lg mb-2" data-testid="campaign-subject">
                  {campaign.subject}
                </h3>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline">
                    {TEMPLATE_TYPES[campaign.templateType] || campaign.templateType}
                  </Badge>
                  <Badge variant={STATUS_LABELS[campaign.status]?.color || "secondary"}>
                    {STATUS_LABELS[campaign.status]?.label || campaign.status}
                  </Badge>
                  {campaign.sentAt && (
                    <span className="text-sm text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {format(new Date(campaign.sentAt), "dd MMM yyyy - HH:mm", { locale: arSA })}
                    </span>
                  )}
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  الإحصائيات الرئيسية
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">المستلمون</p>
                    <p className="text-xl font-bold" data-testid="stat-recipients">
                      {formatNumber(campaign.recipientCount)}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-emerald-500/10">
                    <p className="text-xs text-muted-foreground">مرات الفتح</p>
                    <p className="text-xl font-bold text-emerald-600" data-testid="stat-opens">
                      {formatNumber(campaign.openCount)}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-blue-500/10">
                    <p className="text-xs text-muted-foreground">النقرات</p>
                    <p className="text-xl font-bold text-blue-600" data-testid="stat-clicks">
                      {formatNumber(campaign.clickCount)}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-purple-500/10">
                    <p className="text-xs text-muted-foreground">معدل الفتح</p>
                    <p className="text-xl font-bold text-purple-600">
                      {campaign.recipientCount > 0
                        ? `${((campaign.openCount / campaign.recipientCount) * 100).toFixed(1)}%`
                        : "0%"}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-orange-500/10">
                    <p className="text-xs text-muted-foreground">معدل النقر</p>
                    <p className="text-xl font-bold text-orange-600">
                      {campaign.recipientCount > 0
                        ? `${((campaign.clickCount / campaign.recipientCount) * 100).toFixed(1)}%`
                        : "0%"}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-cyan-500/10">
                    <p className="text-xs text-muted-foreground">نسبة النقر للفتح</p>
                    <p className="text-xl font-bold text-cyan-600">
                      {campaign.openCount > 0
                        ? `${((campaign.clickCount / campaign.openCount) * 100).toFixed(1)}%`
                        : "0%"}
                    </p>
                  </div>
                </div>
              </div>

              {campaign.eventStats && Object.keys(campaign.eventStats).length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h4 className="font-medium mb-3 flex items-center gap-2">
                      <Activity className="h-4 w-4" />
                      توزيع الأحداث
                    </h4>
                    <div className="flex flex-wrap gap-3">
                      {Object.entries(campaign.eventStats).map(([type, count]) => (
                        <div
                          key={type}
                          className="px-3 py-2 rounded-lg bg-muted/50 flex items-center gap-2"
                        >
                          <span className="text-sm font-medium">
                            {type === "opened" ? "فتح" :
                             type === "clicked" ? "نقر" :
                             type === "sent" ? "إرسال" :
                             type === "bounced" ? "ارتداد" :
                             type === "unsubscribed" ? "إلغاء اشتراك" : type}
                          </span>
                          <Badge variant="secondary" className="tabular-nums">{formatNumber(count)}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {Array.isArray(campaign.events) && campaign.events.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h4 className="font-medium mb-3 flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      آخر الأحداث
                    </h4>
                    <div className="space-y-2">
                      {campaign.events.slice(0, 10).map((event) => (
                        <div
                          key={event.id}
                          className="p-2 rounded-lg bg-muted/50 text-sm flex items-center justify-between gap-2"
                          data-testid={`event-${event.id}`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {event.eventType === "opened" && <Eye className="h-4 w-4 text-emerald-500 flex-shrink-0" />}
                            {event.eventType === "clicked" && <MousePointer className="h-4 w-4 text-blue-500 flex-shrink-0" />}
                            <span className="truncate">{event.email}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Badge variant="outline" className="text-xs">
                              {event.eventType === "opened" ? "فتح" :
                               event.eventType === "clicked" ? "نقر" : event.eventType}
                            </Badge>
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {format(new Date(event.createdAt), "HH:mm", { locale: arSA })}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {Array.isArray(campaign.events) && campaign.events.filter(e => e.linkUrl).length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h4 className="font-medium mb-3 flex items-center gap-2">
                      <LinkIcon className="h-4 w-4" />
                      الروابط الأكثر نقراً
                    </h4>
                    <div className="space-y-2">
                      {Object.entries(
                        campaign.events
                          .filter(e => e.linkUrl)
                          .reduce((acc, e) => {
                            const url = e.linkUrl!;
                            acc[url] = (acc[url] || 0) + 1;
                            return acc;
                          }, {} as Record<string, number>)
                      )
                        .sort(([, a], [, b]) => b - a)
                        .slice(0, 5)
                        .map(([url, count]) => (
                          <div
                            key={url}
                            className="p-2 rounded-lg bg-muted/50 text-sm flex items-center justify-between gap-2"
                          >
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="truncate text-primary hover:underline flex-1"
                            >
                              {url}
                            </a>
                            <Badge className="tabular-nums">{count} نقرة</Badge>
                          </div>
                        ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </ScrollArea>
        ) : (
          <div className="py-8 text-center text-muted-foreground">
            <AlertCircle className="h-12 w-12 mx-auto mb-2" />
            <p>لم يتم العثور على الحملة</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function NewsletterAnalytics() {
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [offset] = useState(0);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<CampaignStatusFilter>("all");
  const [frequencyFilter, setFrequencyFilter] = useState<FrequencyFilter>("all");
  const [subscriberSegment, setSubscriberSegment] = useState<SubscriberSegmentFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const limit = 10;

  const {
    data: campaignsData,
    isLoading: isLoadingCampaigns,
    isFetching: isFetchingCampaigns,
    refetch: refetchCampaigns,
  } = useQuery<CampaignsResponse>({
    queryKey: ["/api/newsletter/analytics/campaigns", limit, offset],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/newsletter/analytics/campaigns?limit=${limit}&offset=${offset}`), {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch campaigns");
      return res.json();
    },
  });

  const {
    data: subscribersData,
    isFetching: isFetchingSubscribers,
    refetch: refetchSubscribers,
  } = useQuery<SubscribersResponse>({
    queryKey: ["/api/newsletter/subscribers/stats"],
  });

  const campaigns = Array.isArray(campaignsData?.campaigns) ? campaignsData.campaigns : [];
  const totalCampaigns = campaignsData?.total ?? campaigns.length;

  const subscriberCounts = useMemo(() => {
    const total = subscribersData?.total ?? 0;
    const active = subscribersData?.active ?? 0;
    const unsubscribed = subscribersData?.unsubscribed ?? 0;
    const pending =
      subscribersData?.pending ?? Math.max(0, total - active - unsubscribed);
    return { total, active, pending, unsubscribed };
  }, [subscribersData]);

  const stats = useMemo(() => {
    if (!campaigns.length) {
      return {
        totalSent: 0,
        avgOpenRate: 0,
        avgClickRate: 0,
        totalSubscribers: subscriberCounts.active,
      };
    }

    const sentCampaigns = campaigns.filter(c => c.status === "sent");
    const totalRecipients = sentCampaigns.reduce((sum, c) => sum + (c.recipientCount || 0), 0);
    const totalOpens = sentCampaigns.reduce((sum, c) => sum + (c.openCount || 0), 0);
    const totalClicks = sentCampaigns.reduce((sum, c) => sum + (c.clickCount || 0), 0);

    return {
      totalSent: totalCampaigns,
      avgOpenRate: totalRecipients > 0 ? (totalOpens / totalRecipients) * 100 : 0,
      avgClickRate: totalRecipients > 0 ? (totalClicks / totalRecipients) * 100 : 0,
      totalSubscribers: subscriberCounts.active,
    };
  }, [campaigns, totalCampaigns, subscriberCounts.active]);

  const chartData = useMemo(() => {
    const last7Days = campaigns
      .filter(c => c.sentAt)
      .slice(0, 14)
      .reverse()
      .map(c => ({
        date: format(new Date(c.sentAt!), "MM/dd", { locale: arSA }),
        opens: c.openCount,
        clicks: c.clickCount,
      }));

    return last7Days;
  }, [campaigns]);

  const performanceByType = useMemo(() => {
    const typeStats: Record<string, { opens: number; clicks: number; count: number }> = {};

    campaigns.forEach(c => {
      if (!typeStats[c.templateType]) {
        typeStats[c.templateType] = { opens: 0, clicks: 0, count: 0 };
      }
      typeStats[c.templateType].opens += c.openCount || 0;
      typeStats[c.templateType].clicks += c.clickCount || 0;
      typeStats[c.templateType].count += 1;
    });

    return Object.entries(typeStats).map(([type, data]) => ({
      type,
      typeAr: TEMPLATE_TYPES[type] || type,
      avgOpens: data.count > 0 ? Math.round(data.opens / data.count) : 0,
      avgClicks: data.count > 0 ? Math.round(data.clicks / data.count) : 0,
    }));
  }, [campaigns]);

  const statusCounts = useMemo(() => {
    return {
      all: campaigns.length,
      sent: campaigns.filter(c => c.status === "sent").length,
      sending: campaigns.filter(c => c.status === "sending").length,
      failed: campaigns.filter(c => c.status === "failed").length,
    };
  }, [campaigns]);

  const frequencyCounts = useMemo(() => {
    return {
      all: campaigns.length,
      daily: campaigns.filter(c => c.templateType === "morning_brief" || c.templateType === "evening_digest").length,
      weekly: campaigns.filter(c => c.templateType === "weekly_roundup").length,
    };
  }, [campaigns]);

  const filteredCampaigns = useMemo(() => {
    let filtered = campaigns;

    if (typeFilter !== "all") {
      filtered = filtered.filter(c => c.templateType === typeFilter);
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter(c => c.status === statusFilter);
    }

    if (frequencyFilter === "daily") {
      filtered = filtered.filter(
        c => c.templateType === "morning_brief" || c.templateType === "evening_digest"
      );
    } else if (frequencyFilter === "weekly") {
      filtered = filtered.filter(c => c.templateType === "weekly_roundup");
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      filtered = filtered.filter(c =>
        (c.subject || "").toLowerCase().includes(q) ||
        (TEMPLATE_TYPES[c.templateType] || c.templateType || "").toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [campaigns, typeFilter, statusFilter, frequencyFilter, searchQuery]);

  function handleExportCsv() {
    if (!filteredCampaigns.length) return;
    const headers = ["Subject", "Type", "Status", "Recipients", "Opens", "Clicks", "SentAt"];
    const rows = filteredCampaigns.map((c) => [
      `"${(c.subject || "").replace(/"/g, '""')}"`,
      TEMPLATE_TYPES[c.templateType] || c.templateType,
      STATUS_LABELS[c.status]?.label || c.status,
      c.recipientCount ?? 0,
      c.openCount ?? 0,
      c.clickCount ?? 0,
      c.sentAt || "",
    ]);
    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sabq-newsletter-campaigns-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const columns: ColumnDef<Campaign>[] = [
    {
      accessorKey: "subject",
      header: "الموضوع",
      cell: ({ row }) => (
        <div className="max-w-[220px] truncate font-medium" data-testid={`row-subject-${row.original.id}`}>
          {row.original.subject}
        </div>
      ),
    },
    {
      accessorKey: "templateType",
      header: "النوع",
      cell: ({ row }) => (
        <Badge variant="outline">
          {TEMPLATE_TYPES[row.original.templateType] || row.original.templateType}
        </Badge>
      ),
    },
    {
      accessorKey: "recipientCount",
      header: "المستلمون",
      cell: ({ row }) => (
        <span className="tabular-nums">{formatNumber(row.original.recipientCount)}</span>
      ),
    },
    {
      accessorKey: "openCount",
      header: "الفتحات",
      cell: ({ row }) => (
        <span className="text-emerald-600 font-medium tabular-nums">
          {formatNumber(row.original.openCount)}
        </span>
      ),
    },
    {
      accessorKey: "clickCount",
      header: "النقرات",
      cell: ({ row }) => (
        <span className="text-blue-600 font-medium tabular-nums">
          {formatNumber(row.original.clickCount)}
        </span>
      ),
    },
    {
      id: "openRate",
      header: "معدل الفتح",
      cell: ({ row }) => {
        const rate = row.original.recipientCount > 0
          ? (row.original.openCount / row.original.recipientCount) * 100
          : 0;
        return <span className="tabular-nums">{`${rate.toFixed(1)}%`}</span>;
      },
    },
    {
      id: "clickRate",
      header: "معدل النقر",
      cell: ({ row }) => {
        const rate = row.original.recipientCount > 0
          ? (row.original.clickCount / row.original.recipientCount) * 100
          : 0;
        return <span className="tabular-nums">{`${rate.toFixed(1)}%`}</span>;
      },
    },
    {
      accessorKey: "sentAt",
      header: "تاريخ الإرسال",
      cell: ({ row }) =>
        row.original.sentAt ? (
          <span className="tabular-nums">
            {format(new Date(row.original.sentAt), "dd MMM yyyy", { locale: arSA })}
          </span>
        ) : (
          "-"
        ),
    },
    {
      accessorKey: "status",
      header: "الحالة",
      cell: ({ row }) => (
        <Badge variant={STATUS_LABELS[row.original.status]?.color || "secondary"}>
          {STATUS_LABELS[row.original.status]?.label || row.original.status}
        </Badge>
      ),
    },
  ];

  const table = useReactTable({
    data: filteredCampaigns,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: { pageSize: 10 },
    },
  });

  if (isLoadingCampaigns) {
    return <LoadingState />;
  }

  const isRefreshing = isFetchingCampaigns || isFetchingSubscribers;
  const visibleRows = table.getRowModel().rows ?? [];

  return (
    <DashboardLayout>
      <DashboardPageShell
        maxWidthClassName="max-w-[1600px]"
        contentClassName="px-4 pb-12 sm:px-6 space-y-6"
      >
        <div className="space-y-6" dir="rtl" data-testid="page-newsletter-analytics">
          {/* Unified Dashboard Page Header */}
          <DashboardPageHeader
            icon={Mail}
            titleTestId="text-page-title"
            title={
              <div className="flex flex-wrap items-center gap-2">
                <span>تحليلات النشرة البريدية</span>
                <Badge
                  variant="outline"
                  className="text-xs border-emerald-500/30 text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 tabular-nums"
                >
                  {formatNumber(subscriberCounts.active)} مشترك نشط
                </Badge>
                <Badge variant="secondary" className="text-xs tabular-nums">
                  {formatNumber(stats.totalSent)} حملة
                </Badge>
              </div>
            }
            description="إحصائيات شاملة لأداء حملات البريد الإلكتروني، معدلات الفتح والنقر، شرائح المشتركين، وتجهيز المسودات التحريرية."
            actions={
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    refetchCampaigns();
                    refetchSubscribers();
                  }}
                  disabled={isRefreshing}
                  className="gap-1.5 rounded-xl"
                  data-testid="button-refresh-newsletter"
                >
                  <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
                  تحديث
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 rounded-xl"
                  data-testid="button-send-test"
                >
                  <Send className="h-4 w-4" />
                  إرسال تجريبي
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportCsv}
                  className="gap-1.5 rounded-xl"
                  data-testid="button-export"
                >
                  <FileDown className="h-4 w-4" />
                  تصدير البيانات
                </Button>
              </>
            }
          />

          {/* 4-Card KPI Summary Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatCard
              icon={Send}
              label="إجمالي الحملات"
              value={stats.totalSent}
              subValue="حملة مرسلة"
              color="primary"
            />
            <StatCard
              icon={Eye}
              label="متوسط معدل الفتح"
              value={`${stats.avgOpenRate.toFixed(1)}%`}
              subValue="من إجمالي المستلمين"
              color="emerald"
            />
            <StatCard
              icon={MousePointer}
              label="متوسط معدل النقر"
              value={`${stats.avgClickRate.toFixed(1)}%`}
              subValue="من إجمالي المستلمين"
              color="amber"
            />
            <StatCard
              icon={Users}
              label={
                subscriberSegment === "active"
                  ? "المشتركون النشطون"
                  : subscriberSegment === "pending"
                    ? "مشتركون بانتظار التأكيد"
                    : subscriberSegment === "unsubscribed"
                      ? "المشتركون الملغون"
                      : "إجمالي المشتركين"
              }
              value={
                subscriberSegment === "active"
                  ? subscriberCounts.active
                  : subscriberSegment === "pending"
                    ? subscriberCounts.pending
                    : subscriberSegment === "unsubscribed"
                      ? subscriberCounts.unsubscribed
                      : stats.totalSubscribers
              }
              subValue={
                subscriberSegment === "active"
                  ? `${subscriberCounts.total > 0 ? Math.round((subscriberCounts.active / subscriberCounts.total) * 100) : 0}% من إجمالي القاعدة`
                  : subscriberSegment === "pending"
                    ? `${subscriberCounts.total > 0 ? Math.round((subscriberCounts.pending / subscriberCounts.total) * 100) : 0}% بانتظار التفعيل`
                    : subscriberSegment === "unsubscribed"
                      ? `${subscriberCounts.total > 0 ? Math.round((subscriberCounts.unsubscribed / subscriberCounts.total) * 100) : 0}% ألغوا الاشتراك`
                      : "مشترك مسجل"
              }
              color="violet"
            />
          </div>

          {/* Subscriber Segments & Frequency Filter Bar */}
          <Card className="rounded-2xl border-border/70 shadow-xs">
            <CardContent className="p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <Users className="h-4 w-4 text-primary" />
                  <span>شرائح المشتركين وحالة التأكيد:</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      { key: "all", label: "الكل", count: subscriberCounts.total },
                      { key: "active", label: "نشط", count: subscriberCounts.active },
                      { key: "pending", label: "بانتظار التأكيد", count: subscriberCounts.pending },
                      { key: "unsubscribed", label: "ملغى", count: subscriberCounts.unsubscribed },
                    ] as const
                  ).map((seg) => {
                    const active = subscriberSegment === seg.key;
                    return (
                      <button
                        key={seg.key}
                        type="button"
                        onClick={() => setSubscriberSegment(seg.key)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                          active
                            ? "border-primary bg-primary text-primary-foreground shadow-2xs"
                            : "border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                        data-testid={`filter-subscriber-${seg.key}`}
                      >
                        <span>{seg.label}</span>
                        <span
                          className={cn(
                            "rounded-full px-1.5 py-0 text-[11px] tabular-nums",
                            active
                              ? "bg-primary-foreground/20 text-primary-foreground"
                              : "bg-background/80 text-muted-foreground"
                          )}
                        >
                          {formatNumber(seg.count)}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {subscriberSegment !== "all" && (
                  <p className="text-[11px] text-muted-foreground" data-testid="text-subscriber-segment-summary">
                    {subscriberSegment === "active" &&
                      `تستهدف الحملات البريدية المرسلة شريحة المشتركين النشطين (${formatNumber(subscriberCounts.active)} مشترك).`}
                    {subscriberSegment === "pending" &&
                      `يوجد ${formatNumber(subscriberCounts.pending)} مشترك بانتظار تأكيد البريد الإلكتروني قبل استلام النشرات.`}
                    {subscriberSegment === "unsubscribed" &&
                      `ألغى ${formatNumber(subscriberCounts.unsubscribed)} مشترك اشتراكهم في النشرة البريدية.`}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <Clock className="h-4 w-4 text-primary" />
                  <span>تصفية الحملات حسب الوتيرة:</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      { key: "all", label: "الكل", count: frequencyCounts.all },
                      { key: "daily", label: "يومي", count: frequencyCounts.daily },
                      { key: "weekly", label: "أسبوعي", count: frequencyCounts.weekly },
                    ] as const
                  ).map((freq) => {
                    const active = frequencyFilter === freq.key;
                    return (
                      <button
                        key={freq.key}
                        type="button"
                        onClick={() => setFrequencyFilter(freq.key)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                          active
                            ? "border-primary bg-primary text-primary-foreground shadow-2xs"
                            : "border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                        data-testid={`filter-frequency-${freq.key}`}
                      >
                        <span>{freq.label}</span>
                        <span
                          className={cn(
                            "rounded-full px-1.5 py-0 text-[11px] tabular-nums",
                            active
                              ? "bg-primary-foreground/20 text-primary-foreground"
                              : "bg-background/80 text-muted-foreground"
                          )}
                        >
                          {formatNumber(freq.count)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          <NewsletterEditorialPanel />

          <div className="grid gap-6 md:grid-cols-2">
            <Card className="rounded-2xl border-border/70 shadow-xs">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  <CardTitle>الفتحات والنقرات عبر الوقت</CardTitle>
                </div>
                <CardDescription>
                  أداء آخر الحملات المرسلة
                </CardDescription>
              </CardHeader>
              <CardContent>
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300} data-testid="chart-timeline">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip
                        formatter={(value: number, name: string) => [
                          formatNumber(value),
                          name === "opens" ? "الفتحات" : "النقرات",
                        ]}
                      />
                      <Legend
                        formatter={(value) => (value === "opens" ? "الفتحات" : "النقرات")}
                      />
                      <Line
                        type="monotone"
                        dataKey="opens"
                        stroke={CHART_COLORS.opens}
                        strokeWidth={2}
                        dot={{ fill: CHART_COLORS.opens }}
                      />
                      <Line
                        type="monotone"
                        dataKey="clicks"
                        stroke={CHART_COLORS.clicks}
                        strokeWidth={2}
                        dot={{ fill: CHART_COLORS.clicks }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    لا توجد بيانات كافية لعرض الرسم البياني
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-border/70 shadow-xs">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  <CardTitle>الأداء حسب نوع النشرة</CardTitle>
                </div>
                <CardDescription>
                  مقارنة متوسط الفتحات والنقرات
                </CardDescription>
              </CardHeader>
              <CardContent>
                {performanceByType.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300} data-testid="chart-by-type">
                    <BarChart data={performanceByType}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="typeAr" tick={{ fontSize: 11 }} />
                      <YAxis />
                      <Tooltip
                        formatter={(value: number, name: string) => [
                          formatNumber(value),
                          name === "avgOpens" ? "متوسط الفتحات" : "متوسط النقرات",
                        ]}
                      />
                      <Legend
                        formatter={(value) =>
                          value === "avgOpens" ? "متوسط الفتحات" : "متوسط النقرات"
                        }
                      />
                      <Bar dataKey="avgOpens" fill={CHART_COLORS.opens} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="avgClicks" fill={CHART_COLORS.clicks} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    لا توجد بيانات كافية لعرض الرسم البياني
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-2xl border-border/70 shadow-xs overflow-hidden">
            <CardHeader className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Mail className="h-5 w-5 text-primary" />
                    الحملات الأخيرة
                  </CardTitle>
                  <CardDescription>
                    قائمة بجميع حملات البريد الإلكتروني المرسلة
                  </CardDescription>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <div className="relative flex-1 sm:flex-initial">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="بحث في الموضوع أو النوع..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pr-10 pl-8 w-full sm:w-[220px] rounded-xl"
                      data-testid="input-search"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery("")}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label="مسح البحث"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="w-full sm:w-[180px] rounded-xl" data-testid="select-type-filter">
                      <SelectValue placeholder="تصفية حسب النوع" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">جميع الأنواع</SelectItem>
                      {Object.entries(TEMPLATE_TYPES).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Campaign Status Quick Filter Pills */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border/50">
                {(
                  [
                    { key: "all", label: "الكل", count: statusCounts.all },
                    { key: "sent", label: "تم الإرسال", count: statusCounts.sent },
                    { key: "sending", label: "جاري الإرسال", count: statusCounts.sending },
                    { key: "failed", label: "فشل", count: statusCounts.failed },
                  ] as const
                ).map((pill) => {
                  const active = statusFilter === pill.key;
                  return (
                    <button
                      key={pill.key}
                      type="button"
                      onClick={() => setStatusFilter(pill.key)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                        active
                          ? "border-primary bg-primary text-primary-foreground shadow-2xs"
                          : "border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                      data-testid={`filter-campaign-status-${pill.key}`}
                    >
                      <span>{pill.label}</span>
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0 text-[11px] tabular-nums",
                          active
                            ? "bg-primary-foreground/20 text-primary-foreground"
                            : "bg-background/80 text-muted-foreground"
                        )}
                      >
                        {formatNumber(pill.count)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </CardHeader>

            <CardContent>
              {/* Desktop Table View (md and up) */}
              <div className="hidden md:block rounded-xl border border-border/70 overflow-x-auto">
                <Table>
                  <TableHeader>
                    {table.getHeaderGroups().map((headerGroup) => (
                      <TableRow key={headerGroup.id}>
                        {headerGroup.headers.map((header) => (
                          <TableHead key={header.id} className="text-right">
                            {header.isPlaceholder
                              ? null
                              : flexRender(header.column.columnDef.header, header.getContext())}
                          </TableHead>
                        ))}
                      </TableRow>
                    ))}
                  </TableHeader>
                  <TableBody>
                    {visibleRows.length ? (
                      visibleRows.map((row) => (
                        <TableRow
                          key={row.id}
                          className="cursor-pointer hover-elevate"
                          onClick={() => setSelectedCampaignId(row.original.id)}
                          data-testid={`row-campaign-${row.original.id}`}
                        >
                          {row.getVisibleCells().map((cell) => (
                            <TableCell key={cell.id}>
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={columns.length} className="h-24 text-center">
                          لا توجد حملات
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Card View (below md — zero horizontal overflow on 390px) */}
              <div className="md:hidden space-y-3">
                {visibleRows.length ? (
                  visibleRows.map((row) => {
                    const c = row.original;
                    const openRate =
                      c.recipientCount > 0 ? ((c.openCount / c.recipientCount) * 100).toFixed(1) : "0.0";
                    const clickRate =
                      c.recipientCount > 0 ? ((c.clickCount / c.recipientCount) * 100).toFixed(1) : "0.0";

                    return (
                      <div
                        key={c.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedCampaignId(c.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedCampaignId(c.id);
                          }
                        }}
                        className="rounded-xl border border-border/70 bg-card p-3.5 space-y-3 shadow-2xs active:bg-muted/30 transition-colors"
                        data-testid={`row-campaign-mobile-${c.id}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p
                            className="font-semibold text-sm leading-snug text-foreground line-clamp-2 min-w-0"
                            data-testid={`row-subject-mobile-${c.id}`}
                          >
                            {c.subject}
                          </p>
                          <Badge
                            variant={STATUS_LABELS[c.status]?.color || "secondary"}
                            className="shrink-0 text-[11px]"
                          >
                            {STATUS_LABELS[c.status]?.label || c.status}
                          </Badge>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline" className="text-[11px]">
                            {TEMPLATE_TYPES[c.templateType] || c.templateType}
                          </Badge>
                          <span className="tabular-nums">
                            {c.sentAt
                              ? format(new Date(c.sentAt), "dd MMM yyyy", { locale: arSA })
                              : "-"}
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/50 text-center">
                          <div className="rounded-lg bg-muted/30 p-2">
                            <p className="text-[10px] text-muted-foreground">المستلمون</p>
                            <p className="text-xs font-bold tabular-nums mt-0.5">
                              {formatNumber(c.recipientCount)}
                            </p>
                          </div>
                          <div className="rounded-lg bg-emerald-500/10 p-2">
                            <p className="text-[10px] text-muted-foreground">الفتحات</p>
                            <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">
                              {formatNumber(c.openCount)} ({openRate}%)
                            </p>
                          </div>
                          <div className="rounded-lg bg-blue-500/10 p-2">
                            <p className="text-[10px] text-muted-foreground">النقرات</p>
                            <p className="text-xs font-bold text-blue-600 dark:text-blue-400 tabular-nums mt-0.5">
                              {formatNumber(c.clickCount)} ({clickRate}%)
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-xl border border-border/60 py-10 text-center text-sm text-muted-foreground">
                    لا توجد حملات
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-muted-foreground tabular-nums">
                  {filteredCampaigns.length} من {totalCampaigns} حملة
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => table.previousPage()}
                    disabled={!table.getCanPreviousPage()}
                    data-testid="button-prev-page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <span className="text-sm tabular-nums">
                    صفحة {table.getState().pagination.pageIndex + 1} من{" "}
                    {Math.max(1, table.getPageCount())}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => table.nextPage()}
                    disabled={!table.getCanNextPage()}
                    data-testid="button-next-page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <CampaignDetailsDialog
            campaignId={selectedCampaignId}
            open={!!selectedCampaignId}
            onClose={() => setSelectedCampaignId(null)}
          />
        </div>
      </DashboardPageShell>
    </DashboardLayout>
  );
}
