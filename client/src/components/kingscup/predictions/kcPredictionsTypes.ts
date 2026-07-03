/**
 * أنواع توقّعات كأس الملك — مرآة لنظام sports_pool الموحّد:
 *   GET/POST /api/sports/match/:id/predict   (توقّع نتيجة مباراة — 3 نقاط دقيقة / 1 اتجاه)
 *   GET      /api/sports/predictions/me      (توقّعاتي + ملخّص نقاطي)
 *   GET      /api/sports/leaderboard         (لوحة المتصدّرين)
 *   GET/POST /api/sports/predictions/long    (البطل + الهدّاف)
 */

export const KC_COMPETITION_SLUG = "kings-cup";

/** صفّ توقّع محفوظ (sports_predictions) — يصل من /api/sports/predictions/me */
export interface KcSavedPrediction {
  id: string;
  fixtureId: number;
  competitionSlug: string | null;
  kickoffTs: number;
  homeId: number | null;
  awayId: number | null;
  homeName: string;
  awayName: string;
  homeLogo: string | null;
  awayLogo: string | null;
  predHome: number;
  predAway: number;
  actualHome: number | null;
  actualAway: number | null;
  /** null = لم تُسوَّ بعد؛ 3 = نتيجة دقيقة، 1 = اتجاه صحيح، 0 = لم تُصب */
  points: number | null;
  settledAt: string | null;
  createdAt: string;
}

export interface KcPredictionStats {
  totalPoints: number;
  predictions: number;
  exact: number;
  correct: number;
}

export interface KcLeaderRow {
  userId: string;
  name: string;
  avatar: string | null;
  totalPoints: number;
  predictions: number;
  exact: number;
  correct: number;
  rank: number;
}

/** استجابة التوقّعات طويلة المدى — /api/sports/predictions/long?comp=kings-cup */
export interface KcLongData {
  competitionSlug: string;
  teams: { id: number; name: string; logo: string }[];
  pools: { champion: number; top_scorer: number };
  championVotes: { teamId: number | null; n: number }[];
  locked: boolean;
  mine: {
    kind: string;
    teamId: number | null;
    teamName: string | null;
    teamLogo: string | null;
    playerName: string | null;
    status: string;
    pointsAwarded: number;
  }[];
}
