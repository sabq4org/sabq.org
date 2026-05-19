// Custom strip-image renderer for the Apple Wallet press card.
//
// pkpass's standard chrome (top-left logo, top-right thumbnail, fixed
// field rows) doesn't permit the centered vertical layout the editor
// asked for ("logo top, photo center, name below, role below"). Apple
// Wallet does, however, render a strip image as a hero band between
// the header and primary-field rows — which we co-opt here to deliver
// the custom composition. Other fields (المنصب / القسم / press_id /
// valid_until) still ride below as regular auxiliary rows.
//
// Output:
//   - PNG buffer of the strip at @1x (375x144 logical) and @3x
//     (1125x432) so Apple Wallet can pick the right density for the
//     device. We render at @3x and let the bundler downscale for @1x.
//
// Dependencies: @napi-rs/canvas (already in node_modules), Cairo font
// shipped under server/fonts/.

import { GlobalFonts, createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "fs";
import path from "path";

let fontsRegistered = false;
function registerFontsOnce() {
  if (fontsRegistered) return;
  const fontsDir = path.resolve(process.cwd(), "server/fonts");
  const reg = (file: string, family: string, opts: any = {}) => {
    const full = path.join(fontsDir, file);
    if (fs.existsSync(full)) {
      try {
        GlobalFonts.registerFromPath(full, family);
      } catch (e) {
        console.warn(`[PressCardImageRenderer] failed to register font ${file}:`, e);
      }
    }
  };
  reg("Cairo-Bold.ttf", "Cairo");
  reg("NotoSansArabic-Regular.ttf", "Noto Sans Arabic");
  reg("NotoSansArabic-Bold.ttf", "Noto Sans Arabic", { weight: "bold" });
  fontsRegistered = true;
}

type RenderInput = {
  userName: string;
  roleAr: string;
  profileImageUrl?: string | null;
};

// Sabq palette — single source of truth lives here so the strip stays
// in sync with the pass.json color choices in PressPassBuilder.
const ACCENT = "#1CA4F0";    // Sabq web primary (sky blue)
const INK = "#1A2236";        // primary text
const INK_SOFT = "#8C92A1";   // secondary/label text
const WHITE = "#FFFFFF";
const ACCENT_FAINT = "rgba(28, 164, 240, 0.10)";

// Target render size: @3x of the standard coupon strip dimensions
// (Apple pass strip = 375 x 144 points → 1125 x 432 @3x).
const W = 1125;
const H = 432;

/**
 * Renders the press-card strip image. Returns the PNG buffer ready to
 * be embedded into the .pkpass as `strip.png` (@1x) and `strip@2x.png`
 * (@2x). Apple Wallet picks the right density per device.
 */
export async function renderPressCardStrip(input: RenderInput): Promise<{ x1: Buffer; x2: Buffer; x3: Buffer }> {
  registerFontsOnce();

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // ── Background + top accent stripe ─────────────────────────────────
  ctx.fillStyle = WHITE;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = ACCENT;
  ctx.fillRect(0, 0, W, 8);

  // ── Sabq logo (top-center) ─────────────────────────────────────────
  // The committed logo is 751x661 px (tall). Constrain the height to
  // ~48px logical (= 144 @3x) so it sits as a small wordmark up top.
  try {
    const logoPath = path.resolve(process.cwd(), "public/branding/sabq-logo.png");
    if (fs.existsSync(logoPath)) {
      const logo = await loadImage(logoPath);
      const logoH = 90;
      const logoW = (logo.width / logo.height) * logoH;
      ctx.drawImage(logo, (W - logoW) / 2, 20, logoW, logoH);
    }
  } catch (e) {
    console.warn("[PressCardImageRenderer] logo skipped:", e);
  }

  // ── Photographer photo (center, circular, Sabq blue ring) ──────────
  const photoY = 130;
  const photoSize = 180;
  const photoX = (W - photoSize) / 2;

  ctx.save();
  ctx.beginPath();
  ctx.arc(photoX + photoSize / 2, photoY + photoSize / 2, photoSize / 2 + 6, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = ACCENT_FAINT;
  ctx.fill();
  ctx.restore();

  // Inner photo (clipped to circle)
  ctx.save();
  ctx.beginPath();
  ctx.arc(photoX + photoSize / 2, photoY + photoSize / 2, photoSize / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  let drewPhoto = false;
  if (input.profileImageUrl) {
    try {
      const res = await fetch(input.profileImageUrl);
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        const img = await loadImage(buf);
        const ratio = Math.max(photoSize / img.width, photoSize / img.height);
        const drawW = img.width * ratio;
        const drawH = img.height * ratio;
        ctx.drawImage(
          img,
          photoX + (photoSize - drawW) / 2,
          photoY + (photoSize - drawH) / 2,
          drawW,
          drawH,
        );
        drewPhoto = true;
      }
    } catch (e) {
      console.warn("[PressCardImageRenderer] photo fetch failed:", e);
    }
  }

  if (!drewPhoto) {
    // Fallback — gray circle with a person silhouette glyph
    ctx.fillStyle = "#EEF2F6";
    ctx.fillRect(photoX, photoY, photoSize, photoSize);
    ctx.fillStyle = INK_SOFT;
    ctx.font = "bold 96px Cairo";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("👤", photoX + photoSize / 2, photoY + photoSize / 2);
  }
  ctx.restore();

  // Outline ring around the photo
  ctx.beginPath();
  ctx.arc(photoX + photoSize / 2, photoY + photoSize / 2, photoSize / 2, 0, Math.PI * 2);
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 4;
  ctx.stroke();

  // ── Name + role (below photo, centered) ────────────────────────────
  const textCenterX = W / 2;
  let cursorY = photoY + photoSize + 32;

  ctx.fillStyle = INK;
  ctx.font = "bold 42px Cairo";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.direction = "rtl";
  ctx.fillText(input.userName, textCenterX, cursorY, W - 40);
  cursorY += 48;

  ctx.fillStyle = ACCENT;
  ctx.font = "32px Cairo";
  ctx.fillText(input.roleAr, textCenterX, cursorY, W - 40);

  // ── Export buffers at three densities ──────────────────────────────
  const x3 = canvas.toBuffer("image/png");

  const c2 = createCanvas(Math.round(W * 2 / 3), Math.round(H * 2 / 3));
  c2.getContext("2d").drawImage(canvas, 0, 0, c2.width, c2.height);
  const x2 = c2.toBuffer("image/png");

  const c1 = createCanvas(Math.round(W / 3), Math.round(H / 3));
  c1.getContext("2d").drawImage(canvas, 0, 0, c1.width, c1.height);
  const x1 = c1.toBuffer("image/png");

  return { x1, x2, x3 };
}
