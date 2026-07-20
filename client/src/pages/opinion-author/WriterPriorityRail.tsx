/**
 * شريط أولويات الكاتب — واجهة الجوال (تطبيق iOS أولاً).
 *
 * أعلى صفحة الكاتب صار مزدحماً (بطاقة الموعد + ملاحظات المحررين + دعوات
 * الاستطلاع + الترويسة). على شاشة الجوال يُدمج كل ما يُطلب من الكاتب في
 * شريط واحد: البطاقة الأعلى أولويةً تظهر كاملة، والبقية أسطر مضغوطة قابلة
 * للنقر. الترتيب: فات الموعد ← تذكير الإرسال ← اختيار اليوم ← ملاحظة محرر
 * ← دعوة استطلاع ← بقية التنبيهات ← موعد النشر الاعتيادي.
 *
 * التفعيل: داخل غلاف Capacitor على iOS فقط (المرحلة الأولى)، أو بمفتاح
 * الاختبار ?writerRail=1 في أي متصفح (يُحفظ في localStorage، و=0 يلغيه).
 * يحوي الملف أيضاً القطع المشتركة المنقولة من WriterWorkspacePage
 * (اختيار اليوم، أنماط التنبيهات) ليبقى الاعتماد باتجاه واحد.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { OPINION_WRITERS_PER_DAY_CAP } from "@shared/opinionWriterConstants";
import {
  ArrowLeft,
  BellRing,
  CalendarClock,
  CalendarDays,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  CircleX,
  ClipboardList,
  Edit3,
} from "lucide-react";

export const WEEKDAYS_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export type ScheduleBannerData = {
  weekday: number;
  publishTime: string;
  nextPublishAt: string;
  submitDeadline: string;
  state: "ok" | "reminder" | "late";
  hasUpcoming: boolean;
  lastPublishedAt: string | null;
};

export type EditorialNotification = {
  id: string;
  type: "scheduled" | "published" | "rejected" | "needs_revision" | "archived" | "deleted" | string;
  title: string;
  body: string;
  articleId: string | null;
  articleTitle: string | null;
  deepLink: string | null;
  reviewerNote: string | null;
  readAt: string | null;
  createdAt: string;
};

export function editorialNotificationStyle(type: EditorialNotification["type"]) {
  if (type === "published") return { icon: CheckCircle2, label: "تم النشر", item: "border-border bg-muted/30", iconClass: "text-primary" };
  if (type === "scheduled") return { icon: CalendarClock, label: "تمت الجدولة", item: "border-border bg-primary/5 dark:border-border dark:bg-primary/10", iconClass: "text-primary dark:text-primary" };
  if (type === "needs_revision") return { icon: Edit3, label: "ملاحظات تحريرية", item: "border-warning/40 bg-warning/10 dark:border-border dark:bg-warning/10", iconClass: "text-warning dark:text-warning" };
  if (type === "survey_invite") return { icon: ClipboardList, label: "دعوة استطلاع", item: "border-primary/40 bg-primary/5 dark:border-border dark:bg-primary/10", iconClass: "text-primary" };
  if (type === "rejected" || type === "deleted" || type === "archived") return { icon: CircleX, label: type === "deleted" ? "حُذف نهائيًا" : "غير صالح للنشر", item: "border-destructive/30 bg-destructive/10 dark:border-border dark:bg-destructive/10", iconClass: "text-destructive" };
  // أنواع مستقبلية غير معروفة: عرض محايد بدل الوقوع على النمط الأحمر
  return { icon: BellRing, label: "تنبيه", item: "border-border bg-muted/30", iconClass: "text-muted-foreground" };
}

const RAIL_FLAG_KEY = "sabq-writer-rail";

/**
 * هل نعرض شريط الأولويات؟ iOS داخل التطبيق فقط حالياً (المرحلة الأولى)،
 * مع مفتاح اختبار للمتصفح: ?writerRail=1 يفعّله ويحفظه، و?writerRail=0 يلغيه.
 */
