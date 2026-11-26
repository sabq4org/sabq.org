// سجل «تحرير وتوليد شامل» في لوحة التحكم (للمسؤول ومدير النظام):
// - SmartEditRunEvent: حدث التشغيل في السجل الزمني للخبر مع «بصمة الخبر».
// - SmartEditRunCompare: مقارنة النص الملصق والناتج والمحفوظ مع تلوين الفروق.
// - AdoptionBar: شريط البصمة (مشترك مع صفحة ملخص المحررين).
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  adoptionLabel,
  plainText,
  wordDiff,
  type DiffOp,
  type SmartEditAdoption,
} from "@shared/smartEditRuns";

export interface SmartEditRunSummary {
  id: string;
  articleId: string | null;
  channel: string;
  status: string;
  errorType: string | null;
  inputWords: number;
  outputWords: number;
  latencyMs: number;
  adoption: SmartEditAdoption | null;
  createdAt: string;
  userId: string | null;
  userFirstName: string | null;
  userLastName: string | null;
  userAvatarUrl: string | null;
}

interface SmartEditRunDetail extends SmartEditRunSummary {
  inputContent: string;
  outputContent: string | null;
  outputTitle: string | null;
  outputFields: Record<string, unknown> | null;
  article: { title: string; content: string; status: string; updatedAt: string | null } | null;
}

const TONE: Record<ReturnType<typeof adoptionLabel>["tone"], string> = {
  green: "bg-emerald-50 text-emerald-800",
  amber: "bg-amber-50 text-amber-800",
  red: "bg-red-50 text-red-700",
  neutral: "bg-muted text-muted-foreground",
};

export function adoptionTone(adoption: SmartEditAdoption | null | undefined) {
  const { label, tone } = adoptionLabel(adoption);
  return { label, className: TONE[tone] };
}

function runnerName(run: Pick<SmartEditRunSummary, "userFirstName" | "userLastName">): string {
  const name = [run.userFirstName, run.userLastName].filter(Boolean).join(" ");
  return name || "مستخدم غير معروف";
}

function timeOf(value: string): string {
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { hour: "numeric", minute: "2-digit", second: "2-digit" }).format(new Date(value));
}

function dateTimeOf(value: string): string {
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function AdoptionBar({ adoption, compact = false }: { adoption: SmartEditAdoption; compact?: boolean }) {
  return (
    <div className="space-y-1.5">
      <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`من ناتج المحرر الذكي ${adoption.aiPct}%`}>
        <span className="h-full bg-primary" style={{ width: `${adoption.aiPct}%` }} />
        <span className="h-full bg-sky-200" style={{ width: `${adoption.editorPct}%` }} />
        <span className="h-full bg-slate-300" style={{ width: `${adoption.pastedPct}%` }} />
      </div>
      {!compact && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2 w-2 rounded-sm bg-primary" />من ناتج المحرر الذكي <b className="tabular-nums text-foreground">{adoption.aiPct}%</b></span>
          <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2 w-2 rounded-sm bg-sky-200" />كتابة المحرر بعده <b className="tabular-nums text-foreground">{adoption.editorPct}%</b></span>
          <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2 w-2 rounded-sm bg-slate-300" />من النص الملصق كما هو <b className="tabular-nums text-foreground">{adoption.pastedPct}%</b></span>
        </div>
      )}
    </div>
  );
}

