import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import DOMPurify from "isomorphic-dompurify";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useFocusSession } from "@/hooks/useFocusSession";
import { SocialShareBar } from "@/components/SocialShareBar";
import { useTheme } from "@/components/ThemeProvider";
import { apiRequest } from "@/lib/queryClient";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import "@/styles/focus-reader.css";
import { X, Share2, Clock, CheckCircle2, Eye, Type, Sun, Moon, MoreHorizontal, ChartNoAxesColumnIncreasing } from "lucide-react";

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
    title: "قراءة مركّزة",
    more: "المزيد من الخيارات",
    resume: "متابعة القراءة",
    backToArticle: "العودة للخبر",
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
    more: "More options",
    resume: "Continue reading",
    backToArticle: "Back to article",
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
    more: "مزید اختیارات",
    resume: "پڑھنا جاری رکھیں",
    backToArticle: "خبر پر واپس جائیں",
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
  const readerRef = useRef<HTMLDivElement | null>(null);
  // `summaryOpen` drives the post-session summary/share dialog. It is opened
  // either explicitly via the toolbar Share button OR automatically when the
  // user exits Focus Mode after a meaningful reading session.
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [generatedShareUrl, setGeneratedShareUrl] = useState<string | null>(null);
  const [isGeneratingShare, setIsGeneratingShare] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  // True when the summary dialog was opened as part of the exit flow; closing
  // it should then dismiss the entire reader overlay.
  const summaryShouldCloseReaderRef = useRef(false);
  const [fontSize, setFontSize] = useState<FontSize>(() => readStoredFontSize());

  useEffect(() => {
    if (typeof window === "undefined") return;
    try { window.localStorage.setItem(FONT_SIZE_KEY, fontSize); } catch { /* ignore */ }
  }, [fontSize]);

  const {
    sessionId,
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
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    readerRef.current?.querySelector<HTMLButtonElement>('[data-testid="button-focus-close"]')?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
      previousFocus?.focus({ preventScroll: true });
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
      if (e.defaultPrevented || summaryOpen) return;
      if (e.key === "Escape") {
        e.preventDefault();
        requestExit();
      }
      if (e.key === "Tab" && readerRef.current?.contains(document.activeElement)) {
        const controls = Array.from(readerRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex="0"]')).filter(el => el.getClientRects().length > 0);
        const first = controls[0], last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, requestExit, summaryOpen]);

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
      console.warn("Shortlink creation failed, falling back to full URL:", error);
    }
    return fullUrl;
  }, []);

  const handleShareClick = async () => {
    setShareError(null);
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
        setShareError(labels.sessionShareError);
        summaryShouldCloseReaderRef.current = false;
        setSummaryOpen(true);
      }
    } finally {
      setIsGeneratingShare(false);
    }
  };

  // Trigger from inside the summary dialog (post-exit) to generate a share link.
  const handleGenerateShareFromSummary = async () => {
    setShareError(null);
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
        setShareError(labels.sessionShareError);
      }
    } finally {
      setIsGeneratingShare(false);
    }
  };

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const isDark = theme === "dark";
  const publishedDate = publishedAt ? new Date(publishedAt) : null;
  const validPublishedDate = publishedDate && !Number.isNaN(publishedDate.getTime()) ? publishedDate : null;
  const dateLabel = validPublishedDate?.toLocaleDateString(
    language === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : language === "ur" ? "ur-PK-u-ca-gregory-nu-latn" : "en-US",
    { timeZone: "Asia/Riyadh", year: "numeric", month: "long", day: "numeric" },
  );

  const overlay = (
    <div
      ref={readerRef}
      className="focus-reader"
      dir={labels.dir}
      role="dialog"
      aria-modal="true"
      aria-label={labels.title}
      data-testid="overlay-focus-reader"
    >
      <header className="focus-reader-toolbar">
        <div className="focus-reader-toolbar-inner">
          <div className="focus-reader-session">
            <div className="focus-reader-mode"><Eye aria-hidden="true" /><span>{labels.title}</span></div>
            <div className="focus-reader-session-meta">
              <span className="focus-reader-timer" aria-label={labels.timer}><Clock aria-hidden="true" /><span data-testid="text-focus-timer">{formatDuration(focusedSeconds, language)}</span></span>
              <span className={completed ? "focus-reader-completed" : ""} data-testid={completed ? "status-focus-completed" : "status-focus-inprogress"}>
                {completed && <CheckCircle2 aria-hidden="true" />}{completed ? labels.completed : labels.inProgress}
              </span>
            </div>
          </div>
          <div className="focus-reader-controls">
            <div className="focus-reader-fonts" role="group" aria-label={labels.fontSize} data-testid="group-focus-font-size">
              <Type aria-hidden="true" />
              {(["sm", "md", "lg"] as const).map((sz) => (
                <Button key={sz} variant="ghost" size="sm" onClick={() => setFontSize(sz)} data-testid={`button-focus-font-${sz}`} aria-pressed={fontSize === sz}>
                  {sz === "sm" ? labels.fontSm : sz === "md" ? labels.fontMd : labels.fontLg}
                </Button>
              ))}
            </div>
            <Button variant="ghost" size="icon" className="focus-reader-icon-button" onClick={() => setTheme(isDark ? "light" : "dark")} data-testid="button-focus-theme-toggle" aria-label={isDark ? labels.lightMode : labels.darkMode} title={isDark ? labels.lightMode : labels.darkMode}>
              {isDark ? <Sun /> : <Moon />}
            </Button>
            <DropdownMenu dir={labels.dir}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="focus-reader-icon-button" aria-label={labels.more} title={labels.more} data-testid="button-focus-more"><MoreHorizontal /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="focus-reader-menu" align="end" sideOffset={8}>
                <DropdownMenuItem asChild><a href={getWeeklyReportPath(language)} data-testid="link-focus-weekly-report"><ChartNoAxesColumnIncreasing />{labels.weeklyReport}</a></DropdownMenuItem>
                <DropdownMenuItem onSelect={() => { void handleShareClick(); }} disabled={isGeneratingShare || (isLoggedIn && !sessionId)} data-testid="button-focus-share"><Share2 />{labels.share}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <Button variant="ghost" size="icon" className="focus-reader-icon-button focus-reader-exit" onClick={handleClose} data-testid="button-focus-close" aria-label={labels.exit} title={labels.exit}><X /></Button>
        </div>
      </header>

      {/* Reader body */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="focus-reader-scroll"
        data-testid="scroll-focus-reader"
      >
        <article
          className="focus-reader-article"
          data-testid="article-focus-content"
        >
          <header className="focus-reader-heading">
            {categoryName ? (
              <div className="focus-reader-category" data-testid="text-focus-article-category">
                {categoryName}
              </div>
            ) : null}
            <h1 className="focus-reader-title" data-testid="text-focus-article-title">
              {title}
            </h1>
            {subtitle ? (
              <p className="focus-reader-subtitle" data-testid="text-focus-article-subtitle">
                {subtitle}
              </p>
            ) : null}
            {(authorName || validPublishedDate) && (
              <div className="focus-reader-byline">
                {authorName ? <span data-testid="text-focus-article-author">{authorName}</span> : null}
                {validPublishedDate && <time dateTime={validPublishedDate.toISOString()} data-testid="text-focus-article-date"><Clock aria-hidden="true" />{dateLabel}</time>}
              </div>
            )}
          </header>

          {articleImageUrl ? (
            <figure
              className="focus-reader-hero"
              data-testid="figure-focus-article-image"
            >
              {/* Preserve the natural aspect ratio of the hero image
                  (Task #69 requirement) — never crop or letterbox. */}
              <img
                src={articleImageUrl}
                alt={title}
                className="focus-reader-image"
                loading="eager"
                data-testid="img-focus-article"
              />
            </figure>
          ) : null}

          <div
            className={`focus-reader-prose prose max-w-none dark:prose-invert prose-headings:font-semibold prose-img:rounded-md ${FONT_SIZE_CLASSES[fontSize]}`}
            data-font-size={fontSize}
            data-testid="container-focus-article-body"
            dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
          />

          {!isLoggedIn ? (
            <div
              className="focus-reader-login"
              data-testid="banner-focus-login-cta"
            >
              {labels.loginRequired}
            </div>
          ) : null}
        </article>
      </div>

      {/* Session summary / share dialog. Opens automatically on exit
          (after >=10s of focused reading) and from the toolbar Share button. */}
      {summaryOpen && <div className="focus-reader-dim" aria-hidden="true" />}
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
        <DialogContent className="focus-reader-summary" dir={labels.dir} data-testid="dialog-focus-share">
          <DialogHeader>
            <DialogTitle>{labels.shareTitle}</DialogTitle>
            <DialogDescription>{labels.shareDescription}</DialogDescription>
          </DialogHeader>
          <div className="mt-2 space-y-3">
            {shareError && <p role="alert" className="text-sm text-destructive leading-relaxed" data-testid="text-focus-share-error">{shareError}</p>}
            {!isLoggedIn && <p className="text-sm text-muted-foreground leading-relaxed">{labels.loginRequired}</p>}
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
          <DialogClose asChild>
            <Button variant="outline" className="w-full" data-testid="button-focus-summary-close">
              {summaryShouldCloseReaderRef.current ? labels.backToArticle : labels.resume}
            </Button>
          </DialogClose>
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
