// Branded-header strip renderer for the Apple Wallet press card.
//
// 2026-05-19 rev 4 — fundamental rethink after rev 3 user feedback:
//   • All user data (name, role, position, ID, expiry) was rendered
//     INSIDE the strip image at fixed pixel sizes. On the actual
//     Wallet display the canvas (1125×432 @3x) shrinks to ~375×144
//     points, so 18–34px source text became 6–11pt on screen — far
//     too small to read.
//   • Solution: stop rendering user data inside the strip. The strip
//     becomes a pure branded header (Sabq logo + "بطاقة صحفية رسمية"
//     tagline). All user data moves to native Wallet fields in
//     PressPassBuilder, which Apple sizes with SF Pro at proper
//     Dynamic Type sizes that the user can scale via Accessibility.
//   • Bonus: expiry date no longer "silently disappears" when
//     cardValidUntil is null — it just shows as an empty auxiliary
//     row that Wallet collapses, instead of being part of a fixed
//     image layout.

import { GlobalFonts, createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "fs";
import path from "path";

let arabicFontFamily = "sans-serif";

let fontsRegistered = false;
function registerFontsOnce() {
  if (fontsRegistered) return;
  const fontsDir = path.resolve(process.cwd(), "server/fonts");

  const candidates = [
    { file: "Cairo-Bold.ttf",             alias: "Cairo" },
    { file: "NotoSansArabic-Bold.ttf",    alias: "NotoArabic" },
    { file: "NotoSansArabic-Regular.ttf", alias: "NotoArabic" },
  ];

  for (const { file, alias } of candidates) {
    const full = path.join(fontsDir, file);
    if (fs.existsSync(full)) {
      try {
        GlobalFonts.registerFromPath(full, alias);
        arabicFontFamily = alias;
      } catch (e) {
        console.warn(`[PressCardImageRenderer] register font ${file}:`, e);
      }
    }
  }

  console.log(`[PressCardImageRenderer] arabic font family in use: ${arabicFontFamily}`);
  fontsRegistered = true;
}

const ACCENT = "#1CA4F0"; // Sabq sky-blue (matches web primary)
const INK = "#0F172A";    // Deep navy for the title
const WHITE = "#FFFFFF";

// Apple Wallet coupon strip dimensions. @3x is the master we draw at;
// @2x and @1x are derived by downscaling so all densities stay sharp.
const W = 1125;
const H = 432;

function arabicFont(sizePx: number, bold: boolean = false): string {
  const weight = bold ? "bold " : "";
  return `${weight}${sizePx}px "${arabicFontFamily}", sans-serif`;
}

export async function renderPressCardStrip(): Promise<{ x1: Buffer; x2: Buffer; x3: Buffer }> {
  registerFontsOnce();

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // White background — clean, brand-consistent.
  ctx.fillStyle = WHITE;
  ctx.fillRect(0, 0, W, H);

  // ── Sabq logo (centered horizontally, anchored to the upper third)
  let logoBottomY = 90;
  try {
    const logoPath = path.resolve(process.cwd(), "public/branding/sabq-logo.png");
    if (fs.existsSync(logoPath)) {
      const logo = await loadImage(logoPath);
      const logoH = 200;
      const logoW = (logo.width / logo.height) * logoH;
      const logoX = (W - logoW) / 2;
      const logoY = 50;
      ctx.drawImage(logo, logoX, logoY, logoW, logoH);
      logoBottomY = logoY + logoH;
    }
  } catch (e) {
    console.warn("[PressCardImageRenderer] logo skipped:", e);
  }

  // ── Title: "بطاقة صحفية رسمية" — large, bold, centered ──────────
  try { (ctx as any).direction = "rtl"; } catch {}
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  const titleY = logoBottomY + 32;
  ctx.fillStyle = INK;
  ctx.font = arabicFont(68, true);
  ctx.fillText("بطاقة صحفية رسمية", W / 2, titleY);

  // ── Sky-blue accent underline beneath the title ─────────────────
  const underlineY = titleY + 92;
  const underlineW = 240;
  ctx.fillStyle = ACCENT;
  ctx.fillRect((W - underlineW) / 2, underlineY, underlineW, 6);

  // ── Export at three densities (Apple Wallet @1x, @2x, @3x) ──────
  const x3 = canvas.toBuffer("image/png");
  const c2 = createCanvas(Math.round(W * 2 / 3), Math.round(H * 2 / 3));
  c2.getContext("2d").drawImage(canvas, 0, 0, c2.width, c2.height);
  const x2 = c2.toBuffer("image/png");
  const c1 = createCanvas(Math.round(W / 3), Math.round(H / 3));
  c1.getContext("2d").drawImage(canvas, 0, 0, c1.width, c1.height);
  const x1 = c1.toBuffer("image/png");

  return { x1, x2, x3 };
}
