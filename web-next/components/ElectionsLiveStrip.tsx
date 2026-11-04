"use client";

import { useEffect, useState } from "react";

/**
 * Toggle: set NEXT_PUBLIC_ELECTIONS_STRIP_ENABLED=false to hide the strip.
 * NEXT_PUBLIC_ELECTIONS_URL switches the target (default: the sabq.org/elections Worker route).
 * Mirrors client/src/components/ElectionsLiveStrip.tsx.
 */
export const ELECTIONS_STRIP_ENABLED = process.env.NEXT_PUBLIC_ELECTIONS_STRIP_ENABLED !== "false";
export const ELECTIONS_PAGE_URL = process.env.NEXT_PUBLIC_ELECTIONS_URL || "https://sabq.org/elections";
const ELECTIONS_API_URL = process.env.NEXT_PUBLIC_ELECTIONS_API_URL || `${ELECTIONS_PAGE_URL.replace(/\/$/, "")}/api/results`;
const DISMISS_STORAGE_NAME = "sabq-elections-strip-2026-dismissed";
const REFRESH_MS = 5 * 60 * 1000;
// Covers edge/browser caching and one polling interval without keeping old totals live.
const MAX_RESULT_AGE_MS = 15 * 60 * 1000;

type Balance = { d: number; r: number };
type Results = { senate: Balance | null; house: Balance | null };
const EMPTY_RESULTS: Results = { senate: null, house: null };

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : null;
}

/** Invalid or demo totals must never appear as live election results. */
export function parseElectionBalances(value: unknown, now = Date.now()): Results {
  const data = record(value);
  if (data?.demo !== false) return EMPTY_RESULTS;
  const fetchedAt = typeof data.fetchedAt === "string" ? Date.parse(data.fetchedAt) : NaN;
  if (!Number.isFinite(fetchedAt) || now - fetchedAt > MAX_RESULT_AGE_MS || fetchedAt - now > REFRESH_MS) {
    return EMPTY_RESULTS;
  }
  const offices = record(data.offices);
  const read = (office: "senate" | "house", total: number): Balance | null => {
    const balance = record(record(offices?.[office])?.balance);
    const d = record(balance?.D)?.seats;
    const r = record(balance?.R)?.seats;
    return typeof d === "number" && typeof r === "number" && Number.isInteger(d) && Number.isInteger(r)
      && d >= 0 && r >= 0 && d + r <= total ? { d, r } : null;
  };
  return { senate: read("senate", 100), house: read("house", 435) };
}

function readDismissed(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(DISMISS_STORAGE_NAME) === "1";
  } catch {
    return false;
  }
}

function ChamberResult({ title, balance }: { title: string; balance: Balance | null }) {
  return (
    <span className="flex min-w-0 flex-col justify-center gap-0.5 px-1.5 sm:px-4 lg:px-3" aria-label={balance ? `${title}: الديمقراطيون ${balance.d}، الجمهوريون ${balance.r}` : `${title}: النتائج غير متاحة حالياً`}>
      <span className="text-center text-xs font-semibold leading-5 lg:text-[13px]">{title}</span>
      <span className="flex items-center justify-center gap-3 sm:gap-5 lg:gap-4">
        <span className="flex min-w-0 flex-col items-center gap-0.5 lg:flex-row lg:gap-2">
          <span className="whitespace-nowrap text-[10px] leading-4 sm:text-xs">الديمقراطيون</span>
          <bdi dir="ltr" className="text-[22px] font-bold leading-6 tabular-nums text-[#216dc5] sm:text-2xl dark:text-[#80b8ff]">{balance?.d ?? "—"}</bdi>
        </span>
        <span className="flex min-w-0 flex-col items-center gap-0.5 lg:flex-row lg:gap-2">
          <span className="whitespace-nowrap text-[10px] leading-4 sm:text-xs">الجمهوريون</span>
          <bdi dir="ltr" className="text-[22px] font-bold leading-6 tabular-nums text-[#b73544] sm:text-2xl dark:text-[#ff9da9]">{balance?.r ?? "—"}</bdi>
        </span>
      </span>
    </span>
  );
}

