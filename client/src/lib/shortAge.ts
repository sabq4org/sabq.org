/**
 * The quad-categories block gets ages in server shorthand ("منذ 17س",
 * "17س", "منذ 2ي", "دقائق"). Expand them to readable Arabic for the mobile
 * cards: "منذ 17 ساعة", "منذ يومين", "منذ دقائق". Unknown input is returned
 * unchanged.
 */
export function expandShortAge(age: string | null | undefined): string {
  if (!age) return "";
  const trimmed = age.trim();
  if (trimmed === "دقائق") return "منذ دقائق";
  const m = trimmed.match(/^(?:منذ\s*)?(\d+)\s*(س|ي)$/);
  if (!m) return trimmed;
  const n = Number(m[1]);
  if (m[2] === "س") {
    if (n === 1) return "منذ ساعة";
    if (n === 2) return "منذ ساعتين";
    return n <= 10 ? `منذ ${n} ساعات` : `منذ ${n} ساعة`;
  }
  if (n === 1) return "منذ يوم";
  if (n === 2) return "منذ يومين";
  return n <= 10 ? `منذ ${n} أيام` : `منذ ${n} يومًا`;
}
