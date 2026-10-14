/**
 * إدارة RSS في لوحة التحكم — تبويبان:
 *  - التوزيع والانتشار (Outbound): عرض خلاصات سبق الجاهزة + روابط النسخ/المشاركة
 *    + تحميل OPML + إرشادات تقديم الخلاصات لمنصات النشر.
 *  - الاستيراد من مصادر خارجية (Inbound): إدارة مصادر RSS وسحب موادها كمسودات.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { useAuth, hasRole } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Rss,
  Copy,
  Check,
  Download,
  Share2,
  ExternalLink,
  Newspaper,
  Headphones,
  Folder,
  Plus,
  RefreshCw,
  Radar,
  Info,
  Globe,
  Send,
  Search,
  X,
  CheckCircle2,
  PauseCircle,
  Clock,
  Filter,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

// ---------- أنواع استجابات الـ API ----------

interface CategoryFeed {
  id: string;
  title: string;
  titleEn: string;
  description: string;
  slug: string;
  rss: string;
  icon: string;
  color: string | null;
}

interface FeedsData {
  main: { title: string; description: string; rss: string; json: string; icon: string };
  audio: { title: string; description: string; rss: string; json: string; icon: string };
  categories: CategoryFeed[];
}

interface RssImportSource {
  id: string;
  name: string;
  url: string;
  categoryId: string | null;
  isActive: boolean;
  lastFetchedAt: string | null;
  createdAt: string;
}

interface Category {
  id: string;
  name?: string;
  nameAr?: string;
  slug?: string;
}

const iconMap: Record<string, any> = {
  newspaper: Newspaper,
  headphones: Headphones,
  folder: Folder,
};

function formatRelativeDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "لم يُسحب بعد";
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return "لم يُسحب بعد";
  return formatDistanceToNow(parsed, { addSuffix: true, locale: ar });
}

// ---------- بطاقة خلاصة (تبويب التوزيع) ----------

function FeedCard({
  title,
  description,
  rssUrl,
  jsonUrl,
  icon,
  color,
  featured = false,
}: {
  title: string;
  description: string;
  rssUrl: string;
  jsonUrl?: string;
  icon: string;
  color?: string | null;
  featured?: boolean;
}) {
  const [copied, setCopied] = useState<"rss" | "json" | null>(null);
  const { toast } = useToast();
  const IconComponent = iconMap[icon] || Folder;

  const copyToClipboard = async (url: string, type: "rss" | "json") => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(type);
      toast({ title: "تم النسخ", description: "تم نسخ رابط الخلاصة إلى الحافظة" });
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast({
        title: "فشل النسخ",
        description: "لم نتمكن من نسخ الرابط",
        variant: "destructive",
      });
    }
  };

  const shareUrl = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: `${title} - RSS Feed`, text: description, url: rssUrl });
      } catch {
        /* المستخدم ألغى المشاركة */
      }
    } else {
      copyToClipboard(rssUrl, "rss");
    }
  };

  return (
    <Card
      className={`border-border/70 shadow-xs transition-all duration-200 hover:border-primary/30 ${
        featured ? "border-primary/30 bg-primary/[0.03]" : ""
      }`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0"
              style={{
                backgroundColor: color ? `${color}20` : "hsl(var(--primary) / 0.1)",
                color: color || "hsl(var(--primary))",
              }}
            >
              <IconComponent className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base font-semibold truncate">{title}</CardTitle>
                {featured && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                    رئيسية
                  </Badge>
                )}
              </div>
              <CardDescription className="text-xs sm:text-sm mt-0.5 line-clamp-1">
                {description}
              </CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <div className="rounded-lg border border-border/60 bg-muted/30 px-2.5 py-1.5">
          <code className="block truncate text-[11px] text-muted-foreground" dir="ltr">
            {rssUrl}
          </code>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => copyToClipboard(rssUrl, "rss")}
            className="flex-1 min-w-[110px]"
            data-testid={`copy-rss-${title}`}
          >
            {copied === "rss" ? (
              <Check className="h-4 w-4 ml-1.5 text-emerald-500" />
            ) : (
              <Copy className="h-4 w-4 ml-1.5" />
            )}
            نسخ RSS
          </Button>

          {jsonUrl && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copyToClipboard(jsonUrl, "json")}
              className="flex-1 min-w-[90px] border border-border/50"
              data-testid={`copy-json-${title}`}
            >
              {copied === "json" ? (
                <Check className="h-4 w-4 ml-1.5 text-emerald-500" />
              ) : (
                <Copy className="h-4 w-4 ml-1.5" />
              )}
              JSON
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={shareUrl}
            data-testid={`share-${title}`}
            title="مشاركة الخلاصة"
          >
            <Share2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            asChild
            data-testid={`open-${title}`}
            title="فتح الخلاصة في تبويب جديد"
          >
            <a href={rssUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function FeedCardSkeleton() {
  return (
    <Card className="border-border/70">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-xl" />
          <div className="flex-1">
            <Skeleton className="h-5 w-32 mb-1" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-2.5">
        <Skeleton className="h-7 w-full rounded-lg" />
        <div className="flex gap-2">
          <Skeleton className="h-9 flex-1" />
          <Skeleton className="h-9 flex-1" />
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- تبويب التوزيع والانتشار ----------

function DistributionTab({
  feeds,
  isLoading,
  error,
  onDownloadOpml,
}: {
  feeds: FeedsData | null;
  isLoading: boolean;
  error: unknown;
  onDownloadOpml: () => void;
}) {
  const { toast } = useToast();
  const [categorySearch, setCategorySearch] = useState("");
  const categories = Array.isArray(feeds?.categories) ? feeds!.categories : [];

  const filteredCategoryFeeds = useMemo(() => {
    const q = categorySearch.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter(
      (cat) =>
        (cat.title && cat.title.toLowerCase().includes(q)) ||
        (cat.titleEn && cat.titleEn.toLowerCase().includes(q)) ||
        (cat.slug && cat.slug.toLowerCase().includes(q)) ||
        (cat.description && cat.description.toLowerCase().includes(q)),
    );
  }, [categories, categorySearch]);

  const mainRssUrl = feeds?.main?.rss ?? "";

  const copyMain = async () => {
    if (!mainRssUrl) return;
    try {
      await navigator.clipboard.writeText(mainRssUrl);
      toast({ title: "تم النسخ", description: "تم نسخ رابط الخلاصة الرئيسية" });
    } catch {
      toast({ title: "فشل النسخ", variant: "destructive" });
    }
  };

  const platforms = [
    {
      name: "Google News Publisher Center",
      desc: "أدرج خلاصة الأخبار الرئيسية لتظهر مواد سبق في Google News.",
      href: "https://publishercenter.google.com/",
      icon: Newspaper,
    },
    {
      name: "Feedly",
      desc: "أشهر قارئ RSS — أضف الخلاصة ليتابعها القرّاء مباشرة.",
      href: "https://feedly.com/",
      icon: Rss,
    },
    {
      name: "Inoreader",
      desc: "قارئ RSS متقدم بخيارات تنبيه ومشاركة.",
      href: "https://www.inoreader.com/",
      icon: Globe,
    },
    {
      name: "Apple Podcasts Connect",
      desc: "قدّم خلاصة النشرات الصوتية (/api/rss/audio-newsletters) كبودكاست.",
      href: "https://podcastsconnect.apple.com/",
      icon: Headphones,
    },
  ];

  return (
    <div className="space-y-8">
      {/* شريط إجراءات سريع */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-border/70 bg-card p-4 sm:p-5 shadow-xs">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <p className="font-semibold text-sm sm:text-base">رابط الخلاصة الرئيسية (كل الأخبار)</p>
          </div>
          <code
            className="block text-xs text-muted-foreground break-all font-mono"
            dir="ltr"
            data-testid="main-feed-url"
          >
            {mainRssUrl || "—"}
          </code>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={copyMain}
            disabled={!mainRssUrl}
            data-testid="copy-main-feed"
          >
            <Copy className="h-4 w-4 ml-1.5" />
            نسخ الرابط
          </Button>
          <Button size="sm" onClick={onDownloadOpml} data-testid="download-opml">
            <Download className="h-4 w-4 ml-1.5" />
            تحميل OPML
          </Button>
        </div>
      </div>

      {/* الخلاصات الرئيسية */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Rss className="h-5 w-5 text-primary" />
            الخلاصات الرئيسية
          </h2>
          <Badge variant="outline" className="text-xs tabular-nums">
            RSS 2.0 + JSON Feed
          </Badge>
        </div>
        {isLoading ? (
          <div className="grid md:grid-cols-2 gap-4">
            <FeedCardSkeleton />
            <FeedCardSkeleton />
          </div>
        ) : feeds?.main && feeds?.audio ? (
          <div className="grid md:grid-cols-2 gap-4">
            <FeedCard
              title={feeds.main.title}
              description={feeds.main.description}
              rssUrl={feeds.main.rss}
              jsonUrl={feeds.main.json}
              icon={feeds.main.icon}
              featured
            />
            <FeedCard
              title={feeds.audio.title}
              description={feeds.audio.description}
              rssUrl={feeds.audio.rss}
              jsonUrl={feeds.audio.json}
              icon={feeds.audio.icon}
              featured
            />
          </div>
        ) : (
          <Card className="p-8 text-center border-border/70">
            <p className="text-muted-foreground">تعذّر تحميل الخلاصات</p>
          </Card>
        )}
      </section>

      {/* خلاصات التصنيفات */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Folder className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold">خلاصات التصنيفات</h2>
            <Badge variant="secondary" className="text-xs tabular-nums">
              {filteredCategoryFeeds.length} / {categories.length}
            </Badge>
          </div>
          {categories.length > 0 && (
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="ابحث في خلاصات التصنيفات..."
                value={categorySearch}
                onChange={(e) => setCategorySearch(e.target.value)}
                className="pr-9 pl-8 h-9 text-sm"
                data-testid="input-search-category-feeds"
              />
              {categorySearch && (
                <button
                  type="button"
                  onClick={() => setCategorySearch("")}
                  className="no-min-touch-size absolute left-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="مسح البحث"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <FeedCardSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <Card className="p-8 text-center border-border/70">
            <p className="text-muted-foreground">حدث خطأ في تحميل خلاصات التصنيفات</p>
          </Card>
        ) : filteredCategoryFeeds.length === 0 ? (
          <Card className="p-8 text-center border-border/70">
            <p className="text-muted-foreground">
              {categorySearch ? "لا توجد خلاصات تصنيفات مطابقة للبحث" : "لا توجد تصنيفات متاحة"}
            </p>
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCategoryFeeds.map((cat) => (
              <FeedCard
                key={cat.id}
                title={cat.title}
                description={cat.description}
                rssUrl={cat.rss}
                icon={cat.icon}
                color={cat.color}
              />
            ))}
          </div>
        )}
      </section>

      {/* تقديم الخلاصات للمنصات */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Send className="h-5 w-5 text-primary" />
          نشر الخلاصات على المنصات العالمية
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {platforms.map((p) => {
            const Icon = p.icon;
            return (
              <Card key={p.name} className="border-border/70 shadow-xs transition-all hover:border-primary/30">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary shrink-0">
                      <Icon className="h-5 w-5" />
                    </div>
                    <CardTitle className="text-sm sm:text-base font-semibold leading-snug">
                      {p.name}
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-3">
                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">{p.desc}</p>
                  <Button variant="outline" size="sm" className="w-full" asChild>
                    <a href={p.href} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 ml-1.5" />
                      فتح المنصة
                    </a>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}

// ---------- تبويب الاستيراد من مصادر خارجية ----------

function ImportTab({
  sources,
  categories,
  isLoading,
  onImportedCount,
}: {
  sources: RssImportSource[];
  categories: Category[];
  isLoading: boolean;
  onImportedCount: (count: number) => void;
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const canOpenRadar = hasRole(user, "system_admin", "system.admin", "superadmin", "super_admin");

  // Form state
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [categoryId, setCategoryId] = useState<string>("none");
  const [isActive, setIsActive] = useState(true);

  // Filter & Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const safeSources = Array.isArray(sources) ? sources : [];
  const safeCategories = Array.isArray(categories) ? categories : [];

  const categoryName = (id: string | null) => {
    if (!id) return "—";
    const c = safeCategories.find((cat) => cat.id === id);
    return c?.nameAr || c?.name || "—";
  };

  const activeCount = useMemo(
    () => safeSources.filter((s) => Boolean(s.isActive)).length,
    [safeSources],
  );
  const inactiveCount = safeSources.length - activeCount;

  const filteredSources = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return safeSources.filter((s) => {
      const catLabel = categoryName(s.categoryId).toLowerCase();
      const matchesSearch =
        !q ||
        (s.name && s.name.toLowerCase().includes(q)) ||
        (s.url && s.url.toLowerCase().includes(q)) ||
        catLabel.includes(q);

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && Boolean(s.isActive)) ||
        (statusFilter === "inactive" && !s.isActive);

      const matchesCategory =
        categoryFilter === "all" ||
        (categoryFilter === "unassigned" && !s.categoryId) ||
        s.categoryId === categoryFilter;

      return matchesSearch && matchesStatus && matchesCategory;
    });
  }, [safeSources, searchQuery, statusFilter, categoryFilter, safeCategories]);

  const createMutation = useMutation({
    mutationFn: async () =>
      apiRequest<RssImportSource>("/api/rss-feeds", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          url: url.trim(),
          categoryId: categoryId === "none" ? null : categoryId,
          isActive,
        }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => {
      toast({ title: "تمت الإضافة", description: "تمت إضافة المصدر بنجاح" });
      setName("");
      setUrl("");
      setCategoryId("none");
      setIsActive(true);
      queryClient.invalidateQueries({ queryKey: ["/api/rss-feeds"] });
    },
    onError: (e: any) => {
      toast({
        title: "فشل الإضافة",
        description: e?.message || "تعذّر إضافة المصدر",
        variant: "destructive",
      });
    },
  });

  const importMutation = useMutation({
    mutationFn: async (source: RssImportSource) =>
      apiRequest<{ imported: number }>(`/api/rss-feeds/${source.id}/import`, {
        method: "POST",
        body: JSON.stringify({ categoryId: source.categoryId ?? undefined }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: (res) => {
      const imported = Number(res?.imported ?? 0);
      if (imported > 0) {
        onImportedCount(imported);
      }
      toast({
        title: "تم الاستيراد",
        description: `تم استيراد ${imported} مادة كمسودات`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/rss-feeds"] });
    },
    onError: (e: any) => {
      toast({
        title: "فشل الاستيراد",
        description: e?.message || "تعذّر الاستيراد من المصدر",
        variant: "destructive",
      });
    },
  });

  const canSubmit = name.trim().length > 0 && url.trim().length > 0;
  const hasActiveFilters =
    searchQuery.trim().length > 0 || statusFilter !== "all" || categoryFilter !== "all";

  return (
    <div className="space-y-6">
      <Alert className="rounded-2xl border-border/70 bg-card shadow-xs">
        <Info className="h-4 w-4 text-primary" />
        <AlertTitle className="flex items-center gap-2 font-semibold">
          <Radar className="h-4 w-4 text-primary" />
          هذا التبويب للسحب المباشر من مصادر RSS الخارجية
        </AlertTitle>
        <AlertDescription className="text-muted-foreground mt-1">
          يجلب الأخبار من وكالات الأنباء والصحف الخارجية ويحفظها كمسودات للمراجعة التحريرية داخل سبق.
          {canOpenRadar ? (
            <>
              {" "}
              لرصد المصادر العالمية بشكل أشمل استخدم{" "}
              <a href="/dashboard/radar" className="font-semibold text-primary underline">
                رادار سبق الذكي
              </a>
              .
            </>
          ) : null}
        </AlertDescription>
      </Alert>

      {/* نموذج الإضافة */}
      <Card className="border-border/70 shadow-xs">
        <CardHeader className="border-b border-border/50 pb-4">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Plus className="h-4 w-4" />
            </span>
            إضافة مصدر RSS جديد
          </CardTitle>
          <CardDescription>
            أضف رابط خلاصة XML أو Atom مع تحديد التصنيف الافتراضي للمواد المستوردة
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="rss-name">اسم المصدر</Label>
              <Input
                id="rss-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: وكالة الأنباء"
                data-testid="input-rss-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rss-url">رابط الخلاصة (URL)</Label>
              <Input
                id="rss-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/rss.xml"
                dir="ltr"
                data-testid="input-rss-url"
              />
            </div>
            <div className="space-y-2">
              <Label>التصنيف الافتراضي (اختياري)</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger data-testid="select-rss-category">
                  <SelectValue placeholder="بدون تصنيف" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون تصنيف</SelectItem>
                  {safeCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nameAr || c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col justify-between gap-3 sm:pt-7">
              <div className="flex items-center justify-between sm:justify-start gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                <Label htmlFor="rss-active" className="cursor-pointer text-sm">
                  مصدر نشط فور الإضافة
                </Label>
                <Switch
                  id="rss-active"
                  checked={isActive}
                  onCheckedChange={setIsActive}
                  data-testid="switch-rss-active"
                />
              </div>
            </div>
          </div>
          <div className="mt-4 flex justify-end border-t border-border/50 pt-4">
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!canSubmit || createMutation.isPending}
              className="w-full sm:w-auto"
              data-testid="button-add-rss"
            >
              <Plus className="h-4 w-4 ml-1.5" />
              {createMutation.isPending ? "جارٍ الإضافة..." : "إضافة المصدر"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* شريط البحث والفلترة + قائمة المصادر */}
      <Card className="border-border/70 shadow-xs">
        <CardHeader className="border-b border-border/50 pb-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                مصادر الاستيراد
                <Badge variant="secondary" className="tabular-nums text-xs">
                  {filteredSources.length} / {safeSources.length}
                </Badge>
              </CardTitle>
              <CardDescription className="mt-0.5">
                قائمة المصادر المضافة وحالة التفعيل وتوقيت آخر عملية سحب
              </CardDescription>
            </div>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("all");
                  setCategoryFilter("all");
                }}
                className="self-start sm:self-auto text-xs text-muted-foreground"
                data-testid="button-reset-filters"
              >
                <X className="h-3.5 w-3.5 ml-1" />
                إعادة ضبط الفلاتر
              </Button>
            )}
          </div>

          {/* Search + Category Select + Quick Status Filter Pills */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-1">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1">
              {/* Search Input */}
              <div className="relative flex-1 max-w-full sm:max-w-sm">
                <Search className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="ابحث باسم المصدر، الرابط، أو التصنيف..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pr-9 pl-8 h-9 text-sm"
                  data-testid="input-search-sources"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="no-min-touch-size absolute left-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="مسح البحث"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Category Filter Select */}
              <div className="w-full sm:w-52">
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="h-9 text-xs sm:text-sm" data-testid="filter-category-select">
                    <Filter className="h-3.5 w-3.5 ml-1.5 text-muted-foreground shrink-0" />
                    <SelectValue placeholder="كل التصنيفات" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل التصنيفات</SelectItem>
                    <SelectItem value="unassigned">بدون تصنيف</SelectItem>
                    {safeCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nameAr || c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Quick Status Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="فلترة حسب الحالة">
              <span className="text-xs font-medium text-muted-foreground ml-1">الحالة:</span>
              {(
                [
                  { id: "all", label: "الكل", count: safeSources.length },
                  { id: "active", label: "نشط", count: activeCount },
                  { id: "inactive", label: "متوقف", count: inactiveCount },
                ] as const
              ).map((pill) => (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setStatusFilter(pill.id)}
                  data-testid={`filter-status-${pill.id}`}
                  className={`no-min-touch-size inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    statusFilter === pill.id
                      ? "bg-primary text-primary-foreground shadow-2xs"
                      : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <span>{pill.label}</span>
                  <span className="tabular-nums opacity-80">({pill.count})</span>
                </button>
              ))}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-6">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-xl" />
              ))}
            </div>
          ) : filteredSources.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground space-y-2">
              <Rss className="h-10 w-10 mx-auto opacity-35" />
              <p className="font-medium text-foreground">
                {safeSources.length === 0
                  ? "لا توجد مصادر استيراد مضافة بعد"
                  : "لا توجد مصادر مطابقة لمعايير البحث أو الفلترة"}
              </p>
              <p className="text-xs">
                {safeSources.length === 0
                  ? "ابدأ بإضافة أول مصدر RSS من النموذج أعلاه."
                  : "جرّب تغيير حالة الفلتر أو البحث بكلمة أخرى."}
              </p>
            </div>
          ) : (
            <>
              {/* Desktop Table (hidden md:block) */}
              <div className="hidden md:block overflow-x-auto rounded-xl border border-border/60">
                <Table dir="rtl">
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="text-right">الاسم</TableHead>
                      <TableHead className="text-right">الرابط</TableHead>
                      <TableHead className="text-right">التصنيف</TableHead>
                      <TableHead className="text-right">الحالة</TableHead>
                      <TableHead className="text-right">آخر سحب</TableHead>
                      <TableHead className="text-left">إجراء</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSources.map((s) => {
                      const isImportingThis =
                        importMutation.isPending && importMutation.variables?.id === s.id;
                      return (
                        <TableRow key={s.id} data-testid={`rss-row-${s.id}`}>
                          <TableCell className="font-semibold text-foreground">
                            <div className="flex items-center gap-2.5">
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                <Rss className="h-4 w-4" />
                              </span>
                              <span>{s.name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[260px] truncate">
                            <a
                              href={s.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-mono text-primary hover:underline max-w-full truncate"
                              dir="ltr"
                            >
                              <span className="truncate">{s.url}</span>
                              <ExternalLink className="h-3 w-3 shrink-0" />
                            </a>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-normal text-xs">
                              {categoryName(s.categoryId)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {s.isActive ? (
                              <Badge
                                variant="secondary"
                                className="border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 gap-1"
                              >
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                نشط
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground gap-1">
                                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
                                متوقف
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs sm:text-sm tabular-nums">
                            {formatRelativeDate(s.lastFetchedAt)}
                          </TableCell>
                          <TableCell className="text-left">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!s.isActive || importMutation.isPending}
                              onClick={() => importMutation.mutate(s)}
                              data-testid={`button-import-${s.id}`}
                            >
                              <RefreshCw
                                className={`h-4 w-4 ml-1.5 ${isImportingThis ? "animate-spin" : ""}`}
                              />
                              استيراد الآن
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Cards (md:hidden) */}
              <div className="md:hidden space-y-3" data-testid="rss-mobile-cards-list">
                {filteredSources.map((s) => {
                  const isImportingThis =
                    importMutation.isPending && importMutation.variables?.id === s.id;
                  return (
                    <div
                      key={s.id}
                      data-testid={`rss-row-mobile-${s.id}`}
                      className="rounded-xl border border-border/70 bg-background p-4 space-y-3 shadow-2xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <Rss className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <p className="font-semibold text-sm text-foreground truncate">
                              {s.name}
                            </p>
                            <Badge variant="outline" className="mt-1 text-[11px] font-normal">
                              {categoryName(s.categoryId)}
                            </Badge>
                          </div>
                        </div>
                        {s.isActive ? (
                          <Badge
                            variant="secondary"
                            className="shrink-0 border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 gap-1 text-xs"
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            نشط
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="shrink-0 text-muted-foreground gap-1 text-xs">
                            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
                            متوقف
                          </Badge>
                        )}
                      </div>

                      <div className="rounded-lg border border-border/50 bg-muted/30 px-2.5 py-1.5">
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between gap-1.5 text-xs font-mono text-primary hover:underline"
                          dir="ltr"
                        >
                          <span className="truncate">{s.url}</span>
                          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                        </a>
                      </div>

                      <div className="flex items-center justify-between gap-2 border-t border-border/50 pt-2.5">
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" />
                          <span>{formatRelativeDate(s.lastFetchedAt)}</span>
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!s.isActive || importMutation.isPending}
                          onClick={() => importMutation.mutate(s)}
                          data-testid={`button-import-mobile-${s.id}`}
                        >
                          <RefreshCw
                            className={`h-3.5 w-3.5 ml-1.5 ${isImportingThis ? "animate-spin" : ""}`}
                          />
                          استيراد الآن
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- الصفحة الرئيسية ----------

export default function RssFeedsManager() {
  const { user, isLoading } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("distribution");
  const [sessionImportedCount, setSessionImportedCount] = useState(0);

  const allowed = useMemo(
    () =>
      (user?.permissions?.includes("*") ?? false) ||
      hasRole(user, "admin", "system_admin", "superadmin", "super_admin"),
    [user],
  );

  // Shared top-level queries so KPI summary strip is always live
  const {
    data: feedsRaw,
    isLoading: feedsLoading,
    error: feedsError,
    isFetching: feedsFetching,
  } = useQuery<FeedsData>({
    queryKey: ["/api/rss/feeds"],
    staleTime: 10 * 60 * 1000,
    enabled: allowed,
  });
  const feeds = feedsRaw ?? null;
  const outboundCategories = Array.isArray(feeds?.categories) ? feeds!.categories : [];

  const {
    data: sourcesRaw,
    isLoading: sourcesLoading,
    isFetching: sourcesFetching,
  } = useQuery<RssImportSource[]>({
    queryKey: ["/api/rss-feeds"],
    enabled: allowed,
  });
  const sources = Array.isArray(sourcesRaw) ? sourcesRaw : [];

  const { data: categoriesRaw } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
    enabled: allowed,
  });
  const categories = Array.isArray(categoriesRaw) ? categoriesRaw : [];

  // KPI computations
  const kpiStats = useMemo(() => {
    const totalSources = sources.length;
    const activeSources = sources.filter((s) => Boolean(s.isActive)).length;
    const inactiveSources = totalSources - activeSources;
    const syncedSources = sources.filter((s) => Boolean(s.lastFetchedAt)).length;
    const neverFetchedSources = totalSources - syncedSources;
    const outboundFeedsCount =
      (feeds?.main ? 1 : 0) + (feeds?.audio ? 1 : 0) + outboundCategories.length;

    const latestFetchedAt = sources.reduce<string | null>((latest, s) => {
      if (!s.lastFetchedAt) return latest;
      if (!latest) return s.lastFetchedAt;
      return new Date(s.lastFetchedAt) > new Date(latest) ? s.lastFetchedAt : latest;
    }, null);

    return {
      totalSources,
      activeSources,
      inactiveSources,
      syncedSources,
      neverFetchedSources,
      outboundFeedsCount,
      latestFetchedAt,
    };
  }, [sources, feeds, outboundCategories]);

  const handleRefreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/rss/feeds"] });
    queryClient.invalidateQueries({ queryKey: ["/api/rss-feeds"] });
    toast({ title: "تم التحديث", description: "جاري تحديث بيانات الخلاصات والمصادر" });
  };

  const handleDownloadOpml = () => {
    const link = document.createElement("a");
    link.href = "/api/rss/feeds.opml";
    link.download = "sabq-feeds.opml";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: "تم التحميل", description: "تم تحميل ملف OPML بنجاح" });
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-[1600px] p-4 sm:p-6 space-y-6" dir="rtl">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-28 w-full rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </DashboardLayout>
    );
  }

  if (!allowed) {
    return (
      <DashboardLayout>
        <div className="p-6" dir="rtl">
          <Card className="max-w-lg mx-auto text-center p-8">
            <CardTitle className="mb-2">غير مصرّح</CardTitle>
            <CardDescription>هذه الصفحة متاحة لمدراء النظام فقط.</CardDescription>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const isRefreshing = feedsFetching || sourcesFetching;

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1600px] space-y-6 px-4 pb-10 sm:px-6" dir="rtl">
        <DashboardPageHeader
          icon={Rss}
          title="إدارة RSS"
          titleTestId="page-title-rss"
          description="توزيع خلاصات سبق لزيادة الانتشار، واستيراد المحتوى من المصادر الخارجية"
          actions={
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefreshAll}
                disabled={isRefreshing}
                data-testid="button-refresh-rss"
              >
                <RefreshCw className={`h-4 w-4 ml-1.5 ${isRefreshing ? "animate-spin" : ""}`} />
                تحديث
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadOpml}
                data-testid="button-header-opml"
              >
                <Download className="h-4 w-4 ml-1.5" />
                ملف OPML
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setActiveTab("import");
                  setTimeout(() => {
                    document.getElementById("rss-name")?.focus();
                  }, 100);
                }}
                data-testid="button-header-add-source"
              >
                <Plus className="h-4 w-4 ml-1.5" />
                إضافة مصدر خارجي
              </Button>
            </>
          }
        />

        {/* 4-Card KPI Summary Strip */}
        <div
          className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
          data-testid="kpi-strip-rss-feeds"
        >
          {/* 1. إجمالي المصادر */}
          <Card className="border-border/70 shadow-xs" data-testid="kpi-total-sources">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">
                    إجمالي المصادر
                  </p>
                  <p className="text-2xl sm:text-3xl font-bold tracking-tight tabular-nums">
                    {kpiStats.totalSources}
                  </p>
                </div>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Rss className="h-4 w-4 sm:h-5 sm:w-5" />
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <Badge variant="secondary" className="text-[11px] font-normal px-2 py-0 tabular-nums">
                  {kpiStats.outboundFeedsCount} خلاصة توزيع
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* 2. المصادر النشطة */}
          <Card className="border-border/70 shadow-xs" data-testid="kpi-active-sources">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">
                    المصادر النشطة
                  </p>
                  <p className="text-2xl sm:text-3xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {kpiStats.activeSources}
                  </p>
                </div>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5" />
                </span>
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                  ● جاهزة للسحب الفوري
                </span>
              </div>
            </CardContent>
          </Card>

          {/* 3. المصادر المتوقفة / بانتظار السحب */}
          <Card className="border-border/70 shadow-xs" data-testid="kpi-inactive-sources">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">
                    المصادر المتوقفة
                  </p>
                  <p className="text-2xl sm:text-3xl font-bold tracking-tight text-amber-600 dark:text-amber-400 tabular-nums">
                    {kpiStats.inactiveSources}
                  </p>
                </div>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <PauseCircle className="h-4 w-4 sm:h-5 sm:w-5" />
                </span>
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>{kpiStats.neverFetchedSources} مصدر لم يُسحب بعد</span>
              </div>
            </CardContent>
          </Card>

          {/* 4. المصادر المتزامنة / المستوردة */}
          <Card className="border-border/70 shadow-xs" data-testid="kpi-synced-sources">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">
                    المصادر المتزامنة
                  </p>
                  <div className="flex items-baseline gap-1.5">
                    <p className="text-2xl sm:text-3xl font-bold tracking-tight text-sky-600 dark:text-sky-400 tabular-nums">
                      {kpiStats.syncedSources}
                    </p>
                    {sessionImportedCount > 0 && (
                      <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                        (+{sessionImportedCount} خبر)
                      </span>
                    )}
                  </div>
                </div>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
                  <RefreshCw className="h-4 w-4 sm:h-5 sm:w-5" />
                </span>
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground truncate">
                <Clock className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {kpiStats.latestFetchedAt
                    ? `آخر سحب ${formatRelativeDate(kpiStats.latestFetchedAt)}`
                    : "لم يُسجل سحب سابق"}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full" dir="rtl">
          <TabsList className="h-auto w-full justify-start overflow-x-auto sm:w-auto p-1 bg-muted/60">
            <TabsTrigger value="distribution" data-testid="tab-distribution" className="gap-1.5">
              <Send className="h-4 w-4 ml-1" />
              <span>التوزيع والانتشار</span>
              <Badge variant="secondary" className="mr-1 h-5 px-1.5 text-[11px] tabular-nums">
                {kpiStats.outboundFeedsCount}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="import" data-testid="tab-import" className="gap-1.5">
              <Download className="h-4 w-4 ml-1" />
              <span>الاستيراد من مصادر خارجية</span>
              <Badge variant="secondary" className="mr-1 h-5 px-1.5 text-[11px] tabular-nums">
                {kpiStats.totalSources}
              </Badge>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="distribution" className="mt-6">
            <DistributionTab
              feeds={feeds}
              isLoading={feedsLoading}
              error={feedsError}
              onDownloadOpml={handleDownloadOpml}
            />
          </TabsContent>
          <TabsContent value="import" className="mt-6">
            <ImportTab
              sources={sources}
              categories={categories}
              isLoading={sourcesLoading}
              onImportedCount={(count) => setSessionImportedCount((prev) => prev + count)}
            />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
