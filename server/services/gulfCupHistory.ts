/**
 * سجلّ كأس الخليج العربي التاريخي — النسخ 1..26 (1970 → 2024‑25) + خليجي 27 القادمة.
 *
 * بيانات ثابتة موثوقة (لا تعتمد على أي مزوّد): المضيف والبطل لكل نسخة، والوصيف
 * ونتيجة النهائي للنسخ الحديثة ذات النهائي المباشر. النسخ القديمة أُقيمت بنظام
 * الدوري (لا نهائي) فالوصيف متروك null حيث لا توثيق قاطع.
 *
 * معرّفات المنتخبات هي معرّفات API-Football نفسها المستخدمة في gulfCupData:
 * 23 السعودية · 1547 البحرين · 1550 اليمن · 1552 عُمان · 1563 الإمارات ·
 * 1567 العراق · 1569 قطر · 1570 الكويت.
 */
import { GC_TEAM_AR } from "./gulfCupNames";

const TEAM = {
  saudi: 23,
  bahrain: 1547,
  yemen: 1550,
  oman: 1552,
  uae: 1563,
  iraq: 1567,
  qatar: 1569,
  kuwait: 1570,
} as const;

export interface GcHistoricalEdition {
  edition: number;
  /** سنة الإقامة (قد تمتد لسنتين مثل 2024–25). */
  year: string;
  /** معرّف الدولة المضيفة. */
  hostId: number;
  /** المدينة المضيفة إن وُثّقت. */
  hostCity: string | null;
  /** معرّف البطل — null للنسخة القادمة. */
  championId: number | null;
  /** معرّف الوصيف إن وُثّق (النسخ الحديثة ذات النهائي). */
  runnerUpId: number | null;
  /** نتيجة النهائي إن وُجد نهائي مباشر. */
  finalNote: string | null;
  upcoming?: boolean;
}

