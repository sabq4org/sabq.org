import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import DOMPurify from "isomorphic-dompurify";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useFocusSession } from "@/hooks/useFocusSession";
import { SocialShareBar } from "@/components/SocialShareBar";
import { useTheme } from "@/components/ThemeProvider";
import { apiRequest } from "@/lib/queryClient";
import { X, Share2, Clock, CheckCircle2, Eye, Type, Sun, Moon } from "lucide-react";

export type FocusReaderLanguage = "ar" | "en" | "ur";

interface FocusReaderProps {
  open: boolean;
  onClose: () => void;
  articleId: string;
  language: FocusReaderLanguage;
  isLoggedIn: boolean;
  title: string;
  subtitle?: string | null;
  contentHtml: string;
  authorName?: string | null;
  publishedAt?: string | Date | null;
  articleSlug?: string | null;
  articleImageUrl?: string | null;
  categoryName?: string | null;
}

type FontSize = "sm" | "md" | "lg";
const FONT_SIZE_KEY = "sabq:focus_font_size:v1";

const FONT_SIZE_CLASSES: Record<FontSize, string> = {
  sm: "prose-base",
  md: "prose-lg",
  lg: "prose-xl",
};

const LABELS = {
  ar: {
    dir: "rtl" as const,
    title: "نمط القراءة المركّزة",
    description: "اقرأ المقال بدون تشتيت واحتفظ بسجل جلسات قراءتك",
    exit: "إنهاء",
    share: "مشاركة الجلسة",
    timer: "زمن التركيز",
    completed: "اكتملت القراءة",
    inProgress: "قيد القراءة",
    weeklyReport: "تقريري الأسبوعي",
    shareTitle: "مشاركة جلسة القراءة",
    shareDescription: "شارك إنجازك في القراءة المركّزة مع أصدقائك",
    loginRequired: "سجّل الدخول لحفظ جلسات القراءة وعرض تقرير أسبوعي",
    sessionShared: "تم إنشاء رابط الجلسة",
    sessionShareError: "تعذر إنشاء رابط المشاركة",
    fontSize: "حجم الخط",
    fontSm: "صغير",
    fontMd: "متوسط",
    fontLg: "كبير",
    toggleTheme: "تبديل المظهر",
    lightMode: "الوضع النهاري",
    darkMode: "الوضع الليلي",
  },
  en: {
    dir: "ltr" as const,
    title: "Focus Reading Mode",
    description: "Read distraction-free and keep a record of your reading sessions",
    exit: "Exit",
    share: "Share session",
    timer: "Focus time",
    completed: "Reading completed",
    inProgress: "In progress",
    weeklyReport: "My weekly report",
    shareTitle: "Share reading session",
    shareDescription: "Share your focused reading achievement with friends",
    loginRequired: "Sign in to save reading sessions and see a weekly report",
    sessionShared: "Session link created",
    sessionShareError: "Could not create share link",
    fontSize: "Font size",
    fontSm: "Small",
    fontMd: "Medium",
    fontLg: "Large",
    toggleTheme: "Toggle theme",
    lightMode: "Light mode",
    darkMode: "Dark mode",
  },
  ur: {
    dir: "rtl" as const,
    title: "توجہ مرکوز پڑھائی",
    description: "بغیر کسی خلل کے پڑھیں اور اپنی پڑھائی کا ریکارڈ رکھیں",
    exit: "اختتام",
    share: "سیشن شیئر کریں",
    timer: "توجہ کا وقت",
    completed: "پڑھائی مکمل",
    inProgress: "جاری ہے",
    weeklyReport: "میری ہفتہ وار رپورٹ",
    shareTitle: "پڑھائی کا سیشن شیئر کریں",
    shareDescription: "اپنی مرکوز پڑھائی کی کامیابی دوستوں کے ساتھ شیئر کریں",
    loginRequired: "سیشن محفوظ کرنے اور ہفتہ وار رپورٹ دیکھنے کے لیے سائن ان کریں",
    sessionShared: "سیشن لنک بن گیا",
    sessionShareError: "شیئر لنک نہیں بن سکا",
    fontSize: "فونٹ سائز",
    fontSm: "چھوٹا",
    fontMd: "درمیانہ",
    fontLg: "بڑا",
    toggleTheme: "تھیم تبدیل کریں",
    lightMode: "روشن موڈ",
    darkMode: "تاریک موڈ",
  },
};

