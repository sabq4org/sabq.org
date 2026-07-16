import { BookOpen, Brain, Crosshair, Search, Zap, type LucideIcon } from "lucide-react";

/**
 * خريطة المزاج القرائي → أيقونة lucide.
 * تقبل المفاتيح العربية والإنجليزية (عقد البيانات §18: readingMood قد يصل باللغتين).
 */
const MOOD_ICONS: Record<string, LucideIcon> = {
  تحليلي: Brain,
  Analytical: Brain,
  فضولي: Search,
  Curious: Search,
  سريع: Zap,
  Fast: Zap,
  نقدي: Crosshair,
  Critical: Crosshair,
};

export function MoodIcon({ mood, className }: { mood: string; className?: string }) {
  const Icon = MOOD_ICONS[mood] ?? BookOpen;
  return <Icon className={className} aria-hidden="true" />;
}
