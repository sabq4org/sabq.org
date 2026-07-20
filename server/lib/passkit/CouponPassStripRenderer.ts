// Strip renderer for the Sabq Plus voucher coupon in Apple Wallet.
//
// Coupon layout without a strip leaves a cramped field grid above a
// huge QR (value stuck in a tiny header). Same lesson as the press
// card: bake the hero typography into strip.png so we control size
// and hierarchy. Native fields below the strip stay minimal
// (code + expiry) so the barcode has room.

import { GlobalFonts, createCanvas } from "@napi-rs/canvas";
import fs from "fs";
import path from "path";

let arabicFontFamily = "sans-serif";
let fontsRegistered = false;

function registerFontsOnce() {
  if (fontsRegistered) return;
  const fontsDir = path.resolve(process.cwd(), "server/fonts");
  const candidates = [
    { file: "Cairo-Bold.ttf", alias: "Cairo" },
    { file: "NotoSansArabic-Regular.ttf", alias: "NotoArabic" },
    { file: "NotoSansArabic-Bold.ttf", alias: "NotoArabic" },
    { file: "IBMPlexSansArabic-Regular.ttf", alias: "IBMPlexSansArabic" },
    { file: "IBMPlexSansArabic-SemiBold.ttf", alias: "IBMPlexSansArabic" },
    { file: "IBMPlexSansArabic-Bold.ttf", alias: "IBMPlexSansArabic" },
  ];

  for (const { file, alias } of candidates) {
    const full = path.join(fontsDir, file);
    if (fs.existsSync(full)) {
      try {
        GlobalFonts.registerFromPath(full, alias);
        arabicFontFamily = alias;
      } catch (e) {
        console.warn(`[CouponPassStripRenderer] register font ${file}:`, e);
      }
    }
  }

  console.log(`[CouponPassStripRenderer] arabic font family: ${arabicFontFamily}`);
  fontsRegistered = true;
}

type RenderInput = {
  valueLabel: string;
  partnerName: string;
};

// Coupon strip @3x (Apple: 375×144 pt → 1125×432 px).
const W = 1125;
const H = 432;

const NAVY = "#0D1B2A";
const NAVY_MID = "#14344E";
const ACCENT = "#1793E8";
const INK = "#EAF3FB";
const INK_SOFT = "#8FB8D8";
const LINE_HEIGHT = 1.3;

function arabicFont(sizePx: number, bold = false): string {
  return `${bold ? "bold " : ""}${sizePx}px "${arabicFontFamily}", sans-serif`;
}

function fitFontSize(
  ctx: { font: string; measureText: (t: string) => { width: number } },
  text: string,
  maxWidth: number,
  startSize: number,
  minSize: number,
  bold = true,
): number {
  let size = startSize;
  ctx.font = arabicFont(size, bold);
  while (ctx.measureText(text).width > maxWidth && size > minSize) {
    size -= 4;
    ctx.font = arabicFont(size, bold);
  }
  return size;
}

function drawAtmosphere(ctx: ReturnType<ReturnType<typeof createCanvas>["getContext"]>) {
  // Deep navy base + soft Sabq-blue glow — brand atmosphere without
  // competing with the value text (no photos, no stickers).
  ctx.fillStyle = NAVY;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W * 0.78, H * 0.2, 20, W * 0.78, H * 0.2, W * 0.55);
  glow.addColorStop(0, "rgba(23, 147, 232, 0.34)");
  glow.addColorStop(0.55, "rgba(20, 52, 78, 0.45)");
  glow.addColorStop(1, "rgba(13, 27, 42, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const glow2 = ctx.createRadialGradient(W * 0.12, H * 0.9, 10, W * 0.12, H * 0.9, W * 0.4);
  glow2.addColorStop(0, "rgba(23, 147, 232, 0.16)");
  glow2.addColorStop(1, "rgba(13, 27, 42, 0)");
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, W, H);

  // Faint overlapping circles — quiet depth, not a collage.
  ctx.save();
  ctx.strokeStyle = "rgba(143, 184, 216, 0.12)";
  ctx.lineWidth = 2;
  const rings = [
    { x: W * 0.9, y: H * 0.15, r: 160 },
    { x: W * 0.9, y: H * 0.15, r: 240 },
    { x: W * 0.08, y: H * 0.85, r: 120 },
    { x: W * 0.08, y: H * 0.85, r: 190 },
  ];
  for (const { x, y, r } of rings) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  // Thin top accent rule in Sabq blue.
  ctx.fillStyle = ACCENT;
  ctx.fillRect(0, 0, W, 6);

  // Soft bottom fade into the field/barcode zone.
  const fade = ctx.createLinearGradient(0, H - 48, 0, H);
  fade.addColorStop(0, "rgba(13, 27, 42, 0)");
  fade.addColorStop(1, NAVY_MID);
  ctx.fillStyle = fade;
  ctx.fillRect(0, H - 48, W, 48);
}

export async function renderCouponPassStrip(input: RenderInput): Promise<{
  x1: Buffer;
  x2: Buffer;
  x3: Buffer;
}> {
  registerFontsOnce();

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  drawAtmosphere(ctx);

  try {
    (ctx as { direction?: string }).direction = "rtl";
  } catch {
    /* canvas direction is best-effort */
  }

  const padX = 64;
  const maxW = W - padX * 2;
  const value = (input.valueLabel || "").trim() || "—";
  const partner = (input.partnerName || "").trim() || "شريك سبق بلس";

  // Tagline — small, not competing with the value.
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const tagSize = 26;
  ctx.font = arabicFont(tagSize, false);
  ctx.fillStyle = INK_SOFT;
  ctx.fillText("قسيمة سبق بلس", W / 2, 36);

  // Hero value — the reason the pass exists (10% / 5.00 ر.س).
  const valueSize = fitFontSize(ctx, value, maxW, 118, 64, true);
  const valueLineH = valueSize * LINE_HEIGHT;
  const partnerSize = fitFontSize(ctx, partner, maxW, 42, 28, true);
  const partnerLineH = partnerSize * LINE_HEIGHT;
  const blockGap = 18;
  const blockH = valueLineH + blockGap + partnerLineH;

  const contentTop = 36 + tagSize * LINE_HEIGHT + 28;
  const contentBottom = H - 36;
  const blockTop = contentTop + Math.max(0, (contentBottom - contentTop - blockH) / 2);

  ctx.font = arabicFont(valueSize, true);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText(value, W / 2, blockTop, maxW);

  ctx.font = arabicFont(partnerSize, true);
  ctx.fillStyle = INK;
  ctx.fillText(partner, W / 2, blockTop + valueLineH + blockGap, maxW);

  const x3 = canvas.toBuffer("image/png");
  const c2 = createCanvas(Math.round((W * 2) / 3), Math.round((H * 2) / 3));
  c2.getContext("2d").drawImage(canvas, 0, 0, c2.width, c2.height);
  const x2 = c2.toBuffer("image/png");
  const c1 = createCanvas(Math.round(W / 3), Math.round(H / 3));
  c1.getContext("2d").drawImage(canvas, 0, 0, c1.width, c1.height);
  const x1 = c1.toBuffer("image/png");

  return { x1, x2, x3 };
}
