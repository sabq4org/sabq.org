import { afterEach, describe, expect, it, vi } from "vitest";
import { botSocialPublishSchema, botSocialSuggestSchema } from "../../shared/botSocial";
import {
  BotSocialError,
  assertArticleTweetable,
  authenticateBotSocialToken,
  decideCancelAction,
  decidePublishAction,
  decideScheduleAction,
  formatSuggestedText,
  isBotSocialConfigured,
  isUniqueViolation,
  loadBotSocialTokens,
  parseBotSocialArticleUrl,
  applySabqXMeasurementTags,
  resolveBotSocialCompose,
  resolveOriginalImageUrls,
  resolveOriginalPost,
} from "../../server/services/socialPublishing/botSocialLogic";

const SOCIAL = "social-secret-token-0123456789abcdef-XYZ";
const OTHER = "other-secret-token-0123456789abcdef-QWERTY";
const DRAFTS = "drafts-secret-token-0123456789abcdef-ABCD";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("bot social tokens", () => {
  it("accepts SABQ_BOT_SOCIAL_TOKEN and ignores the drafts token env", () => {
    vi.stubEnv("BOT_DRAFTS_API_TOKENS", `nashr-sabq:${DRAFTS}`);
    vi.stubEnv("BOT_SOCIAL_API_TOKENS", "");
    vi.stubEnv("SABQ_BOT_SOCIAL_TOKEN", SOCIAL);
    expect(isBotSocialConfigured()).toBe(true);
    expect(loadBotSocialTokens().map((bot) => bot.name)).toEqual(["nashr-x"]);
    expect(authenticateBotSocialToken(`Bearer ${SOCIAL}`)).toEqual({ name: "nashr-x" });
    expect(authenticateBotSocialToken(`Bearer ${DRAFTS}`)).toBeNull();
  });

  it("is not configured when only the drafts token is set", () => {
    vi.stubEnv("BOT_DRAFTS_API_TOKENS", `nashr-sabq:${DRAFTS}`);
    vi.stubEnv("SABQ_BOT_SOCIAL_TOKEN", "");
    vi.stubEnv("BOT_SOCIAL_API_TOKENS", "");
    expect(isBotSocialConfigured()).toBe(false);
    expect(authenticateBotSocialToken(`Bearer ${DRAFTS}`)).toBeNull();
  });

  it("parses named tokens and lets the first name win", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv(
      "BOT_SOCIAL_API_TOKENS",
      `nashr-x:${SOCIAL},broken,Bad Name:${OTHER},short:abc,nashr-x:${OTHER},desk-bot:${OTHER}`,
    );
    vi.stubEnv("SABQ_BOT_SOCIAL_TOKEN", "");
    const bots = loadBotSocialTokens();
    expect(bots.map((bot) => bot.name)).toEqual(["nashr-x", "desk-bot"]);
    expect(authenticateBotSocialToken(`Bearer ${OTHER}`)?.name).toBe("desk-bot");
  });

  it("rejects a missing or short bearer", () => {
    vi.stubEnv("SABQ_BOT_SOCIAL_TOKEN", SOCIAL);
    expect(authenticateBotSocialToken(undefined)).toBeNull();
    expect(authenticateBotSocialToken("Bearer short")).toBeNull();
    expect(authenticateBotSocialToken(SOCIAL)).toBeNull();
  });
});

describe("bot social replay decisions", () => {
  it("publish replays a posted tweet and reuses a failed one", () => {
    expect(decidePublishAction("published").action).toBe("replay");
    expect(decidePublishAction("failed").action).toBe("reuse");
    expect(decidePublishAction("draft").action).toBe("reuse");
    expect(decidePublishAction("scheduled").action).toBe("reuse");
    expect(decidePublishAction("processing")).toMatchObject({ action: "reject", code: "in_progress" });
    expect(decidePublishAction("canceled")).toMatchObject({ action: "reject", code: "canceled" });
  });

  it("schedule does not create a second tweet after publish", () => {
    expect(decideScheduleAction("published").action).toBe("replay");
    expect(decideScheduleAction("scheduled").action).toBe("reuse");
    expect(decideScheduleAction("canceled")).toMatchObject({ code: "canceled" });
  });

  it("cancel only proceeds for a scheduled post and replays a canceled one", () => {
    expect(decideCancelAction("scheduled").action).toBe("reuse");
    expect(decideCancelAction("canceled").action).toBe("replay");
    expect(decideCancelAction("published")).toMatchObject({ code: "not_cancelable" });
    expect(decideCancelAction("draft")).toMatchObject({ code: "not_cancelable" });
  });
});

