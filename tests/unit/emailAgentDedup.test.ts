import { describe, expect, it } from "vitest";
import {
  buildContentDedupKey,
  buildMessageDedupKey,
  DEFAULT_CONTENT_DEDUP_HOURS,
  extractEmailAddress,
  getContentDedupHours,
  normalizeEmailSubject,
} from "../../server/services/emailAgentDedup";

describe("extractEmailAddress", () => {
  it("pulls the address from a display-name wrapper", () => {
    expect(extractEmailAddress('"Gazwan" <gazwanss@gmail.com>')).toBe("gazwanss@gmail.com");
  });

  it("lowercases a bare address", () => {
    expect(extractEmailAddress("GazwanSS@Gmail.com")).toBe("gazwanss@gmail.com");
  });
});

describe("normalizeEmailSubject", () => {
  it("strips repeated reply/forward prefixes and collapses spaces", () => {
    expect(normalizeEmailSubject("Re: Fwd:  ارتفاع   الصادرات 3.9%")).toBe(
      "ارتفاع الصادرات 3.9%",
    );
  });

  it("strips Arabic reply prefixes", () => {
    expect(normalizeEmailSubject("إعادة: ارتفاع الصادرات 3.9%")).toBe("ارتفاع الصادرات 3.9%");
  });
});

describe("buildMessageDedupKey", () => {
  it("prefers Message-ID when present", () => {
    expect(
      buildMessageDedupKey("<abc@mail.gmail.com>", "a@b.com", "subject", new Date("2026-07-26T08:00:00Z")),
    ).toBe("<abc@mail.gmail.com>");
  });

  it("falls back to sender+subject+minute when Message-ID is missing", () => {
    const key = buildMessageDedupKey(
      "",
      "Gazwan <gazwanss@gmail.com>",
      "ارتفاع الصادرات",
      new Date("2026-07-26T08:00:00Z"),
    );
    expect(key).toBe("gazwanss@gmail.com_ارتفاع الصادرات_2026-07-26T08:00");
  });
});

describe("buildContentDedupKey", () => {
  it("is stable across display-name / Re: noise — the 2026-07-26 resend case", () => {
    const a = buildContentDedupKey(
      '"Gazwan" <gazwanss@gmail.com>',
      "ارتفاع الصادرات 3.9% في مايو مدعومة بنمو النفطية 9.5...",
    );
    const b = buildContentDedupKey(
      "gazwanss@gmail.com",
      "Re: ارتفاع الصادرات 3.9% في مايو مدعومة بنمو النفطية 9.5...",
    );
    expect(a).toBe(b);
    expect(a.startsWith("content:")).toBe(true);
  });

  it("differs when the subject changes", () => {
    const a = buildContentDedupKey("a@b.com", "خبر أول");
    const b = buildContentDedupKey("a@b.com", "خبر ثانٍ");
    expect(a).not.toBe(b);
  });
});

describe("getContentDedupHours", () => {
  it("defaults to 6 hours", () => {
    const prev = process.env.EMAIL_AGENT_CONTENT_DEDUP_HOURS;
    delete process.env.EMAIL_AGENT_CONTENT_DEDUP_HOURS;
    expect(getContentDedupHours()).toBe(DEFAULT_CONTENT_DEDUP_HOURS);
    if (prev === undefined) delete process.env.EMAIL_AGENT_CONTENT_DEDUP_HOURS;
    else process.env.EMAIL_AGENT_CONTENT_DEDUP_HOURS = prev;
  });
});
