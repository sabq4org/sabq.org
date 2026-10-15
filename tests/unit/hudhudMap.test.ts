import { describe, expect, it } from "vitest";
import { buildHudhudStyleUrl, isHudhudPublishableKey } from "../../client/src/lib/hudhudMap";
import { escapeNewsMapHtml, newsMapMarkerRadius } from "../../client/src/lib/newsMapMarkers";

describe("isHudhudPublishableKey", () => {
  it("يقبل مفتاح الواجهة فقط", () => {
    expect(isHudhudPublishableKey("pk_abc")).toBe(true);
    expect(isHudhudPublishableKey(" sk_secret ")).toBe(false);
    expect(isHudhudPublishableKey("")).toBe(false);
  });
});

describe("buildHudhudStyleUrl", () => {
  it("يبني رابط الأسلوب بلا تسريب إن غاب المفتاح", () => {
    expect(buildHudhudStyleUrl({ apiKey: "" })).toBeNull();
    const url = buildHudhudStyleUrl({
      apiKey: "pk_test",
      mapId: "default",
      variant: "dark",
      lang: "ar",
    });
    expect(url).toBe(
      "https://b.hudhud.sa/v1/maps/styles/default?variant=dark&lang=ar&api_key=pk_test",
    );
  });
});

describe("news map helpers", () => {
  it("يهرب HTML في النوافذ المنبثقة", () => {
    expect(escapeNewsMapHtml(`<img src="x" onerror="alert(1)">`)).not.toContain("<img");
  });

  it("يكبّر الدبوس مع عدد الأخبار", () => {
    expect(newsMapMarkerRadius(1)).toBeLessThan(newsMapMarkerRadius(8));
  });
});