describe("bot social compose", () => {
  const article = {
    title: "عنوان الخبر",
    url: "https://sabq.org/article/english-slug",
    imageUrl: "https://media.sabq.org/a.jpg",
  };

  it("counts an Arabic tweet plus the link as 23 for the URL", () => {
    const composed = resolveBotSocialCompose({
      article,
      body: { text: "مرحبا", textSource: "custom", includeLink: true, imageSource: "article" },
    });
    expect(composed.linkUrl).toBe(article.url);
    expect(composed.imageUrl).toBe(article.imageUrl);
    expect(composed.composedText).toBe(`مرحبا\n${article.url}`);
    expect(composed.weightedLength).toBe(5 + 1 + 23);
    expect(composed.valid).toBe(true);
    expect(composed.overStandard).toBe(false);
  });

  it("uses the title when textSource is title and omits the link by default", () => {
    const composed = resolveBotSocialCompose({
      article,
      body: { textSource: "title" },
    });
    expect(composed.text).toBe("عنوان الخبر");
    expect(composed.includeLink).toBe(false);
    expect(composed.linkUrl).toBeNull();
  });

  it("keeps the stored text when a retry omits text", () => {
    const composed = resolveBotSocialCompose({
      article,
      body: {},
      existing: {
        text: "النص المحفوظ",
        textSource: "ai",
        linkUrl: article.url,
        imageSource: "none",
        imageUrl: null,
      },
    });
    expect(composed.text).toBe("النص المحفوظ");
    expect(composed.textSource).toBe("ai");
    expect(composed.includeLink).toBe(true);
    expect(composed.imageSource).toBe("none");
  });

  it("still accepts an article tweet between 281 and the premium cap", () => {
    const composed = resolveBotSocialCompose({
      article,
      body: { text: "ا".repeat(281), textSource: "custom", includeLink: false, imageSource: "none" },
    });
    expect(composed.valid).toBe(true);
    expect(composed.overStandard).toBe(true);
    expect(composed.linkUrl).toBeNull();
    expect(() =>
      resolveBotSocialCompose({ article, body: { text: "ا".repeat(25000), includeLink: false } }),
    ).not.toThrow();
  });

  it("rejects an empty custom text and a text past the premium cap", () => {
    expect(() =>
      resolveBotSocialCompose({ article, body: { textSource: "custom", includeLink: false } }),
    ).toThrow(BotSocialError);
    expect(() =>
      resolveBotSocialCompose({ article, body: { text: "ا".repeat(25001), includeLink: false } }),
    ).toThrow(/25000/);
  });
});

describe("article tweet gate and helpers", () => {
  it("allows a published article and rejects anything else", () => {
    expect(() => assertArticleTweetable("published", new Date("2020-01-01T00:00:00Z"))).not.toThrow();
    expect(() => assertArticleTweetable("published", null)).not.toThrow();
    expect(() => assertArticleTweetable("draft", null)).toThrow(BotSocialError);
    expect(() => assertArticleTweetable("published", new Date("2999-01-01T00:00:00Z"))).toThrow(BotSocialError);
  });

  it("formats hashtags the same way as the dashboard dialog", () => {
    expect(formatSuggestedText("نص", ["سبق", "#دوري المحترفين"])).toBe("نص\n#سبق #دوري_المحترفين");
  });

  it("detects a postgres unique violation through a wrapped cause", () => {
    expect(isUniqueViolation({ cause: { code: "23505" } })).toBe(true);
    expect(isUniqueViolation(new Error("other"))).toBe(false);
  });
});

