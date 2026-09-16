// نافذة «كيف حُسبت نقاطي؟» — تفصيل تسوية مباراة: البطاقة المزدوجة التي تفصل
// نقاط الترتيب عن مكافأة المحفظة، وخطوات الحساب بنفس أرقام سجل الخادم،
// ورقم مرجعي للدعم. Dialog يلائم سطح المكتب (التصميم المعتمد §14.3).

import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, Wallet } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/format";
import { scoreRtlAr, type PredMyAward, type PredSettlementResponse } from "./predictionTypes";

type Props = {
  contestId: string | null;
  onClose: () => void;
};

export function PredictionSettlementDrawer({ contestId, onClose }: Props) {
  const { data, isLoading } = useQuery<PredSettlementResponse>({
    queryKey: [`/api/predictions/contests/${contestId}/settlement`],
    enabled: Boolean(contestId),
    staleTime: 5 * 60_000,
  });

  const award = data?.myAwards?.[0] ?? null;

  return (
    <Dialog open={Boolean(contestId)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-base font-extrabold">كيف حُسبت نقاطي؟</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
          </div>
        ) : award ? (
          <AwardDetails award={award} finalScore={scoreText(data)} />
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">
            لم يدخل توقّعك ضمن الفئات الفائزة في هذه المباراة — توقّع المباريات القادمة لتجمع النقاط.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function scoreText(data: PredSettlementResponse | undefined): string | null {
  const result = data?.result;
  if (result?.finalHome === undefined || result?.finalAway === undefined) return null;
  const pen = result.penalties;
  const base = `${result.finalAway}–${result.finalHome}`;
  if (pen && (pen.home != null || pen.away != null)) {
    return `${base} (${pen.away ?? 0}–${pen.home ?? 0} ر.ت)`;
  }
  return base;
}

function AwardDetails({ award, finalScore }: { award: PredMyAward; finalScore: string | null }) {
  const pool = award.breakdown?.pool;
  const totalPool = (pool?.base ?? 0) + (pool?.carriedIn ?? 0);
  const tierTotal =
    pool?.tierPoints !== undefined && pool?.winners ? pool.tierPoints * pool.winners : null;

  const steps: string[] = [];
  if (pool?.base) {
    steps.push(
      (pool.carriedIn ?? 0) > 0
        ? `جائزة المباراة ${formatNumber(totalPool)} نقطة (${formatNumber(pool.base)} أساس + ${formatNumber(pool.carriedIn ?? 0)} مُرحّلة)`
        : `جائزة المباراة ${formatNumber(totalPool)} نقطة`,
    );
  }
  if (pool?.tierShare !== undefined && tierTotal !== null) {
    steps.push(
      `حصة فئة «${award.reasonLabelAr}» ${Math.round(pool.tierShare * 100)}٪ = ${formatNumber(tierTotal)} نقطة`,
    );
  }
  if (pool?.winners) {
    steps.push(`تقاسمها ${formatNumber(pool.winners)} فائزًا → ${formatNumber(award.points)} نقطة في ترتيب البطولة`);
  }
  if (steps.length === 0) {
    steps.push(`حصلت على ${formatNumber(award.points)} نقطة — ${award.reasonLabelAr}`);
  }
  if (award.wallet) {
    steps.push(
      `مضاعف عضويتك ×${award.wallet.multiplier.toFixed(1)} → ${formatNumber(award.wallet.walletPoints)} نقطة أُودعت في محفظتك`,
    );
  }

  return (
    <div className="space-y-4">
      {/* التوقع والفئة */}
      <div className="flex items-center justify-between rounded-xl bg-muted px-3 py-2.5">
        <span className="text-[12px] font-bold text-muted-foreground">
          {/* النتائج داخل LTR بالضيف أولًا — فرقم المضيف يلاصق اليمين (القاعدة الموحّدة) */}
          {award.breakdown?.prediction ? (
            <>توقّعتَ <span dir="ltr" className="tabular-nums">{scoreRtlAr(award.breakdown.prediction)}</span></>
          ) : (
            "توقّعك"
          )}
          {finalScore ? (
            <> — انتهت <span dir="ltr" className="tabular-nums">{finalScore}</span></>
          ) : null}
        </span>
        <span className="rounded-full bg-amber-500/15 px-3 py-1 text-[11px] font-extrabold text-amber-700 dark:text-amber-400">
          🎯 {award.reasonLabelAr}
        </span>
      </div>

      {/* البطاقة المزدوجة: نقاط الترتيب ≠ المحفظة */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-primary/10 p-3">
          <div className="flex items-center gap-1.5 text-primary">
            <BadgeCheck className="h-4 w-4" />
            <span className="text-lg font-extrabold tabular-nums">+{formatNumber(award.points)}</span>
          </div>
          <p className="mt-1 text-[10.5px] font-bold text-primary/80">نقاط البطولة → الترتيب</p>
        </div>
        {award.wallet && (
          <div className="rounded-xl bg-amber-500/10 p-3">
            <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
              <Wallet className="h-4 w-4" />
              <span className="text-lg font-extrabold tabular-nums">
                +{formatNumber(award.wallet.walletPoints)}
              </span>
            </div>
            <p className="mt-1 text-[10.5px] font-bold text-amber-700/80 dark:text-amber-400/80">
              محفظتك (×{award.wallet.multiplier.toFixed(1)} عضوية)
            </p>
          </div>
        )}
      </div>

      {/* خطوات الحساب */}
      <ol className="space-y-0 divide-y divide-dashed divide-border">
        {steps.map((step, index) => (
          <li key={index} className="flex items-start gap-2.5 py-2.5 text-[12.5px] font-semibold text-foreground">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-extrabold text-primary">
              {index + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>

      <p className="text-center text-[10.5px] text-muted-foreground">
        رقم مرجعي للدعم: <span dir="ltr">{award.referenceId.slice(0, 8).toUpperCase()}</span>
      </p>
    </div>
  );
}
