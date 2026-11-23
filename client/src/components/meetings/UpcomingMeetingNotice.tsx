// تنبيه الاجتماع القادم في مساحة الكاتب (وأي صفحة رئيسية لا تمر بصفحة الاجتماعات):
// أقرب اجتماع مباشر أو مجدول خلال 14 يوماً دُعي إليه المستخدم، مع «سأحضر / لا أستطيع»
// أو «انضمام» إن كان مباشراً. القائمة نفسها من /api/meetings (تُرشَّح بالأهلية على الخادم)؛
// من لا يملك صلاحية الاجتماعات يأخذ 403 فلا يظهر شيء.

import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, Check, Clock, Headphones, Radio, Timer, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  formatMeetingDate,
  formatMeetingTime,
  getMeetingTimingInfo,
} from "./meetingNoticeTiming";

type NoticeMeeting = {
  id: string;
  title: string;
  status: "scheduled" | "live" | string;
  scheduledAt: string | null;
  startedAt: string | null;
  durationMinutes: number | null;
  hostUserId: string;
  hostName: string;
  myRsvp: "yes" | "no" | null;
};

const WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
// اجتماع مجدول تأخر بدؤه يبقى ظاهراً ساعتين، وما بعدها فائت لا يحجب الدعوات القادمة
const GRACE_MS = 2 * 60 * 60 * 1000;

