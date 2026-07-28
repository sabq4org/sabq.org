import { formatKickoffTime, type RslFixture } from "@/components/rsl/rslTypes";

export interface MatchStatusView {
  cls: "live" | "done" | "soon";
  text: string;
}

/** يحوّل حالة المباراة إلى تصنيف عرض + نص مختصر */
export function statusOf(fx: RslFixture): MatchStatusView {
  const s = fx.status;
  if (s.live) {
    const m =
      s.elapsed != null ? `${s.elapsed}${s.extra ? `+${s.extra}` : ""}'` : s.label || "مباشر";
    return { cls: "live", text: m };
  }
  if (s.finished) return { cls: "done", text: "انتهت" };
  return { cls: "soon", text: formatKickoffTime(fx.date) };
}

export const score = (n: number | null): string => (n == null ? "-" : String(n));

export function winner(fx: RslFixture): "home" | "away" | null {
  const { home, away } = fx.goals;
  if (home == null || away == null || !fx.status.finished) return null;
  if (home > away) return "home";
  if (away > home) return "away";
  return null;
}
