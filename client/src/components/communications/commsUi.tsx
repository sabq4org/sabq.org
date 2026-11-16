import type { ReactNode } from "react";
import { Mail, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATE_LABEL, type InboxChannel, type InboxState, type TrackTone } from "./inboxModel";

// ألوان صفحة قنوات الاتصال: فاتح فقط، أزرق سبق للأفعال، والكحلي للنص وحده.
export const SURFACE = "rounded-[22px] bg-white shadow-[0_2px_8px_rgba(27,43,58,0.06)]";
export const CARD = "rounded-[18px] bg-white shadow-[0_2px_8px_rgba(27,43,58,0.06)]";
export const PILL_PRIMARY =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#1E9BE6] px-5 text-sm font-semibold text-white shadow-[0_6px_14px_rgba(30,155,230,0.3)] transition-colors hover:bg-[#1787cc] disabled:opacity-60";
export const PILL_SOFT =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#E6F4FD] px-5 text-sm font-semibold text-[#0B6FA8] transition-colors hover:bg-[#d6ecfb] disabled:opacity-60";
export const PILL_PLAIN =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-medium text-[#1B2B3A] shadow-[0_1px_3px_rgba(27,43,58,0.06)] transition-colors hover:bg-[#F8FAFC]";
export const PILL_QUIET =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#F4F7FB] px-5 text-sm font-semibold text-[#55667A] transition-colors hover:bg-[#EEF2F6] disabled:opacity-60";

const CHIP_TONE: Record<InboxState, string> = {
  published: "bg-[#E8F6EF] text-[#13734E]",
  draft: "bg-[#FFF6E5] text-[#946000]",
  rejected: "bg-[#EEF2F6] text-[#55667A]",
  failed: "bg-[#FDECEC] text-[#BF3038]",
  processing: "bg-[#E6F4FD] text-[#0B6FA8]",
};

export function StateChip({ state, className }: { state: InboxState; className?: string }) {
  return (
    <span className={cn("inline-flex whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold", CHIP_TONE[state], className)}>
      {STATE_LABEL[state]}
    </span>
  );
}

const TRACK_TONE: Record<TrackTone, string> = {
  done: "bg-[#1E9BE6]",
  draft: "bg-[#E9A93A]",
  fail: "bg-[#BF3038]",
  active: "bg-[#1E9BE6] animate-pulse",
  idle: "bg-[#DCE4EC]",
};

/** شريط المسار المصغّر: وصول، تحقق، تحرير، نشر. */
export function TrackBar({ tones, className, wide }: { tones: TrackTone[]; className?: string; wide?: boolean }) {
  return (
    <span className={cn("flex gap-1", className)} aria-hidden="true">
      {tones.map((tone, index) => (
        <span key={index} className={cn("h-[5px] rounded-[3px]", wide ? "flex-1" : "w-6", TRACK_TONE[tone])} />
      ))}
    </span>
  );
}

export function ChannelIcon({ channel, className }: { channel: InboxChannel; className?: string }) {
  const Icon = channel === "whatsapp" ? MessageCircle : Mail;
  return (
    <span
      className={cn("flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[11px] bg-[#E6F4FD] text-[#0B6FA8]", className)}
      role="img"
      aria-label={channel === "whatsapp" ? "واتساب" : "بريد"}
    >
      <Icon className="h-[17px] w-[17px]" aria-hidden="true" />
    </span>
  );
}

export function GroupLabel({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5 px-1.5">
      <h2 className="text-[13px] font-medium text-[#55667A]">{children}</h2>
      {aside}
    </div>
  );
}

/** شريحة مرشّح: المحددة أزرق ممتلئ بنص أبيض. */
export function FilterChip({
  active,
  onClick,
  children,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      data-testid={testId}
      className={cn(
        "h-9 whitespace-nowrap rounded-full px-3.5 text-[13px] font-semibold shadow-[0_1px_3px_rgba(27,43,58,0.06)] transition-colors",
        active ? "bg-[#1E9BE6] text-white" : "bg-white text-[#1B2B3A] hover:bg-[#F8FAFC]",
      )}
    >
      {children}
    </button>
  );
}

export function EmptyState({ icon, title, hint }: { icon: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#E6F4FD] text-[#0B6FA8]">{icon}</span>
      <p className="text-[15px] font-semibold text-[#1B2B3A]">{title}</p>
      {hint && <p className="max-w-sm text-[13px] leading-6 text-[#55667A]">{hint}</p>}
    </div>
  );
}
