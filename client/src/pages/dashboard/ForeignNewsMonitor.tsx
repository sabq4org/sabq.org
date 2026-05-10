import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Globe, 
  Rss, 
  Newspaper, 
  FileCheck, 
  Tag,
  Plus,
  RefreshCw,
  Edit,
  Trash2,
  Check,
  X,
  ExternalLink,
  Clock,
  TrendingUp,
  AlertCircle,
  Loader2,
  Eye,
  Send,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Languages
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface RssSource {
  id: string;
  name: string;
  url: string;
  language: string;
  priority: "high" | "medium" | "low";
  lastFetched: string | null;
  isActive: boolean;
  itemCount: number;
}

interface IncomingItem {
  id: string;
  originalTitle: string;
  source: string;
  publishedAt: string;
  saudiRelevanceScore: number;
  isProcessed: boolean;
  isSaudiRelated: boolean;
}

interface ProcessedArticle {
  id: string;
  translatedTitle: string;
  originalTitle: string;
  translatedContent: string;
  originalContent: string;
  translatedExcerpt: string;
  aiSubtitle: string | null;
  sentiment: "positive" | "negative" | "neutral";
  status: "pending" | "approved" | "rejected" | "published";
  source: string;
  sourceUrl: string;
  imageUrl: string | null;
  seoTitle: string;
  seoDescription: string;
  categoryId: string | null;
  createdAt: string;
}

interface Keyword {
  id: string;
  keyword: string;
  language: string;
  category: string;
}

interface Stats {
  totalSources: number;
  pendingItems: number;
  processedToday: number;
  saudiRelated: number;
  sentiment?: {
    positive: number;
    negative: number;
    neutral: number;
  };
}

