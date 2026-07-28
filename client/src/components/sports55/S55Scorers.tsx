import { Target } from "lucide-react";
import type { RslScorer } from "@/components/rsl/rslTypes";
import { S55Crest } from "./S55Crest";

/** هدّافو دوري روشن — شبكة بطاقات */
export function S55Scorers({ scorers, isLoading }: { scorers: RslScorer[]; isLoading: boolean }) {
  if (!isLoading && scorers.length === 0) return null;
  return (
    <>
      <div className="section-title">
        <h2>الهدّافون</h2>
      </div>
      <div className="scgrid">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="sk" style={{ height: 68 }} />
            ))
          : scorers.slice(0, 8).map((s) => (
              <div className="sc-card" key={s.id}>
                <span className="sc-rank">{s.rank}</span>
                <span className="sc-photo">
                  {s.photo ? <img src={s.photo} alt="" loading="lazy" /> : null}
                </span>
                <div className="sc-info">
                  <b>{s.name}</b>
                  <span className="sc-team">
                    <S55Crest team={s.team} size="mini" />
                    {s.team.name}
                  </span>
                </div>
                <div className="sc-goals">
                  <b>{s.goals}</b>
                  <span>هدف</span>
                </div>
              </div>
            ))}
      </div>
    </>
  );
}
