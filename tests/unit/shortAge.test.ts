import { describe, expect, it } from "vitest";
import { expandShortAge } from "../../client/src/lib/shortAge";

describe("expandShortAge", () => {
  it("expands hour shorthand with correct Arabic number forms", () => {
    expect(expandShortAge("منذ 1س")).toBe("منذ ساعة");
    expect(expandShortAge("منذ 2س")).toBe("منذ ساعتين");
    expect(expandShortAge("منذ 5س")).toBe("منذ 5 ساعات");
    expect(expandShortAge("منذ 17س")).toBe("منذ 17 ساعة");
    expect(expandShortAge("17س")).toBe("منذ 17 ساعة");
  });
  it("expands day shorthand", () => {
    expect(expandShortAge("منذ 1ي")).toBe("منذ يوم");
    expect(expandShortAge("منذ 2ي")).toBe("منذ يومين");
    expect(expandShortAge("منذ 3ي")).toBe("منذ 3 أيام");
    expect(expandShortAge("منذ 14ي")).toBe("منذ 14 يومًا");
  });
  it("handles minutes, empty and unknown input", () => {
    expect(expandShortAge("دقائق")).toBe("منذ دقائق");
    expect(expandShortAge("منذ دقائق")).toBe("منذ دقائق");
    expect(expandShortAge("")).toBe("");
    expect(expandShortAge(null)).toBe("");
  });
});
