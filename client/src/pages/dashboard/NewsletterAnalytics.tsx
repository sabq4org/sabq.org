import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
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
  Cell,
} from "recharts";
import {
  Mail,
  Send,
  Eye,
  MousePointer,
  Users,
  TrendingUp,
  Download,
  ChevronRight,
  ChevronLeft,
  Clock,
  CheckCircle,
  AlertCircle,
  Link as LinkIcon,
  Activity,
  BarChart3,
  FileDown,
  Search,
} from "lucide-react";
import { format } from "date-fns";
import { arSA } from "date-fns/locale";

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
}

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
  color?: "primary" | "blue" | "green" | "purple" | "orange";
}) {
  const colorClasses: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    blue: "bg-blue-500/10 text-blue-500",
    green: "bg-emerald-500/10 text-emerald-500",
    purple: "bg-purple-500/10 text-purple-500",
    orange: "bg-orange-500/10 text-orange-500",
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold" data-testid={`stat-${label.replace(/\s/g, "-")}`}>
          {typeof value === "number" ? value.toLocaleString("ar-SA") : value}
        </div>
        {subValue && (
          <p className="text-xs text-muted-foreground mt-1">{subValue}</p>
        )}
      </CardContent>
    </Card>
  );
}

function LoadingState() {
  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="newsletter-analytics-loading">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-80" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
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
      const res = await fetch(`/api/newsletter/analytics/campaigns/${campaignId}`, {
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
                      {campaign.recipientCount.toLocaleString("ar-SA")}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-emerald-500/10">
                    <p className="text-xs text-muted-foreground">مرات الفتح</p>
                    <p className="text-xl font-bold text-emerald-600" data-testid="stat-opens">
                      {campaign.openCount.toLocaleString("ar-SA")}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-blue-500/10">
                    <p className="text-xs text-muted-foreground">النقرات</p>
                    <p className="text-xl font-bold text-blue-600" data-testid="stat-clicks">
                      {campaign.clickCount.toLocaleString("ar-SA")}
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
                          <Badge variant="secondary">{count.toLocaleString("ar-SA")}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {campaign.events && campaign.events.length > 0 && (
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
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(event.createdAt), "HH:mm", { locale: arSA })}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {campaign.events && campaign.events.filter(e => e.linkUrl).length > 0 && (
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
                            <Badge>{count} نقرة</Badge>
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
  const [offset, setOffset] = useState(0);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const limit = 10;

  const { data: campaignsData, isLoading: isLoadingCampaigns } = useQuery<CampaignsResponse>({
    queryKey: ["/api/newsletter/analytics/campaigns", limit, offset],
    queryFn: async () => {
      const res = await fetch(`/api/newsletter/analytics/campaigns?limit=${limit}&offset=${offset}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch campaigns");
      return res.json();
    },
  });

  const { data: subscribersData } = useQuery<SubscribersResponse>({
    queryKey: ["/api/newsletter/subscribers/stats"],
  });

  const campaigns = campaignsData?.campaigns || [];
  const totalCampaigns = campaignsData?.total || 0;

  const stats = useMemo(() => {
    if (!campaigns.length) {
      return {
        totalSent: 0,
        avgOpenRate: 0,
        avgClickRate: 0,
        totalSubscribers: subscribersData?.active || 0,
      };
    }

    const sentCampaigns = campaigns.filter(c => c.status === "sent");
    const totalRecipients = sentCampaigns.reduce((sum, c) => sum + c.recipientCount, 0);
    const totalOpens = sentCampaigns.reduce((sum, c) => sum + c.openCount, 0);
    const totalClicks = sentCampaigns.reduce((sum, c) => sum + c.clickCount, 0);

    return {
      totalSent: totalCampaigns,
      avgOpenRate: totalRecipients > 0 ? (totalOpens / totalRecipients) * 100 : 0,
      avgClickRate: totalRecipients > 0 ? (totalClicks / totalRecipients) * 100 : 0,
      totalSubscribers: subscribersData?.active || 0,
    };
  }, [campaigns, totalCampaigns, subscribersData]);

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
      typeStats[c.templateType].opens += c.openCount;
      typeStats[c.templateType].clicks += c.clickCount;
      typeStats[c.templateType].count += 1;
    });

    return Object.entries(typeStats).map(([type, data]) => ({
      type,
      typeAr: TEMPLATE_TYPES[type] || type,
      avgOpens: data.count > 0 ? Math.round(data.opens / data.count) : 0,
      avgClicks: data.count > 0 ? Math.round(data.clicks / data.count) : 0,
    }));
  }, [campaigns]);

  const filteredCampaigns = useMemo(() => {
    let filtered = campaigns;

    if (typeFilter !== "all") {
      filtered = filtered.filter(c => c.templateType === typeFilter);
    }

    if (searchQuery) {
      filtered = filtered.filter(c =>
        c.subject.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    return filtered;
  }, [campaigns, typeFilter, searchQuery]);

  const columns: ColumnDef<Campaign>[] = [
    {
      accessorKey: "subject",
      header: "الموضوع",
      cell: ({ row }) => (
        <div className="max-w-[200px] truncate font-medium" data-testid={`row-subject-${row.original.id}`}>
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
      cell: ({ row }) => row.original.recipientCount.toLocaleString("ar-SA"),
    },
    {
      accessorKey: "openCount",
      header: "الفتحات",
      cell: ({ row }) => (
        <span className="text-emerald-600 font-medium">
          {row.original.openCount.toLocaleString("ar-SA")}
        </span>
      ),
    },
    {
      accessorKey: "clickCount",
      header: "النقرات",
      cell: ({ row }) => (
        <span className="text-blue-600 font-medium">
          {row.original.clickCount.toLocaleString("ar-SA")}
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
        return `${rate.toFixed(1)}%`;
      },
    },
    {
      id: "clickRate",
      header: "معدل النقر",
      cell: ({ row }) => {
        const rate = row.original.recipientCount > 0
          ? (row.original.clickCount / row.original.recipientCount) * 100
          : 0;
        return `${rate.toFixed(1)}%`;
      },
    },
    {
      accessorKey: "sentAt",
      header: "تاريخ الإرسال",
      cell: ({ row }) =>
        row.original.sentAt
          ? format(new Date(row.original.sentAt), "dd MMM yyyy", { locale: arSA })
          : "-",
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

  return (
    <DashboardLayout>
      <div className="space-y-6" dir="rtl" data-testid="page-newsletter-analytics">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Mail className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold" data-testid="text-page-title">
                تحليلات النشرة البريدية
              </h1>
              <p className="text-muted-foreground mt-1">
                إحصائيات شاملة لأداء حملات البريد الإلكتروني
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" data-testid="button-send-test">
              <Send className="h-4 w-4 ml-2" />
              إرسال تجريبي
            </Button>
            <Button variant="outline" data-testid="button-export">
              <FileDown className="h-4 w-4 ml-2" />
              تصدير البيانات
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
            color="green"
          />
          <StatCard
            icon={MousePointer}
            label="متوسط معدل النقر"
            value={`${stats.avgClickRate.toFixed(1)}%`}
            subValue="من إجمالي المستلمين"
            color="blue"
          />
          <StatCard
            icon={Users}
            label="إجمالي المشتركين"
            value={stats.totalSubscribers}
            subValue="مشترك نشط"
            color="purple"
          />
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
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
                        value.toLocaleString("ar-SA"),
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

          <Card>
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
                        value.toLocaleString("ar-SA"),
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

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  الحملات الأخيرة
                </CardTitle>
                <CardDescription>
                  قائمة بجميع حملات البريد الإلكتروني المرسلة
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="بحث..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pr-10 w-[200px]"
                    data-testid="input-search"
                  />
                </div>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-[180px]" data-testid="select-type-filter">
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
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
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
                  {table.getRowModel().rows?.length ? (
                    table.getRowModel().rows.map((row) => (
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

            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-muted-foreground">
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
                <span className="text-sm">
                  صفحة {table.getState().pagination.pageIndex + 1} من{" "}
                  {table.getPageCount()}
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
    </DashboardLayout>
  );
}
