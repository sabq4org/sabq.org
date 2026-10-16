/**
 * ميتا صفحة الخدمة لقشرة SPA، بنفس عقد مقالات الحافة:
 * العنوان والوصف والصورة والمخطط، ومتن مخفي يُستبدل عند إقلاع الواجهة.
 */
import { getPublicPage } from "./mawaeedService";
import { servicePageById } from "@shared/servicePages/catalog";
import { presentServicePage } from "@shared/servicePages/present";
import { renderServiceSemanticHtml } from "@shared/servicePages/semanticHtml";

const HIDDEN =
  "position:absolute;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;";

export async function buildServicePageEdgeMeta(id: string): Promise<Record<string, unknown> | null> {
  const spec = servicePageById(id);
  if (!spec || spec.source.type !== "mawaeed") return null;
  const view = await getPublicPage(spec.source.seriesSlug, null);
  const model = view ? presentServicePage(spec.id, view) : null;
  if (!model) {
    return {
      title: "الصفحة غير موجودة | سبق",
      description: "",
      canonical: "",
      robots: "noindex, follow",
      status: 404,
    };
  }
  return {
    title: model.title,
    description: model.description,
    image: model.ogImage,
    imageWidth: 1200,
    imageHeight: 630,
    canonical: model.canonical,
    robots: "index,follow",
    type: "website",
    locale: "ar_SA",
    siteName: "سبق",
    modifiedTime: model.dateModified,
    jsonLd: model.jsonLd,
    semanticHtml: `<section style="${HIDDEN}" aria-hidden="true">${renderServiceSemanticHtml(model)}</section>`,
  };
}
