/**
 * بطاقة «جملة المقال» صورةً مربعة 1080×1080 للمشاركة في واتساب وX والتطبيقات.
 * فاتحة بأزرق سبق: خلفية أزرق-بنفسجي ناعم، العبارة بخط IBM Plex Sans Arabic،
 * وتحتها صورة الكاتب في دائرة واسمه ووصفه بخط صغير.
 */
import { createCanvas, GlobalFonts, loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import fs from "fs";
import path from "path";
import { OPINION_WRITER_CARD_SUBTITLE, wrapQuoteLines } from "@shared/opinionReaderExtras";

export const QUOTE_CARD_SIZE = 1080;
const S = QUOTE_CARD_SIZE;
const INK = "#1B2B3A";
const BRAND = "#1E9BE6";
const MUTED = "#55667A";

let fontsReady = false;
const FONT_BOLD = "SabqQuoteBold";
const FONT_SEMI = "SabqQuoteSemi";
const FONT_REG = "SabqQuoteReg";

function registerFonts() {
  if (fontsReady) return;
  const dir = path.resolve(process.cwd(), "server/fonts");
  const pairs: Array<[string, string]> = [
    ["IBMPlexSansArabic-Bold.ttf", FONT_BOLD],
    ["IBMPlexSansArabic-SemiBold.ttf", FONT_SEMI],
    ["IBMPlexSansArabic-Regular.ttf", FONT_REG],
  ];
  for (const [file, family] of pairs) {
    const full = path.join(dir, file);
    if (!fs.existsSync(full)) continue;
    try {
      GlobalFonts.registerFromPath(full, family);
    } catch (error) {
      console.warn("[quote-card] font", file, error);
    }
  }
  fontsReady = true;
}

let logo: Image | null | undefined;
async function getLogo(): Promise<Image | null> {
  if (logo !== undefined) return logo;
  try {
    const p = path.resolve(process.cwd(), "public/branding/sabq-logo-official.png");
    logo = fs.existsSync(p) ? await loadImage(fs.readFileSync(p)) : null;
  } catch {
    logo = null;
  }
  return logo;
}

// صورة الكاتب من رابط في ملفه: نقبل مضيفات سبق وخدمات الصور المعروفة فقط (لا SSRF).
const AVATAR_HOSTS = [
  "imagedelivery.net",
  "media.sabq.org",
  "sabq.org",
  "www.sabq.org",
  "api.sabq.org",
  "storage.googleapis.com",
  "lh3.googleusercontent.com",
];

export function resolveAvatarUrl(raw: string | null | undefined, publicOrigin = "https://sabq.org"): string | null {
  if (!raw) return null;
  try {
    const url = raw.startsWith("/") ? new URL(raw, publicOrigin) : new URL(raw);
    if (url.protocol !== "https:") return null;
    if (!AVATAR_HOSTS.includes(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function fetchAvatar(raw: string | null): Promise<Image | null> {
  const url = resolveAvatarUrl(raw, process.env.PUBLIC_SITE_ORIGIN || "https://sabq.org");
  if (!url) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const resp = await fetch(url, { signal: ctrl.signal, redirect: "error" });
    clearTimeout(t);
    if (!resp.ok) return null;
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length > 6 * 1024 * 1024) return null;
    return await loadImage(buf);
  } catch {
    return null;
  }
}

/**
 * يرسم سطرًا عربيًا من اليمين. علامة RLM على الطرفين تجعل المحرك يعامل السطر
 * فقرة RTL: الترقيم في آخره يبقى يساره، والأرقام اللاتينية («2030») في مكانها.
 */
function drawRtlLine(ctx: SKRSContext2D, text: string, rightX: number, y: number) {
  const savedAlign = ctx.textAlign;
  const savedDir = ctx.direction;
  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.fillText(`\u200F${text}\u200F`, rightX, y);
  ctx.textAlign = savedAlign;
  ctx.direction = savedDir;
}

function wrapByWidth(ctx: SKRSContext2D, quote: string, maxWidth: number): string[] {
  const words = wrapQuoteLines(quote, 10_000).join(" ").split(" ").filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function pickQuoteLayout(ctx: SKRSContext2D, quote: string, maxWidth: number) {
  // أكبر خط تتسع به العبارة في منطقتها (ارتفاع 440 بكسل تقريبًا)
  for (let size = 68; size >= 34; size -= 2) {
    ctx.font = `${size}px "${FONT_BOLD}"`;
    const lines = wrapByWidth(ctx, quote, maxWidth);
    if (lines.length * size * 1.6 <= 440) return { size, lines };
  }
  ctx.font = `34px "${FONT_BOLD}"`;
  return { size: 34, lines: wrapByWidth(ctx, quote, maxWidth).slice(0, 8) };
}

export async function renderOpinionQuoteCardPng(input: {
  quote: string;
  authorName: string;
  authorImageUrl: string | null;
}): Promise<Buffer> {
  registerFonts();
  const canvas = createCanvas(S, S);
  const ctx = canvas.getContext("2d");

  // خلفية فاتحة: أزرق سماوي ناعم إلى بنفسجي فاتح
  const bg = ctx.createLinearGradient(S, 0, 0, S);
  bg.addColorStop(0, "#E2F2FD");
  bg.addColorStop(1, "#EEF1FE");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, S, S);

  const pad = 96;
  const right = S - pad;

  // الشعار أعلى اليمين
  const lg = await getLogo();
  if (lg) {
    const h = 92;
    const w = (lg.width / lg.height) * h;
    ctx.drawImage(lg, right - w, 78, w, h);
  }

  // علامة الاقتباس
  ctx.fillStyle = BRAND;
  ctx.font = `150px "${FONT_BOLD}"`;
  ctx.textAlign = "right";
  ctx.direction = "rtl";
  ctx.fillText("«", right + 6, 330);

  // العبارة
  const { size, lines } = pickQuoteLayout(ctx, input.quote, S - pad * 2);
  const lineH = Math.round(size * 1.6);
  const blockH = lines.length * lineH;
  // العبارة في المنطقة بين علامة الاقتباس والخط الأزرق (360 → 760)
  const top = 340 + Math.max(0, (440 - blockH) / 2);
  ctx.fillStyle = INK;
  ctx.font = `${size}px "${FONT_BOLD}"`;
  lines.forEach((line, i) => {
    drawRtlLine(ctx, line, right, top + i * lineH + size);
  });

  // الكاتب: صورة دائرية + الاسم + الوصف
  const avatarR = 58;
  const footY = S - 150;
  const cx = right - avatarR;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, footY, avatarR + 5, 0, Math.PI * 2);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, footY, avatarR, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  const avatar = await fetchAvatar(input.authorImageUrl);
  if (avatar) {
    const scale = Math.max((avatarR * 2) / avatar.width, (avatarR * 2) / avatar.height);
    const w = avatar.width * scale;
    const h = avatar.height * scale;
    ctx.drawImage(avatar, cx - w / 2, footY - h / 2 - h * 0.08, w, h);
  } else {
    ctx.fillStyle = "#D6ECFB";
    ctx.fillRect(cx - avatarR, footY - avatarR, avatarR * 2, avatarR * 2);
    ctx.fillStyle = BRAND;
    ctx.font = `56px "${FONT_BOLD}"`;
    ctx.textAlign = "center";
    ctx.direction = "rtl";
    ctx.fillText(Array.from(input.authorName.trim())[0] ?? "س", cx, footY + 20);
  }
  ctx.restore();

  const textRight = cx - avatarR - 28;
  ctx.fillStyle = INK;
  ctx.font = `40px "${FONT_SEMI}"`;
  drawRtlLine(ctx, input.authorName, textRight, footY - 4);
  ctx.fillStyle = MUTED;
  ctx.font = `28px "${FONT_REG}"`;
  drawRtlLine(ctx, OPINION_WRITER_CARD_SUBTITLE, textRight, footY + 42);

  // خط أزرق رفيع فوق التذييل + sabq.org
  ctx.fillStyle = BRAND;
  ctx.fillRect(pad, S - 290, 120, 6);
  ctx.fillStyle = MUTED;
  ctx.font = `28px "${FONT_REG}"`;
  ctx.textAlign = "left";
  ctx.direction = "ltr";
  ctx.fillText("sabq.org", pad, footY + 42);

  return canvas.toBuffer("image/png");
}
