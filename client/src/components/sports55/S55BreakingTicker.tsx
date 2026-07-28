import { formatKickoffTime, type RslFixture } from "@/components/rsl/rslTypes";
import { statusOf, score } from "./matchUtils";

/** شريط عاجل مشتق من المباريات المباشرة/القادمة (بيانات حقيقية) */
export function S55BreakingTicker({ fixtures }: { fixtures: RslFixture[] }) {
  const items = fixtures.slice(0, 6).map((fx) => {
    const st = statusOf(fx);
    if (st.cls === "soon") {
      return { time: formatKickoffTime(fx.date), text: `${fx.home.name} ضد ${fx.away.name} · ${fx.round || "دوري روشن"}` };
    }
    return {
      time: st.cls === "live" ? st.text : "انتهت",
      text: `${fx.home.name} ${score(fx.goals.home)} - ${score(fx.goals.away)} ${fx.away.name}`,
    };
  });

  if (items.length === 0) return null;

  return (
    <div className="breaking">
      <div className="wrap">
        <span className="lbl">مباشر</span>
        <div className="track">
          {items.map((it, i) => (
            <span key={i}>
              <b>{it.time}</b>
              {it.text}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
