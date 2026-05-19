// Name-first strip renderer for the Apple Wallet press card.
//
// 2026-05-19 rev 5 — feedback from rev 4:
//   • rev 4 moved ALL user data out of the strip and into Wallet
//     fields. Result on device: the name ended up in a tiny
//     primaryFields slot (barely visible) while the strip
//     prominently showed only the tagline "بطاقة صحفية رسمية".
//     User reaction: "الاسم غير ظاهر … تحت اللوقو عبارة بطاقة
//     صحفية رسمية!!! مو المفروض الاسم؟" — fair point.
//   • Additional bug: the headerField (الجهة) rendered as white
//     text overlaid on the white strip area near the logo,
//     making it look like a white smear on the logo.
//
// Solution: name goes back into the strip as the dominant visual
// element. Logo moves to the top-right corner (smaller). The
// "بطاقة صحفية رسمية" tagline becomes a tiny caption at the
// bottom — branding without competing with the name. The
// PressPassBuilder drops the headerField entirely.

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

type RenderInput = {
  userName: string;
};

const ACCENT = "#1CA4F0"; // Sabq sky-blue
const INK = "#0F172A";    // Deep navy for the name
const INK_SOFT = "#64748B";
const WHITE = "#FFFFFF";

// Apple Wallet coupon strip dimensions (@3x master).
const W = 1125;
const H = 432;

function arabicFont(sizePx: number, bold: boolean = false): string {
  const weight = bold ? "bold " : "";
  return `${weight}${sizePx}px "${arabicFontFamily}", sans-serif`;
}

// Auto-shrink the name to fit within maxWidth without truncation.
// Long Arabic names ("عبدالرحمن بن عبدالعزيز") would otherwise
// overflow the canvas and get visually clipped by Wallet.
function fitFontSize(
  ctx: any,
  text: string,
  maxWidth: number,
  startSize: number,
  minSize: number,
  bold: boolean = true,
): number {
  let size = startSize;
  ctx.font = arabicFont(size, bold);
  while (ctx.measureText(text).width > maxWidth && size > minSize) {
    size -= 4;
    ctx.font = arabicFont(size, bold);
  }
  return size;
}

export async function renderPressCardStrip(input: RenderInput): Promise<{ x1: Buffer; x2: Buffer; x3: Buffer }> {
  registerFontsOnce();

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // White background — clean, brand-consistent.
  ctx.fillStyle = WHITE;
  ctx.fillRect(0, 0, W, H);

  const padX = 60;
  const padTop = 36;

  // ── Sabq logo (top-right corner, modest size so it brands the
  //    card without competing with the name) ─────────────────────
  try {
    const logoPath = path.resolve(process.cwd(), "public/branding/sabq-logo.png");
    if (fs.existsSync(logoPath)) {
      const logo = await loadImage(logoPath);
      const logoH = 110;
      const logoW = (logo.width / logo.height) * logoH;
      ctx.drawImage(logo, W - padX - logoW, padTop, logoW, logoH);
    }
  } catch (e) {
    console.warn("[PressCardImageRenderer] logo skipped:", e);
  }

  // ── User name — dominant visual element, centered on the card ──
  try { (ctx as any).direction = "rtl"; } catch {}
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const nameMaxWidth = W - padX * 2;
  const nameSize = fitFontSize(ctx, input.userName, nameMaxWidth, 120, 64, true);
  ctx.font = arabicFont(nameSize, true);
  ctx.fillStyle = INK;
  ctx.fillText(input.userName, W / 2, H / 2 + 18);

  // ── Tagline (subtle, near bottom) — keeps the official-document
  //    feeling without stealing focus from the name. ─────────────
  ctx.textBaseline = "alphabetic";
  ctx.font = arabicFont(26, false);
  ctx.fillStyle = INK_SOFT;
  ctx.fillText("بطاقة صحفية رسمية", W / 2, H - 36);

  // ── Sky-blue accent rule between name and tagline (lightweight
  //    brand cue, doesn't add chrome). ────────────────────────────
  const ruleY = H - 78;
  const ruleW = 120;
  ctx.fillStyle = ACCENT;
  ctx.fillRect((W - ruleW) / 2, ruleY, ruleW, 4);

  // ── Export at three densities (Apple Wallet @1x, @2x, @3x) ─────
  const x3 = canvas.toBuffer("image/png");
  const c2 = createCanvas(Math.round(W * 2 / 3), Math.round(H * 2 / 3));
  c2.getContext("2d").drawImage(canvas, 0, 0, c2.width, c2.height);
  const x2 = c2.toBuffer("image/png");
  const c1 = createCanvas(Math.round(W / 3), Math.round(H / 3));
  c1.getContext("2d").drawImage(canvas, 0, 0, c1.width, c1.height);
  const x1 = c1.toBuffer("image/png");

  return { x1, x2, x3 };
}
