import type { DutyCellState, LiveStatus } from "@shared/contentDuty";

export const DUTY_COLORS = {
  action: "#1E9BE6",
  view: "#CFE6F7",
  absent: "#F5C9CC",
  future: "#EEF2F6",
  untracked: "#EEF2F6",
} as const satisfies Record<DutyCellState, string>;

/** ألوان الأشخاص في الجدول: فاتحة ومختلفة في الإضاءة لا في اللون فقط. */
export const PERSON_COLORS = [
  { solid: "#1E9BE6", soft: "#DDEFFC", text: "#0B6FA8" },
  { solid: "#2FB6A0", soft: "#DDF4EF", text: "#11735F" },
  { solid: "#8B7CF0", soft: "#ECE8FD", text: "#5B49C9" },
  { solid: "#E9A23B", soft: "#FCEFD9", text: "#8A5A00" },
  { solid: "#E46FA0", soft: "#FCE6EF", text: "#A3285C" },
  { solid: "#5B8DEF", soft: "#E3ECFD", text: "#2B5BB8" },
];

export function personColor(index: number) {
  return PERSON_COLORS[((index % PERSON_COLORS.length) + PERSON_COLORS.length) % PERSON_COLORS.length];
}

/** 134 ← "2:14" */
export function formatRemaining(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

export function statusLabel(status: LiveStatus | null): string {
  if (status === "active") return "نشِط الآن";
  if (status === "idle") return "متصل بلا حركة";
  if (status === "away") return "غائب الآن";
  return "";
}

export function statusTone(status: LiveStatus | null): { bg: string; fg: string; dot: string } {
  if (status === "active") return { bg: "#E8F6EF", fg: "#13734E", dot: "#1FA971" };
  if (status === "idle") return { bg: "#E6F4FD", fg: "#0B6FA8", dot: "#7CC3F0" };
  return { bg: "#FDECEC", fg: "#BF3038", dot: "#E0393E" };
}

export function minutesText(min: number | null | undefined): string {
  if (min === null || min === undefined) return "—";
  return `${min} د`;
}

export function dutyErrorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : "";
  if (text.includes("غير متاح مؤقتاً")) return "جدول المناوبات غير مفعّل بعد أو الخادم مشغول. أعد المحاولة بعد قليل.";
  return text || "تعذر تحميل المناوبات";
}