/** Same layout in SPA and SSR; each breakpoint reserves its space before data arrives. */
export function ElectionsLiveStrip() {
  const [dismissed, setDismissed] = useState<boolean>(false);
  const [results, setResults] = useState<Results>(EMPTY_RESULTS);

  useEffect(() => {
    if (readDismissed()) setDismissed(true);
  }, []);

  useEffect(() => {
    if (!ELECTIONS_STRIP_ENABLED || dismissed || !ELECTIONS_API_URL) return;
    let alive = true;
    let pending: AbortController | null = null;
    const load = async () => {
      const ctrl = new AbortController();
      pending = ctrl;
      const timeout = setTimeout(() => ctrl.abort(), 5000);
      try {
        const res = await fetch(ELECTIONS_API_URL, { signal: ctrl.signal, credentials: "omit" });
        const data: unknown = res.ok ? await res.json() : null;
        if (alive) setResults(parseElectionBalances(data));
      } catch {
        if (alive) setResults(EMPTY_RESULTS);
      } finally {
        clearTimeout(timeout);
        if (pending === ctrl) pending = null;
      }
    };
    void load();
    const interval = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(interval);
      pending?.abort();
    };
  }, [dismissed]);

  if (!ELECTIONS_STRIP_ENABLED || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_STORAGE_NAME, "1");
    } catch {
      /* Dismiss still works for this visit when browser storage is unavailable. */
    }
  };

  return (
    <section
      dir="rtl"
      aria-label="نتائج الانتخابات النصفية الأمريكية 2026"
      data-testid="elections-live-strip"
      className="w-full border-y border-[#dce8f1] bg-[#f0f7fc] text-[#14253e] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
    >
      <div className="container mx-auto flex items-start gap-1 px-3 sm:px-6 lg:items-center lg:px-8">
        <a
          href={ELECTIONS_PAGE_URL}
          target="_blank"
          rel="noopener"
          aria-label="نتائج الانتخابات النصفية الأمريكية 2026 والخريطة — يفتح في نافذة جديدة"
          className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] grid-rows-[44px_68px] items-center rounded-sm outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#216dc5] lg:grid-cols-[minmax(180px,1fr)_minmax(520px,1.7fr)_auto] lg:grid-rows-[64px]"
          data-testid="link-elections-live"
        >
          <span className="col-start-1 row-start-1 flex min-w-0 items-center gap-2 lg:flex-col lg:items-start lg:gap-0">
            <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-[#b73544] dark:text-[#ff9da9]">
              <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
              <span className="hidden min-[375px]:inline">مباشر</span>
            </span>
            <span className="whitespace-nowrap text-[13px] font-bold sm:text-base lg:text-lg">أمريكا تنتخب 2026</span>
          </span>
          <span className="col-span-2 col-start-1 row-start-2 grid h-full min-w-0 grid-cols-2 border-t border-[#dce8f1] py-1 dark:border-slate-700 lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:h-12 lg:border-t-0 lg:py-0">
            <ChamberResult title="مجلس الشيوخ" balance={results.senate} />
            <span className="flex min-w-0 justify-center border-r border-[#ccdce9] dark:border-slate-700">
              <ChamberResult title="مجلس النواب" balance={results.house} />
            </span>
          </span>
          <span className="col-start-2 row-start-1 flex min-h-11 items-center gap-1 whitespace-nowrap text-xs font-semibold text-[#096ebd] hover:underline sm:text-sm lg:col-start-3 lg:pr-4 dark:text-[#80b8ff]">
            <span className="sm:hidden">النتائج</span>
            <span className="hidden sm:inline">النتائج والخريطة</span>
            <span aria-hidden="true">←</span>
          </span>
        </a>
        <button
          type="button"
          onClick={dismiss}
          aria-label="إخفاء شريط الانتخابات"
          className="mt-1 flex h-9 w-7 shrink-0 items-center justify-center rounded-md text-xl text-slate-500 outline-offset-2 hover:bg-blue-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#216dc5] lg:mt-0 lg:w-9 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
          data-testid="button-dismiss-elections-strip"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
    </section>
  );
}
