/**
 * صفحة الكاتب العامة — /author/:name
 * تصميم أقرب لقائمة الرأي: هيرو خفيف + شبكة عناوين (بدون صفوف صور مكدّسة).
 */
import { useEffect } from "react";
import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/Header";
import { NavigationBar } from "@/components/NavigationBar";
import { Footer } from "@/components/Footer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useCanonical } from "@/hooks/useCanonical";
import { apiUrl } from "@/lib/queryClient";
import { Eye, PenLine } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

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
  recentArticles: Array<{
    id: string;
    title: string;
    excerpt: string | null;
    slug: string;
    englishSlug: string | null;
    articleType: string | null;
    publishedAt: string | null;
    views: number;
  }>;
};

function articleHref(a: AuthorPage["recentArticles"][number]): string {
  const slug = a.englishSlug || a.slug;
  return a.articleType === "opinion" ? `/opinion/${slug}` : `/article/${slug}`;
}

function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2) || "س";
}

export default function AuthorArticlesPage() {
  const params = useParams<{ name?: string }>();
  const rawName = params.name ? decodeURIComponent(params.name) : "";
  const name = rawName.trim().replace(/\s+/g, " ");
  const { user } = useAuth();

  const { data, isLoading, error } = useQuery<AuthorPage>({
    queryKey: ["/api/authors/by-name", name],
    queryFn: async () => {
      const res = await fetch(
        apiUrl(`/api/authors/by-name?name=${encodeURIComponent(name)}&limit=12`),
        { credentials: "include" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "تعذر جلب الكاتب");
      }
      return res.json();
    },
    enabled: name.length >= 2,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    document.title = data?.author.name
      ? `${data.author.name} — كاتب في سبق`
      : name
        ? `${name} — كاتب في سبق`
        : "كاتب — سبق";
  }, [data?.author.name, name]);

  useCanonical(name ? `https://sabq.org/author/${encodeURIComponent(name)}` : null);

  const articles = Array.isArray(data?.recentArticles) ? data.recentArticles : [];

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
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
        ) : error || !data ? (
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
            <section className="border-b border-border bg-muted/30">
              <div className="container max-w-6xl mx-auto px-4 py-8 sm:py-10">
                <div className="flex flex-col sm:flex-row sm:items-start gap-5 sm:gap-7">
                  <Avatar className="h-20 w-20 sm:h-24 sm:w-24 shrink-0 border border-border">
                    {data.author.avatarUrl ? (
                      <AvatarImage
                        src={data.author.avatarUrl}
                        alt={data.author.name}
                        className="object-cover"
                      />
                    ) : null}
                    <AvatarFallback className="bg-background text-foreground text-xl font-bold">
                      {initialsOf(data.author.name)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="min-w-0 space-y-2">
                    <h1
                      className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight"
                      data-testid="text-author-page-name"
                    >
                      {data.author.name}
                    </h1>
                    <p className="text-sm text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="inline-flex items-center gap-1.5">
                        <PenLine className="h-3.5 w-3.5" />
                        {data.author.role || "كاتب في سبق"}
                      </span>
                      <span className="text-border">·</span>
                      <span className="tabular-nums">
                        {data.stats.articleCount.toLocaleString("en-US")} مقال
                      </span>
                    </p>
                    {data.author.bio ? (
                      <p className="text-sm sm:text-base text-muted-foreground leading-7 max-w-2xl pt-1">
                        {data.author.bio}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>

            <section className="container max-w-6xl mx-auto px-4 py-8 sm:py-10">
              <h2 className="text-lg font-bold mb-6">أحدث المقالات</h2>

              {articles.length === 0 ? (
                <p className="text-sm text-muted-foreground py-12 text-center">
                  لا مقالات منشورة بعد
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {articles.map((article) => (
                    <Link key={article.id} href={articleHref(article)}>
                      <Card
                        className="hover-elevate active-elevate-2 cursor-pointer h-full overflow-hidden flex flex-col"
                        data-testid={`card-author-article-${article.id}`}
                      >
                        <CardContent className="p-5 space-y-4 flex-1 flex flex-col">
                          <h3 className="font-bold text-xl line-clamp-3 text-foreground leading-snug">
                            {article.title}
                          </h3>

                          {article.publishedAt ? (
                            <p className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(article.publishedAt), {
                                addSuffix: true,
                                locale: ar,
                              })}
                            </p>
                          ) : null}

                          {article.excerpt ? (
                            <p className="text-sm text-muted-foreground line-clamp-2 flex-1">
                              {article.excerpt}
                            </p>
                          ) : (
                            <div className="flex-1" />
                          )}

                          <div className="flex items-center gap-1 text-xs text-muted-foreground pt-2 border-t border-border">
                            <Eye className="h-3 w-3" />
                            <span className="tabular-nums">
                              {(article.views || 0).toLocaleString("en-US")}
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}
