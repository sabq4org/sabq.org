import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  LANE_LABELS,
  VERDICT_LABELS,
  fmtChange,
  fmtInt,
  fmtPct,
  fmtPos,
  type ExperimentVerdict,
  type GscMetrics,
  type SeoExperimentReview,
  type SeoOpportunity,
  type SeoTitleRow,
  type SeoWeeklyPayload,
} from "@shared/seoWeekly";

type ReportRow = { id: string; periodStart: string; periodEnd: string; payload: SeoWeeklyPayload; emailedAt: string | null };
type ListResponse = { reports: Array<{ id: string; periodStart: string; periodEnd: string }>; latest: ReportRow | null };
type Status = { ok: boolean; site: string; serviceAccount: string | null; code?: string; error?: string };

const LIST_QUERY = ["/api/admin/seo-weekly"];
const invalidateReports = () =>
  queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0] ?? "").startsWith("/api/admin/seo-weekly") });
const SHADOW = "shadow-[0_1px_2px_rgba(27,43,58,0.04),0_6px_18px_rgba(27,43,58,0.06)]";
const GROUP = `rounded-[22px] bg-white ${SHADOW}`;
const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

function periodLabel(start: string, end: string): string {
  const [, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  return sm === em ? `${sd}–${ed} ${MONTHS[em - 1]} ${ey}` : `${sd} ${MONTHS[sm - 1]} – ${ed} ${MONTHS[em - 1]} ${ey}`;
}

function Num({ children }: { children: React.ReactNode }) {
  return <span dir="ltr" className="[unicode-bidi:isolate] tabular-nums">{children}</span>;
}

function Delta({ current, previous, invert = false }: { current: number; previous: number; invert?: boolean }) {
  const up = current >= previous;
  const good = invert ? !up : up;
  const big = previous > 0 && Math.abs(current - previous) / previous >= 0.25;
  const cls = good ? "bg-[#E8F6EF] text-[#13734E]" : big ? "bg-[#FDECEE] text-[#BF3038]" : "bg-[#FFF6E5] text-[#946000]";
  return (
    <span className={`inline-flex rounded-full px-2.5 text-[12px] font-semibold ${cls}`}>
      <Num>{fmtChange(current, previous)}</Num>
    </span>
  );
}

function Summary({ payload }: { payload: SeoWeeklyPayload }) {
  const c = payload.totals.current;
  const p = payload.totals.previous;
  const en = payload.english;
  const impDrop = p.impressions > 0 && c.impressions < p.impressions * 0.75;
  return (
    <section
      aria-label="ملخص الأسبوع"
      className={`grid gap-4 rounded-[22px] border border-white bg-gradient-to-br from-[#E2F2FD] to-[#EEF1FE] p-5 sm:grid-cols-[1.2fr_1fr] ${SHADOW}`}
    >
      <div className="space-y-1.5">
        <p className="text-[13px] text-[#55667A]">النقرات من بحث Google</p>
        <p className="text-[34px] font-bold leading-none" data-testid="text-total-clicks"><Num>{fmtInt(c.clicks)}</Num></p>
        <p className="text-[13px] text-[#55667A]">
          <Delta current={c.clicks} previous={p.clicks} /> عن الأسبوع السابق (<Num>{fmtInt(p.clicks)}</Num>)
        </p>
        {impDrop && c.clicks >= p.clicks * 0.85 && (
          <p className="mt-2 rounded-xl bg-white/60 px-3 py-2 text-[13px] text-[#55667A]">
            الظهور نزل كثيرًا والنقرات شبه ثابتة. غالبًا كان في الأسبوع السابق أخبار كبيرة رفعت الظهور، فتابعه الأسبوع القادم قبل الحكم.
          </p>
        )}
      </div>
      <div className="grid gap-2 rounded-2xl bg-white/70 px-4 py-3 text-sm">
        <div className="flex justify-between gap-3"><span>مرات الظهور</span><b className="font-semibold"><Num>{fmtInt(c.impressions)}</Num> <Delta current={c.impressions} previous={p.impressions} /></b></div>
        <div className="flex justify-between gap-3"><span>نسبة النقر</span><b className="font-semibold"><Num>{fmtPct(c.ctr)}</Num> <span className="text-[12px] text-[#617183]">كانت <Num>{fmtPct(p.ctr)}</Num></span></b></div>
        <div className="flex justify-between gap-3"><span>متوسط الموضع</span><b className="font-semibold"><Num>{fmtPos(c.position)}</Num> <span className="text-[12px] text-[#617183]">كان <Num>{fmtPos(p.position)}</Num></span></b></div>
        <div className="flex justify-between gap-3"><span>النسخة الإنجليزية</span><b className="font-semibold"><Num>{fmtInt(en.current.clicks)}</Num> <Delta current={en.current.clicks} previous={en.previous.clicks} /></b></div>
        {payload.home && <div className="flex justify-between gap-3"><span>الرئيسية وحدها</span><b className="font-semibold"><Num>{fmtInt(payload.home.clicks)}</Num></b></div>}
      </div>
    </section>
  );
}

function Stats({ m, prev }: { m: GscMetrics; prev?: GscMetrics | null }) {
  return (
    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 border-t border-[#EEF2F6] pt-2.5 text-[13px] text-[#55667A]">
      <span>الظهور <b className="font-semibold text-[#1B2B3A]"><Num>{fmtInt(m.impressions)}</Num></b> {prev && <Delta current={m.impressions} previous={prev.impressions} />}</span>
      <span>النقرات <b className="font-semibold text-[#1B2B3A]"><Num>{fmtInt(m.clicks)}</Num></b> {prev && <Delta current={m.clicks} previous={prev.clicks} />}</span>
      <span>نسبة النقر <b className="font-semibold text-[#1B2B3A]"><Num>{fmtPct(m.ctr)}</Num></b></span>
      <span>الموضع <b className="font-semibold text-[#1B2B3A]"><Num>{fmtPos(m.position)}</Num></b></span>
    </div>
  );
}

function ReviewCard({ reportId, review }: { reportId: string; review: SeoExperimentReview }) {
  const { toast } = useToast();
  const mutation = useMutation({
    mutationFn: (verdict: ExperimentVerdict) =>
      apiRequest(`/api/admin/seo-weekly/${reportId}/reviews/${review.key}`, { method: "PATCH", body: JSON.stringify({ verdict }) }),
    onSuccess: () => invalidateReports(),
    onError: (e: Error) => toast({ title: "تعذر حفظ القرار", description: e.message, variant: "destructive" }),
  });
  const chosen = review.verdict ?? null;
  return (
    <div className={`${GROUP} p-5`} data-testid={`review-${review.key}`}>
      <p className="text-[12px] text-[#617183]">{LANE_LABELS[review.lane]}</p>
      <b className="block text-base font-semibold">{review.title ?? <span dir="ltr">{review.path}</span>}</b>
      <p className="text-[13px] text-[#55667A]">{review.test}</p>
      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2.5">
        <div className="rounded-xl bg-[#F4F7FB] px-3 py-2 text-center">
          <span className="text-[12px] text-[#617183]">قبل</span>
          <b className="block text-xl"><Num>{fmtPct(review.baseline.ctr)}</Num></b>
          <span className="text-[12px] text-[#617183]">نسبة النقر</span>
        </div>
        <span className="text-[#617183]" aria-hidden="true">←</span>
        <div className="rounded-xl bg-[#F4F7FB] px-3 py-2 text-center">
          <span className="text-[12px] text-[#617183]">بعد أسبوع</span>
          <b className="block text-xl"><Num>{review.current ? fmtPct(review.current.ctr) : "—"}</Num></b>
          <span className="text-[12px] text-[#617183]">
            {review.clicksDelta === null ? "لا بيانات هذا الأسبوع" : <><Num>{review.clicksDelta >= 0 ? "+" : "−"}{fmtInt(Math.abs(review.clicksDelta))}</Num> نقرة</>}
          </span>
        </div>
      </div>
      <p className="mt-2 text-[12.5px] text-[#617183]">
        المقترح: {VERDICT_LABELS[review.suggestion]}. أرقام الأخبار تتقلب من أسبوع لآخر، فالقرار لك.
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2" role="group" aria-label="القرار">
        {(Object.keys(VERDICT_LABELS) as ExperimentVerdict[]).map((v) => (
          <button
            key={v}
            type="button"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(v)}
            className={`min-h-[40px] rounded-full px-4 text-[13px] font-semibold ${
              chosen === v ? "bg-[#1E9BE6] text-white shadow-[0_4px_12px_rgba(30,155,230,0.3)]" : `bg-white text-[#55667A] ${SHADOW}`
            }`}
            data-testid={`button-verdict-${v}`}
          >
            {VERDICT_LABELS[v]}
          </button>
        ))}
      </div>
    </div>
  );
}

function OpportunityCard({ reportId, index, opp, nextReportLabel }: { reportId: string; index: number; opp: SeoOpportunity; nextReportLabel: string }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [test, setTest] = useState(opp.test);
  useEffect(() => setTest(opp.test), [opp.test]);
  const mutation = useMutation({
    mutationFn: (body: { status?: string; test?: string }) =>
      apiRequest(`/api/admin/seo-weekly/${reportId}/opportunities/${opp.key}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      setEditing(false);
      invalidateReports();
    },
    onError: (e: Error) => toast({ title: "تعذر الحفظ", description: e.message, variant: "destructive" }),
  });
  const ignored = opp.status === "ignored";
  return (
    <article className={`${GROUP} rounded-[18px] p-5 transition-opacity ${ignored ? "opacity-60" : ""}`} data-testid={`opportunity-${opp.key}`}>
      <div className="flex items-start gap-3">
        <span className="grid h-8 w-8 flex-none place-items-center rounded-[11px] bg-[#E6F4FD] font-bold text-[#0B6FA8]"><Num>{index + 1}</Num></span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] text-[#617183]">{LANE_LABELS[opp.lane]}</p>
          <h3 className="text-[17px] font-semibold [text-wrap:balance]">{opp.title ?? <span dir="ltr">{opp.path}</span>}</h3>
          <a href={opp.url} target="_blank" rel="noreferrer" dir="ltr" className="block truncate text-[12px] text-[#617183] hover:text-[#0B6FA8]">
            {opp.url.replace(/^https?:\/\//, "")}
          </a>
        </div>
      </div>
      <Stats m={opp.metrics} prev={opp.previous} />
      <p className="mt-2.5 text-sm text-[#55667A]">{opp.why}</p>
      <div className="mt-2.5 rounded-[14px] bg-[#F4F7FB] px-3 py-2.5 text-sm">
        <span className="block text-[12px] text-[#617183]">التجربة المقترحة (أسبوع واحد)</span>
        {editing ? (
          <>
            <label htmlFor={`test-${opp.key}`} className="sr-only">نص التجربة</label>
            <textarea
              id={`test-${opp.key}`}
              value={test}
              onChange={(e) => setTest(e.target.value)}
              maxLength={500}
              rows={3}
              className="mt-1 w-full rounded-xl border border-[#DCE4EC] bg-white p-2.5 text-sm outline-none focus:border-[#1E9BE6]"
            />
          </>
        ) : (
          <>{opp.test} </>
        )}
        {opp.expectedGain > 0 && !editing && (
          <span className="font-semibold text-[#13734E]">
            {opp.targetCtr !== null ? <>لو وصلت النسبة <Num>{fmtPct(opp.targetCtr)}</Num>: </> : <>لو عاد القسم لمستواه: </>}
            نحو <Num>+{fmtInt(opp.expectedGain)}</Num> نقرة أسبوعيًا.
          </span>
        )}
      </div>
      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        {editing ? (
          <>
            <button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate({ test })} className="min-h-[42px] rounded-full bg-[#1E9BE6] px-5 text-sm font-semibold text-white">حفظ الاقتراح</button>
            <button type="button" onClick={() => { setEditing(false); setTest(opp.test); }} className="min-h-[42px] rounded-full px-4 text-sm font-semibold text-[#617183]">إلغاء</button>
          </>
        ) : opp.status === "approved" ? (
          <>
            <span className="rounded-full bg-[#E8F6EF] px-3 py-1.5 text-[13px] font-semibold text-[#13734E]">معتمدة · تُقاس في تقرير {nextReportLabel}</span>
            <button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate({ status: "proposed" })} className="min-h-[40px] rounded-full px-3 text-[13px] text-[#617183]">تراجع</button>
          </>
        ) : ignored ? (
          <>
            <span className="rounded-full bg-[#EEF2F6] px-3 py-1.5 text-[13px] font-semibold text-[#617183]">تم التجاهل هذا الأسبوع</span>
            <button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate({ status: "proposed" })} className="min-h-[40px] rounded-full px-3 text-[13px] text-[#617183]">تراجع</button>
          </>
        ) : (
          <>
            <button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate({ status: "approved" })} className="min-h-[42px] rounded-full bg-[#1E9BE6] px-5 text-sm font-semibold text-white shadow-[0_4px_12px_rgba(30,155,230,0.3)]" data-testid={`button-approve-${opp.key}`}>اعتمد التجربة</button>
            <button type="button" onClick={() => setEditing(true)} className="min-h-[42px] rounded-full bg-[#E6F4FD] px-5 text-sm font-semibold text-[#0B6FA8]">عدّل الاقتراح</button>
            <button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate({ status: "ignored" })} className="min-h-[42px] rounded-full px-4 text-sm font-semibold text-[#617183]">تجاهل</button>
          </>
        )}
      </div>
    </article>
  );
}

