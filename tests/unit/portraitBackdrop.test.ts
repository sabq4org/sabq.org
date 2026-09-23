import { describe, expect, it } from "vitest";
import { buildPortraitBackdrop } from "@/lib/logoCanvas";

const W = 4;
const H = 100;

function strip(pixel: (x: number, y: number) => [number, number, number]) {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [r, g, b] = pixel(x, y);
      const i = (y * W + x) * 4;
      data.set([r, g, b, 255], i);
    }
  }
  return data;
}

describe("buildPortraitBackdrop", () => {
  it("يمدّ لون خلفية الاستوديو المتجانسة ولا يعتبرها مزدحمة", () => {
    const maroon = strip(() => [70, 20, 30]);
    const { rows, busy } = buildPortraitBackdrop(maroon, maroon, W, H);
    expect(busy).toBe(false);
    expect(rows).toHaveLength(H);
    expect(rows[0]).toEqual([70, 20, 30]);
  });

  it("يتجاهل النصف السفلي (الكتفين) ويعتّمه تدريجياً", () => {
    // النصف السفلي أبيض كالثوب — يجب ألا يتسرب إلى الخلفية
    const s = strip((_, y) => (y < H / 2 ? [80, 40, 40] : [250, 250, 250]));
    const { rows, busy } = buildPortraitBackdrop(s, s, W, H);
    expect(busy).toBe(false);
    const bottom = rows[H - 1];
    expect(bottom[0]).toBeLessThan(80);
    expect(bottom[0]).toBeGreaterThan(40);
    expect(bottom[1]).toBeLessThanOrEqual(40);
  });

  it("يحافظ على تدرّج الاستوديو الرأسي", () => {
    const s = strip((_, y) => [Math.round(40 + y), 30, 30]);
    const { rows } = buildPortraitBackdrop(s, s, W, H);
    expect(rows[5][0]).toBeLessThan(rows[45][0]);
  });

  it("يستبدل الخلفية المزدحمة بلون محايد داكن", () => {
    const busyStrip = strip((x, y) => ((x + y) % 2 === 0 ? [240, 240, 240] : [10, 60, 120]));
    const { rows, busy } = buildPortraitBackdrop(busyStrip, busyStrip, W, H);
    expect(busy).toBe(true);
    for (const c of rows) expect(Math.max(...c)).toBeLessThan(60);
  });
});
