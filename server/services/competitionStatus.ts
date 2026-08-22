/**
 * حالة موسم البطولة (جارٍ / قادم / منتهٍ).
 *
 * المزود يقصّر أحيانًا تاريخ نهاية الكأس إلى آخر مباراة نُشرت (بعد دور الـ32
 * مثلًا) بينما الأدوار التالية لم تُجدول بعد — فيظهر الكأس «منتهٍ» كذبًا.
 */
export type CompetitionStatus = "ongoing" | "upcoming" | "finished" | "unknown";

export function computeSeasonDateStatus(
  start: string | null,
  end: string | null,
  today = new Date().toISOString().slice(0, 10),
): CompetitionStatus {
  if (!start || !end) return "unknown";
  if (today < start) return "upcoming";
  if (today > end) return "finished";
  return "ongoing";
}

/** نهائي حقيقي — لا «3rd Place Final» ولا تحديد المركز الثالث. */
export function isCupFinalRound(round: string | null | undefined): boolean {
  const r = (round ?? "").trim();
  if (!r) return false;
  const lower = r.toLowerCase();
  if (lower.includes("3rd") || lower.includes("third") || r.includes("المركز الثالث")) {
    return false;
  }
  return lower === "final" || lower.startsWith("final") || r === "النهائي";
}

export type RecentCupRound = {
  round?: string | null;
  finished: boolean;
};

/**
 * يصحّح حالة «منتهٍ» المستنتجة من التواريخ:
 * - أي بطولة فيها مباراة قادمة خلال 21 يومًا تبقى جارية.
 * - الكأس لا تُنهى إلا بعد صافرة النهائي (غياب الدور التالي ≠ نهاية البطولة).
 */
export function refineCompetitionStatus(input: {
  dateStatus: CompetitionStatus;
  type: string;
  hasUpcomingWithinDays: boolean;
  recentRounds?: RecentCupRound[];
}): CompetitionStatus {
  if (input.dateStatus !== "finished") return input.dateStatus;
  if (input.hasUpcomingWithinDays) return "ongoing";
  if (input.type === "cup") {
    const finalDone = (input.recentRounds ?? []).some(
      (f) => f.finished && isCupFinalRound(f.round),
    );
    if (!finalDone) return "ongoing";
  }
  return "finished";
}
