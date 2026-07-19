import { describe, expect, it } from "vitest";
import { isAvifFile } from "../../client/src/lib/browserImageTranscode";

describe("browser AVIF upload fallback", () => {
  it("recognizes AVIF from its MIME type", () => {
    const file = new File([new Uint8Array([1, 2, 3])], "image.bin", {
      type: "image/avif",
    });

    expect(isAvifFile(file)).toBe(true);
  });

  it("recognizes AVIF by extension when Safari omits the MIME type", () => {
    const file = new File([new Uint8Array([1, 2, 3])], "photo.AVIF");

    expect(isAvifFile(file)).toBe(true);
  });

  it("does not route regular image formats through the AVIF fallback", () => {
    const file = new File([new Uint8Array([1, 2, 3])], "photo.webp", {
      type: "image/webp",
    });

    expect(isAvifFile(file)).toBe(false);
  });
});
