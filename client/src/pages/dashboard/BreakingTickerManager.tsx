import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, apiUrl } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  Trash2,
  Loader2,
  GripVertical,
  Power,
  PowerOff,
  Link as LinkIcon,
  X,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Newspaper,
  Zap,
  Flame,
  Radio,
  Search,
  ExternalLink,
  Check,
  Pencil,
  Clock,
  Sparkles,
  Play,
  Pause,
  Smartphone,
  Monitor,
  FileDown,
  Globe,
  AlertTriangle,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type TickerTopic = {
  id: string;
  topicTitle: string;
  isActive: boolean;
  expiresAt?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
};

type TickerHeadline = {
  id: string;
  topicId: string;
  headline: string;
  linkedArticleId?: string | null;
  linkedArticleTitle?: string | null;
  linkedArticleSlug?: string | null;
  externalUrl?: string | null;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
};

type ArticleSearchResult = {
  id: string;
  title: string;
  slug: string;
  shortSlug?: string | null;
  shortCode?: string | null;
  imageUrl?: string | null;
  newsType?: string | null;
  publishedAt?: string | null;
  category?: {
    id: string;
    nameAr: string;
  } | null;
};

const MAX_HEADLINES = 5;

const TOPIC_QUICK_PRESETS = [
  "عاجل",
  "أمر ملكي",
  "بيان رسمي",
  "تغطية خاصة",
  "مجلس الوزراء",
  "الديوان الملكي",
];

const EXPIRATION_OPTIONS: { label: string; hours: number | null }[] = [
  { label: "بث مستمر (بدون انتهاء)", hours: null },
  { label: "ساعة واحدة", hours: 1 },
  { label: "3 ساعات", hours: 3 },
  { label: "6 ساعات", hours: 6 },
  { label: "12 ساعة", hours: 12 },
  { label: "24 ساعة", hours: 24 },
];

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

function formatRelativeTimeAr(dateStr?: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "الآن";
  if (diffMin < 60) return `منذ ${diffMin} د`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `منذ ${diffHours} س`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `منذ ${diffDays} يوم`;
  return date.toLocaleDateString("ar-SA", { month: "short", day: "numeric" });
}

function getExpirationStatus(expiresAt?: string | null): {
  isExpired: boolean;
  label: string;
} | null {
  if (!expiresAt) return null;
  const exp = new Date(expiresAt);
  if (Number.isNaN(exp.getTime())) return null;
  const diffMs = exp.getTime() - Date.now();
  if (diffMs <= 0) {
    return { isExpired: true, label: "انتهت مدة العرض" };
  }
  const diffMin = Math.ceil(diffMs / 60000);
  if (diffMin < 60) {
    return { isExpired: false, label: `ينتهي خلال ${diffMin} دقيقة` };
  }
  const diffHours = Math.floor(diffMin / 60);
  const remMin = diffMin % 60;
  return {
    isExpired: false,
    label: remMin > 0 ? `ينتهي خلال ${diffHours} س و ${remMin} د` : `ينتهي خلال ${diffHours} ساعة`,
  };
}