export function useIsWriterRail(): boolean {
  return useMemo(() => {
    try {
      const param = new URLSearchParams(window.location.search).get("writerRail");
      if (param === "1") localStorage.setItem(RAIL_FLAG_KEY, "1");
      if (param === "0") localStorage.removeItem(RAIL_FLAG_KEY);
      if (localStorage.getItem(RAIL_FLAG_KEY) === "1") return true;
      const capacitor = (window as {
        Capacitor?: { getPlatform?: () => string };
      }).Capacitor;
      return capacitor?.getPlatform?.() === "ios";
    } catch {
      return false;
    }
  }, []);
}

/** بطاقة اختيار الكاتب يومه بنفسه — تظهر مرة واحدة لمن لا يوم له، مع ازدحام كل يوم */
export function WriterDayPicker({ dayLoads }: { dayLoads: number[] }) {
  const { toast } = useToast();
  const [picked, setPicked] = useState<number | null>(null);

  const chooseMutation = useMutation({
    mutationFn: async (weekday: number) =>
      apiRequest("/api/opinion-author/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekday }),
      }),
    onSuccess: (_data, weekday) => {
      queryClient.invalidateQueries({ queryKey: ["/api/opinion-author/schedule"] });
      toast({
        title: "تم تسجيل يومك",
        description: `مقالتك ستُنشر أسبوعياً يوم ${WEEKDAYS_AR[weekday]}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "تعذر حفظ اليوم",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <Card className="border-r-4 border-r-primary shadow-none" dir="rtl">
      <CardContent className="space-y-3 p-3 sm:p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <CalendarDays className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-bold sm:text-base">اختر يومك الأسبوعي للنشر</p>
            <p className="text-xs text-muted-foreground sm:text-sm">
              مقالتك ستُنشر في هذا اليوم من كل أسبوع. يُحدد مرة واحدة، وتغييره لاحقاً عبر إدارة
              التحرير — الحد {OPINION_WRITERS_PER_DAY_CAP} كتّاب لكل يوم؛ الأيام المكتملة غير متاحة.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
          {WEEKDAYS_AR.map((day, i) => {
            const load = dayLoads[i] ?? 0;
            const isFull = load >= OPINION_WRITERS_PER_DAY_CAP;
            const isPicked = picked === i;
            return (
              <button
                key={day}
                type="button"
                disabled={isFull}
                onClick={() => !isFull && setPicked(i)}
                className={`min-h-[52px] rounded-lg border p-2 text-center transition-colors ${
                  isFull
                    ? "cursor-not-allowed border-amber-300/70 bg-amber-50/80 text-amber-900 opacity-90 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-200"
                    : isPicked
                      ? "border-primary bg-primary/10 font-bold text-primary"
                      : "border-border bg-muted/30 hover:border-primary/40"
                }`}
                data-testid={`writer-day-pick-${i}`}
              >
                <div className="text-xs sm:text-sm">{day}</div>
                <div className="mt-0.5 text-[10px] sm:text-xs">
                  {isFull
                    ? "غير متاح للنشر"
                    : load
                      ? `${load}/${OPINION_WRITERS_PER_DAY_CAP}`
                      : "شاغر"}
                </div>
              </button>
            );
          })}
        </div>
        <Button
          size="sm"
          className="gap-1.5"
          disabled={
            picked === null ||
            chooseMutation.isPending ||
            (picked !== null && (dayLoads[picked] ?? 0) >= OPINION_WRITERS_PER_DAY_CAP)
          }
          onClick={() => picked !== null && chooseMutation.mutate(picked)}
        >
          <CheckCircle2 className="h-4 w-4" />
          {picked === null ? "اختر يوماً أولاً" : `تثبيت يوم ${WEEKDAYS_AR[picked]}`}
        </Button>
      </CardContent>
    </Card>
  );
}

type RailItemKind = "late" | "reminder" | "pick_day" | "editorial" | "survey" | "notice" | "schedule_ok";

type RailItem = {
  key: string;
  kind: RailItemKind;
  title: string;
  subtitle?: string;
  notification?: EditorialNotification;
};

const KIND_PRIORITY: Record<RailItemKind, number> = {
  late: 0,
  reminder: 1,
  pick_day: 2,
  editorial: 3,
  survey: 4,
  notice: 5,
  schedule_ok: 6,
};

function fmtDate(iso: string, withTime = true) {
  try {
    return format(new Date(iso), withTime ? "EEEE d MMMM — h:mm a" : "EEEE d MMMM", { locale: ar });
  } catch {
    return "";
  }
}

function scheduleItemVisual(kind: RailItemKind) {
  if (kind === "late")
    return { card: "border-r-4 border-r-destructive", iconWrap: "bg-destructive/10 text-destructive", Icon: CircleX };
  if (kind === "reminder")
    return { card: "border-r-4 border-r-warning", iconWrap: "bg-warning/10 text-warning", Icon: BellRing };
  return { card: "border-r-4 border-r-primary", iconWrap: "bg-primary/10 text-primary", Icon: CalendarClock };
}

export function WriterPriorityRail({
  notifications,
  onOpenNotification,
  onMarkAllRead,
  markingAll,
}: {
  notifications: EditorialNotification[];
  onOpenNotification: (notification: EditorialNotification) => void;
  onMarkAllRead: () => void;
  markingAll: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const { data } = useQuery<{
    banner: ScheduleBannerData | null;
    canChoose?: boolean;
    dayLoads?: number[];
  }>({
    queryKey: ["/api/opinion-author/schedule"],
    staleTime: 5 * 60 * 1000,
  });

  const banner = data?.banner;
  const canChoose = Boolean(data?.canChoose && Array.isArray(data?.dayLoads));

  const items = useMemo<RailItem[]>(() => {
    const list: RailItem[] = [];
    if (banner?.state === "late") {
      const publishStillAhead = new Date(banner.nextPublishAt).getTime() > Date.now();
      list.push({
        key: "schedule-late",
        kind: "late",
        title: publishStillAhead
          ? "فات آخر موعد لإرسال مقالتك"
          : "فات موعد النشر لهذا الأسبوع",
        subtitle: publishStillAhead
          ? `أرسلها الآن لتُجدول ليوم ${fmtDate(banner.nextPublishAt)}`
          : `عند إرسال مقالتك الآن ستُجدول ليوم ${fmtDate(banner.nextPublishAt)}`,
      });
    } else if (banner?.state === "reminder") {
      list.push({
        key: "schedule-reminder",
        kind: "reminder",
        title: "اقترب موعد مقالتك",
        subtitle: `أرسلها قبل ${fmtDate(banner.submitDeadline, false)} — تُنشر ${fmtDate(banner.nextPublishAt)}`,
      });
    }
    if (canChoose) {
      list.push({ key: "pick-day", kind: "pick_day", title: "اختر يومك الأسبوعي للنشر" });
    }
    for (const n of notifications) {
      const kind: RailItemKind =
        n.type === "needs_revision" || n.type === "rejected" || n.type === "deleted" || n.type === "archived"
          ? "editorial"
          : n.type === "survey_invite"
            ? "survey"
            : "notice";
      list.push({
        key: `n-${n.id}`,
        kind,
        title: n.articleTitle || n.title,
        subtitle: n.reviewerNote || n.body,
        notification: n,
      });
    }
    if (banner && banner.state === "ok") {
      const submitOpen = new Date(banner.submitDeadline).getTime() > Date.now();
      list.push({
        key: "schedule-ok",
        kind: "schedule_ok",
        title: `يومك المخصص: ${WEEKDAYS_AR[banner.weekday]}`,
        subtitle: banner.hasUpcoming
          ? `مقالتك القادمة في مسار النشر — موعدها ${fmtDate(banner.nextPublishAt)}`
          : submitOpen
            ? `مقالتك القادمة تُنشر ${fmtDate(banner.nextPublishAt)} — آخر موعد للإرسال ${fmtDate(banner.submitDeadline, false)}`
            : `مقالتك القادمة تُنشر ${fmtDate(banner.nextPublishAt)} — أرسلها في أقرب وقت`,
      });
    }
    return list.sort((a, b) => KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind]);
  }, [banner, canChoose, notifications]);

  if (items.length === 0) return null;

  const [top, ...rest] = items;
  const compactRows = expanded ? rest : rest.slice(0, 3);
  const hiddenCount = rest.length - compactRows.length;
  const unreadCount = notifications.length;

  const renderTop = (item: RailItem) => {
    if (item.kind === "pick_day" && data?.dayLoads) {
      return <WriterDayPicker dayLoads={data.dayLoads} />;
    }
    if (item.notification) {
      const style = editorialNotificationStyle(item.notification.type);
      const Icon = style.icon;
      return (
        <button
          type="button"
          onClick={() => onOpenNotification(item.notification!)}
          className={`w-full rounded-xl border p-3 text-right transition-colors hover:bg-muted/30 ${style.item}`}
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 rounded-md bg-background/80 p-1.5">
              <Icon className={`h-4 w-4 ${style.iconClass}`} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold">{style.label}</span>
                <span className="text-[11px] text-muted-foreground">
                  {formatDistanceToNow(new Date(item.notification.createdAt), { addSuffix: true, locale: ar })}
                </span>
              </div>
              <p className="mt-1 line-clamp-1 text-sm font-medium">{item.title}</p>
              {item.subtitle && (
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.subtitle}</p>
              )}
            </div>
            <ArrowLeft className="mt-2 h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
        </button>
      );
    }
    const visual = scheduleItemVisual(item.kind);
    return (
      <Card className={`${visual.card} shadow-none`} dir="rtl">
        <CardContent className="flex items-start gap-3 p-3 sm:p-4">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${visual.iconWrap}`}>
            <visual.Icon className="h-5 w-5" />
          </span>
          <div className="space-y-0.5">
            <p className="text-sm font-bold sm:text-base">{item.title}</p>
            {item.subtitle && <p className="text-xs text-muted-foreground sm:text-sm">{item.subtitle}</p>}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-2" dir="rtl" data-testid="writer-priority-rail">
      {renderTop(top)}
      {compactRows.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {compactRows.map((item) => {
            const style = item.notification
              ? editorialNotificationStyle(item.notification.type)
              : { icon: scheduleItemVisual(item.kind).Icon, label: "", iconClass: "text-primary" };
            const Icon = style.icon;
            return (
              <button
                key={item.key}
                type="button"
                disabled={!item.notification && item.kind !== "pick_day"}
                onClick={() => item.notification && onOpenNotification(item.notification)}
                className="flex min-h-[44px] w-full items-center gap-2.5 border-b border-border px-3 py-2 text-right last:border-b-0 enabled:hover:bg-muted/30 disabled:cursor-default"
              >
                <Icon className={`h-4 w-4 shrink-0 ${style.iconClass}`} />
                <span className="min-w-0 flex-1 truncate text-xs sm:text-sm">
                  {style.label && <b className="ml-1">{style.label}:</b>}
                  {item.title}
                </span>
                {item.notification && <ArrowLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
              </button>
            );
          })}
          {(hiddenCount > 0 || expanded) && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="flex min-h-[40px] w-full items-center justify-center gap-1 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/30"
            >
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
              {expanded ? "إخفاء" : `+${hiddenCount} أخرى`}
            </button>
          )}
        </div>
      )}
      {unreadCount > 1 && (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={onMarkAllRead} disabled={markingAll} className="h-7 gap-1 text-xs">
            <CheckCheck className="h-3.5 w-3.5" /> تحديد الكل كمقروء
          </Button>
        </div>
      )}
    </div>
  );
}
