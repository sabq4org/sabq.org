// اجتماعات كاتب الرأي (المرحلة 4 من خطة لوحة الكاتب): الاجتماع القادم في
// الأعلى مع تأكيد الحضور والانضمام، ثم بقية القادمة، ثم المحاضر. بلا أدوات
// الإدارة ولا إحصاءات المضيف. البيانات من واجهات الاجتماعات نفسها.
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  Loader2,
  Mail,
  Radio,
  Headphones,
} from "lucide-react";
import { WriterPageFrame, WriterSurface } from "@/components/writer/WriterPageFrame";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { DECISIONS_FORMS, TASKS_FORMS, arCount } from "@/components/meetings/minutesShared";
import {
  WRITER_JOIN_WINDOW_MINUTES,
  canJoinWriterMeeting,
  writerMeetingCountdown,
} from "@/lib/writerMeetings";

type WriterMeeting = {
  id: string;
  title: string;
  description: string | null;
  scheduledAt: string | null;
  startedAt: string | null;
  hostName: string;
  durationMinutes: number | null;
  myRsvp: "yes" | "no" | null;
};

type MeetingsResponse = {
  live: WriterMeeting[];
  upcoming: WriterMeeting[];
  configured: boolean;
};

type ArchiveItem = {
  id: string;
  title: string;
  startedAt: string | null;
  endedAt: string | null;
  minutesStatus: string;
  decisions: number;
  tasks: number;
};

const RIYADH_TIME = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Riyadh",
});
const DAY_LONG = new Intl.DateTimeFormat("ar-u-ca-gregory-nu-latn", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "Asia/Riyadh",
});
const DAY_NUM = new Intl.DateTimeFormat("en-u-nu-latn", { day: "numeric", timeZone: "Asia/Riyadh" });
const MONTH_SHORT = new Intl.DateTimeFormat("ar-u-ca-gregory-nu-latn", { month: "long", timeZone: "Asia/Riyadh" });

function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function useRsvp() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ id, response }: { id: string; response: "yes" | "no" }) =>
      apiRequest(`/api/meetings/${id}/rsvp`, { method: "POST", body: JSON.stringify({ response }) }),
    onSuccess: (_data, { response }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/meetings"] });
      toast({
        title: response === "yes" ? "تم تأكيد حضورك" : "سجّلنا اعتذارك",
        description: response === "yes" ? "يصلك تذكير بالبريد قبل الموعد بنصف ساعة." : "الدعوة تبقى قائمة، وبإمكانك الانضمام متى تيسّر.",
      });
    },
    onError: (e: Error) => toast({ title: "تعذر حفظ ردك", description: e.message, variant: "destructive" }),
  });
}

function RsvpChoice({ meeting, size = "md" }: { meeting: WriterMeeting; size?: "md" | "sm" }) {
  const rsvp = useRsvp();
  const base = size === "md" ? "h-11 px-5 text-[15px]" : "h-9 px-4 text-sm";
  const option = (response: "yes" | "no", label: string) => {
    const active = meeting.myRsvp === response;
    return (
      <button
        type="button"
        onClick={() => rsvp.mutate({ id: meeting.id, response })}
        disabled={rsvp.isPending}
        aria-pressed={active}
        className={cn(
          "inline-flex items-center rounded-full transition-colors disabled:opacity-60",
          base,
          active
            ? "bg-[#1E9BE6] font-semibold text-white"
            : "bg-white text-[#1B2B3A] shadow-[inset_0_0_0_1px_#DCE4EC] hover:bg-[#F7FAFC] dark:bg-card dark:text-foreground dark:shadow-none",
        )}
        data-testid={`button-rsvp-${response}-${meeting.id}`}
      >
        {label}
      </button>
    );
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {option("yes", "سأحضر")}
      {option("no", "لن أحضر")}
    </div>
  );
}

