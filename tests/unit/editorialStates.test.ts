import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EDITORIAL_ACTION_LABELS,
  EDITORIAL_FILTER_LABELS,
  EDITORIAL_STATE_LABELS,
  EDIT_REQUEST_OUTCOME_LABELS,
  EDIT_REQUEST_URGENT_LABEL,
  editorialState,
  editorialStateLabel,
} from "@shared/editorialStates";
import { MY_NEWS_STATUS_LABELS, latestEditRequestByArticle } from "@shared/mobileEditorial";
import { contributorArticleStatusLabel } from "../../client/src/lib/contributorArticleStatus";

const swift = readFileSync(
  join(__dirname, "../../sabq app ios/sabq/Services/EditorialStates.swift"),
  "utf8",
);

describe("unified editorial states", () => {
  it("puts the final state before the review state", () => {
    expect(editorialState({ status: "published", reviewStatus: "pending_review" })).toBe("published");
    expect(editorialState({ status: "scheduled", reviewStatus: "approved" })).toBe("scheduled");
    expect(editorialState({ status: "draft", reviewStatus: "needs_changes" })).toBe("needs_changes");
    expect(editorialState({ status: "draft", reviewStatus: "pending_review" })).toBe("pending");
    expect(editorialState({ status: "draft", reviewStatus: "approved" })).toBe("approved");
    expect(editorialState({ status: "draft", reviewStatus: "rejected" })).toBe("not_published");
    expect(editorialState({ status: "rejected" })).toBe("not_published");
    expect(editorialState({ status: "archived", reviewStatus: "needs_changes" })).toBe("archived");
    expect(editorialState({ status: "draft", reviewStatus: null })).toBe("draft");
  });

  it("uses the same words on the reporter web page and the mobile API", () => {
    expect(contributorArticleStatusLabel({ status: "published", reviewStatus: "pending_review" }).label).toBe("منشور");
    expect(contributorArticleStatusLabel({ status: "draft", reviewStatus: "needs_changes" }).label).toBe("يحتاج تعديلك");
    expect(MY_NEWS_STATUS_LABELS.needs_changes).toBe(EDITORIAL_STATE_LABELS.needs_changes);
    expect(MY_NEWS_STATUS_LABELS.pending).toBe(EDITORIAL_STATE_LABELS.pending);
    expect(editorialStateLabel({ status: "draft", reviewStatus: "pending_review" })).toBe("أُرسل للمراجعة");
  });

  it("keeps the iOS copy identical, letter for letter", () => {
    const all = [
      ...Object.values(EDITORIAL_STATE_LABELS),
      ...Object.values(EDITORIAL_FILTER_LABELS).filter((label) => label !== EDITORIAL_FILTER_LABELS.archived),
      ...Object.values(EDITORIAL_ACTION_LABELS),
      ...Object.values(EDIT_REQUEST_OUTCOME_LABELS),
      EDIT_REQUEST_URGENT_LABEL,
    ];
    for (const label of all) expect(swift).toContain(`"${label}"`);
  });

  it("picks the newest non-cancelled edit request per article", () => {
    const latest = latestEditRequestByArticle([
      { articleId: "a", status: "approved", createdAt: "2026-10-30T08:00:00.000Z" },
      { articleId: "a", status: "cancelled", createdAt: "2026-10-31T08:00:00.000Z" },
      { articleId: "a", status: "pending", createdAt: "2026-10-31T07:00:00.000Z" },
      { articleId: "b", status: "rejected", createdAt: "2026-10-29T08:00:00.000Z" },
      { articleId: "c", status: "cancelled", createdAt: "2026-10-29T08:00:00.000Z" },
    ]);
    expect(latest.get("a")?.status).toBe("pending");
    expect(latest.get("b")?.status).toBe("rejected");
    expect(latest.has("c")).toBe(false);
  });
});