/** حدث التشغيل داخل السجل الزمني للخبر. */
export function SmartEditRunEvent({ run, onCompare }: { run: SmartEditRunSummary; onCompare: (runId: string) => void }) {
  const failed = run.status !== "success";
  const tone = adoptionTone(run.adoption);
  return (
    <div className="flex gap-3 border-b py-4 last:border-b-0" data-testid={`timeline-smart-edit-${run.id}`}>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-900 ring-4 ring-sky-50 sm:h-10 sm:w-10">
        <Sparkles className="h-[18px] w-[18px]" />
      </div>
      <div className="min-w-0 flex-1 space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-0 bg-sky-100 font-semibold text-sky-900">المحرر الذكي</Badge>
          <span className="text-sm font-semibold">{runnerName(run)}</span>
          <span className="text-xs text-muted-foreground">
            {dateTimeOf(run.createdAt)} · {run.channel === "mobile" ? "من التطبيق" : "من لوحة التحكم"} ·{" "}
            <span className="tabular-nums">{Math.round(run.latencyMs / 1000)}</span> ث
          </span>
        </div>
        <p className="m-0 text-sm text-foreground/85">
          {failed ? "شُغّل «تحرير وتوليد شامل» وفشل التشغيل، فلم يصل ناتج للمحرر" : "شُغّل «تحرير وتوليد شامل»"}
        </p>
        {!failed && (
          <div className="space-y-3 rounded-2xl border border-sky-100 bg-background p-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">بصمة الخبر المحفوظ</span>
              <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", tone.className)}>{tone.label}</span>
            </div>
            {run.adoption && run.adoption.finalWords > 0 ? (
              <AdoptionBar adoption={run.adoption} />
            ) : (
              <p className="m-0 text-xs text-muted-foreground">تُحسب البصمة عند أول حفظ للخبر بعد التشغيل.</p>
            )}
            <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
              <span>النص الملصق <b className="tabular-nums text-foreground">{run.inputWords}</b> كلمة</span>
              <span>·</span>
              <span>الناتج <b className="tabular-nums text-foreground">{run.outputWords}</b> كلمة</span>
              {run.adoption && run.adoption.finalWords > 0 && (
                <>
                  <span>·</span>
                  <span>المحفوظ <b className="tabular-nums text-foreground">{run.adoption.finalWords}</b> كلمة</span>
                </>
              )}
            </div>
            <Button type="button" size="sm" className="h-10 rounded-full" onClick={() => onCompare(run.id)} data-testid={`button-smart-edit-compare-${run.id}`}>
              قارن النصوص
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function DiffText({ ops, side, showDiff }: { ops: DiffOp[]; side: "before" | "after"; showDiff: boolean }) {
  return (
    <p className="m-0 whitespace-pre-wrap text-sm leading-8">
      {ops.map((op, index) => {
        if (op.type === "same") return <span key={index}>{op.text} </span>;
        if (op.type === "del") {
          if (side !== "before") return null;
          return showDiff
            ? <del key={index} className="rounded bg-red-100 px-0.5 text-red-900 no-underline">{op.text} </del>
            : <span key={index}>{op.text} </span>;
        }
        if (side !== "after") return null;
        return showDiff
          ? <ins key={index} className="rounded bg-emerald-100 px-0.5 text-emerald-900 no-underline">{op.text} </ins>
          : <span key={index}>{op.text} </span>;
      })}
    </p>
  );
}

function Column({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 space-y-2 rounded-2xl border p-3.5">
      <div>
        <h4 className="m-0 text-sm font-semibold">{title}</h4>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
      {children}
    </section>
  );
}

function FieldsTable({ detail }: { detail: SmartEditRunDetail }) {
  const fields = detail.outputFields ?? {};
  const seo = (fields.seo ?? {}) as { metaTitle?: string; metaDescription?: string };
  const rows: Array<[string, unknown]> = [
    ["العنوان المقترح", detail.outputTitle],
    ["العنوان الفرعي", fields.subTitle],
    ["الموجز", fields.smartSummary],
    ["الكلمات المفتاحية", Array.isArray(fields.keywords) ? fields.keywords.join("، ") : fields.keywords],
    ["عنوان SEO", seo.metaTitle],
    ["وصف SEO", seo.metaDescription],
    ["التصنيف المقترح", fields.detectedCategory],
  ];
  const visible = rows.filter(([, value]) => typeof value === "string" && value.trim());
  if (!visible.length) return null;
  return (
    <div className="overflow-hidden rounded-2xl border">
      {visible.map(([label, value]) => (
        <div key={label} className="grid grid-cols-1 border-b last:border-b-0 sm:grid-cols-[120px_minmax(0,1fr)]">
          <div className="bg-muted/50 px-3 py-1.5 text-xs font-semibold text-muted-foreground sm:p-3">{label}</div>
          <div className="p-3 text-sm leading-7">{String(value)}</div>
        </div>
      ))}
    </div>
  );
}

export function SmartEditRunCompare({ runId, onOpenChange }: { runId: string | null; onOpenChange: (open: boolean) => void }) {
  const [showDiff, setShowDiff] = useState(true);
  const detail = useQuery<SmartEditRunDetail>({
    queryKey: ["/api/admin/smart-edit-runs", runId],
    queryFn: () => apiRequest(`/api/admin/smart-edit-runs/${runId}`),
    enabled: Boolean(runId),
  });
  const data = detail.data;
  const inputToOutput = useMemo(() => (data ? wordDiff(data.inputContent, data.outputContent) : null), [data]);
  const outputToSaved = useMemo(() => (data?.article ? wordDiff(data.outputContent, data.article.content) : null), [data]);

  return (
    <Dialog open={Boolean(runId)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto" dir="rtl" data-testid="dialog-smart-edit-compare">
        <DialogHeader className="text-right">
          <DialogTitle>
            مقارنة «تحرير وتوليد شامل»
            {data ? ` · ${runnerName(data)} · ${timeOf(data.createdAt)}` : ""}
          </DialogTitle>
          <DialogDescription>
            النص الذي ألصقه المحرر، وما أخرجه المحرر الذكي، ونص الخبر المحفوظ الآن. الأخضر أُضيف والأحمر حُذف مقارنة بالعمود السابق.
          </DialogDescription>
        </DialogHeader>

        {detail.isLoading && <Skeleton className="h-64 w-full" />}
        {detail.isError && <p className="text-sm text-destructive">تعذر تحميل التشغيل.</p>}
        {data && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex gap-1 rounded-full bg-muted p-1" role="group" aria-label="طريقة العرض">
                <Button type="button" size="sm" variant={showDiff ? "default" : "ghost"} className="h-8 rounded-full" aria-pressed={showDiff} onClick={() => setShowDiff(true)}>
                  إظهار الفروق
                </Button>
                <Button type="button" size="sm" variant={!showDiff ? "default" : "ghost"} className="h-8 rounded-full" aria-pressed={!showDiff} onClick={() => setShowDiff(false)}>
                  نص نظيف
                </Button>
              </div>
              {data.adoption && data.adoption.finalWords > 0 && (
                <div className="min-w-[220px] flex-1"><AdoptionBar adoption={data.adoption} /></div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              <Column title="1. النص الملصق" hint={`ما أدخله المحرر · ${data.inputWords} كلمة`}>
                {inputToOutput ? <DiffText ops={inputToOutput} side="before" showDiff={showDiff} /> : <p className="m-0 whitespace-pre-wrap text-sm leading-8">{plainText(data.inputContent)}</p>}
              </Column>
              <Column title="2. ناتج المحرر الذكي" hint={`ما أخرجه النظام · ${data.outputWords} كلمة`}>
                {inputToOutput ? <DiffText ops={inputToOutput} side="after" showDiff={showDiff} /> : <p className="m-0 whitespace-pre-wrap text-sm leading-8">{plainText(data.outputContent)}</p>}
              </Column>
              <Column title="3. المحفوظ الآن" hint={data.article ? `نص الخبر الحالي${data.article.status === "published" ? " (منشور)" : ""}` : "لم يُربط بخبر بعد"}>
                {data.article ? (
                  outputToSaved ? <DiffText ops={outputToSaved} side="after" showDiff={showDiff} /> : <p className="m-0 whitespace-pre-wrap text-sm leading-8">{plainText(data.article.content)}</p>
                ) : (
                  <p className="m-0 text-sm text-muted-foreground">لم يُحفظ خبر من هذا الناتج حتى الآن.</p>
                )}
              </Column>
            </div>

            <FieldsTable detail={data} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
