import { describe, expect, it } from "vitest";
import { inferWriterFileKind, isWriterFileNew } from "@shared/opinionWriterFileKinds";

describe("writer files kind + new badge", () => {
  it("infers the kind from the title", () => {
    expect(inferWriterFileKind("محضر اجتماع كتّاب الرأي")).toBe("minutes");
    expect(inferWriterFileKind("تعميم: مواعيد النشر")).toBe("circular");
    expect(inferWriterFileKind("دليل الأسلوب")).toBe("document");
  });
  it("is new for 14 days until opened", () => {
    const now = Date.parse("2026-11-24T10:00:00Z");
    expect(isWriterFileNew("2026-11-20T10:00:00Z", false, now)).toBe(true);
    expect(isWriterFileNew("2026-11-20T10:00:00Z", true, now)).toBe(false);
    expect(isWriterFileNew("2026-11-01T10:00:00Z", false, now)).toBe(false);
    expect(isWriterFileNew("bad", false, now)).toBe(false);
  });
});
