/**
 * بطاقة مشاركة 1200×630 بألوان سبق القائمة وشعارها.
 * النص من النموذج الجاهز. بلا تدرج ولا لون خارج لوحة العلامة.
 */
import { createCanvas, GlobalFonts, loadImage, type SKRSContext2D } from "@napi-rs/canvas";
import fs from "fs";
import path from "path";

const W = 1200;
const H = 630;
const INK = "#10202e";
const BRAND = "#087dbb";
const MUTED = "#647687";
const PAPER = "#ffffff";

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
  path: string;
};

export async function renderServiceOgPng(input: ServiceOgInput): Promise<Buffer> {
  registerFonts();
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = BRAND;
  ctx.fillRect(0, 0, W, 12);

  await drawLogo(ctx);

  ctx.direction = "rtl";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = INK;
  const titleSize = fit(ctx, input.h1, 980, 64, 40);
  ctx.font = `${titleSize}px "${fontFamily}"`;
  ctx.fillText(input.h1, W / 2, 340);

  const date = input.gregorianLabel || "لا يوجد موعد قادم معلن";
  const dateSize = fit(ctx, date, 980, 42, 28);
  ctx.font = `${dateSize}px "${fontFamily}"`;
  ctx.fillStyle = BRAND;
  ctx.fillText(date, W / 2, 410);

  ctx.fillStyle = MUTED;
  ctx.font = `32px "${fontFamily}"`;
  if (input.hijriLabel) ctx.fillText(input.hijriLabel, W / 2, 468);
  if (input.certaintyLabel) ctx.fillText(input.certaintyLabel, W / 2, 520);

  ctx.font = `26px "${fontFamily}"`;
  ctx.fillText(`sabq.org${input.path}`, W / 2, 585);
  return canvas.toBuffer("image/png");
}

async function drawLogo(ctx: SKRSContext2D) {
  const file = path.resolve(process.cwd(), "public/branding/sabq-logo.png");
  if (!fs.existsSync(file)) {
    ctx.fillStyle = BRAND;
    ctx.font = `48px "${fontFamily}"`;
    ctx.textAlign = "center";
    ctx.direction = "rtl";
    ctx.fillText("سبق", W / 2, 160);
    return;
  }
  try {
    const logo = await loadImage(file);
    const size = 140;
    ctx.drawImage(logo, (W - size) / 2, 48, size, size);
  } catch (error) {
    console.warn("[service-og] logo", error);
  }
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
