import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ServiceDateView } from "@/components/ServiceDateView";
import { serverApiFetch } from "@/lib/apiUrl";
import {
  relatedArticlesFromKeyword,
  relatedArticlesFromSearch,
  type RelatedArticleLink,
  type ServicePageModel,
} from "@/lib/servicePage";

export const revalidate = 60;
export const dynamicParams = true;

async function loadModel(id: string): Promise<ServicePageModel | null> {
  const res = await serverApiFetch(`/api/service-pages/${encodeURIComponent(id)}`, { next: { revalidate: 60 } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`service page ${res.status}`);
  return res.json() as Promise<ServicePageModel>;
}

async function loadRelated(model: ServicePageModel): Promise<RelatedArticleLink[]> {
  const query = model.relatedQuery?.trim();
  if (!query) return [];
  try {
    const path = model.relatedSource === "keyword"
      ? `/api/keyword/${encodeURIComponent(query)}`
      : `/api/search?q=${encodeURIComponent(query)}&limit=6`;
    const res = await serverApiFetch(path, { next: { revalidate: 60 } });
    if (!res.ok) return [];
    const payload = await res.json();
    return model.relatedSource === "keyword"
      ? relatedArticlesFromKeyword(payload)
      : relatedArticlesFromSearch(payload);
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const model = await loadModel(id);
  if (!model) return { title: "غير موجود", robots: { index: false, follow: false } };
  return {
    title: { absolute: model.title },
    description: model.description,
    alternates: { canonical: model.canonical },
    robots: { index: false, follow: false },
    openGraph: {
      type: "website",
      title: model.title,
      description: model.description,
      url: model.canonical,
      siteName: "سبق",
      locale: "ar_SA",
      images: [{ url: model.ogImage, width: 1200, height: 630 }],
    },
  };
}

export default async function ServiceDatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const model = await loadModel(id);
  if (!model) notFound();
  const related = await loadRelated(model);
  return <ServiceDateView model={model} related={related} />;
}
