import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/Header";
import { NavigationBar } from "@/components/NavigationBar";
import { Footer } from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Eye,
  ChevronLeft,
  ChevronRight,
  User,
  BookOpen,
  Flame,
  ArrowLeft,
  Quote,
  X,
} from "lucide-react";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { DmsLeaderboardAd, DmsMpuAd, useAdTracking } from "@/components/DmsAdSlot";

type OpinionAuthor = {
  id: string;
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string;
  bio?: string;
};

type OpinionArticle = {
  id: string;
  title: string;
  slug: string;
  excerpt?: string;
  imageUrl?: string;
  publishedAt?: string;
  views: number;
  category?: {
    id: string;
    nameAr: string;
    nameEn: string;
    icon?: string;
    color?: string;
  };
  author?: OpinionAuthor;
};

type OpinionResponse = {
  articles: OpinionArticle[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

const PAGE_LIMIT = 9;

function authorName(author?: OpinionAuthor): string {
  if (!author) return "كاتب رأي";
  const name = `${author.firstName || ""} ${author.lastName || ""}`.trim();
  return name || "كاتب رأي";
}

function relativeTime(date?: string): string {
  if (!date) return "";
  try {
    return formatDistanceToNow(new Date(date), { addSuffix: true, locale: ar });
  } catch {
    return "";
  }
}

function formatViews(n: number): string {
  return (n ?? 0).toLocaleString("en-US");
}

function AuthorAvatar({
  author,
  size = "md",
}: {
  author?: OpinionAuthor;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const dims = {
    sm: "h-8 w-8",
    md: "h-10 w-10",
    lg: "h-14 w-14",
    xl: "h-20 w-20",
  }[size];
  const iconDims = {
    sm: "h-4 w-4",
    md: "h-5 w-5",
    lg: "h-6 w-6",
    xl: "h-9 w-9",
  }[size];
  if (author?.profileImageUrl) {
    return (
      <img
        src={author.profileImageUrl}
        alt={authorName(author)}
        className={`${dims} rounded-full object-cover ring-2 ring-background shadow-sm`}
        loading="lazy"
      />
    );
  }
  return (
    <div
      className={`${dims} rounded-full bg-muted flex items-center justify-center ring-2 ring-background shadow-sm`}
    >
      <User className={`${iconDims} text-muted-foreground`} />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Hero — the single most-read opinion of the last 48h, given room to breathe.
   ────────────────────────────────────────────────────────────────────────── */
function OpinionHero({ article }: { article: OpinionArticle }) {
  return (
    <Link href={`/opinion/${article.slug}`} className="block">
      <Card
        className="group relative overflow-hidden hover-elevate active-elevate-2 cursor-pointer border-border dark:border-card-border"
        data-testid={`hero-opinion-${article.id}`}
      >
        {/* soft brand wash on the leading (right, in RTL) edge */}
        <div className="absolute inset-y-0 right-0 w-1.5 bg-primary/80" aria-hidden />
        <Quote
          className="pointer-events-none absolute -top-3 left-6 h-24 w-24 text-primary/5 rotate-180"
          aria-hidden
        />
        <CardContent className="relative p-6 md:p-10">
          <div className="flex flex-col md:flex-row md:items-center gap-6 md:gap-10">
            {/* Author block */}
            <div className="flex md:flex-col items-center md:items-center gap-4 md:gap-3 md:w-44 md:shrink-0 md:text-center">
              <AuthorAvatar author={article.author} size="xl" />
              <div className="md:mt-1">
                <p className="font-bold text-lg text-foreground leading-tight">
                  {authorName(article.author)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">كاتب رأي</p>
              </div>
            </div>

            {/* Text block */}
            <div className="flex-1 min-w-0 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className="gap-1 bg-primary/10 text-primary border-0 hover:bg-primary/15">
                  <Flame className="h-3 w-3" />
                  الأكثر قراءة الآن
                </Badge>
                {article.category && (
                  <Badge variant="secondary" className="font-normal">
                    {article.category.icon} {article.category.nameAr}
                  </Badge>
                )}
              </div>

              <h2 className="text-2xl md:text-4xl font-extrabold leading-snug text-foreground group-hover:text-primary transition-colors">
                {article.title}
              </h2>

              {article.excerpt && (
                <p className="text-base md:text-lg text-muted-foreground leading-relaxed line-clamp-3">
                  {article.excerpt}
                </p>
              )}

              <div className="flex items-center gap-4 text-sm text-muted-foreground pt-1">
                <span className="inline-flex items-center gap-1.5">
                  <Eye className="h-4 w-4" />
                  {formatViews(article.views)}
                </span>
                {article.publishedAt && <span>{relativeTime(article.publishedAt)}</span>}
                <span className="mr-auto inline-flex items-center gap-1 font-semibold text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                  اقرأ المقال
                  <ArrowLeft className="h-4 w-4" />
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Writers strip — quick access to the active columnists, click to filter.
   ────────────────────────────────────────────────────────────────────────── */
function WritersStrip({
  writers,
  activeId,
  onSelect,
}: {
  writers: OpinionAuthor[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
}) {
  if (writers.length === 0) return null;
  return (
    <section aria-label="كتّاب الرأي" className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-lg font-bold text-foreground">كُتّاب الرأي</h3>
        {activeId && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs text-muted-foreground"
            onClick={() => onSelect(null)}
            data-testid="button-clear-writer-filter"
          >
            <X className="h-3 w-3" />
            إلغاء التصفية
          </Button>
        )}
      </div>
      <div className="flex gap-5 overflow-x-auto pb-2 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {writers.map((w) => {
          const active = activeId === w.id;
          return (
            <button
              key={w.id}
              onClick={() => onSelect(active ? null : w.id)}
              className="group flex flex-col items-center gap-2 shrink-0 w-20 focus:outline-none"
              data-testid={`writer-chip-${w.id}`}
              aria-pressed={active}
            >
              <div
                className={`rounded-full p-0.5 transition-all ${
                  active ? "ring-2 ring-primary" : "ring-1 ring-transparent group-hover:ring-border"
                }`}
              >
                <AuthorAvatar author={w} size="lg" />
              </div>
              <span
                className={`text-xs text-center leading-tight line-clamp-2 transition-colors ${
                  active ? "text-primary font-semibold" : "text-muted-foreground group-hover:text-foreground"
                }`}
              >
                {authorName(w)}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Trending rail — the 48h most-read ranking, numbered.
   ────────────────────────────────────────────────────────────────────────── */
function TrendingRail({ articles }: { articles: OpinionArticle[] }) {
  if (articles.length === 0) return null;
  return (
    <Card className="border-border dark:border-card-border overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border bg-muted/40">
        <Flame className="h-5 w-5 text-primary" />
        <h3 className="font-bold text-foreground">الأكثر قراءة</h3>
        <span className="text-xs text-muted-foreground mr-auto">آخر ٤٨ ساعة</span>
      </div>
      <ol className="divide-y divide-border">
        {articles.map((article, i) => (
          <li key={article.id}>
            <Link
              href={`/opinion/${article.slug}`}
              className="group flex items-start gap-3 p-4 hover-elevate active-elevate-2"
              data-testid={`trending-opinion-${article.id}`}
            >
              <span
                className={`shrink-0 text-2xl font-extrabold tabular-nums leading-none w-7 text-center ${
                  i === 0 ? "text-primary" : "text-muted-foreground/40"
                }`}
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-1.5">
                <h4 className="text-sm font-semibold leading-snug line-clamp-2 text-foreground group-hover:text-primary transition-colors">
                  {article.title}
                </h4>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <AuthorAvatar author={article.author} size="sm" />
                  <span className="truncate">{authorName(article.author)}</span>
                  <span className="inline-flex items-center gap-1 shrink-0">
                    <Eye className="h-3 w-3" />
                    {formatViews(article.views)}
                  </span>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Feed card — refined, author-forward.
   ────────────────────────────────────────────────────────────────────────── */
function OpinionCard({ article }: { article: OpinionArticle }) {
  return (
    <Link href={`/opinion/${article.slug}`} className="block h-full">
      <Card
        className="group relative h-full overflow-hidden hover-elevate active-elevate-2 cursor-pointer border-border dark:border-card-border flex flex-col"
        data-testid={`card-opinion-${article.id}`}
      >
        <div className="absolute inset-x-0 top-0 h-1 bg-primary/0 group-hover:bg-primary/70 transition-colors" aria-hidden />
        <CardContent className="p-5 flex flex-col flex-1 space-y-3.5">
          {article.category && (
            <Badge variant="secondary" className="self-start font-normal text-xs">
              {article.category.icon} {article.category.nameAr}
            </Badge>
          )}

          <h3 className="font-bold text-lg leading-snug line-clamp-3 text-foreground group-hover:text-primary transition-colors">
            {article.title}
          </h3>

          {article.excerpt && (
            <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed flex-1">
              {article.excerpt}
            </p>
          )}

          <div className="flex items-center gap-3 pt-3 mt-auto border-t border-border dark:border-border/60">
            <AuthorAvatar author={article.author} size="md" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground truncate">
                {authorName(article.author)}
              </p>
              {article.publishedAt && (
                <p className="text-xs text-muted-foreground">{relativeTime(article.publishedAt)}</p>
              )}
            </div>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground shrink-0">
              <Eye className="h-3.5 w-3.5" />
              {formatViews(article.views)}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function OpinionPage() {
  useAdTracking("رأي");

  const [currentPage, setCurrentPage] = useState(1);
  const [sortMode, setSortMode] = useState<"latest" | "trending">("latest");
  const [authorId, setAuthorId] = useState<string | null>(null);

  const { data: user } = useQuery<{ id: string; name?: string; email?: string; role?: string }>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  // Trending (48h engagement window) powers the Hero + the rail. Fetched once,
  // independent of the paginated feed below.
  const { data: trendingData, isLoading: trendingLoading } = useQuery<OpinionResponse>({
    queryKey: ["/api/opinion?sort=trending&limit=7"],
    staleTime: 60 * 1000,
  });

  const heroArticle = trendingData?.articles?.[0];
  const railArticles = (trendingData?.articles ?? []).slice(1, 6);

  // Main feed — paginated, honors the sort toggle and the active writer filter.
  const feedKey = `/api/opinion?page=${currentPage}&limit=${PAGE_LIMIT}${
    sortMode === "trending" ? "&sort=trending" : ""
  }${authorId ? `&authorId=${authorId}` : ""}`;
  const { data, isLoading } = useQuery<OpinionResponse>({
    queryKey: [feedKey],
  });

  // Derive the writers strip from whoever shows up across the trending + feed
  // payloads (dedup by id, keep those we can render a name/photo for).
  const writers = useMemo(() => {
    const map = new Map<string, OpinionAuthor>();
    const push = (a?: OpinionArticle) => {
      if (a?.author?.id && !map.has(a.author.id)) map.set(a.author.id, a.author);
    };
    trendingData?.articles?.forEach(push);
    data?.articles?.forEach(push);
    return Array.from(map.values()).slice(0, 14);
  }, [trendingData, data]);

  const activeWriterName = authorId
    ? authorName(writers.find((w) => w.id === authorId))
    : null;

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSelectWriter = (id: string | null) => {
    setAuthorId(id);
    setCurrentPage(1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const getPageNumbers = () => {
    const totalPages = data?.pagination.totalPages || 0;
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else if (currentPage <= 3) {
      for (let i = 1; i <= 5; i++) pages.push(i);
      pages.push("...", totalPages);
    } else if (currentPage >= totalPages - 2) {
      pages.push(1, "...");
      for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1, "...");
      for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
      pages.push("...", totalPages);
    }
    return pages;
  };

  const showcase = !authorId; // hide global Hero/rail while filtering by writer

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <Header user={user} />
      <NavigationBar />

      <main className="flex-1">
        <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
          {/* Page heading */}
          <header className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <BookOpen className="h-6 w-6" />
              </span>
              <h1 className="text-3xl md:text-4xl font-extrabold text-foreground" data-testid="text-page-title">
                مقالات الرأي
              </h1>
            </div>
            <p className="text-base md:text-lg text-muted-foreground pr-14">
              آراء وتحليلات من كتّابنا المتميّزين
            </p>
          </header>

          <DmsLeaderboardAd />

          {/* Hero */}
          {showcase &&
            (trendingLoading ? (
              <Skeleton className="h-64 w-full rounded-xl" />
            ) : heroArticle ? (
              <OpinionHero article={heroArticle} />
            ) : null)}

          {/* Writers strip */}
          {trendingLoading && writers.length === 0 ? (
            <div className="flex gap-5">
              {[...Array(7)].map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-2 w-20">
                  <Skeleton className="h-14 w-14 rounded-full" />
                  <Skeleton className="h-3 w-14" />
                </div>
              ))}
            </div>
          ) : (
            <WritersStrip writers={writers} activeId={authorId} onSelect={handleSelectWriter} />
          )}

          {/* Filter banner */}
          {authorId && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3">
              <p className="text-sm text-foreground">
                عرض مقالات: <span className="font-bold">{activeWriterName}</span>
              </p>
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => handleSelectWriter(null)}
                data-testid="button-clear-filter-banner"
              >
                <X className="h-3.5 w-3.5" />
                كل الكتّاب
              </Button>
            </div>
          )}

          {/* Body: feed + trending rail */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main feed */}
            <div className="lg:col-span-2 space-y-6">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h2 className="text-xl font-bold text-foreground">
                  {authorId ? "مقالات الكاتب" : "أحدث المقالات"}
                </h2>
                {!authorId && (
                  <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/30">
                    <Button
                      variant={sortMode === "latest" ? "default" : "ghost"}
                      size="sm"
                      className="h-8"
                      onClick={() => {
                        setSortMode("latest");
                        setCurrentPage(1);
                      }}
                      data-testid="button-opinion-sort-latest"
                    >
                      الأحدث
                    </Button>
                    <Button
                      variant={sortMode === "trending" ? "default" : "ghost"}
                      size="sm"
                      className="h-8"
                      onClick={() => {
                        setSortMode("trending");
                        setCurrentPage(1);
                      }}
                      data-testid="button-opinion-sort-trending"
                    >
                      الأكثر تداولاً
                    </Button>
                  </div>
                )}
              </div>

              {isLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {[...Array(6)].map((_, i) => (
                    <Skeleton key={i} className="h-60 rounded-xl" />
                  ))}
                </div>
              ) : data?.articles && data.articles.length > 0 ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    {data.articles.map((article) => (
                      <OpinionCard key={article.id} article={article} />
                    ))}
                  </div>

                  {data.pagination.totalPages > 1 && (
                    <div className="mt-8 flex justify-center items-center gap-2" dir="ltr">
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
                <div className="text-center py-16 rounded-xl border border-dashed border-border">
                  <BookOpen className="h-14 w-14 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-xl font-bold text-foreground mb-2">
                    {authorId ? "لا توجد مقالات لهذا الكاتب" : "لا توجد مقالات رأي متاحة حالياً"}
                  </h3>
                  <p className="text-muted-foreground">تابعنا لقراءة آخر التحليلات والآراء</p>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <aside className="lg:col-span-1 space-y-6">
              <div className="lg:sticky lg:top-24 space-y-6">
                {trendingLoading ? (
                  <Skeleton className="h-80 rounded-xl" />
                ) : (
                  <TrendingRail articles={railArticles} />
                )}
                <div className="flex justify-center">
                  <DmsMpuAd />
                </div>
              </div>
            </aside>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
