import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
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
  sending: { label: "جاري الإرسال", variant: "default" },
  sent: { label: "مرسلة", variant: "default" },
  failed: { label: "فشلت", variant: "destructive" },
};

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
      const res = await fetch(`/api/admin/push/campaigns?${params}`, {
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

  const filteredCampaigns = (campaignsData?.campaigns || []).filter((c) => {
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
      const res = await fetch(`/api/articles/search-simple?q=${encodeURIComponent(query)}&limit=5`);
      if (res.ok) {
        const data = await res.json();
        setArticleSearchResults(data.articles || data || []);
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
        <div className="mx-auto max-w-[1600px] space-y-6 pb-10" dir="rtl">
          <DashboardPageHeader
            icon={Bell}
            title="إدارة الإشعارات"
            description="أنشئ حملات الإشعارات وتابع وصولها وتفاعل الجمهور معها."
            titleTestId="text-page-title"
            actions={
            <Button onClick={handleCreateCampaign} data-testid="button-create-campaign">
              <Plus className="h-4 w-4 ml-2" />
              إنشاء حملة جديدة
            </Button>
            }
          />

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                <CardTitle className="text-sm font-medium">حالة APNs</CardTitle>
                <Bell className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2" data-testid="text-apns-status">
                  {statusLoading ? (
                    <span className="text-muted-foreground">...</span>
                  ) : status?.configured ? (
                    <>
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                      <span className="font-medium text-green-600">مفعّل</span>
                      <Badge variant="outline" className="mr-2">{status.environment}</Badge>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-5 w-5 text-red-500" />
                      <span className="font-medium text-red-600">غير مفعّل</span>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                <CardTitle className="text-sm font-medium">إجمالي الأجهزة</CardTitle>
                <Smartphone className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-devices">
                  {statusLoading ? "..." : status?.devices?.total || 0}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {statusLoading ? "" : `${status?.devices?.active || 0} نشط`}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                <CardTitle className="text-sm font-medium">إجمالي الإرسالات</CardTitle>
                <Send className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-sent">
                  {analyticsLoading ? "..." : analytics?.campaigns?.totalSent || 0}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  آخر 30 يوم
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                <CardTitle className="text-sm font-medium">معدل الفتح</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-open-rate">
                  {analyticsLoading
                    ? "..."
                    : `${getOpenRate(
                        analytics?.campaigns?.totalSent || 0,
                        analytics?.campaigns?.totalOpened || 0
                      )}%`}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {analytics?.campaigns?.totalOpened || 0} فتحوا الإشعار
                </p>
              </CardContent>
            </Card>
          </div>

          <Separator />

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Bell className="h-5 w-5" />
                    حملات الإشعارات
                  </CardTitle>
                  <CardDescription>
                    إدارة وإرسال حملات الإشعارات
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[130px]" data-testid="select-status-filter">
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
                    <SelectTrigger className="w-[130px]" data-testid="select-type-filter">
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
            </CardHeader>
            <CardContent>
              {campaignsLoading ? (
                <div className="text-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-muted-foreground" />
                  <p className="text-muted-foreground">جاري التحميل...</p>
                </div>
              ) : filteredCampaigns.length === 0 ? (
                <div className="text-center py-8">
                  <Bell className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground">لا توجد حملات</p>
                  <Button variant="outline" className="mt-4" onClick={handleCreateCampaign}>
                    إنشاء أول حملة
                  </Button>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>الاسم</TableHead>
                          <TableHead>النوع</TableHead>
                          <TableHead>الحالة</TableHead>
                          <TableHead>المرسل</TableHead>
                          <TableHead>الفتح</TableHead>
                          <TableHead>تاريخ الإنشاء</TableHead>
                          <TableHead>الإجراءات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredCampaigns.map((campaign) => {
                          const statusConfig = CAMPAIGN_STATUS_LABELS[campaign.status] || {
                            label: campaign.status,
                            variant: "secondary" as const,
                          };
                          const typeLabel = CAMPAIGN_TYPES.find((t) => t.value === campaign.type)?.label || campaign.type;
                          return (
                            <TableRow key={campaign.id} data-testid={`row-campaign-${campaign.id}`}>
                              <TableCell>
                                <div className="font-medium truncate max-w-[250px]" data-testid={`text-name-${campaign.id}`}>
                                  {campaign.name}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {campaign.title}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" data-testid={`badge-type-${campaign.id}`}>
                                  {typeLabel}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge variant={statusConfig.variant} data-testid={`badge-status-${campaign.id}`}>
                                  {statusConfig.label}
                                </Badge>
                              </TableCell>
                              <TableCell data-testid={`text-sent-${campaign.id}`}>
                                {campaign.sentCount || 0}
                              </TableCell>
                              <TableCell data-testid={`text-opened-${campaign.id}`}>
                                {campaign.openedCount || 0}
                                <span className="text-xs text-muted-foreground mr-1">
                                  ({getOpenRate(campaign.sentCount, campaign.openedCount)}%)
                                </span>
                              </TableCell>
                              <TableCell data-testid={`text-date-${campaign.id}`}>
                                {format(new Date(campaign.createdAt), "dd MMM yyyy", { locale: ar })}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleViewCampaign(campaign)}
                                    data-testid={`button-view-${campaign.id}`}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  {campaign.status === "draft" && (
                                    <>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleEditCampaign(campaign)}
                                        data-testid={`button-edit-${campaign.id}`}
                                      >
                                        <Edit className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => sendCampaignMutation.mutate(campaign.id)}
                                        disabled={sendCampaignMutation.isPending}
                                        data-testid={`button-send-${campaign.id}`}
                                      >
                                        <Send className="h-4 w-4" />
                                      </Button>
                                    </>
                                  )}
                                  {campaign.status !== "sent" && campaign.status !== "sending" && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleDeleteCampaign(campaign)}
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
                    <div className="flex items-center justify-between mt-4">
                      <p className="text-sm text-muted-foreground">
                        صفحة {page} من {totalPages}
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          disabled={page === 1}
                          data-testid="button-prev-page"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
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

          <Separator />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                إحصائيات سريعة
              </CardTitle>
              <CardDescription>ملخص أداء الحملات خلال آخر 30 يوم</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground">إجمالي الحملات</div>
                  <div className="text-2xl font-bold mt-1" data-testid="text-stats-campaigns">
                    {analytics?.campaigns?.totalCampaigns || 0}
                  </div>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground">تم التوصيل</div>
                  <div className="text-2xl font-bold mt-1" data-testid="text-stats-delivered">
                    {analytics?.campaigns?.totalDelivered || 0}
                  </div>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground">تم النقر</div>
                  <div className="text-2xl font-bold mt-1" data-testid="text-stats-clicked">
                    {analytics?.campaigns?.totalClicked || 0}
                  </div>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground">فشل الإرسال</div>
                  <div className="text-2xl font-bold mt-1 text-destructive" data-testid="text-stats-failed">
                    {analytics?.campaigns?.totalFailed || 0}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
              <DialogHeader>
                <DialogTitle>إنشاء حملة جديدة</DialogTitle>
                <DialogDescription>
                  أنشئ حملة إشعارات جديدة للوصول إلى المستخدمين
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2 relative">
                  <Label htmlFor="title" className="flex items-center gap-2">
                    <Search className="h-4 w-4" />
                    البحث عن مقال (اختياري)
                  </Label>
                  <Input
                    id="searchArticle"
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    placeholder="اكتب للبحث عن مقال..."
                    data-testid="input-search-article"
                    autoComplete="off"
                  />
                  {isSearchingArticles && (
                    <div className="absolute left-3 top-9">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  {showArticleResults && articleSearchResults.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-y-auto">
                      {articleSearchResults.map((article) => (
                        <button
                          key={article.id}
                          type="button"
                          className="w-full text-right px-4 py-3 hover:bg-muted flex items-center gap-3 border-b last:border-b-0"
                          onClick={() => handleSelectArticle(article)}
                          data-testid={`article-result-${article.id}`}
                        >
                          {article.imageUrl && (
                            <img 
                              src={article.imageUrl} 
                              alt="" 
                              className="w-12 h-12 object-cover rounded"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate text-sm">{article.title}</p>
                            <p className="text-xs text-muted-foreground truncate">/article/{article.slug}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {showArticleResults && articleSearchResults.length === 0 && searchQuery.length >= 3 && !isSearchingArticles && (
                    <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg p-3 text-center text-muted-foreground text-sm">
                      لم يتم العثور على مقالات مطابقة
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="type">نوع الحملة</Label>
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
                  <Label htmlFor="notificationTitle">عنوان الإشعار</Label>
                  <Input
                    id="notificationTitle"
                    value={formData.title || "خبر جديد من سبق"}
                    onChange={(e) => setFormData((f) => ({ ...f, title: e.target.value }))}
                    placeholder="خبر جديد من سبق"
                    data-testid="input-notification-title"
                  />
                  <p className="text-xs text-muted-foreground">
                    العنوان الذي يظهر في رأس الإشعار
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="body">محتوى الإشعار *</Label>
                  <Textarea
                    id="body"
                    value={formData.body}
                    onChange={(e) => setFormData((f) => ({ ...f, body: e.target.value }))}
                    placeholder="نص الإشعار الذي سيظهر للمستخدم"
                    rows={3}
                    data-testid="input-campaign-body"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="deeplink">
                    الصفحة المستهدفة
                  </Label>
                  <Input
                    id="deeplink"
                    value={formData.deeplink}
                    onChange={(e) => setFormData((f) => ({ ...f, deeplink: e.target.value }))}
                    placeholder="/article/article-slug"
                    dir="ltr"
                    data-testid="input-campaign-deeplink"
                  />
                  <p className="text-xs text-muted-foreground">
                    الرابط الذي سينتقل إليه المستخدم عند الضغط على الإشعار (مثال: /article/خبر-عاجل)
                  </p>
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>استهداف جميع المستخدمين</Label>
                    <p className="text-xs text-muted-foreground">
                      إرسال الإشعار لجميع الأجهزة المسجلة
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
                        {(segments || []).map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.nameAr || s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="grid gap-4 md:grid-cols-2">
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
                      اتركه فارغًا للحفظ كمسودة
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

          <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
              <DialogHeader>
                <DialogTitle>تعديل الحملة</DialogTitle>
                <DialogDescription>
                  تعديل بيانات الحملة قبل الإرسال
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
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

                <div className="flex items-center justify-between">
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
                        {(segments || []).map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.nameAr || s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="grid gap-4 md:grid-cols-2">
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

          <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
            <DialogContent className="max-w-lg" dir="rtl">
              <DialogHeader>
                <DialogTitle>تفاصيل الحملة</DialogTitle>
              </DialogHeader>
              {selectedCampaign && (
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">الاسم:</span>
                      <p className="font-medium">{selectedCampaign.name}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">النوع:</span>
                      <p className="font-medium">
                        {CAMPAIGN_TYPES.find((t) => t.value === selectedCampaign.type)?.label || selectedCampaign.type}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">الحالة:</span>
                      <Badge variant={CAMPAIGN_STATUS_LABELS[selectedCampaign.status]?.variant || "secondary"}>
                        {CAMPAIGN_STATUS_LABELS[selectedCampaign.status]?.label || selectedCampaign.status}
                      </Badge>
                    </div>
                    <div>
                      <span className="text-muted-foreground">الأولوية:</span>
                      <p className="font-medium">
                        {PRIORITY_OPTIONS.find((p) => p.value === selectedCampaign.priority)?.label || selectedCampaign.priority}
                      </p>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <span className="text-muted-foreground text-sm">العنوان (EN):</span>
                    <p className="font-medium" dir="ltr">{selectedCampaign.title}</p>
                  </div>
                  {selectedCampaign.titleAr && (
                    <div>
                      <span className="text-muted-foreground text-sm">العنوان (AR):</span>
                      <p className="font-medium">{selectedCampaign.titleAr}</p>
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground text-sm">المحتوى (EN):</span>
                    <p className="text-sm" dir="ltr">{selectedCampaign.body}</p>
                  </div>
                  {selectedCampaign.bodyAr && (
                    <div>
                      <span className="text-muted-foreground text-sm">المحتوى (AR):</span>
                      <p className="text-sm">{selectedCampaign.bodyAr}</p>
                    </div>
                  )}

                  <Separator />

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">المرسل:</span>
                      <p className="font-medium text-lg">{selectedCampaign.sentCount || 0}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">تم التوصيل:</span>
                      <p className="font-medium text-lg">{selectedCampaign.deliveredCount || 0}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">تم الفتح:</span>
                      <p className="font-medium text-lg">{selectedCampaign.openedCount || 0}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">تم النقر:</span>
                      <p className="font-medium text-lg">{selectedCampaign.clickedCount || 0}</p>
                    </div>
                  </div>

                  {selectedCampaign.sentAt && (
                    <div className="text-sm text-muted-foreground">
                      تم الإرسال: {format(new Date(selectedCampaign.sentAt), "dd MMM yyyy HH:mm", { locale: ar })}
                    </div>
                  )}
                  {selectedCampaign.scheduledAt && selectedCampaign.status === "scheduled" && (
                    <div className="text-sm text-muted-foreground">
                      مجدول لـ: {format(new Date(selectedCampaign.scheduledAt), "dd MMM yyyy HH:mm", { locale: ar })}
                    </div>
                  )}
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
        </div>
      </ErrorBoundary>
    </DashboardLayout>
  );
}
