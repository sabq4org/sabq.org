import { useQuery } from "@tanstack/react-query";
import type { 
  sections, 
  angles, 
  articleAngles, 
  imageAssets,
  articles 
} from "@shared/schema";

// Export types from schema
export type Section = typeof sections.$inferSelect;
export type Angle = typeof angles.$inferSelect;
export type ArticleAngle = typeof articleAngles.$inferSelect;
export type ImageAsset = typeof imageAssets.$inferSelect;

// Extended types for API responses
export type AngleWithArticles = Angle & {
  articles?: (typeof articles.$inferSelect)[];
  articleCount?: number;
};

// Query key constants for TanStack Query
export const MUQTARAB_QUERY_KEYS = {
  sections: () => ["/api/muqtarab/section"] as const,
  angles: (sectionSlug: string, activeOnly = true) => {
    const queryParams = activeOnly ? "?active=true" : "";
    return [`/api/muqtarab/angles${queryParams}`] as const;
  },
  angleDetail: (angleSlug: string) => [`/api/muqtarab/angles/${angleSlug}`] as const,
  angleArticles: (angleSlug: string) => [`/api/muqtarab/angles/${angleSlug}/articles`] as const,
};

/**
 * جلب جميع الزوايا (النشطة فقط افتراضياً)
 * @param sectionSlug - معرف القسم (slug) - محفوظ للاستخدام المستقبلي
 * @param activeOnly - جلب الزوايا النشطة فقط (افتراضي: true)
 * @returns قائمة الزوايا مع حالة التحميل والأخطاء
 */
export function useMuqtarabAngles(sectionSlug: string, activeOnly = true) {
  return useQuery<Angle[]>({
    queryKey: MUQTARAB_QUERY_KEYS.angles(sectionSlug, activeOnly),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!sectionSlug,
  });
}

/**
 * جلب تفاصيل زاوية محددة مع المقالات المرتبطة
 * @param angleSlug - معرف الزاوية (slug)
 * @returns تفاصيل الزاوية مع المقالات وحالة التحميل والأخطاء
 */
export function useAngleDetail(angleSlug: string) {
  return useQuery<AngleWithArticles>({
    queryKey: MUQTARAB_QUERY_KEYS.angleDetail(angleSlug),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!angleSlug,
  });
}

/**
 * جلب المقالات المرتبطة بزاوية معينة
 * @param angleSlug - معرف الزاوية (slug)
 * @returns قائمة المقالات مع حالة التحميل والأخطاء
 */
export function useAngleArticles(angleSlug: string) {
  return useQuery<(typeof articles.$inferSelect)[]>({
    queryKey: MUQTARAB_QUERY_KEYS.angleArticles(angleSlug),
    staleTime: 2 * 60 * 1000, // 2 minutes (articles change more frequently)
    enabled: !!angleSlug,
  });
}

/**
 * جلب قسم مُقترب
 * @returns قسم مُقترب مع حالة التحميل والأخطاء
 */
export function useMuqtarabSection() {
  return useQuery<Section>({
    queryKey: MUQTARAB_QUERY_KEYS.sections(),
    staleTime: 10 * 60 * 1000, // 10 minutes (sections rarely change)
  });
}
