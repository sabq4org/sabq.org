import { useEffect, useState } from "react";

const DISMISS_KEY = "sabq:hajj-greeting-dismissed:2026";
const DHU_AL_HIJJAH = 12;
const HAJJ_START_DAY = 5;
const HAJJ_END_DAY = 15;

type HijriParts = { day: number; month: number; year: number };

function getHijriDateRiyadh(now: Date = new Date()): HijriParts | null {
  try {
    const parts = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
      timeZone: "Asia/Riyadh",
      day: "numeric",
      month: "numeric",
      year: "numeric",
    }).formatToParts(now);

    const day = Number(parts.find((p) => p.type === "day")?.value);
    const month = Number(parts.find((p) => p.type === "month")?.value);
    const year = Number(parts.find((p) => p.type === "year")?.value);

    if (!day || !month || !year) return null;
    return { day, month, year };
  } catch {
    return null;
  }
}

function isWithinHajjWindow(hijri: HijriParts | null): boolean {
  if (!hijri) return false;
  if (hijri.month !== DHU_AL_HIJJAH) return false;
  return hijri.day >= HAJJ_START_DAY && hijri.day <= HAJJ_END_DAY;
}

function readDismissedYear(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeDismissedYear(year: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DISMISS_KEY, String(year));
  } catch {
    // ignore quota/private-mode errors
  }
}

/**
 * Detects whether today (Asia/Riyadh) falls within 5–15 Dhu al-Hijjah,
 * and tracks dismissal of the greeting banner for the duration of the window.
 *
 * The QUERY string `?hajj=force` activates the window in any month — useful
 * for design review and PR screenshots outside the actual Hajj period.
 */
export function useHajjSeason() {
  const [active, setActive] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [year, setYear] = useState<number | null>(null);

  useEffect(() => {
    const forced =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("hajj") === "force";

    const hijri = getHijriDateRiyadh();
    const within = isWithinHajjWindow(hijri);
    const currentYear = hijri?.year ?? new Date().getFullYear();

    setActive(within || forced);
    setYear(currentYear);
    setDismissed(readDismissedYear() === currentYear);
  }, []);

  const dismiss = () => {
    if (year != null) writeDismissedYear(year);
    setDismissed(true);
  };

  return { active, dismissed, dismiss };
}
