import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ArticleCard } from "@/components/ArticleCard";
import { getHomeBundle, type HomeBundle } from "@/lib/seoBundle";
import { NewsletterSignup } from "@/components/NewsletterSignup";
import { INLINE_NEWSLETTER_SIGNUP_ENABLED } from "@/lib/newsletter";

export const revalidate = 60;

const HOME_TITLE = "سبق الذكية - صحيفة سبق الإلكترونية";
const HOME_DESCRIPTION =
  "سبق الذكية - منصة الأخبار السعودية الأولى المدعومة بالذكاء الاصطناعي. أخبار عاجلة ومحلية ورياضية وعالمية على مدار الساعة.";
// بطاقة المشاركة الأفقية المعتمدة (1200×630)، نفسها في client/index.html.
const HOME_OG_IMAGE = "https://sabq.org/branding/sabq-og-image.png";

// نسخة الزواحف من الرئيسية هي ما تقرؤه facebookexternalhit وTwitterbot
// وواتساب؛ بدون og/twitter كانت معاينة مشاركة الرئيسية بلا صورة ولا عنوان.
export const metadata: Metadata = {
  title: { absolute: HOME_TITLE },
  description: HOME_DESCRIPTION,
  alternates: {
    canonical: "https://sabq.org",
    types: { "application/rss+xml": "https://sabq.org/api/rss/articles" },
  },
  robots:
    process.env.STAGING_NO_INDEX === "true"
      ? { index: false, follow: false, nocache: true }
      : { index: true, follow: true, "max-image-preview": "large" },
  openGraph: {
    type: "website",
    url: "https://sabq.org",
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    siteName: "صحيفة سبق الإلكترونية",
    locale: "ar_SA",
    images: [{ url: HOME_OG_IMAGE, width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    site: "@sabq",
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    images: [HOME_OG_IMAGE],
  },
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
    // مطابق لمخطط المؤسسة في client/index.html (نسخة المتصفح)؛ كان غائبًا
    // عن نسخة الزواحف فلا يرى Google كيان الصحيفة من الرئيسية.
    {
      "@context": "https://schema.org",
      "@type": "NewsMediaOrganization",
      name: "صحيفة سبق الإلكترونية",
      alternateName: "Sabq",
      url: siteUrl,
      logo: { "@type": "ImageObject", url: HOME_OG_IMAGE, width: 1200, height: 630 },
      sameAs: [
        "https://x.com/sabqorg",
        "https://www.facebook.com/sabq.org",
        "https://www.instagram.com/sabqorg",
        "https://youtube.com/@sabqorg",
        "https://www.tiktok.com/@sabqorg",
        "https://www.linkedin.com/in/sabqorg",
        "https://whatsapp.com/channel/0029VaCUMDGEAKWA2soRAl02",
      ],
      description: "سبق الذكية - منصة الأخبار السعودية الأولى المدعومة بالذكاء الاصطناعي",
      foundingDate: "2007",
      areaServed: { "@type": "Country", name: "المملكة العربية السعودية" },
      publishingPrinciples: `${siteUrl}/about`,
    },
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
          {bundle.articles.slice(0, 6).map((item, i) => (
            <ArticleCard key={item.href} item={item} priority={i === 0} />
          ))}
        </section>
        {INLINE_NEWSLETTER_SIGNUP_ENABLED && <NewsletterSignup source="home-first-group" />}
        {bundle.articles.length > 6 && <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {bundle.articles.slice(6).map((item) => <ArticleCard key={item.href} item={item} />)}
        </section>}
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
