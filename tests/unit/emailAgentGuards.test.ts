import { describe, expect, it } from "vitest";
import {
  buildSenderReply,
  evaluateSenderAuth,
  pickFallbackCategory,
  redactEmailTokens,
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
