import { describe, it, expect } from "vitest";
import { insertArticleSchema, updateArticleSchema } from "@shared/schema";

describe("Article isReading Flag", () => {
  it("allows omitting isReading and treats it as falsy in insert schema", () => {
    const parsed = insertArticleSchema.safeParse({
      title: "عنوان الخبر التجريبي لقراءة سبق",
      slug: "test-reading-slug-1",
      content: "<p>محتوى المقال الكامل للاختبار</p>",
      categoryId: "general-news",
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.isReading ?? false).toBe(false);
    }
  });

  it("accepts isReading: true when specified by editor in insert schema", () => {
    const parsed = insertArticleSchema.safeParse({
      title: "عنوان مادة قراءة معمقة من سبق",
      slug: "test-reading-slug-2",
      content: "<p>محتوى قراءة تحليلية معمقة</p>",
      categoryId: "investigations",
      isReading: true,
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.isReading).toBe(true);
    }
  });

  it("accepts isReading: false explicitly in insert schema", () => {
    const parsed = insertArticleSchema.safeParse({
      title: "عنوان خبر عادي",
      slug: "test-reading-slug-3",
      content: "<p>محتوى عادي</p>",
      categoryId: "general-news",
      isReading: false,
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.isReading).toBe(false);
    }
  });

  it("preserves isReading: true in updateArticleSchema", () => {
    const parsed = updateArticleSchema.safeParse({
      isReading: true,
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.isReading).toBe(true);
    }
  });

  it("preserves isReading: false in updateArticleSchema", () => {
    const parsed = updateArticleSchema.safeParse({
      isReading: false,
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.isReading).toBe(false);
    }
  });
});
