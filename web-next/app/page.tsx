import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ArticleCard } from "@/components/ArticleCard";
import { getHomeBundle, type HomeBundle } from "@/lib/seoBundle";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "سبق",
  description: "منصة إخبارية ذكية مدعومة بالذكاء الاصطناعي",
  alternates: { canonical: "https://sabq.org" },
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
    </>
  );
}
