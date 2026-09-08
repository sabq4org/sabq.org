import { describe, expect, it } from "vitest";
import { buildArticleAuthorPerson } from "../../server/utils/creatorSchema";

describe("article creator JSON-LD", () => {
  it("uses a verified staff slug for reporter profiles", () => {
    expect(buildArticleAuthorPerson("https://sabq.org", {
      reporterName: "كاتب الخبر",
      editorName: "",
      reporterId: "user-id",
      reporterStaffSlug: "staff-slug",
    })).toMatchObject({
      "@type": "Person",
      name: "كاتب الخبر",
      url: "https://sabq.org/reporter/staff-slug",
    });
  });

  it("uses the public author route when no staff profile exists", () => {
    expect(buildArticleAuthorPerson("https://sabq.org", {
      reporterName: "",
      editorName: "كاتب مستقل",
      authorId: "user-id",
    })).toMatchObject({
      "@type": "Person",
      name: "كاتب مستقل",
      url: "https://sabq.org/author/%D9%83%D8%A7%D8%AA%D8%A8%20%D9%85%D8%B3%D8%AA%D9%82%D9%84",
    });
  });

  it("represents an unbylined article as the publishing organization", () => {
    expect(buildArticleAuthorPerson("https://sabq.org", {
      reporterName: "",
      editorName: "",
    })).toMatchObject({
      "@type": "NewsMediaOrganization",
      name: "صحيفة سبق الإلكترونية",
      url: "https://sabq.org",
    });
  });

  it("recognizes the shorter corporate byline used by legacy articles", () => {
    expect(buildArticleAuthorPerson("https://sabq.org", {
      reporterName: "",
      editorName: "صحيفة سبق",
    })).toMatchObject({ "@type": "NewsMediaOrganization", name: "صحيفة سبق" });
  });
});
