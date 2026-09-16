import { useLocation } from "wouter";
import { formatKickoffDay, formatKickoffTime, type RslFixture } from "@/components/rsl/rslTypes";
import { S55Crest } from "./S55Crest";
import { statusOf, score } from "./matchUtils";

/** مباراة الصدارة (الهيرو) — بطاقة كبيرة للمباراة المباشرة أو القادمة الأبرز */
export function S55BigMatch({ fx }: { fx: RslFixture }) {
  const [, navigate] = useLocation();
  const st = statusOf(fx);
  const href = `/sports/match/${fx.id}`;
  const pens = fx.penalties && fx.penalties.home != null && fx.penalties.away != null;

  return (
    <a
      href={href}
      className="bigmatch"
      onClick={(e) => {
        e.preventDefault();
        navigate(href);
      }}
    >
      <div className="bm-top">
        <span>{fx.round || "دوري روشن السعودي"}</span>
        <span className={`bstat${st.cls === "live" ? " live" : ""}`}>
          {st.cls === "live" ? `مباشر · ${st.text}` : st.cls === "done" ? "انتهت" : st.text}
        </span>
      </div>
      <div className="bm-body">
        <div className="bm-team">
          <S55Crest team={fx.home} size="lg" />
          <b>{fx.home.name}</b>
        </div>
        <div className="bm-score">
          {st.cls === "soon" ? (
            <span className="vs">VS</span>
          ) : (
            <>
              <span>{score(fx.goals.home)}</span>
              <span className="vs">-</span>
              <span>{score(fx.goals.away)}</span>
            </>
          )}
        </div>
        <div className="bm-team">
          <S55Crest team={fx.away} size="lg" />
          <b>{fx.away.name}</b>
        </div>
      </div>
      <div className="bm-foot">
        <span>
          {formatKickoffDay(fx.date)} · {formatKickoffTime(fx.date)}
        </span>
        <span>
          {pens
            ? `ركلات: ${fx.penalties!.home}-${fx.penalties!.away}`
            : fx.venue?.name || fx.venue?.city || ""}
        </span>
      </div>
    </a>
  );
}
