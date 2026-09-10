/**
 * صفحة الكاتب العامة — /author/:name
 * تصميم أقرب لقائمة الرأي: هيرو خفيف + شبكة عناوين (بدون صفوف صور مكدّسة).
 */
import { useEffect } from "react";
import { Link, useParams, useSearch } from "wouter";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Header } from "@/components/Header";
import { NavigationBar } from "@/components/NavigationBar";
import { Footer } from "@/components/Footer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useCanonical } from "@/hooks/useCanonical";
import { apiUrl } from "@/lib/queryClient";
import { OpinionCard } from "@/components/public/OpinionCard";
import { Loader2, PenLine } from "lucide-react";
import { NewsArticleCard } from "@/components/NewsArticleCard";
import type { ArticleWithDetails } from "@shared/schema";

const PAGE_SIZE = 18;

type AuthorArticle = {
  id: string;
  title: string;
  excerpt: string | null;
  slug: string;
  englishSlug: string | null;
  articleType: string | null;
  publishedAt: string | null;
  views: number;
};

type AuthorPage = {
  author: {
    id: string;
    name: string;
    role: string;
    avatarUrl: string | null;
    bio: string | null;
  };
  stats: {
    articleCount: number;
    totalViews: number;
  };
  recentArticles: AuthorArticle[];
  pagination?: {
    page: number;
    limit: number;
    hasMore: boolean;
  };
};

function articleHref(a: AuthorArticle): string {
  const slug = a.englishSlug || a.slug;
  return a.articleType === "opinion" ? `/opinion/${slug}` : `/article/${slug}`;
}

function initialsOf(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((p) => p[0])
      .join("")
      .slice(0, 2) || "س"
  );
}

