import { describe, expect, it } from "vitest";
import {
  buildWatchQuery,
  detectWatchType,
  isNewerTweetId,
  newestTweetId,
} from "../../server/services/radar/xProvider";

describe("detectWatchType", () => {
  it("detects an X handle", () => {
    expect(detectWatchType("@spagov")).toBe("account");
    expect(detectWatchType(" @SaudiNews50 ")).toBe("account");
  });

  it("detects a hashtag (Arabic included)", () => {
    expect(detectWatchType("#الهلال")).toBe("hashtag");
  });

  it("detects an advanced query by its operators", () => {
    expect(detectWatchType("from:spagov OR from:KSAmofa")).toBe("query");
    expect(detectWatchType("زلزال lang:ar")).toBe("query");
  });

  it("falls back to keyword for plain text", () => {
    expect(detectWatchType("رؤية 2030")).toBe("keyword");
    // نص فيه @ لكنه ليس حسابًا صالحًا (مسافة بعده)
    expect(detectWatchType("@ حساب")).toBe("keyword");
  });
});

describe("buildWatchQuery", () => {
  it("turns an account watch into a from: query without the @", () => {
    expect(buildWatchQuery("account", "@spagov")).toBe("from:spagov");
  });

  it("ensures the # prefix and excludes retweets for hashtags", () => {
    expect(buildWatchQuery("hashtag", "الهلال")).toBe("#الهلال -is:retweet");
    expect(buildWatchQuery("hashtag", "#الهلال")).toBe("#الهلال -is:retweet");
  });

  it("quotes multi-word keyword phrases for exact matching", () => {
    expect(buildWatchQuery("keyword", "رؤية 2030")).toBe('"رؤية 2030" -is:retweet');
    expect(buildWatchQuery("keyword", "نيوم")).toBe("نيوم -is:retweet");
  });

  it("passes advanced queries through untouched", () => {
    const raw = "(نيوم OR ذا لاين) lang:ar -is:retweet";
    expect(buildWatchQuery("query", raw)).toBe(raw);
  });
});

describe("tweet id cursor (snowflake ordering)", () => {
  it("compares ids numerically via length then lexicographically", () => {
    expect(isNewerTweetId("100", "99")).toBe(true); // أطول = أحدث
    expect(isNewerTweetId("1900000000000000002", "1900000000000000001")).toBe(true);
    expect(isNewerTweetId("1900000000000000001", "1900000000000000002")).toBe(false);
  });

  it("picks the newest id and ignores non-numeric guids", () => {
    expect(
      newestTweetId([{ id: "1900000000000000001" }, { id: "trend:الهلال" }, { id: "99" }])
    ).toBe("1900000000000000001");
    expect(newestTweetId([])).toBeUndefined();
  });
});
