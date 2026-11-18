import { describe, expect, it } from "vitest";
import { botEditorEditSchema, botEditorVisibilitySchema } from "../../shared/botEditorWrites";

describe("privileged editorial input", () => {
  it("rejects source identity and state changes in content edits", () => {
    for (const field of ["source", "sourceMetadata", "status"]) {
      expect(botEditorEditSchema.safeParse({ title: "عنوان صالح", [field]: "x" }).success).toBe(false);
    }
  });
  it("accepts a generated patch while rejecting unsafe image URLs", () => {
    expect(botEditorEditSchema.safeParse({ imageUrl: "https://example.com/a.jpg", isAiGeneratedImage: true }).success).toBe(true);
    expect(botEditorEditSchema.safeParse({ imageUrl: "http://example.com/a.jpg" }).success).toBe(false);
  });
  it("accepts a correction reason and validates display weight", () => {
    expect(botEditorEditSchema.safeParse({ updateReason: "reason" }).success).toBe(true);
    expect(botEditorVisibilitySchema.safeParse({ displayOrder: -1 }).success).toBe(false);
    expect(botEditorVisibilitySchema.safeParse({ displayOrder: 1 }).success).toBe(true);
    expect(botEditorVisibilitySchema.safeParse({ specialSections: ["featured"], isFeatured: true }).success).toBe(false);
    expect(botEditorVisibilitySchema.safeParse({ specialSections: ["featured", "reading"] }).success).toBe(true);
  });
});
