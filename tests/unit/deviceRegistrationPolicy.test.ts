import { describe, expect, it } from "vitest";
import {
  ALLOWED_MEMBER_PUSH_BUNDLE_IDS,
  GULF_CUP_BUNDLE_ID,
  SABQ_DESK_BUNDLE_ID,
  SABQ_READER_BUNDLE_ID,
  isAllowedMemberPushBundleId,
  normalizeDeviceLocale,
  resolveGenericDeviceRegistrationPolicy,
  sanitizeDeviceRegistrationBody,
  inferPushTransport,
  applyInferredDeviceTransport,
  applyInferredMemberPushTransport,
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

  it("accepts com.sabq.desk in the member push-token bundle allowlist", () => {
    expect(SABQ_DESK_BUNDLE_ID).toBe("com.sabq.desk");
    expect(SABQ_READER_BUNDLE_ID).toBe("com.sabq.sabqorg");
    expect(ALLOWED_MEMBER_PUSH_BUNDLE_IDS).toContain("com.sabq.desk");
    expect(isAllowedMemberPushBundleId("com.sabq.desk")).toBe(true);
    expect(isAllowedMemberPushBundleId("com.sabq.sabqorg")).toBe(true);
    expect(isAllowedMemberPushBundleId("com.unknown.malicious")).toBe(false);
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

describe("inferPushTransport (Android omits platform/provider)", () => {
  const fcmToken = `cAbC123:APA91b${"x".repeat(140)}`;
  const apnsToken = "a".repeat(64);

  it("treats the Android Play bundle as FCM even when the body says nothing", () => {
    expect(inferPushTransport({ token: fcmToken, bundleId: "com.sabqorg.sabq" }))
      .toEqual({ platform: "android", provider: "fcm" });
  });

  it("overrides a wrong ios default for an Android bundle", () => {
    expect(inferPushTransport({ token: fcmToken, bundleId: "com.sabqorg.sabq.dev", platform: "ios", provider: "apns" }))
      .toEqual({ platform: "android", provider: "fcm" });
  });

  it("keeps explicit iOS values for the iOS reader", () => {
    expect(inferPushTransport({ token: apnsToken, bundleId: "com.sabq.sabqorg", platform: "ios", provider: "apns" }))
      .toBeNull();
  });

  it("infers from token shape when nothing else is known", () => {
    expect(inferPushTransport({ token: apnsToken })).toEqual({ platform: "ios", provider: "apns" });
    expect(inferPushTransport({ token: fcmToken })).toEqual({ platform: "android", provider: "fcm" });
    expect(inferPushTransport({ token: "short" })).toBeNull();
  });

  it("completes a half-specified body", () => {
    expect(inferPushTransport({ token: fcmToken, platform: "android" })).toEqual({ platform: "android", provider: "fcm" });
    expect(inferPushTransport({ token: apnsToken, provider: "apns" })).toEqual({ platform: "ios", provider: "apns" });
  });

  it("rewrites the route bodies in place", () => {
    const device: Record<string, unknown> = { deviceToken: fcmToken, bundleId: "com.sabqorg.sabq" };
    applyInferredDeviceTransport(device);
    expect(device).toMatchObject({ platform: "android", tokenProvider: "fcm" });

    const member: Record<string, unknown> = { token: fcmToken, bundleId: "com.sabqorg.sabq" };
    applyInferredMemberPushTransport(member);
    expect(member).toMatchObject({ platform: "android", provider: "fcm" });

    const ios: Record<string, unknown> = { token: apnsToken, bundleId: "com.sabq.sabqorg" };
    applyInferredMemberPushTransport(ios);
    expect(ios).toMatchObject({ platform: "ios", provider: "apns" });
  });
});
