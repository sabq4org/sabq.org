/**
 * بطاقة مشاركة 1200×630 لصفحة خدمة. النص من النموذج الجاهز، بلا تاريخ مخترع.
 * الخط العربي موجود أصلًا في server/fonts (نفس بطاقات الرياضة).
 */
import { createCanvas, GlobalFonts, type SKRSContext2D } from "@napi-rs/canvas";
import fs from "fs";
import path from "path";

const W = 1200;
const H = 630;

let fontFamily = "sans-serif";
let fontsReady = false;

function registerFonts() {
  if (fontsReady) return;
  const dir = path.resolve(process.cwd(), "server/fonts");
  for (const file of ["IBMPlexSansArabic-Bold.ttf", "Cairo-Bold.ttf"]) {
    const full = path.join(dir, file);
    if (!fs.existsSync(full)) continue;
    try {
      GlobalFonts.registerFromPath(full, "SabqServiceOg");
      fontFamily = "SabqServiceOg";
      break;
    } catch (error) {
      console.warn("[service-og] font", file, error);
    }
  }
  fontsReady = true;
}

export type ServiceOgInput = {
  h1: string;
  gregorianLabel: string | null;
  hijriLabel: string | null;
  certaintyLabel: string | null;
  tone: "citizen" | "salary";
  path: string;
};

export async function renderServiceOgPng(input: ServiceOgInput): Promise<Buffer> {
  registerFonts();
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  const accent = input.tone === "salary" ? "#1f8a5b" : "#e2b340";

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#071422");
  bg.addColorStop(0.55, "#0a3554");
  bg.addColorStop(1, "#087dbb");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, W, 14);

  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.beginPath();
  ctx.arc(1040, 120, 220, 0, Math.PI * 2);
  ctx.fill();

  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.font = `36px "${fontFamily}"`;
  ctx.fillText("سبق", 1080, 110);

  ctx.fillStyle = "#ffffff";
  const titleSize = fit(ctx, input.h1, 920, 78, 48);
  ctx.font = `${titleSize}px "${fontFamily}"`;
  ctx.fillText(input.h1, 1080, 230);

  const date = input.gregorianLabel || "لا يوجد موعد قادم معلن";
  const dateSize = fit(ctx, date, 980, 54, 36);
  ctx.font = `${dateSize}px "${fontFamily}"`;
  ctx.fillStyle = "#f4fbff";
  ctx.fillText(date, 1080, 340);

  if (input.hijriLabel) {
    ctx.font = `40px "${fontFamily}"`;
    ctx.fillStyle = "rgba(255,255,255,0.86)";
    ctx.fillText(input.hijriLabel, 1080, 410);
  }

  if (input.certaintyLabel) {
    ctx.font = `34px "${fontFamily}"`;
    const label = input.certaintyLabel;
    const width = ctx.measureText(label).width + 48;
    const x = 1080 - width;
    roundRect(ctx, x, 450, width, 64, 32);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.fillStyle = "#071422";
    ctx.textAlign = "center";
    ctx.fillText(label, x + width / 2, 494);
  }

  ctx.textAlign = "right";
  ctx.direction = "ltr";
  ctx.font = `28px "${fontFamily}"`;
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillText(`sabq.org${input.path}`, 1080, 580);

  return canvas.toBuffer("image/png");
}

function fit(ctx: SKRSContext2D, text: string, maxWidth: number, start: number, min: number): number {
  let size = start;
  while (size > min) {
    ctx.font = `${size}px "${fontFamily}"`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  return size;
}

function roundRect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
