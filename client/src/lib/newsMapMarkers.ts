export type NewsMapArticle = {
  id: string;
  title: string;
  slug: string;
  englishSlug: string | null;
  imageUrl: string | null;
  publishedAt: string | null;
};

export type NewsMapLocation = {
  key: string;
  name: string;
  nameEn: string;
  country: string;
  lat: number;
  lng: number;
  count: number;
  articles: NewsMapArticle[];
};

export const NEWS_MAP_COUNTRY_COLORS: Record<string, string> = {
  SA: "#16a34a",
  AE: "#2563eb",
  EG: "#ea580c",
  KW: "#7c3aed",
  BH: "#dc2626",
  QA: "#0891b2",
  OM: "#ca8a04",
  JO: "#0d9488",
  LB: "#e11d48",
  IQ: "#854d0e",
  SY: "#4f46e5",
  YE: "#059669",
  PS: "#15803d",
  LY: "#9333ea",
  SD: "#b91c1c",
  TN: "#0369a1",
  DZ: "#65a30d",
  MA: "#c2410c",
  US: "#1d4ed8",
  GB: "#6d28d9",
  FR: "#0284c7",
  DE: "#d97706",
  CN: "#dc2626",
  RU: "#4338ca",
  TR: "#e11d48",
  IR: "#047857",
  IL: "#1e40af",
};

export function newsMapCountryColor(country: string): string {
  return NEWS_MAP_COUNTRY_COLORS[country?.toUpperCase()] || "#6b7280";
}

export function newsMapMarkerRadius(count: number): number {
  if (count <= 1) return 6;
  if (count <= 3) return 9;
  if (count <= 5) return 12;
  if (count <= 10) return 15;
  return 18;
}

export function escapeNewsMapHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

export function newsMapPopupHtml(location: NewsMapLocation): string {
  const title = escapeNewsMapHtml(location.name || location.nameEn);
  const countLabel = location.count === 1 ? "خبر" : "أخبار";
  const articles = (location.articles ?? [])
    .map((article) => {
      const href = `/article/${escapeNewsMapHtml(article.englishSlug || article.slug)}`;
      const img = article.imageUrl
        ? `<img src="${escapeNewsMapHtml(article.imageUrl)}" alt="" width="48" height="36" style="width:48px;height:36px;border-radius:4px;object-fit:cover;flex-shrink:0" />`
        : "";
      return `<a href="${href}" style="display:flex;gap:8px;align-items:flex-start;text-decoration:none;color:inherit">
        ${img}
        <span style="font-size:12px;line-height:1.5">${escapeNewsMapHtml(article.title)}</span>
      </a>`;
    })
    .join("");
  return `<div dir="rtl" style="min-width:200px;max-width:280px;font-family:inherit">
    <div style="font-weight:700;font-size:14px;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid rgba(0,0,0,.12)">
      ${title}
      <span style="font-weight:400;font-size:12px;opacity:.7;margin-right:8px">(${location.count} ${countLabel})</span>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px">${articles}</div>
  </div>`;
}
