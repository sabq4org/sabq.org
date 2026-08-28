/**
 * إعلانات ساما الرسمية (قائمة الأخبار في المركز الإعلامي) — لرصدها فور صدورها.
 */
import { parseSamaDate, portalHandlerUrl, samaGetJson, SAMA_ORIGIN } from "./samaClient";

export interface SamaNewsItem {
  id: number;
  title: string;
  summary: string;
  publishedAt: string | null; // ISO day
  url: string;
  imageUrl: string | null;
}

interface RawNews {
  ID?: number;
  Title?: string;
  Comments?: string;
  SAMAPublishingDate?: string;
  SAMAThumbnailImage?: string;
  FileLeafRef?: string;
}

export async function fetchSamaNews(): Promise<SamaNewsItem[]> {
  const url = portalHandlerUrl({
    op: "LoadItems",
    listUrl: "/ar-sa/MediaCenter/News/Pages",
    viewName: "HomeNews",
    lang: "ar",
    calType: "miladi",
    df: "dd/MM/yyyy",
  });
  const raw = await samaGetJson<unknown>(url);
  if (!Array.isArray(raw)) throw new Error("SAMA news: response is not an array");
  const out: SamaNewsItem[] = [];
  for (const r of raw as RawNews[]) {
    if (typeof r.ID !== "number" || !r.Title || !r.FileLeafRef) continue;
    const img = r.SAMAThumbnailImage?.match(/src="([^"]+)"/)?.[1] ?? null;
    out.push({
      id: r.ID,
      title: r.Title.trim(),
      summary: (r.Comments ?? "").trim(),
      publishedAt: parseSamaDate(r.SAMAPublishingDate),
      url: `${SAMA_ORIGIN}/ar-sa/news/pages/${r.FileLeafRef}`,
      imageUrl: img ? (img.startsWith("http") ? img : SAMA_ORIGIN + encodeURI(img)) : null,
    });
  }
  return out;
}
