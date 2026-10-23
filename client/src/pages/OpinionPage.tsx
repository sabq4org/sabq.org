import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Header } from "@/components/Header";
import { NavigationBar } from "@/components/NavigationBar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Search,
  Sparkles,
  Flame,
  Eye,
  Bookmark,
  LayoutGrid,
  Rows3,
  Clock,
  Quote,
  User,
  X,
  ArrowLeft,
  Share2,
  PenTool,
} from "lucide-react";
import { DmsLeaderboardAd, DmsMpuAd, useAdTracking } from "@/components/DmsAdSlot";
import {
  OpinionCard,
  type OpinionCardArticle,
  getOpinionAuthorName,
  cleanOpinionAuthorBio,
} from "@/components/public/OpinionCard";
import { formatNumber } from "@/lib/format";
import { formatArticleTimestamp } from "@/lib/formatTime";
import { useToast } from "@/hooks/use-toast";

type OpinionArticle = OpinionCardArticle & {
  id: string;
  title: string;
  slug: string;
  views: number;
};

type SortMode = "latest" | "trending" | "views" | "saved";
type ViewMode = "grid" | "digest";

const SAVED_OPINIONS_STORE_NAME = "sabq-saved-opinions-v1";

function loadSavedOpinions(): OpinionArticle[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SAVED_OPINIONS_STORE_NAME);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function OpinionPage() {
  // يطابق <title> المحقون على الحافة (/api/edge/seo-meta) بعد تشغيل جافاسكربت.
  useEffect(() => {
    document.title = "الرأي — سبق";
  }, []);
  useAdTracking("رأي");
  const { toast } = useToast();

  const [currentPage, setCurrentPage] = useState(1);
  const [sortMode, setSortMode] = useState<SortMode>("latest");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedAuthorId, setSelectedAuthorId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [previewArticle, setPreviewArticle] = useState<OpinionCardArticle | null>(null);
  const [savedOpinions, setSavedOpinions] = useState<OpinionArticle[]>(() => loadSavedOpinions());

  const limit = 12;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setCurrentPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const savedIds = useMemo(
    () => new Set(savedOpinions.map((item) => item.id)),
    [savedOpinions]
  );

  const handleToggleSave = (article: OpinionCardArticle) => {
    setSavedOpinions((prev) => {
      const exists = prev.some((item) => item.id === article.id);
      const next = exists
        ? prev.filter((item) => item.id !== article.id)
        : [
            {
              ...article,
              views: article.views ?? 0,
            } as OpinionArticle,
            ...prev,
          ].slice(0, 50);
      try {
        window.localStorage.setItem(SAVED_OPINIONS_STORE_NAME, JSON.stringify(next));
      } catch {
        // ignore storage quota errors
      }
      toast({
        title: exists ? "أُزيل من محفوظات الرأي" : "حُفظ في قائمتك للقراءة",
        description: exists
          ? "تمت إزالة المقال من قائمة مقالات الرأي المحفوظة"
          : "يمكنك الرجوع إليه في أي وقت عبر تبويب «محفوظاتي»",
      });
      return next;
    });
  };

  const { data: user } = useQuery<{ id: string; name?: string; email?: string; role?: string }>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const apiSortQuery =
    sortMode === "trending"
      ? "&sort=trending"
      : sortMode === "views"
        ? "&sort=views"
        : "";
  const apiAuthorQuery = selectedAuthorId
    ? `&authorId=${encodeURIComponent(selectedAuthorId)}`
    : "";
  const apiSearchQuery = debouncedSearch
    ? `&search=${encodeURIComponent(debouncedSearch)}`
    : "";

  const { data, isLoading } = useQuery<{
    articles: OpinionArticle[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }>({
    queryKey: [
      `/api/opinion?page=${currentPage}&limit=${limit}${apiSortQuery}${apiAuthorQuery}${apiSearchQuery}`,
    ],
    enabled: sortMode !== "saved",
  });

  // Fetch trending opinion articles for the spotlight sidebar rail on page 1
  const { data: trendingData } = useQuery<{
    articles: OpinionArticle[];
  }>({
    queryKey: ["/api/opinion?page=1&limit=5&sort=trending"],
    staleTime: 2 * 60 * 1000,
  });

  // Extract unique columnists & categories from available feeds for discovery
  const discoveryPool = useMemo(() => {
    const map = new Map<string, OpinionArticle>();
    for (const a of data?.articles ?? []) map.set(a.id, a);
    for (const a of trendingData?.articles ?? []) {
      if (!map.has(a.id)) map.set(a.id, a);
    }
    return Array.from(map.values());
  }, [data?.articles, trendingData?.articles]);

  const columnists = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        name: string;
        avatar: string | null;
        bio: string;
        fullBio: string | null;
        articleCount: number;
      }
    >();
    for (const article of discoveryPool) {
      const authorId = article.author?.id;
      const name = getOpinionAuthorName(article);
      if (!authorId || name === "كاتب رأي") continue;
      const existing = map.get(authorId);
      if (existing) {
        existing.articleCount += 1;
      } else {
        map.set(authorId, {
          id: authorId,
          name,
          avatar: article.author?.profileImageUrl || null,
          bio: cleanOpinionAuthorBio(article.author?.bio, name),
          fullBio: article.author?.bio || null,
          articleCount: 1,
        });
      }
    }
    return Array.from(map.values());
  }, [discoveryPool]);

  const categories = useMemo(() => {
    const map = new Map<
      string,
      { id: string; nameAr: string; icon?: string | null; color?: string | null; count: number }
    >();
    for (const article of discoveryPool) {
      const cat = article.category;
      if (!cat?.id || !cat?.nameAr) continue;
      const existing = map.get(cat.id);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(cat.id, {
          id: cat.id,
          nameAr: cat.nameAr,
          icon: cat.icon,
          color: cat.color,
          count: 1,
        });
      }
    }
    return Array.from(map.values());
  }, [discoveryPool]);

  const selectedWriter = useMemo(
    () => columnists.find((w) => w.id === selectedAuthorId) || null,
    [columnists, selectedAuthorId]
  );

  const rawArticles = sortMode === "saved" ? savedOpinions : data?.articles ?? [];

  const displayedArticles = useMemo(() => {
    let list = rawArticles;
    if (selectedCategoryId) {
      list = list.filter((a) => a.category?.id === selectedCategoryId);
    }
    if (sortMode === "saved" && debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          (a.excerpt && a.excerpt.toLowerCase().includes(q)) ||
          getOpinionAuthorName(a).toLowerCase().includes(q)
      );
    }
    if (sortMode === "saved" && selectedAuthorId) {
      list = list.filter((a) => a.author?.id === selectedAuthorId);
    }
    return list;
  }, [rawArticles, selectedCategoryId, sortMode, debouncedSearch, selectedAuthorId]);

  // Show editorial spotlight on page 1 when browsing unfiltered latest articles and at least 4 exist
  const hasActiveFilter = Boolean(
    debouncedSearch || selectedAuthorId || selectedCategoryId || sortMode !== "latest"
  );
  const showEditorialSpotlight =
    !isLoading && currentPage === 1 && !hasActiveFilter && displayedArticles.length >= 4;
  const leadArticle = showEditorialSpotlight ? displayedArticles[0] : null;
  const trendingRailArticles = useMemo(() => {
    const pool =
      trendingData?.articles && trendingData.articles.length > 0
        ? trendingData.articles
        : [...displayedArticles].sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
    return pool.filter((a) => a.id !== leadArticle?.id).slice(0, 3);
  }, [trendingData?.articles, displayedArticles, leadArticle?.id]);
  const gridArticles = leadArticle
    ? displayedArticles.filter((a) => a.id !== leadArticle.id)
    : displayedArticles;

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const getPageNumbers = () => {
    const totalPages = data?.pagination.totalPages || 0;
    const pages: (number | string)[] = [];

    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 5; i++) pages.push(i);
        pages.push("...");
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1);
        pages.push("...");
        for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push("...");
        for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
        pages.push("...");
        pages.push(totalPages);
      }
    }

    return pages;
  };

  const resetFilters = () => {
    setSearchInput("");
    setDebouncedSearch("");
    setSelectedAuthorId(null);
    setSelectedCategoryId(null);
    setSortMode("latest");
    setCurrentPage(1);
  };

  return (
    <div className="public-page min-h-screen overflow-x-clip bg-background flex flex-col" dir="rtl">
      <Header user={user} />
      <NavigationBar />

      {/* DMS: الليدربورد مباشرة تحت القائمة الرئيسية (طلب DMS 2026-09-29) */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 pt-4 max-w-7xl empty:hidden">
        <DmsLeaderboardAd />
      </div>

      <main className="flex-1">
        {/* Hero Section — رأس القسم */}
        <section
          className="public-page-header relative overflow-hidden pt-5 pb-5 sm:pt-8 sm:pb-7 px-3.5 sm:px-4"
          data-testid="section-hero"
        >
          <div className="container max-w-7xl mx-auto relative">
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 sm:gap-6">
              <div className="text-right max-w-2xl lg:mx-0">
                <div className="inline-flex items-center gap-1.5 sm:gap-2 px-3 py-1 sm:px-3.5 sm:py-1.5 rounded-full bg-primary/10 text-primary text-xs sm:text-sm font-semibold mb-2.5 sm:mb-4">
                  <PenTool className="w-3.5 h-3.5" />
                  <span>منبر الرأي والتحليل</span>
                  {data?.pagination?.total ? (
                    <>
                      <span className="opacity-40">·</span>
                      <span className="tabular-nums">
                        {formatNumber(data.pagination.total)} مقال منشور
                      </span>
                    </>
                  ) : null}
                </div>

                <h1 className="public-page-title mb-1.5 sm:mb-2" data-testid="text-page-title">
                  مقالات الرأي
                </h1>

                <p
                  className="text-xs sm:text-base md:text-lg text-muted-foreground leading-relaxed"
                  data-testid="text-page-tagline"
                >
                  آراء وتحليلات معمّقة من كتّابنا المتميزين حول قضايا المجتمع، الاقتصاد، التقنية، والحياة
                </p>
              </div>

              {/* Search Box & View Mode Switcher */}
              <div className="w-full lg:w-auto flex flex-row items-center gap-2 max-w-xl lg:mx-0">
                <div className="relative flex-1 min-w-0 sm:w-72 md:w-80">
                  <Search className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="search"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="ابحث بعنوان المقال أو الفكرة..."
                    className="h-9 sm:h-10 rounded-xl bg-background pr-9 pl-8 text-xs sm:text-sm border-border/80"
                    data-testid="input-opinion-search"
                  />
                  {searchInput && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchInput("");
                        setDebouncedSearch("");
                      }}
                      className="no-min-touch-size absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label="مسح البحث"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div
                  className="inline-flex items-center shrink-0 rounded-xl border border-border/80 bg-background p-0.5 sm:p-1 text-[11px] sm:text-xs"
                  role="group"
                  aria-label="طريقة عرض المقالات"
                >
                  <button
                    type="button"
                    onClick={() => setViewMode("grid")}
                    className={`no-min-touch-size inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-semibold transition-colors ${
                      viewMode === "grid"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    data-testid="button-opinion-view-grid"
                    title="عرض البطاقات"
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                    <span>بطاقات</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("digest")}
                    className={`no-min-touch-size inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-semibold transition-colors ${
                      viewMode === "digest"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    data-testid="button-opinion-view-digest"
                    title="عرض القراءة المعمّقة مع خلاصة كل مقال كاملة"
                  >
                    <Rows3 className="h-3.5 w-3.5" />
                    <span>الخلاصات</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Columnists Ribbon — منبر الكتّاب */}
            {columnists.length > 1 && (
              <div className="mt-4 pt-3.5 sm:mt-6 sm:pt-5 border-t border-border/60" data-testid="opinion-writers-strip">
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <span className="text-[11px] sm:text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-primary" />
                    كتّاب الرأي (اضغط للتصفية حسب الكاتب):
                  </span>
                  {selectedAuthorId && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedAuthorId(null);
                        setCurrentPage(1);
                      }}
                      className="no-min-touch-size text-xs font-semibold text-primary hover:underline flex items-center gap-1"
                      data-testid="button-clear-author-filter"
                    >
                      <X className="h-3 w-3" />
                      عرض الجميع
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                  {columnists.map((writer) => {
                    const isSelected = selectedAuthorId === writer.id;
                    return (
                      <button
                        key={writer.id}
                        type="button"
                        onClick={() => {
                          setSelectedAuthorId(isSelected ? null : writer.id);
                          setCurrentPage(1);
                        }}
                        className={`no-min-touch-size group flex items-center gap-2 shrink-0 rounded-full border pl-3 pr-1.5 py-1 text-right transition-all ${
                          isSelected
                            ? "border-primary bg-primary text-primary-foreground shadow-sm"
                            : "border-border/80 bg-background hover:border-primary/50 hover:bg-background/90"
                        }`}
                        data-testid={`button-filter-writer-${writer.id}`}
                        title={
                          writer.fullBio
                            ? `${writer.name} — ${writer.fullBio.replace(/[*•➢▪▫]/g, "").replace(/\s+/g, " ").trim()}`
                            : writer.name
                        }
                      >
                        <Avatar className="h-7 w-7 sm:h-8 sm:w-8 shrink-0 border border-border/50">
                          <AvatarImage
                            src={writer.avatar || undefined}
                            alt={writer.name}
                            className="object-cover"
                            loading="lazy"
                          />
                          <AvatarFallback className="text-xs font-bold">
                            {writer.name.slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 max-w-[135px] sm:max-w-[150px]">
                          <p
                            className={`text-xs font-bold truncate ${
                              isSelected ? "text-primary-foreground" : "text-foreground"
                            }`}
                          >
                            {writer.name}
                          </p>
                          <p
                            className={`text-[10px] sm:text-[11px] truncate ${
                              isSelected ? "text-primary-foreground/80" : "text-muted-foreground"
                            }`}
                          >
                            {writer.bio}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="border-y border-[#e3ebf2] bg-[#f4f8fb] dark:border-border dark:bg-[#171e29]">
          <div className="container max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 py-5 sm:py-8">
            {/* Editorial Lead Spotlight + Trending Rail on Page 1 */}
            {showEditorialSpotlight && leadArticle && (
              <div
                className="mb-7 sm:mb-10 grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-stretch"
                data-testid="opinion-editorial-stage"
              >
                {/* Lead Opinion Piece */}
                <article
                  className="lg:col-span-7 xl:col-span-8 relative flex flex-col justify-between rounded-2xl sm:rounded-3xl border border-[#d6e4ef] dark:border-border bg-card p-4 sm:p-8 shadow-sm overflow-hidden"
                  data-testid="opinion-lead-spotlight"
                >
                  <Quote
                    className="pointer-events-none absolute left-4 top-4 sm:left-6 sm:top-6 h-14 w-14 sm:h-20 sm:w-20 text-primary/10"
                    aria-hidden="true"
                  />

                  <div className="relative z-10 space-y-3 sm:space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="bg-primary text-primary-foreground gap-1.5 px-2.5 py-0.5 sm:px-3 sm:py-1 text-xs font-bold">
                        <Sparkles className="h-3.5 w-3.5" />
                        مقال العدد
                      </Badge>
                      {leadArticle.category?.nameAr && (
                        <Badge variant="secondary" className="text-xs font-semibold">
                          {leadArticle.category.icon} {leadArticle.category.nameAr}
                        </Badge>
                      )}
                      {leadArticle.publishedAt && (
                        <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {formatArticleTimestamp(new Date(leadArticle.publishedAt))}
                        </span>
                      )}
                    </div>

                    <h2 className="text-xl sm:text-3xl font-extrabold leading-snug text-foreground hover:text-primary transition-colors">
                      <Link href={`/opinion/${leadArticle.slug}`}>{leadArticle.title}</Link>
                    </h2>

                    {(leadArticle.excerpt || leadArticle.aiSummary) && (
                      <div className="rounded-xl sm:rounded-2xl border-r-4 border-primary bg-muted/40 p-3.5 sm:p-5">
                        <p className="text-xs font-bold text-primary mb-1 flex items-center gap-1.5">
                          <Sparkles className="h-3.5 w-3.5" />
                          خلاصة الفكرة
                        </p>
                        <p className="text-xs sm:text-base text-foreground/90 leading-relaxed line-clamp-3 sm:line-clamp-none">
                          {leadArticle.excerpt || leadArticle.aiSummary}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="relative z-10 mt-4 pt-4 sm:mt-6 sm:pt-5 border-t border-border/70 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Link
                        href={`/author/${encodeURIComponent(getOpinionAuthorName(leadArticle))}`}
                        className="no-min-touch-size shrink-0"
                      >
                        <Avatar className="h-11 w-11 sm:h-14 sm:w-14 border-2 border-primary/20 shadow-sm">
                          <AvatarImage
                            src={leadArticle.author?.profileImageUrl || undefined}
                            alt={getOpinionAuthorName(leadArticle)}
                            className="object-cover"
                          />
                          <AvatarFallback>
                            <User className="h-5 w-5 sm:h-6 sm:w-6" />
                          </AvatarFallback>
                        </Avatar>
                      </Link>
                      <div className="min-w-0">
                        <Link
                          href={`/author/${encodeURIComponent(getOpinionAuthorName(leadArticle))}`}
                          className="no-min-touch-size font-bold text-sm sm:text-base text-foreground hover:text-primary transition-colors block truncate"
                        >
                          {getOpinionAuthorName(leadArticle)}
                        </Link>
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {cleanOpinionAuthorBio(leadArticle.author?.bio, getOpinionAuthorName(leadArticle))}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                      <span
                        className="text-xs text-muted-foreground inline-flex items-center gap-1 tabular-nums px-1.5"
                        data-testid={`opinion-spotlight-views-${leadArticle.id}`}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        {formatNumber(leadArticle.views ?? 0)} مشاهدة
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleSave(leadArticle)}
                        className="no-min-touch-size h-8 px-2.5 text-xs gap-1.5 rounded-xl"
                      >
                        <Bookmark
                          className={`h-3.5 w-3.5 ${
                            savedIds.has(leadArticle.id) ? "fill-current text-primary" : ""
                          }`}
                        />
                        <span>{savedIds.has(leadArticle.id) ? "محفوظ" : "حفظ"}</span>
                      </Button>
                      <Button asChild size="sm" className="no-min-touch-size h-8 px-3 text-xs gap-1.5 rounded-xl">
                        <Link href={`/opinion/${leadArticle.slug}`}>
                          <span>اقرأ المقال</span>
                          <ArrowLeft className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </article>

                {/* Trending Opinion Rail */}
                {trendingRailArticles.length > 0 && (
                  <aside
                    className="lg:col-span-5 xl:col-span-4 rounded-2xl sm:rounded-3xl border border-[#d6e4ef] dark:border-border bg-card p-4 sm:p-6 flex flex-col justify-between"
                    aria-label="ترند المقالات هذا الأسبوع"
                    data-testid="opinion-trending-rail"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 pb-3 mb-3 sm:pb-4 sm:mb-4 border-b border-border/70">
                        <h2 className="text-sm sm:text-lg font-extrabold flex items-center gap-2 text-foreground">
                          <span className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
                            <Flame className="h-4 w-4" />
                          </span>
                          ترند مقالات الأسبوع
                        </h2>
                        <button
                          type="button"
                          onClick={() => {
                            setSortMode("trending");
                            setCurrentPage(1);
                          }}
                          className="no-min-touch-size text-xs font-semibold text-primary hover:underline"
                        >
                          عرض الكل
                        </button>
                      </div>

                      <div className="divide-y divide-border/60">
                        {trendingRailArticles.map((item, idx) => {
                          const writerName = getOpinionAuthorName(item);
                          return (
                            <div
                              key={item.id}
                              className="py-3 first:pt-0 last:pb-0 flex items-start gap-2.5 sm:gap-3 group"
                            >
                              <span className="flex h-6 w-6 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-extrabold tabular-nums text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                                {idx + 1}
                              </span>
                              <div className="min-w-0 flex-1 space-y-1">
                                <Link
                                  href={`/opinion/${item.slug}`}
                                  className="no-min-touch-size font-bold text-xs sm:text-sm leading-snug text-foreground group-hover:text-primary transition-colors line-clamp-2 block"
                                >
                                  {item.title}
                                </Link>
                                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                                  <span className="truncate font-medium">{writerName}</span>
                                  <span className="inline-flex items-center gap-1 tabular-nums shrink-0">
                                    <Eye className="h-3 w-3" />
                                    {formatNumber(item.views ?? 0)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="mt-3 pt-2.5 sm:mt-4 sm:pt-3 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
                      <span>مرتبة حسب التفاعل والقراءة الكاملة</span>
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                    </div>
                  </aside>
                )}
              </div>
            )}

            {/* Active Writer Banner when filtering by a specific columnist */}
            {selectedWriter && (
              <div
                className="mb-5 rounded-2xl border border-primary/30 bg-card p-3.5 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 shadow-sm"
                data-testid="banner-selected-writer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar className="h-12 w-12 sm:h-14 sm:w-14 border-2 border-primary/20 shrink-0">
                    <AvatarImage
                      src={selectedWriter.avatar || undefined}
                      alt={selectedWriter.name}
                      className="object-cover"
                    />
                    <AvatarFallback className="font-bold">
                      {selectedWriter.name.slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-bold text-base sm:text-lg text-foreground">{selectedWriter.name}</h2>
                      <Badge variant="secondary" className="text-xs">
                        كاتب رأي
                      </Badge>
                    </div>
                    {selectedWriter.fullBio && (
                      <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                        {selectedWriter.fullBio}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button asChild variant="outline" size="sm" className="no-min-touch-size h-8 text-xs rounded-xl">
                    <Link href={`/author/${encodeURIComponent(selectedWriter.name)}`}>
                      صفحة الكاتب الكاملة
                    </Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedAuthorId(null)}
                    className="no-min-touch-size h-8 text-xs rounded-xl text-muted-foreground"
                  >
                    <X className="h-3.5 w-3.5 ml-1" />
                    إلغاء
                  </Button>
                </div>
              </div>
            )}

            {/* Filter & Sort Controls Bar */}
            <div className="mb-5 sm:mb-6 flex flex-col md:flex-row md:items-center justify-between gap-2.5 sm:gap-4">
              {/* Sort Buttons — شريط أفقي قابل للتمرير على الهاتف بدون التفاف */}
              <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar pb-0.5">
                <Button
                  variant={sortMode === "latest" ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setSortMode("latest");
                    setCurrentPage(1);
                  }}
                  data-testid="button-opinion-sort-latest"
                  className="no-min-touch-size h-8 px-3 text-xs shrink-0"
                >
                  الأحدث
                </Button>
                <Button
                  variant={sortMode === "trending" ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setSortMode("trending");
                    setCurrentPage(1);
                  }}
                  data-testid="button-opinion-sort-trending"
                  className="no-min-touch-size h-8 px-3 text-xs gap-1.5 shrink-0"
                >
                  <Flame className="h-3.5 w-3.5" />
                  الأكثر تداولاً
                </Button>
                <Button
                  variant={sortMode === "views" ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setSortMode("views");
                    setCurrentPage(1);
                  }}
                  data-testid="button-opinion-sort-views"
                  className="no-min-touch-size h-8 px-3 text-xs gap-1.5 shrink-0"
                >
                  <Eye className="h-3.5 w-3.5" />
                  الأعلى قراءة
                </Button>
                <Button
                  variant={sortMode === "saved" ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setSortMode("saved");
                    setCurrentPage(1);
                  }}
                  data-testid="button-opinion-sort-saved"
                  className="no-min-touch-size h-8 px-3 text-xs gap-1.5 shrink-0"
                >
                  <Bookmark className="h-3.5 w-3.5" />
                  <span>محفوظاتي</span>
                  {savedOpinions.length > 0 && (
                    <span className="rounded-full bg-primary/15 px-1.5 py-0.2 text-[11px] font-bold tabular-nums">
                      {savedOpinions.length}
                    </span>
                  )}
                </Button>
              </div>

              {/* Category Filter Pills */}
              {categories.length > 1 && (
                <div
                  className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar justify-start md:justify-end"
                  role="group"
                  aria-label="تصفية حسب المجال"
                  data-testid="opinion-category-filters"
                >
                  <button
                    type="button"
                    onClick={() => setSelectedCategoryId(null)}
                    className={`no-min-touch-size shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                      selectedCategoryId === null
                        ? "bg-foreground text-background"
                        : "bg-background/80 text-muted-foreground hover:text-foreground border border-border/70"
                    }`}
                    data-testid="button-opinion-category-all"
                  >
                    كل المجالات
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() =>
                        setSelectedCategoryId(selectedCategoryId === cat.id ? null : cat.id)
                      }
                      className={`no-min-touch-size shrink-0 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                        selectedCategoryId === cat.id
                          ? "bg-foreground text-background"
                          : "bg-background/80 text-muted-foreground hover:text-foreground border border-border/70"
                      }`}
                      data-testid={`button-opinion-category-${cat.id}`}
                    >
                      {cat.icon && <span>{cat.icon}</span>}
                      <span>{cat.nameAr}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <DmsMpuAd topSlot />

            {isLoading && sortMode !== "saved" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-96 rounded-2xl animate-pulse bg-muted/50" />
                ))}
              </div>
            ) : displayedArticles.length > 0 ? (
              <>
                {viewMode === "grid" ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {gridArticles.map((article) => (
                      <OpinionCard
                        key={article.id}
                        article={article}
                        variant="grid"
                        onQuickPreview={setPreviewArticle}
                        isSaved={savedIds.has(article.id)}
                        onToggleSave={handleToggleSave}
                      />
                    ))}
                  </div>
                ) : (
                  /* Digest View Mode — قراءة الخلاصات كاملة */
                  <div
                    className="grid grid-cols-1 lg:grid-cols-2 gap-6"
                    data-testid="opinion-digest-list"
                  >
                    {gridArticles.map((article) => {
                      const writerName = getOpinionAuthorName(article);
                      const writerRole = cleanOpinionAuthorBio(article.author?.bio, writerName);
                      const summaryText = article.excerpt || article.aiSummary || "";
                      const isArticleSaved = savedIds.has(article.id);
                      return (
                        <article
                          key={article.id}
                          className="rounded-3xl border border-border/80 bg-card p-6 flex flex-col justify-between gap-4 shadow-sm hover:border-primary/40 transition-all"
                          data-testid={`opinion-card-${article.id}`}
                        >
                          <div className="space-y-4">
                            <div className="flex items-start justify-between gap-3">
                              <Link
                                href={`/author/${encodeURIComponent(writerName)}`}
                                className="flex items-center gap-3 min-w-0 group"
                              >
                                <Avatar className="h-12 w-12 border border-border shrink-0">
                                  <AvatarImage
                                    src={article.author?.profileImageUrl || undefined}
                                    alt={writerName}
                                    className="object-cover"
                                    loading="lazy"
                                  />
                                  <AvatarFallback>
                                    <User className="h-5 w-5" />
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                  <p className="font-bold text-sm text-foreground group-hover:text-primary transition-colors truncate">
                                    {writerName}
                                  </p>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {writerRole}
                                  </p>
                                </div>
                              </Link>
                              {article.category?.nameAr && (
                                <Badge variant="secondary" className="text-xs shrink-0">
                                  {article.category.icon} {article.category.nameAr}
                                </Badge>
                              )}
                            </div>

                            <h3 className="text-xl font-bold leading-snug text-foreground hover:text-primary transition-colors">
                              <Link href={`/opinion/${article.slug}`}>{article.title}</Link>
                            </h3>

                            {summaryText && (
                              <div className="rounded-2xl bg-muted/40 border border-border/50 p-4">
                                <p className="text-sm sm:text-[15px] text-foreground/90 leading-relaxed">
                                  {summaryText}
                                </p>
                              </div>
                            )}
                          </div>

                          <div className="pt-3 border-t border-border/60 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                            <div className="flex items-center gap-3">
                              {article.publishedAt && (
                                <span className="inline-flex items-center gap-1">
                                  <Clock className="h-3.5 w-3.5" />
                                  {formatArticleTimestamp(new Date(article.publishedAt))}
                                </span>
                              )}
                              <span
                                className="inline-flex items-center gap-1 tabular-nums"
                                data-testid={`opinion-views-${article.id}`}
                              >
                                <Eye className="h-3.5 w-3.5" />
                                {formatNumber(article.views ?? 0)} مشاهدة
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2.5 text-xs gap-1"
                                onClick={() => handleToggleSave(article)}
                              >
                                <Bookmark
                                  className={`h-3.5 w-3.5 ${
                                    isArticleSaved ? "fill-current text-primary" : ""
                                  }`}
                                />
                                <span>{isArticleSaved ? "محفوظ" : "حفظ"}</span>
                              </Button>
                              <Button asChild variant="default" size="sm" className="h-8 rounded-xl text-xs gap-1">
                                <Link href={`/opinion/${article.slug}`}>
                                  <span>قراءة المقال</span>
                                  <ArrowLeft className="h-3.5 w-3.5" />
                                </Link>
                              </Button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}

                {sortMode !== "saved" && data && data.pagination.totalPages > 1 && (
                  <div className="mt-12 flex justify-center items-center gap-2" dir="ltr">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      data-testid="button-prev-page"
                      aria-label="الصفحة السابقة"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>

                    {getPageNumbers().map((page, index) =>
                      page === "..." ? (
                        <span key={`ellipsis-${index}`} className="px-2 text-muted-foreground">
                          ...
                        </span>
                      ) : (
                        <Button
                          key={page}
                          variant={currentPage === page ? "default" : "outline"}
                          size="icon"
                          onClick={() => handlePageChange(page as number)}
                          data-testid={`button-page-${page}`}
                          className="min-w-9"
                        >
                          {page}
                        </Button>
                      )
                    )}

                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === data.pagination.totalPages}
                      data-testid="button-next-page"
                      aria-label="الصفحة التالية"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-16">
                <BookOpen className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                <h2 className="text-2xl font-bold text-foreground mb-2">
                  {sortMode === "saved"
                    ? "لا توجد مقالات رأي محفوظة في قائمتك بعد"
                    : hasActiveFilter
                      ? "لا توجد مقالات مطابقة لخيارات البحث أو التصفية"
                      : "لا توجد مقالات رأي متاحة حالياً"}
                </h2>
                <p className="text-muted-foreground mb-5">
                  {sortMode === "saved"
                    ? "اضغط على أيقونة الحفظ في أي مقال رأي للرجوع إليه وقراءته لاحقاً"
                    : "تابعنا لقراءة آخر التحليلات والآراء"}
                </p>
                {(hasActiveFilter || sortMode === "saved") && (
                  <Button variant="outline" onClick={resetFilters} data-testid="button-reset-opinion-filters">
                    العودة إلى جميع مقالات الرأي
                  </Button>
                )}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Quick Thesis Preview Dialog — نافذة معاينة خلاصة المقال */}
      <Dialog
        open={Boolean(previewArticle)}
        onOpenChange={(open) => {
          if (!open) setPreviewArticle(null);
        }}
      >
        <DialogContent className="max-w-xl rounded-3xl p-6 sm:p-7" dir="rtl" data-testid="dialog-opinion-preview">
          {previewArticle && (
            <>
              <DialogHeader className="text-right space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <Badge className="bg-primary/10 text-primary hover:bg-primary/15 border-0 gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" />
                    خلاصة مقال الرأي
                  </Badge>
                  {previewArticle.category?.nameAr && (
                    <Badge variant="secondary" className="text-xs">
                      {previewArticle.category.icon} {previewArticle.category.nameAr}
                    </Badge>
                  )}
                </div>
                <DialogTitle className="text-xl sm:text-2xl font-extrabold leading-snug text-right">
                  {previewArticle.title}
                </DialogTitle>
                <DialogDescription asChild>
                  <div className="flex items-center gap-3 pt-1">
                    <Avatar className="h-11 w-11 border border-border shrink-0">
                      <AvatarImage
                        src={previewArticle.author?.profileImageUrl || undefined}
                        alt={getOpinionAuthorName(previewArticle)}
                        className="object-cover"
                      />
                      <AvatarFallback>
                        <User className="h-5 w-5" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 text-right">
                      <Link
                        href={`/author/${encodeURIComponent(getOpinionAuthorName(previewArticle))}`}
                        onClick={() => setPreviewArticle(null)}
                        className="font-bold text-sm text-foreground hover:text-primary transition-colors block"
                      >
                        {getOpinionAuthorName(previewArticle)}
                      </Link>
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {cleanOpinionAuthorBio(previewArticle.author?.bio, getOpinionAuthorName(previewArticle))}
                      </p>
                    </div>
                  </div>
                </DialogDescription>
              </DialogHeader>

              <div className="my-4 rounded-2xl border border-border/80 bg-muted/40 p-5 text-base leading-loose text-foreground">
                {previewArticle.excerpt || previewArticle.aiSummary || "لا يتوفر ملخص لهذا المقال."}
              </div>

              {previewArticle.author?.bio && (
                <div className="rounded-xl bg-muted/25 px-4 py-3 text-xs text-muted-foreground leading-relaxed">
                  <span className="font-bold text-foreground">عن الكاتب: </span>
                  {previewArticle.author.bio}
                </div>
              )}

              <div className="mt-4 pt-4 border-t border-border flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleToggleSave(previewArticle)}
                    className="gap-1.5 rounded-xl"
                  >
                    <Bookmark
                      className={`h-4 w-4 ${
                        savedIds.has(previewArticle.id) ? "fill-current text-primary" : ""
                      }`}
                    />
                    <span>{savedIds.has(previewArticle.id) ? "محفوظ" : "حفظ المقال"}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 rounded-xl"
                    onClick={async () => {
                      const url = `${window.location.origin}/opinion/${previewArticle.slug}`;
                      try {
                        await navigator.clipboard.writeText(url);
                        toast({ title: "تم نسخ رابط المقال" });
                      } catch {
                        // ignore
                      }
                    }}
                  >
                    <Share2 className="h-4 w-4" />
                    <span>نسخ الرابط</span>
                  </Button>
                </div>

                <Button
                  asChild
                  size="sm"
                  className="gap-1.5 rounded-xl"
                  onClick={() => setPreviewArticle(null)}
                >
                  <Link href={`/opinion/${previewArticle.slug}`}>
                    <span>قراءة المقال كاملاً</span>
                    <ArrowLeft className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
}