describe("article URL forms", () => {
  const arabic = "خبر-عاجل";

  it("accepts the short code, www, trailing slash, query, and fragment", () => {
    expect(parseBotSocialArticleUrl("https://sabq.org/article/jrdic6y")).toEqual({ slug: "jrdic6y", lang: "ar" });
    expect(parseBotSocialArticleUrl("https://www.sabq.org/article/jrdic6y/")).toEqual({ slug: "jrdic6y", lang: "ar" });
    expect(parseBotSocialArticleUrl("https://SABQ.org/article/jrdic6y?utm_source=x#top")).toEqual({
      slug: "jrdic6y",
      lang: "ar",
    });
    expect(parseBotSocialArticleUrl("http://www.sabq.org/article/jrdic6y/?ref=desk#section")).toEqual({
      slug: "jrdic6y",
      lang: "ar",
    });
  });

  it("decodes a percent-encoded Arabic slug", () => {
    const url = `https://sabq.org/article/${encodeURIComponent(arabic)}/?x=1`;
    expect(parseBotSocialArticleUrl(url)).toEqual({ slug: arabic, lang: "ar" });
  });

  it("rejects other hosts and non-article paths", () => {
    for (const url of [
      "https://example.com/article/jrdic6y",
      "https://api.sabq.org/article/jrdic6y",
      "https://sabq.org/news/jrdic6y",
      "not a url",
    ]) {
      try {
        parseBotSocialArticleUrl(url);
        throw new Error(`expected rejection for ${url}`);
      } catch (error) {
        expect(error).toBeInstanceOf(BotSocialError);
        expect(error).toMatchObject({ httpStatus: 400, code: "validation_error" });
      }
    }
  });

  it("rejects English and Urdu article links with unsupported_language", () => {
    const cases = [
      ["https://sabq.org/en/article/abc/", "en"],
      ["https://www.sabq.org/ur/article/xyz?x=1", "ur"],
    ] as const;
    for (const [url, lang] of cases) {
      try {
        parseBotSocialArticleUrl(url);
        throw new Error(`expected rejection for ${url}`);
      } catch (error) {
        expect(error).toBeInstanceOf(BotSocialError);
        expect(error).toMatchObject({ httpStatus: 422, code: "unsupported_language", details: { lang } });
      }
    }
  });

  it("requires articleId or articleUrl, and allows both for a later equality check", () => {
    expect(botSocialSuggestSchema.safeParse({}).success).toBe(false);
    expect(botSocialSuggestSchema.safeParse({ articleUrl: "https://sabq.org/article/jrdic6y" }).success).toBe(true);
    expect(botSocialPublishSchema.safeParse({
      articleId: "art-1",
      articleUrl: "https://sabq.org/article/jrdic6y",
      clientReference: "ref-1",
      text: "نص",
    }).success).toBe(true);
    expect(botSocialPublishSchema.safeParse({ clientReference: "ref-1", text: "نص" }).success).toBe(false);
    expect(botSocialPublishSchema.safeParse({
      kind: "original",
      clientReference: "ref-1",
      text: "شرح بلا خبر",
      imageUrls: ["https://media.sabq.org/a.png", "https://media.sabq.org/b.jpg"],
    }).success).toBe(true);
    expect(botSocialPublishSchema.safeParse({
      kind: "original",
      articleId: "art-1",
      clientReference: "ref-1",
      text: "شرح",
    }).success).toBe(false);
  });
});

