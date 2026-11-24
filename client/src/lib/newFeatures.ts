// شارة «جديد» للخدمات الجديدة في لوحة الكاتب.
// تظهر على الخدمة داخل صفحتها وعلى قسمها في القائمة اليمنى، وتختفي حين يفتحها الكاتب
// أو بعد 14 يومًا من أول ظهور لها عنده. الحالة في متصفح الكاتب فقط (بلا قاعدة بيانات).

export type NewFeature = {
  key: string;
  label: string;
  /** صفحات القائمة التي تحمل الشارة ما دامت الخدمة جديدة. */
  paths: string[];
  /** بعد هذا التاريخ لا تظهر الشارة لأحد، حتى لمن لم يرها. */
  showUntil: string;
};

export const NEW_FEATURE_VISIBLE_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export const NEW_FEATURES: NewFeature[] = [
  {
    key: "public-byline",
    label: "كيف يراك القارئ",
    paths: ["/dashboard/my-services"],
    showUntil: "2027-03-31",
  },
];

export type NewFeatureSeen = Record<string, { firstShownAt?: number; openedAt?: number }>;

export function isFeatureNew(feature: NewFeature, seen: NewFeatureSeen, now: number): boolean {
  const until = Date.parse(`${feature.showUntil}T23:59:59Z`);
  if (Number.isFinite(until) && now > until) return false;
  const entry = seen[feature.key];
  if (entry?.openedAt) return false;
  if (entry?.firstShownAt && now - entry.firstShownAt > NEW_FEATURE_VISIBLE_DAYS * DAY_MS) return false;
  return true;
}

function normalizePath(path: string): string {
  const bare = path.split(/[?#]/)[0] || "/";
  return bare.length > 1 ? bare.replace(/\/+$/, "") : bare;
}

export function pathHasNewFeature(
  path: string | undefined,
  seen: NewFeatureSeen,
  now: number,
  features: NewFeature[] = NEW_FEATURES,
): boolean {
  if (!path) return false;
  const target = normalizePath(path);
  return features.some(
    (f) => f.paths.some((p) => normalizePath(p) === target) && isFeatureNew(f, seen, now),
  );
}

/** يسجّل أول ظهور لكل خدمة جديدة لم يُسجَّل لها ظهور بعد. يعيد null إن لم يتغير شيء. */
export function markFeaturesShown(
  seen: NewFeatureSeen,
  now: number,
  features: NewFeature[] = NEW_FEATURES,
): NewFeatureSeen | null {
  let next: NewFeatureSeen | null = null;
  for (const f of features) {
    if (!isFeatureNew(f, seen, now) || seen[f.key]?.firstShownAt) continue;
    next = next ?? { ...seen };
    next[f.key] = { ...seen[f.key], firstShownAt: now };
  }
  return next;
}

export function markFeatureOpened(seen: NewFeatureSeen, key: string, now: number): NewFeatureSeen | null {
  if (seen[key]?.openedAt) return null;
  return { ...seen, [key]: { ...seen[key], openedAt: now } };
}

export function parseNewFeatureSeen(raw: string | null): NewFeatureSeen {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const out: NewFeatureSeen = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (!v || typeof v !== "object") continue;
      const { firstShownAt, openedAt } = v as Record<string, unknown>;
      out[k] = {
        ...(typeof firstShownAt === "number" ? { firstShownAt } : {}),
        ...(typeof openedAt === "number" ? { openedAt } : {}),
      };
    }
    return out;
  } catch {
    return {};
  }
}