export default function ForeignNewsMonitor() {
  const [activeTab, setActiveTab] = useState("sources");

  return (
    <DashboardLayout>
      <div dir="rtl" className="space-y-6" data-testid="foreign-news-monitor-page">
        <HeaderSection />
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full" dir="rtl">
          <TabsList className="grid w-full grid-cols-4 gap-1 flex-row-reverse" data-testid="tabs-list">
            <TabsTrigger value="sources" data-testid="tab-sources">
              <Rss className="w-4 h-4 ml-2" />
              مصادر RSS
            </TabsTrigger>
            <TabsTrigger value="incoming" data-testid="tab-incoming">
              <Newspaper className="w-4 h-4 ml-2" />
              الأخبار الواردة
            </TabsTrigger>
            <TabsTrigger value="processed" data-testid="tab-processed">
              <FileCheck className="w-4 h-4 ml-2" />
              الأخبار المعالجة
            </TabsTrigger>
            <TabsTrigger value="keywords" data-testid="tab-keywords">
              <Tag className="w-4 h-4 ml-2" />
              الكلمات المفتاحية
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sources" className="mt-6">
            <SourcesTab />
          </TabsContent>

          <TabsContent value="incoming" className="mt-6">
            <IncomingItemsTab />
          </TabsContent>

          <TabsContent value="processed" className="mt-6">
            <ProcessedArticlesTab />
          </TabsContent>

          <TabsContent value="keywords" className="mt-6">
            <KeywordsTab />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

interface IngestAllResult {
  totalFeeds: number;
  totalItemsFound: number;
  totalItemsIngested: number;
  totalSaudiRelated: number;
}

function HeaderSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: stats, isLoading } = useQuery<Stats>({
    queryKey: ["/api/foreign-news/stats"],
  });

  const ingestAllMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("/api/foreign-news/ingest-all", {
        method: "POST",
      }) as Promise<IngestAllResult>;
    },
    onSuccess: (data) => {
      toast({
        title: "تم جلب الأخبار",
        description: `تم جلب ${data.totalItemsIngested} خبر من ${data.totalFeeds} مصدر (${data.totalSaudiRelated} ذات صلة بالسعودية)`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/foreign-news"] });
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء جلب الأخبار",
        variant: "destructive",
      });
    },
  });

  const defaultStats: Stats = {
    totalSources: 0,
    pendingItems: 0,
    processedToday: 0,
    saudiRelated: 0,
    sentiment: { positive: 0, negative: 0, neutral: 0 },
  };

  const displayStats = stats || defaultStats;
  const sentiment = displayStats.sentiment || { positive: 0, negative: 0, neutral: 0 };
  const totalSentiment = sentiment.positive + sentiment.negative + sentiment.neutral;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600">
            <Globe className="h-8 w-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-page-title">
              رصد الأخبار الأجنبية
            </h1>
            <p className="text-muted-foreground" data-testid="text-page-description">
              مراقبة وترجمة ومعالجة الأخبار العالمية المتعلقة بالمملكة العربية السعودية
            </p>
          </div>
        </div>
        <Button
          size="lg"
          onClick={() => ingestAllMutation.mutate()}
          disabled={ingestAllMutation.isPending}
          data-testid="button-fetch-all-news"
          className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700"
        >
          {ingestAllMutation.isPending ? (
            <Loader2 className="w-5 h-5 ml-2 animate-spin" />
          ) : (
            <RefreshCw className="w-5 h-5 ml-2" />
          )}
          جلب جميع الأخبار
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="إجمالي المصادر"
          value={displayStats.totalSources}
          icon={<Rss className="h-5 w-5" />}
          color="blue"
          isLoading={isLoading}
          testId="stats-total-sources"
        />
        <StatsCard
          title="في انتظار المعالجة"
          value={displayStats.pendingItems}
          icon={<Clock className="h-5 w-5" />}
          color="yellow"
          isLoading={isLoading}
          testId="stats-pending-items"
        />
        <StatsCard
          title="تمت معالجتها اليوم"
          value={displayStats.processedToday}
          icon={<TrendingUp className="h-5 w-5" />}
          color="green"
          isLoading={isLoading}
          testId="stats-processed-today"
        />
        <StatsCard
          title="ذات صلة بالسعودية"
          value={displayStats.saudiRelated}
          icon={<AlertCircle className="h-5 w-5" />}
          color="purple"
          isLoading={isLoading}
          testId="stats-saudi-related"
        />
      </div>

      {/* Sentiment Analysis Bar */}
      {totalSentiment > 0 && (
        <Card data-testid="sentiment-analysis-card">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm">تحليل المشاعر للأخبار المعالجة</h3>
              <span className="text-xs text-muted-foreground">{totalSentiment} خبر</span>
            </div>
            <div className="flex h-4 rounded-full overflow-hidden bg-muted">
              {sentiment.positive > 0 && (
                <div 
                  className="bg-gradient-to-r from-green-400 to-green-500 transition-all duration-500"
                  style={{ width: `${(sentiment.positive / totalSentiment) * 100}%` }}
                  title={`إيجابي: ${sentiment.positive}`}
                />
              )}
              {sentiment.neutral > 0 && (
                <div 
                  className="bg-gradient-to-r from-gray-300 to-gray-400 transition-all duration-500"
                  style={{ width: `${(sentiment.neutral / totalSentiment) * 100}%` }}
                  title={`محايد: ${sentiment.neutral}`}
                />
              )}
              {sentiment.negative > 0 && (
                <div 
                  className="bg-gradient-to-r from-red-400 to-red-500 transition-all duration-500"
                  style={{ width: `${(sentiment.negative / totalSentiment) * 100}%` }}
                  title={`سلبي: ${sentiment.negative}`}
                />
              )}
            </div>
            <div className="flex items-center justify-between mt-3 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span>إيجابي ({sentiment.positive})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-gray-400" />
                <span>محايد ({sentiment.neutral})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span>سلبي ({sentiment.negative})</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatsCard({ 
  title, 
  value, 
  icon, 
  color, 
  isLoading,
  testId
}: { 
  title: string; 
  value: number; 
  icon: React.ReactNode; 
  color: "blue" | "yellow" | "green" | "purple";
  isLoading?: boolean;
  testId: string;
}) {
  const colorClasses = {
    blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    yellow: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
    green: "bg-green-500/10 text-green-600 dark:text-green-400",
    purple: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  };

  return (
    <Card data-testid={testId}>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            {isLoading ? (
              <Skeleton className="h-8 w-16 mt-1" />
            ) : (
              <p className="text-3xl font-bold mt-1">{value}</p>
            )}
          </div>
          <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SourcesTab() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<RssSource | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: sources, isLoading } = useQuery<RssSource[]>({
    queryKey: ["/api/foreign-news/sources"],
  });

  const fetchMutation = useMutation({
    mutationFn: async (sourceId: string) => {
      return apiRequest(`/api/foreign-news/sources/${sourceId}/fetch`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      toast({
        title: "تم جلب الأخبار",
        description: "تم جلب الأخبار من المصدر بنجاح",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/foreign-news"] });
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء جلب الأخبار",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (sourceId: string) => {
      return apiRequest(`/api/foreign-news/sources/${sourceId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      toast({
        title: "تم الحذف",
        description: "تم حذف المصدر بنجاح",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/foreign-news/sources"] });
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء حذف المصدر",
        variant: "destructive",
      });
    },
  });

  const getPriorityBadge = (priority: string) => {
    const variants: Record<string, { label: string; className: string }> = {
      high: { label: "عالية", className: "bg-red-500/10 text-red-600 border-red-500/20" },
      medium: { label: "متوسطة", className: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20" },
      low: { label: "منخفضة", className: "bg-gray-500/10 text-gray-600 border-gray-500/20" },
    };
    const variant = variants[priority] || variants.low;
    return <Badge variant="outline" className={variant.className}>{variant.label}</Badge>;
  };

  const getLanguageLabel = (lang: string) => {
    const labels: Record<string, string> = {
      en: "الإنجليزية",
      fr: "الفرنسية",
      de: "الألمانية",
      es: "الإسبانية",
      it: "الإيطالية",
      ru: "الروسية",
      zh: "الصينية",
      ja: "اليابانية",
      ko: "الكورية",
      tr: "التركية",
      fa: "الفارسية",
      he: "العبرية",
    };
    return labels[lang] || lang;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Rss className="w-5 h-5" />
              مصادر RSS
            </CardTitle>
            <CardDescription>
              إدارة مصادر الأخبار الأجنبية
            </CardDescription>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-source">
                <Plus className="w-4 h-4 ml-2" />
                إضافة مصدر
              </Button>
            </DialogTrigger>
            <SourceDialog 
              onClose={() => setIsAddDialogOpen(false)} 
              source={null}
            />
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : sources && sources.length > 0 ? (
          <div dir="rtl">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">الاسم</TableHead>
                <TableHead className="text-right">الرابط</TableHead>
                <TableHead className="text-right">اللغة</TableHead>
                <TableHead className="text-right">الأولوية</TableHead>
                <TableHead className="text-right">آخر جلب</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead className="text-right">الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.map((source) => (
                <TableRow key={source.id} data-testid={`source-row-${source.id}`}>
                  <TableCell className="font-medium">{source.name}</TableCell>
                  <TableCell>
                    <a 
                      href={source.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline flex items-center gap-1 max-w-[200px] truncate"
                    >
                      {source.url}
                      <ExternalLink className="w-3 h-3 flex-shrink-0" />
                    </a>
                  </TableCell>
                  <TableCell>{getLanguageLabel(source.language)}</TableCell>
                  <TableCell>{getPriorityBadge(source.priority)}</TableCell>
                  <TableCell>
                    {source.lastFetched 
                      ? new Date(source.lastFetched).toLocaleDateString("ar-SA-u-ca-gregory", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "لم يتم الجلب بعد"
                    }
                  </TableCell>
                  <TableCell>
                    <Badge variant={source.isActive ? "default" : "secondary"}>
                      {source.isActive ? "نشط" : "متوقف"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => fetchMutation.mutate(source.id)}
                        disabled={fetchMutation.isPending}
                        data-testid={`button-fetch-${source.id}`}
                      >
                        <RefreshCw className={`w-4 h-4 ${fetchMutation.isPending ? "animate-spin" : ""}`} />
                      </Button>
                      <Dialog open={editingSource?.id === source.id} onOpenChange={(open) => !open && setEditingSource(null)}>
                        <DialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditingSource(source)}
                            data-testid={`button-edit-${source.id}`}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                        </DialogTrigger>
                        {editingSource && (
                          <SourceDialog 
                            onClose={() => setEditingSource(null)} 
                            source={editingSource}
                          />
                        )}
                      </Dialog>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteMutation.mutate(source.id)}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-${source.id}`}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <Rss className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>لا توجد مصادر مضافة</p>
            <p className="text-sm mt-1">ابدأ بإضافة مصدر RSS جديد</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SourceDialog({ onClose, source }: { onClose: () => void; source: RssSource | null }) {
  const [formData, setFormData] = useState({
    name: source?.name || "",
    url: source?.url || "",
    language: source?.language || "en",
    priority: source?.priority || "medium",
    isActive: source?.isActive ?? true,
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const url = source 
        ? `/api/foreign-news/sources/${source.id}`
        : "/api/foreign-news/sources";
      return apiRequest(url, {
        method: source ? "PATCH" : "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({
        title: source ? "تم التحديث" : "تم الإضافة",
        description: source ? "تم تحديث المصدر بنجاح" : "تم إضافة المصدر بنجاح",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/foreign-news/sources"] });
      onClose();
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء حفظ المصدر",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(formData);
  };

  return (
    <DialogContent className="sm:max-w-[500px]" dir="rtl">
      <DialogHeader>
        <DialogTitle>
          {source ? "تعديل المصدر" : "إضافة مصدر جديد"}
        </DialogTitle>
        <DialogDescription>
          {source ? "قم بتعديل بيانات المصدر" : "أدخل بيانات مصدر RSS الجديد"}
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">اسم المصدر</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="مثال: BBC News"
            required
            data-testid="input-source-name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="url">رابط RSS</Label>
          <Input
            id="url"
            type="url"
            value={formData.url}
            onChange={(e) => setFormData({ ...formData, url: e.target.value })}
            placeholder="https://example.com/rss"
            required
            dir="ltr"
            data-testid="input-source-url"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="language">اللغة</Label>
            <Select
              value={formData.language}
              onValueChange={(value) => setFormData({ ...formData, language: value })}
            >
              <SelectTrigger data-testid="select-language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">الإنجليزية</SelectItem>
                <SelectItem value="fr">الفرنسية</SelectItem>
                <SelectItem value="de">الألمانية</SelectItem>
                <SelectItem value="es">الإسبانية</SelectItem>
                <SelectItem value="ru">الروسية</SelectItem>
                <SelectItem value="zh">الصينية</SelectItem>
                <SelectItem value="tr">التركية</SelectItem>
                <SelectItem value="fa">الفارسية</SelectItem>
                <SelectItem value="he">العبرية</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="priority">الأولوية</Label>
            <Select
              value={formData.priority}
              onValueChange={(value) => setFormData({ ...formData, priority: value as any })}
            >
              <SelectTrigger data-testid="select-priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="high">عالية</SelectItem>
                <SelectItem value="medium">متوسطة</SelectItem>
                <SelectItem value="low">منخفضة</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="isActive">تفعيل المصدر</Label>
          <Switch
            id="isActive"
            checked={formData.isActive}
            onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
            data-testid="switch-is-active"
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button type="submit" disabled={mutation.isPending} data-testid="button-save-source">
            {mutation.isPending && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
            {source ? "حفظ التغييرات" : "إضافة المصدر"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function IncomingItemsTab() {
  const [filter, setFilter] = useState<"all" | "saudi" | "pending" | "processed">("saudi");
  const [page, setPage] = useState(1);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ items: IncomingItem[]; total: number }>({
    queryKey: ["/api/foreign-news/incoming", { filter, page }],
  });

  const processMutation = useMutation({
    mutationFn: async (itemId: string) => {
      setProcessingId(itemId);
      return apiRequest(`/api/foreign-news/incoming/${itemId}/process`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      toast({
        title: "تمت المعالجة",
        description: "تم معالجة الخبر وترجمته بنجاح",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/foreign-news"] });
      setProcessingId(null);
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء معالجة الخبر",
        variant: "destructive",
      });
      setProcessingId(null);
    },
  });

  const items = data?.items || [];
  const total = data?.total || 0;

  const getRelevanceBadge = (score: number) => {
    if (score >= 80) return <Badge className="bg-green-500 text-white">{score}%</Badge>;
    if (score >= 50) return <Badge className="bg-yellow-500 text-white">{score}%</Badge>;
    return <Badge variant="secondary">{score}%</Badge>;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Newspaper className="w-5 h-5" />
                الأخبار الواردة (آخر 24 ساعة)
              </CardTitle>
              <CardDescription>
                {total} خبر في قائمة الانتظار
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <Select value={filter} onValueChange={(v) => { setFilter(v as any); setPage(1); }}>
                <SelectTrigger className="w-[180px]" data-testid="select-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الأخبار</SelectItem>
                  <SelectItem value="saudi">ذات صلة بالسعودية</SelectItem>
                  <SelectItem value="pending">في انتظار المعالجة</SelectItem>
                  <SelectItem value="processed">تمت معالجتها</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : items.length > 0 ? (
            <>
              <div className="rounded-md border" dir="rtl">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right w-[50%]">العنوان</TableHead>
                      <TableHead className="text-right">المصدر</TableHead>
                      <TableHead className="text-right">التاريخ</TableHead>
                      <TableHead className="text-center">الصلة</TableHead>
                      <TableHead className="text-center">الحالة</TableHead>
                      <TableHead className="text-center w-[100px]">إجراء</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id} data-testid={`incoming-item-${item.id}`}>
                        <TableCell>
                          <p className="font-medium text-sm line-clamp-1" dir="ltr" title={item.originalTitle}>
                            {item.originalTitle}
                          </p>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">{item.source}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">
                            {new Date(item.publishedAt).toLocaleDateString("ar-SA-u-ca-gregory")}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          {getRelevanceBadge(item.saudiRelevanceScore)}
                        </TableCell>
                        <TableCell className="text-center">
                          {item.isProcessed ? (
                            <Badge variant="outline" className="bg-blue-500/10 text-blue-600">
                              <Check className="w-3 h-3 ml-1" />
                              معالج
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600">
                              <Clock className="w-3 h-3 ml-1" />
                              انتظار
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {!item.isProcessed && item.isSaudiRelated && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => processMutation.mutate(item.id)}
                              disabled={processingId === item.id}
                              data-testid={`button-process-${item.id}`}
                            >
                              {processingId === item.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <FileCheck className="w-4 h-4" />
                              )}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              
              {total > 10 && (
                <div className="flex items-center justify-center gap-2 mt-6">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    صفحة {page} من {Math.ceil(total / 10)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => p + 1)}
                    disabled={page >= Math.ceil(total / 10)}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Newspaper className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>لا توجد أخبار واردة</p>
              <p className="text-sm mt-1">ستظهر الأخبار الجديدة هنا تلقائياً</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ProcessedArticlesTab() {
  const [sentimentFilter, setSentimentFilter] = useState<"all" | "positive" | "negative" | "neutral">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "rejected" | "published">("all");
  const [editingArticle, setEditingArticle] = useState<ProcessedArticle | null>(null);
  const [previewArticle, setPreviewArticle] = useState<ProcessedArticle | null>(null);
  const [page, setPage] = useState(1);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ articles: ProcessedArticle[]; total: number }>({
    queryKey: ["/api/foreign-news/processed", { sentimentFilter, statusFilter, page }],
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      // Use correct endpoint based on status
      const endpoint = status === "approved" 
        ? `/api/foreign-news/processed/${id}/approve`
        : status === "rejected"
        ? `/api/foreign-news/processed/${id}/reject`
        : `/api/foreign-news/processed/${id}/publish`;
      
      return apiRequest(endpoint, {
        method: "POST",
        body: status === "rejected" ? JSON.stringify({ reason: "Rejected by editor" }) : undefined,
      });
    },
    onSuccess: (_, variables) => {
      const messages: Record<string, { title: string; description: string }> = {
        approved: { title: "تم الاعتماد", description: "تم اعتماد الخبر ونقله إلى المسودات" },
        rejected: { title: "تم الرفض", description: "تم رفض الخبر" },
        published: { title: "تم النشر", description: "تم نشر الخبر على الموقع" },
      };
      const msg = messages[variables.status] || { title: "تم التحديث", description: "تم تحديث حالة الخبر" };
      toast({ title: msg.title, description: msg.description });
      queryClient.invalidateQueries({ queryKey: ["/api/foreign-news/processed"] });
      queryClient.invalidateQueries({ queryKey: ["/api/foreign-news/stats"] });
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء تحديث الحالة",
        variant: "destructive",
      });
    },
  });

  const reExtractMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/foreign-news/processed/${id}/re-extract`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      toast({
        title: "تم إعادة الاستخراج",
        description: "تم استخراج المحتوى الكامل من المصدر الأصلي وترجمته",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/foreign-news/processed"] });
      setPreviewArticle(null);
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error?.message || "حدث خطأ أثناء إعادة استخراج المحتوى",
        variant: "destructive",
      });
    },
  });

  const articles = data?.articles || [];
  const total = data?.total || 0;

  const getSentimentBadge = (sentiment: string) => {
    const variants: Record<string, { label: string; className: string }> = {
      positive: { label: "إيجابي", className: "bg-green-500/10 text-green-600 border-green-500/20" },
      negative: { label: "سلبي", className: "bg-red-500/10 text-red-600 border-red-500/20" },
      neutral: { label: "محايد", className: "bg-gray-500/10 text-gray-600 border-gray-500/20" },
    };
    const variant = variants[sentiment] || variants.neutral;
    return <Badge variant="outline" className={variant.className}>{variant.label}</Badge>;
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      pending: { label: "قيد المراجعة", variant: "secondary" },
      approved: { label: "مُعتمد", variant: "default" },
      rejected: { label: "مرفوض", variant: "destructive" },
      published: { label: "منشور", variant: "outline" },
    };
    const v = variants[status] || variants.pending;
    return <Badge variant={v.variant}>{v.label}</Badge>;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileCheck className="w-5 h-5" />
                الأخبار المعالجة
              </CardTitle>
              <CardDescription>
                {total} خبر تمت معالجته
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={sentimentFilter} onValueChange={(v) => setSentimentFilter(v as any)}>
                <SelectTrigger className="w-[140px]" data-testid="select-sentiment-filter">
                  <SelectValue placeholder="المشاعر" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع المشاعر</SelectItem>
                  <SelectItem value="positive">إيجابي</SelectItem>
                  <SelectItem value="negative">سلبي</SelectItem>
                  <SelectItem value="neutral">محايد</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                <SelectTrigger className="w-[140px]" data-testid="select-status-filter">
                  <SelectValue placeholder="الحالة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الحالات</SelectItem>
                  <SelectItem value="pending">قيد المراجعة</SelectItem>
                  <SelectItem value="approved">مُعتمد</SelectItem>
                  <SelectItem value="rejected">مرفوض</SelectItem>
                  <SelectItem value="published">منشور</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-64 w-full" />
              ))}
            </div>
          ) : articles.length > 0 ? (
            <>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {articles.map((article) => (
                  <Card key={article.id} className="overflow-hidden" data-testid={`processed-article-${article.id}`}>
                    {article.imageUrl && (
                      <div className="aspect-video relative overflow-hidden bg-muted">
                        <img 
                          src={article.imageUrl} 
                          alt={article.translatedTitle}
                          className="object-cover w-full h-full"
                        />
                      </div>
                    )}
                    {!article.imageUrl && (
                      <div className="aspect-video bg-muted flex items-center justify-center">
                        <ImageIcon className="w-12 h-12 text-muted-foreground/50" />
                      </div>
                    )}
                    <CardContent className="pt-4 space-y-3">
                      <div className="flex items-start gap-2 flex-wrap">
                        {getSentimentBadge(article.sentiment)}
                        {getStatusBadge(article.status)}
                      </div>
                      
                      <h3 className="font-semibold text-sm leading-relaxed line-clamp-2">
                        {article.translatedTitle}
                      </h3>
                      
                      <p className="text-xs text-muted-foreground line-clamp-1" dir="ltr">
                        {article.originalTitle}
                      </p>

                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Globe className="w-3 h-3" />
                        <span>{article.source}</span>
                      </div>

                      <div className="flex items-center gap-1 pt-2 border-t flex-wrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPreviewArticle(article)}
                          data-testid={`button-preview-${article.id}`}
                          className="text-blue-600"
                        >
                          <Eye className="w-4 h-4 ml-1" />
                          معاينة
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingArticle(article)}
                          data-testid={`button-edit-article-${article.id}`}
                        >
                          <Edit className="w-4 h-4 ml-1" />
                          تعديل
                        </Button>
                        {article.status === "pending" && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => updateStatusMutation.mutate({ id: article.id, status: "approved" })}
                              disabled={updateStatusMutation.isPending}
                              className="text-green-600"
                              data-testid={`button-approve-${article.id}`}
                            >
                              <Check className="w-4 h-4 ml-1" />
                              اعتماد
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => updateStatusMutation.mutate({ id: article.id, status: "rejected" })}
                              disabled={updateStatusMutation.isPending}
                              className="text-red-600"
                              data-testid={`button-reject-${article.id}`}
                            >
                              <X className="w-4 h-4 ml-1" />
                              رفض
                            </Button>
                          </>
                        )}
                        {article.status === "approved" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updateStatusMutation.mutate({ id: article.id, status: "published" })}
                            disabled={updateStatusMutation.isPending}
                            className="text-blue-600"
                            data-testid={`button-publish-${article.id}`}
                          >
                            <Send className="w-4 h-4 ml-1" />
                            نشر
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {total > 12 && (
                <div className="flex items-center justify-center gap-2 mt-6">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    صفحة {page} من {Math.ceil(total / 12)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => p + 1)}
                    disabled={page >= Math.ceil(total / 12)}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <FileCheck className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>لا توجد أخبار معالجة</p>
              <p className="text-sm mt-1">قم بمعالجة الأخبار الواردة لتظهر هنا</p>
            </div>
          )}
        </CardContent>
      </Card>

      {editingArticle && (
        <EditArticleDialog 
          article={editingArticle} 
          onClose={() => setEditingArticle(null)} 
        />
      )}
      
      {previewArticle && (
        <PreviewArticleDialog 
          article={previewArticle} 
          onClose={() => setPreviewArticle(null)}
          onApprove={() => {
            updateStatusMutation.mutate({ id: previewArticle.id, status: "approved" });
            setPreviewArticle(null);
          }}
          onReject={() => {
            updateStatusMutation.mutate({ id: previewArticle.id, status: "rejected" });
            setPreviewArticle(null);
          }}
          onEdit={() => {
            setEditingArticle(previewArticle);
            setPreviewArticle(null);
          }}
          onReExtract={() => {
            reExtractMutation.mutate(previewArticle.id);
          }}
          isReExtracting={reExtractMutation.isPending}
        />
      )}
    </div>
  );
}

function PreviewArticleDialog({ 
  article, 
  onClose, 
  onApprove, 
  onReject,
  onEdit,
  onReExtract,
  isReExtracting 
}: { 
  article: ProcessedArticle; 
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
  onEdit: () => void;
  onReExtract: () => void;
  isReExtracting?: boolean;
}) {
  const getSentimentBadge = (sentiment: string) => {
    const variants: Record<string, { label: string; className: string }> = {
      positive: { label: "إيجابي", className: "bg-green-500/10 text-green-600 border-green-500/20" },
      negative: { label: "سلبي", className: "bg-red-500/10 text-red-600 border-red-500/20" },
      neutral: { label: "محايد", className: "bg-gray-500/10 text-gray-600 border-gray-500/20" },
    };
    const variant = variants[sentiment] || variants.neutral;
    return <Badge variant="outline" className={variant.className}>{variant.label}</Badge>;
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      pending: { label: "قيد المراجعة", variant: "secondary" },
      approved: { label: "مُعتمد", variant: "default" },
      rejected: { label: "مرفوض", variant: "destructive" },
      published: { label: "منشور", variant: "outline" },
    };
    const v = variants[status] || variants.pending;
    return <Badge variant={v.variant}>{v.label}</Badge>;
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5" />
            معاينة الخبر
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            {getSentimentBadge(article.sentiment)}
            {getStatusBadge(article.status)}
            <span className="text-muted-foreground">• {article.source}</span>
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="h-[calc(90vh-220px)]">
          <div className="space-y-6 p-1">
            {/* Image */}
            {article.imageUrl && (
              <div className="rounded-lg overflow-hidden">
                <img 
                  src={article.imageUrl} 
                  alt={article.translatedTitle}
                  className="w-full h-auto max-h-64 object-cover"
                />
              </div>
            )}

            {/* Arabic Translated Content */}
            <div className="space-y-4 p-4 bg-primary/5 rounded-lg border border-primary/10">
              <div className="flex items-center gap-2">
                <Languages className="w-5 h-5 text-primary" />
                <h3 className="font-bold text-lg text-primary">النسخة العربية المترجمة</h3>
              </div>
              
              <h2 className="text-xl font-bold leading-relaxed">
                {article.translatedTitle}
              </h2>
              
              {article.translatedExcerpt && (
                <p className="text-muted-foreground leading-relaxed border-r-4 border-primary/30 pr-4">
                  {article.translatedExcerpt}
                </p>
              )}
              
              <div className="prose prose-sm max-w-none leading-relaxed whitespace-pre-wrap">
                {article.translatedContent || "لا يوجد محتوى مترجم"}
              </div>
            </div>

            {/* Original English Content */}
            <div className="space-y-4 p-4 bg-muted rounded-lg">
              <div className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-muted-foreground" />
                <h3 className="font-semibold text-muted-foreground">النص الأصلي (الإنجليزي)</h3>
              </div>
              
              <h3 className="font-medium text-sm" dir="ltr">
                {article.originalTitle}
              </h3>
              
              <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap" dir="ltr">
                {article.originalContent || "لا يوجد محتوى أصلي"}
              </div>
            </div>

            {/* SEO Info */}
            {(article.seoTitle || article.seoDescription) && (
              <div className="space-y-2 p-4 bg-blue-500/5 rounded-lg border border-blue-500/10">
                <h4 className="font-semibold text-sm text-blue-600 flex items-center gap-2">
                  <Search className="w-4 h-4" />
                  معلومات SEO
                </h4>
                {article.seoTitle && (
                  <p className="text-sm"><strong>عنوان SEO:</strong> {article.seoTitle}</p>
                )}
                {article.seoDescription && (
                  <p className="text-sm"><strong>وصف SEO:</strong> {article.seoDescription}</p>
                )}
              </div>
            )}

            {/* Source Link */}
            {article.sourceUrl && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ExternalLink className="w-4 h-4" />
                <a href={article.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:underline" dir="ltr">
                  {article.sourceUrl}
                </a>
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose}>
              إغلاق
            </Button>
            <Button variant="outline" onClick={onEdit}>
              <Edit className="w-4 h-4 ml-1" />
              تعديل
            </Button>
            <Button 
              variant="outline" 
              onClick={onReExtract} 
              disabled={isReExtracting}
              className="text-blue-600 border-blue-500/30 hover:bg-blue-500/10"
              data-testid="button-re-extract"
            >
              {isReExtracting ? (
                <Loader2 className="w-4 h-4 ml-1 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 ml-1" />
              )}
              إعادة استخراج المحتوى
            </Button>
          </div>
          
          {article.status === "pending" && (
            <div className="flex items-center gap-2">
              <Button variant="destructive" onClick={onReject}>
                <X className="w-4 h-4 ml-1" />
                رفض
              </Button>
              <Button onClick={onApprove} className="bg-green-600 hover:bg-green-700">
                <Check className="w-4 h-4 ml-1" />
                اعتماد
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditArticleDialog({ article, onClose }: { article: ProcessedArticle; onClose: () => void }) {
  const [formData, setFormData] = useState({
    translatedTitle: article.translatedTitle,
    translatedContent: article.translatedContent,
    translatedExcerpt: article.translatedExcerpt,
    aiSubtitle: article.aiSubtitle || "",
    seoTitle: article.seoTitle,
    seoDescription: article.seoDescription,
    categoryId: article.categoryId || "",
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch categories for dropdown
  const { data: categoriesData } = useQuery<{ id: string; name: string; slug: string }[]>({
    queryKey: ["/api/categories"],
  });

  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest(`/api/foreign-news/processed/${article.id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({
        title: "تم الحفظ",
        description: "تم حفظ التغييرات بنجاح",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/foreign-news/processed"] });
      onClose();
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء حفظ التغييرات",
        variant: "destructive",
      });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (status: string) => {
      const endpoint = status === "approved" 
        ? `/api/foreign-news/processed/${article.id}/approve`
        : status === "rejected"
        ? `/api/foreign-news/processed/${article.id}/reject`
        : `/api/foreign-news/processed/${article.id}/publish`;
      
      return apiRequest(endpoint, {
        method: "POST",
        body: status === "rejected" ? JSON.stringify({ reason: "Rejected by editor" }) : undefined,
      });
    },
    onSuccess: () => {
      toast({
        title: "تم التحديث",
        description: "تم تحديث حالة الخبر بنجاح",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/foreign-news/processed"] });
      queryClient.invalidateQueries({ queryKey: ["/api/foreign-news/stats"] });
      onClose();
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء تحديث الحالة",
        variant: "destructive",
      });
    },
  });

  const getSentimentBadge = (sentiment: string) => {
    const variants: Record<string, { label: string; className: string }> = {
      positive: { label: "إيجابي", className: "bg-green-500/10 text-green-600 border-green-500/20" },
      negative: { label: "سلبي", className: "bg-red-500/10 text-red-600 border-red-500/20" },
      neutral: { label: "محايد", className: "bg-gray-500/10 text-gray-600 border-gray-500/20" },
    };
    const variant = variants[sentiment] || variants.neutral;
    return <Badge variant="outline" className={variant.className}>{variant.label}</Badge>;
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="w-5 h-5" />
            تعديل الخبر المترجم
          </DialogTitle>
          <DialogDescription>
            قم بمراجعة وتعديل الترجمة قبل النشر
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="h-[calc(90vh-200px)]">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-1">
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <h3 className="font-semibold">النص الأصلي</h3>
                {getSentimentBadge(article.sentiment)}
              </div>
              
              <div className="space-y-2">
                <Label>العنوان الأصلي</Label>
                <div className="p-3 bg-muted rounded-lg text-sm" dir="ltr">
                  {article.originalTitle}
                </div>
              </div>

              <div className="space-y-2">
                <Label>المحتوى الأصلي</Label>
                <div className="p-3 bg-muted rounded-lg text-sm max-h-64 overflow-y-auto" dir="ltr">
                  {article.originalContent}
                </div>
              </div>

              <div className="space-y-2">
                <Label>المصدر</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm">{article.source}</span>
                  <a 
                    href={article.sourceUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold mb-4">النص المترجم</h3>
              
              <div className="space-y-2">
                <Label htmlFor="translatedTitle">العنوان المترجم</Label>
                <Input
                  id="translatedTitle"
                  value={formData.translatedTitle}
                  onChange={(e) => setFormData({ ...formData, translatedTitle: e.target.value })}
                  data-testid="input-translated-title"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="translatedContent">المحتوى المترجم</Label>
                <Textarea
                  id="translatedContent"
                  value={formData.translatedContent}
                  onChange={(e) => setFormData({ ...formData, translatedContent: e.target.value })}
                  rows={8}
                  className="resize-none"
                  data-testid="input-translated-content"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="translatedExcerpt">المقتطف</Label>
                <Textarea
                  id="translatedExcerpt"
                  value={formData.translatedExcerpt}
                  onChange={(e) => setFormData({ ...formData, translatedExcerpt: e.target.value })}
                  rows={3}
                  className="resize-none"
                  data-testid="input-translated-excerpt"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="aiSubtitle">العنوان الفرعي</Label>
                <Input
                  id="aiSubtitle"
                  value={formData.aiSubtitle}
                  onChange={(e) => setFormData({ ...formData, aiSubtitle: e.target.value })}
                  placeholder="عنوان فرعي قصير يوضح الفكرة الرئيسية"
                  data-testid="input-ai-subtitle"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="categoryId">التصنيف</Label>
                <Select
                  value={formData.categoryId}
                  onValueChange={(value) => setFormData({ ...formData, categoryId: value })}
                >
                  <SelectTrigger data-testid="select-category">
                    <SelectValue placeholder="اختر التصنيف" />
                  </SelectTrigger>
                  <SelectContent>
                    {categoriesData?.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 gap-4 pt-4 border-t">
                <h4 className="font-medium text-sm">إعدادات SEO</h4>
                <div className="space-y-2">
                  <Label htmlFor="seoTitle">عنوان SEO</Label>
                  <Input
                    id="seoTitle"
                    value={formData.seoTitle}
                    onChange={(e) => setFormData({ ...formData, seoTitle: e.target.value })}
                    data-testid="input-seo-title"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="seoDescription">وصف SEO</Label>
                  <Textarea
                    id="seoDescription"
                    value={formData.seoDescription}
                    onChange={(e) => setFormData({ ...formData, seoDescription: e.target.value })}
                    rows={2}
                    className="resize-none"
                    data-testid="input-seo-description"
                  />
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="flex-wrap gap-2">
          <div className="flex items-center gap-2 ml-auto">
            {article.status === "pending" && (
              <>
                <Button
                  variant="outline"
                  onClick={() => updateStatusMutation.mutate("approved")}
                  disabled={updateStatusMutation.isPending}
                  className="text-green-600 border-green-600"
                  data-testid="button-dialog-approve"
                >
                  <Check className="w-4 h-4 ml-1" />
                  اعتماد
                </Button>
                <Button
                  variant="outline"
                  onClick={() => updateStatusMutation.mutate("rejected")}
                  disabled={updateStatusMutation.isPending}
                  className="text-red-600 border-red-600"
                  data-testid="button-dialog-reject"
                >
                  <X className="w-4 h-4 ml-1" />
                  رفض
                </Button>
              </>
            )}
          </div>
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button 
            onClick={() => saveMutation.mutate(formData)}
            disabled={saveMutation.isPending}
            data-testid="button-save-article"
          >
            {saveMutation.isPending && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
            حفظ التغييرات
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KeywordsTab() {
  const [newKeyword, setNewKeyword] = useState("");
  const [newLanguage, setNewLanguage] = useState("ar");
  const [newCategory, setNewCategory] = useState("general");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: keywords, isLoading } = useQuery<Keyword[]>({
    queryKey: ["/api/foreign-news/keywords"],
  });

  const addMutation = useMutation({
    mutationFn: async (data: { keyword: string; language: string; category: string }) => {
      return apiRequest("/api/foreign-news/keywords", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({
        title: "تمت الإضافة",
        description: "تمت إضافة الكلمة المفتاحية بنجاح",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/foreign-news/keywords"] });
      setNewKeyword("");
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء إضافة الكلمة المفتاحية",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (keywordId: string) => {
      return apiRequest(`/api/foreign-news/keywords/${keywordId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      toast({
        title: "تم الحذف",
        description: "تم حذف الكلمة المفتاحية بنجاح",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/foreign-news/keywords"] });
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء حذف الكلمة المفتاحية",
        variant: "destructive",
      });
    },
  });

  const handleAddKeyword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyword.trim()) return;
    addMutation.mutate({
      keyword: newKeyword.trim(),
      language: newLanguage,
      category: newCategory,
    });
  };

  const getLanguageLabel = (lang: string) => {
    const labels: Record<string, string> = {
      ar: "العربية",
      en: "الإنجليزية",
      fr: "الفرنسية",
      de: "الألمانية",
      es: "الإسبانية",
      ru: "الروسية",
      zh: "الصينية",
      tr: "التركية",
    };
    return labels[lang] || lang;
  };

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      general: "عام",
      politics: "سياسة",
      economy: "اقتصاد",
      sports: "رياضة",
      culture: "ثقافة",
      technology: "تقنية",
      health: "صحة",
    };
    return labels[category] || category;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Tag className="w-5 h-5" />
          الكلمات المفتاحية
        </CardTitle>
        <CardDescription>
          الكلمات المستخدمة لتحديد الأخبار المتعلقة بالسعودية
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={handleAddKeyword} className="flex items-end gap-4 flex-wrap">
          <div className="space-y-2 flex-1 min-w-[200px]">
            <Label htmlFor="keyword">كلمة مفتاحية جديدة</Label>
            <Input
              id="keyword"
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              placeholder="مثال: Saudi Arabia"
              data-testid="input-new-keyword"
            />
          </div>
          <div className="space-y-2 w-[150px]">
            <Label htmlFor="language">اللغة</Label>
            <Select value={newLanguage} onValueChange={setNewLanguage}>
              <SelectTrigger data-testid="select-keyword-language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ar">العربية</SelectItem>
                <SelectItem value="en">الإنجليزية</SelectItem>
                <SelectItem value="fr">الفرنسية</SelectItem>
                <SelectItem value="de">الألمانية</SelectItem>
                <SelectItem value="es">الإسبانية</SelectItem>
                <SelectItem value="ru">الروسية</SelectItem>
                <SelectItem value="zh">الصينية</SelectItem>
                <SelectItem value="tr">التركية</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 w-[150px]">
            <Label htmlFor="category">التصنيف</Label>
            <Select value={newCategory} onValueChange={setNewCategory}>
              <SelectTrigger data-testid="select-keyword-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">عام</SelectItem>
                <SelectItem value="politics">سياسة</SelectItem>
                <SelectItem value="economy">اقتصاد</SelectItem>
                <SelectItem value="sports">رياضة</SelectItem>
                <SelectItem value="culture">ثقافة</SelectItem>
                <SelectItem value="technology">تقنية</SelectItem>
                <SelectItem value="health">صحة</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={addMutation.isPending || !newKeyword.trim()} data-testid="button-add-keyword">
            {addMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Plus className="w-4 h-4 ml-1" />
                إضافة
              </>
            )}
          </Button>
        </form>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : keywords && keywords.length > 0 ? (
          <div className="border rounded-lg divide-y">
            {keywords.map((keyword) => (
              <div 
                key={keyword.id} 
                className="flex items-center justify-between p-3 hover:bg-muted/50"
                data-testid={`keyword-row-${keyword.id}`}
              >
                <div className="flex items-center gap-4">
                  <span className="font-medium">{keyword.keyword}</span>
                  <Badge variant="outline">{getLanguageLabel(keyword.language)}</Badge>
                  <Badge variant="secondary">{getCategoryLabel(keyword.category)}</Badge>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteMutation.mutate(keyword.id)}
                  disabled={deleteMutation.isPending}
                  data-testid={`button-delete-keyword-${keyword.id}`}
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <Tag className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>لا توجد كلمات مفتاحية</p>
            <p className="text-sm mt-1">أضف كلمات مفتاحية لتحديد الأخبار المتعلقة بالسعودية</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
