/** خرائط هدهد — أسلوب MapLibre للواجهة. المفتاح من البيئة فقط، لا يُثبَّت في المستودع. */

export const HUDHUD_STYLE_HOST = "https://b.hudhud.sa";
export const HUDHUD_DEFAULT_MAP_ID = "default";

export type HudhudMapVariant = "light" | "dark";
export type HudhudMapLang = "ar" | "en";

export function isHudhudPublishableKey(key: string | undefined | null): boolean {
  return typeof key === "string" && key.trim().startsWith("pk_");
}

export function buildHudhudStyleUrl(opts: {
  apiKey: string;
  mapId?: string;
  variant?: HudhudMapVariant;
  lang?: HudhudMapLang;
}): string | null {
  const apiKey = opts.apiKey.trim();
  if (!isHudhudPublishableKey(apiKey)) return null;
  const mapId = (opts.mapId ?? HUDHUD_DEFAULT_MAP_ID).trim() || HUDHUD_DEFAULT_MAP_ID;
  const params = new URLSearchParams({
    variant: opts.variant ?? "light",
    lang: opts.lang ?? "ar",
    api_key: apiKey,
  });
  return `${HUDHUD_STYLE_HOST}/v1/maps/styles/${encodeURIComponent(mapId)}?${params}`;
}

export function getHudhudBrowserStyleUrl(opts?: {
  variant?: HudhudMapVariant;
  lang?: HudhudMapLang;
}): string | null {
  return buildHudhudStyleUrl({
    apiKey: String(import.meta.env.VITE_HUDHUD_PUBLISHABLE_KEY ?? ""),
    mapId: String(import.meta.env.VITE_HUDHUD_MAP_ID ?? HUDHUD_DEFAULT_MAP_ID),
    variant: opts?.variant,
    lang: opts?.lang,
  });
}
