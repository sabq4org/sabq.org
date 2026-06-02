import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticleView } from "@/components/ArticleView";
import { articleMetadata } from "@/lib/articleMetadata";
import { getArticleSeoBundle } from "@/lib/seoBundle";

// ISR: regenerate at most once per minute. Cloudflare edge caches the HTML in
// front of this (s-maxage in next.config headers), so breaking-news edits go
// live within ~60s without a redeploy.
export const revalidate = 60;
export const dynamicParams = true;

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const bundle = await getArticleSeoBundle(params.slug, "ar");
  if (!bundle) {
    return { title: "غير موجود", robots: { index: false, follow: true } };
  }
  return articleMetadata(bundle.meta);
}

export default async function ArticlePage({
  params,
}: {
  params: { slug: string };
}) {
  const bundle = await getArticleSeoBundle(params.slug, "ar");
  if (!bundle) notFound();
  return <ArticleView bundle={bundle} lang="ar" />;
}
