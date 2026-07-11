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
