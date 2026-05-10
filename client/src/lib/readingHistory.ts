import { apiRequest, trackBeacon } from "@/lib/queryClient";

const STORAGE_KEY = "sabq:reading_history:v1";
const SYNCED_USER_KEY = "sabq:reading_history:synced_user";
const PENDING_KEY = "sabq:reading_history:pending";
const MAX_ENTRIES = 200;
const MAX_AGE_DAYS = 30;
const SYNC_DEBOUNCE_MS = 4000;

export interface ReadingEntry {
  id: string;
  categoryId?: string;
  categoryName?: string;
  keywords: string[];
  timestamp: number;
  timeSpent: number;
}

export interface ArticleLike {
  id: string;
  title?: string | null;
  categoryId?: string | null;
  category?: { id?: string; nameAr?: string | null } | null | undefined;
  seo?:
    | {
        keywords?: string[];
        metaTitle?: string;
        metaDescription?: string;
        socialTitle?: string;
        socialDescription?: string;
        imageAltText?: string;
        ogImageUrl?: string;
      }
    | null
    | undefined;
}

const ARABIC_STOP_WORDS = new Set([
  "من","في","على","عن","إلى","مع","هذا","هذه","ذلك","تلك",
  "التي","الذي","بعد","قبل","هو","هي","كان","كانت","لكن","أو",
  "أن","إن","ما","لا","لم","ولا","كما","حتى","بين","فقط",
  "كل","بعض","عند","قد","غير","ضد","لدى","نحو","حول","أيضا",
  "هناك","هنا","ثم","لقد","أم","إذا","إذ","لن","سوف","عبر",
]);

function tokenizeTitle(title: string): string[] {
  return title
    .split(/[\s،,.\-:؛"”“'()\[\]\/!?؟]+/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length >= 3 && !ARABIC_STOP_WORDS.has(t));
}

export function extractArticleKeywords(article: ArticleLike): string[] {
  const set = new Set<string>();
  const seoKw = article.seo?.keywords;
  if (Array.isArray(seoKw)) {
    seoKw.forEach((k) => {
      if (typeof k === "string" && k.trim()) {
        set.add(k.toLowerCase().trim());
      }
    });
  }
  if (article.title) {
    tokenizeTitle(article.title)
      .slice(0, 12)
      .forEach((t) => set.add(t));
  }
  return Array.from(set).slice(0, 20);
}

function sanitize(raw: any): ReadingEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Partial<ReadingEntry>;
  if (typeof e.id !== "string") return null;
  if (typeof e.timestamp !== "number") return null;
  return {
    id: e.id,
    categoryId: typeof e.categoryId === "string" ? e.categoryId : undefined,
    categoryName: typeof e.categoryName === "string" ? e.categoryName : undefined,
    keywords: Array.isArray(e.keywords)
      ? e.keywords.filter((k): k is string => typeof k === "string")
      : [],
    timestamp: e.timestamp,
    timeSpent:
      typeof e.timeSpent === "number" && isFinite(e.timeSpent) ? e.timeSpent : 0,
  };
}

export function getReadingHistory(): ReadingEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
    const out: ReadingEntry[] = [];
    for (const r of parsed) {
      const e = sanitize(r);
      if (e && e.timestamp >= cutoff) out.push(e);
    }
    return out;
  } catch {
    return [];
  }
}

function saveHistory(entries: ReadingEntry[]) {
  if (typeof window === "undefined") return;
  try {
    const trimmed = entries.slice(-MAX_ENTRIES);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore quota errors
  }
}

function getPendingIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function setPendingIds(ids: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // ignore
  }
}

function markPending(id: string) {
  const p = getPendingIds();
  p.add(id);
  setPendingIds(p);
}

export function recordArticleRead(
  article: ArticleLike,
  timeSpentSec = 0,
): void {
  if (typeof window === "undefined" || !article?.id) return;
  const history = getReadingHistory();
  const existingIdx = history.findIndex((e) => e.id === article.id);
  const prevTime = existingIdx >= 0 ? history[existingIdx].timeSpent : 0;
  const entry: ReadingEntry = {
    id: article.id,
    categoryId: article.categoryId || article.category?.id || undefined,
    categoryName: article.category?.nameAr || undefined,
    keywords: extractArticleKeywords(article),
    timestamp: Date.now(),
    timeSpent: Math.max(prevTime, Math.floor(timeSpentSec)),
  };
  if (existingIdx >= 0) history.splice(existingIdx, 1);
  history.push(entry);
  saveHistory(history);
  markPending(entry.id);
  schedulePush();
}

export function updateTimeSpent(articleId: string, timeSpentSec: number): void {
  if (typeof window === "undefined" || !articleId) return;
  const history = getReadingHistory();
  const idx = history.findIndex((e) => e.id === articleId);
  if (idx < 0) return;
  history[idx].timeSpent = Math.max(
    history[idx].timeSpent,
    Math.floor(timeSpentSec),
  );
  saveHistory(history);
  markPending(articleId);
  schedulePush();
}

