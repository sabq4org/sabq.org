import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  isFeatureNew,
  markFeatureOpened,
  markFeaturesShown,
  NEW_FEATURES,
  parseNewFeatureSeen,
  pathHasNewFeature,
  type NewFeatureSeen,
} from "@/lib/newFeatures";

const SEEN_PREF_NAME = "sabq-new-features-v1";
const listeners = new Set<() => void>();
let cache: NewFeatureSeen | null = null;
let cacheRaw: string | null = null;

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(SEEN_PREF_NAME);
  } catch {
    return null;
  }
}

function getSnapshot(): NewFeatureSeen {
  const raw = typeof window === "undefined" ? null : readRaw();
  if (cache && raw === cacheRaw) return cache;
  cacheRaw = raw;
  cache = parseNewFeatureSeen(raw);
  return cache;
}

function write(next: NewFeatureSeen) {
  const raw = JSON.stringify(next);
  try {
    window.localStorage.setItem(SEEN_PREF_NAME, raw);
  } catch {
    // تخزين محجوب: تبقى الشارة لهذه الجلسة فقط.
  }
  cache = next;
  cacheRaw = readRaw() ?? raw;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === SEEN_PREF_NAME) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function useSeen(): NewFeatureSeen {
  return useSyncExternalStore(subscribe, getSnapshot, () => ({}));
}

/**
 * للقائمة: هل في هذه الصفحة خدمة جديدة؟ لا يُحسب إلا ما في قائمة هذا المستخدم،
 * ويبدأ عدّاد الـ14 يومًا من أول ظهور له فيها.
 */
export function useNewFeatureNav(visiblePaths: Array<string | undefined>) {
  const seen = useSeen();
  const now = Date.now();
  const visible = NEW_FEATURES.filter((f) => visiblePaths.some((p) => pathHasNewFeature(p, {}, now, [f])));
  const visibleKey = visible.map((f) => f.key).join(",");
  useEffect(() => {
    if (!visibleKey) return;
    const keys = visibleKey.split(",");
    const next = markFeaturesShown(getSnapshot(), Date.now(), NEW_FEATURES.filter((f) => keys.includes(f.key)));
    if (next) write(next);
  }, [visibleKey]);
  const hasNew = (path?: string) => pathHasNewFeature(path, seen, now, visible);
  const anyNew = visible.some((f) => isFeatureNew(f, seen, now));
  return { hasNew, anyNew };
}

/** داخل الصفحة: شارة الخدمة، وتسجيل فتحها. */
export function useNewFeature(key: string) {
  const seen = useSeen();
  const feature = NEW_FEATURES.find((f) => f.key === key);
  const isNew = feature ? isFeatureNew(feature, seen, Date.now()) : false;
  const markOpened = useCallback(() => {
    const next = markFeatureOpened(getSnapshot(), key, Date.now());
    if (next) write(next);
  }, [key]);
  return { isNew, markOpened };
}
