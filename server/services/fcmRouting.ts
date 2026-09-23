export const SABQ_ANDROID_BUNDLE_IDS = new Set([
  "com.sabqorg.sabq",
  "com.sabqorg.sabq.dev",
]);

export type FcmProfile = "default" | "sabq";

export interface FcmTarget {
  token: string;
  bundleId?: string | null;
}

/**
 * Existing unlabelled tokens stay on the legacy/default Firebase project.
 * Only tokens that explicitly identify the native SABQ app move to the
 * dedicated SABQ Firebase credentials. This makes the migration additive and
 * avoids breaking currently installed VARA and pre-migration SABQ builds.
 */
export function resolveFcmProfile(bundleId?: string | null): FcmProfile {
  return bundleId && SABQ_ANDROID_BUNDLE_IDS.has(bundleId) ? "sabq" : "default";
}

export function groupFcmTargetsByProfile(
  targets: FcmTarget[],
): Map<FcmProfile, FcmTarget[]> {
  const grouped = new Map<FcmProfile, FcmTarget[]>();
  for (const target of targets) {
    const profile = resolveFcmProfile(target.bundleId);
    const group = grouped.get(profile) ?? [];
    group.push(target);
    grouped.set(profile, group);
  }
  return grouped;
}
