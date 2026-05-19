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
  jobTitle?: string;
};

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
  const padTop = 18; // raised to push the logo right up against the top edge

  try { (ctx as any).direction = "rtl"; } catch {}

  // ── Sabq logo (top-center, pushed as high as the canvas allows).
  //    Editor: "ارفع اللوقو فوق" + "حبتين أكبر". ─────────────────
  let logoBottomY = padTop;
  try {
    const logoPath = path.resolve(process.cwd(), "public/branding/sabq-logo.png");
    if (fs.existsSync(logoPath)) {
      const logo = await loadImage(logoPath);
      const logoH = 170;
      const logoW = (logo.width / logo.height) * logoH;
      ctx.drawImage(logo, (W - logoW) / 2, padTop, logoW, logoH);
      logoBottomY = padTop + logoH;
    }
  } catch (e) {
    console.warn("[PressCardImageRenderer] logo skipped:", e);
  }

  // ── Tagline "بطاقة صحفية رسمية" directly under the logo, at
  //    the very top of the card per editor direction ("فوق فوق"). ─
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = arabicFont(26, false);
  ctx.fillStyle = INK_SOFT;
  ctx.fillText("بطاقة صحفية رسمية", W / 2, logoBottomY + 4);
  const taglineBottomY = logoBottomY + 4 + 26;

  // ── Name + jobTitle as a single block, generously spaced and
  //    vertically centered within the remaining canvas below the
  //    top header area. ─────────────────────────────────────────
  ctx.textAlign = "center";

  const nameMaxWidth = W - padX * 2;
  const nameSize = fitFontSize(ctx, input.userName, nameMaxWidth, 100, 56, true);
  const jobTitle = (input.jobTitle ?? "").trim();
  const jobSize = jobTitle ? fitFontSize(ctx, jobTitle, nameMaxWidth, 40, 24, false) : 0;

  // Bigger breathing room between name and job title — editor
  // asked explicitly for "فراغ بين الاسم والمنصب".
  const gap = jobTitle ? 44 : 0;
  const blockH = nameSize + gap + jobSize;

  // Center the block in the lower 60% of the canvas (below the
  // top header) so it doesn't crowd the tagline or feel bottom-
  // heavy.
  const lowerAreaTop = taglineBottomY + 16;
  const lowerAreaH = H - lowerAreaTop;
  const blockTop = lowerAreaTop + (lowerAreaH - blockH) / 2;

  ctx.textBaseline = "top";
  ctx.font = arabicFont(nameSize, true);
  ctx.fillStyle = INK;
  ctx.fillText(input.userName, W / 2, blockTop);

  if (jobTitle) {
    ctx.font = arabicFont(jobSize, false);
    ctx.fillStyle = INK_SOFT;
    ctx.fillText(jobTitle, W / 2, blockTop + nameSize + gap);
  }

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
