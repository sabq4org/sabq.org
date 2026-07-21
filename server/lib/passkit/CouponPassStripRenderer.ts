// Strip renderer for the Sabq Plus voucher coupon in Apple Wallet.
//
// Coupon layout without a strip leaves a cramped field grid above a
// huge QR (value stuck in a tiny header). Same lesson as the press
// card: bake the hero typography into strip.png so we control size
// and hierarchy. Native fields below the strip stay minimal
// (code + expiry) so the barcode has room.
//
// الهوية: بنفسجي ولاء ون المعتمد في بطاقة القسيمة على /plus-preview
// (تدرج wala-deep → wala + علامة W صفراء) — لا كحلي العضوية؛ القسيمة
// «منتج الشريك» والعضوية «منتج سبق».
//
// المبلغ: يُرسم رقماً وعملةً كسلسلتين منفصلتين بمواضع صريحة — ترك
// "1.50 ر.س" لخوارزمية bidi كان يعرض ر.س قبل المبلغ.

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

// بنفسجي ولاء ون — مطابق لـ .spp-pass في صفحة المعاينة.
const WALA_DEEP = "#4A3BC0";
const WALA = "#5F4FD1";
const WALA_LIGHT = "#7B6CE0";
const ACCENT_Y = "#FFC933";
const INK = "#FFFFFF";
const INK_SOFT = "#E4DEFF";
const LINE_HEIGHT = 1.3;

function arabicFont(sizePx: number, bold = false, italic = false): string {
  return `${italic ? "italic " : ""}${bold ? "bold " : ""}${sizePx}px "${arabicFontFamily}", sans-serif`;
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
  // تدرج بنفسجي قطري كما في بطاقة القسيمة على الويب.
  const base = ctx.createLinearGradient(0, 0, W, H);
  base.addColorStop(0, WALA_DEEP);
  base.addColorStop(0.7, WALA);
  base.addColorStop(1, WALA_LIGHT);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);

  // توهج أصفر خافت أعلى اليسار (موضع علامة W).
  const glow = ctx.createRadialGradient(W * 0.12, H * 0.1, 10, W * 0.12, H * 0.1, W * 0.45);
  glow.addColorStop(0, "rgba(255, 201, 51, 0.14)");
  glow.addColorStop(1, "rgba(255, 201, 51, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // علامة W الصفراء الشبحية — بصمة ولاء ون كما على بطاقة الويب.
  ctx.save();
  ctx.font = arabicFont(360, true, true);
  ctx.fillStyle = "rgba(255, 201, 51, 0.16)";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("W", -18, H * 0.92);
  ctx.restore();

  // خط علوي أصفر رفيع.
  ctx.fillStyle = ACCENT_Y;
  ctx.fillRect(0, 0, W, 6);

  // تلاشٍ سفلي إلى لون خلفية البطاقة نفسه ليلتحم الشريط بالجسم.
  const fade = ctx.createLinearGradient(0, H - 48, 0, H);
  fade.addColorStop(0, "rgba(95, 79, 209, 0)");
  fade.addColorStop(1, WALA);
  ctx.fillStyle = fade;
  ctx.fillRect(0, H - 48, W, 48);
}

