import { penaltyOutcome, type PenaltyFixtureLike } from "./wcTypes";

/**
 * سطر نتيجة ركلات الترجيح موضِّحًا الفائز صراحةً:
 *   «فاز {الفائز} بركلات الترجيح (4-2)»
 * النتيجة مرتّبة بالفائز أولًا والأرقام داخل dir="ltr" حتى لا تنقلب في سياق RTL.
 * يُخفى تلقائيًّا إن لم تُحسم المباراة بالترجيح.
 */
export function PenaltyResult({ fixture, className }: { fixture: PenaltyFixtureLike; className?: string }) {
  const po = penaltyOutcome(fixture);
  if (!po) return null;
  return (
    <p className={className} dir="rtl">
      فاز <span className="font-bold">{po.winnerName}</span> بركلات الترجيح{" "}
      <span dir="ltr" className="tabular-nums">
        ({po.winnerScore}-{po.loserScore})
      </span>
    </p>
  );
}
