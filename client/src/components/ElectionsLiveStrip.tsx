import { useEffect, useState } from "react";

/**
 * Toggle: set VITE_ELECTIONS_STRIP_ENABLED=false to hide the strip site-wide.
 * VITE_ELECTIONS_URL switches the target (default: the sabq.org/elections Worker route).
 */
const ENV = import.meta.env as Record<string, string | undefined>;
export const ELECTIONS_STRIP_ENABLED = ENV.VITE_ELECTIONS_STRIP_ENABLED !== "false";
export const ELECTIONS_PAGE_URL = ENV.VITE_ELECTIONS_URL || "https://sabq.org/elections";
const ELECTIONS_API_URL = ENV.VITE_ELECTIONS_API_URL || `${ELECTIONS_PAGE_URL.replace(/\/$/, "")}/api/results`;
// Declared before INITIAL_DISMISSED: readDismissed() reads it at module load.
const DISMISS_STORAGE_NAME = "sabq-elections-strip-2026-dismissed";
// SPA: read localStorage synchronously so dismissed users never see a flash.
const INITIAL_DISMISSED = readDismissed();

const REFRESH_MS = 5 * 60 * 1000;

type Balance = { d: number; r: number };

function readDismissed(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(DISMISS_STORAGE_NAME) === "1";
  } catch {
    return false;
  }
}

/**
 * Slim, dismissible live strip for the US 2026 midterm results, rendered
 * directly under the site header. Fixed height (no layout shift when the
 * balance arrives); the live balance fetch fails silently.
 */
export function ElectionsLiveStrip() {
  const [dismissed, setDismissed] = useState<boolean>(INITIAL_DISMISSED);
  const [balance, setBalance] = useState<Balance | null>(null);

  useEffect(() => {
    if (readDismissed()) setDismissed(true);
  }, []);

  useEffect(() => {
    if (!ELECTIONS_STRIP_ENABLED || dismissed || !ELECTIONS_API_URL) return;
    let alive = true;
    const load = async () => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      try {
        const res = await fetch(ELECTIONS_API_URL, { signal: ctrl.signal, credentials: "omit" });
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        const b = data?.offices?.senate?.balance;
        if (!alive) return;
        // Any failed or demo/invalid refresh clears the numbers, so the strip never
        // shows stale results next to «مباشر» while the source is down.
        if (!data?.demo && b && Number.isFinite(b.D?.seats) && Number.isFinite(b.R?.seats)) {
          setBalance({ d: b.D.seats, r: b.R.seats });
        } else {
          setBalance(null);
        }
      } catch {
        if (alive) setBalance(null);
      } finally {
        clearTimeout(t);
      }
    };
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [dismissed]);

  if (!ELECTIONS_STRIP_ENABLED || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_STORAGE_NAME, "1");
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      dir="rtl"
      data-testid="elections-live-strip"
      className="w-full border-t border-red-200/60 bg-[#0f172a] text-white dark:border-red-900/40"
    >
      <div className="container mx-auto flex h-9 items-center gap-2 px-4 text-[13px] sm:px-6 sm:text-sm lg:px-8">
        <a
          href={ELECTIONS_PAGE_URL}
          target="_blank"
          rel="noopener"
          className="flex min-w-0 flex-1 items-center gap-2 hover:underline"
          data-testid="link-elections-live"
        >
          <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75 motion-reduce:animate-none" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
          </span>
          <span className="shrink-0 font-bold text-red-400">مباشر</span>
          <span className="shrink-0 opacity-50" aria-hidden="true">|</span>
          <span className="truncate font-semibold">نتائج الانتخابات النصفية الأمريكية 2026</span>
          {balance && (
            <span className="hidden shrink-0 items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-xs sm:inline-flex" aria-label={`مجلس الشيوخ: الديمقراطيون ${balance.d}، الجمهوريون ${balance.r}`}>
              الشيوخ
              <b className="text-[#5aa2ff]">د {balance.d}</b>–<b className="text-[#ff6b7d]">ج {balance.r}</b>
            </span>
          )}
          <span className="mr-auto hidden shrink-0 text-[#4cbcfd] sm:inline">تابع النتائج ←</span>
        </a>
        <button
          type="button"
          onClick={dismiss}
          aria-label="إخفاء شريط الانتخابات"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
          data-testid="button-dismiss-elections-strip"
        >
          ×
        </button>
      </div>
    </div>
  );
}
