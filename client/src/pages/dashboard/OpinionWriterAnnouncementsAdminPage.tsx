// إعلانات كتّاب الرأي — صفحة الإدارة (opinion.review):
// إنشاء إعلان (ملف، استطلاع، رابط، ملاحظة) بتاريخ انتهاء وبريد اختياري، وقائمة الإعلانات مع أعداد
// من رأى ومن تفاعل. التفاصيل بالأسماء في صفحة المتابعة (OpinionWriterAnnouncementTrackingPage).

import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Loader2, Megaphone, Plus, X } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  ANNOUNCEMENT_KINDS,
  DEFAULT_ANNOUNCEMENT_DAYS,
  MAX_ANNOUNCEMENT_BODY,
  MAX_ANNOUNCEMENT_TITLE,
  MAX_POLL_OPTIONS,
  announcementKindMeta,
  type AnnouncementKind,
} from "@shared/opinionWriterAnnouncements";

export type AdminAnnouncement = {
  id: string;
  kind: AnnouncementKind | string;
  title: string;
  body: string | null;
  linkUrl: string | null;
  file: { id: string; title: string; deleted: boolean } | null;
  pollOptions: string[];
  pollCounts: number[] | null;
  active: boolean;
  writersTotal: number;
  seenCount: number;
  actedCount: number;
  emailRequested: boolean;
  emailedAt: string | null;
  lastRemindedAt: string | null;
  reminderCount: number;
  createdByName: string | null;
  createdAt: string;
  expiresAt: string;
  archivedAt: string | null;
};

type AdminListResponse = {
  announcements?: AdminAnnouncement[];
  writersTotal?: number;
  feedbackResponses?: number;
};

type WriterFile = { id: string; title: string; createdAt: string };

export const ADMIN_ANNOUNCEMENTS_KEY = ["/api/admin/opinion-writer-announcements"] as const;

const INPUT =
  "h-11 w-full rounded-xl border border-[#E3E9F0] bg-[#F9FBFD] px-3.5 text-sm text-[#1B2B3A] outline-none focus:border-[#1E9BE6] focus:ring-2 focus:ring-[#1E9BE6]/20";
const LABEL = "flex flex-col gap-1.5 text-[13px] text-[#55667A]";

export function formatArDate(iso: string | null, withTime = false): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("ar", {
    weekday: withTime ? undefined : "long",
    day: "numeric",
    month: "long",
    hour: withTime ? "numeric" : undefined,
    minute: withTime ? "2-digit" : undefined,
    timeZone: "Asia/Riyadh",
    numberingSystem: "latn",
  });
}

function defaultExpiry(): string {
  const d = new Date(Date.now() + DEFAULT_ANNOUNCEMENT_DAYS * 24 * 60 * 60 * 1000);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
}