function LiveTickerPreview({
  topic,
  headlines,
}: {
  topic: TickerTopic | null;
  headlines: TickerHeadline[];
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");

  useEffect(() => {
    setCurrentIndex(0);
  }, [topic?.id, headlines.length]);

  useEffect(() => {
    if (headlines.length <= 1 || isPaused) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % headlines.length);
    }, 4500);
    return () => clearInterval(interval);
  }, [headlines.length, isPaused]);

  if (!topic) return null;

  const safeIndex = headlines.length > 0 ? currentIndex % headlines.length : 0;
  const currentHeadline = headlines[safeIndex];
  const hasLink = !!(currentHeadline?.linkedArticleSlug || currentHeadline?.externalUrl);
  const previewHref = currentHeadline?.linkedArticleSlug
    ? `/article/${currentHeadline.linkedArticleSlug}`
    : currentHeadline?.externalUrl || undefined;

  return (
    <div
      className="rounded-2xl border border-border/70 bg-card/95 shadow-sm overflow-hidden"
      data-testid="live-ticker-preview-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-muted/40 border-b border-border/60 text-xs">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-red-500/10 text-red-600 dark:text-red-400">
            <Flame className="h-3.5 w-3.5" />
          </span>
          <span className="font-semibold text-foreground">معاينة حية لشكل الشريط العاجل</span>
          {topic.isActive ? (
            <Badge className="bg-red-600 hover:bg-red-600 text-white border-0 text-[11px] px-2 py-0 h-5 gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
              يُبث للزوار الآن
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[11px] px-2 py-0 h-5 text-muted-foreground">
              معاينة تجريبية (الموضوع غير مفعّل)
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <div className="inline-flex items-center rounded-lg border border-border/70 bg-background p-0.5">
            <button
              type="button"
              onClick={() => setPreviewDevice("desktop")}
              className={`no-min-touch-size inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                previewDevice === "desktop"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="معاينة سطح المكتب"
              data-testid="button-preview-desktop"
            >
              <Monitor className="h-3 w-3" />
              <span>ديسكتوب</span>
            </button>
            <button
              type="button"
              onClick={() => setPreviewDevice("mobile")}
              className={`no-min-touch-size inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                previewDevice === "mobile"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="معاينة الجوال"
              data-testid="button-preview-mobile"
            >
              <Smartphone className="h-3 w-3" />
              <span>جوال</span>
            </button>
          </div>

          {headlines.length > 1 && (
            <div className="inline-flex items-center gap-0.5 rounded-lg border border-border/70 bg-background p-0.5">
              <button
                type="button"
                onClick={() =>
                  setCurrentIndex((prev) => (prev - 1 + headlines.length) % headlines.length)
                }
                className="no-min-touch-size p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                title="العنوان السابق"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsPaused((p) => !p)}
                className="no-min-touch-size p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                title={isPaused ? "تشغيل التبديل التلقائي" : "إيقاف التبديل مؤقتاً"}
              >
                {isPaused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
              </button>
              <button
                type="button"
                onClick={() => setCurrentIndex((prev) => (prev + 1) % headlines.length)}
                className="no-min-touch-size p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                title="العنوان التالي"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="p-3 sm:p-4 bg-muted/20">
        <div
          className={`mx-auto transition-all duration-300 rounded-xl overflow-hidden shadow-md ${
            previewDevice === "mobile" ? "max-w-[390px]" : "w-full"
          }`}
        >
          <div className="relative bg-gradient-to-l from-red-600 via-red-600 to-red-700 text-white overflow-hidden">
            <div className="absolute inset-0 bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(0,0,0,0.04)_10px,rgba(0,0,0,0.04)_20px)] pointer-events-none" />
            {previewDevice === "mobile" ? (
              <div className="relative px-3.5 py-2.5 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className="flex items-center gap-1 bg-white/20 backdrop-blur-sm px-2 py-0.5 rounded-full shrink-0">
                      <Flame className="h-3 w-3 text-yellow-300 animate-bounce" />
                      <span className="text-[11px] font-bold">عاجل</span>
                    </div>
                    <Badge
                      variant="secondary"
                      className="bg-white/15 text-white border-white/25 font-semibold text-[11px] px-2 py-0 max-w-[160px] truncate"
                    >
                      {topic.topicTitle}
                    </Badge>
                  </div>
                  {headlines.length > 1 && (
                    <div className="flex items-center gap-1 shrink-0">
                      {headlines.map((h, idx) => (
                        <button
                          key={h.id}
                          type="button"
                          onClick={() => setCurrentIndex(idx)}
                          className={`no-min-touch-size h-1.5 rounded-full transition-all duration-300 ${
                            idx === safeIndex
                              ? "w-4 bg-white"
                              : "w-1.5 bg-white/45 hover:bg-white/70"
                          }`}
                          aria-label={`العنوان ${idx + 1}`}
                        />
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  {headlines.length === 0 ? (
                    <p className="text-xs text-white/80 italic">
                      أضف عنواناً واحداً على الأقل لمعاينة ظهوره في الشريط العاجل...
                    </p>
                  ) : previewHref ? (
                    <a
                      href={previewHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-start gap-1.5 hover:underline"
                    >
                      <p className="font-medium text-xs leading-relaxed line-clamp-2 flex-1">
                        {currentHeadline?.headline}
                      </p>
                      {hasLink && (
                        <ExternalLink className="h-3.5 w-3.5 shrink-0 mt-0.5 opacity-80 group-hover:opacity-100" />
                      )}
                    </a>
                  ) : (
                    <p className="font-medium text-xs leading-relaxed line-clamp-2">
                      {currentHeadline?.headline}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="relative px-3 sm:px-4 py-2.5 flex items-center gap-2 sm:gap-3 min-h-[46px]">
                <div className="flex items-center gap-1.5 shrink-0">
                  <div className="flex items-center gap-1 bg-white/20 backdrop-blur-sm px-2.5 py-1 rounded-full">
                    <Flame className="h-3.5 w-3.5 text-yellow-300 animate-bounce" />
                    <span className="text-[11px] font-bold tracking-wide">عاجل</span>
                  </div>
                  <Badge
                    variant="secondary"
                    className="bg-white/15 text-white border-white/25 font-semibold text-xs px-2.5 py-0.5"
                  >
                    {topic.topicTitle}
                  </Badge>
                </div>

                <div className="flex-1 min-w-0 overflow-hidden">
                  {headlines.length === 0 ? (
                    <p className="text-xs sm:text-sm text-white/80 italic truncate">
                      أضف عنواناً واحداً على الأقل في الأسفل لمعاينة ظهوره في الشريط العاجل...
                    </p>
                  ) : (
                    <div className="flex items-center gap-2">
                      {previewHref ? (
                        <a
                          href={previewHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group flex items-center gap-2 min-w-0 hover:underline"
                        >
                          <p className="font-medium leading-snug text-sm line-clamp-1">
                            {currentHeadline?.headline}
                          </p>
                          {hasLink && (
                            <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-80 group-hover:opacity-100" />
                          )}
                        </a>
                      ) : (
                        <p className="font-medium leading-snug text-sm line-clamp-1">
                          {currentHeadline?.headline}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {headlines.length > 1 && (
                  <div className="flex items-center gap-1 shrink-0">
                    {headlines.map((h, idx) => (
                      <button
                        key={h.id}
                        type="button"
                        onClick={() => setCurrentIndex(idx)}
                        className={`no-min-touch-size h-1.5 rounded-full transition-all duration-300 ${
                          idx === safeIndex
                            ? "w-4 bg-white"
                            : "w-1.5 bg-white/45 hover:bg-white/70"
                        }`}
                        aria-label={`العنوان ${idx + 1}`}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SortableHeadlineRow({
  headline,
  index,
  totalCount,
  isTopicActive,
  recentArticles,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
  isUpdating,
}: {
  headline: TickerHeadline;
  index: number;
  totalCount: number;
  isTopicActive: boolean;
  recentArticles: ArticleSearchResult[];
  onUpdate: (id: string, data: Partial<TickerHeadline>) => void;
  onDelete: (id: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isUpdating: boolean;
}) {
  const [headlineText, setHeadlineText] = useState(headline.headline);
  const [articleSearchTerm, setArticleSearchTerm] = useState("");
  const [showArticleDropdown, setShowArticleDropdown] = useState(false);
  const [showExternalUrlInput, setShowExternalUrlInput] = useState(false);
  const [externalUrlDraft, setExternalUrlDraft] = useState(headline.externalUrl || "");
  const dropdownContainerRef = useRef<HTMLDivElement>(null);
  const debouncedSearch = useDebounce(articleSearchTerm, 250);

  useEffect(() => {
    setHeadlineText(headline.headline);
  }, [headline.headline]);

  useEffect(() => {
    setExternalUrlDraft(headline.externalUrl || "");
  }, [headline.externalUrl]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownContainerRef.current &&
        !dropdownContainerRef.current.contains(event.target as Node)
      ) {
        setShowArticleDropdown(false);
      }
    };
    if (showArticleDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showArticleDropdown]);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: headline.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
  };

  const { data: articleResults, isLoading: isSearching } = useQuery<ArticleSearchResult[]>({
    queryKey: ["/api/articles/search-simple", debouncedSearch],
    queryFn: async () => {
      if (!debouncedSearch || debouncedSearch.length < 2) return [];
      const res = await fetch(
        apiUrl(`/api/articles/search-simple?q=${encodeURIComponent(debouncedSearch)}`)
      );
      if (!res.ok) return [];
      return res.json();
    },
    enabled: debouncedSearch.length >= 2,
  });

  const isDirty = headlineText.trim() !== headline.headline.trim() && headlineText.trim().length > 0;

  const handleSaveText = () => {
    const trimmed = headlineText.trim();
    if (!trimmed) {
      setHeadlineText(headline.headline);
      return;
    }
    if (trimmed !== headline.headline) {
      onUpdate(headline.id, { headline: trimmed });
    }
  };

  const handleSelectArticle = (article: ArticleSearchResult) => {
    onUpdate(headline.id, {
      linkedArticleId: article.id,
      linkedArticleTitle: article.title,
      linkedArticleSlug: article.shortCode || article.shortSlug || article.slug,
      externalUrl: null,
    });
    setArticleSearchTerm("");
    setShowArticleDropdown(false);
  };

  const handleSaveExternalUrl = () => {
    const trimmed = externalUrlDraft.trim();
    onUpdate(headline.id, {
      externalUrl: trimmed || null,
      linkedArticleId: null,
      linkedArticleTitle: null,
      linkedArticleSlug: null,
    });
    setShowExternalUrlInput(false);
  };

  const handleClearLink = () => {
    onUpdate(headline.id, {
      linkedArticleId: null,
      linkedArticleTitle: null,
      linkedArticleSlug: null,
      externalUrl: null,
    });
    setExternalUrlDraft("");
    setShowExternalUrlInput(false);
  };

  const displayedArticles =
    articleSearchTerm.trim().length >= 2
      ? articleResults || []
      : recentArticles.slice(0, 8);

  const charCount = headlineText.length;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative rounded-xl border transition-all duration-200 p-3.5 sm:p-4 mb-3 ${
        isDragging
          ? "border-primary bg-primary/[0.04] shadow-lg z-20"
          : isTopicActive
          ? "border-border/80 bg-card hover:border-red-500/35 shadow-xs"
          : "border-border/70 bg-card hover:border-primary/30 shadow-xs"
      }`}
      data-testid={`headline-row-${headline.id}`}
    >
      <div className="flex items-start gap-2.5 sm:gap-3">
        {/* Rank + Drag + Mobile Up/Down */}
        <div className="flex flex-col items-center gap-1 pt-0.5 shrink-0">
          <div className="flex items-center gap-1">
            <span
              className={`inline-flex h-6 w-6 items-center justify-center rounded-lg text-xs font-bold ${
                isTopicActive
                  ? "bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/20"
                  : "bg-primary/10 text-primary border border-primary/20"
              }`}
            >
              {index + 1}
            </span>
            <div
              className="cursor-grab active:cursor-grabbing p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              {...attributes}
              {...listeners}
              title="اسحب لإعادة الترتيب"
              data-testid={`drag-handle-${headline.id}`}
            >
              <GripVertical className="h-4 w-4" />
            </div>
          </div>

          {totalCount > 1 && (
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={onMoveUp}
                disabled={index === 0 || isUpdating}
                className="no-min-touch-size p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
                title="تحريك لأعلى"
                data-testid={`button-move-up-${headline.id}`}
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={onMoveDown}
                disabled={index === totalCount - 1 || isUpdating}
                className="no-min-touch-size p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
                title="تحريك لأسفل"
                data-testid={`button-move-down-${headline.id}`}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Main Content */}
        <div className="flex-1 min-w-0 space-y-2.5">
          {/* Headline Input Row */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Input
                value={headlineText}
                onChange={(e) => setHeadlineText(e.target.value)}
                onBlur={handleSaveText}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSaveText();
                  }
                }}
                placeholder="اكتب نص العنوان العاجل..."
                className="text-right font-medium pr-3 pl-16 h-10 bg-background/70 focus:bg-background"
                disabled={isUpdating}
                data-testid={`input-headline-text-${headline.id}`}
              />
              <span
                className={`absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] tabular-nums pointer-events-none ${
                  charCount > 120
                    ? "text-amber-600 dark:text-amber-400 font-medium"
                    : "text-muted-foreground/70"
                }`}
              >
                {charCount} حرف
              </span>
            </div>

            {isDirty && (
              <Button
                type="button"
                size="sm"
                onClick={handleSaveText}
                disabled={isUpdating}
                className="shrink-0 h-10 px-3 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                data-testid={`button-save-headline-${headline.id}`}
              >
                <Check className="h-3.5 w-3.5" />
                حفظ
              </Button>
            )}
          </div>

          {/* Link Section */}
          <div className="relative" ref={dropdownContainerRef}>
            {headline.linkedArticleId ? (
              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-primary/[0.05] border border-primary/20 text-xs sm:text-sm">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
                    <LinkIcon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="text-[11px] text-muted-foreground block">
                      مرتبط بمقال منشور
                    </span>
                    <span
                      className="font-medium text-foreground truncate block text-right"
                      data-testid={`text-linked-article-${headline.id}`}
                    >
                      {headline.linkedArticleTitle || headline.linkedArticleId}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {headline.linkedArticleSlug && (
                    <a
                      href={`/article/${headline.linkedArticleSlug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                      title="فتح المقال في تبويب جديد"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">معاينة</span>
                    </a>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={handleClearLink}
                    disabled={isUpdating}
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    title="إلغاء الربط"
                    data-testid={`button-clear-link-${headline.id}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ) : headline.externalUrl && !showExternalUrlInput ? (
              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-blue-500/[0.06] border border-blue-500/20 text-xs sm:text-sm">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
                    <Globe className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="text-[11px] text-muted-foreground block">رابط خارجي</span>
                    <span
                      className="font-medium text-foreground truncate block text-left"
                      dir="ltr"
                    >
                      {headline.externalUrl}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <a
                    href={headline.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-500/10"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setShowExternalUrlInput(true)}
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    title="تعديل الرابط"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={handleClearLink}
                    disabled={isUpdating}
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    title="إلغاء الربط"
                    data-testid={`button-clear-link-${headline.id}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ) : showExternalUrlInput ? (
              <div className="flex items-center gap-2">
                <Input
                  value={externalUrlDraft}
                  onChange={(e) => setExternalUrlDraft(e.target.value)}
                  placeholder="https://sabq.org/..."
                  dir="ltr"
                  className="text-left h-9 text-xs sm:text-sm flex-1"
                  disabled={isUpdating}
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSaveExternalUrl}
                  disabled={!externalUrlDraft.trim() || isUpdating}
                  className="h-9 px-3"
                >
                  ربط
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowExternalUrlInput(false)}
                  className="h-9 px-2"
                >
                  إلغاء
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="h-3.5 w-3.5 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <Input
                    value={articleSearchTerm}
                    onChange={(e) => {
                      setArticleSearchTerm(e.target.value);
                      setShowArticleDropdown(true);
                    }}
                    onFocus={() => setShowArticleDropdown(true)}
                    placeholder="ربط بمقال... (اختر من القائمة أو اكتب للبحث)"
                    className="text-right pr-8 h-9 text-xs sm:text-sm bg-muted/30 focus:bg-background"
                    disabled={isUpdating}
                    data-testid={`input-article-search-${headline.id}`}
                  />
                  {showArticleDropdown && (
                    <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-xl shadow-xl max-h-60 overflow-y-auto divide-y divide-border/50">
                      <div className="px-3 py-1.5 bg-muted/50 text-[11px] font-medium text-muted-foreground flex items-center justify-between">
                        <span>
                          {articleSearchTerm.trim().length >= 2
                            ? "نتائج البحث في المقالات"
                            : "أحدث الأخبار المنشورة (اختر للربط السريع)"}
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowArticleDropdown(false)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                      {articleSearchTerm.trim().length >= 2 && isSearching ? (
                        <div className="p-4 text-center text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                        </div>
                      ) : displayedArticles.length > 0 ? (
                        displayedArticles.map((article) => (
                          <button
                            key={article.id}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleSelectArticle(article)}
                            className="w-full px-3 py-2 text-right hover:bg-accent transition-colors flex items-center justify-between gap-2 text-xs sm:text-sm"
                            data-testid={`article-option-${article.id}`}
                          >
                            <span className="truncate font-medium flex-1">{article.title}</span>
                            {article.newsType === "breaking" && (
                              <Badge className="bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20 text-[10px] shrink-0">
                                عاجل
                              </Badge>
                            )}
                          </button>
                        ))
                      ) : (
                        <div className="p-3 text-center text-muted-foreground text-xs">
                          لا توجد مقالات مطابقة
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowExternalUrlInput(true)}
                  className="h-9 px-2.5 text-xs shrink-0 gap-1 text-muted-foreground hover:text-foreground"
                  title="ربط برابط خارجي"
                >
                  <Globe className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">رابط خارجي</span>
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Delete Button */}
        <Button
          size="icon"
          variant="ghost"
          onClick={() => onDelete(headline.id)}
          disabled={isUpdating}
          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
          title="حذف العنوان"
          data-testid={`button-delete-headline-${headline.id}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default function BreakingTickerManager() {
  useAuth({ redirectToLogin: true });
  const { toast } = useToast();

  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [topicFilter, setTopicFilter] = useState<"all" | "active" | "inactive">("all");
  const [topicSearch, setTopicSearch] = useState("");

  // Create topic modal state
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newTopicTitle, setNewTopicTitle] = useState("");
  const [newTopicActivateImmediately, setNewTopicActivateImmediately] = useState(true);
  const [newTopicExpireHours, setNewTopicExpireHours] = useState<number | null>(null);

  // Inline topic rename state
  const [isEditingTopicTitle, setIsEditingTopicTitle] = useState(false);
  const [editingTopicTitleText, setEditingTopicTitleText] = useState("");

  // Quick-add headline composer state
  const [quickHeadlineText, setQuickHeadlineText] = useState("");

  // Import from published/breaking articles modal state
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [importSearchTerm, setImportSearchTerm] = useState("");
  const [importFilterType, setImportFilterType] = useState<"all" | "breaking">("all");
  const debouncedImportSearch = useDebounce(importSearchTerm, 300);

  // Delete confirmation dialogs
  const [deletingTopic, setDeletingTopic] = useState<TickerTopic | null>(null);
  const [deletingHeadline, setDeletingHeadline] = useState<TickerHeadline | null>(null);
  const [localHeadlines, setLocalHeadlines] = useState<TickerHeadline[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const { data: topics, isLoading: isLoadingTopics } = useQuery<TickerTopic[]>({
    queryKey: ["/api/admin/breaking-ticker/topics"],
  });

  const activeTopic = useMemo(
    () => (topics || []).find((t) => t.isActive) || null,
    [topics]
  );

  // Auto-select the active topic (or first available topic) on initial load
  useEffect(() => {
    if (!selectedTopicId && topics && topics.length > 0) {
      const target = topics.find((t) => t.isActive) || topics[0];
      if (target) {
        setSelectedTopicId(target.id);
      }
    }
  }, [topics, selectedTopicId]);

  const { data: selectedTopic, isLoading: isLoadingTopic } = useQuery<{
    topic: TickerTopic;
    headlines: TickerHeadline[];
  }>({
    queryKey: ["/api/admin/breaking-ticker/topics", selectedTopicId],
    enabled: !!selectedTopicId,
  });

  // Also fetch recent published articles for instant linking & one-click import
  const { data: recentArticlesData, isLoading: isLoadingRecentArticles } = useQuery<{
    articles: ArticleSearchResult[];
  }>({
    queryKey: ["/api/admin/articles", "breaking-ticker-recent", debouncedImportSearch],
    queryFn: async () => {
      const params = new URLSearchParams({
        status: "published",
        limit: "25",
      });
      if (debouncedImportSearch.trim().length >= 2) {
        params.set("search", debouncedImportSearch.trim());
      }
      const res = await fetch(apiUrl(`/api/admin/articles?${params.toString()}`), {
        credentials: "include",
      });
      if (!res.ok) return { articles: [] };
      return res.json();
    },
  });

  const recentArticles = useMemo(
    () => recentArticlesData?.articles || [],
    [recentArticlesData]
  );

  const filteredImportArticles = useMemo(() => {
    if (importFilterType === "breaking") {
      return recentArticles.filter((a) => a.newsType === "breaking");
    }
    return recentArticles;
  }, [recentArticles, importFilterType]);

  useEffect(() => {
    if (selectedTopic?.headlines) {
      setLocalHeadlines(
        [...selectedTopic.headlines].sort((a, b) => a.orderIndex - b.orderIndex)
      );
    }
  }, [selectedTopic]);

  useEffect(() => {
    if (selectedTopic?.topic) {
      setEditingTopicTitleText(selectedTopic.topic.topicTitle);
      setIsEditingTopicTitle(false);
    }
  }, [selectedTopic?.topic?.id, selectedTopic?.topic?.topicTitle]);

  const filteredTopics = useMemo(() => {
    if (!topics) return [];
    return topics.filter((t) => {
      if (topicFilter === "active" && !t.isActive) return false;
      if (topicFilter === "inactive" && t.isActive) return false;
      if (
        topicSearch.trim() &&
        !t.topicTitle.toLowerCase().includes(topicSearch.trim().toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [topics, topicFilter, topicSearch]);

  const createTopicMutation = useMutation({
    mutationFn: async ({
      topicTitle,
      activateImmediately,
      expireHours,
    }: {
      topicTitle: string;
      activateImmediately?: boolean;
      expireHours?: number | null;
    }) => {
      const expiresAt =
        expireHours != null
          ? new Date(Date.now() + expireHours * 3600 * 1000).toISOString()
          : null;
      const created: TickerTopic = await apiRequest("/api/admin/breaking-ticker/topics", {
        method: "POST",
        body: JSON.stringify({
          topicTitle,
          expiresAt,
        }),
      });
      if (activateImmediately && created?.id) {
        await apiRequest(`/api/admin/breaking-ticker/topics/${created.id}/activate`, {
          method: "POST",
        });
      }
      return created;
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/breaking-ticker/topics"] });
      if (created?.id) {
        setSelectedTopicId(created.id);
      }
      setIsCreateDialogOpen(false);
      setNewTopicTitle("");
      setNewTopicExpireHours(null);
      toast({ title: "تم إنشاء الموضوع بنجاح" });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في إنشاء الموضوع",
        variant: "destructive",
      });
    },
  });

  const updateTopicMutation = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: { topicTitle?: string; expiresAt?: string | null };
    }) => {
      return await apiRequest(`/api/admin/breaking-ticker/topics/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/breaking-ticker/topics"] });
      if (selectedTopicId) {
        queryClient.invalidateQueries({
          queryKey: ["/api/admin/breaking-ticker/topics", selectedTopicId],
        });
      }
      setIsEditingTopicTitle(false);
      toast({ title: "تم تحديث بيانات الموضوع" });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في تحديث الموضوع",
        variant: "destructive",
      });
    },
  });

  const deleteTopicMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/admin/breaking-ticker/topics/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/breaking-ticker/topics"] });
      if (selectedTopicId === deletingTopic?.id) {
        const remaining = (topics || []).filter((t) => t.id !== deletingTopic?.id);
        setSelectedTopicId(remaining[0]?.id || null);
      }
      setDeletingTopic(null);
      toast({ title: "تم حذف الموضوع بنجاح" });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في حذف الموضوع",
        variant: "destructive",
      });
    },
  });

  const activateTopicMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/admin/breaking-ticker/topics/${id}/activate`, {
        method: "POST",
      });
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/breaking-ticker/topics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/breaking-ticker/topics", id] });
      toast({ title: "تم تفعيل البث العاجل للموضوع" });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في تفعيل الموضوع",
        variant: "destructive",
      });
    },
  });

  const deactivateTopicMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/admin/breaking-ticker/topics/${id}/deactivate`, {
        method: "POST",
      });
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/breaking-ticker/topics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/breaking-ticker/topics", id] });
      toast({ title: "تم إيقاف البث العاجل" });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في إيقاف الموضوع",
        variant: "destructive",
      });
    },
  });

  const createHeadlineMutation = useMutation({
    mutationFn: async (payload: {
      topicId: string;
      headline?: string;
      linkedArticleId?: string | null;
      linkedArticleTitle?: string | null;
      linkedArticleSlug?: string | null;
      externalUrl?: string | null;
    }) => {
      return await apiRequest("/api/admin/breaking-ticker/headlines", {
        method: "POST",
        body: JSON.stringify({
          topicId: payload.topicId,
          headline: payload.headline?.trim() || "عنوان جديد",
          linkedArticleId: payload.linkedArticleId ?? null,
          linkedArticleTitle: payload.linkedArticleTitle ?? null,
          linkedArticleSlug: payload.linkedArticleSlug ?? null,
          externalUrl: payload.externalUrl ?? null,
          orderIndex: localHeadlines.length,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/breaking-ticker/topics", selectedTopicId],
      });
      setQuickHeadlineText("");
      toast({ title: "تمت إضافة العنوان للشريط العاجل" });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في إضافة العنوان",
        variant: "destructive",
      });
    },
  });

  const updateHeadlineMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TickerHeadline> }) => {
      return await apiRequest(`/api/admin/breaking-ticker/headlines/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/breaking-ticker/topics", selectedTopicId],
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في تحديث العنوان",
        variant: "destructive",
      });
    },
  });

  const deleteHeadlineMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/admin/breaking-ticker/headlines/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/breaking-ticker/topics", selectedTopicId],
      });
      setDeletingHeadline(null);
      toast({ title: "تم حذف العنوان" });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في حذف العنوان",
        variant: "destructive",
      });
    },
  });

  const reorderHeadlinesMutation = useMutation({
    mutationFn: async (headlines: { id: string; orderIndex: number }[]) => {
      await Promise.all(
        headlines.map((h) =>
          apiRequest(`/api/admin/breaking-ticker/headlines/${h.id}`, {
            method: "PATCH",
            body: JSON.stringify({ orderIndex: h.orderIndex }),
          })
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/breaking-ticker/topics", selectedTopicId],
      });
    },
  });

  const applyReorder = useCallback(
    (newHeadlines: TickerHeadline[]) => {
      setLocalHeadlines(newHeadlines);
      const reorderedData = newHeadlines.map((h, idx) => ({
        id: h.id,
        orderIndex: idx,
      }));
      reorderHeadlinesMutation.mutate(reorderedData);
    },
    [reorderHeadlinesMutation]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (over && active.id !== over.id) {
        const oldIndex = localHeadlines.findIndex((h) => h.id === active.id);
        const newIndex = localHeadlines.findIndex((h) => h.id === over.id);
        if (oldIndex !== -1 && newIndex !== -1) {
          applyReorder(arrayMove(localHeadlines, oldIndex, newIndex));
        }
      }
    },
    [localHeadlines, applyReorder]
  );

  const handleMoveHeadline = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= localHeadlines.length) return;
    applyReorder(arrayMove(localHeadlines, index, targetIndex));
  };

  const handleUpdateHeadline = (id: string, data: Partial<TickerHeadline>) => {
    updateHeadlineMutation.mutate({ id, data });
  };

  const handleDeleteHeadline = (id: string) => {
    const headline = localHeadlines.find((h) => h.id === id);
    if (headline) {
      setDeletingHeadline(headline);
    }
  };

  const handleAddHeadlineClick = () => {
    if (!selectedTopicId || localHeadlines.length >= MAX_HEADLINES) return;
    createHeadlineMutation.mutate({
      topicId: selectedTopicId,
      headline: quickHeadlineText.trim() || "عنوان جديد",
    });
  };

  const handleImportArticle = (article: ArticleSearchResult) => {
    if (!selectedTopicId || localHeadlines.length >= MAX_HEADLINES) return;
    createHeadlineMutation.mutate({
      topicId: selectedTopicId,
      headline: article.title,
      linkedArticleId: article.id,
      linkedArticleTitle: article.title,
      linkedArticleSlug: article.shortCode || article.shortSlug || article.slug,
    });
  };

  const canAddMoreHeadlines = localHeadlines.length < MAX_HEADLINES;
  const currentTopicObj =
    selectedTopic?.topic ||
    (topics || []).find((t) => t.id === selectedTopicId) ||
    null;
  const activeExpStatus = getExpirationStatus(activeTopic?.expiresAt);

  return (
    <DashboardLayout>
      <div className="space-y-5 pb-8" dir="rtl">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-5">
          <div className="flex items-center gap-3.5">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500/20 via-red-500/10 to-orange-500/10 border border-red-500/20 shadow-xs">
              <Zap className="h-6 w-6 text-red-600 dark:text-red-400" />
            </span>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1
                  className="text-xl sm:text-2xl font-bold tracking-tight"
                  data-testid="text-page-title"
                >
                  إدارة شريط الأخبار العاجلة
                </h1>
                {activeTopic && !activeExpStatus?.isExpired ? (
                  <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 gap-1.5 font-semibold">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    البث مباشر الآن
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/50" />
                    البث متوقف
                  </Badge>
                )}
              </div>
              <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">
                التحكم الفوري في مواضيع وعناوين الشريط العاجل عبر الموقع وتطبيقات الهواتف
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {selectedTopicId && (
              <Button
                variant="outline"
                className="flex-1 sm:flex-initial gap-2 border-red-500/25 hover:bg-red-500/5 text-red-600 dark:text-red-400"
                onClick={() => setIsImportDialogOpen(true)}
                disabled={!canAddMoreHeadlines}
                data-testid="button-open-import-dialog"
              >
                <FileDown className="h-4 w-4" />
                استيراد من الأخبار
              </Button>
            )}
            <Button
              className="flex-1 sm:flex-initial gap-2 bg-red-600 hover:bg-red-700 text-white shadow-xs"
              onClick={() => setIsCreateDialogOpen(true)}
              data-testid="button-create-topic"
            >
              <Plus className="h-4 w-4" />
              موضوع جديد
            </Button>
          </div>
        </div>

        {/* Live Broadcast Status Banner */}
        {activeTopic ? (
          <div
            className={`rounded-2xl border p-4 transition-colors ${
              activeExpStatus?.isExpired
                ? "border-amber-500/35 bg-amber-500/[0.06]"
                : "border-red-500/30 bg-gradient-to-l from-red-500/[0.08] via-red-500/[0.04] to-transparent"
            }`}
            data-testid="banner-active-broadcast"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start sm:items-center gap-3 min-w-0">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    activeExpStatus?.isExpired
                      ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                      : "bg-red-600 text-white shadow-sm"
                  }`}
                >
                  {activeExpStatus?.isExpired ? (
                    <AlertTriangle className="h-5 w-5" />
                  ) : (
                    <Radio className="h-5 w-5 animate-pulse" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-red-600 dark:text-red-400">
                      {activeExpStatus?.isExpired
                        ? "تنبيه انتهاء وقت البث:"
                        : "الموضوع النشط على الهواء الآن:"}
                    </span>
                    <span className="font-bold text-sm sm:text-base text-foreground truncate">
                      {activeTopic.topicTitle}
                    </span>
                    {activeExpStatus && (
                      <Badge
                        variant="outline"
                        className={`text-[11px] gap-1 ${
                          activeExpStatus.isExpired
                            ? "border-amber-500/40 text-amber-700 dark:text-amber-300"
                            : "border-border text-muted-foreground"
                        }`}
                      >
                        <Clock className="h-3 w-3" />
                        {activeExpStatus.label}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {activeExpStatus?.isExpired
                      ? "انتهت المهلة الزمنية لهذا الموضوع، لذا توقف ظهوره تلقائياً للزوار. يمكنك تمديد البث أو إيقافه."
                      : `آخر تحديث ${formatRelativeTimeAr(activeTopic.updatedAt)} — يظهر في أعلى الصفحة الرئيسية وتطبيقات الهواتف الذكية`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {selectedTopicId !== activeTopic.id && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedTopicId(activeTopic.id)}
                    className="text-xs h-8"
                  >
                    عرض عناوين البث النشط
                  </Button>
                )}
                {activeExpStatus?.isExpired && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      updateTopicMutation.mutate({
                        id: activeTopic.id,
                        data: { expiresAt: null },
                      })
                    }
                    className="text-xs h-8 border-amber-500/40 text-amber-700 dark:text-amber-300"
                  >
                    استئناف البث المستمر
                  </Button>
                )}
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => deactivateTopicMutation.mutate(activeTopic.id)}
                  disabled={deactivateTopicMutation.isPending}
                  className="text-xs h-8 gap-1.5"
                >
                  <PowerOff className="h-3.5 w-3.5" />
                  إيقاف البث الفوري
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div
            className="rounded-2xl border border-dashed border-border/80 bg-muted/20 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs sm:text-sm text-muted-foreground"
            data-testid="banner-inactive-broadcast"
          >
            <div className="flex items-center gap-2.5">
              <PowerOff className="h-4 w-4 text-muted-foreground shrink-0" />
              <span>
                لا يوجد شريط عاجل مفعّل حالياً للزوار. يمكنك تجهيز العناوين في أي موضوع ثم الضغط على{" "}
                <strong className="text-foreground">تفعيل البث</strong> لإطلاقه فوراً.
              </span>
            </div>
          </div>
        )}

        {/* Interactive Live Preview of Selected Topic */}
        {currentTopicObj && (
          <LiveTickerPreview topic={currentTopicObj} headlines={localHeadlines} />
        )}

        {/* Main Two-Column Newsroom Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Topics Column (4 cols on desktop) */}
          <div className="lg:col-span-4 space-y-3.5 rounded-2xl border border-border/70 bg-card p-4 shadow-xs">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base sm:text-lg font-bold flex items-center gap-2">
                <Newspaper className="h-5 w-5 text-primary" />
                <span>المواضيع</span>
                {topics && topics.length > 0 && (
                  <Badge variant="secondary" className="text-xs px-2 py-0 h-5">
                    {topics.length}
                  </Badge>
                )}
              </h2>

              <div className="inline-flex items-center rounded-lg border border-border/60 bg-muted/40 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setTopicFilter("all")}
                  className={`no-min-touch-size px-2 py-1 rounded-md font-medium transition-colors ${
                    topicFilter === "all"
                      ? "bg-background text-foreground shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  الكل
                </button>
                <button
                  type="button"
                  onClick={() => setTopicFilter("active")}
                  className={`no-min-touch-size px-2 py-1 rounded-md font-medium transition-colors ${
                    topicFilter === "active"
                      ? "bg-background text-foreground shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  النشط
                </button>
                <button
                  type="button"
                  onClick={() => setTopicFilter("inactive")}
                  className={`no-min-touch-size px-2 py-1 rounded-md font-medium transition-colors ${
                    topicFilter === "inactive"
                      ? "bg-background text-foreground shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  الأرشيف
                </button>
              </div>
            </div>

            {topics && topics.length > 3 && (
              <div className="relative">
                <Search className="h-3.5 w-3.5 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <Input
                  value={topicSearch}
                  onChange={(e) => setTopicSearch(e.target.value)}
                  placeholder="بحث في المواضيع..."
                  className="h-9 pr-8 text-xs sm:text-sm bg-muted/30"
                  data-testid="input-search-topics"
                />
                {topicSearch && (
                  <button
                    type="button"
                    onClick={() => setTopicSearch("")}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}

            {isLoadingTopics ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !topics || topics.length === 0 ? (
              <div className="text-center py-10 px-4 text-muted-foreground border border-dashed rounded-xl bg-muted/20 space-y-2">
                <Flame className="h-8 w-8 mx-auto text-muted-foreground/50" />
                <p className="text-sm font-medium">لا توجد مواضيع عاجلة بعد</p>
                <p className="text-xs">أنشئ موضوعاً جديداً لإضافة عناوين الأخبار العاجلة</p>
              </div>
            ) : filteredTopics.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-xs border border-dashed rounded-xl">
                لا توجد مواضيع مطابقة للفلتر المحدد
              </div>
            ) : (
              <div className="space-y-2 max-h-[340px] lg:max-h-[560px] overflow-y-auto pr-0.5">
                {filteredTopics.map((topic) => {
                  const isSelected = selectedTopicId === topic.id;
                  const expStatus = getExpirationStatus(topic.expiresAt);
                  return (
                    <div
                      key={topic.id}
                      className={`group relative p-3 border rounded-xl cursor-pointer transition-all ${
                        isSelected
                          ? "border-primary bg-primary/[0.05] shadow-xs ring-1 ring-primary/20"
                          : topic.isActive
                          ? "border-emerald-500/40 bg-emerald-500/[0.03] hover:bg-emerald-500/[0.06]"
                          : "border-border/70 hover:bg-muted/50"
                      }`}
                      onClick={() => setSelectedTopicId(topic.id)}
                      data-testid={`topic-row-${topic.id}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className="font-semibold text-sm sm:text-base truncate"
                              data-testid={`text-topic-title-${topic.id}`}
                            >
                              {topic.topicTitle}
                            </span>
                            {topic.isActive && (
                              <Badge
                                variant="outline"
                                className="shrink-0 border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[11px] px-2 py-0 h-5 gap-1"
                                data-testid={`badge-active-${topic.id}`}
                              >
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                مفعّل
                              </Badge>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                            <span>{formatRelativeTimeAr(topic.updatedAt || topic.createdAt)}</span>
                            {expStatus && (
                              <>
                                <span>•</span>
                                <span
                                  className={
                                    expStatus.isExpired
                                      ? "text-amber-600 dark:text-amber-400 font-medium"
                                      : ""
                                  }
                                >
                                  {expStatus.label}
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {topic.isActive ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                deactivateTopicMutation.mutate(topic.id);
                              }}
                              disabled={deactivateTopicMutation.isPending}
                              title="إيقاف البث"
                              className="h-8 w-8 hover:bg-orange-500/10"
                              data-testid={`button-deactivate-${topic.id}`}
                            >
                              <PowerOff className="h-4 w-4 text-orange-500" />
                            </Button>
                          ) : (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                activateTopicMutation.mutate(topic.id);
                              }}
                              disabled={activateTopicMutation.isPending}
                              title="تفعيل البث"
                              className="h-8 w-8 hover:bg-emerald-500/10"
                              data-testid={`button-activate-${topic.id}`}
                            >
                              <Power className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingTopic(topic);
                            }}
                            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            title="حذف الموضوع"
                            data-testid={`button-delete-topic-${topic.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Headlines Workspace Column (8 cols on desktop) */}
          <div className="lg:col-span-8 rounded-2xl border border-border/70 bg-card p-4 sm:p-5 shadow-xs">
            {!selectedTopicId ? (
              <div className="text-center py-16 text-muted-foreground border border-dashed rounded-xl bg-muted/20 space-y-2">
                <Newspaper className="h-10 w-10 mx-auto text-muted-foreground/40" />
                <p className="font-medium">اختر موضوعاً من القائمة لإدارة عناوينه</p>
                <p className="text-xs">أو أنشئ موضوعاً جديداً للبدء في بث الأخبار العاجلة</p>
              </div>
            ) : isLoadingTopic ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-5">
                {/* Selected Topic Header & Controls */}
                {currentTopicObj && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border/60">
                    <div className="flex-1 min-w-0">
                      {isEditingTopicTitle ? (
                        <div className="flex items-center gap-2 max-w-md">
                          <Input
                            value={editingTopicTitleText}
                            onChange={(e) => setEditingTopicTitleText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && editingTopicTitleText.trim()) {
                                updateTopicMutation.mutate({
                                  id: currentTopicObj.id,
                                  data: { topicTitle: editingTopicTitleText.trim() },
                                });
                              } else if (e.key === "Escape") {
                                setIsEditingTopicTitle(false);
                                setEditingTopicTitleText(currentTopicObj.topicTitle);
                              }
                            }}
                            className="h-9 text-right font-bold"
                            autoFocus
                            data-testid="input-edit-topic-title"
                          />
                          <Button
                            size="sm"
                            onClick={() =>
                              editingTopicTitleText.trim() &&
                              updateTopicMutation.mutate({
                                id: currentTopicObj.id,
                                data: { topicTitle: editingTopicTitleText.trim() },
                              })
                            }
                            disabled={
                              !editingTopicTitleText.trim() || updateTopicMutation.isPending
                            }
                            className="h-9 px-3"
                            data-testid="button-save-topic-title"
                          >
                            حفظ
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setIsEditingTopicTitle(false);
                              setEditingTopicTitleText(currentTopicObj.topicTitle);
                            }}
                            className="h-9 px-2"
                          >
                            إلغاء
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="text-lg sm:text-xl font-bold text-foreground">
                            {currentTopicObj.topicTitle}
                          </h2>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              setEditingTopicTitleText(currentTopicObj.topicTitle);
                              setIsEditingTopicTitle(true);
                            }}
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            title="تعديل عنوان الموضوع"
                            data-testid="button-edit-topic-title"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {currentTopicObj.isActive ? (
                            <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-xs">
                              نشط على الهواء
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs text-muted-foreground">
                              غير مفعّل
                            </Badge>
                          )}
                        </div>
                      )}

                      {/* Expiration selector row */}
                      <div className="flex items-center gap-2 mt-2 flex-wrap text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        <span>الإيقاف التلقائي:</span>
                        <div className="flex items-center gap-1 flex-wrap">
                          {[
                            { label: "مستمر", hours: null },
                            { label: "1 س", hours: 1 },
                            { label: "3 س", hours: 3 },
                            { label: "6 س", hours: 6 },
                            { label: "24 س", hours: 24 },
                          ].map((opt) => {
                            const remHours = currentTopicObj.expiresAt
                              ? Math.round(
                                  (new Date(currentTopicObj.expiresAt).getTime() - Date.now()) /
                                    3600000
                                )
                              : null;
                            const isSelectedOpt =
                              opt.hours === null
                                ? !currentTopicObj.expiresAt
                                : remHours === opt.hours;
                            return (
                              <button
                                key={String(opt.hours)}
                                type="button"
                                onClick={() => {
                                  const expiresAt =
                                    opt.hours != null
                                      ? new Date(
                                          Date.now() + opt.hours * 3600 * 1000
                                        ).toISOString()
                                      : null;
                                  updateTopicMutation.mutate({
                                    id: currentTopicObj.id,
                                    data: { expiresAt },
                                  });
                                }}
                                className={`no-min-touch-size px-2 py-0.5 rounded-md border text-[11px] transition-colors ${
                                  isSelectedOpt
                                    ? "border-primary/40 bg-primary/10 text-primary font-semibold"
                                    : "border-border/60 hover:bg-muted text-muted-foreground hover:text-foreground"
                                }`}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Broadcast Action & Capacity */}
                    <div className="flex items-center gap-2 shrink-0">
                      {currentTopicObj.isActive ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deactivateTopicMutation.mutate(currentTopicObj.id)}
                          disabled={deactivateTopicMutation.isPending}
                          className="gap-1.5 border-orange-500/40 text-orange-600 dark:text-orange-400 hover:bg-orange-500/10"
                        >
                          <PowerOff className="h-4 w-4" />
                          إيقاف البث
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => activateTopicMutation.mutate(currentTopicObj.id)}
                          disabled={activateTopicMutation.isPending}
                          className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                          <Power className="h-4 w-4" />
                          تفعيل البث للجمهور
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {/* Capacity Bar & Quick Composer */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-foreground">
                        العناوين المتداولة
                      </span>
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        {localHeadlines.length} / {MAX_HEADLINES} عناوين
                      </span>
                    </div>

                    {/* 5-segment capacity bar */}
                    <div className="flex items-center gap-1 w-28 sm:w-36">
                      {Array.from({ length: MAX_HEADLINES }).map((_, i) => (
                        <div
                          key={i}
                          className={`h-1.5 flex-1 rounded-full transition-colors ${
                            i < localHeadlines.length
                              ? currentTopicObj?.isActive
                                ? "bg-red-500"
                                : "bg-primary"
                              : "bg-muted"
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Quick Headline Composer Bar */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2.5 rounded-xl bg-muted/30 border border-border/60">
                    <Input
                      value={quickHeadlineText}
                      onChange={(e) => setQuickHeadlineText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && canAddMoreHeadlines) {
                          e.preventDefault();
                          handleAddHeadlineClick();
                        }
                      }}
                      placeholder={
                        canAddMoreHeadlines
                          ? "اكتب عنواناً عاجلاً جديداً واضغط Enter للإضافة السريعة..."
                          : "تم الوصول للحد الأقصى (5 عناوين لهذا الموضوع)"
                      }
                      disabled={!canAddMoreHeadlines || createHeadlineMutation.isPending}
                      className="text-right bg-background h-10 flex-1"
                      data-testid="input-quick-new-headline"
                    />
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        onClick={handleAddHeadlineClick}
                        disabled={!canAddMoreHeadlines || createHeadlineMutation.isPending}
                        className="h-10 px-4 flex-1 sm:flex-initial gap-1.5"
                        data-testid="button-add-headline"
                      >
                        {createHeadlineMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Plus className="h-4 w-4" />
                        )}
                        إضافة عنوان
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setIsImportDialogOpen(true)}
                        disabled={!canAddMoreHeadlines}
                        className="h-10 px-3 gap-1.5"
                        title="استيراد خبر من المقالات المنشورة"
                        data-testid="button-import-from-articles"
                      >
                        <Sparkles className="h-4 w-4 text-amber-500" />
                        <span className="hidden sm:inline">استيراد خبر</span>
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Headlines List */}
                {localHeadlines.length === 0 ? (
                  <div className="text-center py-12 px-4 text-muted-foreground border border-dashed rounded-xl bg-muted/15 space-y-3">
                    <Flame className="h-9 w-9 mx-auto text-red-500/40" />
                    <div className="space-y-1">
                      <p className="font-medium text-foreground text-sm">
                        لا توجد عناوين في هذا الموضوع بعد
                      </p>
                      <p className="text-xs text-muted-foreground">
                        اكتب عنواناً في الشريط أعلاه أو استورد خبراً منشوراً بضغطة واحدة
                      </p>
                    </div>
                    <div className="flex items-center justify-center gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setIsImportDialogOpen(true)}
                        className="gap-1.5 text-xs"
                      >
                        <FileDown className="h-3.5 w-3.5" />
                        استيراد من أحدث الأخبار
                      </Button>
                    </div>
                  </div>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={localHeadlines.map((h) => h.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div>
                        {localHeadlines.map((headline, idx) => (
                          <SortableHeadlineRow
                            key={headline.id}
                            headline={headline}
                            index={idx}
                            totalCount={localHeadlines.length}
                            isTopicActive={!!currentTopicObj?.isActive}
                            recentArticles={recentArticles}
                            onUpdate={handleUpdateHeadline}
                            onDelete={handleDeleteHeadline}
                            onMoveUp={() => handleMoveHeadline(idx, "up")}
                            onMoveDown={() => handleMoveHeadline(idx, "down")}
                            isUpdating={updateHeadlineMutation.isPending}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Create Topic Dialog */}
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogContent dir="rtl" className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle data-testid="text-create-dialog-title">
                موضوع عاجل جديد
              </DialogTitle>
              <DialogDescription>
                أدخل عنوان الموضوع أو اختر من القوالب السريعة للأخبار العاجلة
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  عنوان الموضوع (يظهر كشارة بجانب كلمة عاجل)
                </label>
                <Input
                  value={newTopicTitle}
                  onChange={(e) => setNewTopicTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newTopicTitle.trim()) {
                      createTopicMutation.mutate({
                        topicTitle: newTopicTitle.trim(),
                        activateImmediately: newTopicActivateImmediately,
                        expireHours: newTopicExpireHours,
                      });
                    }
                  }}
                  placeholder="مثال: أمر ملكي، عاجل، تغطية خاصة..."
                  className="text-right"
                  data-testid="input-new-topic-title"
                />
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  {TOPIC_QUICK_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setNewTopicTitle(preset)}
                      className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                        newTopicTitle === preset
                          ? "border-red-500 bg-red-500/10 text-red-600 dark:text-red-400 font-medium"
                          : "border-border hover:bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground block">
                  مدة عرض الشريط العاجل (اختياري)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {EXPIRATION_OPTIONS.map((opt) => (
                    <button
                      key={String(opt.hours)}
                      type="button"
                      onClick={() => setNewTopicExpireHours(opt.hours)}
                      className={`px-2.5 py-1.5 rounded-lg border text-xs transition-colors text-center ${
                        newTopicExpireHours === opt.hours
                          ? "border-primary bg-primary/10 text-primary font-medium"
                          : "border-border/70 hover:bg-muted text-muted-foreground"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border/70 bg-muted/20 cursor-pointer">
                <div>
                  <span className="text-sm font-medium block">تفعيل الموضوع فور الإنشاء</span>
                  <span className="text-xs text-muted-foreground">
                    سيتم إيقاف أي موضوع آخر نشط تلقائياً
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={newTopicActivateImmediately}
                  onChange={(e) => setNewTopicActivateImmediately(e.target.checked)}
                  className="h-4 w-4 accent-red-600 rounded"
                />
              </label>
            </div>
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setIsCreateDialogOpen(false)}
                data-testid="button-cancel-create"
              >
                إلغاء
              </Button>
              <Button
                onClick={() =>
                  createTopicMutation.mutate({
                    topicTitle: newTopicTitle.trim(),
                    activateImmediately: newTopicActivateImmediately,
                    expireHours: newTopicExpireHours,
                  })
                }
                disabled={!newTopicTitle.trim() || createTopicMutation.isPending}
                className="bg-red-600 hover:bg-red-700 text-white"
                data-testid="button-confirm-create"
              >
                {createTopicMutation.isPending && (
                  <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                )}
                إنشاء
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Quick Import from Published/Breaking Articles Dialog */}
        <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
          <DialogContent dir="rtl" className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-amber-500" />
                استيراد خبر إلى الشريط العاجل
              </DialogTitle>
              <DialogDescription>
                اختر خبراً منشوراً لإضافته فوراً كعنوان عاجل مع ربطه بالمقال تلقائياً (
                {localHeadlines.length} / {MAX_HEADLINES} عناوين مستخدمة)
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="h-4 w-4 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <Input
                    value={importSearchTerm}
                    onChange={(e) => setImportSearchTerm(e.target.value)}
                    placeholder="ابحث بعنوان الخبر..."
                    className="pr-9 text-right"
                    data-testid="input-import-article-search"
                  />
                </div>
                <div className="inline-flex items-center rounded-lg border border-border p-0.5 bg-muted/40 text-xs shrink-0">
                  <button
                    type="button"
                    onClick={() => setImportFilterType("all")}
                    className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                      importFilterType === "all"
                        ? "bg-background text-foreground shadow-2xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    أحدث المنشور
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportFilterType("breaking")}
                    className={`px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1 ${
                      importFilterType === "breaking"
                        ? "bg-red-600 text-white shadow-2xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Flame className="h-3 w-3" />
                    الأخبار العاجلة
                  </button>
                </div>
              </div>

              <div className="max-h-[340px] overflow-y-auto divide-y divide-border/60 border border-border/70 rounded-xl">
                {isLoadingRecentArticles ? (
                  <div className="py-12 text-center text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                    <span className="text-xs">جاري تحميل الأخبار المنشورة...</span>
                  </div>
                ) : filteredImportArticles.length === 0 ? (
                  <div className="py-10 text-center text-muted-foreground text-sm">
                    لا توجد أخبار مطابقة
                  </div>
                ) : (
                  filteredImportArticles.map((article) => {
                    const alreadyAdded = localHeadlines.some(
                      (h) => h.linkedArticleId === article.id || h.headline === article.title
                    );
                    return (
                      <div
                        key={article.id}
                        className="p-3 hover:bg-muted/40 transition-colors flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {article.newsType === "breaking" && (
                              <Badge className="bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/25 text-[10px] px-1.5 py-0 h-4">
                                عاجل
                              </Badge>
                            )}
                            {article.category?.nameAr && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                                {article.category.nameAr}
                              </Badge>
                            )}
                            {article.publishedAt && (
                              <span className="text-[11px] text-muted-foreground">
                                {formatRelativeTimeAr(article.publishedAt)}
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-medium text-foreground line-clamp-2">
                            {article.title}
                          </p>
                        </div>

                        <Button
                          size="sm"
                          variant={alreadyAdded ? "secondary" : "default"}
                          disabled={
                            alreadyAdded ||
                            !canAddMoreHeadlines ||
                            createHeadlineMutation.isPending
                          }
                          onClick={() => handleImportArticle(article)}
                          className="shrink-0 text-xs h-8"
                          data-testid={`button-import-article-${article.id}`}
                        >
                          {alreadyAdded ? (
                            <>
                              <Check className="h-3.5 w-3.5 ml-1" />
                              مُضاف
                            </>
                          ) : (
                            <>
                              <Plus className="h-3.5 w-3.5 ml-1" />
                              إضافة للشريط
                            </>
                          )}
                        </Button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsImportDialogOpen(false)}
                data-testid="button-close-import-dialog"
              >
                إغلاق
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Topic AlertDialog */}
        <AlertDialog open={!!deletingTopic} onOpenChange={() => setDeletingTopic(null)}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle data-testid="text-delete-topic-dialog-title">
                تأكيد الحذف
              </AlertDialogTitle>
              <AlertDialogDescription>
                هل أنت متأكد من حذف الموضوع "{deletingTopic?.topicTitle}"؟ سيتم حذف جميع العناوين
                المرتبطة به نهائياً.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel data-testid="button-cancel-delete-topic">
                إلغاء
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deletingTopic && deleteTopicMutation.mutate(deletingTopic.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-delete-topic"
              >
                {deleteTopicMutation.isPending && (
                  <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                )}
                حذف
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete Headline AlertDialog */}
        <AlertDialog open={!!deletingHeadline} onOpenChange={() => setDeletingHeadline(null)}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle data-testid="text-delete-headline-dialog-title">
                تأكيد حذف العنوان
              </AlertDialogTitle>
              <AlertDialogDescription>
                هل أنت متأكد من حذف هذا العنوان من الشريط العاجل؟
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel data-testid="button-cancel-delete-headline">
                إلغاء
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() =>
                  deletingHeadline && deleteHeadlineMutation.mutate(deletingHeadline.id)
                }
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-delete-headline"
              >
                {deleteHeadlineMutation.isPending && (
                  <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                )}
                حذف
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
