// «إعلانات مهمة» أعلى مساحة كاتب الرأي: الاجتماع القادم (تلقائي من منصة الاجتماعات)،
// وإعلانات الإدارة (ملف، استطلاع، رابط، ملاحظة)، ونموذج «اهتماماتي ومقترحاتي» لمن لم يعبّئه.
// ظهور الإعلان يُسجَّل مرة واحدة لمتابعة الإدارة بالأسماء، والتحميل يُسجَّل من مسار التنزيل نفسه.

import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarDays,
  Check,
  FileText,
  Link2,
  MessageSquareHeart,
  Radio,
  StickyNote,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, apiUrl } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useUpcomingMeeting } from "@/components/meetings/UpcomingMeetingNotice";
import {
  formatMeetingDate,
  formatMeetingTime,
  getMeetingTimingInfo,
} from "@/components/meetings/meetingNoticeTiming";
import { MY_WRITER_FEEDBACK_KEY, type MyWriterFeedbackResponse } from "./WriterFeedbackPage";

export type WriterAnnouncement = {
  id: string;
  kind: "file" | "poll" | "link" | "note" | string;
  title: string;
  body: string | null;
  linkUrl: string | null;
  file: { id: string; title: string; fileSizeBytes: number } | null;
  pollOptions: string[];
  pollCounts: number[] | null;
  voters: number | null;
  myVote: number | null;
  acted: boolean;
  seen: boolean;
  remindedAt: string | null;
  createdAt: string;
  expiresAt: string;
};

export const WRITER_ANNOUNCEMENTS_KEY = ["/api/opinion-writer-announcements"] as const;

const CARD = "flex flex-col gap-2.5 rounded-[18px] bg-white p-4 shadow-[0_2px_8px_rgba(27,43,58,0.06)]";
const PRIMARY_BTN =
  "flex h-11 flex-1 items-center justify-center rounded-full bg-[#1E9BE6] px-4 text-sm font-bold text-white transition-colors hover:bg-[#1789CE] disabled:opacity-60";
const SOFT_BTN =
  "flex h-11 flex-1 items-center justify-center rounded-full bg-[#E6F4FD] px-4 text-sm font-bold text-[#0B6FA8] transition-colors hover:bg-[#D5ECFB] disabled:opacity-60";