describe("original post without an article", () => {
  it("rejects empty text and text over 2000 weighted characters", () => {
    expect(() => resolveOriginalPost({ body: { text: "   " }, contentId: "preview" })).toThrow(BotSocialError);
    expect(() => resolveOriginalPost({
      body: { text: "ا".repeat(2001) },
      contentId: "preview",
    })).toThrow(/2000/);
    try {
      resolveOriginalPost({ body: {}, contentId: "preview" });
      throw new Error("expected empty rejection");
    } catch (error) {
      expect(error).toMatchObject({ httpStatus: 400, code: "validation_error" });
    }
  });

  it("accepts 281 through 2000 weighted characters and keeps 280 as the fold signal", () => {
    const folded = resolveOriginalPost({ body: { text: "ا".repeat(281) }, contentId: "preview" });
    expect(folded.valid).toBe(true);
    expect(folded.overStandard).toBe(true);
    expect(folded.weightedLength).toBe(281);
    const full = resolveOriginalPost({ body: { text: "ا".repeat(2000) }, contentId: "preview" });
    expect(full.valid).toBe(true);
    expect(full.overStandard).toBe(true);
    expect(full.weightedLength).toBe(2000);
    expect(() => resolveOriginalPost({
      body: { text: "ا".repeat(2000), linkUrl: "https://sabq.org/guide" },
      contentId: "preview",
    })).toThrow(/2000/);
  });

  it("accepts one image and more than one image", () => {
    expect(resolveOriginalImageUrls({ imageUrl: "https://media.sabq.org/a.png" }, null)).toEqual([
      "https://media.sabq.org/a.png",
    ]);
    expect(resolveOriginalImageUrls({
      imageUrls: ["https://media.sabq.org/a.png", "https://media.sabq.org/b.jpg"],
    }, null)).toEqual([
      "https://media.sabq.org/a.png",
      "https://media.sabq.org/b.jpg",
    ]);
    expect(() => resolveOriginalImageUrls({
      imageUrl: "https://media.sabq.org/a.png",
      imageUrls: ["https://media.sabq.org/b.jpg"],
    }, null)).toThrow(BotSocialError);
  });

  it("stamps the four measurement params and drops other query values", () => {
    const tagged = applySabqXMeasurementTags(
      "http://www.sabq.org/guide?email=user@example.com&page=2&utm_source=bot#section",
      "post-1",
      "teachers",
    );
    const url = new URL(tagged);
    expect(url.protocol).toBe("https:");
    expect(url.hostname).toBe("www.sabq.org");
    expect(url.pathname).toBe("/guide");
    expect(url.hash).toBe("#section");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("utm_source")).toBe("x");
    expect(url.searchParams.get("utm_medium")).toBe("social");
    expect(url.searchParams.get("utm_campaign")).toBe("teachers");
    expect(url.searchParams.get("utm_content")).toBe("post-1");
    expect(url.searchParams.get("email")).toBeNull();
    expect([...url.searchParams.keys()].sort()).toEqual([
      "page",
      "utm_campaign",
      "utm_content",
      "utm_medium",
      "utm_source",
    ]);

    const composed = resolveOriginalPost({
      body: { text: "شرح", linkUrl: "https://sabq.org/services/water" },
      contentId: "preview",
    });
    const link = new URL(composed.linkUrl!);
    expect(link.searchParams.get("utm_source")).toBe("x");
    expect(link.searchParams.get("utm_medium")).toBe("social");
    expect(link.searchParams.get("utm_campaign")).toBe("sabqorg");
    expect(link.searchParams.get("utm_content")).toBe("preview");
    expect(composed.composedText).toContain(composed.linkUrl!);
  });

  it("allows a post with no link", () => {
    const composed = resolveOriginalPost({
      body: { text: "صورة ونص", imageUrl: "https://media.sabq.org/card.png" },
      contentId: "preview",
    });
    expect(composed.linkUrl).toBeNull();
    expect(composed.imageUrls).toEqual(["https://media.sabq.org/card.png"]);
    expect(composed.includeLink).toBe(false);
  });
});

describe("bot social markdown emphasis", () => {
  it("strips ** from an original post before it is stored or counted", () => {
    const composed = resolveOriginalPost({
      body: { text: "«إنفيديا» تطوّر **النجدية والحجازية**" },
      contentId: "preview",
    });
    expect(composed.text).toBe("«إنفيديا» تطوّر النجدية والحجازية");
    expect(composed.composedText).not.toContain("**");
  });
});
