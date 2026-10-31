import { describe, expect, it } from "vitest";
import { reporterArticleBucket } from "../../client/src/lib/contributorArticleStatus";

describe("reporterArticleBucket", () => {
  it("puts final states before review state (publish keeps reviewStatus)", () => {
    expect(reporterArticleBucket({ status: "published", reviewStatus: "pending_review" })).toBe("pub");
    expect(reporterArticleBucket({ status: "scheduled", reviewStatus: "pending_review" })).toBe("sch");
    expect(reporterArticleBucket({ status: "archived", reviewStatus: "needs_changes" })).toBe("arch");
  });
  it("splits drafts by review state", () => {
    expect(reporterArticleBucket({ status: "draft", reviewStatus: "needs_changes" })).toBe("fix");
    expect(reporterArticleBucket({ status: "draft", reviewStatus: "pending_review" })).toBe("rev");
    expect(reporterArticleBucket({ status: "draft", reviewStatus: null })).toBe("draft");
    expect(reporterArticleBucket({ status: "rejected" })).toBe("draft");
  });
});
