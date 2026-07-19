/**
 * مولّد بطاقة المشاركة (OG) لصفحة النادي في البوابة الرياضية.
 *
 * السبب: صور الملاعب/الشعارات من API-Football مقاسها 150×150 شفّافة (placeholder
 * موحّد لكل الأندية تقريبًا)، فيرفضها واتساب/تويتر ويعرض "image not available".
 * الحل: نرسم بطاقة 1200×630 معتمة على هوية سبق (خلفية + شعار النادي + اسمه +
 * مركزه) فتظهر معاينة احترافية وموثوقة عبر كل المنصات.
 *
 * البطاقة تُكاش في الذاكرة بمعرّف النادي (6 ساعات) — الرسم لا يكلّف المزوّد
 * نداءً إضافيًا (يستهلك getTeamSeoMeta المُكاش)، والشعار يُجلب مرة ويُعاد استخدامه.
 */
import { GlobalFonts, createCanvas, loadImage, type Image } from "@napi-rs/canvas";
import fs from "fs";
import path from "path";
import { getTeamSeoMeta } from "./saudiLeagueService";

const W = 1200;
const H = 630;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 ساعات — الهوية/الترتيب شبه ثابتة خلال اليوم

let fontFamily = "sans-serif";
let fontsRegistered = false;
function registerFontsOnce() {
  if (fontsRegistered) return;
  const fontsDir = path.resolve(process.cwd(), "server/fonts");
  // الأخير المُسجَّل بنجاح يفوز كعائلة افتراضية — نضع Cairo-Bold آخرًا.
  const candidates = [
    { file: "IBMPlexSansArabic-Bold.ttf", alias: "SabqOg" },
    { file: "Cairo-Bold.ttf", alias: "SabqOg" },
  ];
  for (const { file, alias } of candidates) {
    const full = path.join(fontsDir, file);
    if (fs.existsSync(full)) {
      try {
        GlobalFonts.registerFromPath(full, alias);
        fontFamily = alias;
      } catch (e) {
        console.warn(`[sportsOgImage] register font ${file}:`, e);
      }
    }
  }
  fontsRegistered = true;
}

// شعار سبق يُحمَّل مرة واحدة (ملف ثابت في الحاوية).
let sabqLogo: Image | null | undefined;
async function getSabqLogo(): Promise<Image | null> {
  if (sabqLogo !== undefined) return sabqLogo;
  try {
    const p = path.resolve(process.cwd(), "public/branding/sabq-logo.png");
    sabqLogo = fs.existsSync(p) ? await loadImage(fs.readFileSync(p)) : null;
  } catch {
    sabqLogo = null;
  }
  return sabqLogo;
}

async function fetchImage(url: string): Promise<Image | null> {
  if (!url) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const resp = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!resp.ok) return null;
    const buf = Buffer.from(await resp.arrayBuffer());
    return await loadImage(buf);
  } catch {
    return null;
  }
}

function roundRect(
  ctx: ReturnType<ReturnType<typeof createCanvas>["getContext"]>,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** يقلّص حجم الخط حتى يتّسع النص ضمن العرض الأقصى. */
function fitFont(
  ctx: ReturnType<ReturnType<typeof createCanvas>["getContext"]>,
  text: string,
  maxWidth: number,
  startPx: number,
  minPx: number,
): number {
  let size = startPx;
  while (size > minPx) {
    ctx.font = `${size}px "${fontFamily}"`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  return size;
}

async function renderTeamCard(meta: Awaited<ReturnType<typeof getTeamSeoMeta>>): Promise<Buffer | null> {
  if (!meta) return null;
  registerFontsOnce();

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // خلفية متدرّجة بهوية سبق (كحلي غامق).
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#0B2138");
  grad.addColorStop(1, "#04101D");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // شريط علوي أزرق رفيع.
  ctx.fillStyle = "#3A9BE8";
  ctx.fillRect(0, 0, W, 10);

  // قرص أبيض يحمل شعار النادي (مركز أفقي، أعلى الوسط).
  const cx = W / 2;
  const discY = 196;
  const discR = 116;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.arc(cx, discY, discR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const logo = await fetchImage(meta.logo);
  if (logo) {
    const s = 168;
    ctx.drawImage(logo, cx - s / 2, discY - s / 2, s, s);
  } else {
    // بديل: أول حرف من اسم النادي داخل القرص.
    ctx.fillStyle = "#0B2138";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `120px "${fontFamily}"`;
    ctx.fillText(meta.name.charAt(0) || "؟", cx, discY + 4);
  }

  // اسم النادي.
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#FFFFFF";
  const nameSize = fitFont(ctx, meta.name, W - 160, 84, 48);
  ctx.font = `${nameSize}px "${fontFamily}"`;
  ctx.fillText(meta.name, cx, 392);

  // شريحة الترتيب/البطولة.
  const bits: string[] = [];
  if (meta.rank) bits.push(`المركز ${meta.rank}`);
  if (meta.points != null) bits.push(`${meta.points} نقطة`);
  if (meta.competitionName) bits.push(meta.competitionName);
  const line = bits.join("  ·  ");
  if (line) {
    const chipSize = fitFont(ctx, line, W - 240, 40, 26);
    ctx.font = `${chipSize}px "${fontFamily}"`;
    const tw = ctx.measureText(line).width;
    const padX = 34;
    const chipW = tw + padX * 2;
    const chipH = chipSize + 30;
    const chipX = cx - chipW / 2;
    const chipY = 432;
    ctx.fillStyle = "rgba(58,155,232,0.18)";
    roundRect(ctx, chipX, chipY, chipW, chipH, chipH / 2);
    ctx.fill();
    ctx.fillStyle = "#9FD0FF";
    ctx.textBaseline = "middle";
    ctx.fillText(line, cx, chipY + chipH / 2 + 1);
    ctx.textBaseline = "alphabetic";
  }

  // شعار سبق في الأسفل.
  const brand = await getSabqLogo();
  if (brand) {
    const bh = 56;
    const bw = (brand.width / brand.height) * bh;
    ctx.drawImage(brand, cx - bw / 2, H - 96, bw, bh);
  } else {
    ctx.fillStyle = "#7FA7CC";
    ctx.textAlign = "center";
    ctx.font = `34px "${fontFamily}"`;
    ctx.fillText("سبق", cx, H - 56);
  }

  return canvas.toBuffer("image/png");
}

interface CacheEntry {
  buf: Buffer;
  at: number;
}
const cache = new Map<number, CacheEntry>();

/**
 * يعيد بطاقة OG (PNG) للنادي، أو null إن لم تتوفّر بيانات النادي (فيستخدم
 * المستدعي صورة سبق الافتراضية). يُكاش الناتج في الذاكرة 6 ساعات.
 */
export async function getTeamOgImage(teamId: number): Promise<Buffer | null> {
  const hit = cache.get(teamId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.buf;

  const meta = await getTeamSeoMeta(teamId).catch(() => null);
  const buf = await renderTeamCard(meta).catch((e) => {
    console.error("[sportsOgImage] render failed:", e);
    return null;
  });
  if (buf) cache.set(teamId, { buf, at: Date.now() });
  return buf;
}
