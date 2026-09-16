import { useLocation } from "wouter";
import type { RslFixture } from "@/components/rsl/rslTypes";
import { S55Crest } from "./S55Crest";
import { statusOf, score, winner } from "./matchUtils";

/** بطاقة مباراة بستايل «سعودي سبورت» — رابط لمركز المباراة الكامل */
export function S55MatchCard({ fx }: { fx: RslFixture }) {
  const [, navigate] = useLocation();
  const st = statusOf(fx);
  const w = winner(fx);
  const href = `/sports/match/${fx.id}`;

  return (
    <a
      href={href}
      className="mcard"
      onClick={(e) => {
        e.preventDefault();
        navigate(href);
      }}
    >
      <div className="comp">
        <span className="cname">{fx.round || "دوري روشن"}</span>
        <span className={`status ${st.cls}`}>{st.text}</span>
      </div>
      <div className={`mrow${w === "home" ? " win" : ""}`}>
        <S55Crest team={fx.home} />
        <span className="tn">{fx.home.name}</span>
        <span className="sc">{score(fx.goals.home)}</span>
      </div>
      <div className={`mrow${w === "away" ? " win" : ""}`}>
        <S55Crest team={fx.away} />
        <span className="tn">{fx.away.name}</span>
        <span className="sc">{score(fx.goals.away)}</span>
      </div>
      <div className="foot">
        <span>{fx.venue?.name || "—"}</span>
        <span>{st.cls === "soon" ? "لم تبدأ" : st.cls === "live" ? "مباشر" : "انتهت"}</span>
      </div>
    </a>
  );
}
