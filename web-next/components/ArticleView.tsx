import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ShareButtons } from "@/components/ShareButtons";
import type { SeoBundle, Lang } from "@/lib/seoBundle";

const LOCALE: Record<Lang, string> = {
  ar: "ar-SA",
  en: "en-US",
  ur: "ur-PK",
};

function formatDate(iso: string | null, lang: Lang): string {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat(LOCALE[lang], {
      dateStyle: "long",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

/**
 * Server-rendered article body shared by the Arabic, English and Urdu routes.
 * The full text + LCP image are present in the first byte of HTML; the only
 * hydrated island is <ShareButtons />.
 */
export function ArticleView({
  bundle,
  lang,
}: {
  bundle: SeoBundle;
  lang: Lang;
}) {
  const dir = lang === "en" ? "ltr" : "rtl";
  const published = formatDate(bundle.publishedAt, lang);
  const siteUrl = process.env.PUBLIC_SITE_URL || "https://sabq.org";
  const breadcrumbItems = [
    {
      "@type": "ListItem",
      position: 1,
      name: lang === "en" ? "Home" : lang === "ur" ? "سرورق" : "الرئيسية",
      item: siteUrl,
    },
    ...(bundle.category && bundle.categoryHref
      ? [
          {
            "@type": "ListItem",
            position: 2,
            name: bundle.category,
            item: `${siteUrl}${bundle.categoryHref}`,
          },
        ]
      : []),
    {
      "@type": "ListItem",
      position: bundle.category && bundle.categoryHref ? 3 : 2,
      name: bundle.title,
      item: bundle.meta.canonical,
    },
  ];
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbItems,
  };

  return (
    <>
      <SiteHeader />
      <main
        id="main-content"
        role="main"
        lang={lang}
        dir={dir}
        className="mx-auto max-w-3xl px-4 py-6"
      >
        <article>
          {bundle.category && bundle.categoryHref && (
            <a
              href={bundle.categoryHref}
              className="text-sm font-semibold text-primary"
            >
              {bundle.category}
            </a>
          )}

          <h1 className="mt-2 text-2xl font-bold leading-tight md:text-4xl">
            {bundle.title}
          </h1>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {bundle.author && <span>{bundle.author}</span>}
            {published && (
              <time dateTime={bundle.publishedAt ?? undefined}>{published}</time>
            )}
          </div>

          {bundle.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={bundle.imageUrl}
              alt={bundle.title}
              width={1200}
              height={675}
              loading="eager"
              fetchPriority="high"
              decoding="async"
              className="mt-4 aspect-[16/9] w-full rounded-lg object-cover"
            />
          )}

          {bundle.excerpt && (
            <p className="article-summary mt-4 text-lg font-medium text-foreground/90">
              {bundle.excerpt}
            </p>
          )}

          <div
            className={`prose prose-lg mt-6 max-w-none dark:prose-invert ${
              dir === "rtl" ? "text-right" : "text-left"
            }`}
            // contentHtml is sanitized server-side (stripUnsafeHtml in edgeMeta.ts).
            dangerouslySetInnerHTML={{ __html: bundle.contentHtml }}
          />

          <ShareButtons url={bundle.meta.canonical} title={bundle.title} />

          {bundle.categoryLatest && bundle.categoryLatest.length > 0 && (
            <section
              aria-labelledby="category-latest-heading"
              className="mt-10 border-t pt-6"
            >
              <h2
                id="category-latest-heading"
                className="text-xl font-bold text-foreground"
              >
                {bundle.category
                  ? `آخر أخبار ${bundle.category}`
                  : "آخر الأخبار ذات الصلة"}
              </h2>
              <ul className="mt-4 space-y-3">
                {bundle.categoryLatest.map((item) => (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      className="block rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary hover:text-primary"
                    >
                      <span className="font-semibold leading-relaxed">
                        {item.title}
                      </span>
                      {item.excerpt && (
                        <span className="mt-1 block text-sm text-muted-foreground">
                          {item.excerpt}
                        </span>
                      )}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </article>
      </main>
      <SiteFooter />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(bundle.jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }}
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
