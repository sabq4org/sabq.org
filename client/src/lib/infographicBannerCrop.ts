/**
 * اقتطاع صورة الواجهة (16:9) من إنفوجرافيك طولي.
 *
 * منطق نقي (بلا DOM) لحساب إطار البداية وأبعاد الصورة الناتجة، حتى يُختبر
 * وحده. الرسم الفعلي على اللوحة في `InfographicBannerCropDialog`.
 */

export const BANNER_ASPECT = 16 / 9;
/** أقصى عرض للصورة الناتجة — يكفي لبطاقات الرئيسية والمشاركة. */
export const BANNER_MAX_WIDTH = 1600;

export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * إطار البداية: بعرض الصورة كاملًا من أعلاها (عادة العنوان والرقم الأكبر).
 * إذا كانت الصورة أعرض من 16:9 يتوسط الإطار أفقيًا بارتفاعها كاملًا.
 */
export function initialBannerRect(imageWidth: number, imageHeight: number): PixelRect {
  if (imageWidth <= 0 || imageHeight <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const fullWidthHeight = imageWidth / BANNER_ASPECT;
  if (fullWidthHeight <= imageHeight) {
    return { x: 0, y: 0, width: imageWidth, height: fullWidthHeight };
  }
  const width = imageHeight * BANNER_ASPECT;
  return { x: (imageWidth - width) / 2, y: 0, width, height: imageHeight };
}

/**
 * يقصر الإطار على حدود الصورة ويحسب أبعاد الناتج (لا تكبير فوق الأصل،
 * ولا أكثر من `BANNER_MAX_WIDTH`). يرجع null إذا كان الإطار فارغًا.
 */
export function bannerOutputPlan(
  rect: PixelRect,
  imageWidth: number,
  imageHeight: number,
): { source: PixelRect; outWidth: number; outHeight: number } | null {
  const x = Math.max(0, Math.min(rect.x, imageWidth));
  const y = Math.max(0, Math.min(rect.y, imageHeight));
  const width = Math.min(rect.width, imageWidth - x);
  const height = Math.min(rect.height, imageHeight - y);
  if (!(width >= 1) || !(height >= 1)) return null;
  const outWidth = Math.round(Math.min(width, BANNER_MAX_WIDTH));
  const outHeight = Math.round(outWidth / BANNER_ASPECT);
  return { source: { x, y, width, height }, outWidth, outHeight };
}
