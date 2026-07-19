/**
 * كشف بطل بطولة كؤوس (خليجي/آسيا/…) من مباراة النهائي المنتهية — نظير
 * detectChampion في worldCupService لكن ببنية هيكلية تقبل GcFixture وAcFixture
 * (لا حقل penalties ولا team.winner فيهما): الفائز يُحسم بعلم المزوّد إن وُجد،
 * ثم بالترجيح إن وُجد، ثم بالأهداف. تعادل غير قابل للحسم → null، ويغطّيه
 * التعيين اليدوي من لوحة التحكم. النتائج بترتيب «الفائز أولًا» (W-L).
 */

export interface CupTeamLike {
  id: number;
  name: string;
  logo: string;
  winner?: boolean | null;
}

export interface CupFixtureLike {
  date: string;
  roundEn: string;
  status: { finished: boolean };
  home: CupTeamLike;
  away: CupTeamLike;
  goals: { home: number | null; away: number | null };
  penalties?: { home: number | null; away: number | null } | null;
}

export interface CupChampion {
  team: { id: number; name: string; logo: string };
  runnerUp: { id: number; name: string; logo: string } | null;
  /** نتيجة النهائي (W-L) — null للتعيين اليدوي أو غياب الأهداف */
  score: string | null;
  /** نتيجة ركلات الترجيح (W-L) — null إن حُسم النهائي دونها */
  penalties: string | null;
  decidedAt: string | null;
  source: "auto" | "manual";
}

const bareTeam = (t: CupTeamLike) => ({ id: t.id, name: t.name, logo: t.logo });

export function detectCupChampion(fixtures: CupFixtureLike[]): CupChampion | null {
  // «3rd Place Final» لا تبدأ بـFinal فلا تُلتقط خطأً
  const final = fixtures.find(
    (f) => (f.roundEn ?? "").trim().startsWith("Final") && f.status.finished,
  );
  if (!final) return null;

  const pen = final.penalties;
  let winnerSide: "home" | "away" | null = null;
  if (final.home.winner === true) winnerSide = "home";
  else if (final.away.winner === true) winnerSide = "away";
  else if (pen && pen.home != null && pen.away != null && pen.home !== pen.away)
    winnerSide = pen.home > pen.away ? "home" : "away";
  else if (
    final.goals.home != null &&
    final.goals.away != null &&
    final.goals.home !== final.goals.away
  )
    winnerSide = final.goals.home > final.goals.away ? "home" : "away";
  if (!winnerSide) return null;

  const winner = winnerSide === "home" ? final.home : final.away;
  const loser = winnerSide === "home" ? final.away : final.home;
  const winnerGoals = winnerSide === "home" ? final.goals.home : final.goals.away;
  const loserGoals = winnerSide === "home" ? final.goals.away : final.goals.home;

  return {
    team: bareTeam(winner),
    runnerUp: bareTeam(loser),
    score:
      winnerGoals != null && loserGoals != null ? `${winnerGoals}-${loserGoals}` : null,
    penalties:
      pen && pen.home != null && pen.away != null
        ? winnerSide === "home"
          ? `${pen.home}-${pen.away}`
          : `${pen.away}-${pen.home}`
        : null,
    decidedAt: final.date ?? null,
    source: "auto",
  };
}

/** بطل مُعيَّن يدويًا — يُبنى من بيانات المنتخب في أي مباراة خاضها بالبطولة. */
export function manualCupChampion(
  fixtures: CupFixtureLike[],
  teamId: number,
): CupChampion | null {
  for (const f of fixtures) {
    const team = f.home.id === teamId ? f.home : f.away.id === teamId ? f.away : null;
    if (team) {
      return {
        team: bareTeam(team),
        runnerUp: null,
        score: null,
        penalties: null,
        decidedAt: null,
        source: "manual",
      };
    }
  }
  return null;
}
