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
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const bundle = await getArticleSeoBundle(slug, "ur");
  if (!bundle) {
    return { title: "غير موجود", robots: { index: false, follow: true } };
  }
  return articleMetadata(bundle.meta);
}

export default async function UrduArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const bundle = await getArticleSeoBundle(slug, "ur");
  if (!bundle) notFound();
  return <ArticleView bundle={bundle} lang="ur" />;
}
