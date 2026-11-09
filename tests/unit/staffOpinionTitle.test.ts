import { describe, expect, it } from "vitest";
import { normalizeOpinionTitle, staffOpinionTitleSchema } from "@shared/staffOpinionTitle";

describe("staff opinion title", () => {
  it("collapses whitespace, newlines and direction marks into one clean line", () => {
    expect(normalizeOpinionTitle("  عنوان\n  جديد‏   للمقال ")).toBe("عنوان جديد للمقال");
  });

  it("accepts a normal title and returns it normalized", () => {
    const parsed = staffOpinionTitleSchema.safeParse({ title: " الاقتصاد  بعد   النفط " });
    expect(parsed.success && parsed.data.title).toBe("الاقتصاد بعد النفط");
  });

  it("rejects a title that is too short after cleaning", () => {
    const parsed = staffOpinionTitleSchema.safeParse({ title: "  اب   " });
    expect(parsed.success).toBe(false);
  });

  it("rejects a title over 200 characters and unknown fields", () => {
    expect(staffOpinionTitleSchema.safeParse({ title: "ع".repeat(201) }).success).toBe(false);
    expect(staffOpinionTitleSchema.safeParse({ title: "عنوان صالح", slug: "x" }).success).toBe(false);
  });

  it("rejects a missing title", () => {
    expect(staffOpinionTitleSchema.safeParse({}).success).toBe(false);
  });
});
