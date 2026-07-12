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
    <Card className={`transition-all duration-300 ${featured ? "border-primary/30 bg-primary/5" : ""}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center w-10 h-10 rounded-lg shrink-0"
            style={{
              backgroundColor: color ? `${color}20` : "hsl(var(--primary) / 0.1)",
              color: color || "hsl(var(--primary))",
            }}
          >
            <IconComponent className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-base font-semibold truncate">{title}</CardTitle>
            <CardDescription className="text-sm mt-0.5 line-clamp-1">{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => copyToClipboard(rssUrl, "rss")}
            className="flex-1 min-w-[110px]"
            data-testid={`copy-rss-${title}`}
          >
            {copied === "rss" ? (
              <Check className="h-4 w-4 ml-1.5 text-green-500" />
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
              className="flex-1 min-w-[110px]"
              data-testid={`copy-json-${title}`}
            >
              {copied === "json" ? (
                <Check className="h-4 w-4 ml-1.5 text-green-500" />
              ) : (
                <Copy className="h-4 w-4 ml-1.5" />
              )}
              JSON
            </Button>
          )}

          <Button variant="ghost" size="icon" onClick={shareUrl} data-testid={`share-${title}`}>
            <Share2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" asChild data-testid={`open-${title}`}>
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
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-lg" />
          <div className="flex-1">
            <Skeleton className="h-5 w-32 mb-1" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex gap-2">
          <Skeleton className="h-9 flex-1" />
          <Skeleton className="h-9 flex-1" />
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- تبويب التوزيع والانتشار ----------

function DistributionTab() {
  const { toast } = useToast();
  const { data: feedsRaw, isLoading, error } = useQuery<FeedsData>({
    queryKey: ["/api/rss/feeds"],
    staleTime: 10 * 60 * 1000,
  });
  const feeds = feedsRaw ?? null;
  const categories = Array.isArray(feeds?.categories) ? feeds!.categories : [];

  const mainRssUrl = feeds?.main?.rss ?? "";

  const downloadOpml = () => {
    const link = document.createElement("a");
    link.href = "/api/rss/feeds.opml";
    link.download = "sabq-feeds.opml";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: "تم التحميل", description: "تم تحميل ملف OPML بنجاح" });
  };

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-lg border bg-muted/30 p-4">
        <div className="space-y-1">
          <p className="font-medium">رابط الخلاصة الرئيسية (كل الأخبار)</p>
          <code className="text-xs text-muted-foreground break-all" data-testid="main-feed-url">
            {mainRssUrl || "—"}
          </code>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={copyMain} disabled={!mainRssUrl} data-testid="copy-main-feed">
            <Copy className="h-4 w-4 ml-1.5" />
            نسخ الرابط
          </Button>
          <Button size="sm" onClick={downloadOpml} data-testid="download-opml">
            <Download className="h-4 w-4 ml-1.5" />
            تحميل OPML
          </Button>
        </div>
      </div>

      {/* الخلاصات الرئيسية */}
      <section>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Rss className="h-5 w-5 text-primary" />
          الخلاصات الرئيسية
        </h2>
        {isLoading ? (
          <div className="grid md:grid-cols-2 gap-4">
            <FeedCardSkeleton />
            <FeedCardSkeleton />
          </div>
        ) : feeds ? (
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
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">تعذّر تحميل الخلاصات</p>
          </Card>
        )}
      </section>

      {/* خلاصات التصنيفات */}
      <section>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Folder className="h-5 w-5 text-primary" />
          خلاصات التصنيفات
        </h2>
        {isLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <FeedCardSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">حدث خطأ في تحميل خلاصات التصنيفات</p>
          </Card>
        ) : categories.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">لا توجد تصنيفات متاحة</p>
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {categories.map((cat) => (
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
      <section>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Send className="h-5 w-5 text-primary" />
          نشر الخلاصات على المنصات
        </h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {platforms.map((p) => {
            const Icon = p.icon;
            return (
              <Card key={p.name} className="transition-all hover:border-primary/30">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary shrink-0">
                      <Icon className="h-5 w-5" />
                    </div>
                    <CardTitle className="text-base font-semibold">{p.name}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-3">
                  <p className="text-sm text-muted-foreground">{p.desc}</p>
                  <Button variant="outline" size="sm" asChild>
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

function ImportTab() {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [categoryId, setCategoryId] = useState<string>("none");
  const [isActive, setIsActive] = useState(true);

  const { data: sourcesRaw, isLoading } = useQuery<RssImportSource[]>({
    queryKey: ["/api/rss-feeds"],
  });
  const sources = Array.isArray(sourcesRaw) ? sourcesRaw : [];

  const { data: categoriesRaw } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });
  const categories = Array.isArray(categoriesRaw) ? categoriesRaw : [];

  const categoryName = (id: string | null) => {
    if (!id) return "—";
    const c = categories.find((cat) => cat.id === id);
    return c?.nameAr || c?.name || "—";
  };

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
      toast({
        title: "تم الاستيراد",
        description: `تم استيراد ${res?.imported ?? 0} مادة كمسودات`,
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

  return (
    <div className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle className="flex items-center gap-2">
          <Radar className="h-4 w-4" />
          هذا التبويب للسحب من مصادر خارجية
        </AlertTitle>
        <AlertDescription>
          يجلب الأخبار من صحف خارجية ويحفظها كمسودات داخل سبق. لرصد المصادر العالمية بشكل
          أشمل (تقييم القيمة الإخبارية والترجمة التحريرية) استخدم{" "}
          <a href="/dashboard/radar" className="font-medium underline">
            رادار سبق الذكي
          </a>
          .
        </AlertDescription>
      </Alert>

      {/* نموذج الإضافة */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="h-4 w-4" />
            إضافة مصدر RSS
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
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
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nameAr || c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3 pt-7">
              <Switch
                id="rss-active"
                checked={isActive}
                onCheckedChange={setIsActive}
                data-testid="switch-rss-active"
              />
              <Label htmlFor="rss-active">مصدر نشط</Label>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!canSubmit || createMutation.isPending}
              data-testid="button-add-rss"
            >
              <Plus className="h-4 w-4 ml-1.5" />
              {createMutation.isPending ? "جارٍ الإضافة..." : "إضافة المصدر"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* جدول المصادر */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">مصادر الاستيراد</CardTitle>
          <CardDescription>قائمة المصادر المضافة وحالة آخر سحب</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : sources.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              <Rss className="h-10 w-10 mx-auto mb-3 opacity-40" />
              لا توجد مصادر مضافة بعد
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الاسم</TableHead>
                    <TableHead>الرابط</TableHead>
                    <TableHead>التصنيف</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>آخر سحب</TableHead>
                    <TableHead className="text-left">إجراء</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sources.map((s) => (
                    <TableRow key={s.id} data-testid={`rss-row-${s.id}`}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="max-w-[220px] truncate">
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                          dir="ltr"
                        >
                          {s.url}
                        </a>
                      </TableCell>
                      <TableCell>{categoryName(s.categoryId)}</TableCell>
                      <TableCell>
                        {s.isActive ? (
                          <Badge variant="secondary">نشط</Badge>
                        ) : (
                          <Badge variant="outline">متوقف</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {s.lastFetchedAt
                          ? formatDistanceToNow(new Date(s.lastFetchedAt), {
                              addSuffix: true,
                              locale: ar,
                            })
                          : "لم يُسحب بعد"}
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
                            className={`h-4 w-4 ml-1.5 ${
                              importMutation.isPending && importMutation.variables?.id === s.id
                                ? "animate-spin"
                                : ""
                            }`}
                          />
                          استيراد الآن
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- الصفحة الرئيسية ----------

export default function RssFeedsManager() {
  const { user, isLoading } = useAuth();
  const allowed = useMemo(
    () =>
      (user?.permissions?.includes("*") ?? false) ||
      hasRole(user, "admin", "system_admin", "superadmin", "super_admin"),
    [user],
  );

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="p-6 space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </DashboardLayout>
    );
  }

  if (!allowed) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <Card className="max-w-lg mx-auto text-center p-8">
            <CardTitle className="mb-2">غير مصرّح</CardTitle>
            <CardDescription>هذه الصفحة متاحة لمدراء النظام فقط.</CardDescription>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1600px] space-y-6 px-4 pb-10 sm:px-6" dir="rtl">
        <DashboardPageHeader
          icon={Rss}
          title="إدارة RSS"
          description="توزيع خلاصات سبق لزيادة الانتشار، واستيراد المحتوى من المصادر الخارجية"
        />

        <Tabs defaultValue="distribution" className="w-full">
          <TabsList className="h-auto w-full justify-start overflow-x-auto sm:w-auto">
            <TabsTrigger value="distribution" data-testid="tab-distribution">
              <Send className="h-4 w-4 ml-1.5" />
              التوزيع والانتشار
            </TabsTrigger>
            <TabsTrigger value="import" data-testid="tab-import">
              <Download className="h-4 w-4 ml-1.5" />
              الاستيراد من مصادر خارجية
            </TabsTrigger>
          </TabsList>
          <TabsContent value="distribution" className="mt-6">
            <DistributionTab />
          </TabsContent>
          <TabsContent value="import" className="mt-6">
            <ImportTab />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
