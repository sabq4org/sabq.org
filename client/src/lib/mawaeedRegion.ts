import { normalizeRegion, type RegionId } from "@shared/mawaeed/model";

/** المفتاح نفسه الذي تقرؤه صفحة التقويم الدراسي وسطر الرئيسية، حتى تتبع اختيار القارئ. */
export const REGION_PREF_ID = "mawaeed-region";

/** المنطقة من الرابط أولاً ثم من آخر اختيار محفوظ. الرياض افتراضية. */
export function readRegion(search: string): RegionId {
  const fromUrl = new URLSearchParams(search).get("region");
  try {
    if (fromUrl) {
      const region = normalizeRegion(fromUrl);
      window.localStorage.setItem(REGION_PREF_ID, region);
      return region;
    }
    return normalizeRegion(window.localStorage.getItem(REGION_PREF_ID));
  } catch {
    return normalizeRegion(fromUrl);
  }
}

/** رابط بيانات مواعيدك للمنطقة؛ الرياض بلا معامل. */
export function mawaeedApiPath(region: RegionId): string {
  return `/api/mawaeed${region === "riyadh" ? "" : `?region=${region}`}`;
}