/** النسخ مرتّبة تصاعديًّا (1 → 27). */
export const GC_EDITIONS: GcHistoricalEdition[] = [
  { edition: 1, year: "1970", hostId: TEAM.bahrain, hostCity: "المنامة", championId: TEAM.kuwait, runnerUpId: null, finalNote: null },
  { edition: 2, year: "1972", hostId: TEAM.saudi, hostCity: "الرياض", championId: TEAM.kuwait, runnerUpId: null, finalNote: null },
  { edition: 3, year: "1974", hostId: TEAM.kuwait, hostCity: "الكويت", championId: TEAM.kuwait, runnerUpId: null, finalNote: null },
  { edition: 4, year: "1976", hostId: TEAM.qatar, hostCity: "الدوحة", championId: TEAM.kuwait, runnerUpId: null, finalNote: null },
  { edition: 5, year: "1979", hostId: TEAM.iraq, hostCity: "بغداد", championId: TEAM.iraq, runnerUpId: null, finalNote: null },
  { edition: 6, year: "1982", hostId: TEAM.uae, hostCity: "أبوظبي", championId: TEAM.kuwait, runnerUpId: null, finalNote: null },
  { edition: 7, year: "1984", hostId: TEAM.oman, hostCity: "مسقط", championId: TEAM.iraq, runnerUpId: null, finalNote: null },
  { edition: 8, year: "1986", hostId: TEAM.bahrain, hostCity: "المنامة", championId: TEAM.kuwait, runnerUpId: null, finalNote: null },
  { edition: 9, year: "1988", hostId: TEAM.saudi, hostCity: "الرياض", championId: TEAM.iraq, runnerUpId: null, finalNote: null },
  { edition: 10, year: "1990", hostId: TEAM.kuwait, hostCity: "الكويت", championId: TEAM.kuwait, runnerUpId: null, finalNote: null },
  { edition: 11, year: "1992", hostId: TEAM.qatar, hostCity: "الدوحة", championId: TEAM.qatar, runnerUpId: null, finalNote: null },
  { edition: 12, year: "1994", hostId: TEAM.uae, hostCity: "أبوظبي", championId: TEAM.saudi, runnerUpId: null, finalNote: null },
  { edition: 13, year: "1996", hostId: TEAM.oman, hostCity: "مسقط", championId: TEAM.kuwait, runnerUpId: null, finalNote: null },
  { edition: 14, year: "1998", hostId: TEAM.bahrain, hostCity: "المنامة", championId: TEAM.kuwait, runnerUpId: null, finalNote: null },
  { edition: 15, year: "2002", hostId: TEAM.saudi, hostCity: "الرياض", championId: TEAM.saudi, runnerUpId: null, finalNote: null },
  { edition: 16, year: "2003–04", hostId: TEAM.kuwait, hostCity: "الكويت", championId: TEAM.saudi, runnerUpId: null, finalNote: null },
  { edition: 17, year: "2004", hostId: TEAM.qatar, hostCity: "الدوحة", championId: TEAM.qatar, runnerUpId: TEAM.oman, finalNote: "بركلات الترجيح" },
  { edition: 18, year: "2007", hostId: TEAM.uae, hostCity: "أبوظبي", championId: TEAM.uae, runnerUpId: TEAM.oman, finalNote: "1-0" },
  { edition: 19, year: "2009", hostId: TEAM.oman, hostCity: "مسقط", championId: TEAM.oman, runnerUpId: TEAM.saudi, finalNote: "بركلات الترجيح" },
  { edition: 20, year: "2010", hostId: TEAM.yemen, hostCity: "عدن", championId: TEAM.kuwait, runnerUpId: TEAM.saudi, finalNote: "1-0" },
  { edition: 21, year: "2013", hostId: TEAM.bahrain, hostCity: "المنامة", championId: TEAM.uae, runnerUpId: TEAM.iraq, finalNote: "2-1 بعد التمديد" },
  { edition: 22, year: "2014", hostId: TEAM.saudi, hostCity: "الرياض", championId: TEAM.qatar, runnerUpId: TEAM.saudi, finalNote: "2-1" },
  { edition: 23, year: "2017–18", hostId: TEAM.kuwait, hostCity: "الكويت", championId: TEAM.oman, runnerUpId: TEAM.uae, finalNote: "بركلات الترجيح" },
  { edition: 24, year: "2019", hostId: TEAM.qatar, hostCity: "الدوحة", championId: TEAM.bahrain, runnerUpId: TEAM.saudi, finalNote: "1-0" },
  { edition: 25, year: "2023", hostId: TEAM.iraq, hostCity: "البصرة", championId: TEAM.iraq, runnerUpId: TEAM.oman, finalNote: "3-2 بعد التمديد" },
  { edition: 26, year: "2024–25", hostId: TEAM.kuwait, hostCity: "الكويت", championId: TEAM.bahrain, runnerUpId: TEAM.oman, finalNote: "2-1" },
  { edition: 27, year: "2026", hostId: TEAM.saudi, hostCity: "جدة", championId: null, runnerUpId: null, finalNote: null, upcoming: true },
];

export interface GcTeamLegacy {
  titles: number;
  runnerUps: number;
  hosted: number;
  titleYears: string[];
  lastTitleYear: string | null;
}

/** إرث منتخب عبر تاريخ البطولة (ألقاب/وصافات موثّقة/استضافات). */
export function getGcTeamLegacy(teamId: number): GcTeamLegacy {
  const titleYears: string[] = [];
  let runnerUps = 0;
  let hosted = 0;
  for (const e of GC_EDITIONS) {
    if (e.upcoming) continue;
    if (e.championId === teamId) titleYears.push(e.year);
    if (e.runnerUpId === teamId) runnerUps++;
    if (e.hostId === teamId) hosted++;
  }
  // خليجي 27 استضافة مؤكّدة وإن لم تُقم بعد
  if (GC_EDITIONS.some((e) => e.upcoming && e.hostId === teamId)) hosted++;
  return {
    titles: titleYears.length,
    runnerUps,
    hosted,
    titleYears,
    lastTitleYear: titleYears[titleYears.length - 1] ?? null,
  };
}

export function gcTeamName(id: number): string {
  return GC_TEAM_AR[id] ?? String(id);
}
