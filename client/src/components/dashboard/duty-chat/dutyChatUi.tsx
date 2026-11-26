// عناصر صغيرة مشتركة لـ«محادثة المناوب»: علامات الصح، الوقت، والصورة الرمزية.
import type { DutyChatMessage } from "@shared/dutyChat";
import { tickFor } from "@shared/dutyChat";
import { displayTimeZone } from "@/lib/displayTimeZone";

export function chatTime(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: displayTimeZone(),
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

/** مفتاح اليوم بمنطقة الجهاز (للفواصل بين الأيام). */
export function chatDayKey(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: displayTimeZone() }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

export function chatDayLabel(iso: string, now = new Date()): string {
  const key = chatDayKey(iso);
  if (key === chatDayKey(now.toISOString())) return "اليوم";
  if (key === chatDayKey(new Date(now.getTime() - 86_400_000).toISOString())) return "أمس";
  const [y, m, d] = key.split("-");
  return `${d}/${m}/${y}`;
}

export function lastSeenLabel(iso: string | null): string {
  if (!iso) return "غير متصل";
  const day = chatDayLabel(iso);
  return `آخر ظهور ${day === "اليوم" ? "" : `${day} `}${chatTime(iso)}`.replace("  ", " ");
}

export function Ticks({ message, size = 18 }: { message: Pick<DutyChatMessage, "deliveredAt" | "readAt">; size?: number }) {
  const tick = tickFor(message);
  if (tick === "sent") {
    return (
      <svg width={size - 2} height={12} viewBox="0 0 18 12" fill="none" stroke="#8A9AAC" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="أُرسلت">
        <path d="M3 6.5 6.5 10 15 2" />
      </svg>
    );
  }
  const color = tick === "read" ? "#1E9BE6" : "#8A9AAC";
  return (
    <svg width={size} height={12} viewBox="0 0 18 12" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={tick === "read" ? "قُرئت" : "وصلت"}>
      <path d="M1 6.5 4.5 10 11 2" />
      <path d="M7 10 7.5 10.5 14.5 2" />
    </svg>
  );
}

export function ChatAvatar({ initial, online, size = 40 }: { initial: string; online?: boolean; size?: number }) {
  return (
    <span
      className="relative flex shrink-0 items-center justify-center rounded-full bg-[#E6F4FD] font-bold text-[#0B6FA8]"
      style={{ width: size, height: size, fontSize: Math.round(size / 2.5) }}
      aria-hidden="true"
    >
      {initial}
      {online ? (
        <span className="absolute bottom-0 left-0 h-[11px] w-[11px] rounded-full border-2 border-white bg-[#1FA971]" />
      ) : null}
    </span>
  );
}

export function CheckIcon({ color = "#13734E", size = 14 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5 10 17 19 7" />
    </svg>
  );
}
