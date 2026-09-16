import { CalendarDays, Trophy, Target, Sparkles, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import type { RslFixture, RslStandingRow, RslScorer } from "@/components/rsl/rslTypes";
import { S55Crest } from "./S55Crest";
import { statusOf, score } from "./matchUtils";

function TodayMatches({ fixtures }: { fixtures: RslFixture[] }) {
  const [, navigate] = useLocation();
  return (
    <div className="widget">
      <div className="wh">
        <h3>
          <span className="ic">
            <CalendarDays size={16} />
          </span>{" "}
          مباريات اليوم
        </h3>
        <a
          href="/sports/matches"
          onClick={(e) => {
            e.preventDefault();
            navigate("/sports/matches");
          }}
        >
          الكل
        </a>
      </div>
      {fixtures.length === 0 ? (
        <p className="empty" style={{ padding: 20 }}>لا مباريات اليوم.</p>
      ) : (
        fixtures.slice(0, 6).map((fx) => {
          const st = statusOf(fx);
          return (
            <a
              key={fx.id}
              href={`/sports/match/${fx.id}`}
              className="tmatch"
              onClick={(e) => {
                e.preventDefault();
                navigate(`/sports/match/${fx.id}`);
              }}
            >
              <div className="tteams">
                <div className="tt">
                  <S55Crest team={fx.home} size="mini" />
                  <span className="tn">{fx.home.name}</span>
                  <span className="tsc">{score(fx.goals.home)}</span>
                </div>
                <div className="tt">
                  <S55Crest team={fx.away} size="mini" />
                  <span className="tn">{fx.away.name}</span>
                  <span className="tsc">{score(fx.goals.away)}</span>
                </div>
              </div>
              <div className={`tstat${st.cls === "live" ? " live" : ""}`}>{st.text}</div>
            </a>
          );
        })
      )}
    </div>
  );
}

function StandingsMini({ rows }: { rows: RslStandingRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="widget">
      <div className="wh">
        <h3>
          <span className="ic">
            <Trophy size={16} />
          </span>{" "}
          الترتيب
        </h3>
      </div>
      <table className="stbl">
        <thead>
          <tr>
            <th>#</th>
            <th style={{ textAlign: "right" }}>الفريق</th>
            <th>لعب</th>
            <th>+/−</th>
            <th>نقاط</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 6).map((r) => (
            <tr key={r.team.id} className={r.rank <= 3 ? "top" : ""}>
              <td className="rk">{r.rank}</td>
              <td className="team">
                <span className="cell">
                  <S55Crest team={r.team} size="mini" />
                  <span className="tn">{r.team.name}</span>
                </span>
              </td>
              <td className="mono">{r.played}</td>
              <td className="mono">{r.goalsDiff > 0 ? `+${r.goalsDiff}` : r.goalsDiff}</td>
              <td className="pts">{r.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScorersMini({ scorers }: { scorers: RslScorer[] }) {
  if (scorers.length === 0) return null;
  return (
    <div className="widget">
      <div className="wh">
        <h3>
          <span className="ic">
            <Target size={16} />
          </span>{" "}
          الهدّافون
        </h3>
      </div>
      <div className="mread">
        {scorers.slice(0, 5).map((s) => (
          <div className="mr" key={s.id}>
            <span className="no">{s.rank}</span>
            <span className="mr-photo">{s.photo ? <img src={s.photo} alt="" loading="lazy" /> : null}</span>
            <div className="mr-info">
              <b>{s.name}</b>
              <span>{s.team.name}</span>
            </div>
            <span className="mr-goals">{s.goals}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function S55Sidebar({
  today,
  standings,
  scorers,
  predictionsEnabled,
}: {
  today: RslFixture[];
  standings: RslStandingRow[];
  scorers: RslScorer[];
  predictionsEnabled: boolean;
}) {
  const [, navigate] = useLocation();
  return (
    <aside className="side">
      <TodayMatches fixtures={today} />
      <StandingsMini rows={standings} />
      <ScorersMini scorers={scorers} />

      {predictionsEnabled ? (
        <div className="cta pred">
          <h3>توقّع نتائج الجولة</h3>
          <p>شارك في مسابقة توقعات دوري روشن واجمع النقاط.</p>
          <a
            href="/predictions?competition=rsl-2026"
            className="cbtn"
            onClick={(e) => {
              e.preventDefault();
              navigate("/predictions?competition=rsl-2026");
            }}
          >
            <Sparkles size={15} /> ابدأ التوقّع
          </a>
        </div>
      ) : null}

      <div className="cta app">
        <h3>هب دوري روشن الفاخر</h3>
        <p>التجربة الكاملة للبطولة: أخبار، مباريات، ترتيب وهدّافون.</p>
        <a
          href="/roshn"
          className="cbtn"
          onClick={(e) => {
            e.preventDefault();
            navigate("/roshn");
          }}
        >
          استكشف الهب <ArrowLeft size={15} />
        </a>
      </div>
    </aside>
  );
}
