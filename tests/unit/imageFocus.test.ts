import { describe, expect, it } from "vitest";
import {
  buildFocusFromBoxes,
  computeFocusPlacement,
  DEFAULT_FOCUS_POSITION,
  heroCaptionShouldMoveBelow,
  legacyObjectPosition,
  parseFocusResponse,
  parseGeminiBox,
  readImageFocus,
} from "@shared/imageFocus";

// Real homepage samples from 2026-11-03 (faces from a face detector, 0..1 of the image).
const crownPrince = buildFocusFromBoxes({ faces: [{ x: 0.45, y: 0.3, w: 0.11, h: 0.22 }], iw: 1600, ih: 1188 })!;
const twoMinisters = buildFocusFromBoxes({
  faces: [
    { x: 0.09, y: 0.2, w: 0.3, h: 0.65 },
    { x: 0.6, y: 0.27, w: 0.26, h: 0.54 },
  ],
  iw: 1200,
  ih: 675,
})!;

function parse(pos: string) {
  const [x, y] = pos.split(" ").map((v) => parseFloat(v));
  return { x, y };
}

describe("buildFocusFromBoxes", () => {
  it("keeps the clearest face in x/y and the whole group in the box", () => {
    expect(twoMinisters.kind).toBe("group");
    expect(twoMinisters.x).toBeCloseTo(24, 0); // left (larger) face
    expect(twoMinisters.box!.x).toBeCloseTo(9, 0);
    expect(twoMinisters.box!.x + twoMinisters.box!.w).toBeCloseTo(86, 0);
  });

  it("falls back to the subject box and ignores tiny background faces", () => {
    const f = buildFocusFromBoxes({
      faces: [{ x: 0.2, y: 0.6, w: 0.02, h: 0.04 }],
      subject: { x: 0.3, y: 0.2, w: 0.4, h: 0.5 },
      iw: 1000,
      ih: 1000,
    })!;
    expect(f.kind).toBe("subject");
    expect(f.x).toBe(50);
    expect(f.y).toBe(45);
  });

  it("returns null when nothing was found", () => {
    expect(buildFocusFromBoxes({ faces: [], subject: null, iw: 10, ih: 10 })).toBeNull();
  });
});

describe("computeFocusPlacement", () => {
  it("hero: keeps the whole head (with shemagh) above the headline area", () => {
    const p = computeFocusPlacement(crownPrince, 900, 420, "hero");
    const { y } = parse(p.objectPosition);
    // visible window = 63% of the image height; head top must stay inside it
    const visH = 1600 / (900 / 420) / 1188;
    const top = (y / 100) * (1 - visH);
    const headTop = 0.3 - 0.6 * 0.22;
    expect(top).toBeLessThanOrEqual(headTop);
    expect(p.subjectBottom!).toBeLessThan(0.66);
    expect(heroCaptionShouldMoveBelow(crownPrince, 900 / 420)).toBe(false);
  });

  it("small square-ish card: shows one full face instead of two half faces", () => {
    const p = computeFocusPlacement(twoMinisters, 96, 80, "card");
    const { x } = parse(p.objectPosition);
    const visW = 96 / 80 / (1200 / 675);
    const left = (x / 100) * (1 - visW);
    // the left face (9%..39%) is fully inside the visible window
    expect(left).toBeLessThanOrEqual(0.09);
    expect(left + visW).toBeGreaterThanOrEqual(0.39);
  });

  it("no box: legacy position, and the old 50/50 guess becomes the upper third", () => {
    expect(computeFocusPlacement(null, 100, 100).objectPosition).toBe(DEFAULT_FOCUS_POSITION);
    expect(legacyObjectPosition({ x: 50, y: 50 })).toBe(DEFAULT_FOCUS_POSITION);
    expect(legacyObjectPosition({ x: 20, y: 70 })).toBe("20% 70%");
  });

  it("moves the hero caption below when the face sits low in the frame", () => {
    const lowFace = buildFocusFromBoxes({ faces: [{ x: 0.45, y: 0.7, w: 0.1, h: 0.25 }], iw: 1600, ih: 900 })!;
    expect(heroCaptionShouldMoveBelow(lowFace, 2.1)).toBe(true);
    expect(heroCaptionShouldMoveBelow({ ...lowFace, kind: "subject" }, 2.1)).toBe(false);
  });
});

describe("readImageFocus", () => {
  it("reads snake_case rows and drops a box without image size", () => {
    expect(readImageFocus({ image_focal_point: { x: 10, y: 20, box: { x: 1, y: 1, w: 5, h: 5 } } })).toEqual({ x: 10, y: 20 });
    expect(readImageFocus({ imageFocalPoint: null })).toBeNull();
    expect(readImageFocus({ imageFocalPoint: { x: "a", y: 2 } })).toBeNull();
  });
});

describe("Gemini response parsing", () => {
  it("converts [ymin,xmin,ymax,xmax] 0..1000 boxes", () => {
    expect(parseGeminiBox([300, 450, 520, 560])).toEqual({ x: 0.45, y: 0.3, w: expect.closeTo(0.11, 5), h: expect.closeTo(0.22, 5) });
    expect(parseGeminiBox([500, 500, 400, 600])).toBeNull();
    expect(parseGeminiBox("x")).toBeNull();
  });

  it("parses fenced JSON and skips bad boxes", () => {
    const r = parseFocusResponse('```json\n{"faces":[[300,450,520,560],[1,2]],"subject":null,"description":"man"}\n```');
    expect(r.faces).toHaveLength(1);
    expect(r.subject).toBeNull();
    expect(r.description).toBe("man");
  });
});
