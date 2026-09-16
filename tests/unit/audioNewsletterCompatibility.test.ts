import { describe, expect, it } from "vitest";
import { retiredAudioNewsletterPayload } from "../../server/routes/audioNewsletterCompatibility";

describe("retired audio newsletter compatibility", () => {
  it("keeps the legacy public list response shape empty", () => {
    expect(retiredAudioNewsletterPayload()).toEqual({
      newsletters: [],
      total: 0,
      categories: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      retired: true,
    });
  });
});
