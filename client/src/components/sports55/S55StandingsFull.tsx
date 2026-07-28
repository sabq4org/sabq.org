import { Trophy } from "lucide-react";
import type { RslStandingRow } from "@/components/rsl/rslTypes";
import { S55Crest } from "./S55Crest";

function FormBadges({ form }: { form: string | null }) {
  if (!form) return <span className="mono" style={{ color: "var(--muted)" }}>—</span>;
  const last = form.slice(-5).split("");
  const ar: Record<string, string> = { W: "ف", D: "ت", L: "خ" };
  return (
    <span className="form">
      {last.map((c, i) => (
        <i key={i} className={c}>
          {ar[c] || c}
        </i>
      ))}
    </span>
  );
}

/** جدول ترتيب دوري روشن الكامل */
export function S55StandingsFull({
  rows,
  isLoading,
}: {
  rows: RslStandingRow[];
  isLoading: boolean;
}) {
  return (
    <>
      <div className="section-title">
        <h2>ترتيب دوري روشن</h2>
      </div>
      <div className="stwrap">
        {isLoading ? (
          <div className="sk" style={{ height: 320, margin: 12, borderRadius: 10 }} />
        ) : rows.length === 0 ? (
          <p className="empty">لا يتوفر ترتيب حاليًا.</p>
        ) : (
          <table className="big-stbl">
            <thead>
              <tr>
                <th>#</th>
                <th style={{ textAlign: "right" }}>الفريق</th>
                <th>لعب</th>
                <th className="hide-sm">فاز</th>
                <th className="hide-sm">تعادل</th>
                <th className="hide-sm">خسر</th>
                <th>+/−</th>
                <th className="hide-sm">آخر 5</th>
                <th>نقاط</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.team.id} className={r.rank <= 3 ? "top" : ""}>
                  <td className="rk">{r.rank}</td>
                  <td className="team">
                    <S55Crest team={r.team} size="mini" />
                    <span className="tn">{r.team.name}</span>
                  </td>
                  <td className="mono">{r.played}</td>
                  <td className="mono hide-sm">{r.win}</td>
                  <td className="mono hide-sm">{r.draw}</td>
                  <td className="mono hide-sm">{r.lose}</td>
                  <td className="mono">{r.goalsDiff > 0 ? `+${r.goalsDiff}` : r.goalsDiff}</td>
                  <td className="hide-sm">
                    <FormBadges form={r.form} />
                  </td>
                  <td className="pts">{r.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