function NextMeetingHero({ meeting, isLive, configured, now }: { meeting: WriterMeeting; isLive: boolean; configured: boolean; now: number }) {
  const [, setLocation] = useLocation();
  const at = meeting.scheduledAt ? new Date(meeting.scheduledAt) : null;
  const canJoin = configured && canJoinWriterMeeting({ isLive, scheduledAt: meeting.scheduledAt, now });
  const countdown = isLive ? null : writerMeetingCountdown(meeting.scheduledAt, now);
  return (
    <WriterSurface className="p-5 sm:p-7" id="next-meeting">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div
          className="flex h-[76px] w-[76px] shrink-0 flex-col items-center justify-center rounded-[18px] bg-[#EAF5FD] text-[#0B6FA8]"
          aria-hidden
        >
          {at ? (
            <>
              <span className="text-[28px] font-bold leading-none tabular-nums">{DAY_NUM.format(at)}</span>
              <span className="mt-1 text-xs">{MONTH_SHORT.format(at)}</span>
            </>
          ) : (
            <Radio className="h-6 w-6" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-[13px] font-semibold text-[#0B6FA8]">{isLive ? "يجري الآن" : "اجتماعك القادم"}</p>
          <h2 className="text-xl font-bold leading-snug text-[#1B2B3A] dark:text-foreground sm:text-[22px]" data-testid="text-next-meeting-title">
            {meeting.title}
          </h2>
          <p className="text-sm text-[#55667A] dark:text-muted-foreground">
            {at ? `${DAY_LONG.format(at)}، ${RIYADH_TIME.format(at)} بتوقيت الرياض` : "الموعد يحدده المضيف"}
            {meeting.durationMinutes ? ` · نحو ${meeting.durationMinutes} دقيقة` : ""}
            {meeting.hostName ? ` · يستضيفه ${meeting.hostName}` : ""}
          </p>
          {countdown ? (
            <p className="text-[15px] font-semibold text-[#1E9BE6]" data-testid="text-next-meeting-countdown">
              {countdown}
            </p>
          ) : null}
          {meeting.description ? (
            <p className="line-clamp-3 text-sm leading-6 text-[#55667A] dark:text-muted-foreground">{meeting.description}</p>
          ) : null}
        </div>
      </div>
      <div className="mt-6 flex flex-col gap-3 border-t border-[#EEF2F6] pt-5 dark:border-border sm:flex-row sm:items-center sm:justify-between">
        {isLive ? <span className="text-sm text-[#55667A]">الاجتماع مفتوح الآن.</span> : <RsvpChoice meeting={meeting} />}
        <button
          type="button"
          onClick={() => setLocation(`/dashboard/meetings/room/${meeting.id}`)}
          disabled={!canJoin}
          className="inline-flex h-11 items-center justify-center rounded-full bg-[#1E9BE6] px-6 text-[15px] font-semibold text-white hover:bg-[#178BD0] disabled:bg-[#EEF2F6] disabled:text-[#8A99A8] dark:disabled:bg-muted"
          data-testid="button-join-next-meeting"
        >
          {canJoin ? "انضم الآن" : `انضم (يتاح قبل الموعد بـ${WRITER_JOIN_WINDOW_MINUTES} دقائق)`}
        </button>
      </div>
      {!isLive && meeting.myRsvp === "yes" ? (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-[#55667A] dark:text-muted-foreground">
          <Mail className="h-3.5 w-3.5" />
          يصلك تذكير بالبريد قبل الموعد بنصف ساعة.
        </p>
      ) : null}
    </WriterSurface>
  );
}

export default function WriterMeetingsPage() {
  const now = useNow();
  const { data: dataRaw, isLoading } = useQuery({ queryKey: ["/api/meetings"], refetchInterval: 30_000 });
  const data = (dataRaw ?? null) as MeetingsResponse | null;
  const live = Array.isArray(data?.live) ? data.live : [];
  const upcoming = Array.isArray(data?.upcoming) ? data.upcoming : [];
  const configured = data?.configured !== false;

  // الأرشيف كاملًا بترقيم «الأقدم» (nextBefore) كما في مركز الاجتماعات.
  const archive = useInfiniteQuery({
    queryKey: ["/api/meetings-archive", "writer"],
    initialPageParam: "",
    queryFn: ({ pageParam }) =>
      apiRequest<{ items: ArchiveItem[]; nextBefore: string | null }>(
        `/api/meetings-archive${pageParam ? `?before=${encodeURIComponent(String(pageParam))}` : ""}`,
      ),
    getNextPageParam: (last) => last?.nextBefore || undefined,
    staleTime: 60_000,
  });
  const archivePages = Array.isArray(archive.data?.pages) ? archive.data.pages : [];
  const minutes = archivePages.flatMap((page) => (Array.isArray(page?.items) ? page.items : []));

  const hero = live[0] ?? upcoming[0] ?? null;
  const heroIsLive = Boolean(live[0]);
  const liveIds = new Set(live.map((m) => m.id));
  const rest = [...live.slice(1), ...upcoming].filter((m) => m.id !== hero?.id);

  return (
    <WriterPageFrame
      icon={Headphones}
      title="الاجتماعات"
      description="اجتماعات كتّاب الرأي مع هيئة التحرير: أكّد حضورك، وانضم في موعده، وارجع إلى محاضرها."
      titleTestId="text-writer-meetings-title"
    >
      {isLoading ? (
        <WriterSurface className="flex items-center justify-center gap-2 py-12 text-sm text-[#55667A]">
          <Loader2 className="h-4 w-4 animate-spin" /> جارٍ التحميل
        </WriterSurface>
      ) : hero ? (
        <NextMeetingHero meeting={hero} isLive={heroIsLive} configured={configured} now={now} />
      ) : (
        <WriterSurface className="px-6 py-10 text-center" data-testid="writer-meetings-empty">
          <p className="text-[15px] font-semibold text-[#1B2B3A] dark:text-foreground">لا اجتماعات قادمة الآن</p>
          <p className="mt-1 text-sm text-[#55667A] dark:text-muted-foreground">حين تُدعى لاجتماع يصلك إشعار ويظهر هنا.</p>
        </WriterSurface>
      )}

      {rest.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-[15px] font-bold text-[#1B2B3A] dark:text-foreground">بعده</h2>
          <WriterSurface className="divide-y divide-[#EEF2F6] dark:divide-border">
            {rest.map((m) => {
              const at = m.scheduledAt ? new Date(m.scheduledAt) : null;
              return (
                <div key={m.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center" data-testid={`row-writer-meeting-${m.id}`}>
                  <Link href={`/dashboard/meetings/${m.id}`} className="min-w-0 flex-1 hover:text-[#0B6FA8]">
                    <p className="truncate text-[15px] font-semibold text-[#1B2B3A] dark:text-foreground">
                      {liveIds.has(m.id) ? <span className="me-2 text-xs font-bold text-[#E5484D]">مباشر</span> : null}
                      {m.title}
                    </p>
                    <p className="text-xs text-[#55667A] dark:text-muted-foreground">
                      {at ? `${DAY_LONG.format(at)}، ${RIYADH_TIME.format(at)}` : "بلا موعد محدد"}
                    </p>
                  </Link>
                  {configured && canJoinWriterMeeting({ isLive: liveIds.has(m.id), scheduledAt: m.scheduledAt, now }) ? (
                    <Link
                      href={`/dashboard/meetings/room/${m.id}`}
                      className="inline-flex h-9 items-center rounded-full bg-[#1E9BE6] px-4 text-sm font-semibold text-white hover:bg-[#178BD0]"
                      data-testid={`button-join-${m.id}`}
                    >
                      انضم
                    </Link>
                  ) : liveIds.has(m.id) ? null : (
                    <RsvpChoice meeting={m} size="sm" />
                  )}
                </div>
              );
            })}
          </WriterSurface>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-[15px] font-bold text-[#1B2B3A] dark:text-foreground">المحاضر</h2>
        {minutes.length === 0 ? (
          <WriterSurface className="px-6 py-8 text-center text-sm text-[#55667A] dark:text-muted-foreground">
            لا محاضر بعد. يظهر هنا محضر كل اجتماع حضرته بعد اعتماده.
          </WriterSurface>
        ) : (
          <WriterSurface className="divide-y divide-[#EEF2F6] dark:divide-border">
            {minutes.map((m) => {
              const day = m.startedAt ?? m.endedAt;
              const ready = m.minutesStatus === "draft" || m.minutesStatus === "approved";
              return (
                <Link
                  key={m.id}
                  href={`/dashboard/meetings/${m.id}/minutes`}
                  className="flex items-center gap-3 px-5 py-4 hover:bg-[#F7FAFC] dark:hover:bg-muted/40"
                  data-testid={`row-writer-minutes-${m.id}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-[#1B2B3A] dark:text-foreground">{m.title}</p>
                    <p className="text-xs text-[#55667A] dark:text-muted-foreground">
                      {[day ? DAY_LONG.format(new Date(day)) : null, ready ? `${arCount(m.decisions, DECISIONS_FORMS)} · ${arCount(m.tasks, TASKS_FORMS)}` : "المحضر قيد الإعداد"]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <ChevronLeft className="h-4 w-4 shrink-0 text-[#8A99A8]" />
                </Link>
              );
            })}
            {archive.hasNextPage ? (
              <div className="px-5 py-3 text-center">
                <button
                  type="button"
                  onClick={() => archive.fetchNextPage()}
                  disabled={archive.isFetchingNextPage}
                  className="inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm text-[#0B6FA8] hover:bg-[#EEF4FA] disabled:opacity-60"
                  data-testid="button-writer-minutes-older"
                >
                  {archive.isFetchingNextPage ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  المحاضر الأقدم
                </button>
              </div>
            ) : null}
          </WriterSurface>
        )}
      </section>
    </WriterPageFrame>
  );
}
