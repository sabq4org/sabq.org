import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, apiUrl } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus,
  Bell,
  Users,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Clock,
  Edit,
  Trash2,
  Send,
  Smartphone,
  Calendar,
  Eye,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  Target,
  Loader2,
  Search,
  Sparkles,
  Radio,
  Link2,
  Zap,
  Globe,
  ShieldCheck,
  AlertTriangle,
  MousePointerClick,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

interface Campaign {
  id: string;
  name: string;
  type: string;
  title: string;
  titleAr?: string;
  body: string;
  bodyAr?: string;
  imageUrl?: string;
  deeplink?: string;
  articleId?: string;
  segmentId?: string;
  targetAll: boolean;
  status: string;
  scheduledAt?: string;
  sentAt?: string;
  priority: string;
  totalDevices: number;
  sentCount: number;
  deliveredCount: number;
  openedCount: number;
  clickedCount: number;
  failedCount: number;
  createdAt: string;
  updatedAt?: string;
}

interface PushStatus {
  configured: boolean;
  environment: string;
  devices: {
    total: number;
    active: number;
    ios: number;
    android: number;
  };
}

interface Segment {
  id: string;
  name: string;
  nameAr?: string;
  description?: string;
  criteria: any;
  createdAt: string;
}

interface Analytics {
  campaigns: {
    totalCampaigns: number;
    totalSent: number;
    totalDelivered: number;
    totalOpened: number;
    totalClicked: number;
    totalFailed: number;
  };
  devices: {
    total: number;
    active: number;
  };
  recentCampaigns: {
    id: string;
    name: string;
    type: string;
    status: string;
    sentCount: number;
    openedCount: number;
    sentAt: string;
  }[];
}

interface CampaignFormData {
  name: string;
  type: string;
  title: string;
  body: string;
  imageUrl: string;
  deeplink: string;
  targetAll: boolean;
  segmentId: string;
  scheduledAt: string;
  priority: string;
}

// Topic-based types - these send to Firebase Topics automatically (prefix: topic_)
const TOPIC_CAMPAIGN_TYPES = [
  { value: "topic_all_users", label: "جميع المستخدمين (Topic)", isTopic: true },
  { value: "topic_breaking_news", label: "أخبار عاجلة (Topic)", isTopic: true },
  { value: "topic_sports", label: "الرياضة (Topic)", isTopic: true },
  { value: "topic_politics", label: "السياسة (Topic)", isTopic: true },
  { value: "topic_economy", label: "الاقتصاد (Topic)", isTopic: true },
  { value: "topic_technology", label: "التقنية (Topic)", isTopic: true },
];

// Device-based types - these send to registered devices in database
const DEVICE_CAMPAIGN_TYPES = [
  { value: "breaking_news", label: "أخبار عاجلة", isTopic: false },
  { value: "promotion", label: "ترويج", isTopic: false },
  { value: "personalized", label: "مخصص", isTopic: false },
  { value: "event", label: "حدث", isTopic: false },
  { value: "custom", label: "آخر", isTopic: false },
];

const CAMPAIGN_TYPES = [...TOPIC_CAMPAIGN_TYPES, ...DEVICE_CAMPAIGN_TYPES];

const CAMPAIGN_STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "مسودة", variant: "secondary" },
  scheduled: { label: "مجدولة", variant: "outline" },
  delivery_unknown: { label: "التسليم غير مؤكد — يحتاج مراجعة", variant: "destructive" },
  sending: { label: "جاري الإرسال", variant: "default" },
  sent: { label: "مرسلة", variant: "default" },
  failed: { label: "فشلت", variant: "destructive" },
};

const QUICK_STATUS_PILLS = [
  { value: "all", label: "الكل" },
  { value: "sent", label: "مرسلة" },
  { value: "scheduled", label: "مجدولة" },
  { value: "draft", label: "مسودة" },
  { value: "sending", label: "جاري الإرسال" },
  { value: "failed", label: "فشلت" },
] as const;

const PRIORITY_OPTIONS = [
  { value: "low", label: "منخفضة" },
  { value: "normal", label: "عادية" },
  { value: "high", label: "عالية" },
];

const DEFAULT_FORM_DATA: CampaignFormData = {
  name: "",
  type: "topic_all_users", // Default to all users topic
  title: "",
  body: "",
  imageUrl: "",
  deeplink: "",
  targetAll: true,
  segmentId: "",
  scheduledAt: "",
  priority: "normal",
};

// Check if type is a topic type (prefixed with topic_)
const isTopicType = (type: string) => type.startsWith("topic_");

interface ArticleSearchResult {
  id: number;
  title: string;
  slug: string;
  englishSlug?: string | null;
  imageUrl?: string;
  categorySlug?: string;
  shortCode?: string;
}

