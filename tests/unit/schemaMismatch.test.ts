import { describe, expect, it } from "vitest";
import {
  articleMediaAssets,
  insertArticleMediaAssetSchema,
  insertOpinionAuthorApplicationSchema,
  opinionAuthorApplications,
  sportsPoolMatchPicks,
  sportsPoolPlayerPicks,
  sportsPoolUserDivisions,
  sportsPoolWeeklyPoints,
  updateArticleMediaAssetSchema,
} from "../../shared/schema";

const mediaAsset = {
  articleId: "article-1",
  locale: "ar" as const,
  displayOrder: 0,
  altText: "صورة الخبر",
  moderationStatus: "approved" as const,
};

const opinionApplication = {
  arabicName: "كاتب",
  englishName: "Writer",
  email: "writer@example.com",
  phone: "+966500000000",
  jobTitle: "كاتب رأي",
  city: "الرياض",
  profilePhotoUrl: "https://example.com/profile.jpg",
};

describe("production schema contract alignment", () => {
  it("keeps production timestamptz columns timezone-aware and serializes Date as ISO", () => {
    const timestampColumns = [
      sportsPoolPlayerPicks.createdAt,
      sportsPoolPlayerPicks.updatedAt,
      sportsPoolPlayerPicks.settledAt,
      sportsPoolMatchPicks.settledAt,
      sportsPoolMatchPicks.updatedAt,
      sportsPoolUserDivisions.computedAt,
      sportsPoolUserDivisions.updatedAt,
      sportsPoolWeeklyPoints.createdAt,
      sportsPoolWeeklyPoints.updatedAt,
      opinionAuthorApplications.reviewedAt,
      opinionAuthorApplications.createdAt,
    ];

    for (const column of timestampColumns) {
      expect((column as any).withTimezone).toBe(true);
      expect((column as any).getSQLType()).toBe("timestamp with time zone");
    }

    expect(new Date("2026-09-07T12:34:56.789Z").toISOString()).toBe(
      "2026-09-07T12:34:56.789Z",
    );
  });

  it("requires non-null media alt text while retaining the endpoint default", () => {
    expect(insertArticleMediaAssetSchema.safeParse(mediaAsset).success).toBe(true);
    expect(insertArticleMediaAssetSchema.safeParse({ ...mediaAsset, altText: null }).success).toBe(false);
    expect(updateArticleMediaAssetSchema.safeParse({ altText: "وصف" }).success).toBe(true);
    expect(updateArticleMediaAssetSchema.safeParse({ altText: null }).success).toBe(false);
  });

  it("keeps the opinion application photo URL non-null at the input boundary", () => {
    expect(insertOpinionAuthorApplicationSchema.safeParse(opinionApplication).success).toBe(true);
    expect(
      insertOpinionAuthorApplicationSchema.safeParse({ ...opinionApplication, profilePhotoUrl: null }).success,
    ).toBe(false);
  });

  it("does not alter nullable production fields", () => {
    expect((articleMediaAssets.captionHtml as any).notNull).toBe(false);
    expect((opinionAuthorApplications.reviewedAt as any).notNull).toBe(false);
  });
});
