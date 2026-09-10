import { describe, expect, it } from "vitest";
import {
  articleMediaAssets,
  enSmartBlocks,
  insertEnSmartBlockSchema,
  insertArticleMediaAssetSchema,
  insertOpinionAuthorApplicationSchema,
  insertSmartBlockSchema,
  insertUrSmartBlockSchema,
  opinionAuthorApplications,
  sportsPoolMatchPicks,
  sportsPoolPlayerPicks,
  sportsPoolUserDivisions,
  sportsPoolWeeklyPoints,
  smartBlocks,
  urSmartBlocks,
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

    const driverValue = "2026-09-07 15:34:56.789+03";
    const mapped = (sportsPoolPlayerPicks.createdAt as any).mapFromDriverValue(driverValue);
    expect(mapped).toBeInstanceOf(Date);
    expect(mapped.toISOString()).toBe("2026-09-07T12:34:56.789Z");
    expect((sportsPoolPlayerPicks.createdAt as any).mapToDriverValue(mapped)).toBe(
      "2026-09-07T12:34:56.789Z",
    );
    expect(JSON.stringify({ createdAt: mapped })).toBe(
      '{"createdAt":"2026-09-07T12:34:56.789Z"}',
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

  it("matches the live bounded opinion identifier and status columns", () => {
    expect({
      id: {
        length: (opinionAuthorApplications.id as any).length,
        notNull: (opinionAuthorApplications.id as any).notNull,
        dataType: (opinionAuthorApplications.id as any).dataType,
      },
      status: {
        length: (opinionAuthorApplications.status as any).length,
        notNull: (opinionAuthorApplications.status as any).notNull,
        dataType: (opinionAuthorApplications.status as any).dataType,
      },
    }).toEqual({
      id: { length: 36, notNull: true, dataType: "string" },
      status: { length: 20, notNull: true, dataType: "string" },
    });
  });

  it("does not alter nullable production fields", () => {
    expect((articleMediaAssets.captionHtml as any).notNull).toBe(false);
    expect((opinionAuthorApplications.reviewedAt as any).notNull).toBe(false);
  });

  it("retains ORM input limits while production keeps its wider text columns", () => {
    const base = {
      title: "كتلة",
      keyword: "خبر",
      color: "#ffffff",
      placement: "above_footer",
      backgroundColor: "#" + "a".repeat(19),
    };
    expect(insertSmartBlockSchema.safeParse(base).success).toBe(true);
    expect(insertSmartBlockSchema.safeParse({ ...base, backgroundColor: "x".repeat(21) }).success).toBe(false);
  });

  it("matches all three live smart-block storage shapes and input contracts", () => {
    const liveColumns = [
      { table: smartBlocks, schema: insertSmartBlockSchema, backgroundLength: 20 },
      { table: enSmartBlocks, schema: insertEnSmartBlockSchema, backgroundLength: undefined },
      { table: urSmartBlocks, schema: insertUrSmartBlockSchema, backgroundLength: undefined },
    ] as const;
    const expected = {
      backgroundColor: { length: "varies" as const, notNull: false, hasDefault: false },
      sourceType: { length: undefined, notNull: true, hasDefault: true },
      subtitle: { length: undefined, notNull: false, hasDefault: false },
      playbook: { length: undefined, notNull: false, hasDefault: false },
    };

    for (const { table, schema, backgroundLength } of liveColumns) {
      for (const [name, contract] of Object.entries(expected)) {
        const column = (table as any)[name];
        expect({
          length: name === "backgroundColor" ? column.length ?? "varies" : column.length,
          notNull: column.notNull,
          hasDefault: column.hasDefault,
        }).toEqual({
          ...contract,
          length: name === "backgroundColor" ? backgroundLength ?? "varies" : contract.length,
        });
      }

      const base = {
        title: "كتلة",
        keyword: "خبر",
        color: "#ffffff",
        placement: "above_footer",
      };
      expect(schema.safeParse(base).success).toBe(true);
      expect(schema.safeParse({ ...base, sourceType: null }).success).toBe(false);
      expect(schema.safeParse({ ...base, subtitle: null, playbook: null, backgroundColor: null }).success).toBe(true);
      expect(schema.safeParse({ ...base, sourceType: "x".repeat(31) }).success).toBe(false);
      expect(schema.safeParse({ ...base, subtitle: "x".repeat(161) }).success).toBe(false);
      expect(schema.safeParse({ ...base, playbook: "x".repeat(61) }).success).toBe(false);
      expect(schema.safeParse({ ...base, backgroundColor: "x".repeat(21) }).success).toBe(false);
    }
  });
});
