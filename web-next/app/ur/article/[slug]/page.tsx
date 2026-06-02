import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticleView } from "@/components/ArticleView";
import { articleMetadata } from "@/lib/articleMetadata";
import { getArticleSeoBundle } from "@/lib/seoBundle";

export const revalidate = 60;
export const dynamicParams = true;

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const bundle = await getArticleSeoBundle(params.slug, "ur");
  if (!bundle) {
    return { title: "غير موجود", robots: { index: false, follow: true } };
  }
  return articleMetadata(bundle.meta);
}

export default async function UrduArticlePage({
  params,
}: {
  params: { slug: string };
}) {
  const bundle = await getArticleSeoBundle(params.slug, "ur");
  if (!bundle) notFound();
  return <ArticleView bundle={bundle} lang="ur" />;
}
