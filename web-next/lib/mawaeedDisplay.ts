const GREGORIAN_MONTHS = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
] as const;

export type ServiceDisplayTone = "citizen" | "salary" | "school" | "social" | "pension";

/** يحذف الشهر والسنة المطابقين لتاريخ الموعد، مع إبقاء بقية معنى العنوان. */
export function compactOccurrenceTitle(title: string, startsOn: string): string {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(startsOn);
  if (!match) return title.trim();
  const year = match[1];
  const month = GREGORIAN_MONTHS[Number(match[2]) - 1];
  if (!month) return title.trim();
  const monthYear = `${month}\\s*${year}`;
  const parenthesized = new RegExp(`\\s*\\(\\s*${monthYear}\\s*\\)\\s*$`);
  const dashSuffix = new RegExp(`\\s*[—–-]\\s*${monthYear}\\s*$`);
  const معاشSuffix = new RegExp(`\\s*معاش\\s+${monthYear}\\s*$`);
  let compact = title;
  let removedPeriod = false;
  for (const pattern of [parenthesized, dashSuffix, معاشSuffix]) {
    if (pattern.test(compact)) {
      compact = compact.replace(pattern, "");
      removedPeriod = true;
      break;
    }
  }
  compact = compact
    .replace(/\(\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s*([,،:؛|])\s*$/g, "")
    .replace(/\s*[-–—]\s*$/g, "")
    .trim();
  if (removedPeriod) compact = compact.replace(/\s*[-–—]\s*معاش$/, "").trim();
  return compact || title.trim();
}

/** يزيل اسم السلسلة من الصف حين لا يضيف معنى، ويبقي رقم الدفعة أو نطاق التقاعد. */
export function compactServiceOccurrenceTitle(title: string, startsOn: string, tone: ServiceDisplayTone): string {
  const compact = compactOccurrenceTitle(title, startsOn);
  const prefixes: Record<ServiceDisplayTone, RegExp> = {
    salary: /^رواتب موظفي الدولة\s*(?:[—–-]\s*)?/,
    citizen: /^حساب المواطن\s*(?:[—–-]\s*)?/,
    social: /^الضمان الاجتماعي المطور\s*(?:[—–-]\s*)?/,
    pension: /^معاشات التقاعد\s*/,
    school: /^$/,
  };
  return compact.replace(prefixes[tone], "").trim();
}

/** يحذف جملة «المصدر: ...» من العرض فقط؛ تبقى بيانات المصدر في النموذج وJSON-LD. */
export function stripDisplayedSourceSentence(text: string): string {
  return text.replace(/(?:^|\s)المصدر:\s*[^.؟!]+[.؟!]?/g, " ").replace(/\s{2,}/g, " ").trim();
}
