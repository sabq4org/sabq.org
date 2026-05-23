import { X } from "lucide-react";
import { useHajjSeason } from "@/hooks/useHajjSeason";

const GRADIENT_FROM = "#1a5c2a";
const GRADIENT_TO = "#c9a84c";

function CrescentIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M15.5 2a10 10 0 1 0 6.5 17.6A8 8 0 0 1 15.5 2z" />
    </svg>
  );
}

function KaabaIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={className} aria-hidden="true">
      <rect x="4" y="6" width="16" height="14" rx="0.5" />
      <line x1="4" y1="10" x2="20" y2="10" />
      <line x1="4" y1="14" x2="20" y2="14" strokeDasharray="2 1.5" />
    </svg>
  );
}

function PalmIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 22V11" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M12 11c-2-3-6-4-9-3 1-3 5-4 8-2-1-3 1-6 4-6 2 1 3 4 1 6 3-1 6 1 6 4-2 2-5 2-7 0 1 3-1 5-3 5z" />
    </svg>
  );
}

/**
 * Decorative overlay layered on top of the site header. Lives behind the
 * header content (z-[-1] inside the header) with a low-opacity gradient and
 * a few SVG accents tucked into the corners.
 */
export function HajjEidHeaderDecor() {
  const { active } = useHajjSeason();
  if (!active) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden="true"
      data-testid="hajj-eid-header-decor"
    >
      <div
        className="absolute inset-0 opacity-[0.18] dark:opacity-[0.28]"
        style={{
          background: `linear-gradient(90deg, ${GRADIENT_FROM} 0%, ${GRADIENT_TO} 100%)`,
        }}
      />
      <CrescentIcon className="absolute -top-2 right-2 h-10 w-10 text-[#c9a84c] opacity-30" />
      <PalmIcon className="absolute bottom-0 right-12 h-7 w-7 text-[#1a5c2a] opacity-25" />
      <KaabaIcon className="absolute -top-1 left-3 h-9 w-9 text-[#1a5c2a] opacity-30" />
      <PalmIcon className="absolute bottom-0 left-14 h-7 w-7 text-[#c9a84c] opacity-25" />
    </div>
  );
}

/**
 * Thin greeting strip rendered above the main header. Dismissible — once
 * closed, the bar stays hidden for the rest of the Hajj window (localStorage).
 */
export function HajjEidGreetingBar() {
  const { active, dismissed, dismiss } = useHajjSeason();
  if (!active || dismissed) return null;

  return (
    <div
      dir="rtl"
      role="region"
      aria-label="رسالة تهنئة موسمية"
      data-testid="hajj-eid-greeting-bar"
      className="relative w-full text-white text-center text-sm py-1.5 px-10"
      style={{
        background: `linear-gradient(90deg, ${GRADIENT_FROM} 0%, ${GRADIENT_TO} 100%)`,
      }}
    >
      <span className="font-medium">
        تهنئ سبق قراءها بعيد الأضحى المبارك وتقبّل الله من الحجاج
      </span>
      <span className="mx-1.5" aria-hidden="true">🕋</span>
      <button
        type="button"
        onClick={dismiss}
        aria-label="إخفاء رسالة التهنئة"
        data-testid="button-dismiss-hajj-greeting"
        className="absolute top-1/2 -translate-y-1/2 left-2 inline-flex items-center justify-center rounded-full p-1 text-white/90 hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/60"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
