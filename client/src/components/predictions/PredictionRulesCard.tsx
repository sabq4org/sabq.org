// بطاقة «كيف تُحتسب النقاط؟» — شرح النظام على مستوى البطولة، ظاهرة للجميع
// (زوّارًا ومسجّلين) وقبل فتح أي عدّاد. النصوص مولّدة من ملفات الاحتساب
// الفعّالة (detail.rules) لا من أرقام مكتوبة يدويًا — فلا تتقادم مع تغيير
// الإعدادات. تُطوى افتراضيًا حتى لا تزاحم المباريات.

import { useState } from "react";
import { ChevronDown, CircleHelp } from "lucide-react";
import {
  contestTypeLabelAr,
  ruleSummaryAr,
  type PredCompetitionRule,
} from "./predictionTypes";

/** ترتيب عرض ثابت: قاعدة المباريات أولًا ثم مسابقات الموسم ثم البقية. */
const TYPE_ORDER = ["match_score", "champion", "top_scorer", "match_scorer", "first_scorer"];

export function PredictionRulesCard({ rules }: { rules: PredCompetitionRule[] }) {
  const [open, setOpen] = useState(false);
  if (rules.length === 0) return null;

  const sorted = [...rules].sort(
    (a, b) => TYPE_ORDER.indexOf(a.contestType) - TYPE_ORDER.indexOf(b.contestType),
  );

  return (
    <div className="mt-3 rounded-2xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-right"
      >
        <span className="flex items-center gap-2 text-[13px] font-extrabold text-foreground">
          <CircleHelp className="h-4 w-4 text-primary" />
          كيف تُحتسب النقاط؟
        </span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="space-y-2 border-t border-border px-4 py-3">
          {sorted.map((rule) => (
            <div key={rule.contestType} className="rounded-xl bg-muted/50 px-3 py-2">
              <div className="text-[11.5px] font-extrabold text-primary">
                {contestTypeLabelAr(rule.contestType)}
              </div>
              <p className="mt-0.5 text-[11.5px] font-semibold leading-relaxed text-foreground">
                {ruleSummaryAr(rule)}
              </p>
            </div>
          ))}
          <ul className="space-y-1 pt-1 text-[10.5px] leading-relaxed text-muted-foreground">
            <li>· يُقفل توقّع كل مباراة عند ضربة البداية، ويمكنك تعديله حتى ذلك الحين.</li>
            <li>· نقاط الترتيب في اللوحة أساسية دون مضاعف — وما يصل محفظتك يُضرب بمضاعف عضويتك (حتى ×1.5).</li>
            <li>· النتيجة المعكوسة لا تُحتسب: توقّع فوز الضيف لا يأخذ شيئًا إذا فاز المضيف.</li>
          </ul>
        </div>
      )}
    </div>
  );
}
