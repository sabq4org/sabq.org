import { describe, expect, it, vi } from "vitest";
vi.mock("../../server/db", () => ({ db: {} }));
import { isEligibleBotPushDevice, validateBotPushRequest, BotEditorPushError } from "../../server/services/botEditorPush";

describe("bot editor push audience and input", () => {
  const device = { platform: "ios", bundleId: "com.sabq.sabqorg", locale: "ar-SA", tokenProvider: "apns", breaking: true };
  it("admits only the reader app, matching locale and enabled breaking preference", () => {
    expect(isEligibleBotPushDevice(device, "ar")).toBe(true);
    expect(isEligibleBotPushDevice({ ...device, breaking: false }, "ar")).toBe(false);
    expect(isEligibleBotPushDevice({ ...device, locale: null }, "ar")).toBe(false);
    expect(isEligibleBotPushDevice({ ...device, locale: "en" }, "ar")).toBe(false);
    expect(isEligibleBotPushDevice({ ...device, locale: "en-US" }, "en")).toBe(true);
    expect(isEligibleBotPushDevice({ ...device, tokenProvider: "fcm" }, "ar")).toBe(false);
    expect(isEligibleBotPushDevice({ ...device, bundleId: "com.sabq.sports" }, "ar")).toBe(false);
    expect(isEligibleBotPushDevice({ ...device, platform: "android", tokenProvider: "fcm", bundleId: "com.sabqorg.sabq" }, "ar")).toBe(true);
  });
  it("rejects unexpected request fields and malformed ids", () => {
    expect(() => validateBotPushRequest("ar", "abc-1", {})).not.toThrow();
    expect(() => validateBotPushRequest("ar", "../x", {})).toThrow(BotEditorPushError);
    expect(() => validateBotPushRequest("ar", "abc", { title: "override" })).toThrow(BotEditorPushError);
  });
});
