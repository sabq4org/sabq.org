/** Bundle marker reserved for the authenticated Gulf Cup token endpoint. */
export const GULF_CUP_BUNDLE_ID = "com.sabq.gulfcup";

export interface GenericDeviceRegistrationPolicyInput {
  sessionUserId?: string | null;
  /** Accepted only to make the trust boundary explicit; never consulted. */
  untrustedBodyUserId?: unknown;
  requestedBundleId?: unknown;
  existingBundleId?: string | null;
}

export interface GenericDeviceRegistrationPolicy {
  /** Generic registration ownership is derived only from the Bearer session. */
  effectiveUserId: string | null;
  /** Safe value for new rows and same-bundle deactivation. */
  safeBundleId?: string;
  /** Explicit update; null clears a stale/supplied sensitive marker. */
  bundleIdUpdate?: string | null;
}

/**
 * Security boundary for the public `/devices/register` route.
 *
 * Body `userId` is deliberately not a trust input: callers cannot claim
 * another account. Likewise the Majlis marker can only be written through the
 * authenticated `/members/push-token` route. A generic guest re-registration
 * also clears a stale Majlis marker left on the same physical FCM token.
 */
export function resolveGenericDeviceRegistrationPolicy(
  input: GenericDeviceRegistrationPolicyInput,
): GenericDeviceRegistrationPolicy {
  const candidate = typeof input.requestedBundleId === "string"
    ? input.requestedBundleId.trim()
    : "";
  const requested = candidate.length > 0 && candidate.length <= 255
    ? candidate
    : undefined;
  const safeBundleId = requested !== GULF_CUP_BUNDLE_ID ? requested : undefined;

  let bundleIdUpdate: string | null | undefined;
  if (safeBundleId !== undefined) {
    bundleIdUpdate = safeBundleId;
  } else if (requested === GULF_CUP_BUNDLE_ID) {
    // Never grant the sensitive marker from the generic request body, even
    // when a valid member session is attached.
    bundleIdUpdate = null;
  } else if (
    input.existingBundleId === GULF_CUP_BUNDLE_ID &&
    !input.sessionUserId
  ) {
    // Anonymous re-registration after logout must strip stale membership.
    bundleIdUpdate = null;
  }

  return {
    // `untrustedBodyUserId` is intentionally ignored.
    effectiveUserId: input.sessionUserId ?? null,
    safeBundleId,
    bundleIdUpdate,
  };
}

/** Column widths of `push_devices` (shared/schema.ts). */
const LOCALE_MAX = 10;
const TOKEN_PROVIDER_MAX = 10;
const PLATFORM_MAX = 20;

/**
 * Shrinks a BCP-47 tag to fit `push_devices.locale` (varchar 10).
 *
 * Android sends `Locale.toLanguageTag()`, which carries extensions such as
 * `ar-SA-u-nu-latn` or `ar-SA-u-ca-islamic`. Those overflowed the column and
 * the insert failed with "value too long", so the device got no pushes. Only
 * language (+ script/region) matters for delivery; extensions are dropped.
 */
export function normalizeDeviceLocale(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const tag = value.trim().replace(/_/g, "-");
  if (!tag) return undefined;
  const parts = tag.split("-");
  const kept = [parts[0]];
  for (const part of parts.slice(1)) {
    // Script (Latn) or region (SA / 419). A singleton like `u` starts extensions.
    if (!/^([A-Za-z]{4}|[A-Za-z]{2}|\d{3})$/.test(part)) break;
    if ([...kept, part].join("-").length > LOCALE_MAX) break;
    kept.push(part);
  }
  const result = kept.join("-");
  return result.length > 0 && result.length <= LOCALE_MAX ? result : undefined;
}

/**
 * Makes a `/devices/register` body safe for the `push_devices` varchar
 * columns. Oversized optional values are dropped so the route falls back to
 * its own defaults instead of failing the whole registration.
 */
export function sanitizeDeviceRegistrationBody(body: unknown): void {
  if (!body || typeof body !== "object") return;
  const b = body as Record<string, unknown>;
  for (const key of ["language", "locale"] as const) {
    if (b[key] === undefined || b[key] === null) continue;
    const normalized = normalizeDeviceLocale(b[key]);
    if (normalized === undefined) delete b[key];
    else b[key] = normalized;
  }
  if (b.tokenProvider !== undefined &&
      (typeof b.tokenProvider !== "string" || b.tokenProvider.length === 0 ||
       b.tokenProvider.length > TOKEN_PROVIDER_MAX)) {
    delete b.tokenProvider;
  }
  if (b.platform !== undefined &&
      (typeof b.platform !== "string" || b.platform.length === 0 ||
       b.platform.length > PLATFORM_MAX)) {
    delete b.platform;
  }
}
