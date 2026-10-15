/**
 * معاينة مستقلة لإعادة تصميم صفحة إدارة المقالات — مسار /dashboard/articles-preview
 *
 * لا تلمس هذه الصفحة أي API للإنتاج:
 * - البيانات من `articles-preview/demoData` فقط.
 * - كل الإجراءات (نشر، تمييز، أرشفة، طلب تعديل…) تُعدّل النسخة المحلية في الذاكرة.
 * - لا توجد أي تعديلات على الصفحة الحالية `ArticlesManagement` أو مكوّناتها المشتركة.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import { Separator } from "@/components/ui/separator";
import { ToastAction } from "@/components/ui/toast";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
import { cn } from "@/lib/utils";
import {
  DEMO_ARTICLES,
  CATEGORIES,
  type DemoArticle,
  type DemoArticleType,
  type DemoSource,
  type DemoStatus,
} from "@/pages/articles-preview/demoData";
import {
  Archive,
  ArrowUpDown,
  Bell,
  BookOpen,
  Brain,
  CalendarClock,
  Check,
  CheckCheck,
  Clock,
  Eye,
  FilePenLine,
  FlaskConical,
  HeartPulse,
  Inbox,
  Languages,
  LayoutList,
  MoreVertical,
  Newspaper,
  PenLine,
  Plus,
  RotateCcw,
  Rows3,
  Search,
  Send,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Star,
  Tag,
  Undo2,
  Zap,
  type LucideIcon,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* ثوابت العرض                                                         */
/* ------------------------------------------------------------------ */

