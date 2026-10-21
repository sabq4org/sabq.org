import { describe, expect, it } from "vitest";
import {
  GULF_CUP_BUNDLE_ID,
  normalizeDeviceLocale,
  resolveGenericDeviceRegistrationPolicy,
  sanitizeDeviceRegistrationBody,
} from "../../server/services/deviceRegistrationPolicy";

describe("generic device registration identity policy", () => {
  it("rejects forged account ownership and Majlis marker without Bearer", () => {
    // A body userId is visible only as untrusted input and cannot affect ownership.
    const policy = resolveGenericDeviceRegistrationPolicy({
      sessionUserId: null,
      untrustedBodyUserId: "victim-account",
      requestedBundleId: GULF_CUP_BUNDLE_ID,
    });

    expect(policy.effectiveUserId).toBeNull();
    expect(policy.safeBundleId).toBeUndefined();
    expect(policy.bundleIdUpdate).toBeNull();
  });

  it("clears stale account and Majlis ownership on logout to guest", () => {
    const existing = { userId: "account-a", bundleId: GULF_CUP_BUNDLE_ID, isActive: false };
    const policy = resolveGenericDeviceRegistrationPolicy({
      sessionUserId: null,
      existingBundleId: existing.bundleId,
    });
    const updated = {
      ...existing,
      userId: policy.effectiveUserId,
      bundleId: policy.bundleIdUpdate,
      isActive: true,
    };

    expect(updated).toEqual({ userId: null, bundleId: null, isActive: true });
  });

  it("uses only the authenticated session during an account switch", () => {
    const existingBundleId = GULF_CUP_BUNDLE_ID;
    const policy = resolveGenericDeviceRegistrationPolicy({
      sessionUserId: "account-b",
      untrustedBodyUserId: "victim-account",
      requestedBundleId: undefined,
      existingBundleId,
    });

    const afterGeneric = {
      userId: policy.effectiveUserId,
      bundleId: policy.bundleIdUpdate === undefined ? existingBundleId : policy.bundleIdUpdate,
      isActive: true,
    };
    expect(afterGeneric).toEqual({
      userId: "account-b",
      bundleId: GULF_CUP_BUNDLE_ID,
      isActive: true,
    });

    // DeviceRegistrationManager immediately follows the generic write with
    // authenticated /members/push-token, restoring the marker for account B.
    const afterAuthenticatedMemberWrite = {
      ...afterGeneric,
      bundleId: GULF_CUP_BUNDLE_ID,
    };
    expect(afterAuthenticatedMemberWrite).toEqual({
      userId: "account-b",
      bundleId: GULF_CUP_BUNDLE_ID,
      isActive: true,
    });
  });

  it("preserves an existing Majlis marker on authenticated cold start", () => {
    const policy = resolveGenericDeviceRegistrationPolicy({
      sessionUserId: "account-a",
      requestedBundleId: undefined,
      existingBundleId: GULF_CUP_BUNDLE_ID,
    });

    expect(policy.effectiveUserId).toBe("account-a");
    expect(policy.safeBundleId).toBeUndefined();
    expect(policy.bundleIdUpdate).toBeUndefined();
  });

  it("never grants Majlis marker from the generic body, even with Bearer", () => {
    const policy = resolveGenericDeviceRegistrationPolicy({
      sessionUserId: "account-a",
      requestedBundleId: GULF_CUP_BUNDLE_ID,
      existingBundleId: null,
    });

    expect(policy.effectiveUserId).toBe("account-a");
    expect(policy.safeBundleId).toBeUndefined();
    expect(policy.bundleIdUpdate).toBeNull();
  });

  it("preserves non-sensitive legacy bundle registrations", () => {
    const policy = resolveGenericDeviceRegistrationPolicy({
      sessionUserId: "account-a",
      requestedBundleId: "com.sabqorg.sabq",
    });

    expect(policy.safeBundleId).toBe("com.sabqorg.sabq");
    expect(policy.bundleIdUpdate).toBe("com.sabqorg.sabq");
  });
});

describe("device registration body sanitizing", () => {
  it("shrinks Android language tags with extensions to fit varchar(10)", () => {
    expect(normalizeDeviceLocale("ar-SA-u-nu-latn")).toBe("ar-SA");
    expect(normalizeDeviceLocale("ar-SA-u-ca-islamic")).toBe("ar-SA");
    expect(normalizeDeviceLocale("en_US")).toBe("en-US");
    expect(normalizeDeviceLocale("zh-Hans-CN")).toBe("zh-Hans-CN");
    expect(normalizeDeviceLocale("sr-Latn-RS-u-x")).toBe("sr-Latn-RS");
    expect(normalizeDeviceLocale("es-419")).toBe("es-419");
    expect(normalizeDeviceLocale("ar")).toBe("ar");
    expect(normalizeDeviceLocale("   ")).toBeUndefined();
    expect(normalizeDeviceLocale("abcdefghijklmnop")).toBeUndefined();
    expect(normalizeDeviceLocale(42)).toBeUndefined();
  });

  it("keeps every value it leaves in the body within the column widths", () => {
    const body: Record<string, unknown> = {
      deviceToken: "t",
      locale: "ar-SA-u-nu-latn",
      language: "en-GB-u-mu-celsius",
      tokenProvider: "firebase-cloud-messaging",
      platform: "android",
    };
    sanitizeDeviceRegistrationBody(body);
    expect(body).toEqual({
      deviceToken: "t",
      locale: "ar-SA",
      language: "en-GB",
      platform: "android",
    });
  });

  it("drops unusable values so the route defaults apply", () => {
    const body: Record<string, unknown> = {
      locale: "x".repeat(40),
      platform: "p".repeat(30),
      tokenProvider: "",
    };
    sanitizeDeviceRegistrationBody(body);
    expect(body).toEqual({});
    expect(() => sanitizeDeviceRegistrationBody(undefined)).not.toThrow();
  });
});
