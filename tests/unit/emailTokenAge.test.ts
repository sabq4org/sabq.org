import { describe, expect, it, vi } from "vitest";
import { describeTokenAge } from "../../client/src/components/communications/tokenAge";

// هذه الاختبارات تفترض مستخدمًا في الرياض؛ العرض يتبع منطقة الجهاز (displayTimeZone).
vi.mock("../../client/src/lib/displayTimeZone", () => ({
  RIYADH_TIME_ZONE: "Asia/Riyadh",
  displayTimeZone: () => "Asia/Riyadh",
}));

const now = new Date("2026-11-16T12:00:00Z");
const plain = (text: string) => text.replace(/[\u2066\u2069]/g, "");

describe("describeTokenAge", () => {
  it("falls back to the sender creation date for tokens issued before rotation existed", () => {
    const info = describeTokenAge({ createdAt: "2026-04-16T12:00:00Z" }, now);
    expect(info.tone).toBe("open");
    expect(info.percent).toBe(100);
    expect(plain(info.text)).toBe("بلا تاريخ انتهاء · عمره 214 يومًا");
  });

  it("shows age and expiry date while far from expiry", () => {
    const info = describeTokenAge(
      { createdAt: "2025-01-01T00:00:00Z", tokenCreatedAt: "2026-10-07T12:00:00Z", tokenExpiresAt: "2027-04-07T12:00:00Z" },
      now,
    );
    expect(info.tone).toBe("fresh");
    expect(plain(info.text)).toBe("عمره 40 يومًا · ينتهي في 2027-04-07");
    expect(info.percent).toBeGreaterThan(15);
    expect(info.percent).toBeLessThan(30);
  });

  it("warns inside the last 14 days", () => {
    const info = describeTokenAge(
      { createdAt: "2026-05-28T12:00:00Z", tokenCreatedAt: "2026-05-28T12:00:00Z", tokenExpiresAt: "2026-11-28T12:00:00Z" },
      now,
    );
    expect(info.tone).toBe("warning");
    expect(plain(info.text)).toBe("ينتهي بعد 12 يومًا · 2026-11-28");
  });

  it("marks an expired token", () => {
    const info = describeTokenAge({ createdAt: "2026-01-01T00:00:00Z", tokenExpiresAt: "2026-11-10T00:00:00Z" }, now);
    expect(info.tone).toBe("expired");
    expect(info.percent).toBe(100);
  });

  it("mentions the old token while its grace window is open", () => {
    const info = describeTokenAge(
      {
        createdAt: "2025-01-01T00:00:00Z",
        tokenCreatedAt: "2026-11-15T15:00:00Z",
        tokenExpiresAt: "2027-11-15T15:00:00Z",
        previousTokenValidUntil: "2026-11-17T15:00:00Z",
      },
      now,
    );
    expect(info.graceActive).toBe(true);
    expect(plain(info.text)).toBe("دُوّر اليوم · الرمز القديم يعمل حتى 2026-11-17 18:00");
  });
});
