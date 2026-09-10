import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useCanonical } from "@/hooks/useCanonical";
import { apiUrl } from "@/lib/queryClient";
import { NewsArticleCard } from "./NewsArticleCard";
import type { ArticleWithDetails } from "@shared/schema";

type Archive = {
  name: string;
  description: string;
  canonical: string;
  articles: { href: string; title: string; excerpt: string; imageUrl: string | null; publishedAt: string | null }[];
  pagination: { previousHref: string | null; nextHref: string | null };
};

/** Explicit archive pages use the same ordered public bundle as crawler SSR. */
export function CategoryArchivePage({ slug, page }: { slug: string; page: number | null }) {
  const { data, isLoading, error } = useQuery<Archive>({
    queryKey: ["category-archive", slug, page],
    enabled: page !== null,
    queryFn: async ({ signal }) => {
      const response = await fetch(apiUrl(`/api/categories/${encodeURIComponent(slug)}/seo-bundle?limit=30&page=${page}`), { signal });
      if (!response.ok) throw new Error("تعذر تحميل صفحة الأرشيف");
      return response.json();
    },
  });
  useCanonical(data?.canonical || null);
  useEffect(() => {
    if (data) document.title = `${data.name}${page && page > 1 ? ` — الصفحة ${page}` : ""} | سبق`;
  }, [data, page]);
  return <div dir="rtl" className="public-page min-h-screen flex flex-col bg-background">
    <Header />
    <main id="main-content" className="public-container py-8 flex-1">
      {isLoading ? <p role="status">جاري تحميل الأخبار…</p> : error || !data || page === null ? <><h1 className="text-2xl font-bold">تعذر عرض صفحة الأرشيف</h1><a href={`/category/${encodeURIComponent(slug)}`} className="text-primary">العودة إلى القسم</a></> : <>
        <header className="public-page-header mb-8"><h1 className="public-page-title">{data.name}</h1>
        <p className="public-page-description">{data.description}</p></header>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* SEO bundles expose canonical links, not database IDs. Grid cards
              use the explicit href and have no bookmark/mutation controls. */}
          {data.articles.map(article => <NewsArticleCard
            key={article.href}
            href={article.href}
            article={{ ...article, id: article.href, slug: article.href, articleType: "news", newsType: "regular" } as unknown as ArticleWithDetails}
            viewMode="grid"
          />)}
        </div>
        <nav aria-label="صفحات أخبار القسم" className="mt-8 flex justify-between gap-4">
          {data.pagination.previousHref ? <a href={data.pagination.previousHref} rel="prev" className="text-primary">الصفحة السابقة</a> : <span />}
          {data.pagination.nextHref && <a href={data.pagination.nextHref} rel="next" className="text-primary">الصفحة التالية</a>}
        </nav>
      </>}
    </main>
    <Footer />
  </div>;
}
