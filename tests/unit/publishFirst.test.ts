import { afterEach, describe, expect, it, vi } from "vitest";
import * as publishFirst from "@shared/publishFirst";
import {
  PUBLISH_FIRST_FLAGS_DEFAULT,
  PUBLISH_FIRST_SUBTITLE_MAX,
  buildRevisionLogRow,
  editorialCategoryChoices,
  flagEnabledFromSetting,
  formatPublishFirstUpdateLine,
  formatPublishFirstUpdateLines,
  isAcceptableCategoryId,
  isPublishFirstAdmin,
  planContentRevision,
  stripClientOwnedPublishFirstTimestamps,
  validateBotDraftUpload,
} from "@shared/publishFirst";

const inserted: unknown[] = [];

vi.mock("../../server/db", () => ({
  db: {
    insert: () => ({
      values: (row: unknown) => ({
        returning: async () => {
          inserted.push(row);
          return [{ id: "saved-1", ...(typeof row === "object" && row ? row : {}) }];
        },
      }),
    }),
  },
}));

import { recordArticleRevision } from "../../server/services/publishFirstService";

afterEach(() => {
  inserted.length = 0;
});

describe("upload-time validation", () => {
  it("rejects a subtitle longer than 120 when the flag is on and lists valid slugs", () => {
    const subtitle = "س".repeat(PUBLISH_FIRST_SUBTITLE_MAX + 1);
    expect(validateBotDraftUpload({
      subtitle,
      categorySlug: "local",
      categoryResolved: true,
      categoryProvided: true,
      validationEnabled: true,
    })).toMatchObject({
      httpStatus: 422,
      code: "subtitle_too_long",
      details: { max: 120, length: 121 },
    });

    const unknown = validateBotDraftUpload({
      subtitle: "عنوان فرعي",
      categorySlug: "missing",
      categoryResolved: false,
      categoryProvided: true,
      validationEnabled: true,
      validSlugs: ["local", "sports"],
    });
    expect(unknown).toMatchObject({
      code: "category_not_found",
      details: { validSlugs: ["local", "sports"], categorySlug: "missing" },
    });
  });

  it("keeps the historical 300-character subtitle ceiling when validation is off and omits the slug list", () => {
    expect(validateBotDraftUpload({
      subtitle: "س".repeat(180),
      categorySlug: null,
      categoryResolved: true,
      categoryProvided: false,
      validationEnabled: false,
    })).toBeNull();
    const unknown = validateBotDraftUpload({
      subtitle: null,
      categorySlug: "missing",
      categoryResolved: false,
      categoryProvided: true,
      validationEnabled: false,
      validSlugs: ["local"],
    });
    expect(unknown?.code).toBe("category_not_found");
    expect(unknown?.details.validSlugs).toBeUndefined();
  });
});

describe("risk label is informational only", () => {
  it("exposes no sensitive publish gate, flag, or refusal message", () => {
    expect("decideSensitiveGate" in publishFirst).toBe(false);
    expect("SENSITIVE_PUBLISH_MESSAGE" in publishFirst).toBe(false);
    expect("sensitiveGate" in PUBLISH_FIRST_FLAGS_DEFAULT).toBe(false);
    expect(publishFirst.PUBLISH_FIRST_FLAG_KEYS).not.toHaveProperty("sensitiveGate");
  });

  it("recognizes admin by superuser role or wildcard permissions", () => {
    expect(isPublishFirstAdmin({ role: "admin" })).toBe(true);
    expect(isPublishFirstAdmin({ roles: ["system_admin"] })).toBe(true);
    expect(isPublishFirstAdmin({ permissions: ["*"] })).toBe(true);
    expect(isPublishFirstAdmin({ role: "editor", permissions: ["articles.publish"] })).toBe(false);
  });
});