export function UpcomingMeetingNotice() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: raw } = useQuery({
    queryKey: ["/api/meetings"],
    refetchInterval: 60_000,
    retry: false,
  });
  const data = raw as { live?: NoticeMeeting[]; upcoming?: NoticeMeeting[] } | null | undefined;
  const live = Array.isArray(data?.live) ? data!.live! : [];
  const upcoming = Array.isArray(data?.upcoming) ? data!.upcoming! : [];

  const now = Date.now();
  const meeting =
    live[0] ??
    upcoming
      .filter((m) => {
        if (!m.scheduledAt) return false;
        const delta = new Date(m.scheduledAt).getTime() - now;
        return delta > -GRACE_MS && delta < WINDOW_MS;
      })
      .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime())[0];

  const rsvp = useMutation({
    mutationFn: (response: "yes" | "no") =>
      apiRequest(`/api/meetings/${meeting!.id}/rsvp`, { method: "POST", body: JSON.stringify({ response }) }),
    onSuccess: (_d, response) => {
      queryClient.invalidateQueries({ queryKey: ["/api/meetings"] });
      toast(
        response === "yes"
          ? { title: "تم تأكيد حضورك", description: "بانتظارك في موعد الاجتماع" }
          : { title: "نعتذر عن غيابك", description: "الدعوة تبقى قائمة، وبإمكانك الانضمام متى زال ظرفك." },
      );
    },
    onError: () => toast({ title: "تعذر حفظ ردك", variant: "destructive" }),
  });

  if (!meeting) return null;
  const isLive = meeting.status === "live";
  const isHost = meeting.hostUserId === user?.id;
  const otherCount = live.length + upcoming.length - 1;
  const timing = isLive ? null : getMeetingTimingInfo(meeting.scheduledAt, now);
  const isToday = Boolean(timing?.isToday);

  return (
    <div
      className={cn(
        "rounded-2xl border border-r-4 p-4 transition-colors sm:p-5",
        isLive
          ? "border-red-500/40 border-r-red-500 bg-red-500/[0.06] shadow-sm dark:bg-red-950/25"
          : isToday
            ? "border-primary/40 border-r-primary bg-primary/[0.06] shadow-sm dark:bg-primary/10"
            : "border-primary/25 border-r-primary/80 bg-card",
      )}
      dir="rtl"
      data-testid="upcoming-meeting-notice"
    >
      <div className="flex items-start gap-3.5">
        <span
          className={cn(
            "relative grid h-12 w-12 shrink-0 place-items-center rounded-xl",
            isLive
              ? "bg-red-500/15 text-red-600 dark:text-red-400"
              : isToday
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-primary/10 text-primary",
          )}
        >
          {isLive ? <Radio className="h-6 w-6 animate-pulse" /> : <Headphones className="h-6 w-6" />}
          {(isLive || isToday) && (
            <span className="absolute -left-1 -top-1 flex h-3 w-3">
              <span
                className={cn(
                  "absolute inline-flex h-full w-full animate-ping rounded-full opacity-70",
                  isLive ? "bg-red-500" : "bg-amber-500",
                )}
              />
              <span
                className={cn(
                  "relative inline-flex h-3 w-3 rounded-full",
                  isLive ? "bg-red-500" : "bg-amber-500",
                )}
              />
            </span>
          )}
        </span>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {isLive ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-bold text-white">
                <Radio className="h-3 w-3 animate-pulse" />
                اجتماع مباشر الآن
              </span>
            ) : timing?.dayBadge ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold",
                  isToday
                    ? "bg-primary text-primary-foreground"
                    : "bg-primary/15 text-primary",
                )}
              >
                {timing.dayBadge}
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-foreground/80">
                {isHost ? "اجتماعك القادم" : "دعوة لاجتماع"}
              </span>
            )}

            {timing?.countdownLabel && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-xs font-bold text-amber-800 dark:text-amber-300">
                <Clock className="h-3 w-3" />
                {timing.countdownLabel}
              </span>
            )}

            {!isLive && !isHost && meeting.myRsvp === "yes" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                <Check className="h-3 w-3" />
                أكّدت حضورك
              </span>
            )}
          </div>

          <h2 className="text-lg font-extrabold leading-snug tracking-tight text-foreground sm:text-xl">
            {meeting.title}
          </h2>

          {isLive ? (
            <p className="flex items-center gap-1.5 text-sm font-medium text-foreground/80">
              <User className="h-4 w-4 text-red-500" />
              يستضيفه {meeting.hostName}
            </p>
          ) : (
            <div
              className={cn(
                "flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-3.5 py-2.5",
                isToday
                  ? "border-primary/25 bg-background/95"
                  : "border-border bg-muted/40",
              )}
            >
              <span className="inline-flex items-center gap-2 text-sm font-bold text-foreground sm:text-base">
                <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
                {formatMeetingDate(meeting.scheduledAt)}
              </span>
              <span className="inline-flex items-center gap-1.5 text-sm font-extrabold text-primary sm:text-base">
                <Clock className="h-4 w-4 shrink-0" />
                <span dir="ltr">{formatMeetingTime(meeting.scheduledAt)}</span>
              </span>
              {meeting.durationMinutes ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground sm:text-sm">
                  <Timer className="h-3.5 w-3.5 shrink-0" />
                  {meeting.durationMinutes} دقيقة
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground sm:text-sm">
                <User className="h-3.5 w-3.5 shrink-0" />
                {meeting.hostName}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {isLive ? (
          <Button
            size="sm"
            className="h-9 bg-red-600 px-5 font-bold text-white hover:bg-red-700"
            onClick={() => setLocation(`/dashboard/meetings/room/${meeting.id}`)}
            data-testid="button-notice-join"
          >
            انضمام الآن
          </Button>
        ) : !isHost ? (
          <>
            <Button
              size="sm"
              className="h-9 px-4 font-bold"
              variant={meeting.myRsvp === "yes" ? "default" : "outline"}
              onClick={() => rsvp.mutate("yes")}
              disabled={rsvp.isPending}
              data-testid="button-notice-rsvp-yes"
            >
              <Check className="ml-1.5 h-4 w-4" /> سأحضر
            </Button>
            <Button
              size="sm"
              className="h-9 px-4"
              variant={meeting.myRsvp === "no" ? "secondary" : "outline"}
              onClick={() => rsvp.mutate("no")}
              disabled={rsvp.isPending}
              data-testid="button-notice-rsvp-no"
            >
              <X className="ml-1.5 h-4 w-4" /> لا أستطيع
            </Button>
          </>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          className="h-9 gap-1 font-semibold"
          onClick={() => setLocation(otherCount > 0 ? "/dashboard/meetings" : `/dashboard/meetings/${meeting.id}`)}
        >
          {otherCount > 0 ? `كل الاجتماعات (${otherCount + 1})` : "التفاصيل"}
          <ArrowLeft className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