function NewAnnouncementForm({ onCreated }: { onCreated: () => void }) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [kind, setKind] = useState<AnnouncementKind>("file");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [fileId, setFileId] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [expiresAt, setExpiresAt] = useState(defaultExpiry);
  const [sendEmail, setSendEmail] = useState(false);

  const { data: filesData } = useQuery<{ files?: WriterFile[] } | null>({
    queryKey: ["/api/opinion-writer-files"],
    staleTime: 60_000,
  });
  const files = Array.isArray(filesData?.files) ? filesData!.files! : [];

  const create = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = { kind, title, expiresAt, sendEmail };
      if (body.trim()) payload.body = body;
      if (kind === "file") payload.fileId = fileId;
      if (kind === "link") payload.linkUrl = linkUrl;
      if (kind === "poll") payload.pollOptions = options.filter((o) => o.trim());
      return apiRequest("/api/admin/opinion-writer-announcements", { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      toast({ title: "نُشر الإعلان", description: sendEmail ? "يصل البريد للكتّاب خلال دقيقتين تقريباً" : "يظهر الآن أعلى لوحة كل كاتب" });
      setTitle("");
      setBody("");
      setLinkUrl("");
      setOptions(["", ""]);
      setSendEmail(false);
      onCreated();
    },
    onError: (err: Error) => toast({ title: "تعذر نشر الإعلان", description: err.message, variant: "destructive" }),
  });

  const pickFile = (id: string) => {
    setFileId(id);
    const f = files.find((x) => x.id === id);
    if (f && !title.trim()) setTitle(f.title);
  };

  return (
    <section className="flex flex-col gap-4 rounded-[22px] bg-white p-5 shadow-[0_1px_3px_rgba(27,43,58,0.06)]" data-testid="announcement-form">
      <h2 className="m-0 text-[17px] font-bold">إعلان جديد</h2>
      <div className="flex flex-col gap-2">
        <p className="m-0 text-[13px] text-[#55667A]">النوع</p>
        <div className="flex flex-wrap gap-2">
          {ANNOUNCEMENT_KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => setKind(k.id)}
              aria-pressed={kind === k.id}
              data-testid={`kind-${k.id}`}
              className={cn(
                "h-10 rounded-full px-4 text-sm transition-colors",
                kind === k.id ? "bg-[#1E9BE6] font-semibold text-white" : "bg-[#F4F7FB] text-[#1B2B3A] hover:bg-[#EAF0F6]",
              )}
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>

      {kind === "file" ? (
        <label className={LABEL}>
          الملف
          <select className={INPUT} value={fileId} onChange={(e) => pickFile(e.target.value)} data-testid="select-file">
            <option value="">اختر من ملفات الكتّاب…</option>
            {files.map((f) => (
              <option key={f.id} value={f.id}>
                {f.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="self-start text-xs text-[#0B6FA8] hover:underline"
            onClick={() => navigate("/dashboard/opinion-writer-files")}
          >
            ارفع ملف PDF جديداً من «ملفات الكتّاب»
          </button>
        </label>
      ) : null}

      <label className={LABEL}>
        {kind === "poll" ? "السؤال" : "العنوان"}
        <input
          className={INPUT}
          value={title}
          maxLength={MAX_ANNOUNCEMENT_TITLE}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={kind === "poll" ? "أي موعد يناسبك للقاء القادم؟" : "محضر لقاء كتّاب الرأي — 23 نوفمبر"}
          data-testid="input-title"
        />
      </label>

      {kind === "poll" ? (
        <div className="flex flex-col gap-2">
          <p className="m-0 text-[13px] text-[#55667A]">الخيارات</p>
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                className={INPUT}
                value={o}
                maxLength={80}
                onChange={(e) => setOptions((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                placeholder={`الخيار ${i + 1}`}
                data-testid={`input-option-${i}`}
              />
              {options.length > 2 ? (
                <button
                  type="button"
                  aria-label="حذف الخيار"
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#F4F7FB] text-[#55667A] hover:bg-[#EAF0F6]"
                  onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))}
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          ))}
          {options.length < MAX_POLL_OPTIONS ? (
            <button
              type="button"
              className="flex h-10 items-center gap-1.5 self-start rounded-full px-3 text-sm text-[#0B6FA8] hover:bg-[#E6F4FD]"
              onClick={() => setOptions((prev) => [...prev, ""])}
            >
              <Plus className="h-4 w-4" /> خيار آخر
            </button>
          ) : null}
        </div>
      ) : null}

      {kind === "link" ? (
        <label className={LABEL}>
          الرابط
          <input
            className={INPUT}
            dir="ltr"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://… أو /dashboard/…"
            data-testid="input-link"
          />
        </label>
      ) : null}

      <label className={LABEL}>
        {kind === "note" ? "نص الملاحظة" : "تفاصيل (اختياري)"}
        <textarea
          className={cn(INPUT, "h-auto min-h-[88px] resize-y py-2.5 leading-7")}
          value={body}
          maxLength={MAX_ANNOUNCEMENT_BODY}
          onChange={(e) => setBody(e.target.value)}
          data-testid="input-body"
        />
      </label>

      <div className="flex flex-wrap items-end gap-4">
        <label className={cn(LABEL, "w-44")}>
          يظهر حتى
          <input type="date" className={INPUT} dir="ltr" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} data-testid="input-expiry" />
        </label>
        <label className="flex h-11 cursor-pointer items-center gap-2 text-sm text-[#1B2B3A]">
          <input
            type="checkbox"
            className="h-5 w-5 accent-[#1E9BE6]"
            checked={sendEmail}
            onChange={(e) => setSendEmail(e.target.checked)}
            data-testid="checkbox-email"
          />
          تنبيه بريدي للكتّاب
        </label>
      </div>

      <button
        type="button"
        disabled={create.isPending}
        onClick={() => create.mutate()}
        className="flex h-11 items-center justify-center gap-2 self-start rounded-full bg-[#1E9BE6] px-6 text-sm font-bold text-white shadow-[0_6px_16px_rgba(30,155,230,0.3)] hover:bg-[#1789CE] disabled:opacity-60"
        data-testid="button-publish-announcement"
      >
        {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        نشر الإعلان
      </button>
      <p className="m-0 text-xs leading-6 text-[#55667A]">
        الاجتماع القادم ونموذج «اهتماماتي ومقترحاتي» يظهران للكتّاب تلقائياً ولا يحتاجان إعلاناً.
      </p>
    </section>
  );
}

function PollBars({ options, counts }: { options: string[]; counts: number[] }) {
  const max = Math.max(1, ...counts);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {options.map((o, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className="w-20 shrink-0 truncate text-[#55667A]">{o}</span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-[#EEF2F6]">
            <span className="block h-full rounded-full bg-[#1E9BE6]" style={{ width: `${(counts[i] / max) * 100}%` }} />
          </span>
          <span className="w-6 text-left tabular-nums">{counts[i]}</span>
        </div>
      ))}
    </div>
  );
}

const ROW = "flex flex-col gap-2 border-b border-[#EEF2F6] px-5 py-3.5 last:border-b-0";
const ROW_TOP = "flex flex-wrap items-start justify-between gap-x-3 gap-y-2";
const BTN_SOFT = "h-10 rounded-full bg-[#E6F4FD] px-4 text-[13px] font-semibold text-[#0B6FA8] hover:bg-[#D5ECFB]";
const BTN_GHOST = "h-10 rounded-full bg-[#F4F7FB] px-4 text-[13px] text-[#1B2B3A] hover:bg-[#EAF0F6] disabled:opacity-60";

function AnnouncementRow({ a, onOpen, onArchive, archiving }: {
  a: AdminAnnouncement;
  onOpen: () => void;
  onArchive: () => void;
  archiving: boolean;
}) {
  const meta = announcementKindMeta(a.kind);
  return (
    <div className={ROW} data-testid={`announcement-row-${a.id}`}>
      <div className={ROW_TOP}>
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-right">
          <p className="m-0 text-sm font-semibold text-[#1B2B3A] hover:text-[#0B6FA8]">{a.title}</p>
          <p className="m-0 text-xs text-[#55667A]">
            {meta.label} · {a.active ? `حتى ${formatArDate(a.expiresAt)}` : a.archivedAt ? "أُنهي" : "انتهى"}
            {a.file?.deleted ? " · الملف محذوف" : ""}
            {a.emailRequested ? " · أُرسل بالبريد" : ""}
            {a.reminderCount ? ` · ذُكّروا ${a.reminderCount}` : ""}
          </p>
        </button>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={onOpen} className={BTN_SOFT} data-testid={`button-tracking-${a.id}`}>
            المتابعة
          </button>
          {a.active ? (
            <button type="button" disabled={archiving} onClick={onArchive} className={BTN_GHOST} data-testid={`button-archive-${a.id}`}>
              {a.kind === "poll" ? "إنهاء" : "إخفاء"}
            </button>
          ) : null}
        </div>
      </div>
      {a.kind === "poll" && a.pollCounts ? (
        <div className="max-w-sm">
          <PollBars options={a.pollOptions} counts={a.pollCounts} />
        </div>
      ) : (
        <p className="m-0 text-[13px] text-[#55667A]">
          <b className="text-[#1E9BE6]">{a.actedCount}</b> {meta.actionLabel} من {a.writersTotal} · رآه {a.seenCount}
        </p>
      )}
    </div>
  );
}

export default function OpinionWriterAnnouncementsAdminPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const { data, isLoading, isError } = useQuery<AdminListResponse | null>({
    queryKey: ADMIN_ANNOUNCEMENTS_KEY,
    staleTime: 15_000,
  });
  const list = Array.isArray(data?.announcements) ? data!.announcements! : [];
  const active = useMemo(() => list.filter((a) => a.active), [list]);
  const ended = useMemo(() => list.filter((a) => !a.active), [list]);
  const writersTotal = data?.writersTotal ?? 0;

  const archive = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/admin/opinion-writer-announcements/${id}/archive`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "أُخفي الإعلان من لوحات الكتّاب" });
      qc.invalidateQueries({ queryKey: ADMIN_ANNOUNCEMENTS_KEY });
    },
    onError: (err: Error) => toast({ title: "تعذر الإخفاء", description: err.message, variant: "destructive" }),
  });

  return (
    <DashboardLayout>
      <DashboardPageShell maxWidthClassName="max-w-6xl" contentClassName="px-4 pb-16 sm:px-6">
        <DashboardPageHeader
          icon={Megaphone}
          title="إعلانات كتّاب الرأي"
          description="ما يظهر أعلى لوحة كل كاتب، ومن رآه ومن تفاعل معه بالاسم"
          titleTestId="text-writer-announcements-title"
        />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]" dir="rtl">
          <NewAnnouncementForm onCreated={() => qc.invalidateQueries({ queryKey: ADMIN_ANNOUNCEMENTS_KEY })} />

          <div className="flex min-w-0 flex-col gap-4">
            <section className="overflow-hidden rounded-[22px] bg-white shadow-[0_1px_3px_rgba(27,43,58,0.06)]">
              <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
                <h2 className="m-0 text-[17px] font-bold">الظاهرة الآن للكتّاب</h2>
                <span className="text-[13px] text-[#55667A]">{writersTotal} كاتبًا</span>
              </div>

              <div className={ROW}>
                <div className={ROW_TOP}>
                  <div className="min-w-0 flex-1">
                    <p className="m-0 text-sm font-semibold">الاجتماع القادم</p>
                    <p className="m-0 flex items-center gap-1 text-xs text-[#55667A]">
                      <CalendarDays className="h-3.5 w-3.5" /> تلقائي من منصة الاجتماعات · الردود والحضور في صفحة الاجتماع
                    </p>
                  </div>
                  <button type="button" onClick={() => navigate("/dashboard/meetings")} className={BTN_SOFT}>
                    الاجتماعات
                  </button>
                </div>
              </div>

              <div className={ROW}>
                <div className={ROW_TOP}>
                  <button type="button" className="min-w-0 flex-1 text-right" onClick={() => navigate("/dashboard/opinion-writer-announcements/feedback-form")}>
                    <p className="m-0 text-sm font-semibold">اهتماماتك ومقترحاتك</p>
                    <p className="m-0 text-xs text-[#55667A]">نموذج · تلقائي، يختفي لمن عبّأه</p>
                  </button>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => navigate("/dashboard/opinion-writer-announcements/feedback-form")}
                      className={BTN_SOFT}
                      data-testid="button-tracking-feedback-form"
                    >
                      المتابعة
                    </button>
                    <button type="button" onClick={() => navigate("/dashboard/opinion-writer-feedback")} className={BTN_GHOST}>
                      الردود
                    </button>
                  </div>
                </div>
                <p className="m-0 text-[13px] text-[#55667A]">
                  <b className="text-[#1E9BE6]">{data?.feedbackResponses ?? 0}</b> عبّأوه من {writersTotal}
                </p>
              </div>

              {isLoading ? (
                <p className="flex items-center justify-center gap-2 py-10 text-sm text-[#55667A]">
                  <Loader2 className="h-4 w-4 animate-spin" /> جارٍ التحميل…
                </p>
              ) : isError ? (
                <p className="py-10 text-center text-sm text-[#BF3038]">تعذر جلب الإعلانات حالياً.</p>
              ) : active.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-[#55667A]">لا توجد إعلانات يدوية ظاهرة الآن. أضف أول إعلان من النموذج.</p>
              ) : (
                active.map((a) => (
                  <AnnouncementRow
                    key={a.id}
                    a={a}
                    onOpen={() => navigate(`/dashboard/opinion-writer-announcements/${a.id}`)}
                    onArchive={() => archive.mutate(a.id)}
                    archiving={archive.isPending}
                  />
                ))
              )}
            </section>

            {ended.length ? (
              <section className="overflow-hidden rounded-[22px] bg-white shadow-[0_1px_3px_rgba(27,43,58,0.06)]">
                <h2 className="m-0 px-5 pb-2 pt-4 text-[15px] font-bold text-[#55667A]">انتهت خلال آخر 30 يوماً</h2>
                {ended.map((a) => (
                  <AnnouncementRow
                    key={a.id}
                    a={a}
                    onOpen={() => navigate(`/dashboard/opinion-writer-announcements/${a.id}`)}
                    onArchive={() => {}}
                    archiving={false}
                  />
                ))}
              </section>
            ) : null}
          </div>
        </div>
      </DashboardPageShell>
    </DashboardLayout>
  );
}
