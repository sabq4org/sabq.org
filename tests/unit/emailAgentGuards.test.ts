import { describe, expect, it } from "vitest";
import {
  buildEmailImagesHtml,
  buildSenderReply,
  evaluateSenderAuth,
  matchDetectedCategory,
  pickFallbackCategory,
  redactEmailTokens,
  selectEditorialCategories,
  resolveSenderToken,
  senderAuthEnforced,
  shouldOcrAttachedImages,
  wantsNewspaperByline,
} from "../../server/services/emailAgentGuards";
import { buildContentDedupKey, normalizeEmailSubject } from "../../server/services/emailAgentDedup";

const TOKEN = "ab12".repeat(16);

describe("redactEmailTokens", () => {
  it("removes the publish token in every accepted format", () => {
    expect(redactEmailTokens(`خبر عاجل [TOKEN:${TOKEN}]`)).toBe("خبر عاجل [TOKEN]");
    expect(redactEmailTokens(`TOKEN: ${TOKEN.toUpperCase()} نص`)).toBe("[TOKEN] نص");
    expect(redactEmailTokens(`نص ${TOKEN} نص`)).toBe("نص [TOKEN] نص");
    expect(redactEmailTokens("بلا رمز")).toBe("بلا رمز");
    expect(redactEmailTokens(null)).toBe("");
  });
});

describe("resolveSenderToken", () => {
  it("keeps a well-formed token and replaces anything weaker", () => {
    expect(resolveSenderToken(TOKEN.toUpperCase())).toBe(TOKEN);
    for (const weak of ["1234", "", undefined, "z".repeat(64), 5]) {
      const generated = resolveSenderToken(weak);
      expect(generated).toMatch(/^[a-f0-9]{64}$/);
      expect(generated).not.toBe(weak);
    }
  });
});

describe("evaluateSenderAuth", () => {
  it("is unknown when the provider sent no check results", () => {
    expect(evaluateSenderAuth({ fromEmail: "r@gmail.com" })).toBe("unknown");
  });
  it("passes on a DKIM signature aligned with the sender domain", () => {
    expect(evaluateSenderAuth({ fromEmail: "r@gmail.com", dkim: "{@gmail.com : pass}", spf: "fail" })).toBe("pass");
    expect(evaluateSenderAuth({ fromEmail: "r@news.spa.gov.sa", dkim: "{@spa.gov.sa : pass}" })).toBe("pass");
  });
  it("passes on SPF only when the envelope domain matches the sender domain", () => {
    expect(
      evaluateSenderAuth({ fromEmail: "r@agency.sa", spf: "pass", dkim: "none", envelope: '{"from":"bounce@agency.sa"}' }),
    ).toBe("pass");
  });
  it("fails a forged From: SPF passes for the attacker's own domain only", () => {
    expect(
      evaluateSenderAuth({
        fromEmail: "r@gmail.com",
        spf: "pass",
        dkim: "{@evil.example : pass}",
        envelope: '{"from":"x@evil.example"}',
      }),
    ).toBe("fail");
    expect(evaluateSenderAuth({ fromEmail: "r@gmail.com", spf: "softfail", dkim: "none" })).toBe("fail");
    // نطاق ينتهي بنفس الأحرف ليس نطاقًا فرعيًا
    expect(evaluateSenderAuth({ fromEmail: "r@gmail.com", dkim: "{@notgmail.com : pass}" })).toBe("fail");
  });
  it("only holds auto-publish when explicitly enforced", () => {
    expect(senderAuthEnforced({})).toBe(false);
    expect(senderAuthEnforced({ EMAIL_AGENT_SENDER_AUTH: "Enforce" })).toBe(true);
  });
});

describe("wantsNewspaperByline", () => {
  it("needs an explicit hashtag or a standalone line", () => {
    expect(wantsNewspaperByline("خبر #سبق", "")).toBe(true);
    expect(wantsNewspaperByline("", "نص الخبر\n#صحيفة")).toBe(true);
    expect(wantsNewspaperByline("", "نص الخبر\nصحيفة سبق\n")).toBe(true);
    expect(wantsNewspaperByline("", "نص\nسبق.\n")).toBe(true);
  });
  it("ignores the word inside a sentence", () => {
    expect(wantsNewspaperByline("الوزارة: سبق أن أعلنا الموعد", "وكان قد سبق للهيئة أن أوضحت لصحيفة سبق")).toBe(false);
    expect(wantsNewspaperByline("خبر عادي", "نص عادي")).toBe(false);
  });
});