const GHOST_BTN =
  "flex h-11 items-center justify-center rounded-full bg-[#F4F7FB] px-4 text-sm text-[#1B2B3A] transition-colors hover:bg-[#EAF0F6] disabled:opacity-60";

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} ميجابايت`;
  return `${Math.max(1, Math.round(bytes / 1024))} كيلوبايت`;
}

function expiryBadge(expiresAt: string): string | null {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms > 3 * 24 * 60 * 60 * 1000) return null;
  const day = new Date(expiresAt).toLocaleDateString("ar", { weekday: "long", timeZone: "Asia/Riyadh" });
  return `ينتهي ${day}`;
}

function Pill({ tone, children }: { tone: "blue" | "amber" | "green" | "red" | "muted"; children: React.ReactNode }) {
  const tones = {
    blue: "bg-[#E6F4FD] text-[#0B6FA8]",
    amber: "bg-[#FFF6E5] text-[#946000]",
    green: "bg-[#E8F6EF] text-[#13734E]",
    red: "bg-[#FDECEC] text-[#BF3038]",
    muted: "bg-transparent text-[#55667A] font-normal",
  } as const;
  return <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", tones[tone])}>{children}</span>;
}

function CardHead({
  icon: Icon,
  iconTone,
  badge,
}: {
  icon: typeof FileText;
  iconTone: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={cn("grid h-10 w-10 place-items-center rounded-xl", iconTone)}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      {badge}
    </div>
  );
}

function CardText({ label, title, meta }: { label: string; title: string; meta?: React.ReactNode }) {
  return (
    <div>
      <p className="m-0 text-xs text-[#55667A]">{label}</p>
      <h3 className="mt-0.5 text-[15px] font-semibold leading-relaxed text-[#1B2B3A]">{title}</h3>
      {meta ? <div className="mt-1 text-[13px] leading-relaxed text-[#55667A]">{meta}</div> : null}
    </div>
  );
}

function statusBadge(a: WriterAnnouncement, doneLabel: string) {
  if (a.acted) return <Pill tone="green">{doneLabel}</Pill>;
  if (a.remindedAt) return <Pill tone="amber">تذكير</Pill>;
  const exp = expiryBadge(a.expiresAt);
  if (exp) return <Pill tone="muted">{exp}</Pill>;
  if (!a.seen) return <Pill tone="amber">جديد</Pill>;
  return null;
}

function MeetingCard() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { meeting, rsvp, now } = useUpcomingMeeting();
  if (!meeting) return null;
  const isLive = meeting.status === "live";
  const isHost = meeting.hostUserId === user?.id;
  const timing = isLive ? null : getMeetingTimingInfo(meeting.scheduledAt, now);

  return (
    <article className={CARD} data-testid="writer-board-meeting">
      <CardHead
        icon={isLive ? Radio : CalendarDays}
        iconTone={isLive ? "bg-[#FDECEC] text-[#BF3038]" : "bg-[#E6F4FD] text-[#0B6FA8]"}
        badge={
          isLive ? (
            <Pill tone="red">مباشر الآن</Pill>
          ) : timing?.countdownLabel ? (
            <Pill tone="amber">{timing.countdownLabel}</Pill>
          ) : timing?.dayBadge ? (
            <Pill tone="blue">{timing.dayBadge}</Pill>
          ) : null
        }
      />
      <CardText
        label="موعد اجتماع"
        title={meeting.title}
        meta={
          isLive ? (
            `يستضيفه ${meeting.hostName}`
          ) : (
            <span>
              {formatMeetingDate(meeting.scheduledAt)} · <span dir="ltr">{formatMeetingTime(meeting.scheduledAt)}</span>
            </span>
          )
        }
      />
      <div className="mt-auto flex gap-2">
        {isLive ? (
          <button type="button" className={PRIMARY_BTN} onClick={() => navigate(`/dashboard/meetings/room/${meeting.id}`)}>
            انضم الآن
          </button>
        ) : isHost ? (
          <button type="button" className={SOFT_BTN} onClick={() => navigate(`/dashboard/meetings/${meeting.id}`)}>
            تفاصيل الاجتماع
          </button>
        ) : meeting.myRsvp === "yes" ? (
          <p className="m-0 flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-[#E8F6EF] text-[13px] font-semibold text-[#13734E]">
            <Check className="h-4 w-4" aria-hidden="true" /> تم تأكيد حضورك
          </p>
        ) : (
          <>
            <button
              type="button"
              className={PRIMARY_BTN}
              disabled={rsvp.isPending}
              onClick={() => rsvp.mutate("yes")}
              data-testid="button-board-rsvp-yes"
            >
              سأحضر
            </button>
            <button
              type="button"
              className={cn(GHOST_BTN, meeting.myRsvp === "no" && "ring-1 ring-[#C9D3DD]")}
              disabled={rsvp.isPending}
              onClick={() => rsvp.mutate("no")}
              aria-pressed={meeting.myRsvp === "no"}
            >
              {meeting.myRsvp === "no" ? "اعتذرت" : "لا أستطيع"}
            </button>
          </>
        )}
      </div>
    </article>
  );
}

function FileCard({ a, onActed }: { a: WriterAnnouncement; onActed: () => void }) {
  if (!a.file) return null;
  return (
    <article className={CARD} data-testid={`writer-board-file-${a.id}`}>
      <CardHead icon={FileText} iconTone="bg-[#FDECEC] text-[#BF3038]" badge={statusBadge(a, "حمّلته")} />
      <CardText label="ملف للتحميل" title={a.title} meta={a.body ? <span className="line-clamp-2">{a.body}</span> : `PDF · ${formatSize(a.file.fileSizeBytes)}`} />
      <div className="mt-auto flex gap-2">
        <a
          className={SOFT_BTN}
          href={apiUrl(`/api/opinion-writer-files/${a.file.id}/download?download=1`)}
          download
          onClick={onActed}
          data-testid={`button-board-download-${a.id}`}
        >
          {a.acted ? "حمّله مرة أخرى" : "تحميل الملف"}
        </a>
      </div>
    </article>
  );
}

function PollCard({ a, isWriter }: { a: WriterAnnouncement; isWriter: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const vote = useMutation({
    mutationFn: (optionIndex: number) =>
      apiRequest(`/api/opinion-writer-announcements/${a.id}/vote`, {
        method: "POST",
        body: JSON.stringify({ optionIndex }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: WRITER_ANNOUNCEMENTS_KEY }),
    onError: (err: Error) => toast({ title: "تعذر حفظ صوتك", description: err.message, variant: "destructive" }),
  });
  const total = a.voters ?? 0;
  return (
    <article className={CARD} data-testid={`writer-board-poll-${a.id}`}>
      <CardHead icon={BarChart3} iconTone="bg-[#E8F6EF] text-[#13734E]" badge={statusBadge(a, "شاركت")} />
      <CardText label="استطلاع سريع" title={a.title} meta={a.body ?? undefined} />
      <div className="flex flex-col gap-1.5">
        {a.pollOptions.map((opt, i) => {
          const mine = a.myVote === i;
          const count = a.pollCounts?.[i] ?? 0;
          const pct = total ? Math.round((count / total) * 100) : 0;
          return (
            <button
              key={i}
              type="button"
              disabled={!isWriter || vote.isPending}
              onClick={() => vote.mutate(i)}
              aria-pressed={mine}
              className={cn(
                "relative flex min-h-11 items-center justify-between gap-2 overflow-hidden rounded-full px-4 text-right text-sm transition-colors",
                mine ? "bg-[#1E9BE6] font-semibold text-white" : "bg-[#F4F7FB] text-[#1B2B3A] hover:bg-[#EAF0F6]",
              )}
            >
              {a.pollCounts && !mine ? (
                <span className="absolute inset-y-0 right-0 bg-[#E6F4FD]" style={{ width: `${pct}%` }} aria-hidden="true" />
              ) : null}
              <span className="relative">{opt}</span>
              {a.pollCounts ? <span className="relative text-xs">{pct}%</span> : null}
            </button>
          );
        })}
      </div>
      {a.myVote !== null ? (
        <p className="m-0 text-xs text-[#13734E]">شكرًا، سُجّل صوتك · {total} كاتبًا صوّتوا. يمكنك تغيير اختيارك.</p>
      ) : !isWriter ? (
        <p className="m-0 text-xs text-[#55667A]">معاينة: التصويت للكتّاب فقط</p>
      ) : null}
    </article>
  );
}

function useMarkActed(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest(`/api/opinion-writer-announcements/${id}/acted`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: WRITER_ANNOUNCEMENTS_KEY }),
  });
}

function LinkCard({ a }: { a: WriterAnnouncement }) {
  const [, navigate] = useLocation();
  const acted = useMarkActed(a.id);
  const open = () => {
    acted.mutate();
    if (!a.linkUrl) return;
    if (a.linkUrl.startsWith("/")) navigate(a.linkUrl);
    else window.open(a.linkUrl, "_blank", "noopener,noreferrer");
  };
  return (
    <article className={CARD} data-testid={`writer-board-link-${a.id}`}>
      <CardHead icon={Link2} iconTone="bg-[#EEF1FE] text-[#5B5BD6]" badge={statusBadge(a, "فتحته")} />
      <CardText label="رابط مهم" title={a.title} meta={a.body ? <span className="line-clamp-3">{a.body}</span> : undefined} />
      <div className="mt-auto flex gap-2">
        <button type="button" className={SOFT_BTN} onClick={open}>
          افتح الرابط
        </button>
      </div>
    </article>
  );
}

function NoteCard({ a }: { a: WriterAnnouncement }) {
  const acted = useMarkActed(a.id);
  return (
    <article className={CARD} data-testid={`writer-board-note-${a.id}`}>
      <CardHead icon={StickyNote} iconTone="bg-[#FFF6E5] text-[#946000]" badge={statusBadge(a, "اطّلعت")} />
      <CardText label="ملاحظة من الإدارة" title={a.title} />
      {a.body ? <p className="m-0 whitespace-pre-line text-sm leading-7 text-[#1B2B3A]">{a.body}</p> : null}
      {!a.acted ? (
        <div className="mt-auto flex gap-2">
          <button type="button" className={SOFT_BTN} disabled={acted.isPending} onClick={() => acted.mutate()}>
            اطّلعت عليها
          </button>
        </div>
      ) : null}
    </article>
  );
}

function FeedbackFormCard() {
  const [, navigate] = useLocation();
  return (
    <article className={CARD} data-testid="writer-board-feedback">
      <CardHead icon={MessageSquareHeart} iconTone="bg-[#EEF1FE] text-[#5B5BD6]" badge={<Pill tone="muted">دقيقة واحدة</Pill>} />
      <CardText label="تقدّم باقتراحاتك" title="اهتماماتك ومقترحاتك للتطوير القادم" meta="لنتواصل معك حسب تخصصك" />
      <div className="mt-auto flex gap-2">
        <button
          type="button"
          className={SOFT_BTN}
          onClick={() => navigate("/dashboard/opinion-author/feedback")}
          data-testid="button-open-writer-feedback"
        >
          عبّئ النموذج
        </button>
      </div>
    </article>
  );
}

export function WriterAnnouncementsBoard() {
  const qc = useQueryClient();
  const { meeting } = useUpcomingMeeting();
  const { data } = useQuery<{ announcements: WriterAnnouncement[]; isWriter: boolean } | null>({
    queryKey: WRITER_ANNOUNCEMENTS_KEY,
    staleTime: 60_000,
    retry: false,
  });
  const { data: feedback } = useQuery<MyWriterFeedbackResponse | null>({
    queryKey: MY_WRITER_FEEDBACK_KEY,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const announcements = Array.isArray(data?.announcements) ? data!.announcements : [];
  const isWriter = Boolean(data?.isWriter);
  const showFeedback = Boolean(feedback?.isWriter && !feedback.feedback);

  // الظهور يُسجَّل مرة لكل إعلان لم يُسجَّل بعد
  const reported = useRef(new Set<string>());
  useEffect(() => {
    if (!isWriter) return;
    const ids = announcements.filter((a) => !a.seen && !reported.current.has(a.id)).map((a) => a.id);
    if (!ids.length) return;
    ids.forEach((id) => reported.current.add(id));
    apiRequest("/api/opinion-writer-announcements/seen", { method: "POST", body: JSON.stringify({ ids }) }).catch(() => {
      ids.forEach((id) => reported.current.delete(id));
    });
  }, [announcements, isWriter]);

  const afterDownload = () => {
    window.setTimeout(() => qc.invalidateQueries({ queryKey: WRITER_ANNOUNCEMENTS_KEY }), 2500);
  };

  const pending =
    (meeting && meeting.status !== "live" && !meeting.myRsvp ? 1 : 0) +
    announcements.filter((a) => !a.acted).length +
    (showFeedback ? 1 : 0);

  if (!meeting && !announcements.length && !showFeedback) return null;

  return (
    <section
      aria-labelledby="writer-board-title"
      className="flex flex-col gap-3.5 rounded-[22px] border border-white bg-gradient-to-br from-[#E2F2FD] to-[#EEF1FE] p-4 sm:p-5"
      dir="rtl"
      data-testid="writer-announcements-board"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2.5">
          <h2 id="writer-board-title" className="m-0 text-lg font-bold text-[#1B2B3A] sm:text-xl">
            إعلانات مهمة
          </h2>
          {pending > 0 ? <span className="text-[13px] font-semibold text-[#0B6FA8]">{pending} بانتظارك</span> : null}
        </div>
        <span className="hidden text-xs text-[#55667A] sm:inline">من إدارة مقالات الرأي</span>
      </div>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        <MeetingCard />
        {announcements.map((a) =>
          a.kind === "file" ? (
            <FileCard key={a.id} a={a} onActed={afterDownload} />
          ) : a.kind === "poll" ? (
            <PollCard key={a.id} a={a} isWriter={isWriter} />
          ) : a.kind === "link" ? (
            <LinkCard key={a.id} a={a} />
          ) : (
            <NoteCard key={a.id} a={a} />
          ),
        )}
        {showFeedback ? <FeedbackFormCard /> : null}
      </div>
    </section>
  );
}