export function clearReadingHistory(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(PENDING_KEY);
    window.localStorage.removeItem(SYNCED_USER_KEY);
  } catch {
    // ignore
  }
}

// ======================================================
// Cross-device sync
// ======================================================

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let isLoggedIn = false;
let pulledOnce = false;

export function setReadingHistoryAuth(loggedIn: boolean, userId?: string): void {
  if (typeof window === "undefined") return;
  isLoggedIn = loggedIn;
  if (!loggedIn) {
    pulledOnce = false;
    return;
  }
  // If user changed, clear local cache so we don't mix histories
  try {
    const prev = window.localStorage.getItem(SYNCED_USER_KEY);
    if (userId && prev && prev !== userId) {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(PENDING_KEY);
    }
    if (userId) window.localStorage.setItem(SYNCED_USER_KEY, userId);
  } catch {
    // ignore
  }
  // One-time backfill: mark every existing local entry as pending so legacy
  // history (recorded before sync was introduced) gets pushed to the server.
  try {
    const existing = getReadingHistory();
    if (existing.length > 0) {
      const p = getPendingIds();
      let added = 0;
      for (const e of existing) {
        if (!p.has(e.id)) {
          p.add(e.id);
          added++;
        }
      }
      if (added > 0) setPendingIds(p);
    }
  } catch {
    // ignore
  }
  // Pull then push pending
  void pullFromServer().then(() => schedulePush(0));
}

function mergeEntries(a: ReadingEntry[], b: ReadingEntry[]): ReadingEntry[] {
  const map = new Map<string, ReadingEntry>();
  for (const e of [...a, ...b]) {
    const prev = map.get(e.id);
    if (!prev) {
      map.set(e.id, e);
    } else {
      map.set(e.id, {
        ...prev,
        ...e,
        keywords: e.keywords.length >= prev.keywords.length ? e.keywords : prev.keywords,
        categoryId: e.categoryId || prev.categoryId,
        categoryName: e.categoryName || prev.categoryName,
        timestamp: Math.max(prev.timestamp, e.timestamp),
        timeSpent: Math.max(prev.timeSpent, e.timeSpent),
      });
    }
  }
  const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  return Array.from(map.values())
    .filter((e) => e.timestamp >= cutoff)
    .sort((x, y) => x.timestamp - y.timestamp)
    .slice(-MAX_ENTRIES);
}

async function pullFromServer(): Promise<void> {
  if (!isLoggedIn || pulledOnce) return;
  try {
    const res = await apiRequest<{ entries: ReadingEntry[] }>(
      "/api/me/reading-history",
    );
    const remote = (res?.entries || [])
      .map(sanitize)
      .filter((e): e is ReadingEntry => !!e);
    const local = getReadingHistory();
    const merged = mergeEntries(local, remote);
    saveHistory(merged);
    pulledOnce = true;

    // Self-healing: any local entry not on server must be pushed.
    // This recovers from missed pushes / stale cached bundles.
    const remoteIds = new Set(remote.map((e) => e.id));
    const missing = merged.filter((e) => !remoteIds.has(e.id));
    if (missing.length > 0) {
      const p = getPendingIds();
      for (const e of missing) p.add(e.id);
      setPendingIds(p);
    }

    try {
      window.dispatchEvent(new CustomEvent("reading-history-updated"));
    } catch {
      // ignore
    }
  } catch {
    // network or 401 — retry on next login
  }
}

function schedulePush(delay = SYNC_DEBOUNCE_MS): void {
  if (typeof window === "undefined" || !isLoggedIn) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    void pushPending();
  }, delay);
}

async function pushPending(): Promise<void> {
  if (!isLoggedIn) return;
  const pending = getPendingIds();
  if (pending.size === 0) return;
  const history = getReadingHistory();
  const toSend = history.filter((e) => pending.has(e.id));
  if (toSend.length === 0) {
    setPendingIds(new Set());
    return;
  }
  try {
    await apiRequest("/api/me/reading-history", {
      method: "POST",
      body: JSON.stringify({ entries: toSend }),
      headers: { "Content-Type": "application/json" },
      silent: true,
    });
    setPendingIds(new Set());
  } catch (error) {
    // keep pending for retry; never bother the visitor with a toast
    if (typeof console !== "undefined") {
      console.debug("Reading history sync failed (silent):", error);
    }
  }
}

// Flush on page unload to avoid losing recent reads
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    if (!isLoggedIn) return;
    const pending = getPendingIds();
    if (pending.size === 0) return;
    const history = getReadingHistory();
    const toSend = history.filter((e) => pending.has(e.id));
    if (toSend.length === 0) return;
    try {
      // Unified beacon helper: sendBeacon first, keepalive fetch fallback.
      const ok = trackBeacon("/api/me/reading-history", { entries: toSend });
      if (ok) setPendingIds(new Set());
      // If beacon fails or unsupported, keep pending IDs for retry on next session
    } catch {
      // keep pending
    }
  });
}