describe("shouldOcrAttachedImages", () => {
  it("reads images only when the written text is short", () => {
    expect(shouldOcrAttachedImages(`[TOKEN:${TOKEN}]`)).toBe(true);
    expect(shouldOcrAttachedImages("عنوان قصير")).toBe(true);
    expect(shouldOcrAttachedImages("كلمة ".repeat(80))).toBe(false);
  });
});

describe("buildSenderReply", () => {
  it("never echoes the token and carries the article link", () => {
    const reply = buildSenderReply(`افتتاح المشروع [TOKEN:${TOKEN}]`, {
      kind: "published",
      title: "افتتاح <المشروع>",
      url: "https://sabq.org/article/abc1234",
    });
    expect(reply.subject).toBe("تم النشر: افتتاح المشروع");
    expect(`${reply.subject}${reply.text}${reply.html}`).not.toContain(TOKEN);
    expect(reply.text).toContain("https://sabq.org/article/abc1234");
    expect(reply.html).toContain('href="https://sabq.org/article/abc1234"');
    expect(reply.html).toContain("افتتاح &lt;المشروع&gt;");
  });
  it("explains a rejection and a failure", () => {
    expect(buildSenderReply("x", { kind: "rejected", reason: "invalid_token" }).text).toContain("رمز النشر");
    expect(buildSenderReply("x", { kind: "rejected", reason: "other" }).text).toContain("تعذّر قبول الرسالة");
    expect(buildSenderReply("x", { kind: "failed" }).text).toContain("أعد إرسالها");
    expect(buildSenderReply("x", { kind: "draft", title: "ع", note: "سبب" }).text).toContain("سبب");
  });
});

describe("pickFallbackCategory", () => {
  it("prefers محليات over an arbitrary first category", () => {
    const cats = [{ nameAr: "رياضة", slug: "sports" }, { nameAr: "محليات", slug: "mahalliyat" }];
    expect(pickFallbackCategory(cats)?.nameAr).toBe("محليات");
    expect(pickFallbackCategory([{ nameAr: "رياضة" }])?.nameAr).toBe("رياضة");
    expect(pickFallbackCategory([])).toBeNull();
  });
});

describe("dedup fingerprint ignores the token", () => {
  it("gives the same key with the token, without it, and after redaction", () => {
    const plain = buildContentDedupKey("r@gmail.com", normalizeEmailSubject("افتتاح المشروع"));
    for (const subject of [`افتتاح المشروع [TOKEN:${TOKEN}]`, `افتتاح المشروع ${TOKEN}`, "افتتاح المشروع [TOKEN]"]) {
      expect(buildContentDedupKey("r@gmail.com", normalizeEmailSubject(subject))).toBe(plain);
    }
  });
});

describe("redaction keeps the dedup fingerprint stable", () => {
  const hex = "9f3c71ab04de52c88a16b7e0d4f2a95c6031be7d8c40af1952e6d0b37a84c1f2";
  it.each([`خبر [token:${hex}]`, `خبر [${hex}]`, `خبر [TOKEN: ${hex} ]`, `خبر TOKEN:${hex}`, `خبر ${hex}`])(
    "%s",
    async (subject) => {
      const { normalizeEmailSubject } = await import("../../server/services/emailAgentDedup");
      const redacted = redactEmailTokens(subject);
      expect(redacted).toBe("خبر [TOKEN]");
      expect(normalizeEmailSubject(redacted)).toBe(normalizeEmailSubject(subject));
    },
  );
});

