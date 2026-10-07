import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Search, Shapes, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { MediaFile } from "@shared/schema";

export interface LogoItem {
  id: string;
  displayId: number;
  title: string;
  name: string;
  url: string;
  svgUrl: string | null;
  pngUrl: string | null;
  downloadCount: number;
  relevanceScore?: number;
}

interface LogoLibraryTabProps {
  isActive: boolean;
  suggestions: LogoItem[];
  isLoadingSuggestions: boolean;
  onPick: (media: MediaFile) => void;
}

const PAGE_SIZE = 30;

/** تبويب «الشعارات» في منتقي الوسائط: مقترحات من نص الخبر + بحث في مكتبة الشعارات. */
export function LogoLibraryTab({ isActive, suggestions, isLoadingSuggestions, onPick }: LogoLibraryTabProps) {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<LogoItem[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(query.trim());
      setOffset(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const searchUrl = `/api/logos/search?${new URLSearchParams({ q: debounced, limit: String(PAGE_SIZE), offset: String(offset) })}`;
  const { data, isLoading, isFetching } = useQuery<{ logos: LogoItem[]; hasMore: boolean }>({
    queryKey: [searchUrl],
    enabled: isActive,
    staleTime: 10 * 60 * 1000,
  });

  useEffect(() => {
    const page = Array.isArray(data?.logos) ? data.logos : [];
    if (!data) return;
    setItems((prev) => {
      if (offset === 0) return page;
      const seen = new Set(prev.map((l) => l.id));
      return [...prev, ...page.filter((l) => !seen.has(l.id))];
    });
  }, [data, offset]);

  const pickLogo = useMutation({
    mutationFn: async (logoId: string) => {
      return apiRequest<MediaFile>(`/api/logos/${encodeURIComponent(logoId)}/use`, { method: "POST" });
    },
    onSuccess: (media) => onPick(media),
    onError: (error: Error) => {
      toast({ title: "تعذر استخدام الشعار", description: error.message || "حاول مرة أخرى", variant: "destructive" });
    },
  });
  const pendingId = pickLogo.isPending ? pickLogo.variables : null;

  const renderCard = (logo: LogoItem) => (
    <Card
      key={logo.id}
      className="group overflow-hidden cursor-pointer transition-[border-color,box-shadow] duration-150 hover-elevate"
      onDoubleClick={() => pickLogo.mutate(logo.id)}
      data-testid={`card-logo-${logo.displayId}`}
    >
      <div className="relative aspect-[4/3] bg-white p-3 sm:p-4">
        <img
          src={logo.pngUrl || logo.url}
          alt={`شعار ${logo.name}`}
          className="h-full w-full object-contain"
          loading="lazy"
          decoding="async"
        />
        {logo.relevanceScore !== undefined && (
          <Badge className="absolute top-1.5 left-1.5 h-5 px-1.5 text-[10px] shadow-sm" variant="secondary">
            ملاءمة {logo.relevanceScore}%
          </Badge>
        )}
      </div>
      <div className="space-y-1.5 border-t p-1.5 sm:p-2">
        <p className="truncate text-xs font-medium" title={logo.title}>
          {logo.name}
        </p>
        <Button
          size="sm"
          variant="outline"
          className="h-7 w-full text-xs"
          disabled={!!pendingId}
          onClick={(e) => {
            e.stopPropagation();
            pickLogo.mutate(logo.id);
          }}
          data-testid={`button-select-logo-${logo.displayId}`}
        >
          {pendingId === logo.id ? "جاري التجهيز..." : "اختيار"}
        </Button>
      </div>
    </Card>
  );

  const grid = "grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";
  const skeletons = (n: number) => (
    <div className={grid}>
      {Array.from({ length: n }).map((_, i) => (
        <Card key={i} className="overflow-hidden">
          <Skeleton className="aspect-[4/3]" />
          <div className="space-y-1.5 p-1.5 sm:p-2">
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-7 w-full" />
          </div>
        </Card>
      ))}
    </div>
  );

  const showSuggestions = !debounced && (isLoadingSuggestions || suggestions.length > 0);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 sm:gap-4">
      <div className="relative shrink-0">
        <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="ابحث باسم الجهة... مثل: وزارة التعليم"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pr-10"
          data-testid="input-logo-search"
        />
      </div>

      <div className="min-h-0 flex-1 touch-pan-y space-y-5 overflow-y-auto overscroll-contain scroll-smooth pb-1 [-webkit-overflow-scrolling:touch]">
        {showSuggestions && (
          <section className="space-y-2" data-testid="logo-suggestions">
            <h3 className="flex items-center gap-1.5 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-primary" />
              جهات مذكورة في الخبر
            </h3>
            {isLoadingSuggestions ? skeletons(6) : <div className={grid}>{suggestions.map(renderCard)}</div>}
          </section>
        )}

        <section className="space-y-2">
          {!debounced && <h3 className="text-sm font-medium text-muted-foreground">كل الشعارات — الأكثر استخدامًا أولًا</h3>}
          {isLoading && offset === 0 ? (
            skeletons(12)
          ) : items.length === 0 && !isFetching ? (
            <div className="flex min-h-48 flex-col items-center justify-center text-center">
              <Shapes className="mb-3 h-12 w-12 text-muted-foreground" />
              <p className="text-base font-medium" data-testid="text-no-logos">لا يوجد شعار بهذا الاسم</p>
              <p className="text-xs text-muted-foreground sm:text-sm">جرّب كلمة أقصر من اسم الجهة</p>
            </div>
          ) : (
            <>
              <div className={grid}>{items.map(renderCard)}</div>
              {data?.hasMore && (
                <div className="mt-4 text-center">
                  <Button variant="outline" disabled={isFetching} onClick={() => setOffset(items.length)} data-testid="button-load-more-logos">
                    {isFetching ? "جاري التحميل..." : "تحميل المزيد"}
                  </Button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
