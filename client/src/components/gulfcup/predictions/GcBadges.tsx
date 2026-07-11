import { GC_BADGES } from "./gcPredictionTypes";

/** شبكة الإنجازات: المكتسبة ملوّنة، والباقي باهت كهدف. */
export function GcBadges({ earned }: { earned: string[] }) {
  // وسام بطل المجلس يحمل معرّف المجلس لضمان وسام دائم لكل بطولة، بينما
  // واجهة الإنجازات تعرضه كفئة واحدة مفهومة للمستخدم.
  const have = new Set(
    earned.map((code) => {
      if (code.startsWith("majlis_champion:")) return "majlis_champion";
      if (code.startsWith("majlis_dean:")) return "majlis_dean";
      return code;
    }),
  );
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        اجمع الإنجازات بالتوقّع الجريء والدقيق. تُمنح تلقائيًّا فور تحقّق شرطها.
      </p>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {GC_BADGES.map((b) => {
          const unlocked = have.has(b.code);
          return (
            <div
              key={b.code}
              className={`flex items-center gap-3 rounded-2xl border p-3.5 transition ${
                unlocked
                  ? "border-amber-400/50 bg-gradient-to-l from-amber-500/10 to-amber-400/[0.03] dark:border-amber-500/30"
                  : "border-dashed border-border bg-muted/30 opacity-70"
              }`}
              data-testid={`gc-badge-${b.code}`}
            >
              <div
                className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-2xl ${
                  unlocked ? "bg-amber-500/15 grayscale-0" : "bg-muted grayscale"
                }`}
              >
                {b.emoji}
              </div>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-black ${unlocked ? "text-amber-700 dark:text-amber-300" : ""}`}>
                  {b.name}
                  {unlocked && <span className="mr-1 text-[10px] font-bold text-green-600 dark:text-green-400">✓ مفتوح</span>}
                </p>
                <p className="text-[11px] leading-relaxed text-muted-foreground">{b.desc}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