describe("token rotation and expiry", () => {
  const now = new Date("2026-11-16T12:00:00Z");
  const current = "a".repeat(64);
  const previous = "b".repeat(64);

  it("accepts the current token, case-insensitively", async () => {
    const { evaluateSenderToken } = await import("../../server/services/emailAgentGuards");
    expect(evaluateSenderToken(current.toUpperCase(), { token: current }, now)).toBe("valid");
    expect(evaluateSenderToken(null, { token: current }, now)).toBe("invalid");
    expect(evaluateSenderToken("c".repeat(64), { token: current }, now)).toBe("invalid");
  });

  it("rejects an expired current token with its own verdict", async () => {
    const { evaluateSenderToken } = await import("../../server/services/emailAgentGuards");
    expect(evaluateSenderToken(current, { token: current, tokenExpiresAt: new Date("2026-11-16T11:59:00Z") }, now)).toBe("expired");
    expect(evaluateSenderToken(current, { token: current, tokenExpiresAt: "2027-11-16T00:00:00Z" }, now)).toBe("valid");
  });

  it("accepts the previous token only inside its grace window", async () => {
    const { evaluateSenderToken } = await import("../../server/services/emailAgentGuards");
    const sender = { token: current, previousToken: previous, previousTokenValidUntil: new Date("2026-11-17T00:00:00Z") };
    expect(evaluateSenderToken(previous, sender, now)).toBe("valid_previous");
    expect(evaluateSenderToken(previous, sender, new Date("2026-11-17T00:00:01Z"))).toBe("invalid");
    expect(evaluateSenderToken(previous, { token: current, previousToken: previous }, now)).toBe("invalid");
  });

  it("resolves the chosen expiry", async () => {
    const { resolveTokenExpiry, isTokenExpiryOption } = await import("../../server/services/emailAgentGuards");
    expect(resolveTokenExpiry("none", now)).toBeNull();
    expect(resolveTokenExpiry("6m", now)?.toISOString()).toBe("2027-05-16T12:00:00.000Z");
    expect(resolveTokenExpiry("1y", now)?.toISOString()).toBe("2027-11-16T12:00:00.000Z");
    expect(isTokenExpiryOption("2y")).toBe(false);
  });

  it("tells the sender when the token expired", () => {
    const reply = buildSenderReply("خبر", { kind: "rejected", reason: "token_expired" });
    expect(reply.text).toContain("انتهت صلاحية رمز النشر");
  });
});

describe("isReprocessableLog", () => {
  const base = { status: "failed", rejectionReason: "processing_interrupted", tokenVerified: true, trustedSenderId: "s1", articleId: null };
  it("allows only verified failures without an article", async () => {
    const { isReprocessableLog } = await import("../../server/services/emailAgentGuards");
    expect(isReprocessableLog(base)).toBe(true);
    expect(isReprocessableLog({ ...base, rejectionReason: "processing_error" })).toBe(true);
    expect(isReprocessableLog({ ...base, tokenVerified: false })).toBe(false);
    expect(isReprocessableLog({ ...base, articleId: "a1" })).toBe(false);
    expect(isReprocessableLog({ ...base, status: "rejected", rejectionReason: "invalid_token" })).toBe(false);
    expect(isReprocessableLog({ ...base, rejectionReason: "duplicate_content" })).toBe(false);
  });
});

describe("resolvePreviousTokenGrace", () => {
  const now = new Date("2026-11-16T12:00:00Z");
  it("gives 48 hours, capped at the old token's own expiry, and nothing to an expired token", async () => {
    const { resolvePreviousTokenGrace } = await import("../../server/services/emailAgentGuards");
    expect(resolvePreviousTokenGrace(null, now)?.toISOString()).toBe("2026-11-18T12:00:00.000Z");
    expect(resolvePreviousTokenGrace("2027-01-01T00:00:00Z", now)?.toISOString()).toBe("2026-11-18T12:00:00.000Z");
    expect(resolvePreviousTokenGrace("2026-11-17T00:00:00Z", now)?.toISOString()).toBe("2026-11-17T00:00:00.000Z");
    expect(resolvePreviousTokenGrace("2026-11-16T11:00:00Z", now)).toBeNull();
  });
});