function formatDuration(totalSeconds: number, lang: FocusReaderLanguage): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (lang === "ar") {
    if (m === 0) return `${s} ث`;
    return `${m} د ${s.toString().padStart(2, "0")} ث`;
  }
  if (lang === "ur") {
    if (m === 0) return `${s} سیکنڈ`;
    return `${m} منٹ ${s.toString().padStart(2, "0")} سیکنڈ`;
  }
  if (m === 0) return `${s}s`;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function getWeeklyReportPath(lang: FocusReaderLanguage): string {
  if (lang === "en") return "/en/focus/weekly";
  if (lang === "ur") return "/ur/focus/weekly";
  return "/focus/weekly";
}

function readStoredFontSize(): FontSize {
  if (typeof window === "undefined") return "md";
  try {
    const v = window.localStorage.getItem(FONT_SIZE_KEY);
    if (v === "sm" || v === "md" || v === "lg") return v;
  } catch { /* ignore */ }
  return "md";
}

interface ShortLinkResponse {
  shortCode: string;
  originalUrl: string;
}

export function FocusReader({
  open,
  onClose,
  articleId,
  language,
  isLoggedIn,
  title,
  subtitle,
  contentHtml,
  authorName,
  publishedAt,
  articleSlug,
  articleImageUrl,
  categoryName,
}: FocusReaderProps) {
  const labels = LABELS[language];
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  // `summaryOpen` drives the post-session summary/share dialog. It is opened
  // either explicitly via the toolbar Share button OR automatically when the
  // user exits Focus Mode after a meaningful reading session.
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [generatedShareUrl, setGeneratedShareUrl] = useState<string | null>(null);
  const [isGeneratingShare, setIsGeneratingShare] = useState(false);
  // True when the summary dialog was opened as part of the exit flow; closing
  // it should then dismiss the entire reader overlay.
  const summaryShouldCloseReaderRef = useRef(false);
  const [fontSize, setFontSize] = useState<FontSize>(() => readStoredFontSize());

  useEffect(() => {
    if (typeof window === "undefined") return;
    try { window.localStorage.setItem(FONT_SIZE_KEY, fontSize); } catch { /* ignore */ }
  }, [fontSize]);

  const {
    focusedSeconds,
    completed,
    markCompleted,
    finalizeSession,
    generateShareSlug,
  } = useFocusSession({
    articleId,
    language,
    isLoggedIn,
    active: open,
    articleSnapshot: {
      title,
      slug: articleSlug || null,
      imageUrl: articleImageUrl || null,
      categoryName: categoryName || null,
    },
  });

  const sanitizedHtml = DOMPurify.sanitize(contentHtml || "", {
    ADD_ATTR: ["target", "rel"],
  });

  // Track scroll progress to detect completion
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const total = el.scrollHeight - el.clientHeight;
    if (total <= 0) {
      markCompleted();
      return;
    }
    const ratio = el.scrollTop / total;
    if (ratio >= 0.85 && !completed) {
      markCompleted();
    }
  }, [markCompleted, completed]);

  // Lock background scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Always present the post-session summary dialog on exit per the Focus Mode
  // spec — even for very short sessions. The dialog itself is dismissable so
  // ultra-short / accidental opens add at most one click.
  const requestExit = useCallback(() => {
    finalizeSession(completed);
    summaryShouldCloseReaderRef.current = true;
    setSummaryOpen(true);
  }, [completed, finalizeSession]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        requestExit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, requestExit]);

  const handleClose = () => {
    requestExit();
  };

  const buildShortShareUrl = useCallback(async (slug: string): Promise<string> => {
    const fullUrl = `${window.location.origin}/focus/session/${slug}`;
    try {
      const created = await apiRequest("/api/shortlinks", {
        method: "POST",
        body: JSON.stringify({
          originalUrl: fullUrl,
          utmSource: "focus_share",
          utmMedium: "social",
          utmCampaign: "focus_session",
          utmContent: slug,
        }),
        headers: { "Content-Type": "application/json" },
        silent: true,
      }) as ShortLinkResponse | null;
      if (created?.shortCode) {
        return `${window.location.origin}/s/${created.shortCode}`;
      }
    } catch (error) {
      console.debug("Shortlink creation failed, falling back to full URL:", error);
    }
    return fullUrl;
  }, []);

  const handleShareClick = async () => {
    if (!isLoggedIn) {
      toast({ title: labels.loginRequired });
      // Still surface the summary dialog so the guest sees their session stats.
      summaryShouldCloseReaderRef.current = false;
      setSummaryOpen(true);
      return;
    }
    setIsGeneratingShare(true);
    try {
      const slug = await generateShareSlug();
      if (slug) {
        const url = await buildShortShareUrl(slug);
        setGeneratedShareUrl(url);
        // Opening the dialog from the toolbar should NOT close the reader on dismiss.
        summaryShouldCloseReaderRef.current = false;
        setSummaryOpen(true);
        toast({ title: labels.sessionShared });
      } else {
        toast({ title: labels.sessionShareError, variant: "destructive" });
      }
    } finally {
      setIsGeneratingShare(false);
    }
  };

  // Trigger from inside the summary dialog (post-exit) to generate a share link.
  const handleGenerateShareFromSummary = async () => {
    if (!isLoggedIn) {
      toast({ title: labels.loginRequired });
      return;
    }
    setIsGeneratingShare(true);
    try {
      const slug = await generateShareSlug();
      if (slug) {
        const url = await buildShortShareUrl(slug);
        setGeneratedShareUrl(url);
        toast({ title: labels.sessionShared });
      } else {
        toast({ title: labels.sessionShareError, variant: "destructive" });
      }
    } finally {
      setIsGeneratingShare(false);
    }
  };

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const isDark = theme === "dark";

  const overlay = (
    <div
      className="fixed inset-0 z-[10000] bg-background overflow-hidden"
      dir={labels.dir}
      data-testid="overlay-focus-reader"
    >
      {/* Cinematic Ambient Reader Background */}
      {articleImageUrl && (
        <div className="absolute inset-0 pointer-events-none select-none overflow-hidden z-0">
          <div
            className="absolute inset-0 bg-cover bg-center filter blur-[130px] scale-[1.6] opacity-[0.05] dark:opacity-[0.18] transition-all duration-1000 animate-ambient-glow"
            style={{
              backgroundImage: `url(${articleImageUrl})`,
            }}
          />
        </div>
      )}

      {/* Top toolbar */}
      <div className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              data-testid="button-focus-close"
              aria-label={labels.exit}
            >
              <X className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" aria-hidden="true" />
              <span data-testid="text-focus-timer" className="tabular-nums">
                {formatDuration(focusedSeconds, language)}
              </span>
              {completed ? (
                <span className="ms-2 inline-flex items-center gap-1 text-success" data-testid="status-focus-completed">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  <span>{labels.completed}</span>
                </span>
              ) : (
                <span className="ms-2 inline-flex items-center gap-1" data-testid="status-focus-inprogress">
                  <Eye className="h-4 w-4" aria-hidden="true" />
                  <span>{labels.inProgress}</span>
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="inline-flex items-center gap-1 rounded-md border bg-muted/40 p-1"
              role="group"
              aria-label={labels.fontSize}
              data-testid="group-focus-font-size"
            >
              <Type className="mx-1 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              {(["sm", "md", "lg"] as const).map((sz) => (
                <Button
                  key={sz}
                  variant="ghost"
                  size="sm"
                  className={`min-h-7 px-2 text-xs ${fontSize === sz ? "toggle-elevate toggle-elevated" : ""}`}
                  onClick={() => setFontSize(sz)}
                  data-testid={`button-focus-font-${sz}`}
                  aria-pressed={fontSize === sz}
                >
                  {sz === "sm" ? labels.fontSm : sz === "md" ? labels.fontMd : labels.fontLg}
                </Button>
              ))}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(isDark ? "light" : "dark")}
              data-testid="button-focus-theme-toggle"
              aria-label={isDark ? labels.lightMode : labels.darkMode}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <a
              href={getWeeklyReportPath(language)}
              className="text-sm text-primary underline-offset-4 hover:underline"
              data-testid="link-focus-weekly-report"
            >
              {labels.weeklyReport}
            </a>
            <Button
              variant="outline"
              size="sm"
              onClick={handleShareClick}
              disabled={isGeneratingShare}
              data-testid="button-focus-share"
            >
              <Share2 className="me-2 h-4 w-4" />
              {labels.share}
            </Button>
          </div>
        </div>
      </div>

      {/* Reader body */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="relative z-10 h-[calc(100vh-3.75rem)] overflow-y-auto"
      >
        <article
          className="mx-auto max-w-2xl px-4 py-10 sm:py-14"
          data-testid="article-focus-content"
        >
          <header className="mb-8">
            {categoryName ? (
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground" data-testid="text-focus-article-category">
                {categoryName}
              </div>
            ) : null}
            <h1 className="mb-3 text-3xl font-bold leading-tight sm:text-4xl" data-testid="text-focus-article-title">
              {title}
            </h1>
            {subtitle ? (
              <p className="text-lg text-muted-foreground" data-testid="text-focus-article-subtitle">
                {subtitle}
              </p>
            ) : null}
            {(authorName || publishedAt) && (
              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                {authorName ? <span data-testid="text-focus-article-author">{authorName}</span> : null}
                {authorName && publishedAt ? <span aria-hidden="true">•</span> : null}
                {publishedAt ? (
                  <time data-testid="text-focus-article-date">
                    {new Date(publishedAt).toLocaleDateString(
                      language === "ar" ? "ar-SA" : language === "ur" ? "ur-PK" : "en-US",
                      { year: "numeric", month: "long", day: "numeric" },
                    )}
                  </time>
                ) : null}
              </div>
            )}
          </header>

          {articleImageUrl ? (
            <figure
              className="mb-8 flex justify-center overflow-hidden rounded-md border bg-muted/30"
              data-testid="figure-focus-article-image"
            >
              {/* Preserve the natural aspect ratio of the hero image
                  (Task #69 requirement) — never crop or letterbox. */}
              <img
                src={articleImageUrl}
                alt={title}
                className="block h-auto w-full max-h-[70vh] object-contain"
                loading="eager"
                data-testid="img-focus-article"
              />
            </figure>
          ) : null}

          <div
            className={`prose max-w-none dark:prose-invert prose-headings:font-semibold prose-img:rounded-md ${FONT_SIZE_CLASSES[fontSize]}`}
            data-testid="container-focus-article-body"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
          />

          {!isLoggedIn ? (
            <div
              className="mt-12 rounded-md border bg-muted/50 p-4 text-sm text-muted-foreground"
              data-testid="banner-focus-login-cta"
            >
              {labels.loginRequired}
            </div>
          ) : null}
        </article>
      </div>

      {/* Session summary / share dialog. Opens automatically on exit
          (after >=10s of focused reading) and from the toolbar Share button. */}
      <Dialog
        open={summaryOpen}
        onOpenChange={(v) => {
          if (v) return;
          setSummaryOpen(false);
          if (summaryShouldCloseReaderRef.current) {
            summaryShouldCloseReaderRef.current = false;
            onClose();
          }
        }}
      >
        <DialogContent dir={labels.dir} data-testid="dialog-focus-share">
          <DialogHeader>
            <DialogTitle>{labels.shareTitle}</DialogTitle>
            <DialogDescription>{labels.shareDescription}</DialogDescription>
          </DialogHeader>
          <div className="mt-2 space-y-3">
            <div className="rounded-md border bg-muted/40 p-3 text-sm" data-testid="text-focus-share-summary">
              <div className="font-medium">{title}</div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
                <span>
                  {labels.timer}: <span className="tabular-nums">{formatDuration(focusedSeconds, language)}</span>
                </span>
                {completed ? (
                  <span className="inline-flex items-center gap-1 text-success" data-testid="text-focus-share-status">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{labels.completed}</span>
                  </span>
                ) : null}
              </div>
            </div>

            {generatedShareUrl ? (
              <>
                <div
                  className="break-all rounded-md border bg-muted/30 p-2 font-mono text-xs text-muted-foreground"
                  data-testid="text-focus-share-url"
                >
                  {generatedShareUrl}
                </div>
                <SocialShareBar
                  title={title}
                  url={generatedShareUrl}
                  description={subtitle || ""}
                  articleId={articleId}
                />
              </>
            ) : (
              <Button
                variant="default"
                size="sm"
                onClick={handleGenerateShareFromSummary}
                disabled={isGeneratingShare || !isLoggedIn}
                data-testid="button-focus-share-generate"
              >
                <Share2 className="me-2 h-4 w-4" />
                {labels.share}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );

  return createPortal(overlay, document.body);
}

interface FocusReaderTriggerProps {
  language: FocusReaderLanguage;
  onClick: () => void;
  className?: string;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
}

export function FocusReaderTrigger({
  language,
  onClick,
  className,
  variant = "outline",
  size = "sm",
}: FocusReaderTriggerProps) {
  const label = language === "en"
    ? "Focus mode"
    : language === "ur"
      ? "توجہ مرکوز پڑھائی"
      : "وضع التركيز";
  return (
    <Button
      variant={variant}
      size={size}
      onClick={onClick}
      className={className}
      data-testid="button-focus-mode-toggle"
    >
      <Eye className="me-2 h-4 w-4" />
      <span>{label}</span>
    </Button>
  );
}
