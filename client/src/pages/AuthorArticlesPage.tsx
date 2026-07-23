/**
 * صفحة الكاتب العامة — /author/:name
 * تطابق تجربة iOS AuthorArticlesView: بطل + إحصاءات + قائمة مقالات.
 */
import { useEffect } from "react";
import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/Header";
import { NavigationBar } from "@/components/NavigationBar";
import { Footer } from "@/components/Footer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useCanonical } from "@/hooks/useCanonical";
import { apiUrl } from "@/lib/queryClient";
import { BookOpen, Eye, FileText, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { arSA } from "date-fns/locale";

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
    earliestPublish: string | null;
  };
  topCategories: Array<{ id: string; nameAr: string; count: number; color: string | null }>;
  recentArticles: Array<{
    id: string;
    title: string;
    excerpt: string | null;
    slug: string;
    englishSlug: string | null;
    articleType: string | null;
    imageUrl: string | null;
    publishedAt: string | null;
    views: number;
    categoryNameAr: string | null;
  }>;
};

function articleHref(a: AuthorPage["recentArticles"][number]): string {
  const slug = a.englishSlug || a.slug;
  return a.articleType === "opinion" ? `/opinion/${slug}` : `/article/${slug}`;
}

function initialsOf(name: string): string {
  return name.trim().slice(0, 2) || "س";
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
        apiUrl(`/api/authors/by-name?name=${encodeURIComponent(name)}&limit=30`),
        { credentials: "include" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "تعذر جلب الكاتب");
      }
      return res.json();
    },
    enabled: name.length >= 2,
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
  const cats = Array.isArray(data?.topCategories) ? data.topCategories : [];

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <Header user={user || undefined} />
      <NavigationBar />

      <main className="flex-1 container max-w-3xl mx-auto px-4 py-8 sm:py-10">
        {isLoading ? (
          <div className="space-y-6">
            <div className="flex flex-col items-center gap-4">
              <Skeleton className="h-24 w-24 rounded-full" />
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-full max-w-md" />
            </div>
            <div className="flex justify-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> جارٍ تحميل صفحة الكاتب…
            </div>
          </div>
        ) : error || !data ? (
          <div className="rounded-xl border border-border bg-card p-10 text-center space-y-3">
            <h1 className="text-2xl font-bold">الكاتب غير موجود</h1>
            <p className="text-muted-foreground text-sm">
              لم نتمكّن من العثور على كاتب بهذا الاسم.
            </p>
            <Link href="/opinion" className="text-primary text-sm font-semibold hover:underline">
              العودة إلى مقالات الرأي
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            <section className="rounded-2xl border border-border bg-card p-6 sm:p-8 text-center space-y-4">
              <Avatar className="h-24 w-24 mx-auto ring-4 ring-primary/15">
                {data.author.avatarUrl ? (
                  <AvatarImage src={data.author.avatarUrl} alt={data.author.name} className="object-cover" />
                ) : null}
                <AvatarFallback className="bg-primary/10 text-primary text-2xl">
                  {initialsOf(data.author.name)}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-2">
                <h1 className="text-2xl sm:text-3xl font-black" data-testid="text-author-page-name">
                  {data.author.name}
                </h1>
                {data.author.role ? (
                  <Badge variant="secondary" className="font-medium">
                    {data.author.role}
                  </Badge>
                ) : null}
              </div>
              {data.author.bio ? (
                <p className="text-sm text-muted-foreground leading-7 max-w-xl mx-auto">
                  {data.author.bio}
                </p>
              ) : null}
            </section>

            <section className="grid grid-cols-2 gap-3">
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="rounded-lg bg-primary/10 p-2.5">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">المقالات</p>
                    <p className="text-xl font-bold tabular-nums">
                      {data.stats.articleCount.toLocaleString("en-US")}
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="rounded-lg bg-emerald-500/10 p-2.5">
                    <Eye className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">المشاهدات</p>
                    <p className="text-xl font-bold tabular-nums">
                      {data.stats.totalViews.toLocaleString("en-US")}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </section>

            {cats.length > 0 ? (
              <section className="flex flex-wrap gap-2 justify-center">
                {cats.map((c) => (
                  <Badge key={c.id} variant="outline" className="gap-1">
                    {c.nameAr}
                    <span className="text-muted-foreground tabular-nums">({c.count})</span>
                  </Badge>
                ))}
              </section>
            ) : null}

            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-bold">أحدث المقالات</h2>
              </div>
              {articles.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">لا مقالات منشورة بعد</p>
              ) : (
                <div className="space-y-3">
                  {articles.map((a) => (
                    <Link key={a.id} href={articleHref(a)}>
                      <Card className="hover-elevate active-elevate-2 cursor-pointer overflow-hidden">
                        <CardContent className="p-0 flex gap-3">
                          {a.imageUrl ? (
                            <img
                              src={a.imageUrl}
                              alt=""
                              className="h-24 w-28 sm:h-28 sm:w-36 object-cover shrink-0 bg-muted"
                              loading="lazy"
                            />
                          ) : (
                            <div className="h-24 w-28 sm:h-28 sm:w-36 shrink-0 bg-muted" />
                          )}
                          <div className="min-w-0 flex-1 py-3 pe-3 space-y-1">
                            {a.categoryNameAr || a.articleType === "opinion" ? (
                              <div className="flex flex-wrap gap-1.5">
                                {a.articleType === "opinion" ? (
                                  <Badge variant="secondary" className="text-[10px]">رأي</Badge>
                                ) : null}
                                {a.categoryNameAr ? (
                                  <Badge variant="outline" className="text-[10px]">{a.categoryNameAr}</Badge>
                                ) : null}
                              </div>
                            ) : null}
                            <h3 className="font-bold text-sm sm:text-base leading-snug line-clamp-2">
                              {a.title}
                            </h3>
                            <p className="text-[11px] text-muted-foreground flex flex-wrap gap-x-2">
                              {a.publishedAt ? (
                                <span>
                                  {formatDistanceToNow(new Date(a.publishedAt), {
                                    addSuffix: true,
                                    locale: arSA,
                                  })}
                                </span>
                              ) : null}
                              <span className="tabular-nums">
                                {(a.views || 0).toLocaleString("en-US")} مشاهدة
                              </span>
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