const TYPE_META: Record<DemoArticleType, { label: string; className: string; Icon: LucideIcon }> = {
  news: { label: "خبر", className: "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300", Icon: Newspaper },
  opinion: { label: "رأي", className: "border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300", Icon: PenLine },
  analysis: { label: "تحليل", className: "border-indigo-500/25 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300", Icon: Brain },
  column: { label: "عمود", className: "border-fuchsia-500/25 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300", Icon: FilePenLine },
  weekly_photos: { label: "صور", className: "border-orange-500/25 bg-orange-500/10 text-orange-700 dark:text-orange-300", Icon: BookOpen },
  infographic: { label: "إنفوجرافيك", className: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", Icon: Sparkles },
};

const STATUS_META: Record<DemoStatus, { label: string; className: string; dot: string }> = {
  published: { label: "منشور", className: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500" },
  scheduled: { label: "مجدول", className: "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300", dot: "bg-sky-500" },
  draft: { label: "مسودة", className: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300", dot: "bg-amber-500" },
  archived: { label: "مؤرشف", className: "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300", dot: "bg-rose-400" },
};

const SOURCE_META: Record<DemoSource, { label: string; Icon: LucideIcon }> = {
  manual: { label: "المحرر", Icon: PenLine },
  email: { label: "البريد الذكي", Icon: Inbox },
  whatsapp: { label: "واتساب", Icon: Share2 },
  "ios-app": { label: "تطبيق iOS", Icon: Newspaper },
  "android-app": { label: "تطبيق Android", Icon: Newspaper },
};

/* ------------------------------------------------------------------ */
/* أدوات مساعدة                                                        */
/* ------------------------------------------------------------------ */

function norm(value: string) {
  return value.toLowerCase().replace(/[\u064B-\u0652]/g, "").trim();
}

function arPlural(n: number, one: string, two: string, few: string) {
  if (n <= 1) return one;
  if (n === 2) return two;
  if (n >= 3 && n <= 10) return `${n} ${few}`;
  return `${n} ${one}`;
}

function timeAgo(iso: string | null) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const future = diff < 0;
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60_000);
  const hours = Math.round(abs / 3_600_000);
  const days = Math.round(abs / 86_400_000);
  let value: string;
  if (mins < 60) value = arPlural(mins, "دقيقة", "دقيقتين", "دقائق");
  else if (hours < 24) value = arPlural(hours, "ساعة", "ساعتين", "ساعات");
  else value = arPlural(days, "يوم", "يومين", "أيام");
  return future ? `بعد ${value}` : `قبل ${value}`;
}

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

function riyadhDay(iso: string | null) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function isToday(iso: string | null) {
  if (!iso) return false;
  return riyadhDay(iso) === riyadhDay(new Date().toISOString());
}

function daysSince(iso: string) {
  return (Date.now() - new Date(iso).getTime()) / 86_400_000;
}

/* ------------------------------------------------------------------ */
/* إشارات "يحتاج انتباهك"                                              */
/* ------------------------------------------------------------------ */

type AttentionReason = { key: string; label: string; className: string };

function attentionReason(a: DemoArticle): AttentionReason | null {
  if (a.reviewStatus === "pending_review") {
    return a.reviewedAt
      ? { key: "resubmitted", label: "عاد بعد تعديل", className: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300" }
      : { key: "pending", label: "بانتظار مراجعتك", className: "border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300" };
  }
  if (a.reviewStatus === "needs_changes") {
    return { key: "needs_changes", label: "بانتظار الكاتب", className: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300" };
  }
  if (a.status === "scheduled" && isToday(a.scheduledAt)) {
    return { key: "today", label: "جدولة اليوم", className: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300" };
  }
  if (a.status === "draft" && daysSince(a.updatedAt) >= 2) {
    return { key: "stale", label: "مسودة متأخرة", className: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300" };
  }
  return null;
}

function needsAttention(a: DemoArticle) {
  return attentionReason(a) !== null;
}

/* ------------------------------------------------------------------ */
/* الإجراءات                                                           */
/* ------------------------------------------------------------------ */

type RowActionId =
  | "open"
  | "edit"
  | "publish"
  | "feature"
  | "breaking"
  | "revision"
  | "archive"
  | "restore"
  | "translate"
  | "resurface"
  | "notify"
  | "social"
  | "ai"
  | "schedule"
  | "reading";

interface ActionDef {
  id: RowActionId;
  label: string;
  Icon: LucideIcon;
  destructive?: boolean;
}

function getRowActions(a: DemoArticle): {
  primary: ActionDef;
  quick: ActionDef[];
  overflow: ActionDef[];
} {
  const edit: ActionDef = { id: "edit", label: "تعديل", Icon: FilePenLine };
  const publish: ActionDef = { id: "publish", label: "نشر", Icon: Send };
  const feature: ActionDef = { id: "feature", label: a.isFeatured ? "إلغاء التمييز" : "تمييز", Icon: Star };
  const breaking: ActionDef = { id: "breaking", label: a.newsType === "breaking" ? "إلغاء العاجل" : "خبر عاجل", Icon: Zap };
  const revision: ActionDef = { id: "revision", label: "طلب تعديل", Icon: FilePenLine };
  const archive: ActionDef = { id: "archive", label: "أرشفة", Icon: Archive, destructive: true };
  const restore: ActionDef = { id: "restore", label: "استعادة", Icon: Undo2 };
  const translate: ActionDef = { id: "translate", label: "ترجمة للإنجليزية", Icon: Languages };
  const resurface: ActionDef = { id: "resurface", label: "إنعاش", Icon: HeartPulse };
  const notify: ActionDef = { id: "notify", label: "إرسال إشعار", Icon: Bell };
  const social: ActionDef = { id: "social", label: "نشر على X", Icon: Share2 };
  const ai: ActionDef = { id: "ai", label: "تصنيف ذكي", Icon: Sparkles };
  const schedule: ActionDef = { id: "schedule", label: "تعديل الجدولة", Icon: CalendarClock };
  const reading: ActionDef = { id: "reading", label: a.isReading ? "إيقاف وضع القراءة" : "وضع القراءة", Icon: BookOpen };

  if (a.status === "archived") {
    return { primary: restore, quick: [edit], overflow: [translate, archive] };
  }
  if (a.status === "draft") {
    if (a.reviewStatus === "needs_changes") {
      return { primary: { id: "revision", label: "تذكير الكاتب", Icon: Bell }, quick: [edit, publish], overflow: [feature, schedule, ai, archive] };
    }
    if (a.reviewStatus === "pending_review") {
      return { primary: { id: "open", label: "مراجعة", Icon: Eye }, quick: [publish, edit], overflow: [feature, revision, schedule, ai, archive] };
    }
    return { primary: publish, quick: [edit, schedule], overflow: [feature, breaking, ai, archive] };
  }
  if (a.status === "scheduled") {
    return { primary: schedule, quick: [edit, publish], overflow: [feature, breaking, revision, ai, archive] };
  }
  // published
  return {
    primary: social,
    quick: [feature, breaking],
    overflow: [edit, notify, translate, resurface, revision, archive],
  };
}

/* ------------------------------------------------------------------ */
/* عناصر واجهة صغيرة                                                   */
/* ------------------------------------------------------------------ */

function Chip({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold", className)}>
      {children}
    </span>
  );
}

function IconAction({
  action,
  onClick,
  testId,
}: {
  action: ActionDef;
  onClick: () => void;
  testId?: string;
}) {
  const { Icon, label, destructive } = action;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      title={label}
      aria-label={label}
      onClick={onClick}
      data-testid={testId}
      className={cn(
        "h-9 w-9 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground",
        destructive && "hover:text-destructive",
      )}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}

function Thumb({ article, size = "md" }: { article: DemoArticle; size?: "md" | "lg" }) {
  const color = article.category.color;
  return (
    <div
      aria-hidden
      className={cn(
        "relative shrink-0 overflow-hidden rounded-xl border",
        size === "lg" ? "h-16 w-24" : "h-11 w-14",
      )}
      style={{ backgroundColor: `${color}1f`, borderColor: `${color}55` }}
    >
      <span
        className="absolute inset-0"
        style={{ backgroundImage: `linear-gradient(135deg, ${color}40, transparent 70%)` }}
      />
      <span
        className="absolute inset-0 flex items-center justify-center text-[11px] font-bold"
        style={{ color }}
      >
        {article.category.name}
      </span>
      {article.isAiGeneratedThumbnail ? (
        <span className="absolute bottom-0.5 left-0.5 rounded bg-violet-600/90 px-1 text-[8px] font-bold text-white">
          AI
        </span>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* عنصر قائمة المقال                                                   */
/* ------------------------------------------------------------------ */

function ArticleRow({
  article,
  selected,
  compact,
  onToggle,
  onOpen,
  onAction,
}: {
  article: DemoArticle;
  selected: boolean;
  compact: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onAction: (id: RowActionId, article: DemoArticle) => void;
}) {
  const typeMeta = TYPE_META[article.articleType] ?? TYPE_META.news;
  const statusMeta = STATUS_META[article.status];
  const sourceMeta = SOURCE_META[article.source];
  const reason = attentionReason(article);
  const { primary, quick, overflow } = getRowActions(article);
  const TypeIcon = typeMeta.Icon;
  const SourceIcon = sourceMeta.Icon;

  const accent = article.newsType === "breaking"
    ? "bg-red-500"
    : reason?.key === "needs_changes"
      ? "bg-rose-500"
      : reason?.key === "pending"
        ? "bg-orange-500"
        : reason?.key === "resubmitted"
          ? "bg-amber-500"
          : statusMeta.dot;

  const body = (
    <div className="flex min-w-0 flex-1 items-start gap-3">
      <div
        className="-m-2.5 shrink-0 cursor-pointer p-2.5"
        onClick={(e) => {
          if (e.target === e.currentTarget) onToggle();
        }}
      >
        <Checkbox
          className="pointer-events-none mt-1.5"
          checked={selected}
          onCheckedChange={() => onToggle()}
          data-testid={`preview-check-${article.id}`}
        />
      </div>

      <button
        type="button"
        onClick={onOpen}
        className="hidden shrink-0 sm:block"
        aria-label={`فتح تفاصيل: ${article.title}`}
      >
        <Thumb article={article} />
      </button>

      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={onOpen}
          className="block w-full text-start"
          data-testid={`preview-open-${article.id}`}
        >
          <h3 className={cn("text-[15px] font-medium leading-relaxed text-foreground", compact ? "line-clamp-1" : "line-clamp-2", "hover:text-primary")}>
            {article.title}
          </h3>
        </button>

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Chip className={statusMeta.className}>
            <span className={cn("h-1.5 w-1.5 rounded-full", statusMeta.dot)} />
            {statusMeta.label}
          </Chip>
          <Chip className={typeMeta.className}>
            <TypeIcon className="h-3 w-3" />
            {typeMeta.label}
          </Chip>
          <Chip className="border-transparent bg-muted text-muted-foreground">
            <Tag className="h-3 w-3" style={{ color: article.category.color }} />
            {article.category.name}
          </Chip>
          <Chip className="border-transparent bg-muted text-muted-foreground">
            <SourceIcon className="h-3 w-3" />
            {article.author?.name ?? sourceMeta.label}
          </Chip>
          {reason ? <Chip className={reason.className}>{reason.label}</Chip> : null}
          {article.newsType === "breaking" ? (
            <Chip className="border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300">
              <Zap className="h-3 w-3" /> عاجل
            </Chip>
          ) : null}
          {article.isFeatured ? (
            <Chip className="border-yellow-500/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300">
              <Star className="h-3 w-3 fill-current" /> مميز
            </Chip>
          ) : null}
        </div>

        {!compact ? (
          <p className="mt-1.5 line-clamp-1 text-[13px] leading-6 text-muted-foreground">{article.excerpt}</p>
        ) : null}

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground tabular-nums">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {article.status === "scheduled" ? timeAgo(article.scheduledAt) : timeAgo(article.updatedAt)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Eye className="h-3 w-3" />
            {article.views.toLocaleString("en-US")}
          </span>
          <span className="inline-flex items-center gap-1">
            <BookOpen className="h-3 w-3" />
            {article.readingTime} د
          </span>
        </div>
      </div>
    </div>
  );

  const actions = (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        size="sm"
        variant={article.newsType === "breaking" ? "destructive" : "outline"}
        onClick={() => onAction(primary.id, article)}
        data-testid={`preview-primary-${article.id}`}
        className="h-8 gap-1.5 px-2.5 text-xs"
      >
        <primary.Icon className="h-3.5 w-3.5" />
        {primary.label}
      </Button>
      {quick.map((action) => (
        <IconAction
          key={action.id}
          action={action}
          onClick={() => onAction(action.id, article)}
          testId={`preview-quick-${action.id}-${article.id}`}
        />
      ))}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="المزيد من الإجراءات"
            data-testid={`preview-more-${article.id}`}
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuLabel className="text-xs text-muted-foreground">إجراءات</DropdownMenuLabel>
          {overflow.map((action) => (
            <DropdownMenuItem
              key={action.id}
              onClick={() => onAction(action.id, article)}
              className={cn("gap-2 text-sm", action.destructive && "text-destructive focus:text-destructive")}
            >
              <action.Icon className="h-4 w-4" />
              {action.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  return (
    <li
      data-testid={`preview-row-${article.id}`}
      className={cn(
        "group relative overflow-hidden rounded-2xl border bg-card p-3 ps-4 shadow-none transition-colors hover:border-primary/30 hover:bg-muted/30",
        selected ? "border-primary/50 ring-1 ring-primary/25" : "border-border/80",
        compact && "py-2",
      )}
    >
      <span aria-hidden className={cn("absolute inset-y-2 start-0 w-1 rounded-full", accent)} />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
        {body}
        <div className="shrink-0 sm:pt-0.5">{actions}</div>
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* الصفحة                                                              */
/* ------------------------------------------------------------------ */

type ViewId =
  | "attention"
  | "all"
  | "pending"
  | "resubmitted"
  | "needs_changes"
  | "drafts"
  | "scheduled"
  | "published"
  | "breaking"
  | "archived";

const VIEWS: { id: ViewId; label: string; predicate: (a: DemoArticle) => boolean }[] = [
  { id: "attention", label: "يحتاج انتباهي", predicate: needsAttention },
  { id: "all", label: "الكل", predicate: () => true },
  { id: "pending", label: "بانتظار المراجعة", predicate: (a) => a.reviewStatus === "pending_review" && !a.reviewedAt },
  { id: "resubmitted", label: "عاد بعد تعديل", predicate: (a) => a.reviewStatus === "pending_review" && !!a.reviewedAt },
  { id: "needs_changes", label: "بانتظار الكاتب", predicate: (a) => a.reviewStatus === "needs_changes" },
  { id: "drafts", label: "المسودات", predicate: (a) => a.status === "draft" && a.reviewStatus === null },
  { id: "scheduled", label: "المجدولة", predicate: (a) => a.status === "scheduled" },
  { id: "published", label: "المنشورة", predicate: (a) => a.status === "published" },
  { id: "breaking", label: "العاجل", predicate: (a) => a.newsType === "breaking" },
  { id: "archived", label: "الأرشيف", predicate: (a) => a.status === "archived" },
];

type SortId = "updated" | "newest" | "views" | "scheduleSoon" | "waiting";

const SORTS: { id: SortId; label: string }[] = [
  { id: "updated", label: "الأحدث تحديثاً" },
  { id: "newest", label: "الأحدث نشراً" },
  { id: "waiting", label: "الأطول انتظاراً" },
  { id: "views", label: "الأكثر قراءة" },
  { id: "scheduleSoon", label: "الأقرب جدولة" },
];

export default function ArticlesManagementPreview() {
  useAuth({ redirectToLogin: true });
  const { toast } = useToast();

  const [articles, setArticles] = useState<DemoArticle[]>(() => DEMO_ARTICLES);
  const [view, setView] = useState<ViewId>("attention");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | DemoArticleType>("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | string>("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | DemoSource>("all");
  const [flagBreaking, setFlagBreaking] = useState(false);
  const [flagFeatured, setFlagFeatured] = useState(false);
  const [flagAi, setFlagAi] = useState(false);
  const [sort, setSort] = useState<SortId>("updated");
  const [compact, setCompact] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [noteDialog, setNoteDialog] = useState<{ kind: "archive" | "revision" | "bulk-archive"; article?: DemoArticle } | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // ⌘K / Ctrl+K لتركيز البحث — مثل بقية لوحة التحكم.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // مسح التحديد عند تبديل العرض.
  useEffect(() => {
    setSelected(new Set());
  }, [view]);

  const activeFiltersCount =
    (typeFilter !== "all" ? 1 : 0) +
    (categoryFilter !== "all" ? 1 : 0) +
    (sourceFilter !== "all" ? 1 : 0) +
    (flagBreaking ? 1 : 0) +
    (flagFeatured ? 1 : 0) +
    (flagAi ? 1 : 0);

  const filtered = useMemo(() => {
    const q = norm(search);
    const list = articles.filter((a) => {
      if (!VIEWS.find((v) => v.id === view)!.predicate(a)) return false;
      if (typeFilter !== "all" && a.articleType !== typeFilter) return false;
      if (categoryFilter !== "all" && a.category.id !== categoryFilter) return false;
      if (sourceFilter !== "all" && a.source !== sourceFilter) return false;
      if (flagBreaking && a.newsType !== "breaking") return false;
      if (flagFeatured && !a.isFeatured) return false;
      if (flagAi && !a.isAiGeneratedThumbnail) return false;
      if (q) {
        const hay = norm([a.title, a.excerpt, a.author?.name ?? "", a.category.name, ...a.tags].join(" "));
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sort) {
        case "views":
          return b.views - a.views;
        case "newest": {
          const da = new Date(a.publishedAt ?? a.createdAt).getTime();
          const db = new Date(b.publishedAt ?? b.createdAt).getTime();
          return db - da;
        }
        case "waiting":
          return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
        case "scheduleSoon": {
          const ta = a.scheduledAt ? new Date(a.scheduledAt).getTime() : Number.POSITIVE_INFINITY;
          const tb = b.scheduledAt ? new Date(b.scheduledAt).getTime() : Number.POSITIVE_INFINITY;
          if (ta !== tb) return ta - tb;
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        }
        case "updated":
        default:
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }
    });
    return sorted;
  }, [articles, view, search, typeFilter, categoryFilter, sourceFilter, flagBreaking, flagFeatured, flagAi, sort]);

  const viewCounts = useMemo(() => {
    const counts = {} as Record<ViewId, number>;
    for (const v of VIEWS) counts[v.id] = articles.filter(v.predicate).length;
    return counts;
  }, [articles]);

  const detailArticle = detailId ? articles.find((a) => a.id === detailId) ?? null : null;

  const allVisibleSelected = filtered.length > 0 && filtered.every((a) => selected.has(a.id));

  /* ---------------- الإجراءات (محلية بالكامل) ---------------- */

  function undoToast(title: string, description: string, prev: DemoArticle[]) {
    toast({
      title,
      description,
      action: (
        <ToastAction altText="تراجع" onClick={() => setArticles(prev)}>
          تراجع
        </ToastAction>
      ),
    });
  }

  function patchArticle(id: string, patch: (a: DemoArticle) => Partial<DemoArticle>, title: string, description: string) {
    const prev = articles;
    setArticles((list) => list.map((a) => (a.id === id ? { ...a, ...patch(a) } : a)));
    undoToast(title, description, prev);
  }

  function notifyOnly(title: string, description: string, variant?: "success") {
    toast({ title, description, variant });
  }

  function handleRowAction(action: RowActionId, a: DemoArticle) {
    switch (action) {
      case "open":
        setDetailId(a.id);
        return;
      case "edit":
        notifyOnly("فتح المحرر (تجريبي)", `في النسخة الحقيقية يُفتح محرر المقال: «${a.title}»`);
        return;
      case "publish":
        patchArticle(a.id, () => ({ status: "published", publishedAt: new Date().toISOString(), reviewStatus: null, reviewNotes: null }), "تم النشر (تجريبي)", "تغيّرت الحالة إلى «منشور» في البيانات التجريبية فقط.");
        return;
      case "feature":
        patchArticle(a.id, (x) => ({ isFeatured: !x.isFeatured }), a.isFeatured ? "أُلغي التمييز (تجريبي)" : "تم التمييز (تجريبي)", "تحديث محلي لحالة التمييز.");
        return;
      case "breaking":
        patchArticle(a.id, (x) => ({ newsType: x.newsType === "breaking" ? "regular" : "breaking" }), a.newsType === "breaking" ? "أُلغي العاجل (تجريبي)" : "تم التمييز كعاجل (تجريبي)", "تحديث محلي لوسم الخبر العاجل.");
        return;
      case "reading":
        patchArticle(a.id, (x) => ({ isReading: !x.isReading }), "وضع القراءة (تجريبي)", "تحديث محلي.");
        return;
      case "resurface":
        patchArticle(a.id, () => ({ updatedAt: new Date().toISOString() }), "إنعاش (تجريبي)", "عاد الخبر إلى صدارة الموجز محلياً فقط.");
        return;
      case "translate":
        notifyOnly("ترجمة للإنجليزية (تجريبي)", `في النسخة الحقيقية يُنشأ مقال إنجليزي بعنوان مترجم لـ «${a.title}».`);
        return;
      case "notify":
        notifyOnly("إرسال إشعار (تجريبي)", "في النسخة الحقيقية يُرسل إشعار فوري لمستخدمي التطبيق.");
        return;
      case "social":
        notifyOnly("النشر على X (تجريبي)", "يفتح في النسخة الحقيقية نافذة النشر الاجتماعي.");
        return;
      case "ai":
        notifyOnly("تصنيف ذكي (تجريبي)", `اقترح الذكاء الاصطناعي: «${a.category.name}» بثقة 91%.`);
        return;
      case "schedule":
        notifyOnly("تعديل الجدولة (تجريبي)", "يفتح في النسخة الحقيقية منتقي التاريخ والوقت.");
        return;
      case "archive":
        setNoteText("");
        setNoteError(null);
        setNoteDialog({ kind: "archive", article: a });
        return;
      case "revision":
        setNoteText("");
        setNoteError(null);
        setNoteDialog({ kind: "revision", article: a });
        return;
      case "restore":
        patchArticle(a.id, () => ({ status: "draft", reviewStatus: null, reviewNotes: null }), "تمت الاستعادة (تجريبي)", "عاد المقال مسودة محلياً.");
        return;
    }
  }

  function confirmNoteDialog() {
    const text = noteText.trim();
    if (noteDialog?.kind !== "bulk-archive" && text.length < 5) {
      setNoteError("اكتب نصاً واضحاً (5 أحرف على الأقل)");
      return;
    }
    const prev = articles;
    if (noteDialog?.kind === "archive" && noteDialog.article) {
      const id = noteDialog.article.id;
      setArticles((list) => list.map((a) => (a.id === id ? { ...a, status: "archived", reviewStatus: null, reviewNotes: text } : a)));
      undoToast("تمت الأرشفة (تجريبي)", "أُرسل للكاتب إشعار بالسبب في النسخة الحقيقية.", prev);
    } else if (noteDialog?.kind === "revision" && noteDialog.article) {
      const id = noteDialog.article.id;
      setArticles((list) => list.map((a) => (a.id === id ? { ...a, status: "draft", reviewStatus: "needs_changes", reviewedAt: new Date().toISOString(), reviewNotes: text } : a)));
      undoToast("تم طلب التعديل (تجريبي)", "عاد المحتوى للكاتب مع الملاحظات محلياً.", prev);
    } else if (noteDialog?.kind === "bulk-archive") {
      const ids = selected;
      setArticles((list) => list.map((a) => (ids.has(a.id) ? { ...a, status: "archived", reviewStatus: null, reviewNotes: text || "أرشفة جماعية (تجريبية)" } : a)));
      setSelected(new Set());
      undoToast(`تمت أرشفة ${ids.size} مقال (تجريبي)`, "تحديث محلي فقط.", prev);
    }
    setNoteDialog(null);
    setNoteText("");
    setNoteError(null);
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    setSelected((prev) => {
      if (allVisibleSelected) return new Set();
      const next = new Set(prev);
      for (const a of filtered) next.add(a.id);
      return next;
    });
  }

  function bulkArchive() {
    if (selected.size === 0) return;
    setNoteText("");
    setNoteError(null);
    setNoteDialog({ kind: "bulk-archive" });
  }

  function bulkFeature() {
    const prev = articles;
    const ids = selected;
    setArticles((list) => list.map((a) => (ids.has(a.id) ? { ...a, isFeatured: true } : a)));
    undoToast(`تم تمييز ${ids.size} مقال (تجريبي)`, "تحديث محلي فقط.", prev);
  }

  function bulkPublish() {
    const prev = articles;
    const ids = selected;
    setArticles((list) => list.map((a) => (ids.has(a.id) ? { ...a, status: "published", publishedAt: new Date().toISOString(), reviewStatus: null } : a)));
    undoToast(`تم نشر ${ids.size} مقال (تجريبي)`, "تحديث محلي فقط.", prev);
  }

  function resetDemo() {
    setArticles(DEMO_ARTICLES);
    setSelected(new Set());
    setDetailId(null);
    notifyOnly("أُعيد ضبط النموذج", "عادت البيانات التجريبية إلى حالتها الأصلية.");
  }

  const bulkBar = selected.size > 0 ? (
    <div
      className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-primary/30 bg-primary/[0.06] px-3 py-2.5"
      data-testid="preview-bulk-bar"
      dir="rtl"
    >
      <span className="text-sm font-semibold tabular-nums text-foreground">
        {selected.size.toLocaleString("en-US")} مقال محدد
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" className="h-8 gap-1.5" onClick={bulkPublish} data-testid="preview-bulk-publish">
          <Send className="h-3.5 w-3.5" /> نشر
        </Button>
        <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={bulkFeature} data-testid="preview-bulk-feature">
          <Star className="h-3.5 w-3.5" /> تمييز
        </Button>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-destructive hover:text-destructive" onClick={bulkArchive} data-testid="preview-bulk-archive">
          <Archive className="h-3.5 w-3.5" /> أرشفة
        </Button>
        <Button size="sm" variant="ghost" className="h-8" onClick={() => setSelected(new Set())} data-testid="preview-bulk-clear">
          إلغاء التحديد
        </Button>
      </div>
    </div>
  ) : null;

  return (
    <DashboardLayout>
      <DashboardPageShell
        maxWidthClassName="max-w-[1500px]"
        contentClassName="overflow-x-hidden px-4 pb-24 sm:px-6 space-y-5"
      >
        <DashboardPageHeader
          icon={Newspaper}
          title="إدارة الأخبار والمقالات"
          description="نموذج مقترح: فرز سريع لما يحتاج انتباهك، ووصول فوري للمقال، وإجراءات بأقل خطوات."
          titleTestId="preview-heading-title"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-1.5"
                onClick={resetDemo}
                data-testid="preview-reset"
              >
                <RotateCcw className="h-4 w-4" /> استعادة النموذج
              </Button>
              <Button
                size="sm"
                className="h-9 gap-1.5"
                onClick={() => notifyOnly("مقال جديد (تجريبي)", "يفتح في النسخة الحقيقية محرر مقال جديد.")}
                data-testid="preview-new-article"
              >
                <Plus className="h-4 w-4" /> مقال جديد
              </Button>
            </div>
          }
        />

        {/* بانر المعاينة */}
        <div
          className="flex items-start gap-3 rounded-xl border border-dashed border-amber-400/70 bg-amber-50/70 p-3 text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/25 dark:text-amber-200"
          dir="rtl"
        >
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-[13px] leading-6">
            <span className="font-bold">معاينة تجريبية.</span> البيانات والإجراءات هنا محلية بالكامل ولا تلمس
            الصفحة الحقيقية أو الإنتاج. كل زر يعدّل نسخة في الذاكرة مع إمكانية «تراجع».
          </p>
        </div>

        {/* شريط "يحتاج انتباهك" */}
        <section className="space-y-2.5" dir="rtl">
          <div className="flex items-center gap-2">
            <Inbox className="h-4 w-4 text-primary" />
            <h2 className="text-base font-bold">يحتاج انتباهك الآن</h2>
            <span className="text-xs text-muted-foreground">اضغط أي بطاقة لتطبيق التصفية فوراً</span>
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
            {[
              { id: "pending" as ViewId, label: "بانتظار مراجعتك", count: viewCounts.pending, Icon: Clock, tone: "orange" },
              { id: "resubmitted" as ViewId, label: "عاد بعد تعديل", count: viewCounts.resubmitted, Icon: CheckCheck, tone: "amber" },
              { id: "needs_changes" as ViewId, label: "بانتظار الكاتب", count: viewCounts.needs_changes, Icon: FilePenLine, tone: "rose" },
              { id: "scheduled" as ViewId, label: "مجدول", count: viewCounts.scheduled, Icon: CalendarClock, tone: "sky" },
            ].map((tile) => {
              const tones: Record<string, { idle: string; active: string; icon: string }> = {
                orange: { idle: "hover:border-orange-500/40", active: "border-orange-500/50 bg-orange-500/10 ring-2 ring-orange-500/20", icon: "bg-orange-500/10 text-orange-600 dark:text-orange-400" },
                amber: { idle: "hover:border-amber-500/40", active: "border-amber-500/50 bg-amber-500/10 ring-2 ring-amber-500/20", icon: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
                rose: { idle: "hover:border-rose-500/40", active: "border-rose-500/50 bg-rose-500/10 ring-2 ring-rose-500/20", icon: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
                sky: { idle: "hover:border-sky-500/40", active: "border-sky-500/50 bg-sky-500/10 ring-2 ring-sky-500/20", icon: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
              };
              const t = tones[tile.tone];
              const isActive = view === tile.id;
              return (
                <button
                  key={tile.id}
                  type="button"
                  onClick={() => setView(tile.id)}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-2xl border bg-card p-3 text-start transition-all sm:p-4",
                    isActive ? t.active : cn("border-border/80", t.idle),
                  )}
                  data-testid={`preview-attention-${tile.id}`}
                >
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground">{tile.label}</div>
                    <div className="mt-1 text-2xl font-bold tabular-nums">{tile.count.toLocaleString("en-US")}</div>
                  </div>
                  <span className={cn("rounded-xl p-2", t.icon)}>
                    <tile.Icon className="h-4 w-4" />
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* أدوات البحث والتصفية */}
        <section className="space-y-2.5" dir="rtl">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث بالعنوان، الكاتب، التصنيف، الوسم…"
                className="h-11 ps-9 pe-16 text-sm"
                data-testid="preview-search"
              />
              <kbd className="pointer-events-none absolute inset-y-0 end-2 my-auto hidden h-6 items-center rounded border border-border bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground sm:flex">
                ⌘K
              </kbd>
            </div>

            <div className="flex items-center gap-2">
              <Select value={sort} onValueChange={(v) => setSort(v as SortId)}>
                <SelectTrigger className="h-11 w-full lg:w-[170px]" data-testid="preview-sort">
                  <ArrowUpDown className="me-1.5 h-3.5 w-3.5 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  {SORTS.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-11 gap-2" data-testid="preview-filters">
                    <SlidersHorizontal className="h-4 w-4" />
                    فلاتر
                    {activeFiltersCount > 0 ? (
                      <Badge className="h-5 min-w-5 justify-center rounded-full px-1.5 text-[10px] tabular-nums">
                        {activeFiltersCount}
                      </Badge>
                    ) : null}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80 space-y-4" dir="rtl">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">النوع</label>
                    <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as "all" | DemoArticleType)}>
                      <SelectTrigger className="h-9" data-testid="preview-filter-type"><SelectValue /></SelectTrigger>
                      <SelectContent dir="rtl">
                        <SelectItem value="all">كل الأنواع</SelectItem>
                        {(Object.keys(TYPE_META) as DemoArticleType[]).map((t) => (
                          <SelectItem key={t} value={t}>{TYPE_META[t].label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">التصنيف</label>
                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                      <SelectTrigger className="h-9" data-testid="preview-filter-category"><SelectValue /></SelectTrigger>
                      <SelectContent dir="rtl">
                        <SelectItem value="all">كل التصنيفات</SelectItem>
                        {Object.values(CATEGORIES).map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">المصدر</label>
                    <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as "all" | DemoSource)}>
                      <SelectTrigger className="h-9" data-testid="preview-filter-source"><SelectValue /></SelectTrigger>
                      <SelectContent dir="rtl">
                        <SelectItem value="all">كل المصادر</SelectItem>
                        {(Object.keys(SOURCE_META) as DemoSource[]).map((s) => (
                          <SelectItem key={s} value={s}>{SOURCE_META[s].label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    {[
                      { label: "عاجل فقط", checked: flagBreaking, set: setFlagBreaking, testId: "preview-filter-breaking" },
                      { label: "المميز فقط", checked: flagFeatured, set: setFlagFeatured, testId: "preview-filter-featured" },
                      { label: "صور AI فقط", checked: flagAi, set: setFlagAi, testId: "preview-filter-ai" },
                    ].map((row) => (
                      <label key={row.label} className="flex cursor-pointer items-center justify-between gap-2 text-sm">
                        <span>{row.label}</span>
                        <Checkbox checked={row.checked} onCheckedChange={(v) => row.set(v === true)} data-testid={row.testId} />
                      </label>
                    ))}
                  </div>
                  {activeFiltersCount > 0 ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        setTypeFilter("all");
                        setCategoryFilter("all");
                        setSourceFilter("all");
                        setFlagBreaking(false);
                        setFlagFeatured(false);
                        setFlagAi(false);
                      }}
                      data-testid="preview-filters-clear"
                    >
                      مسح الفلاتر
                    </Button>
                  ) : null}
                </PopoverContent>
              </Popover>

              <div className="hidden items-center gap-1 rounded-lg border border-border p-0.5 sm:flex">
                <Button
                  variant={compact ? "ghost" : "secondary"}
                  size="icon"
                  className="h-9 w-9 rounded-md"
                  onClick={() => setCompact(false)}
                  title="عرض مريح"
                  aria-label="عرض مريح"
                  data-testid="preview-density-comfortable"
                >
                  <Rows3 className="h-4 w-4" />
                </Button>
                <Button
                  variant={compact ? "secondary" : "ghost"}
                  size="icon"
                  className="h-9 w-9 rounded-md"
                  onClick={() => setCompact(true)}
                  title="عرض مضغوط"
                  aria-label="عرض مضغوط"
                  data-testid="preview-density-compact"
                >
                  <LayoutList className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* عروض محفوظة */}
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {VIEWS.map((v) => {
              const active = view === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setView(v.id)}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
                  )}
                  data-testid={`preview-view-${v.id}`}
                >
                  {v.label}
                  <span className={cn("rounded-full px-1.5 text-[10px] tabular-nums", active ? "bg-primary-foreground/20" : "bg-muted")}>
                    {viewCounts[v.id].toLocaleString("en-US")}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* شريط التحديد — سطح المكتب */}
        {selected.size > 0 ? <div className="hidden sm:block">{bulkBar}</div> : null}

        {/* نتائج */}
        <section className="space-y-3" dir="rtl">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold">
                {VIEWS.find((v) => v.id === view)?.label}
              </h2>
              <span className="text-sm text-muted-foreground tabular-nums">
                {filtered.length.toLocaleString("en-US")} نتيجة
              </span>
              {selected.size > 0 ? (
                <span className="text-sm font-semibold text-primary tabular-nums">
                  · {selected.size.toLocaleString("en-US")} محدد
                </span>
              ) : null}
            </div>
            {filtered.length > 0 ? (
              <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                <Checkbox
                  checked={allVisibleSelected}
                  onCheckedChange={toggleSelectAllVisible}
                  data-testid="preview-select-all"
                />
                تحديد الظاهر
              </label>
            ) : null}
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed bg-card/50 py-16 text-center" data-testid="preview-empty">
              <Search className="h-8 w-8 text-muted-foreground/60" />
              <div>
                <p className="font-semibold">لا توجد نتائج مطابقة</p>
                <p className="mt-1 text-sm text-muted-foreground">جرّب تعديل البحث أو مسح الفلاتر.</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setView("all");
                  setTypeFilter("all");
                  setCategoryFilter("all");
                  setSourceFilter("all");
                  setFlagBreaking(false);
                  setFlagFeatured(false);
                  setFlagAi(false);
                }}
              >
                مسح كل شيء
              </Button>
            </div>
          ) : (
            <ul className={cn("space-y-2.5", compact && "space-y-1.5")}>
              {filtered.map((a) => (
                <ArticleRow
                  key={a.id}
                  article={a}
                  selected={selected.has(a.id)}
                  compact={compact}
                  onToggle={() => toggleSelected(a.id)}
                  onOpen={() => setDetailId(a.id)}
                  onAction={handleRowAction}
                />
              ))}
            </ul>
          )}
        </section>
      </DashboardPageShell>

      {/* شريط التحديد — الجوال (ثابت أسفل) */}
      {selected.size > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 p-3 backdrop-blur sm:hidden" data-testid="preview-bulk-bar-mobile">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold tabular-nums">{selected.size.toLocaleString("en-US")} مقال محدد</span>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>إلغاء</Button>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-9 flex-1 gap-1.5" onClick={bulkPublish}><Send className="h-3.5 w-3.5" /> نشر</Button>
            <Button size="sm" variant="outline" className="h-9 flex-1 gap-1.5" onClick={bulkFeature}><Star className="h-3.5 w-3.5" /> تمييز</Button>
            <Button size="sm" variant="outline" className="h-9 flex-1 gap-1.5 text-destructive" onClick={bulkArchive}><Archive className="h-3.5 w-3.5" /> أرشفة</Button>
          </div>
        </div>
      ) : null}

      {/* لوحة التفاصيل */}
      <Sheet open={!!detailArticle} onOpenChange={(open) => !open && setDetailId(null)}>
        <SheetContent side="right" dir="rtl" className="w-full overflow-y-auto p-0 sm:max-w-xl">
          {detailArticle ? (
            <DetailPanel
              article={detailArticle}
              onAction={handleRowAction}
              onClose={() => setDetailId(null)}
            />
          ) : null}
        </SheetContent>
      </Sheet>

      {/* حوار السبب / الملاحظات */}
      <AlertDialog
        open={!!noteDialog}
        onOpenChange={(open) => {
          if (!open) {
            setNoteDialog(null);
            setNoteText("");
            setNoteError(null);
          }
        }}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {noteDialog?.kind === "revision"
                ? "طلب تعديل من الكاتب"
                : noteDialog?.kind === "bulk-archive"
                  ? `أرشفة ${selected.size} مقال`
                  : "أرشفة — عدم النشر"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {noteDialog?.kind === "revision"
                ? "يعود المحتوى للكاتب/المراسل مع ملاحظاتك ليعدّله ثم يعيد الإرسال."
                : "يُرسل السبب للكاتب/المراسل (إشعار + إيميل) في النسخة الحقيقية. هذا قرار نهائي."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {noteDialog?.article ? (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              {noteDialog.article.title}
            </div>
          ) : null}
          <Textarea
            value={noteText}
            onChange={(e) => {
              setNoteText(e.target.value);
              if (noteError) setNoteError(null);
            }}
            rows={4}
            className="resize-none"
            placeholder={noteDialog?.kind === "revision" ? "اكتب الملاحظات التحريرية…" : "اكتب سبب الأرشفة…"}
            data-testid="preview-note-input"
          />
          {noteError ? <p className="text-xs text-destructive">{noteError}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmNoteDialog();
              }}
              className={noteDialog?.kind === "archive" || noteDialog?.kind === "bulk-archive" ? "bg-amber-600 hover:bg-amber-700" : undefined}
              data-testid="preview-note-confirm"
            >
              {noteDialog?.kind === "revision" ? "إرسال الملاحظات" : "تأكيد الأرشفة"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}

/* ------------------------------------------------------------------ */
/* لوحة التفاصيل                                                       */
/* ------------------------------------------------------------------ */

function DetailPanel({
  article,
  onAction,
  onClose,
}: {
  article: DemoArticle;
  onAction: (id: RowActionId, article: DemoArticle) => void;
  onClose: () => void;
}) {
  const statusMeta = STATUS_META[article.status];
  const typeMeta = TYPE_META[article.articleType] ?? TYPE_META.news;
  const sourceMeta = SOURCE_META[article.source];
  const reason = attentionReason(article);
  const TypeIcon = typeMeta.Icon;
  const SourceIcon = sourceMeta.Icon;

  const timeline: { label: string; value: string }[] = [
    { label: "أُنشئ", value: formatDateTime(article.createdAt) },
    { label: "آخر تحديث", value: formatDateTime(article.updatedAt) },
  ];
  if (article.status === "scheduled") timeline.push({ label: "موعد النشر", value: formatDateTime(article.scheduledAt) });
  if (article.publishedAt) timeline.push({ label: "نُشر", value: formatDateTime(article.publishedAt) });
  if (article.reviewedAt) timeline.push({ label: "آخر مراجعة", value: formatDateTime(article.reviewedAt) });

  const primaryActions: ActionDef[] = article.status === "archived"
    ? [
        { id: "restore", label: "استعادة كمسودة", Icon: Undo2 },
        { id: "edit", label: "فتح المحرر", Icon: FilePenLine },
      ]
    : article.status === "published"
      ? [
          { id: "edit", label: "فتح المحرر", Icon: FilePenLine },
          { id: "feature", label: article.isFeatured ? "إلغاء التمييز" : "تمييز", Icon: Star },
          { id: "breaking", label: article.newsType === "breaking" ? "إلغاء العاجل" : "خبر عاجل", Icon: Zap },
          { id: "social", label: "نشر على X", Icon: Share2 },
          { id: "notify", label: "إرسال إشعار", Icon: Bell },
        ]
      : [
          { id: "edit", label: "فتح المحرر", Icon: FilePenLine },
          { id: "publish", label: "نشر الآن", Icon: Send },
          { id: "schedule", label: "الجدولة", Icon: CalendarClock },
          { id: "revision", label: "طلب تعديل", Icon: FilePenLine },
        ];

  return (
    <div className="flex h-full flex-col">
      <SheetHeader className="border-b p-5 text-start">
        <div className="flex items-center gap-2">
          <Chip className={statusMeta.className}>
            <span className={cn("h-1.5 w-1.5 rounded-full", statusMeta.dot)} />
            {statusMeta.label}
          </Chip>
          <Chip className={typeMeta.className}>
            <TypeIcon className="h-3 w-3" />
            {typeMeta.label}
          </Chip>
          {article.newsType === "breaking" ? (
            <Chip className="border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300">
              <Zap className="h-3 w-3" /> عاجل
            </Chip>
          ) : null}
        </div>
        <SheetTitle className="mt-2 text-start text-lg leading-relaxed" data-testid="preview-detail-title">
          {article.title}
        </SheetTitle>
      </SheetHeader>

      <div className="flex-1 space-y-5 p-5">
        {reason ? (
          <div className={cn("flex items-start gap-2 rounded-xl border p-3 text-sm", reason.className)} data-testid="preview-detail-reason">
            <Inbox className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{reason.label}</span>
          </div>
        ) : null}

        {/* معلومات */}
        <div className="flex items-center gap-3">
          <Thumb article={article} size="lg" />
          <div className="min-w-0 space-y-1.5 text-sm">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                {article.author?.initials ?? "—"}
              </span>
              <span className="font-medium">{article.author?.name ?? "غير محدد"}</span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Tag className="h-3 w-3" style={{ color: article.category.color }} />{article.category.name}</span>
              <span className="inline-flex items-center gap-1"><SourceIcon className="h-3 w-3" />{sourceMeta.label}</span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground tabular-nums">
              <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" />{article.views.toLocaleString("en-US")}</span>
              <span className="inline-flex items-center gap-1"><BookOpen className="h-3 w-3" />{article.readingTime} د</span>
              <span className="inline-flex items-center gap-1"><FilePenLine className="h-3 w-3" />{article.wordCount.toLocaleString("en-US")} كلمة</span>
            </div>
          </div>
        </div>

        {article.reviewNotes ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.07] p-3">
            <div className="mb-1 text-xs font-bold text-amber-700 dark:text-amber-300">ملاحظات التحرير</div>
            <p className="text-sm leading-6 text-foreground/90">{article.reviewNotes}</p>
          </div>
        ) : null}

        {/* الملخص الذكي */}
        {article.aiBullets.length > 0 ? (
          <div className="rounded-xl border border-primary/20 bg-primary/[0.05] p-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-primary">
              <Sparkles className="h-3.5 w-3.5" /> ملخص ذكي
            </div>
            <ul className="space-y-1.5">
              {article.aiBullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2 text-sm leading-6">
                  <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-primary" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="text-sm leading-7 text-muted-foreground">{article.excerpt}</p>

        {article.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {article.tags.map((tag) => (
              <Chip key={tag} className="border-transparent bg-muted text-muted-foreground">
                #{tag}
              </Chip>
            ))}
          </div>
        ) : null}

        {/* المسار الزمني */}
        <div className="rounded-xl border bg-card p-3">
          <div className="mb-2 text-xs font-bold text-muted-foreground">المسار الزمني</div>
          <ul className="space-y-1.5 text-sm">
            {timeline.map((t) => (
              <li key={t.label} className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">{t.label}</span>
                <span className="tabular-nums" dir="ltr">{t.value}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* إجراءات اللوحة */}
      <div className="sticky bottom-0 border-t bg-background/95 p-4 backdrop-blur">
        <div className="grid grid-cols-2 gap-2">
          {primaryActions.map((action, i) => (
            <Button
              key={action.id}
              variant={i === 0 ? "default" : "outline"}
              className="h-10 justify-start gap-2"
              onClick={() => {
                onAction(action.id, article);
                if (action.id !== "open") onClose();
              }}
              data-testid={`preview-detail-action-${action.id}`}
            >
              <action.Icon className="h-4 w-4" />
              {action.label}
            </Button>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <Button variant="ghost" className="h-9 gap-1.5 text-muted-foreground" onClick={() => { onAction("ai", article); onClose(); }}>
            <Sparkles className="h-4 w-4" /> تصنيف
          </Button>
          <Button variant="ghost" className="h-9 gap-1.5 text-muted-foreground" onClick={() => { onAction("resurface", article); onClose(); }}>
            <HeartPulse className="h-4 w-4" /> إنعاش
          </Button>
          <Button variant="ghost" className="h-9 gap-1.5 text-muted-foreground" onClick={() => { onAction("translate", article); onClose(); }}>
            <Languages className="h-4 w-4" /> ترجمة
          </Button>
        </div>
        <Button
          variant="ghost"
          className="mt-2 h-9 w-full gap-1.5 text-destructive hover:text-destructive"
          onClick={() => { onAction("archive", article); onClose(); }}
          data-testid="preview-detail-archive"
        >
          <Archive className="h-4 w-4" /> أرشفة / عدم النشر
        </Button>
      </div>
    </div>
  );
}
