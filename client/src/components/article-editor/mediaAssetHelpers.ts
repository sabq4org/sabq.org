/**
 * مساعدات مرفقات المقال — صفوف `article_media_assets` قد تبقى بلا
 * `mediaFile.url` (تعريف يتيم بعد مسح الصورة أو حفظ caption بلا ملف).
 * فلترة الواجهة السابقة كانت تخفيها بالكامل فلا يظهر زر الحذف.
 */

export function mediaAssetUrl(asset: {
  url?: string | null;
  mediaFile?: { url?: string | null } | null;
} | null | undefined): string | null {
  const url = asset?.mediaFile?.url || asset?.url;
  return typeof url === "string" && url.trim() ? url : null;
}

/** كل المرفقات للتحرير (بما فيها اليتامى بلا صورة) مرتّبة بالعرض. */
export function listEditableAttachments(assets: unknown): any[] {
  return (Array.isArray(assets) ? assets : [])
    .filter((a: any) => a && typeof a.id === "string")
    .sort((a: any, b: any) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
}

export function isOrphanMediaAsset(asset: any): boolean {
  return !!asset && !mediaAssetUrl(asset);
}