describe("revision rows", () => {
  const now = new Date("2026-09-27T08:00:00.000Z");

  it("plans a published-article revision and persists previous values", async () => {
    const plan = planContentRevision({
      existingStatus: "published",
      existing: { title: "قديم", categoryId: "cat-old", riskLabel: "safe" },
      patch: { title: "جديد", categoryId: "cat-new", riskLabel: "sensitive" },
      updateReason: "تصحيح التصنيف",
      now,
      historyEnabled: true,
    });
    expect(plan?.changedFields).toEqual(["title", "categoryId", "riskLabel"]);
    expect(plan?.previousValues).toEqual({ title: "قديم", categoryId: "cat-old", riskLabel: "safe" });
    expect(plan?.contentChanged).toBe(true);
    expect(planContentRevision({
      existingStatus: "draft",
      existing: { title: "قديم" },
      patch: { title: "جديد" },
      now,
      historyEnabled: true,
    })).toBeNull();
    expect(planContentRevision({
      existingStatus: "published",
      existing: { title: "قديم" },
      patch: { title: "جديد" },
      now,
      historyEnabled: false,
    })).toBeNull();
    const changingRiskOnly = planContentRevision({
      existingStatus: "published",
      existing: { riskLabel: "safe" },
      patch: { riskLabel: "sensitive" },
      now,
      historyEnabled: true,
    });
    expect(changingRiskOnly?.contentChanged).toBe(false);

    const log = buildRevisionLogRow({
      articleId: "art-1",
      editorUserId: "ali",
      editorName: "علي",
      plan: plan!,
    });
    const saved = await recordArticleRevision({
      articleId: "art-1",
      editorUserId: "ali",
      editorName: "علي",
      plan: plan!,
    });
    expect(saved).toMatchObject({
      changedFields: log.changedFields,
      previousValues: log.previousValues,
      updateReason: "تصحيح التصنيف",
    });
  });
});

describe("public update line", () => {
  it("renders reasons in order with a Riyadh timestamp and skips empty reasons", () => {
    const lines = formatPublishFirstUpdateLines([
      { id: "a", updateReason: "تصحيح الرقم", createdAt: new Date("2026-09-27T09:30:00.000Z") },
      { id: "b", updateReason: "   ", createdAt: new Date("2026-09-27T10:00:00.000Z") },
      { id: "c", updateReason: "إضافة تصريح", createdAt: new Date("2026-09-27T12:15:00.000Z") },
    ]);
    expect(lines.map((line) => line.id)).toEqual(["a", "c"]);
    expect(lines[0].text.startsWith("تحديث: تصحيح الرقم — ")).toBe(true);
    expect(lines[0].text).toContain("2026");
    expect(lines[1].text.startsWith("تحديث: إضافة تصريح — ")).toBe(true);
    expect(lines[0].text < lines[1].text || lines[0].at < lines[1].at).toBe(true);
    const single = formatPublishFirstUpdateLine("تصحيح", new Date("2026-09-27T09:30:00.000Z"));
    expect(single).toContain("12:30");
    expect(single).toContain("سبتمبر");
  });
});

describe("server timestamps, flags, and category choices", () => {
  it("drops client timestamps and treats a missing flag row as enabled", () => {
    expect(stripClientOwnedPublishFirstTimestamps({
      title: "خبر",
      draftCreatedAt: "2000-01-01",
      correctedAt: "2000-01-01",
      verdictAt: "2000-01-01",
      publishedAt: "2026-09-27",
    })).toEqual({ title: "خبر", publishedAt: "2026-09-27" });
    expect(flagEnabledFromSetting(undefined)).toBe(true);
    expect(flagEnabledFromSetting({ enabled: false })).toBe(false);
    expect(PUBLISH_FIRST_FLAGS_DEFAULT).toEqual({
      validation: true,
      revisionHistory: true,
      updateLine: true,
    });
  });

  it("keeps the current category visible and accepts historical non-uuid ids", () => {
    const choices = editorialCategoryChoices([
      { id: "smart-1", type: "smart", status: "visible", name: "ذكي" },
      { id: "core-1", type: "core", status: "visible", name: "محليات" },
      { id: "season-1", type: "seasonal", status: "active", name: "موسم" },
      { id: "imported", type: "topic", status: "visible", name: "مستورد" },
      { id: "hidden", type: "core", status: "inactive", name: "مخفي" },
    ], "smart-1");
    expect(choices.map((row) => row.id)).toEqual(["smart-1", "core-1", "imported"]);
    expect(isAcceptableCategoryId("category-local")).toBe(true);
    expect(isAcceptableCategoryId("")).toBe(false);
    expect(isAcceptableCategoryId("has space")).toBe(false);
  });
});
