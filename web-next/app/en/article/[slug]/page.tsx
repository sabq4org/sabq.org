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
  const bundle = await getArticleSeoBundle(slug, "en");
  if (!bundle) {
    return { title: "Not found", robots: { index: false, follow: true } };
  }
  return articleMetadata(bundle.meta);
}

export default async function EnglishArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const bundle = await getArticleSeoBundle(slug, "en");
  if (!bundle) notFound();
  return <ArticleView bundle={bundle} lang="en" />;
}