function TitleRow({ row, note, last }: { row: SeoTitleRow; note?: string; last: boolean }) {
  return (
    <div className={`flex items-center gap-3.5 px-4 py-3.5 sm:px-5 ${last ? "" : "border-b border-[#EEF2F6]"}`}>
      <span className="grid h-9 w-11 flex-none place-items-center rounded-xl bg-[#E6F4FD] text-[13px] font-bold text-[#0B6FA8]"><Num>{fmtPct(row.ctr)}</Num></span>
      <div className="min-w-0 flex-1">
        <a href={row.url} target="_blank" rel="noreferrer" className="block font-semibold [overflow-wrap:anywhere] hover:text-[#0B6FA8]">{row.title ?? <span dir="ltr">{row.path}</span>}</a>
        <span className="text-[13px] text-[#617183]">{note ?? <span dir="ltr">{row.path}</span>}</span>
      </div>
      <div className="flex-none text-left text-[13px] text-[#55667A]"><b className="block text-base text-[#1B2B3A]"><Num>{fmtInt(row.clicks)}</Num></b>نقرة</div>
    </div>
  );
}

function SetupCard({ status, onRetry, retrying }: { status: Status | undefined; onRetry: () => void; retrying: boolean }) {
  return (
    <div className={`${GROUP} space-y-3 p-5 text-sm`} data-testid="seo-weekly-setup">
      <b className="block text-base">الربط مع Search Console غير جاهز</b>
      {status?.error && <p className="rounded-xl bg-[#FFF6E5] px-3 py-2 text-[#946000]">{status.error}</p>}
      <ol className="list-decimal space-y-1.5 pr-5 text-[#55667A]">
        <li>في Google Cloud، داخل مشروع حساب الخدمة: APIs &amp; Services ثم Library، وفعّل <b>Google Search Console API</b>.</li>
        <li>
          في Search Console للموقع <span dir="ltr">{status?.site ?? "sc-domain:sabq.org"}</span>: الإعدادات ثم المستخدمون والأذونات، وأضف حساب الخدمة
          {status?.serviceAccount ? <> (<span dir="ltr">{status.serviceAccount}</span>)</> : null} بإذن <b>مقيّد</b>.
        </li>
      </ol>
      <button type="button" onClick={onRetry} disabled={retrying} className="min-h-[42px] rounded-full bg-[#E6F4FD] px-5 font-semibold text-[#0B6FA8]">
        {retrying ? "جارٍ الفحص" : "تحقق من الربط"}
      </button>
    </div>
  );
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function SeoWeeklyReport() {
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const list = useQuery<ListResponse>({ queryKey: LIST_QUERY });
  const reports = Array.isArray(list.data?.reports) ? list.data!.reports : [];
  const activeId = selectedId ?? list.data?.latest?.id ?? null;
  const detail = useQuery<ReportRow>({
    queryKey: [`/api/admin/seo-weekly/${activeId}`],
    enabled: !!activeId && activeId !== list.data?.latest?.id,
  });
  const report: ReportRow | null = activeId && activeId === list.data?.latest?.id ? list.data!.latest : detail.data ?? null;
  const status = useQuery<Status>({ queryKey: ["/api/admin/seo-weekly/status"], enabled: list.isSuccess && !list.data?.latest });

  const run = useMutation({
    mutationFn: () => apiRequest("/api/admin/seo-weekly/run", { method: "POST" }),
    onSuccess: () => {
      setSelectedId(null);
      invalidateReports();
      toast({ title: "تم تحديث التقرير" });
    },
    onError: (e: Error) => toast({ title: "تعذر إنشاء التقرير", description: e.message, variant: "destructive" }),
  });


  const payload = report?.payload;
  const nextReportLabel = report ? (() => { const [, m, d] = addDays(report.periodEnd, 10).split("-").map(Number); return `${d} ${MONTHS[m - 1]}`; })() : "";

  return (
    <DashboardLayout>
      <div dir="rtl" className="min-h-full rounded-[22px] bg-[#F4F7FB] px-4 py-6 text-[#1B2B3A] sm:px-8 sm:py-9">
        <div className="mx-auto flex max-w-[860px] flex-col gap-5">
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-1">
              <p className="text-[13px] text-[#617183]">الأرشفة والبحث · Search Console</p>
              <h1 className="text-[26px] font-bold sm:text-[28px]">تقرير البحث الأسبوعي</h1>
              {report && (
                <p className="text-sm text-[#55667A]">
                  أسبوع {periodLabel(report.periodStart, report.periodEnd)}، مقارنة بالأسبوع الذي قبله.
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {reports.length > 1 && (
                <>
                  <label htmlFor="seo-week" className="sr-only">الأسبوع</label>
                  <select
                    id="seo-week"
                    value={activeId ?? ""}
                    onChange={(e) => setSelectedId(e.target.value)}
                    className="h-11 rounded-full border border-[#DCE4EC] bg-white px-4 text-sm outline-none focus:border-[#1E9BE6]"
                  >
                    {reports.map((r) => (
                      <option key={r.id} value={r.id}>{periodLabel(r.periodStart, r.periodEnd)}</option>
                    ))}
                  </select>
                </>
              )}
              <button
                type="button"
                onClick={() => run.mutate()}
                disabled={run.isPending}
                className="h-11 rounded-full bg-[#E6F4FD] px-5 text-sm font-semibold text-[#0B6FA8]"
                data-testid="button-run-report"
              >
                {run.isPending ? "جارٍ القراءة من Search Console" : "حدّث أرقام الأسبوع"}
              </button>
            </div>
          </header>

          {list.isLoading || (activeId && !report && detail.isLoading) ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-[#55667A]">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> جارٍ التحميل
            </div>
          ) : list.isError ? (
            <div className={`${GROUP} flex flex-col items-center gap-3 py-10 text-sm text-[#55667A]`}>
              <p>تعذر تحميل التقرير.</p>
              <button type="button" onClick={() => list.refetch()} className="h-11 rounded-full bg-[#E6F4FD] px-5 font-semibold text-[#0B6FA8]">إعادة المحاولة</button>
            </div>
          ) : !payload ? (
            status.isLoading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-[#55667A]">
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> جارٍ فحص الربط
              </div>
            ) : status.data?.ok ? (
              <div className={`${GROUP} space-y-3 p-6 text-sm text-[#55667A]`} data-testid="seo-weekly-empty">
                <p>الربط جاهز ولا يوجد تقرير بعد. يصل التقرير تلقائيًا كل أحد، أو أنشئ تقرير هذا الأسبوع الآن.</p>
                <button type="button" onClick={() => run.mutate()} disabled={run.isPending} className="min-h-[42px] rounded-full bg-[#1E9BE6] px-5 font-semibold text-white">
                  {run.isPending ? "جارٍ الإنشاء" : "أنشئ التقرير الآن"}
                </button>
              </div>
            ) : (
              <SetupCard status={status.data} onRetry={() => status.refetch()} retrying={status.isFetching} />
            )
          ) : (
            <>
              <Summary payload={payload} />

              <section className="space-y-2.5">
                <h2 className="px-1 text-[13px] font-semibold text-[#617183]">تجربة الأسبوع الماضي</h2>
                {payload.reviews.length === 0 ? (
                  <div className={`${GROUP} flex items-center gap-3 p-5 text-sm text-[#55667A]`}>
                    لا توجد تجربة معتمدة من الأسبوع السابق لقياسها. ما تعتمده اليوم يُقاس في تقرير {nextReportLabel}.
                  </div>
                ) : (
                  payload.reviews.map((r) => <ReviewCard key={r.key} reportId={report!.id} review={r} />)
                )}
              </section>

              <section className="space-y-2.5">
                <h2 className="flex items-center gap-2 px-1 text-[13px] font-semibold text-[#617183]">
                  فرص هذا الأسبوع
                  <span className="rounded-full bg-[#E6F4FD] px-2.5 text-[12px] text-[#0B6FA8]"><Num>{payload.opportunities.length}</Num></span>
                </h2>
                {payload.opportunities.length === 0 ? (
                  <div className={`${GROUP} p-5 text-sm text-[#55667A]`}>لا فرص تتجاوز حدود القواعد هذا الأسبوع.</div>
                ) : (
                  <div className="grid gap-2.5">
                    {payload.opportunities.map((o, i) => (
                      <OpportunityCard key={o.key} reportId={report!.id} index={i} opp={o} nextReportLabel={nextReportLabel} />
                    ))}
                  </div>
                )}
              </section>

              {(payload.winners.length > 0 || payload.lesson) && (
                <section className="space-y-2.5">
                  <h2 className="px-1 text-[13px] font-semibold text-[#617183]">عناوين نجحت هذا الأسبوع</h2>
                  <div className={`${GROUP} overflow-hidden`}>
                    {payload.winners.map((w, i) => (
                      <TitleRow key={w.url} row={w} last={i === payload.winners.length - 1 && !payload.lesson} />
                    ))}
                    {payload.lesson && (
                      <TitleRow
                        row={payload.lesson}
                        last
                        note={`ظهور ${fmtInt(payload.lesson.impressions)} في الموضع ${fmtPos(payload.lesson.position)}: موضوع يُبحث كثيرًا ونحن خارج أول ثلاث نتائج`}
                      />
                    )}
                  </div>
                </section>
              )}

              <p className="px-1 text-[13px] leading-6 text-[#617183]">
                يصل التقرير كل أحد 9:00 صباحًا بتوقيت الرياض. لا شيء يُنفّذ قبل «اعتمد التجربة»، ولا تعديل آلي على محتوى الأخبار، ولا طلبات فهرسة جماعية. كل تجربة معتمدة تُقاس في تقرير الأسبوع التالي.
              </p>
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
