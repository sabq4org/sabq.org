import { describe, expect, it } from "vitest";
import { isStoryAutoMatchEnabled } from "../../server/services/storyAutoMatch";

describe("isStoryAutoMatchEnabled — الربط التلقائي للقصص", () => {
  it("متوقف افتراضيًا عند غياب المتغير", () => {
    expect(isStoryAutoMatchEnabled({})).toBe(false);
  });

  it("لا يعمل بقيم غير on", () => {
    expect(isStoryAutoMatchEnabled({ STORY_AUTO_MATCH: "true" })).toBe(false);
    expect(isStoryAutoMatchEnabled({ STORY_AUTO_MATCH: "off" })).toBe(false);
  });

  it("يعمل فقط مع on", () => {
    expect(isStoryAutoMatchEnabled({ STORY_AUTO_MATCH: "on" })).toBe(true);
    expect(isStoryAutoMatchEnabled({ STORY_AUTO_MATCH: " ON " })).toBe(true);
  });
});
