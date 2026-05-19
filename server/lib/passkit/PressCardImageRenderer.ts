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

// Unified brand typography: IBM Plex Sans Arabic is what the iOS app
// (sabq app ios/sabq/Services/FontRegistration.swift) and the web
// (client/index.html: 400 + 700 weights) both ship. Mirror that on
// the server so the Apple Wallet press card visually belongs to the
// same family. Cairo / Noto Arabic stay registered as fallbacks in
// case the Plex TTFs ever go missing on a fresh container.
let arabicFontFamily = "sans-serif";

let fontsRegistered = false;
function registerFontsOnce() {
  if (fontsRegistered) return;
  const fontsDir = path.resolve(process.cwd(), "server/fonts");

  // Order matters: the last successfully registered alias wins as
  // the default arabicFontFamily, so list the preferred Plex faces
  // LAST. The two non-Plex entries are belt-and-suspenders fallbacks.
  const candidates = [
    { file: "Cairo-Bold.ttf",                  alias: "Cairo" },
    { file: "NotoSansArabic-Regular.ttf",      alias: "NotoArabic" },
    { file: "NotoSansArabic-Bold.ttf",         alias: "NotoArabic" },
    { file: "IBMPlexSansArabic-Regular.ttf",   alias: "IBMPlexSansArabic" },
    { file: "IBMPlexSansArabic-SemiBold.ttf",  alias: "IBMPlexSansArabic" },
    { file: "IBMPlexSansArabic-Bold.ttf",      alias: "IBMPlexSansArabic" },
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

// Arabic glyphs (esp. Cairo Bold) consistently render at ~1.35x
// the nominal font size when you include ascenders + descenders.
// Allocating that much vertical space prevents the descenders of
// the name from clipping the top of the job title underneath.
const LINE_HEIGHT_MULTIPLIER = 1.35;

export async function renderPressCardStrip(input: RenderInput): Promise<{ x1: Buffer; x2: Buffer; x3: Buffer }> {
  registerFontsOnce();

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // White background — clean, brand-consistent.
  ctx.fillStyle = WHITE;
  ctx.fillRect(0, 0, W, H);

  const padX = 60;
  const padTop = 6;     // editor: "ارفع اللوقو فوق" — hug the top edge
  const padBottom = 28; // breathing room before the Wallet fields row

  try { (ctx as any).direction = "rtl"; } catch {}

  // ── Sabq logo (top-center, flush with the top edge) ───────────
  let logoBottomY = padTop;
  try {
    const logoPath = path.resolve(process.cwd(), "public/branding/sabq-logo.png");
    if (fs.existsSync(logoPath)) {
      const logo = await loadImage(logoPath);
      const logoH = 165;
      const logoW = (logo.width / logo.height) * logoH;
      ctx.drawImage(logo, (W - logoW) / 2, padTop, logoW, logoH);
      logoBottomY = padTop + logoH;
    }
  } catch (e) {
    console.warn("[PressCardImageRenderer] logo skipped:", e);
  }

  // ── Tagline "بطاقة صحفية رسمية" directly under the logo ──────
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const taglineSize = 24;
  const taglineY = logoBottomY + 6;
  ctx.font = arabicFont(taglineSize, false);
  ctx.fillStyle = INK_SOFT;
  ctx.fillText("بطاقة صحفية رسمية", W / 2, taglineY);
  const headerBottomY = taglineY + taglineSize * LINE_HEIGHT_MULTIPLIER;

  // ── Name + jobTitle as a single block, line-height aware so the
  //    name's descenders never collide with the job title's
  //    ascenders. Restrained sizes leave clear margin above and
  //    below — fixes rev 7's "المنصب مختفي خلف النصوص" bug. ─────
  const nameMaxWidth = W - padX * 2;
  const nameSize = fitFontSize(ctx, input.userName, nameMaxWidth, 80, 52, true);
  const jobTitle = (input.jobTitle ?? "").trim();
  const jobSize = jobTitle ? fitFontSize(ctx, jobTitle, nameMaxWidth, 36, 24, false) : 0;

  // Generous gap between name and job title.
  const gap = jobTitle ? 40 : 0;

  // Actual rendered line heights (include ascender/descender).
  const nameLineH = nameSize * LINE_HEIGHT_MULTIPLIER;
  const jobLineH = jobSize * LINE_HEIGHT_MULTIPLIER;
  const blockH = nameLineH + gap + jobLineH;

  // Center the block within the remaining vertical space below the
  // top header and above the bottom safe area.
  const contentTop = headerBottomY + 16;
  const contentBottom = H - padBottom;
  const contentH = contentBottom - contentTop;
  const blockTop = contentTop + Math.max(0, (contentH - blockH) / 2);

  ctx.textBaseline = "top";
  ctx.font = arabicFont(nameSize, true);
  ctx.fillStyle = INK;
  ctx.fillText(input.userName, W / 2, blockTop);

  if (jobTitle) {
    ctx.font = arabicFont(jobSize, false);
    ctx.fillStyle = INK_SOFT;
    ctx.fillText(jobTitle, W / 2, blockTop + nameLineH + gap);
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
