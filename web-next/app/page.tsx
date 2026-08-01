import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ArticleCard } from "@/components/ArticleCard";
import { getHomeBundle, type HomeBundle } from "@/lib/seoBundle";

export const revalidate = 60;

export const metadata: Metadata = {
  title: { absolute: "سبق الذكية - صحيفة سبق الإلكترونية" },
  description:
    "سبق الذكية - منصة الأخبار السعودية الأولى المدعومة بالذكاء الاصطناعي. أخبار عاجلة ومحلية ورياضية وعالمية على مدار الساعة.",
  alternates: { canonical: "https://sabq.org" },
  robots:
    process.env.STAGING_NO_INDEX === "true"
      ? { index: false, follow: false, nocache: true }
      : { index: true, follow: true },
};

const EMPTY_HOME: HomeBundle = {
  canonical: process.env.PUBLIC_SITE_URL || "https://sabq.org",
  articles: [],
  sections: [],
};

export default async function HomePage() {
  // The homepage is a singleton (no per-URL slug). Unlike article/category
  // pages it should never hard-fail the whole site if the API is briefly
  // unreachable (or not yet deployed) — render an empty shell and let ISR
  // refill it within `revalidate` seconds.
  let bundle: HomeBundle;
  try {
    bundle = await getHomeBundle();
  } catch (err) {
    console.error("[home] bundle fetch failed, rendering empty shell:", err);
    bundle = EMPTY_HOME;
  }

  const siteUrl = process.env.PUBLIC_SITE_URL || "https://sabq.org";
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "سبق الذكية",
      url: siteUrl,
      potentialAction: {
        "@type": "SearchAction",
        target: `${siteUrl}/search?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "أحدث الأخبار على سبق",
      itemListElement: bundle.articles.slice(0, 30).map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `${siteUrl}${item.href}`,
        name: item.title,
      })),
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
        <h1 className="sr-only">سبق — أحدث الأخبار</h1>

        {bundle.sections.length > 0 && (
          <nav aria-label="الأقسام" className="mb-6 flex flex-wrap gap-2">
            {bundle.sections.slice(0, 14).map((s) => (
              <a
                key={s.href}
                href={s.href}
                className="rounded-full border border-border bg-card px-3.5 py-1.5 text-sm font-medium text-foreground transition-colors hover:border-primary hover:text-primary"
              >
                {s.title}
              </a>
            ))}
          </nav>
        )}

        <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {bundle.articles.map((item, i) => (
            <ArticleCard key={item.href} item={item} priority={i === 0} />
          ))}
        </section>
      </main>
      <SiteFooter sections={bundle.sections} />
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
