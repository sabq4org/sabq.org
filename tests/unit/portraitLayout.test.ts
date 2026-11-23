import { describe, expect, it } from "vitest";
import { computePortraitLayout } from "@/lib/logoCanvas";

describe("computePortraitLayout", () => {
  it("يقص الصورة الطولية قصًّا نصفيًا من الأعلى حين لا يُعرف الوجه", () => {
    const { crop, drawnWidth } = computePortraitLayout(1214, 1600, null, 675);
    expect(crop.y).toBe(0);
    expect(crop.width / crop.height).toBeCloseTo(0.9, 5);
    expect(drawnWidth).toBe(Math.round(675 * 0.9));
  });

  it("يضع الوجه قرب ثلث القصّة العلوي ولا يخرج عن حدود الصورة", () => {
    const { crop } = computePortraitLayout(1000, 3000, { fx: 0.5, fy: 0.5 }, 675);
    const faceY = 0.5 * 3000;
    expect(faceY - crop.y).toBeCloseTo(crop.height * 0.38, 5);
    expect(crop.y + crop.height).toBeLessThanOrEqual(3000);

    const low = computePortraitLayout(1000, 3000, { fx: 0.5, fy: 1 }, 675);
    expect(low.crop.y + low.crop.height).toBeCloseTo(3000, 5);
  });

  it("لا يقص صورة أعرض من النسبة النصفية", () => {
    const { crop, drawnWidth } = computePortraitLayout(1000, 1000, { fx: 0.5, fy: 0.3 }, 675);
    expect(crop).toEqual({ x: 0, y: 0, width: 1000, height: 1000 });
    expect(drawnWidth).toBe(675);
  });
});
