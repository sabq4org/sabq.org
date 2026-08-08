/**
 * بطاقات اختيار نمط توليد الصورة (Visual Cards)
 * تُعرض داخل AIImageGeneratorDialog — البيانات من GET /api/image-styles
 * والأنماط تُدار من لوحة التحكم (نظام editorial).
 */

import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Camera,
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
      <Label>نوع الصورة</Label>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {styles.map((style) => {
          const Icon = STYLE_ICONS[style.icon || ""] || Sparkles;
          const isSelected = style.slug === selectedSlug;
          const matchedBadge = style.contextBadges.find((badge) =>
            matchesCategoryToken(badge.categories, category)
          );

          return (
            <button
              key={style.slug}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(style.slug)}
              className={`relative flex flex-col items-start gap-1 rounded-lg border-2 p-3 text-start transition-all ${
                isSelected
                  ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                  : "border-muted hover:border-muted-foreground/30"
              } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
              data-testid={`image-style-${style.slug}`}
            >
              <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                <span className="text-sm font-semibold">{style.nameAr}</span>
              </div>
              {style.description && (
                <span className="text-xs text-muted-foreground leading-relaxed">
                  {style.description}
                </span>
              )}
              {matchedBadge && (
                <Badge variant="secondary" className="mt-1 text-[10px]">
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
