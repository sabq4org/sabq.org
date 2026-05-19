// Custom strip-image renderer for the Apple Wallet press card.
//
// 2026-05-19 design brief — no photo, minimal Apple Wallet-ready look:
//   • White background, sparse use of Sabq sky-blue (labels + accent
//     lines only — no color blocks, no gradients, no shadows)
//   • Logo top-right (not centered) — matches the RTL eye flow
//   • Thin blue accent line below the header
//   • Centered card title (بطاقة صحفية رسمية)
//   • Information block, RTL, with clear hierarchy:
//       - الاسم (largest, bold, near-black)
//       - الدور (label blue + value dark)
//       - المنصب
//       - اسم جهة العمل
//       - رقم البطاقة (monospace) + تاريخ الانتهاء (MM/YYYY)
//   • Thin blue accent line at the bottom
//
// pkpass strip dimensions are fixed by Apple (375×144 logical = 1125×432
// @3x). The strip is wider than tall so we lay everything out
// horizontally-aware: title centered, info block left-aligned (in RTL
// = visually right-aligned), and the bottom row pairs card # + expiry
// side by side to use the width.

import { GlobalFonts, createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "fs";
import path from "path";

let fontsRegistered = false;
function registerFontsOnce() {
  if (fontsRegistered) return;
  const fontsDir = path.resolve(process.cwd(), "server/fonts");
  const reg = (file: string, family: string) => {
    const full = path.join(fontsDir, file);
    if (fs.existsSync(full)) {
      try {
        GlobalFonts.registerFromPath(full, family);
      } catch (e) {
        console.warn(`[PressCardImageRenderer] register font ${file}:`, e);
      }
    }
  };
  reg("Cairo-Bold.ttf", "Cairo");
  reg("NotoSansArabic-Regular.ttf", "Noto Sans Arabic");
  reg("NotoSansArabic-Bold.ttf", "Noto Sans Arabic Bold");
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

const ACCENT = "#5BB3E4";     // Sabq sky blue (brief-spec hex)
const INK = "#15171C";         // near-black charcoal
const INK_SOFT = "#5B6573";    // secondary text
const WHITE = "#FFFFFF";

const W = 1125;   // 375 logical × 3
const H = 432;    // 144 logical × 3

function formatExpiryMonthYear(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}/${yyyy}`;
}

export async function renderPressCardStrip(input: RenderInput): Promise<{ x1: Buffer; x2: Buffer; x3: Buffer }> {
  registerFontsOnce();

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = WHITE;
  ctx.fillRect(0, 0, W, H);

  const padX = 60;       // left/right padding inside the strip
  const padTop = 24;

  // ── Logo top-right ─────────────────────────────────────────────────
  try {
    const logoPath = path.resolve(process.cwd(), "public/branding/sabq-logo.png");
    if (fs.existsSync(logoPath)) {
      const logo = await loadImage(logoPath);
      const logoH = 60;
      const logoW = (logo.width / logo.height) * logoH;
      ctx.drawImage(logo, W - padX - logoW, padTop, logoW, logoH);
    }
  } catch (e) {
    console.warn("[PressCardImageRenderer] logo skipped:", e);
  }

  // ── Top accent line ────────────────────────────────────────────────
  const topLineY = padTop + 60 + 18;
  ctx.fillStyle = ACCENT;
  ctx.fillRect(padX, topLineY, W - padX * 2, 2);

  // ── Title (centered, bold) ─────────────────────────────────────────
  const titleY = topLineY + 18;
  ctx.fillStyle = INK;
  ctx.font = "bold 32px Cairo";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.direction = "rtl";
  ctx.fillText("بطاقة صحفية رسمية", W / 2, titleY);

  // ── Information block (RTL, hierarchy: name biggest) ───────────────
  // We pin the block to the right edge (RTL natural start) and stack
  // downward. Labels in blue + values in ink.
  let cursorY = titleY + 60;
  const rightX = W - padX;

  // الاسم — largest, bold
  ctx.font = "20px Cairo";
  ctx.fillStyle = ACCENT;
  ctx.textAlign = "right";
  ctx.fillText("الاسم", rightX, cursorY);
  cursorY += 28;
  ctx.font = "bold 42px Cairo";
  ctx.fillStyle = INK;
  ctx.fillText(input.userName, rightX, cursorY, W - padX * 2);
  cursorY += 56;

  // الدور | المنصب — two columns side by side
  const halfX = padX + (W - padX * 2) / 2;
  ctx.font = "20px Cairo";
  ctx.fillStyle = ACCENT;
  ctx.fillText("الدور", rightX, cursorY);
  if (input.jobTitle) ctx.fillText("المنصب", halfX, cursorY);
  cursorY += 26;

  ctx.font = "26px Cairo";
  ctx.fillStyle = INK;
  ctx.fillText(input.roleAr, rightX, cursorY, (W - padX * 2) / 2 - 16);
  if (input.jobTitle) {
    ctx.fillText(input.jobTitle, halfX, cursorY, (W - padX * 2) / 2 - 16);
  }
  cursorY += 40;

  // جهة العمل
  if (input.organization) {
    ctx.font = "20px Cairo";
    ctx.fillStyle = ACCENT;
    ctx.fillText("جهة العمل", rightX, cursorY);
    cursorY += 26;
    ctx.font = "24px Cairo";
    ctx.fillStyle = INK;
    ctx.fillText(input.organization, rightX, cursorY, W - padX * 2);
    cursorY += 40;
  }

  // ── Bottom row: card # (right, monospace) + expiry (left) ──────────
  const bottomRowY = H - 80;
  if (input.pressIdNumber) {
    ctx.font = "16px Cairo";
    ctx.fillStyle = ACCENT;
    ctx.textAlign = "right";
    ctx.fillText("رقم البطاقة", rightX, bottomRowY);
    ctx.font = "bold 22px monospace";
    ctx.fillStyle = INK;
    ctx.fillText(input.pressIdNumber, rightX, bottomRowY + 22);
  }
  if (input.validUntil) {
    ctx.font = "16px Cairo";
    ctx.fillStyle = ACCENT;
    ctx.textAlign = "left";
    ctx.fillText("تاريخ الانتهاء", padX, bottomRowY);
    ctx.font = "bold 22px monospace";
    ctx.fillStyle = INK;
    ctx.fillText(formatExpiryMonthYear(input.validUntil), padX, bottomRowY + 22);
  }

  // ── Bottom accent line ─────────────────────────────────────────────
  ctx.fillStyle = ACCENT;
  ctx.fillRect(padX, H - 16, W - padX * 2, 2);

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
