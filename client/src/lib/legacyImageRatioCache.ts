const STORAGE_KEY = "legacy_img_ratio:v1";
const MAX_ENTRIES = 500;

type RatioEntry = { r: number; t: number };
type RatioMap = Record<string, RatioEntry>;

let memoryCache: RatioMap | null = null;
let writeScheduled = false;

let cachedIsBrowser: boolean | null = null;

function isBrowser(): boolean {
  if (cachedIsBrowser !== null) return cachedIsBrowser;
  try {
    cachedIsBrowser =
      typeof window !== "undefined" &&
      typeof window.localStorage !== "undefined" &&
      window.localStorage !== null;
  } catch {
    // Some restricted browser modes throw on `window.localStorage` access.
    cachedIsBrowser = false;
  }
  return cachedIsBrowser;
}

function loadFromStorage(): RatioMap {
  if (!isBrowser()) return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as RatioMap;
  } catch {
    // ignore parse errors
  }
  return {};
}

function ensureLoaded(): RatioMap {
  if (memoryCache) return memoryCache;
  memoryCache = loadFromStorage();
  return memoryCache;
}

function scheduleFlush(): void {
  if (!isBrowser() || writeScheduled) return;
  writeScheduled = true;
  const flush = () => {
    writeScheduled = false;
    if (!memoryCache) return;
    try {
      const entries = Object.entries(memoryCache);
      if (entries.length > MAX_ENTRIES) {
        entries.sort((a, b) => b[1].t - a[1].t);
        memoryCache = Object.fromEntries(entries.slice(0, MAX_ENTRIES)) as RatioMap;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(memoryCache));
    } catch {
      // localStorage may be full or disabled; safe to ignore
    }
  };
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(flush, { timeout: 2000 });
  } else {
    setTimeout(flush, 250);
  }
}

function normalizeKey(src: string): string {
  if (!src) return src;
  return src.trim();
}

export function getCachedAspectRatio(src: string): number | null {
  if (!src) return null;
  const cache = ensureLoaded();
  const entry = cache[normalizeKey(src)];
  if (!entry) return null;
  if (!Number.isFinite(entry.r) || entry.r <= 0) return null;
  return entry.r;
}

export function setCachedAspectRatio(src: string, ratio: number): void {
  if (!src || !Number.isFinite(ratio) || ratio <= 0) return;
  const cache = ensureLoaded();
  const key = normalizeKey(src);
  const rounded = Math.round(ratio * 1000) / 1000;
  const existing = cache[key];
  if (existing && Math.abs(existing.r - rounded) < 0.001) {
    existing.t = Date.now();
  } else {
    cache[key] = { r: rounded, t: Date.now() };
  }
  scheduleFlush();
}

export function formatAspectRatio(ratio: number): string {
  return `${Math.round(ratio * 1000) / 1000}`;
}
