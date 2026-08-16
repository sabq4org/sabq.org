// بطاقة «توقعاتي» — مراجعة توقّع واحد: توقّع المستخدم مقابل النتيجة الفعلية،
// مع المبرر الصريح للنقاط («نتيجة دقيقة · +71») بدل رقم صامت (قرار المالك بعد
// افتتاح روشن 2026-08-13: نظام الجائزة يبقى، والمبرر يظهر على البطاقة مباشرة).

import { CheckCircle2, Clock3, Shield, XCircle } from "lucide-react";
import { formatNumber } from "@/lib/format";
import {
  contestTypeLabelAr,
  kickoffDayAr,
  kickoffTimeAr,
  type PredMyEntryItem,
} from "./predictionTypes";

type Props = {
  item: PredMyEntryItem;
  /** فتح نافذة «كيف حُسبت نقاطي؟» للمسوّاة. */
  onOpenSettlement: (contestId: string) => void;
  /** الانتقال لبطاقة التوقّع في تبويب المباريات (للمفتوحة). */
  onGoToContest: (contestId: string) => void;
};

export function PredictionMyEntryCard({ item, onOpenSettlement, onGoToContest }: Props) {
  const isMatch = item.contestType === "match_score";
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      {isMatch ? <MatchHeader item={item} /> : <SeasonHeader item={item} />}

      <div className="mt-3 flex items-end justify-between gap-2">
        <div className="min-w-0 space-y-0.5 text-start">
          <p className="text-[11px] text-muted-foreground">
            {[item.metadata?.round, kickoffDayAr(item.locksAt)].filter(Boolean).join(" · ")}
          </p>
          <p className="text-[11.5px] font-semibold text-foreground">
            {isMatch ? (
              <>
                توقّعك{" "}
                {/* قاعدة العرض الموحّدة: الضيف أولًا داخل LTR فرقم المضيف يلاصق اليمين */}
                <span dir="ltr" className="tabular-nums font-extrabold">
                  {item.payload?.predAway ?? 0}–{item.payload?.predHome ?? 0}
                </span>
              </>
            ) : (
              <>اخترتَ <span className="font-extrabold">{item.payload?.pickName ?? "—"}</span></>
            )}
          </p>
        </div>
        <OutcomeChip item={item} onOpenSettlement={onOpenSettlement} onGoToContest={onGoToContest} />
      </div>
    </div>
  );
}

function MatchHeader({ item }: { item: PredMyEntryItem }) {
  const home = item.metadata?.home;
  const away = item.metadata?.away;
  const settled = item.status === "settled" && item.result;
  const penalties = item.result?.penalties ?? item.metadata?.penalties;
  return (
    <div className="flex items-center gap-2">
      <TeamSide name={home?.name} logo={home?.logo} />
      <div className="min-w-[72px] text-center">
        {settled ? (
          <div>
            <span className="text-xl font-extrabold tabular-nums text-foreground block" dir="ltr">
              {item.result?.finalAway}–{item.result?.finalHome}
            </span>
            {penalties && (penalties.home != null || penalties.away != null) && (
              <span className="text-[10.5px] font-bold tabular-nums text-muted-foreground block" dir="ltr">
                ({penalties.away ?? 0}–{penalties.home ?? 0} ر.ت)
              </span>
            )}
          </div>
        ) : (
          <span className="text-sm font-bold tabular-nums text-muted-foreground">
            {kickoffTimeAr(item.locksAt)}
          </span>
        )}
      </div>
      <TeamSide name={away?.name} logo={away?.logo} trailing />
    </div>
  );
}

function SeasonHeader({ item }: { item: PredMyEntryItem }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
        <Shield className="h-4 w-4 text-primary" />
      </span>
      <span className="text-[13px] font-bold text-foreground">
        {item.metadata?.title ?? contestTypeLabelAr(item.contestType)}
      </span>
    </div>
  );
}

function TeamSide({ name, logo, trailing }: { name?: string | null; logo?: string | null; trailing?: boolean }) {
  return (
    <div className={`flex flex-1 items-center gap-2 ${trailing ? "flex-row-reverse" : ""}`}>
      {logo ? (
        <img src={logo} alt="" className="h-7 w-7 object-contain" loading="lazy" />
      ) : (
        <Shield className="h-6 w-6 text-muted-foreground/40" />
      )}
      <span className="truncate text-[13px] font-bold text-foreground">{name ?? "يُحدد لاحقًا"}</span>
    </div>
  );
}

function OutcomeChip({
  item,
  onOpenSettlement,
  onGoToContest,
}: {
  item: PredMyEntryItem;
  onOpenSettlement: (contestId: string) => void;
  onGoToContest: (contestId: string) => void;
}) {
  if (item.status === "settled") {
    const award = item.awards[0];
    if (award) {
      // المبرر الصريح بصيغة المالك: «نتيجة دقيقة · +71» — والنقر يفتح التفصيل
      return (
        <button
          type="button"
          onClick={() => onOpenSettlement(item.contestId)}
          className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-3 py-1 text-[11px] font-extrabold text-amber-700 transition hover:bg-amber-500/25 dark:text-amber-400"
        >
          <CheckCircle2 className="h-3 w-3" />
          {award.reasonLabelAr} · +{formatNumber(item.totalPoints)}
        </button>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-[11px] font-bold text-muted-foreground">
        <XCircle className="h-3 w-3" />
        لم يُصب التوقّع
      </span>
    );
  }
  if (item.status === "void") {
    return (
      <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-bold text-muted-foreground">أُلغيت</span>
    );
  }
  if (item.status === "open") {
    return (
      <button
        type="button"
        onClick={() => onGoToContest(item.contestId)}
        className="rounded-full bg-primary/10 px-3 py-1 text-[11px] font-bold text-primary transition hover:bg-primary/20"
      >
        مفتوح — تعديل
      </button>
    );
  }
  // locked / ready — بانتظار صافرة النهاية
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-3 py-1 text-[11px] font-bold text-sky-700 dark:text-sky-400">
      <Clock3 className="h-3 w-3" />
      بانتظار النتيجة
    </span>
  );
}
