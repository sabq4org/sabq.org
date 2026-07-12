/**
 * أخبار واس (SPA News) في لوحة التحكم — استعراض واستيراد.
 *
 * يتصفّح المحرّر مواد وكالة الأنباء السعودية حسب القسم/الخلاصة (عربي/إنجليزي)
 * عبر خدمة واس، يعاين العناوين والملخّصات، ويستورد المختار كمسودّات في سبق
 * (وجهة القسم يختارها المحرّر). كل شيء عبر /api/admin/spa-news/* (لوحة فقط).
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Newspaper,
  RefreshCw,
  Download,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Globe,
  ImageOff,
} from "lucide-react";
import type { Category } from "@shared/schema";

type SpaLang = "ar" | "en";

interface SpaArticle {
  id: string;
  title: string;
  summary: string | null;
  image: string | null;
  publishedAt: string | null;
  url: string | null;
  source: string;
}

interface SpaSection {
  slug: string;
  name: string;
  kind: "category" | "feed";
}

interface SpaStatus {
  configured: boolean;
  connected: boolean;
  baseUrl: string;
  sectionsCount: number;
  error?: string;
}

interface SpaNewsResponse {
  section: { slug: string; name: string } | null;
  articles: SpaArticle[];
  pagination: { page: number; perPage: number; hasMore: boolean };
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Math.max(0, Date.now() - then);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "الآن";
  if (min < 60) return `قبل ${min} د`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `قبل ${hr} س`;
  const days = Math.floor(hr / 24);
  return `قبل ${days} ي`;
}

export default function SpaNewsImporter() {
  const { toast } = useToast();
  const [lang, setLang] = useState<SpaLang>("ar");
  const [slug, setSlug] = useState<string>("important");
  const [categoryId, setCategoryId] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // حالة الخدمة
  const { data: status } = useQuery<SpaStatus>({
    queryKey: ["/api/admin/spa-news/status"],
  });

  // الأقسام + الخلاصات
  const { data: sectionsData } = useQuery<{ sections: SpaSection[] }>({
    queryKey: ["/api/admin/spa-news/sections", { lang }],
  });
  const sections = Array.isArray(sectionsData?.sections) ? sectionsData!.sections : [];
  const categorySections = sections.filter((s) => s.kind === "category");
  const feedSections = sections.filter((s) => s.kind === "feed");

  // أقسام سبق (وجهة الاستيراد)
  const { data: categoriesRaw } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });
  const sabqCategories = Array.isArray(categoriesRaw) ? categoriesRaw : [];

  // مواد القسم/الخلاصة الحالية
  const {
    data: news,
    isLoading,
    isFetching,
    refetch,
  } = useQuery<SpaNewsResponse>({
    queryKey: ["/api/admin/spa-news/news", { lang, slug, per_page: 30 }],
  });
  const articles = useMemo(
    () => (Array.isArray(news?.articles) ? news!.articles : []),
    [news]
  );

  const allSelected = articles.length > 0 && selected.size === articles.length;
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(articles.map((a) => a.id)));
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const importMutation = useMutation({
    mutationFn: async () =>
      apiRequest<{ imported: number; skipped: number }>(
        "/api/admin/spa-news/import",
        {
          method: "POST",
          body: JSON.stringify({
            lang,
            sourceSlug: slug,
            categoryId,
            articleIds: Array.from(selected),
          }),
          headers: { "Content-Type": "application/json" },
        }
      ),
    onSuccess: (res) => {
      toast({
        title: "تم الاستيراد",
        description: `أُضيفت ${res?.imported ?? 0} مادة كمسودّات${
          res?.skipped ? ` · تُخطّيت ${res.skipped} مكرّرة` : ""
        }`,
      });
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ["/api/articles"] });
    },
    onError: (e: any) => {
      toast({
        title: "فشل الاستيراد",
        description: e?.message || "تعذّر استيراد المواد",
        variant: "destructive",
      });
    },
  });

  const canImport = selected.size > 0 && categoryId.length > 0 && !importMutation.isPending;

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1600px] space-y-6 px-4 pb-10 sm:px-6" dir="rtl">
        <DashboardPageHeader
          icon={Newspaper}
          title="أخبار واس (SPA)"
          description="استعرض مواد وكالة الأنباء السعودية واستوردها كمسودّات في سبق"
          actions={status ? (
            status.connected ? (
              <Badge variant="outline" className="gap-1 border-emerald-300 text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" /> متصل · {status.sectionsCount} قسم
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive">
                <XCircle className="h-3.5 w-3.5" />
                {status.configured ? "تعذّر الاتصال" : "غير مهيأة"}
              </Badge>
            )
          ) : <Skeleton className="h-6 w-24" />}
        />

        <Card>
          <CardContent className="space-y-4 pt-6">
            {/* الضوابط */}
            <div className="grid gap-4 sm:grid-cols-3">
              {/* اللغة */}
              <div className="space-y-2">
                <Label>اللغة</Label>
                <div className="flex rounded-md border p-0.5">
                  {(["ar", "en"] as SpaLang[]).map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => {
                        setLang(l);
                        setSlug(l === "ar" ? "important" : "important");
                        setSelected(new Set());
                      }}
                      className={`flex-1 rounded px-3 py-1.5 text-sm font-medium transition ${
                        lang === l
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted"
                      }`}
                      data-testid={`button-spa-lang-${l}`}
                    >
                      {l === "ar" ? "عربي" : "إنجليزي"}
                    </button>
                  ))}
                </div>
              </div>

              {/* القسم/الخلاصة المصدر */}
              <div className="space-y-2">
                <Label>القسم / الخلاصة</Label>
                <Select
                  value={slug}
                  onValueChange={(v) => {
                    setSlug(v);
                    setSelected(new Set());
                  }}
                >
                  <SelectTrigger data-testid="select-spa-section">
                    <SelectValue placeholder="اختر القسم" />
                  </SelectTrigger>
                  <SelectContent>
                    {feedSections.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>خلاصات</SelectLabel>
                        {feedSections.map((s) => (
                          <SelectItem key={s.slug} value={s.slug}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                    <SelectGroup>
                      <SelectLabel>أقسام</SelectLabel>
                      {categorySections.map((s) => (
                        <SelectItem key={s.slug} value={s.slug}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              {/* قسم الوجهة في سبق */}
              <div className="space-y-2">
                <Label>قسم الوجهة في سبق</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger data-testid="select-sabq-category">
                    <SelectValue placeholder="اختر القسم الوجهة" />
                  </SelectTrigger>
                  <SelectContent>
                    {sabqCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nameAr || c.nameEn || c.slug}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* شريط الإجراءات */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <div className="flex items-center gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleAll}
                    disabled={articles.length === 0}
                    data-testid="checkbox-spa-select-all"
                  />
                  تحديد الكل
                </label>
                <span className="text-sm text-muted-foreground">
                  محدّد: {selected.size} / {articles.length}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => refetch()}
                  disabled={isFetching}
                  data-testid="button-spa-refresh"
                >
                  <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
                  تحديث
                </Button>
              </div>
              <Button
                onClick={() => importMutation.mutate()}
                disabled={!canImport}
                data-testid="button-spa-import"
              >
                <Download className="h-4 w-4" />
                {importMutation.isPending
                  ? "جارٍ الاستيراد…"
                  : `استيراد المختار (${selected.size})`}
              </Button>
            </div>
            {selected.size > 0 && categoryId.length === 0 && (
              <p className="text-sm text-amber-600">اختر قسم الوجهة في سبق لتفعيل الاستيراد.</p>
            )}
          </CardContent>
        </Card>

        {/* قائمة المواد */}
        <div className="space-y-3">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))
          ) : articles.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
                <Globe className="h-8 w-8" />
                لا توجد مواد في هذا القسم حاليًا.
              </CardContent>
            </Card>
          ) : (
            articles.map((a) => {
              const isSel = selected.has(a.id);
              return (
                <Card
                  key={a.id}
                  className={`cursor-pointer transition ${
                    isSel ? "border-primary ring-1 ring-primary" : "hover:border-muted-foreground/30"
                  }`}
                  onClick={() => toggleOne(a.id)}
                  data-testid={`card-spa-article-${a.id}`}
                >
                  <CardContent className="flex items-start gap-3 p-3">
                    <Checkbox
                      checked={isSel}
                      onCheckedChange={() => toggleOne(a.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1"
                    />
                    {a.image ? (
                      <img
                        src={a.image}
                        alt=""
                        loading="lazy"
                        className="h-16 w-20 flex-shrink-0 rounded object-cover"
                      />
                    ) : (
                      <div className="flex h-16 w-20 flex-shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
                        <ImageOff className="h-5 w-5" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="line-clamp-2 text-sm font-semibold leading-snug">
                        {a.title}
                      </h3>
                      {a.summary && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {a.summary}
                        </p>
                      )}
                      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span>{timeAgo(a.publishedAt)}</span>
                        {a.source && (
                          <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                            {a.source}
                          </Badge>
                        )}
                        {a.url && (
                          <a
                            href={a.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-0.5 hover:text-foreground"
                          >
                            <ExternalLink className="h-3 w-3" /> المصدر
                          </a>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
