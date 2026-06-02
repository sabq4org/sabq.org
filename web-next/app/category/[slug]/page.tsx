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
  params: { slug: string };
}): Promise<Metadata> {
  const bundle = await getCategoryBundle(params.slug);
  if (!bundle) {
    return { title: "غير موجود", robots: { index: false, follow: true } };
  }
  return {
    title: bundle.name,
    description: bundle.description,
    alternates: { canonical: bundle.canonical },
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
  params: { slug: string };
}) {
  const bundle = await getCategoryBundle(params.slug);
  if (!bundle) notFound();

  return (
    <>
      <SiteHeader />
      <main id="main-content" role="main" className="mx-auto max-w-5xl px-4 py-6">
        <header className="mb-6">
          <h1 className="text-3xl font-bold text-foreground md:text-4xl">
            {bundle.name}
          </h1>
          {bundle.description && (
            <p className="mt-2 text-muted-foreground">{bundle.description}</p>
          )}
        </header>

        {bundle.articles.length > 0 ? (
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {bundle.articles.map((item, i) => (
              <ArticleCard key={item.href} item={item} priority={i === 0} />
            ))}
          </section>
        ) : (
          <p className="text-muted-foreground">لا توجد مقالات حالياً.</p>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
