/**
 * شريط احتمالات كأس الملك — مرآة ProbabilityBar في هيرو المونديال
 * (HeroSection) بلمسة الكأس: أخضر للمضيف وذهبي للضيف. المصدر الوحيد
 * للاحتمالات هو API-Football predictions (SportMonks لا يغطي البطولة)،
 * والخادم يُسقط العنصر الوهمي 33/33/33 فلا يصل هنا إلا توقّع حقيقي.
 *
 * tone: "dark" للهيرو الليلي، و"light" داخل مركز المباراة الفاتح.
 */
import type { KcFixture, KcPrediction } from "./kcTypes";

export function KcProbabilityBar({
  fixture,
  prediction,
  tone = "dark",
}: {
  fixture: KcFixture;
  prediction: KcPrediction;
  tone?: "dark" | "light";
}) {
  const total = prediction.homePct + prediction.drawPct + prediction.awayPct || 100;
  const pct = (v: number) => Math.round((v / total) * 100);
  const dark = tone === "dark";
  return (
    <div className="w-full max-w-md mx-auto space-y-1.5" dir="rtl">
      <div
        className={`flex justify-between text-[11px] font-semibold ${
          dark ? "text-emerald-100/90" : "text-foreground"
        }`}
      >
        <span>فوز {fixture.home.name} {pct(prediction.homePct)}%</span>
        <span className={dark ? "text-white/60" : "text-muted-foreground"}>
          تعادل {pct(prediction.drawPct)}%
        </span>
        <span>فوز {fixture.away.name} {pct(prediction.awayPct)}%</span>
      </div>
      {/* المضيف يمينًا في RTL — dir موروث فيتدفق الشريط من اليمين */}
      <div
        className={`flex h-2.5 rounded-full overflow-hidden ${
          dark ? "ring-1 ring-white/10" : "ring-1 ring-border"
        }`}
      >
        <div className="bg-emerald-400" style={{ width: `${pct(prediction.homePct)}%` }} />
        <div className={dark ? "bg-zinc-300/60" : "bg-zinc-300"} style={{ width: `${pct(prediction.drawPct)}%` }} />
        <div className="bg-amber-400" style={{ width: `${pct(prediction.awayPct)}%` }} />
      </div>
      <p className={`text-center text-[10px] ${dark ? "text-white/40" : "text-muted-foreground"}`}>
        توقعات خوارزمية للاستئناس من مزود البيانات
      </p>
    </div>
  );
}
