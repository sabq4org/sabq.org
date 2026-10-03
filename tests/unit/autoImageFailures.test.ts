// Auto image generation — editor-facing failure messages.

import { describe, expect, it } from "vitest";
import { normalizeProviderError } from "../../server/ai/gateway/errors";
import { autoImageFailure } from "../../server/services/autoImageFailures";

// نص الخطأ كما سجّله الإنتاج في 2026-09-29 (Railway) بعد أن يلفّه generateImage في Error
const SPEND_CAP_ERROR =
  '{"error":{"code":429,"message":"Your project has exceeded its monthly spending cap. Please go to AI Studio at https://ai.studio/spend to manage your project spend cap.","status":"RESOURCE_EXHAUSTED"}}';

describe("autoImageFailure", () => {
  it("classifies the Gemini monthly spending cap as QUOTA_EXCEEDED", () => {
    expect(normalizeProviderError("gemini", "gemini-3-pro-image-preview", new Error(SPEND_CAP_ERROR)).code).toBe(
      "QUOTA_EXCEEDED",
    );
  });

  it("tells the editor to raise the spend cap, not to top up credit", () => {
    const { status, message } = autoImageFailure("QUOTA_EXCEEDED", SPEND_CAP_ERROR);
    expect(status).toBe(402);
    expect(message).toContain("سقف الإنفاق");
    expect(message).not.toContain("شحن الرصيد");
  });

  it("keeps the top-up message for a depleted balance", () => {
    const { message } = autoImageFailure("QUOTA_EXCEEDED", "Your prepayment credits are depleted.");
    expect(message).toContain("شحن الرصيد");
  });

  it("passes through Arabic provider messages when the code is unknown", () => {
    expect(autoImageFailure("MODEL_ERROR", "لم يُرجع النموذج صورة").message).toBe("لم يُرجع النموذج صورة");
  });

  it("falls back to the generic message", () => {
    expect(autoImageFailure(undefined, "boom")).toEqual({
      status: 500,
      message: "تعذّر توليد الصورة بسبب خطأ في خدمة التوليد. أعد المحاولة لاحقًا.",
    });
  });
});