// "5.00 ر.س" → { amount: "5.00", unit: "ر.س" } — وإلا null (خصم 10% مثلاً).
function splitMoney(value: string): { amount: string; unit: string } | null {
  const m = value.match(/^(\d+(?:[.,]\d+)?)\s*(ر\.س)$/);
  return m ? { amount: m[1], unit: m[2] } : null;
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

  const padX = 64;
  const maxW = W - padX * 2;
  const value = (input.valueLabel || "").trim() || "—";
  const partner = (input.partnerName || "").trim() || "شريك سبق بلس";

  // السطر الصغير أعلى القيمة.
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const tagSize = 26;
  ctx.font = arabicFont(tagSize, false);
  ctx.fillStyle = INK_SOFT;
  ctx.fillText("قسيمة سبق بلس", W / 2, 34);

  const money = splitMoney(value);
  const valueSize = money
    ? 118
    : fitFontSize(ctx, value, maxW, 118, 64, true);
  const valueLineH = valueSize * LINE_HEIGHT;
  const partnerSize = fitFontSize(ctx, partner, maxW, 42, 28, true);
  const partnerLineH = partnerSize * LINE_HEIGHT;
  const blockGap = 16;
  const blockH = valueLineH + blockGap + partnerLineH;

  const contentTop = 34 + tagSize * LINE_HEIGHT + 26;
  const contentBottom = H - 34;
  const blockTop = contentTop + Math.max(0, (contentBottom - contentTop - blockH) / 2);

  if (money) {
    // رسم صريح: المبلغ يميناً (يُقرأ أولاً) والعملة أصغر على يساره —
    // لا نترك السلسلة المختلطة لتقلبات bidi.
    const unitSize = Math.round(valueSize * 0.4);
    ctx.font = arabicFont(valueSize, true);
    const amountW = ctx.measureText(money.amount).width;
    ctx.font = arabicFont(unitSize, true);
    const unitW = ctx.measureText(money.unit).width;
    const gap = 18;
    const total = amountW + gap + unitW;
    const rightX = W / 2 + total / 2;
    const baseline = blockTop + valueSize;

    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    ctx.font = arabicFont(valueSize, true);
    ctx.fillStyle = INK;
    ctx.fillText(money.amount, rightX, baseline);

    ctx.font = arabicFont(unitSize, true);
    ctx.fillStyle = INK_SOFT;
    ctx.fillText(money.unit, rightX - amountW - gap, baseline);
  } else {
    // نص مختلط (خصم 10% مثلاً): تخطيط يدوي كلمةً كلمة من اليمين لليسار —
    // كل كلمة أحادية الاتجاه داخلياً فلا يقلب bidi شيئاً.
    const tokens = value.split(/\s+/).filter(Boolean);
    ctx.font = arabicFont(valueSize, true);
    const spaceW = valueSize * 0.28;
    const widths = tokens.map((t) => ctx.measureText(t).width);
    const total = widths.reduce((a, b) => a + b, 0) + spaceW * (tokens.length - 1);
    let xRight = W / 2 + total / 2;
    const baseline = blockTop + valueSize;
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = INK;
    tokens.forEach((t, i) => {
      ctx.fillText(t, xRight, baseline);
      xRight -= widths[i] + spaceW;
    });
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
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

// شعار نصي «سبق بلس+» أبيض/أصفر على شفاف — بدل شعار الصحيفة الأزرق
// (بإنجليزيته) الذي كان ينشز على البنفسجي. يُرسم بثلاث سلاسل منفصلة
// موضوعة يدوياً كي لا يقلب bidi موضع علامة +.
export async function renderCouponWordmark(): Promise<{
  x1: Buffer;
  x2: Buffer;
  x3: Buffer;
}> {
  registerFontsOnce();

  const LW = 480;
  const LH = 150;
  const topPad = 24;
  const rightPad = 10;

  const canvas = createCanvas(LW, LH);
  const ctx = canvas.getContext("2d");

  const size = 88;
  ctx.textBaseline = "middle";
  ctx.textAlign = "right";
  const midY = topPad + (LH - topPad) / 2;

  ctx.font = arabicFont(size, true);
  const gap = 20;
  const w1 = ctx.measureText("سبق").width;
  const w2 = ctx.measureText("بلس").width;

  let x = LW - rightPad;
  ctx.fillStyle = INK;
  ctx.fillText("سبق", x, midY);
  x -= w1 + gap;
  ctx.fillStyle = ACCENT_Y;
  ctx.fillText("بلس", x, midY);
  x -= w2 + 6;
  ctx.fillText("+", x, midY);

  const x3 = canvas.toBuffer("image/png");
  const c2 = createCanvas(Math.round((LW * 2) / 3), Math.round((LH * 2) / 3));
  c2.getContext("2d").drawImage(canvas, 0, 0, c2.width, c2.height);
  const x2 = c2.toBuffer("image/png");
  const c1 = createCanvas(Math.round(LW / 3), Math.round(LH / 3));
  c1.getContext("2d").drawImage(canvas, 0, 0, c1.width, c1.height);
  const x1 = c1.toBuffer("image/png");

  return { x1, x2, x3 };
}