export default function AuthorArticlesPage() {
  const params = useParams<{ name?: string }>();
  const rawName = params.name ? decodeURIComponent(params.name) : "";
  const name = rawName.trim().replace(/\s+/g, " ");
  const { user } = useAuth();
  const search = useSearch();
  const requestedPage = new URLSearchParams(search).get("page");
  const pageNumber = requestedPage && /^[1-9]\d*$/.test(requestedPage) && Number(requestedPage) <= 10_000 ? Number(requestedPage) : 1;
  const authorPath = `/author/${encodeURIComponent(name)}`;
  const pageHref = (page: number) => page === 1 ? authorPath : `${authorPath}?page=${page}`;

  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["/api/authors/by-name", name, PAGE_SIZE, pageNumber],
    queryFn: async ({ pageParam }): Promise<AuthorPage> => {
      const page = typeof pageParam === "number" ? pageParam : 1;
      const res = await fetch(
        apiUrl(
          `/api/authors/by-name?name=${encodeURIComponent(name)}&limit=${PAGE_SIZE}&page=${page}`,
        ),
        { credentials: "include" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "تعذر جلب الكاتب");
      }
      return res.json();
    },
    initialPageParam: pageNumber,
    getNextPageParam: (lastPage) => {
      if (lastPage.pagination?.hasMore) {
        return (lastPage.pagination.page || 1) + 1;
      }
      const loaded = lastPage.recentArticles?.length ?? 0;
      const total = lastPage.stats?.articleCount ?? 0;
      // توافق مع ردود قديمة بلا pagination
      if (!lastPage.pagination && loaded >= PAGE_SIZE && loaded < total) {
        return 2;
      }
      return undefined;
    },
    enabled: name.length >= 2,
    staleTime: 5 * 60 * 1000,
  });

  const firstPage = data?.pages?.[0];
  const articles = (data?.pages ?? []).flatMap((p) =>
    Array.isArray(p.recentArticles) ? p.recentArticles : [],
  );

  useEffect(() => {
    document.title = firstPage?.author.name
      ? `${firstPage.author.name} — كاتب في سبق`
      : name
        ? `${name} — كاتب في سبق`
        : "كاتب — سبق";
  }, [firstPage?.author.name, name]);

  useCanonical(name ? `https://sabq.org${pageHref(pageNumber)}` : null);

  return (
    <div className="public-page min-h-screen bg-background flex flex-col" dir="rtl">
      <Header user={user || undefined} />
      <NavigationBar />

      <main className="flex-1">
        {isLoading ? (
          <div className="container max-w-6xl mx-auto px-4 py-10 space-y-10">
            <div className="flex items-center gap-5 animate-pulse">
              <div className="h-20 w-20 rounded-full bg-muted shrink-0" />
              <div className="space-y-3 flex-1 max-w-md">
                <div className="h-7 bg-muted rounded w-2/3" />
                <div className="h-4 bg-muted rounded w-1/3" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-48 rounded-xl bg-muted/50 animate-pulse" />
              ))}
            </div>
          </div>
        ) : error || !firstPage ? (
          <div className="container max-w-xl mx-auto px-4 py-20 text-center space-y-3">
            <h1 className="text-2xl font-bold">الكاتب غير موجود</h1>
            <p className="text-muted-foreground text-sm">
              لم نتمكّن من العثور على كاتب بهذا الاسم.
            </p>
            <Link href="/opinion" className="text-primary text-sm font-semibold hover:underline inline-block">
              العودة إلى مقالات الرأي
            </Link>
          </div>
        ) : (
          <>
            <section className="public-page-header border-b border-border bg-muted/30">
              <div className="container max-w-6xl mx-auto px-4 py-8 sm:py-10">
                <div className="flex flex-col sm:flex-row sm:items-start gap-5 sm:gap-7">
                  <Avatar className="h-20 w-20 sm:h-24 sm:w-24 shrink-0 border border-border">
                    {firstPage.author.avatarUrl ? (
                      <AvatarImage
                        src={firstPage.author.avatarUrl}
                        alt={firstPage.author.name}
                        className="object-cover"
                      />
                    ) : null}
                    <AvatarFallback className="bg-background text-foreground text-xl font-bold">
                      {initialsOf(firstPage.author.name)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="min-w-0 space-y-2">
                    <h1
                      className="public-page-title text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight"
                      data-testid="text-author-page-name"
                    >
                      {firstPage.author.name}
                    </h1>
                    <p className="text-sm text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="inline-flex items-center gap-1.5">
                        <PenLine className="h-3.5 w-3.5" />
                        {firstPage.author.role || "كاتب في سبق"}
                      </span>
                      <span className="text-border">·</span>
                      <span className="tabular-nums">
                        {firstPage.stats.articleCount.toLocaleString("en-US")} مقال
                      </span>
                    </p>
                    {firstPage.author.bio ? (
                      <p className="text-sm sm:text-base text-muted-foreground leading-7 max-w-2xl pt-1">
                        {firstPage.author.bio}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>

            <section className="container max-w-6xl mx-auto px-4 py-8 sm:py-10">
              {pageNumber > 1 && <a href={pageHref(pageNumber - 1)} rel="prev" className="inline-block mb-4 text-primary">الصفحة السابقة</a>}
              <h2 className="text-lg font-bold mb-6">أحدث المقالات</h2>

              {articles.length === 0 ? (
                <p className="text-sm text-muted-foreground py-12 text-center">
                  لا مقالات منشورة بعد
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {articles.map((article) => article.articleType === "opinion" ? (
                      <OpinionCard
                        key={article.id}
                        variant="grid"
                        article={{
                          ...article,
                          author: {
                            name: firstPage.author.name,
                            profileImageUrl: firstPage.author.avatarUrl,
                          },
                        }}
                      />
                    ) : (
                      <NewsArticleCard
                        key={article.id}
                        article={{
                          ...article,
                          articleType: "news",
                          category: undefined,
                        } as unknown as ArticleWithDetails}
                        viewMode="grid"
                        metadata={{ views: true }}
                      />
                    ))}
                  </div>

                  {hasNextPage ? (
                    <div className="flex justify-center items-center gap-4 pt-10">
                      <a href={pageHref((data?.pages.at(-1)?.pagination?.page || pageNumber) + 1)} rel="next" className="text-primary">الصفحة التالية</a>
                      <Button
                        variant="outline"
                        onClick={() => fetchNextPage()}
                        disabled={isFetchingNextPage}
                        data-testid="button-author-load-more"
                      >
                        {isFetchingNextPage ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin ms-2" />
                            جاري التحميل…
                          </>
                        ) : (
                          `عرض المزيد (${articles.length} من ${firstPage.stats.articleCount.toLocaleString("en-US")})`
                        )}
                      </Button>
                    </div>
                  ) : articles.length > 0 ? (
                    <p className="text-center text-xs text-muted-foreground pt-8">
                      عرض {articles.length.toLocaleString("en-US")} مقال
                    </p>
                  ) : null}
                </>
              )}
            </section>
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}
