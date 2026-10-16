import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ServiceDateView } from "@/components/ServiceDateView";
import { serverApiFetch } from "@/lib/apiUrl";
import {
  RELATED_FETCH_LIMIT,
  relatedArticlesFromKeyword,
  relatedArticlesFromSearch,
  serviceModelPath,
  type RelatedArticleLink,
  type ServicePageModel,
} from "@/lib/servicePage";

export const revalidate = 60;
export const dynamicParams = true;

async function loadModel(id: string, region?: string): Promise<ServicePageModel | null> {
  const res = await serverApiFetch(serviceModelPath(id, region), { next: { revalidate: 60 } });
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
      : `/api/search?q=${encodeURIComponent(query)}&limit=${RELATED_FETCH_LIMIT}`;
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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const { id } = await params;
  const query = await searchParams;
  const rawRegion = query.region;
  const region = Array.isArray(rawRegion) ? rawRegion[0] : rawRegion;
  const model = await loadModel(id, region);
  if (!model) return { title: "غير موجود", robots: { index: false, follow: false } };
  return {
    title: { absolute: model.title },
    description: model.description,
    alternates: { canonical: model.canonical },
    robots: { index: true, follow: true, "max-image-preview": "large" },
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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const rawRegion = query.region;
  const region = Array.isArray(rawRegion) ? rawRegion[0] : rawRegion;
  const model = await loadModel(id, region);
  if (!model) notFound();
  const related = await loadRelated(model);
  return <ServiceDateView model={model} related={related} />;
}