function LiveNotificationPreview({
  title,
  body,
  imageUrl,
  deeplink,
  type,
  priority,
  targetAll,
  scheduledAt,
  activeDevicesCount,
}: {
  title: string;
  body: string;
  imageUrl?: string;
  deeplink?: string;
  type: string;
  priority: string;
  targetAll: boolean;
  scheduledAt?: string;
  activeDevicesCount?: number;
}) {
  const [previewPlatform, setPreviewPlatform] = useState<"ios" | "android">("ios");
  const displayTitle = title.trim() || "خبر جديد من سبق";
  const displayBody =
    body.trim() || "سيظهر نص الإشعار العاجل أو الخبر هنا كما يراه القارئ مباشرة على شاشة هاتفه...";
  const typeLabel = CAMPAIGN_TYPES.find((t) => t.value === type)?.label || type;
  const priorityLabel = PRIORITY_OPTIONS.find((p) => p.value === priority)?.label || priority;

  return (
    <div className="rounded-2xl border border-sky-200/60 bg-gradient-to-br from-sky-50/50 via-card to-card p-4 shadow-sm dark:border-sky-900/40 dark:from-sky-950/20 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
            <Smartphone className="h-4 w-4" />
          </span>
          <div>
            <h4 className="text-xs font-semibold">معاينة حية للإشعار</h4>
            <p className="text-[11px] text-muted-foreground">محاكاة فورية لشاشة القفل</p>
          </div>
        </div>

        {/* Platform Switcher with no-min-touch-size */}
        <div className="inline-flex items-center rounded-lg border bg-background/80 p-0.5 gap-0.5">
          <button
            type="button"
            onClick={() => setPreviewPlatform("ios")}
            className={cn(
              "no-min-touch-size rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              previewPlatform === "ios"
                ? "bg-primary text-primary-foreground shadow-2xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            iOS
          </button>
          <button
            type="button"
            onClick={() => setPreviewPlatform("android")}
            className={cn(
              "no-min-touch-size rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              previewPlatform === "android"
                ? "bg-primary text-primary-foreground shadow-2xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Android
          </button>
        </div>
      </div>

      {/* Simulated Mobile Screen Frame */}
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border p-3.5 transition-all",
          previewPlatform === "ios"
            ? "border-slate-300/80 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 text-white dark:border-slate-700"
            : "border-zinc-300/80 bg-gradient-to-b from-zinc-100 to-zinc-200/80 dark:border-zinc-700 dark:from-zinc-900 dark:to-zinc-950",
        )}
      >
        {/* Status bar */}
        <div
          className={cn(
            "flex items-center justify-between px-1 pb-2.5 text-[11px] font-medium opacity-80",
            previewPlatform === "ios" ? "text-white" : "text-foreground",
          )}
          dir="ltr"
        >
          <span>9:41</span>
          <span className="text-[10px] tracking-wider uppercase">
            {previewPlatform === "ios" ? "iOS Lock Screen" : "Android FCM"}
          </span>
        </div>

        {previewPlatform === "ios" ? (
          /* iOS Notification Banner */
          <div className="rounded-2xl border border-white/20 bg-white/90 p-3 text-slate-900 shadow-lg backdrop-blur-md dark:bg-zinc-900/90 dark:text-zinc-100">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-1.5">
                <div className="flex h-5 w-5 items-center justify-center rounded-md bg-emerald-600 text-[11px] font-bold text-white shadow-2xs">
                  س
                </div>
                <span className="text-[11px] font-semibold text-slate-700 dark:text-zinc-300">
                  صحيفة سبق
                </span>
                {priority === "high" && (
                  <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400">
                    عاجل
                  </span>
                )}
              </div>
              <span className="text-[10px] text-slate-500 dark:text-zinc-400">الآن</span>
            </div>

            <div className="flex items-start gap-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold leading-snug line-clamp-1">{displayTitle}</p>
                <p className="text-xs text-slate-700 dark:text-zinc-300 leading-relaxed line-clamp-3 mt-0.5">
                  {displayBody}
                </p>
              </div>
              {imageUrl && (
                <img
                  src={imageUrl}
                  alt=""
                  className="h-12 w-12 rounded-lg object-cover shrink-0 border border-black/10"
                />
              )}
            </div>
          </div>
        ) : (
          /* Android Material 3 Notification Card */
          <div className="rounded-2xl border border-border/80 bg-card p-3 text-card-foreground shadow-md">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Bell className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                <span className="font-semibold text-foreground">سبق</span>
                <span>•</span>
                <span>الآن</span>
              </div>
              {priority === "high" && (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
                  أولوية عالية
                </Badge>
              )}
            </div>

            <div className="space-y-1">
              <p className="text-xs font-bold leading-snug line-clamp-1">{displayTitle}</p>
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{displayBody}</p>
            </div>

            {imageUrl && (
              <img
                src={imageUrl}
                alt=""
                className="mt-2.5 h-28 w-full rounded-xl object-cover border border-border/50"
              />
            )}
          </div>
        )}
      </div>

      {/* Live Campaign Configuration Summary */}
      <div className="space-y-2 pt-1 text-xs">
        <div className="flex items-center justify-between rounded-lg bg-background/70 px-2.5 py-1.5 border border-border/50">
          <span className="text-muted-foreground flex items-center gap-1.5">
            <Radio className="h-3.5 w-3.5 text-sky-600" />
            قناة البث:
          </span>
          <span className="font-medium truncate max-w-[160px]">{typeLabel}</span>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-background/70 px-2.5 py-1.5 border border-border/50">
          <span className="text-muted-foreground flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-emerald-600" />
            الجمهور المستهدف:
          </span>
          <span className="font-medium">
            {targetAll
              ? activeDevicesCount
                ? `الكل (${activeDevicesCount.toLocaleString("en-US")} نشط)`
                : "جميع المشتركين"
              : "شريحة مخصصة"}
          </span>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-background/70 px-2.5 py-1.5 border border-border/50">
          <span className="text-muted-foreground flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-amber-600" />
            الأولوية والتوقيت:
          </span>
          <span className="font-medium">
            {priorityLabel} • {scheduledAt ? "مجدول" : "حفظ كمسودة"}
          </span>
        </div>

        {deeplink && (
          <div className="flex items-center justify-between rounded-lg bg-background/70 px-2.5 py-1.5 border border-border/50">
            <span className="text-muted-foreground flex items-center gap-1.5 shrink-0">
              <Link2 className="h-3.5 w-3.5 text-purple-600" />
              الرابط:
            </span>
            <span className="font-mono text-[11px] truncate max-w-[170px]" dir="ltr">
              {deeplink}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PushNotifications() {
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useAuth();
  
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [formData, setFormData] = useState<CampaignFormData>(DEFAULT_FORM_DATA);
  
  const [articleSearchResults, setArticleSearchResults] = useState<ArticleSearchResult[]>([]);
  const [isSearchingArticles, setIsSearchingArticles] = useState(false);
  const [showArticleResults, setShowArticleResults] = useState(false);
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: status, isLoading: statusLoading } = useQuery<PushStatus>({
    queryKey: ["/api/admin/push/status"],
    retry: 1,
    staleTime: 30000,
    enabled: !!user && ["admin", "system_admin", "manager"].includes(user.role || ""),
  });

  const { data: campaignsData, isLoading: campaignsLoading } = useQuery<{ campaigns: Campaign[]; total: number }>({
    queryKey: ["/api/admin/push/campaigns", { limit: pageSize, offset: (page - 1) * pageSize }],
    retry: 1,
    staleTime: 30000,
    enabled: !!user && ["admin", "system_admin", "manager"].includes(user.role || ""),
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String((page - 1) * pageSize),
      });
      const res = await fetch(apiUrl(`/api/admin/push/campaigns?${params}`), {
        credentials: "include",
      });
      if (!res.ok) throw new Error("فشل في تحميل الحملات");
      return await res.json();
    },
  });

  const { data: segments } = useQuery<Segment[]>({
    queryKey: ["/api/admin/push/segments"],
    retry: 1,
    staleTime: 60000,
    enabled: !!user && ["admin", "system_admin", "manager"].includes(user.role || ""),
  });

  const { data: analytics, isLoading: analyticsLoading } = useQuery<Analytics>({
    queryKey: ["/api/admin/push/analytics"],
    retry: 1,
    staleTime: 60000,
    enabled: !!user && ["admin", "system_admin", "manager"].includes(user.role || ""),
  });

  const filteredCampaigns = (Array.isArray(campaignsData?.campaigns) ? campaignsData.campaigns : []).filter((c) => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (typeFilter !== "all" && c.type !== typeFilter) return false;
    return true;
  });

  const createCampaignMutation = useMutation({
    mutationFn: async (data: CampaignFormData) => {
      return await apiRequest("/api/admin/push/campaigns", {
        method: "POST",
        body: JSON.stringify({
          ...data,
          scheduledAt: data.scheduledAt || null,
          segmentId: data.targetAll ? null : data.segmentId || null,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/push/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/push/analytics"] });
      toast({
        title: "تم بنجاح",
        description: "تم إنشاء الحملة بنجاح",
      });
      setCreateDialogOpen(false);
      setFormData(DEFAULT_FORM_DATA);
    },
    onError: (error: Error) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في إنشاء الحملة",
        variant: "destructive",
      });
    },
  });

  const updateCampaignMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CampaignFormData> }) => {
      return await apiRequest(`/api/admin/push/campaigns/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...data,
          scheduledAt: data.scheduledAt || null,
          segmentId: data.targetAll ? null : data.segmentId || null,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/push/campaigns"] });
      toast({
        title: "تم بنجاح",
        description: "تم تحديث الحملة بنجاح",
      });
      setEditDialogOpen(false);
      setSelectedCampaign(null);
    },
    onError: (error: Error) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في تحديث الحملة",
        variant: "destructive",
      });
    },
  });

  const sendCampaignMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/admin/push/campaigns/${id}/send`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/push/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/push/analytics"] });
      toast({
        title: "تم بنجاح",
        description: "تم إرسال الحملة للمعالجة",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في إرسال الحملة",
        variant: "destructive",
      });
    },
  });

  const deleteCampaignMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/admin/push/campaigns/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/push/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/push/analytics"] });
      toast({
        title: "تم بنجاح",
        description: "تم حذف الحملة بنجاح",
      });
      setDeleteDialogOpen(false);
      setSelectedCampaign(null);
    },
    onError: (error: Error) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في حذف الحملة",
        variant: "destructive",
      });
    },
  });

  const handleCreateCampaign = () => {
    setFormData(DEFAULT_FORM_DATA);
    setCreateDialogOpen(true);
  };

  const handleEditCampaign = (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    setFormData({
      name: campaign.name,
      type: campaign.type,
      title: campaign.titleAr || campaign.title,
      body: campaign.bodyAr || campaign.body,
      imageUrl: campaign.imageUrl || "",
      deeplink: campaign.deeplink || "",
      targetAll: campaign.targetAll,
      segmentId: campaign.segmentId || "",
      scheduledAt: campaign.scheduledAt ? format(new Date(campaign.scheduledAt), "yyyy-MM-dd'T'HH:mm") : "",
      priority: campaign.priority || "normal",
    });
    setEditDialogOpen(true);
  };

  const handleViewCampaign = (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    setViewDialogOpen(true);
  };

  const handleDeleteCampaign = (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    setDeleteDialogOpen(true);
  };

  const searchArticles = async (query: string) => {
    if (query.length < 3) {
      setArticleSearchResults([]);
      setShowArticleResults(false);
      return;
    }
    
    setIsSearchingArticles(true);
    try {
      const res = await fetch(apiUrl(`/api/articles/search-simple?q=${encodeURIComponent(query)}&limit=5`));
      if (res.ok) {
        const data = await res.json();
        const list = data?.articles ?? data;
        setArticleSearchResults(Array.isArray(list) ? list : []);
        setShowArticleResults(true);
      }
    } catch (error) {
      console.error("Error searching articles:", error);
    } finally {
      setIsSearchingArticles(false);
    }
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    
    const timeout = setTimeout(() => {
      searchArticles(value);
    }, 300);
    setSearchTimeout(timeout);
  };

  const handleSelectArticle = (article: ArticleSearchResult) => {
    // Use shortCode if available, otherwise fall back to slug
    const deeplink = article.shortCode 
      ? `/article/${article.shortCode}`
      : `/article/${article.englishSlug || article.slug}`;
    setFormData((f) => ({
      ...f,
      title: "خبر جديد من سبق",
      body: article.title,
      imageUrl: article.imageUrl || f.imageUrl,
      deeplink: deeplink,
    }));
    setSearchQuery(""); // Clear search field after selection
    setShowArticleResults(false);
    setArticleSearchResults([]);
    toast({
      title: "تم اختيار المقال",
      description: "تم ملء المحتوى والرابط تلقائياً",
    });
  };

  const handleSubmitCreate = async () => {
    if (!formData.body) {
      toast({
        title: "خطأ",
        description: "الرجاء ملء محتوى الإشعار",
        variant: "destructive",
      });
      return;
    }
    // Use body (article title) as campaign name for better identification
    const dataToSubmit = {
      ...formData,
      name: formData.body.substring(0, 100),
    };
    await createCampaignMutation.mutateAsync(dataToSubmit);
  };

  const handleSubmitEdit = async () => {
    if (!selectedCampaign) return;
    // Use body (article title) as campaign name for better identification
    const dataToSubmit = {
      ...formData,
      name: formData.body.substring(0, 100),
    };
    await updateCampaignMutation.mutateAsync({
      id: selectedCampaign.id,
      data: dataToSubmit,
    });
  };

  const getOpenRate = (sent: number, opened: number) => {
    if (!sent || sent === 0) return 0;
    return ((opened / sent) * 100).toFixed(1);
  };

  const totalPages = Math.ceil((campaignsData?.total || 0) / pageSize);

  if (authLoading) {
    return (
      <DashboardLayout>
        <div className="container mx-auto px-4 py-8" dir="rtl">
          <div className="text-center py-20">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">جاري التحميل...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!user || !["admin", "system_admin", "manager"].includes(user.role || "")) {
    return (
      <DashboardLayout>
        <div className="container mx-auto px-4 py-8" dir="rtl">
          <div className="text-center py-20">
            <p className="text-destructive text-lg">غير مصرح لك بالوصول إلى هذه الصفحة</p>
            <p className="text-muted-foreground text-sm mt-2">
              يتطلب الوصول إلى هذه الصفحة صلاحيات إدارية
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <ErrorBoundary>
        <DashboardPageShell maxWidthClassName="max-w-[1600px]" contentClassName="space-y-5 pb-10">
          <DashboardPageHeader
            icon={Bell}
            title="إدارة الإشعارات الفورية"
            description="أنشئ حملات التنبيهات العاجلة والموضوعية عبر APNs وFCM وتابع مؤشرات التسليم والتفاعل لحظياً."
            titleTestId="text-page-title"
            actions={
              <div className="flex w-full sm:w-auto items-center gap-2">
                <Button onClick={handleCreateCampaign} className="w-full sm:w-auto gap-2 shadow-sm" data-testid="button-create-campaign">
                  <Plus className="h-4 w-4" />
                  إنشاء حملة جديدة
                </Button>
              </div>
            }
          />

          {/* Top KPI & Infrastructure Status Cards */}
          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="rounded-2xl border-emerald-200/60 bg-gradient-to-br from-emerald-50/50 via-card to-card shadow-sm dark:border-emerald-900/35 dark:from-emerald-950/15">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">حالة خدمة APNs / الدفع</CardTitle>
                <span className="rounded-xl bg-emerald-500/10 p-2 text-emerald-700 dark:text-emerald-300">
                  <ShieldCheck className="h-4 w-4" />
                </span>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2" data-testid="text-apns-status">
                  {statusLoading ? (
                    <span className="text-muted-foreground">...</span>
                  ) : status?.configured ? (
                    <>
                      <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                      <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">مفعّل وجاهز</span>
                      <Badge variant="outline" className="mr-auto text-[11px] bg-background/80">
                        {status.environment}
                      </Badge>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-5 w-5 text-rose-500 shrink-0" />
                      <span className="text-lg font-bold text-rose-600">غير مفعّل</span>
                    </>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">
                  بوابة البث الموحدة لأجهزة iOS وAndroid
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-sky-200/60 bg-gradient-to-br from-sky-50/50 via-card to-card shadow-sm dark:border-sky-900/35 dark:from-sky-950/15">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">إجمالي الأجهزة المسجلة</CardTitle>
                <span className="rounded-xl bg-sky-500/10 p-2 text-sky-700 dark:text-sky-300">
                  <Smartphone className="h-4 w-4" />
                </span>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums" data-testid="text-total-devices">
                  {statusLoading ? "..." : (status?.devices?.total || 0).toLocaleString("en-US")}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mt-1.5 tabular-nums">
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                    {statusLoading ? "" : `${(status?.devices?.active || 0).toLocaleString("en-US")} نشط`}
                  </span>
                  {status?.devices && (status.devices.ios > 0 || status.devices.android > 0) && (
                    <>
                      <span>•</span>
                      <span>iOS: {(status.devices.ios || 0).toLocaleString("en-US")}</span>
                      <span>•</span>
                      <span>Android: {(status.devices.android || 0).toLocaleString("en-US")}</span>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-cyan-200/60 bg-gradient-to-br from-cyan-50/50 via-card to-card shadow-sm dark:border-cyan-900/35 dark:from-cyan-950/15">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">إجمالي الإرسالات</CardTitle>
                <span className="rounded-xl bg-cyan-500/10 p-2 text-cyan-700 dark:text-cyan-300">
                  <Send className="h-4 w-4" />
                </span>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums" data-testid="text-total-sent">
                  {analyticsLoading ? "..." : (analytics?.campaigns?.totalSent || 0).toLocaleString("en-US")}
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">
                  إجمالي الرسائل المدفوعة خلال آخر 30 يوماً
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-amber-200/60 bg-gradient-to-br from-amber-50/50 via-card to-card shadow-sm dark:border-amber-900/35 dark:from-amber-950/15">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">معدل الفتح والتفاعل</CardTitle>
                <span className="rounded-xl bg-amber-500/10 p-2 text-amber-700 dark:text-amber-300">
                  <TrendingUp className="h-4 w-4" />
                </span>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums" data-testid="text-open-rate">
                  {analyticsLoading
                    ? "..."
                    : `${getOpenRate(
                        analytics?.campaigns?.totalSent || 0,
                        analytics?.campaigns?.totalOpened || 0
                      )}%`}
                </div>
                <p className="text-xs text-muted-foreground mt-1.5 tabular-nums">
                  {(analytics?.campaigns?.totalOpened || 0).toLocaleString("en-US")} قارئ فتحوا الإشعار
                </p>
              </CardContent>
            </Card>
          </div>

          {/* 30-Day Funnel Summary Bar */}
          <Card className="rounded-2xl border-sky-200/55 bg-gradient-to-br from-sky-50/35 via-card to-card shadow-sm dark:border-sky-900/35 dark:from-sky-950/15">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                  <h3 className="text-sm font-semibold">ملخص مسار التسليم (آخر 30 يوماً)</h3>
                </div>
                <span className="text-xs text-muted-foreground">
                  مؤشرات الأداء التراكمية لجميع الحملات المرسلة
                </span>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="rounded-xl border border-border/60 bg-background/60 p-3 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-muted-foreground">إجمالي الحملات</div>
                    <div className="text-xl font-bold mt-0.5 tabular-nums" data-testid="text-stats-campaigns">
                      {analytics?.campaigns?.totalCampaigns || 0}
                    </div>
                  </div>
                  <Bell className="h-4 w-4 text-muted-foreground/60" />
                </div>
                <div className="rounded-xl border border-border/60 bg-background/60 p-3 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-muted-foreground">تم التوصيل</div>
                    <div className="text-xl font-bold mt-0.5 tabular-nums text-emerald-600 dark:text-emerald-400" data-testid="text-stats-delivered">
                      {analytics?.campaigns?.totalDelivered || 0}
                    </div>
                  </div>
                  <CheckCircle2 className="h-4 w-4 text-emerald-500/70" />
                </div>
                <div className="rounded-xl border border-border/60 bg-background/60 p-3 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-muted-foreground">تم النقر</div>
                    <div className="text-xl font-bold mt-0.5 tabular-nums text-sky-600 dark:text-sky-400" data-testid="text-stats-clicked">
                      {analytics?.campaigns?.totalClicked || 0}
                    </div>
                  </div>
                  <MousePointerClick className="h-4 w-4 text-sky-500/70" />
                </div>
                <div className="rounded-xl border border-border/60 bg-background/60 p-3 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-muted-foreground">فشل الإرسال</div>
                    <div className="text-xl font-bold mt-0.5 tabular-nums text-destructive" data-testid="text-stats-failed">
                      {analytics?.campaigns?.totalFailed || 0}
                    </div>
                  </div>
                  <AlertTriangle className="h-4 w-4 text-destructive/70" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Campaigns History Card */}
          <Card className="rounded-2xl border-sky-200/55 bg-gradient-to-br from-sky-50/30 via-card to-card shadow-sm dark:border-sky-900/35 dark:from-sky-950/15">
            <CardHeader className="pb-3">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <Radio className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                    سجل وإدارة حملات الإشعارات
                  </CardTitle>
                  <CardDescription className="mt-0.5">
                    تصفح الحملات السابقة، المسودات، والحملات المجدولة مع نسب الفتح والوصول
                  </CardDescription>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[140px] h-9 bg-background/80" data-testid="select-status-filter">
                      <SelectValue placeholder="الحالة" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">جميع الحالات</SelectItem>
                      <SelectItem value="draft">مسودة</SelectItem>
                      <SelectItem value="scheduled">مجدولة</SelectItem>
                      <SelectItem value="sending">جاري الإرسال</SelectItem>
                      <SelectItem value="sent">مرسلة</SelectItem>
                      <SelectItem value="failed">فشلت</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="w-[160px] h-9 bg-background/80" data-testid="select-type-filter">
                      <SelectValue placeholder="النوع" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">جميع الأنواع</SelectItem>
                      {CAMPAIGN_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Compact Quick Status Filter Tabs with no-min-touch-size */}
              <div className="flex items-center gap-1.5 overflow-x-auto pt-3 pb-1 no-scrollbar border-t border-border/50 mt-3">
                {QUICK_STATUS_PILLS.map((pill) => {
                  const active = statusFilter === pill.value;
                  return (
                    <button
                      key={pill.value}
                      type="button"
                      onClick={() => setStatusFilter(pill.value)}
                      className={cn(
                        "no-min-touch-size inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap transition-all shrink-0",
                        active
                          ? "border-primary bg-primary text-primary-foreground shadow-2xs"
                          : "border-border/70 bg-background/70 text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                      )}
                    >
                      {pill.label}
                    </button>
                  );
                })}
              </div>
            </CardHeader>

            <CardContent>
              {campaignsLoading ? (
                <div className="text-center py-12">
                  <Loader2 className="h-7 w-7 animate-spin mx-auto mb-2.5 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">جاري تحميل سجل الحملات...</p>
                </div>
              ) : filteredCampaigns.length === 0 ? (
                <div className="text-center py-12 rounded-2xl border border-dashed border-border/70 bg-background/40">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
                    <Bell className="h-6 w-6" />
                  </div>
                  <p className="font-semibold text-base">لا توجد حملات مطابقة</p>
                  <p className="text-xs text-muted-foreground mt-1 mb-4">
                    لم يتم العثور على حملات إشعارات تطابق الفلاتر المحددة حالياً
                  </p>
                  <Button variant="outline" onClick={handleCreateCampaign}>
                    <Plus className="h-4 w-4 ml-1.5" />
                    إنشاء أول حملة
                  </Button>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-xl border border-border/60 bg-background/50">
                    <Table>
                      <TableHeader className="bg-muted/40">
                        <TableRow>
                          <TableHead className="min-w-[240px]">الحملة ومحتوى الإشعار</TableHead>
                          <TableHead>القناة / النوع</TableHead>
                          <TableHead>الحالة</TableHead>
                          <TableHead>المرسل</TableHead>
                          <TableHead>التفاعل (الفتح)</TableHead>
                          <TableHead>تاريخ الإنشاء</TableHead>
                          <TableHead className="text-center">الإجراءات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredCampaigns.map((campaign) => {
                          const statusConfig = CAMPAIGN_STATUS_LABELS[campaign.status] || {
                            label: campaign.status,
                            variant: "secondary" as const,
                          };
                          const typeLabel = CAMPAIGN_TYPES.find((t) => t.value === campaign.type)?.label || campaign.type;
                          const openRate = getOpenRate(campaign.sentCount, campaign.openedCount);
                          return (
                            <TableRow key={campaign.id} className="hover:bg-muted/30 transition-colors" data-testid={`row-campaign-${campaign.id}`}>
                              <TableCell>
                                <div className="flex items-start gap-2.5">
                                  {campaign.imageUrl && (
                                    <img
                                      src={campaign.imageUrl}
                                      alt=""
                                      className="h-10 w-10 rounded-lg object-cover shrink-0 border border-border/50 hidden sm:block"
                                      loading="lazy"
                                    />
                                  )}
                                  <div className="min-w-0">
                                    <div className="font-semibold text-sm truncate max-w-[280px]" data-testid={`text-name-${campaign.id}`}>
                                      {campaign.name}
                                    </div>
                                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                                      <span className="truncate max-w-[220px]">{campaign.title}</span>
                                      {campaign.priority === "high" && (
                                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-rose-300 text-rose-600 dark:text-rose-400">
                                          عاجل
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs whitespace-nowrap bg-background/70" data-testid={`badge-type-${campaign.id}`}>
                                  {typeLabel}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge variant={statusConfig.variant} className="text-xs whitespace-nowrap" data-testid={`badge-status-${campaign.id}`}>
                                  {statusConfig.label}
                                </Badge>
                              </TableCell>
                              <TableCell className="tabular-nums font-medium" data-testid={`text-sent-${campaign.id}`}>
                                {campaign.sentCount || 0}
                              </TableCell>
                              <TableCell className="tabular-nums" data-testid={`text-opened-${campaign.id}`}>
                                <span className="font-medium">{campaign.openedCount || 0}</span>
                                <span className="text-xs text-muted-foreground mr-1">
                                  ({openRate}%)
                                </span>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground whitespace-nowrap" data-testid={`text-date-${campaign.id}`}>
                                <div>{format(new Date(campaign.createdAt), "dd MMM yyyy", { locale: ar })}</div>
                                <div className="text-[11px] opacity-75">
                                  {formatDistanceToNow(new Date(campaign.createdAt), { addSuffix: true, locale: ar })}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center justify-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="no-min-touch-size h-8 w-8"
                                    onClick={() => handleViewCampaign(campaign)}
                                    title="عرض التفاصيل"
                                    data-testid={`button-view-${campaign.id}`}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  {campaign.status === "draft" && (
                                    <>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="no-min-touch-size h-8 w-8"
                                        onClick={() => handleEditCampaign(campaign)}
                                        title="تعديل المسودة"
                                        data-testid={`button-edit-${campaign.id}`}
                                      >
                                        <Edit className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="no-min-touch-size h-8 w-8 text-sky-600 hover:text-sky-700"
                                        onClick={() => sendCampaignMutation.mutate(campaign.id)}
                                        disabled={sendCampaignMutation.isPending}
                                        title="إرسال الحملة الآن"
                                        data-testid={`button-send-${campaign.id}`}
                                      >
                                        <Send className="h-4 w-4" />
                                      </Button>
                                    </>
                                  )}
                                  {["draft", "scheduled", "cancelled"].includes(campaign.status) && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="no-min-touch-size h-8 w-8 text-destructive hover:text-destructive"
                                      onClick={() => handleDeleteCampaign(campaign)}
                                      title="حذف الحملة"
                                      data-testid={`button-delete-${campaign.id}`}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4 pt-2">
                      <p className="text-xs sm:text-sm text-muted-foreground tabular-nums">
                        صفحة {page} من {totalPages}
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="no-min-touch-size h-8 w-8"
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          disabled={page === 1}
                          data-testid="button-prev-page"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="no-min-touch-size h-8 w-8"
                          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                          disabled={page === totalPages}
                          data-testid="button-next-page"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Create Campaign Dialog with Live iOS/Android Preview */}
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto" dir="rtl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5 text-sky-600" />
                  إنشاء حملة إشعارات جديدة
                </DialogTitle>
                <DialogDescription>
                  صِغ محتوى التنبيه الفوري وعاين ظهوره على أجهزة iOS وAndroid قبل الحفظ أو الجدولة
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 py-3">
                {/* Form Column */}
                <div className="lg:col-span-7 space-y-4">
                  <div className="space-y-2 relative">
                    <Label htmlFor="searchArticle" className="flex items-center gap-2 text-xs font-semibold">
                      <Search className="h-3.5 w-3.5 text-sky-600" />
                      ربط سريع بمقال منشور (اختياري)
                    </Label>
                    <Input
                      id="searchArticle"
                      value={searchQuery}
                      onChange={(e) => handleSearchChange(e.target.value)}
                      placeholder="اكتب عنوان الخبر للبحث وملء الحقول تلقائياً..."
                      data-testid="input-search-article"
                      autoComplete="off"
                    />
                    {isSearchingArticles && (
                      <div className="absolute left-3 top-9">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      </div>
                    )}
                    {showArticleResults && articleSearchResults.length > 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-background border rounded-xl shadow-lg max-h-60 overflow-y-auto">
                        {articleSearchResults.map((article) => (
                          <button
                            key={article.id}
                            type="button"
                            className="w-full text-right px-3.5 py-2.5 hover:bg-muted flex items-center gap-3 border-b last:border-b-0 transition-colors"
                            onClick={() => handleSelectArticle(article)}
                            data-testid={`article-result-${article.id}`}
                          >
                            {article.imageUrl && (
                              <img
                                src={article.imageUrl}
                                alt=""
                                className="w-11 h-11 object-cover rounded-lg shrink-0"
                              />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate text-sm">{article.title}</p>
                              <p className="text-xs text-muted-foreground truncate" dir="ltr">
                                /article/{article.slug}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {showArticleResults && articleSearchResults.length === 0 && searchQuery.length >= 3 && !isSearchingArticles && (
                      <div className="absolute z-50 w-full mt-1 bg-background border rounded-xl shadow-lg p-3 text-center text-muted-foreground text-sm">
                        لم يتم العثور على مقالات مطابقة
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="type">نوع الحملة وقناة التوجيه</Label>
                    <Select
                      value={formData.type}
                      onValueChange={(v) => setFormData((f) => ({ ...f, type: v }))}
                    >
                      <SelectTrigger data-testid="select-campaign-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CAMPAIGN_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="notificationTitle">عنوان الإشعار</Label>
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        {(formData.title || "خبر جديد من سبق").length} حرف
                      </span>
                    </div>
                    <Input
                      id="notificationTitle"
                      value={formData.title || "خبر جديد من سبق"}
                      onChange={(e) => setFormData((f) => ({ ...f, title: e.target.value }))}
                      placeholder="خبر جديد من سبق"
                      data-testid="input-notification-title"
                    />
                    <p className="text-xs text-muted-foreground">
                      العنوان البارز الذي يظهر في ترويسة الإشعار
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="body">محتوى الإشعار *</Label>
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        {formData.body.length} حرف
                      </span>
                    </div>
                    <Textarea
                      id="body"
                      value={formData.body}
                      onChange={(e) => setFormData((f) => ({ ...f, body: e.target.value }))}
                      placeholder="نص الإشعار الذي سيظهر للمستخدم..."
                      rows={3}
                      data-testid="input-campaign-body"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="deeplink">الصفحة المستهدفة (Deep Link)</Label>
                    <Input
                      id="deeplink"
                      value={formData.deeplink}
                      onChange={(e) => setFormData((f) => ({ ...f, deeplink: e.target.value }))}
                      placeholder="/article/article-slug"
                      dir="ltr"
                      data-testid="input-campaign-deeplink"
                    />
                    <p className="text-xs text-muted-foreground">
                      المسار الذي سينتقل إليه القارئ عند النقر على الإشعار (مثال: /article/خبر-عاجل)
                    </p>
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 p-3">
                    <div className="space-y-0.5">
                      <Label>استهداف جميع المستخدمين</Label>
                      <p className="text-xs text-muted-foreground">
                        إرسال الإشعار لجميع الأجهزة النشطة المسجلة
                      </p>
                    </div>
                    <Switch
                      checked={formData.targetAll}
                      onCheckedChange={(v) => setFormData((f) => ({ ...f, targetAll: v }))}
                      data-testid="switch-target-all"
                    />
                  </div>

                  {!formData.targetAll && (
                    <div className="space-y-2">
                      <Label htmlFor="segment">شريحة المستخدمين</Label>
                      <Select
                        value={formData.segmentId}
                        onValueChange={(v) => setFormData((f) => ({ ...f, segmentId: v }))}
                      >
                        <SelectTrigger data-testid="select-segment">
                          <SelectValue placeholder="اختر شريحة" />
                        </SelectTrigger>
                        <SelectContent>
                          {(Array.isArray(segments) ? segments : []).map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.nameAr || s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="scheduledAt">جدولة الإرسال</Label>
                      <Input
                        id="scheduledAt"
                        type="datetime-local"
                        value={formData.scheduledAt}
                        onChange={(e) => setFormData((f) => ({ ...f, scheduledAt: e.target.value }))}
                        data-testid="input-schedule-date"
                      />
                      <p className="text-xs text-muted-foreground">
                        اتركه فارغاً للحفظ كمسودة
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="priority">الأولوية</Label>
                      <Select
                        value={formData.priority}
                        onValueChange={(v) => setFormData((f) => ({ ...f, priority: v }))}
                      >
                        <SelectTrigger data-testid="select-priority">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PRIORITY_OPTIONS.map((p) => (
                            <SelectItem key={p.value} value={p.value}>
                              {p.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Live Notification Preview Column */}
                <div className="lg:col-span-5">
                  <div className="lg:sticky lg:top-2">
                    <LiveNotificationPreview
                      title={formData.title || "خبر جديد من سبق"}
                      body={formData.body}
                      imageUrl={formData.imageUrl}
                      deeplink={formData.deeplink}
                      type={formData.type}
                      priority={formData.priority}
                      targetAll={formData.targetAll}
                      scheduledAt={formData.scheduledAt}
                      activeDevicesCount={status?.devices?.active}
                    />
                  </div>
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  إلغاء
                </Button>
                <Button
                  onClick={handleSubmitCreate}
                  disabled={createCampaignMutation.isPending}
                  data-testid="button-submit-create"
                >
                  {createCampaignMutation.isPending && (
                    <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                  )}
                  إنشاء الحملة
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Edit Campaign Dialog with Live iOS/Android Preview */}
          <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
            <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto" dir="rtl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Edit className="h-5 w-5 text-sky-600" />
                  تعديل الحملة
                </DialogTitle>
                <DialogDescription>
                  تعديل بيانات الحملة ومعاينة شكل الإشعار قبل الإرسال
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 py-3">
                <div className="lg:col-span-7 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-type">نوع الحملة</Label>
                    <Select
                      value={formData.type}
                      onValueChange={(v) => setFormData((f) => ({ ...f, type: v }))}
                    >
                      <SelectTrigger data-testid="select-edit-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CAMPAIGN_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-title">عنوان الإشعار *</Label>
                    <Input
                      id="edit-title"
                      value={formData.title}
                      onChange={(e) => setFormData((f) => ({ ...f, title: e.target.value }))}
                      data-testid="input-edit-title"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-body">محتوى الإشعار *</Label>
                    <Textarea
                      id="edit-body"
                      value={formData.body}
                      onChange={(e) => setFormData((f) => ({ ...f, body: e.target.value }))}
                      rows={3}
                      data-testid="input-edit-body"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-deeplink">الصفحة المستهدفة</Label>
                    <Input
                      id="edit-deeplink"
                      value={formData.deeplink}
                      onChange={(e) => setFormData((f) => ({ ...f, deeplink: e.target.value }))}
                      dir="ltr"
                      data-testid="input-edit-deeplink"
                    />
                    <p className="text-xs text-muted-foreground">
                      الرابط الذي سينتقل إليه المستخدم عند الضغط على الإشعار
                    </p>
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 p-3">
                    <Label>استهداف جميع المستخدمين</Label>
                    <Switch
                      checked={formData.targetAll}
                      onCheckedChange={(v) => setFormData((f) => ({ ...f, targetAll: v }))}
                      data-testid="switch-edit-target-all"
                    />
                  </div>

                  {!formData.targetAll && (
                    <div className="space-y-2">
                      <Label>شريحة المستخدمين</Label>
                      <Select
                        value={formData.segmentId}
                        onValueChange={(v) => setFormData((f) => ({ ...f, segmentId: v }))}
                      >
                        <SelectTrigger data-testid="select-edit-segment">
                          <SelectValue placeholder="اختر شريحة" />
                        </SelectTrigger>
                        <SelectContent>
                          {(Array.isArray(segments) ? segments : []).map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.nameAr || s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="edit-scheduledAt">جدولة الإرسال</Label>
                      <Input
                        id="edit-scheduledAt"
                        type="datetime-local"
                        value={formData.scheduledAt}
                        onChange={(e) => setFormData((f) => ({ ...f, scheduledAt: e.target.value }))}
                        data-testid="input-edit-schedule"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>الأولوية</Label>
                      <Select
                        value={formData.priority}
                        onValueChange={(v) => setFormData((f) => ({ ...f, priority: v }))}
                      >
                        <SelectTrigger data-testid="select-edit-priority">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PRIORITY_OPTIONS.map((p) => (
                            <SelectItem key={p.value} value={p.value}>
                              {p.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-5">
                  <div className="lg:sticky lg:top-2">
                    <LiveNotificationPreview
                      title={formData.title}
                      body={formData.body}
                      imageUrl={formData.imageUrl}
                      deeplink={formData.deeplink}
                      type={formData.type}
                      priority={formData.priority}
                      targetAll={formData.targetAll}
                      scheduledAt={formData.scheduledAt}
                      activeDevicesCount={status?.devices?.active}
                    />
                  </div>
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                  إلغاء
                </Button>
                <Button
                  onClick={handleSubmitEdit}
                  disabled={updateCampaignMutation.isPending}
                  data-testid="button-submit-edit"
                >
                  {updateCampaignMutation.isPending && (
                    <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                  )}
                  حفظ التغييرات
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* View Campaign Details Dialog */}
          <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
            <DialogContent className="max-w-xl" dir="rtl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5 text-sky-600" />
                  تفاصيل الحملة وأداء التوصيل
                </DialogTitle>
              </DialogHeader>
              {selectedCampaign && (
                <div className="space-y-4 py-2">
                  <div className="grid grid-cols-2 gap-3 rounded-xl border border-border/60 bg-muted/20 p-3 text-sm">
                    <div>
                      <span className="text-xs text-muted-foreground">الاسم:</span>
                      <p className="font-semibold truncate">{selectedCampaign.name}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">النوع:</span>
                      <p className="font-semibold">
                        {CAMPAIGN_TYPES.find((t) => t.value === selectedCampaign.type)?.label || selectedCampaign.type}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground block mb-0.5">الحالة:</span>
                      <Badge variant={CAMPAIGN_STATUS_LABELS[selectedCampaign.status]?.variant || "secondary"}>
                        {CAMPAIGN_STATUS_LABELS[selectedCampaign.status]?.label || selectedCampaign.status}
                      </Badge>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">الأولوية:</span>
                      <p className="font-semibold">
                        {PRIORITY_OPTIONS.find((p) => p.value === selectedCampaign.priority)?.label || selectedCampaign.priority}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border/60 bg-card p-3.5 space-y-2.5">
                    <div>
                      <span className="text-muted-foreground text-xs">العنوان:</span>
                      <p className="font-semibold text-sm">{selectedCampaign.titleAr || selectedCampaign.title}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">المحتوى:</span>
                      <p className="text-sm leading-relaxed">{selectedCampaign.bodyAr || selectedCampaign.body}</p>
                    </div>
                    {selectedCampaign.deeplink && (
                      <div>
                        <span className="text-muted-foreground text-xs">الرابط المستهدف:</span>
                        <p className="text-xs font-mono text-sky-600 dark:text-sky-400" dir="ltr">
                          {selectedCampaign.deeplink}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
                    <div className="rounded-xl border border-border/60 bg-muted/20 p-2.5">
                      <span className="text-xs text-muted-foreground">المرسل</span>
                      <p className="font-bold text-lg tabular-nums mt-0.5">{selectedCampaign.sentCount || 0}</p>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-muted/20 p-2.5">
                      <span className="text-xs text-muted-foreground">تم التوصيل</span>
                      <p className="font-bold text-lg tabular-nums text-emerald-600 mt-0.5">{selectedCampaign.deliveredCount || 0}</p>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-muted/20 p-2.5">
                      <span className="text-xs text-muted-foreground">تم الفتح</span>
                      <p className="font-bold text-lg tabular-nums text-sky-600 mt-0.5">{selectedCampaign.openedCount || 0}</p>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-muted/20 p-2.5">
                      <span className="text-xs text-muted-foreground">تم النقر</span>
                      <p className="font-bold text-lg tabular-nums text-purple-600 mt-0.5">{selectedCampaign.clickedCount || 0}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground pt-1">
                    {selectedCampaign.sentAt && (
                      <div>
                        تم الإرسال: {format(new Date(selectedCampaign.sentAt), "dd MMM yyyy HH:mm", { locale: ar })}
                      </div>
                    )}
                    {selectedCampaign.scheduledAt && selectedCampaign.status === "scheduled" && (
                      <div>
                        مجدول لـ: {format(new Date(selectedCampaign.scheduledAt), "dd MMM yyyy HH:mm", { locale: ar })}
                      </div>
                    )}
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
                  إغلاق
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <AlertDialogContent dir="rtl">
              <AlertDialogHeader>
                <AlertDialogTitle>حذف الحملة</AlertDialogTitle>
                <AlertDialogDescription>
                  هل أنت متأكد من حذف الحملة "{selectedCampaign?.name}"؟ لا يمكن التراجع عن هذا الإجراء.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="gap-2">
                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => selectedCampaign && deleteCampaignMutation.mutate(selectedCampaign.id)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  data-testid="button-confirm-delete"
                >
                  {deleteCampaignMutation.isPending && (
                    <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                  )}
                  حذف
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </DashboardPageShell>
      </ErrorBoundary>
    </DashboardLayout>
  );
}
