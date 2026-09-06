import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ArticleCard } from "@/components/ArticleCard";
import { getCategoryBundle } from "@/lib/seoBundle";

export const revalidate = 60;
export const dynamicParams = true;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const bundle = await getCategoryBundle(slug);
  if (!bundle) {
    return { title: "غير موجود", robots: { index: false, follow: true } };
  }
  return {
    title: { absolute: `${bundle.name} | سبق` },
    description: bundle.description,
    alternates: { canonical: bundle.canonical },
    robots:
      process.env.STAGING_NO_INDEX === "true"
        ? { index: false, follow: false, nocache: true }
        : { index: true, follow: true },
    openGraph: {
      type: "website",
      title: `${bundle.name} | سبق`,
      description: bundle.description,
      url: bundle.canonical,
      siteName: "صحيفة سبق الإلكترونية",
      locale: "ar_SA",
    },
  };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const bundle = await getCategoryBundle(slug);
  if (!bundle) notFound();
  const siteUrl = process.env.PUBLIC_SITE_URL || "https://sabq.org";
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: bundle.name,
      description: bundle.description,
      url: bundle.canonical,
      inLanguage: "ar",
      isPartOf: {
        "@type": "WebSite",
        name: "سبق الذكية",
        url: siteUrl,
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: `أحدث الأخبار في ${bundle.name}`,
      itemListElement: bundle.articles.slice(0, 30).map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `${siteUrl}${item.href}`,
        name: item.title,
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "الرئيسية",
          item: siteUrl,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: bundle.name,
          item: bundle.canonical,
        },
      ],
    },
  ];

  return (
    <>
      <SiteHeader />
      <main
        id="main-content"
        role="main"
        dir="rtl"
        className="container mx-auto px-4 py-6 sm:px-6 lg:px-8"
      >
        <header className="mb-6 border-b pb-4">
          <h1 className="flex items-center gap-2 text-3xl font-bold text-foreground md:text-4xl">
            {bundle.color && (
              <span
                aria-hidden="true"
                className="inline-block h-6 w-1.5 rounded-full"
                style={{ backgroundColor: bundle.color }}
              />
            )}
            {bundle.name}
          </h1>
          {bundle.description && (
            <p className="mt-2 text-muted-foreground">{bundle.description}</p>
          )}
        </header>

        {bundle.articles.length > 0 ? (
          <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {bundle.articles.map((item, i) => (
              <ArticleCard key={item.href} item={item} priority={i === 0} />
            ))}
          </section>
        ) : (
          <p className="text-muted-foreground">لا توجد مقالات حالياً.</p>
        )}
      </main>
      <SiteFooter />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />
    </>
  );
}

function safeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}
