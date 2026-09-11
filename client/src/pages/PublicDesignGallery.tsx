import { ArticleSummary } from "@/components/public/ArticleSummary";
import { useState } from "react";
import type { ArticleWithDetails } from "@shared/schema";
import { NewsArticleCard } from "@/components/NewsArticleCard";
import { RecommendationsWidget } from "@/components/RecommendationsWidget";
import "@/styles/article-detail.css";
import { OpinionCard } from "@/components/public/OpinionCard";
import { PublicPage, PublicPageHeader, PublicSectionHeading, PublicState } from "@/components/public/PublicationLayout";

// Development-only acceptance surface: real components, deterministic examples,
// no account or content writes. Network actions are isolated by the E2E fixtures.
const sample = {
  id: "public-design-sample", slug: "public-design-sample", englishSlug: "public-design-sample",
  title: "السعودية تطوّر تجربة القراءة الرقمية وتتيح خدمات جديدة للمستفيدين في مختلف المناطق",
  excerpt: "نص تجريبي لمراجعة وضوح الموجز وتوازن المسافات، والتأكد من تطابق البطاقة نفسها في مختلف صفحات الصحيفة.",
  publishedAt: "2026-09-10T18:00:00Z", updatedAt: "2026-09-10T18:00:00Z",
  articleType: "news", newsType: "regular", views: 1240, commentsCount: 3,
  imageUrl: null, category: { id: "sample-local", slug: "saudi", nameAr: "محليات", nameEn: "Local", color: "#087dbb" },
} as unknown as ArticleWithDetails;
const sidebarImage = `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#087dbb"/><circle cx="160" cy="90" r="60" fill="#f4f8fb"/></svg>')}`;
const opinion = { id: "public-opinion-sample", slug: "public-opinion-sample", title: "القراءة الجيدة تبدأ بتفاصيل صغيرة", excerpt: "كيف تساعد المسافات والخطوط الواضحة القارئ على الوصول إلى ما يهمه؟", publishedAt: sample.publishedAt as unknown as string, views: 1240, author: { name: "كاتب تجريبي", profileImageUrl: sidebarImage } };

export default function PublicDesignGallery() {
  const [summaryPlaying, setSummaryPlaying] = useState(false);
  const [locale, setLocale] = useState<"ar" | "en" | "ur">("ar");
  return <PublicPage dir={locale === "en" ? "ltr" : "rtl"}>
    <PublicPageHeader title="مرجع واجهة سبق" description="معاينة تطوير لمكوّنات الصحيفة الفعلية — المحتوى تجريبي.">
      <div className="public-filter-bar">
        <label htmlFor="gallery-locale">اللغة</label>
        <select id="gallery-locale" className="public-action" value={locale} onChange={e => setLocale(e.target.value as typeof locale)}>
          <option value="ar">العربية</option><option value="en">English</option><option value="ur">اردو</option>
        </select>
        <button className="public-action" onClick={() => document.documentElement.classList.toggle("dark")}>تبديل المظهر</button>
      </div>
    </PublicPageHeader>
    <main className="public-container py-8 space-y-12">
      <section aria-label="بطاقات الشبكة">
        <PublicSectionHeading title="الشبكة" />
        <div className="public-news-grid">
          <NewsArticleCard article={sample} viewMode="grid" locale={locale} metadata={{ views: true, comments: true }} />
          <NewsArticleCard article={{ ...sample, id: "short", title: "عنوان قصير", excerpt: null, category: undefined }} viewMode="grid" locale={locale} />
          <NewsArticleCard article={{ ...sample, id: "breaking", newsType: "breaking", aiGenerated: true }} viewMode="grid" locale={locale} />
        </div>
      </section>
      <section aria-label="بطاقات القائمة"><PublicSectionHeading title="القائمة والتفاعل" /><NewsArticleCard article={sample} viewMode="list" locale={locale} metadata={{ views: true }} /></section>
      <section aria-label="الصف المختصر"><PublicSectionHeading title="الصف المختصر" /><div className="public-news-compact-list"><NewsArticleCard article={sample} viewMode="compact" locale={locale} /></div></section>
      <section aria-label="بطاقة الإنفوجرافيك"><PublicSectionHeading title="الإنفوجرافيك" /><NewsArticleCard article={{ ...sample, id: "infographic", articleType: "infographic" }} viewMode="compact" locale={locale} /></section>
      <section aria-label="تصنيف اللغات"><NewsArticleCard article={{ ...sample, id: "localized-category", category: { id: "localized-only", name: locale === "ur" ? "مقامی خبریں" : "Local section" } as unknown as ArticleWithDetails["category"] }} viewMode="grid" locale={locale} /></section>
      <section aria-label="بطاقات الرأي" className="public-surface rounded-2xl p-6"><PublicSectionHeading title="الرأي" /><div className="public-news-grid"><OpinionCard article={opinion} variant="home" /><OpinionCard article={opinion} variant="grid" /><OpinionCard article={opinion} variant="sidebar" /></div></section>
      <section className="article-detail" aria-label="بطاقات الأخبار الجانبية">
        <div className="article-detail-sidebar article-sidebar-related w-full max-w-[340px]">
          <RecommendationsWidget editorial title="أخبار مشابهة" articles={[{ ...sample, id: "sidebar-layout", imageUrl: sidebarImage }]} />
        </div>
      </section>
      <section className="article-detail max-w-3xl" aria-label="الموجز المشترك">
        <ArticleSummary text={Array.from({length: 5}, (_, i) => `${i === 0 ? "• " : i === 1 ? "2) " : ""}فقرة ${i + 1}: هذا نص تجريبي طويل للموجز، يوضح كيف يتم عرض المحتوى كاملًا عند التوسيع مع الحفاظ على المعنى والأرقام 2024 والمسافات بين الفقرات.`).join("\n\n")} audioProvider={null} isLoadingAudio={false} isPlaying={summaryPlaying} onPlayAudio={() => setSummaryPlaying(value => !value)} />
      </section>
      <section className="article-detail max-w-3xl" aria-label="الموجز القصير">
        <ArticleSummary text="موجز قصير وواضح." audioProvider={null} isLoadingAudio={false} isPlaying={false} onPlayAudio={() => {}} />
      </section>
      <section aria-label="حالات المحتوى"><PublicState title="لا توجد أخبار ضمن هذا الاختيار">جرّب تصنيفًا آخر أو عدّل البحث.</PublicState></section>
    </main>
  </PublicPage>;
}
