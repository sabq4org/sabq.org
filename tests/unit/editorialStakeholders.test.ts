import { describe, expect, it } from "vitest";
import {
  NEWSPAPER_REPORTER_ID,
  resolveArticleStakeholderIds,
} from "../../server/services/editorialStakeholderIds";

describe("resolveArticleStakeholderIds", () => {
  it("notifies the opinion author, not the CMS submitter (admin who entered the piece)", () => {
    expect(
      resolveArticleStakeholderIds({
        authorId: "writer-1",
        reporterId: null,
        submitterId: "admin-1",
      }),
    ).toEqual(["writer-1"]);
  });

  it("notifies the human reporter and author, never the submitter alongside them", () => {
    expect(
      resolveArticleStakeholderIds({
        authorId: "author-1",
        reporterId: "reporter-1",
        submitterId: "editor-1",
      }),
    ).toEqual(["reporter-1", "author-1"]);
  });

  it("falls back to submitter only when no human byline exists", () => {
    expect(
      resolveArticleStakeholderIds({
        authorId: null,
        reporterId: NEWSPAPER_REPORTER_ID,
        submitterId: "editor-1",
      }),
    ).toEqual(["editor-1"]);
  });

  it("excludes the acting editor/admin even if they are also the author", () => {
    expect(
      resolveArticleStakeholderIds(
        {
          authorId: "admin-1",
          reporterId: null,
          submitterId: "admin-1",
        },
        { excludeUserId: "admin-1" },
      ),
    ).toEqual([]);
  });

  it("keeps the writer when excluding the admin actor", () => {
    expect(
      resolveArticleStakeholderIds(
        {
          authorId: "writer-1",
          reporterId: null,
          submitterId: "admin-1",
        },
        { excludeUserId: "admin-1" },
      ),
    ).toEqual(["writer-1"]);
  });

  it("skips non-human newspaper / system accounts", () => {
    expect(
      resolveArticleStakeholderIds({
        authorId: "system",
        reporterId: "newspaper",
        submitterId: null,
      }),
    ).toEqual([]);
  });
});
