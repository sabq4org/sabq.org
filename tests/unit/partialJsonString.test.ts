// فك حقل نصي من JSON غير مكتمل أثناء البث (معاينة «تحرير وتوليد شامل» الحية).

import { describe, expect, it } from "vitest";
import { PartialStringFieldTracker, extractPartialJsonStringField } from "../../server/ai/partialJsonString";

describe("extractPartialJsonStringField", () => {
  it("يعيد null قبل بدء الحقل", () => {
    expect(extractPartialJsonStringField('{"qualityScore": 80, "optimized": {"title": "x"', "content", '"optimized"')).toBeNull();
    expect(extractPartialJsonStringField('{"issues": ["content"]', "content", '"optimized"')).toBeNull();
  });

  it("يفك القيمة الجزئية ثم يعلن الاكتمال عند علامة الإغلاق", () => {
    const partial = '{"optimized": {"title": "عنوان", "content": "<p>الهلال يفوز\\n';
    expect(extractPartialJsonStringField(partial, "content", '"optimized"')).toEqual({ value: "<p>الهلال يفوز\n", complete: false });
    const full = partial + 'على النصر</p>", "seoKeywords": []}}';
    expect(extractPartialJsonStringField(full, "content", '"optimized"')).toEqual({ value: "<p>الهلال يفوز\nعلى النصر</p>", complete: true });
  });

  it("يفك \\uXXXX ويؤجل الهروب المبتور للجولة التالية", () => {
    expect(extractPartialJsonStringField('"content": "\\u0633\\u0628\\u06', "content")).toEqual({ value: "سب", complete: false });
    expect(extractPartialJsonStringField('"content": "\\u0633\\u0628\\u0642"', "content")).toEqual({ value: "سبق", complete: true });
    expect(extractPartialJsonStringField('"content": "abc\\', "content")).toEqual({ value: "abc", complete: false });
  });

  it("لا يلتقط مفتاح content خارج optimized", () => {
    const raw = '{"suggestions": ["أضف content"], "optimized": {"content": "نص"}}';
    expect(extractPartialJsonStringField(raw, "content", '"optimized"')).toEqual({ value: "نص", complete: true });
  });
});

describe("PartialStringFieldTracker", () => {
  it("يعيد الجزء الجديد فقط مع كل دفعة ويتوقف بعد الاكتمال", () => {
    const t = new PartialStringFieldTracker("content", '"optimized"');
    let raw = '{"optimized": {"con';
    expect(t.next(raw)).toBeNull();
    raw += 'tent": "أهلاً';
    expect(t.next(raw)).toBe("أهلاً");
    raw += " وسهلاً";
    expect(t.next(raw)).toBe(" وسهلاً");
    expect(t.next(raw)).toBeNull();
    raw += '", "seoKeywords": []}}';
    expect(t.next(raw)).toBeNull();
    expect(t.isComplete).toBe(true);
    expect(t.next(raw + " ")).toBeNull();
  });
});
