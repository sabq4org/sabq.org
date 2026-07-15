import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, X } from "lucide-react";
import type { MediaFile } from "@shared/schema";

export type SuggestedMedia = MediaFile & { relevanceScore: number };

interface HeroImageSuggestionsProps {
  articleTitle: string;
  articleContent?: string;
  onPick: (media: SuggestedMedia) => void;
  /** فتح منتقي المكتبة على تبويب الاقتراحات لرؤية المزيد */
  onOpenLibrary?: () => void;
}

const MIN_TITLE_LENGTH = 15;
const DEBOUNCE_MS = 900;

/**
 * "المكتبة تأتي إلى المحرر": بمجرد كتابة عنوان الخبر يظهر شريط بأفضل صور
 * الأرشيف ملاءمةً (بحث دلالي) داخل بطاقة الصورة البارزة — قبل أن يفكر
 * المحرر في رفع صورة جديدة أو توليدها. يختفي تلقائيًا بعد اختيار صورة
 * (يُركَّب فقط عندما لا توجد صورة)، ويمكن إخفاؤه يدويًا لهذه الجلسة.
 */
export function HeroImageSuggestions({
  articleTitle,
  articleContent,
  onPick,
  onOpenLibrary,
}: HeroImageSuggestionsProps) {
  const [dismissed, setDismissed] = useState(false);
  const [debouncedTitle, setDebouncedTitle] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTitle(articleTitle.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [articleTitle]);

  const suggestUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("title", debouncedTitle);
    if (articleContent) params.set("content", articleContent.slice(0, 500));
    params.set("limit", "6");
    return `/api/media/suggest-for-article?${params.toString()}`;
  }, [debouncedTitle, articleContent]);

  const enabled = !dismissed && debouncedTitle.length >= MIN_TITLE_LENGTH;

  const { data, isLoading } = useQuery<{ files: SuggestedMedia[]; total: number }>({
    queryKey: [suggestUrl],
    enabled,
    staleTime: 60_000,
  });
  const files = Array.isArray(data?.files) ? data.files : [];

  if (!enabled) return null;
  if (!isLoading && files.length === 0) return null;

  return (
    <div
      className="rounded-lg border border-dashed bg-muted/40 p-3 space-y-2"
      data-testid="hero-image-suggestions"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          صور مقترحة من المكتبة لهذا الخبر
        </p>
        <div className="flex items-center gap-1">
          {onOpenLibrary && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs px-2"
              onClick={onOpenLibrary}
              data-testid="button-suggestions-more"
            >
              المزيد
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setDismissed(true)}
            aria-label="إخفاء الاقتراحات"
            data-testid="button-suggestions-dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-28 shrink-0 rounded-md" />
          ))}
        </div>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {files.map((media) => (
            <button
              key={media.id}
              type="button"
              className="relative h-20 w-28 shrink-0 overflow-hidden rounded-md border group focus:outline-none focus:ring-2 focus:ring-primary"
              onClick={() => onPick(media)}
              title={media.title || media.fileName}
              data-testid={`suggestion-${media.id}`}
            >
              <img
                src={media.thumbnailUrl || media.url}
                alt={media.altText || media.title || media.fileName}
                className="h-full w-full object-cover transition-transform group-hover:scale-105"
                loading="lazy"
              />
              <Badge
                variant="secondary"
                className="absolute top-1 left-1 text-[10px] px-1 py-0 bg-black/60 text-white border-0"
              >
                {Math.round(media.relevanceScore)}%
              </Badge>
              <span className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-[10px] text-center py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                اختيار
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
