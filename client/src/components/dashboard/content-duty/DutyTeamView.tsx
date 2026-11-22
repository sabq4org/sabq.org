import type { ContentDutyTeamResponse } from "@shared/contentDuty";
import { minutesText } from "@/lib/contentDuty";

const surface = "rounded-[22px] bg-white shadow-[0_1px_4px_rgba(27,43,58,.06)] dark:bg-slate-900";
const cols = "grid grid-cols-[1.4fr_0.9fr_1fr_0.8fr_1fr_0.8fr_1.3fr] items-center gap-2";

function presColor(v: number | null) {
  if (v === null) return "#1B2B3A";
  if (v >= 85) return "#13734E";
  if (v < 75) return "#BF3038";
  return "#1B2B3A";
}

export function DutyTeamView({ team, onPick }: { team: ContentDutyTeamResponse; onPick?: (name: string) => void }) {
  const range = `${team.from.slice(8)}/${team.from.slice(5, 7)} – ${team.to.slice(8)}/${team.to.slice(5, 7)}`;
  return (
    <section aria-labelledby="duty-team" className={`${surface} overflow-hidden`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2.5 px-[22px] pb-3 pt-5">
        <div>
          <h2 id="duty-team" className="m-0 text-lg font-bold">{team.access === "lead" ? "الفريق آخر 7 أيام" : "أدائي آخر 7 أيام"}</h2>
          <span className="text-xs text-[#55667A]"><bdi dir="ltr">{range}</bdi> · الحضور من دقائق العمل الفعلية داخل كل وردية</span>
        </div>
        <span className="text-xs text-[#55667A]">«المتروك» = مواد تجاوزت الحد وسُلّمت للوردية التالية</span>
      </div>
      {team.rows.length === 0 ? (
        <p className="m-0 border-t border-[#EEF2F6] px-[22px] py-6 text-sm text-[#55667A]">لا ورديات في آخر 7 أيام.</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[860px]">
            <div className={`${cols} border-t border-[#EEF2F6] bg-[#F8FAFC] px-[22px] py-2.5 text-xs text-[#55667A]`}>
              <span>المدير</span><span>الورديات</span><span>الحضور المتصل</span><span>المنشور</span><span>الاستجابة (وسيط)</span><span>المتروك</span><span>الحضور يومًا بيوم</span>
            </div>
            {team.rows.map((m) => (
              <div key={m.name} className={`${cols} border-t border-[#EEF2F6] px-[22px] py-3.5 text-sm`}>
                <span className="flex items-center gap-2.5">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#E6F4FD] text-[13px] font-bold text-[#0B6FA8]">{m.initial}</span>
                  {onPick ? (
                    <button type="button" onClick={() => onPick(m.name)} className="font-semibold text-[#1B2B3A] hover:text-[#0B6FA8]">{m.name}</button>
                  ) : <span className="font-semibold">{m.name}</span>}
                  {m.live ? <span className="h-2 w-2 rounded-full bg-[#1FA971]" title="يناوب الآن" /> : null}
                </span>
                <span dir="ltr" className="text-right tabular-nums">{m.shiftsAttended} / {m.shiftsScheduled}</span>
                <span dir="ltr" className="text-right font-semibold tabular-nums" style={{ color: presColor(m.presentPct) }}>{m.presentPct === null ? "—" : `${m.presentPct}%`}</span>
                <span dir="ltr" className="text-right tabular-nums">{m.published}</span>
                <span>{minutesText(m.responseMedianMin)}</span>
                <span dir="ltr" className="text-right font-semibold tabular-nums" style={{ color: m.leftAtHandoff === 0 ? "#13734E" : m.leftAtHandoff > 5 ? "#BF3038" : "#946000" }}>{m.leftAtHandoff}</span>
                <span className="flex h-6 items-end gap-[3px]" aria-label="الحضور يومًا بيوم">
                  {m.days.map((v, i) => (
                    <span key={i} className="flex-1 rounded-[3px]" style={{ height: v === null ? 4 : Math.max(4, Math.round((v / 100) * 24)), background: v === null ? "#EEF2F6" : v < 75 ? "#F5C9CC" : "#1E9BE6" }} />
                  ))}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
