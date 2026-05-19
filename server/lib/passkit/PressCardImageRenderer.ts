// Custom strip-image renderer for the Apple Wallet press card.
//
// 2026-05-19 rev 3 — feedback from the editor on rev 2:
//   • Logo was too small → bumped from 60 to 130 logical (390 @3x).
//   • Blue separator lines were unwanted → removed both rules.
//   • Field text rendered invisibly in production → root cause was
//     font registration silently failing in the Railway image (Cairo
//     is shipped under server/fonts/ but @napi-rs/canvas couldn't
//     always pick it up cleanly across deploys). The renderer now
//     registers under multiple aliases AND falls back to the system
//     "sans-serif" family if the Cairo path isn't readable.

import { GlobalFonts, createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "fs";
import path from "path";

let arabicFontFamily = "sans-serif";

let fontsRegistered = false;
function registerFontsOnce() {
  if (fontsRegistered) return;
  const fontsDir = path.resolve(process.cwd(), "server/fonts");

  const candidates = [
    { file: "Cairo-Bold.ttf",            alias: "Cairo" },
    { file: "NotoSansArabic-Bold.ttf",   alias: "NotoArabic" },
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
  roleAr: string;
  jobTitle?: string;
  organization?: string;
  pressIdNumber?: string;
  validUntil?: Date;
};

const ACCENT = "#5BB3E4";     // Sabq sky blue — used on labels only now
const INK = "#15171C";
const INK_SOFT = "#5B6573";
const WHITE = "#FFFFFF";

const W = 1125;
const H = 432;

function formatExpiryMonthYear(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}/${yyyy}`;
}

function arabicFont(sizePx: number, bold: boolean = false): string {
  const weight = bold ? "bold " : "";
  return `${weight}${sizePx}px "${arabicFontFamily}", sans-serif`;
}

export async function renderPressCardStrip(input: RenderInput): Promise<{ x1: Buffer; x2: Buffer; x3: Buffer }> {
  registerFontsOnce();

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = WHITE;
  ctx.fillRect(0, 0, W, H);

  const padX = 60;
  const padTop = 30;

  // ── Logo top-right (bigger this round) ─────────────────────────────
  let logoBottomY = padTop;
  try {
    const logoPath = path.resolve(process.cwd(), "public/branding/sabq-logo.png");
    if (fs.existsSync(logoPath)) {
      const logo = await loadImage(logoPath);
      const logoH = 130;
      const logoW = (logo.width / logo.height) * logoH;
      ctx.drawImage(logo, W - padX - logoW, padTop, logoW, logoH);
      logoBottomY = padTop + logoH;
    }
  } catch (e) {
    console.warn("[PressCardImageRenderer] logo skipped:", e);
  }

  // ── Title (centered, bold) ─────────────────────────────────────────
  ctx.fillStyle = INK;
  ctx.font = arabicFont(34, true);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  try { (ctx as any).direction = "rtl"; } catch {}
  ctx.fillText("بطاقة صحفية رسمية", W / 2, padTop + 18);

  // ── Information block (RTL, right-aligned) ────────────────────────
  let cursorY = logoBottomY + 30;
  const rightX = W - padX;

  // الاسم — largest, bold
  ctx.textAlign = "right";
  ctx.font = arabicFont(22, false);
  ctx.fillStyle = ACCENT;
  ctx.fillText("الاسم", rightX, cursorY);
  cursorY += 30;
  ctx.font = arabicFont(46, true);
  ctx.fillStyle = INK;
  ctx.fillText(input.userName, rightX, cursorY, W - padX * 2);
  cursorY += 64;

  // الدور | المنصب — two columns
  const halfX = padX + (W - padX * 2) / 2;
  ctx.font = arabicFont(20, false);
  ctx.fillStyle = ACCENT;
  ctx.fillText("الدور", rightX, cursorY);
  if (input.jobTitle) ctx.fillText("المنصب", halfX, cursorY);
  cursorY += 28;

  ctx.font = arabicFont(28, true);
  ctx.fillStyle = INK;
  ctx.fillText(input.roleAr, rightX, cursorY, (W - padX * 2) / 2 - 16);
  if (input.jobTitle) {
    ctx.fillText(input.jobTitle, halfX, cursorY, (W - padX * 2) / 2 - 16);
  }
  cursorY += 50;

  // جهة العمل
  if (input.organization) {
    ctx.font = arabicFont(20, false);
    ctx.fillStyle = ACCENT;
    ctx.fillText("جهة العمل", rightX, cursorY);
    cursorY += 26;
    ctx.font = arabicFont(24, false);
    ctx.fillStyle = INK;
    ctx.fillText(input.organization, rightX, cursorY, W - padX * 2);
  }

  // ── Bottom row: ID + expiry (no top/bottom blue lines this round) ─
  const bottomRowY = H - 76;

  if (input.pressIdNumber) {
    ctx.font = arabicFont(18, false);
    ctx.fillStyle = ACCENT;
    ctx.textAlign = "right";
    ctx.fillText("رقم البطاقة", rightX, bottomRowY);
    ctx.font = "bold 24px monospace";
    ctx.fillStyle = INK;
    ctx.fillText(input.pressIdNumber, rightX, bottomRowY + 24);
  }

  if (input.validUntil) {
    ctx.font = arabicFont(18, false);
    ctx.fillStyle = ACCENT;
    ctx.textAlign = "left";
    ctx.fillText("تاريخ الانتهاء", padX, bottomRowY);
    ctx.font = "bold 24px monospace";
    ctx.fillStyle = INK;
    ctx.fillText(formatExpiryMonthYear(input.validUntil), padX, bottomRowY + 24);
  }

  // ── Export at three densities ──────────────────────────────────────
  const x3 = canvas.toBuffer("image/png");
  const c2 = createCanvas(Math.round(W * 2 / 3), Math.round(H * 2 / 3));
  c2.getContext("2d").drawImage(canvas, 0, 0, c2.width, c2.height);
  const x2 = c2.toBuffer("image/png");
  const c1 = createCanvas(Math.round(W / 3), Math.round(H / 3));
  c1.getContext("2d").drawImage(canvas, 0, 0, c1.width, c1.height);
  const x1 = c1.toBuffer("image/png");

  return { x1, x2, x3 };
}
