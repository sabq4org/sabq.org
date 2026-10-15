/**
 * بطاقات اختيار نمط توليد الصورة (Visual Cards)
 * تُعرض داخل AIImageGeneratorDialog — البيانات من GET /api/image-styles
 * والأنماط تُدار من لوحة التحكم (نظام editorial).
 */

import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Camera,
  Check,
  Palette,
  PenTool,
  Shapes,
  Sparkles,
  Image as ImageIcon,
  Film,
  Box,
  Brush,
  type LucideIcon,
} from "lucide-react";
import { matchesCategoryToken, type EditorImageStyle } from "@shared/imageStyles";

// خريطة أيقونات lucide المسموح بها لبطاقات الأنماط (icon في الإعدادات)
export const STYLE_ICONS: Record<string, LucideIcon> = {
  camera: Camera,
  palette: Palette,
  "pen-tool": PenTool,
  shapes: Shapes,
  sparkles: Sparkles,
  image: ImageIcon,
  film: Film,
  box: Box,
  brush: Brush,
};

interface StylePalette {
  activeCard: string;
  idleCard: string;
  activeIcon: string;
  idleIcon: string;
  activeCheck: string;
}

const STYLE_PALETTES: StylePalette[] = [
  {
    activeCard:
      "border-sky-500 bg-sky-50/90 text-sky-950 ring-2 ring-sky-500/20 shadow-sm dark:border-sky-400 dark:bg-sky-950/60 dark:text-sky-50",
    idleCard:
      "border-sky-200/80 bg-sky-50/25 hover:border-sky-400 hover:bg-sky-50/60 dark:border-sky-900/60 dark:bg-sky-950/20 dark:hover:border-sky-700",
    activeIcon: "bg-sky-600 text-white shadow-sm",
    idleIcon: "bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-300",
    activeCheck: "border-sky-600 bg-sky-600 text-white",
  },
  {
    activeCard:
      "border-violet-500 bg-violet-50/90 text-violet-950 ring-2 ring-violet-500/20 shadow-sm dark:border-violet-400 dark:bg-violet-950/60 dark:text-violet-50",
    idleCard:
      "border-violet-200/80 bg-violet-50/25 hover:border-violet-400 hover:bg-violet-50/60 dark:border-violet-900/60 dark:bg-violet-950/20 dark:hover:border-violet-700",
    activeIcon: "bg-violet-600 text-white shadow-sm",
    idleIcon: "bg-violet-100 text-violet-700 dark:bg-violet-900/60 dark:text-violet-300",
    activeCheck: "border-violet-600 bg-violet-600 text-white",
  },
  {
    activeCard:
      "border-emerald-500 bg-emerald-50/90 text-emerald-950 ring-2 ring-emerald-500/20 shadow-sm dark:border-emerald-400 dark:bg-emerald-950/60 dark:text-emerald-50",
    idleCard:
      "border-emerald-200/80 bg-emerald-50/25 hover:border-emerald-400 hover:bg-emerald-50/60 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:hover:border-emerald-700",
    activeIcon: "bg-emerald-600 text-white shadow-sm",
    idleIcon: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300",
    activeCheck: "border-emerald-600 bg-emerald-600 text-white",
  },
  {
    activeCard:
      "border-amber-500 bg-amber-50/90 text-amber-950 ring-2 ring-amber-500/20 shadow-sm dark:border-amber-400 dark:bg-amber-950/60 dark:text-amber-50",
    idleCard:
      "border-amber-200/80 bg-amber-50/25 hover:border-amber-400 hover:bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-950/20 dark:hover:border-amber-700",
    activeIcon: "bg-amber-600 text-white shadow-sm",
    idleIcon: "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300",
    activeCheck: "border-amber-600 bg-amber-600 text-white",
  },
  {
    activeCard:
      "border-rose-500 bg-rose-50/90 text-rose-950 ring-2 ring-rose-500/20 shadow-sm dark:border-rose-400 dark:bg-rose-950/60 dark:text-rose-50",
    idleCard:
      "border-rose-200/80 bg-rose-50/25 hover:border-rose-400 hover:bg-rose-50/60 dark:border-rose-900/60 dark:bg-rose-950/20 dark:hover:border-rose-700",
    activeIcon: "bg-rose-600 text-white shadow-sm",
    idleIcon: "bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300",
    activeCheck: "border-rose-600 bg-rose-600 text-white",
  },
];

interface ImageStyleSelectorProps {
  styles: EditorImageStyle[];
  selectedSlug: string;
  onSelect: (slug: string) => void;
  /** تصنيف الخبر الحالي — لعرض شارة التوجيه السياقي على البطاقة المطابقة */
  category?: string;
  disabled?: boolean;
}

export function ImageStyleSelector({
  styles,
  selectedSlug,
  onSelect,
  category,
  disabled,
}: ImageStyleSelectorProps) {
  if (styles.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-bold">اختر نمط الصورة</Label>
        <span className="text-[11px] text-muted-foreground">اضغط على البطاقة لتفعيل النمط</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {styles.map((style, index) => {
          const Icon = STYLE_ICONS[style.icon || ""] || Sparkles;
          const isSelected = style.slug === selectedSlug;
          const palette = STYLE_PALETTES[index % STYLE_PALETTES.length];
          const matchedBadge = style.contextBadges.find((badge) =>
            matchesCategoryToken(badge.categories, category)
          );

          return (
            <button
              key={style.slug}
              type="button"
              disabled={disabled}
              aria-pressed={isSelected}
              onClick={() => onSelect(style.slug)}
              className={`relative flex flex-col items-start gap-1.5 rounded-xl border-2 p-2.5 text-start transition-all ${
                isSelected ? palette.activeCard : palette.idleCard
              } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              data-testid={`image-style-${style.slug}`}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${
                      isSelected ? palette.activeIcon : palette.idleIcon
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-xs sm:text-sm font-bold truncate">{style.nameAr}</span>
                </div>
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
                    isSelected
                      ? palette.activeCheck
                      : "border-muted-foreground/35 bg-background/80"
                  }`}
                >
                  {isSelected && <Check className="h-2.5 w-2.5" />}
                </span>
              </div>
              {style.description && (
                <span className="text-[11px] text-muted-foreground leading-snug line-clamp-2">
                  {style.description}
                </span>
              )}
              {matchedBadge && (
                <Badge variant="secondary" className="mt-0.5 text-[10px]">
                  توجيه مخصص: {matchedBadge.label}
                </Badge>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

