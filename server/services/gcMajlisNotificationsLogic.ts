/** دوال حتمية قابلة للاختبار؛ لا تستورد قاعدة البيانات أو مزوّدات push. */

export type GcMajlisReminderCandidate = {
  userId: string;
  majlisId: string;
  majlisName: string;
  predictedPeers: number;
  createdAt: Date;
};

/**
 * يختار مجلسًا واحدًا فقط لكل عضو/مباراة، الأكثر نشاطًا أولًا ثم الأقدم؛ يمنع
 * عدة دفعات للمستخدم الذي ينتمي إلى أكثر من مجلس.
 */
export function selectGcMajlisReminderCandidates(
  rows: GcMajlisReminderCandidate[],
): GcMajlisReminderCandidate[] {
  const selected = new Map<string, GcMajlisReminderCandidate>();
  for (const row of rows) {
    const current = selected.get(row.userId);
    if (
      !current ||
      row.predictedPeers > current.predictedPeers ||
      (row.predictedPeers === current.predictedPeers && row.createdAt < current.createdAt) ||
      (row.predictedPeers === current.predictedPeers &&
        row.createdAt.getTime() === current.createdAt.getTime() &&
        row.majlisId.localeCompare(current.majlisId) < 0)
    ) {
      selected.set(row.userId, row);
    }
  }
  return [...selected.values()];
}

export type GcMajlisRankSnapshotRow = {
  majlisId: string;
  majlisName: string;
  userId: string;
  name: string;
  joinedAt: Date;
  points: number;
  exact: number;
  correct: number;
  fixturePoints: number;
  fixtureExact: number;
  fixtureCorrect: number;
};

type RankedSnapshotRow = GcMajlisRankSnapshotRow & { rank: number };

function rankRows(rows: GcMajlisRankSnapshotRow[], beforeFixture: boolean): RankedSnapshotRow[] {
  return [...rows]
    .sort((a, b) => {
      const aPoints = a.points - (beforeFixture ? a.fixturePoints : 0);
      const bPoints = b.points - (beforeFixture ? b.fixturePoints : 0);
      const aExact = a.exact - (beforeFixture ? a.fixtureExact : 0);
      const bExact = b.exact - (beforeFixture ? b.fixtureExact : 0);
      const aCorrect = a.correct - (beforeFixture ? a.fixtureCorrect : 0);
      const bCorrect = b.correct - (beforeFixture ? b.fixtureCorrect : 0);
      return (
        bPoints - aPoints ||
        bExact - aExact ||
        bCorrect - aCorrect ||
        a.joinedAt.getTime() - b.joinedAt.getTime() ||
        a.userId.localeCompare(b.userId)
      );
    })
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export type GcMajlisOvertake = {
  majlisId: string;
  majlisName: string;
  overtakerId: string;
  overtakerName: string;
  overtakenId: string;
};

export type GcMajlisOvertakeNotification = {
  userId: string;
  majlisId: string;
  fixtureId: string;
  type: "gc.majlis.overtake";
  dedupeKey: string;
  title: string;
  body: string;
  deeplink: string;
  payload: {
    overtakerId: string;
    overtakerName: string;
    pushDeeplink: string;
  };
};

/** Build deterministic outbox payloads without consulting a fixture provider. */
export function buildGcMajlisOvertakeNotifications(
  events: GcMajlisOvertake[],
  fixtureId: string,
  fixtureLabel: string,
): GcMajlisOvertakeNotification[] {
  const matchSuffix = fixtureLabel.trim() ? ` بعد مباراة ${fixtureLabel.trim()}` : "";
  return events.map((event) => {
    const query = new URLSearchParams({ id: event.majlisId, fixture: fixtureId });
    return {
      userId: event.overtakenId,
      majlisId: event.majlisId,
      fixtureId,
      type: "gc.majlis.overtake",
      dedupeKey: `gc-majlis:overtake:${event.majlisId}:${fixtureId}:${event.overtakenId}`,
      title: "تغيّر ترتيب المجلس 📈",
      body: `تجاوزك ${event.overtakerName} في ترتيب «${event.majlisName}»${matchSuffix}.`,
      deeplink: `/gulf-cup/majlis?${query.toString()}`,
      payload: {
        overtakerId: event.overtakerId,
        overtakerName: event.overtakerName,
        pushDeeplink: `https://sabq.org/gulf-cup/majlis?${query.toString()}`,
      },
    };
  });
}

/**
 * يعيد التقاطعات الحقيقية فقط: كان المتجاوز خلف العضو قبل نقاط المباراة ثم
 * أصبح أمامه بعدها. يُختار إشعار واحد لكل عضو حتى لو تجاوزه أكثر من شخص.
 */
export function detectGcMajlisOvertakes(rows: GcMajlisRankSnapshotRow[]): GcMajlisOvertake[] {
  const groups = new Map<string, GcMajlisRankSnapshotRow[]>();
  for (const row of rows) {
    const group = groups.get(row.majlisId) ?? [];
    group.push(row);
    groups.set(row.majlisId, group);
  }

  const events: GcMajlisOvertake[] = [];
  for (const group of groups.values()) {
    const before = rankRows(group, true);
    const after = rankRows(group, false);
    const beforeRank = new Map(before.map((row) => [row.userId, row.rank]));

    for (const overtaken of after) {
      const overtakenBefore = beforeRank.get(overtaken.userId) ?? overtaken.rank;
      const candidates = after.filter((overtaker) => {
        if (overtaker.userId === overtaken.userId) return false;
        const overtakerBefore = beforeRank.get(overtaker.userId) ?? overtaker.rank;
        return overtakerBefore > overtakenBefore && overtaker.rank < overtaken.rank;
      });
      const overtaker = candidates[0]; // after مرتبة؛ الأعلى حاليًا هو الأهم.
      if (!overtaker) continue;
      events.push({
        majlisId: overtaken.majlisId,
        majlisName: overtaken.majlisName,
        overtakerId: overtaker.userId,
        overtakerName: overtaker.name,
        overtakenId: overtaken.userId,
      });
    }
  }
  return events;
}
