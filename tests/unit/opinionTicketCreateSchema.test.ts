import { describe, expect, it } from "vitest";
import { insertOpinionTicketSchema } from "../../shared/schema";

describe("insertOpinionTicketSchema", () => {
  it("accepts contributor inbound payload without writerId", () => {
    const parsed = insertOpinionTicketSchema.safeParse({
      title: "استفسار عن الموعد",
      message: "متى آخر موعد للإرسال؟",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.writerId).toBeUndefined();
  });

  it("accepts admin outbound payload with writerId", () => {
    const parsed = insertOpinionTicketSchema.safeParse({
      title: "تذكير بمقال الأسبوع",
      message: "نرجو إرسال المسودة قبل الخميس.",
      writerId: "user-abc",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.writerId).toBe("user-abc");
  });

  it("rejects short titles", () => {
    const parsed = insertOpinionTicketSchema.safeParse({
      title: "أب",
      message: "نص كافٍ",
      writerId: "user-abc",
    });
    expect(parsed.success).toBe(false);
  });
});
