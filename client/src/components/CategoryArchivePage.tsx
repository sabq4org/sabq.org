import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useCanonical } from "@/hooks/useCanonical";
import { apiUrl } from "@/lib/queryClient";

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
  return <div dir="rtl" className="min-h-screen flex flex-col bg-background">
    <Header />
    <main id="main-content" className="container mx-auto max-w-6xl px-4 py-8 flex-1">
      {isLoading ? <p role="status">جاري تحميل الأخبار…</p> : error || !data || page === null ? <><h1 className="text-2xl font-bold">تعذر عرض صفحة الأرشيف</h1><a href={`/category/${encodeURIComponent(slug)}`} className="text-primary">العودة إلى القسم</a></> : <>
        <h1 className="text-3xl font-bold mb-3">{data.name}</h1>
        <p className="text-muted-foreground mb-8">{data.description}</p>
        <div className="grid gap-6 md:grid-cols-3">
          {data.articles.map(article => <article key={article.href} className="border rounded-lg overflow-hidden">
            <a href={article.href}>
              {article.imageUrl && <img src={article.imageUrl} alt={article.title} loading="lazy" className="w-full aspect-video object-cover" />}
              <div className="p-4"><h2 className="font-bold text-xl">{article.title}</h2><p className="mt-3 text-muted-foreground">{article.excerpt}</p></div>
            </a>
          </article>)}
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
