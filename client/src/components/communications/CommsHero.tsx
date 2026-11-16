import { CheckCircle2, Inbox } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { FlowCounts } from "./inboxModel";

interface CommsHeroProps {
  loading: boolean;
  reprocessCount: number;
  expiringCount: number;
  flow: FlowCounts;
}

function messages(count: number): string {
  if (count === 1) return "رسالة واحدة تعطلت";
  if (count === 2) return "رسالتان تعطلتا";
  return count <= 10 ? `${count} رسائل تعطلت` : `${count} رسالة تعطلت`;
}

function tokens(count: number): string {
  if (count === 1) return "رمز واحد يحتاج تدويرًا";
  if (count === 2) return "رمزان يحتاجان تدويرًا";
  return count <= 10 ? `${count} رموز تحتاج تدويرًا` : `${count} رمزًا تحتاج تدويرًا`;
}

function arrived(count: number): string {
  if (count === 1) return "رسالة واحدة وصلت";
  if (count === 2) return "رسالتان وصلتا";
  return count <= 10 ? `${count} رسائل وصلت` : `${count} رسالة وصلت`;
}

/** ملخص الصفحة: رقم واحد لما يحتاج تدخلًا، وشريط واحد يبيّن أين ذهبت رسائل اليوم. */
export function CommsHero({ loading, reprocessCount, expiringCount, flow }: CommsHeroProps) {
  const needs = reprocessCount + expiringCount;
  const detail = [reprocessCount > 0 ? `${messages(reprocessCount)} أثناء التحرير` : null, expiringCount > 0 ? tokens(expiringCount) : null]
    .filter(Boolean)
    .join("، و");
  const processing = Math.max(0, flow.total - flow.published - flow.draft - flow.rejected - flow.failed);
  const segments = [
    { key: "published", label: "منشور", value: flow.published, color: "#1E9BE6" },
    { key: "draft", label: "مسودة", value: flow.draft, color: "#E9A93A" },
    { key: "rejected", label: "مرفوض", value: flow.rejected, color: "#9FB0C2" },
    { key: "failed", label: "تعطل", value: flow.failed, color: "#BF3038" },
    { key: "processing", label: "قيد المعالجة", value: processing, color: "#9CD3F5" },
  ];
  const visible = segments.filter((segment) => segment.value > 0);

  return (
    <section
      aria-label="ملخص اليوم"
      className="flex flex-wrap items-center gap-x-7 gap-y-5 rounded-[22px] border border-white bg-gradient-to-br from-[#E2F2FD] to-[#EEF1FE] px-5 py-5 sm:px-7 sm:py-6"
    >
      <div className="flex min-w-0 flex-1 basis-72 items-center gap-[18px]">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white text-[#1E9BE6]">
          {needs > 0 ? <Inbox className="h-[26px] w-[26px]" aria-hidden="true" /> : <CheckCircle2 className="h-[26px] w-[26px]" aria-hidden="true" />}
        </span>
        {loading ? (
          <Skeleton className="h-12 w-48 rounded-xl bg-white/70" />
        ) : needs > 0 ? (
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex items-baseline gap-2.5">
              <span className="text-[38px] font-bold leading-[1.1] text-[#0B6FA8] tabular-nums" data-testid="summary-needs">
                {needs}
              </span>
              <span className="text-[17px] font-semibold text-[#1B2B3A]">تحتاجك الآن</span>
            </div>
            <span className="text-[13px] text-[#55667A]">{detail}</span>
          </div>
        ) : (
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[19px] font-bold text-[#1B2B3A]" data-testid="summary-needs">
              لا شيء يحتاجك الآن
            </span>
            <span className="text-[13px] text-[#55667A]">لا رسائل متعطلة ولا رموز تقترب من الانتهاء</span>
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-[2] basis-80 flex-col gap-3 rounded-[18px] bg-white/70 px-5 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[13px] text-[#55667A]">أين ذهبت رسائل اليوم</span>
          <span className="text-[13px] font-semibold text-[#1B2B3A]" data-testid="summary-total">
            {loading ? "…" : flow.total > 0 ? arrived(flow.total) : "لم تصل رسائل اليوم بعد"}
          </span>
        </div>
        <div
          className="flex h-3 gap-[3px] overflow-hidden rounded-full"
          role="img"
          aria-label={visible.length > 0 ? visible.map((segment) => `${segment.value} ${segment.label}`).join("، ") : "لا رسائل اليوم"}
        >
          {visible.length > 0 ? (
            visible.map((segment) => (
              <span key={segment.key} className="rounded-[4px]" style={{ flex: `${segment.value} 1 0`, backgroundColor: segment.color }} />
            ))
          ) : (
            <span className="flex-1 bg-white" />
          )}
        </div>
        <div className="flex flex-wrap gap-x-[22px] gap-y-2 text-[13px] text-[#55667A]">
          {segments
            .filter((segment) => segment.key !== "processing" || segment.value > 0)
            .map((segment) => (
              <span key={segment.key} className="flex items-center gap-1.5" data-testid={`summary-${segment.key}`}>
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: segment.color }} aria-hidden="true" />
                <b className="font-bold text-[#1B2B3A] tabular-nums">{segment.value}</b> {segment.label}
              </span>
            ))}
        </div>
      </div>
    </section>
  );
}