// الأقسام كما على الإنتاج (11-27): كلها «visible»، و«محليات» أولها.
const PROD_CATEGORIES = [
  { id: "1", nameAr: "محليات", nameEn: "Saudi", slug: "saudi", status: "visible", isIfoxCategory: false },
  { id: "2", nameAr: "مناطق", nameEn: "Regions", slug: "regions", status: "visible", isIfoxCategory: false },
  { id: "3", nameAr: "مجتمع", nameEn: "Community", slug: "community", status: "visible", isIfoxCategory: false },
  { id: "4", nameAr: "رياضة", nameEn: "Sports", slug: "sports", status: "visible", isIfoxCategory: false },
  { id: "5", nameAr: "تقنية", nameEn: "Technology", slug: "technology", status: "visible", isIfoxCategory: false },
  { id: "6", nameAr: "العالم", nameEn: "World", slug: "world", status: "visible", isIfoxCategory: false },
  { id: "7", nameAr: "أرشيف قديم", nameEn: "Old", slug: "old", status: "inactive", isIfoxCategory: false },
  { id: "8", nameAr: "آي فوكس تقنية", nameEn: "iFox Tech", slug: "ifox-tech", status: "active", isIfoxCategory: true },
  { id: "9", nameAr: "داخلي", nameEn: "Internal", slug: "internal", status: "active", isIfoxCategory: false },
];

describe("selectEditorialCategories", () => {
  it("keeps visible and active sections, drops inactive and iFox", () => {
    expect(selectEditorialCategories(PROD_CATEGORIES).map((c) => c.id)).toEqual(["1", "2", "3", "4", "5", "6", "9"]);
  });
});

describe("matchDetectedCategory", () => {
  const usable = selectEditorialCategories(PROD_CATEGORIES);

  it("sends a sports story to رياضة, not محليات (the 11-19 → 11-27 bug)", () => {
    expect(matchDetectedCategory("رياضة", usable)?.id).toBe("4");
  });

  it("matches Arabic with or without ال, English names, slugs and quotes", () => {
    expect(matchDetectedCategory("الرياضة", usable)?.id).toBe("4");
    expect(matchDetectedCategory("«تقنية»", usable)?.id).toBe("5");
    expect(matchDetectedCategory("Sports", usable)?.id).toBe("4");
    expect(matchDetectedCategory("technology", usable)?.id).toBe("5");
    expect(matchDetectedCategory("عالم", usable)?.id).toBe("6");
  });

  it("returns null for a label with no section so the sender default / محليات fallback applies", () => {
    expect(matchDetectedCategory("صحة", usable)).toBeNull();
    expect(matchDetectedCategory("", usable)).toBeNull();
    expect(matchDetectedCategory(undefined, usable)).toBeNull();
  });

  it("never matches an excluded section", () => {
    expect(matchDetectedCategory("آي فوكس تقنية", usable)?.id).not.toBe("8");
  });
});

describe("buildEmailImagesHtml", () => {
  const a = "https://media.sabq.org/news/a/w1200.webp";
  const b = "https://media.sabq.org/news/b/w1200.webp";

  it("returns nothing without https images", () => {
    expect(buildEmailImagesHtml([], "عنوان")).toBe("");
    expect(buildEmailImagesHtml(["http://x/y.jpg", "/objects/z"], "عنوان")).toBe("");
  });

  it("one extra image becomes a normal editor image", () => {
    const html = buildEmailImagesHtml([a], "عنوان");
    expect(html).toContain(`<img src="${a}"`);
    expect(html).not.toContain("data-image-gallery");
  });

  it("several extra images become one album block the editor can parse", () => {
    const html = buildEmailImagesHtml([a, b], 'عنوان "مقتبس"');
    expect(html.startsWith('<div data-image-gallery=""')).toBe(true);
    const attr = /data-images="([^"]*)"/.exec(html)![1].replace(/&quot;/g, '"').replace(/&amp;/g, "&");
    expect(JSON.parse(attr)).toEqual([{ src: a, caption: "" }, { src: b, caption: "" }]);
    expect(html.match(/<img /g)).toHaveLength(2);
    expect(html).not.toContain('"مقتبس"');
  });
});
