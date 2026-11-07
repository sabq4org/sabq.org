/**
 * «إنفو للموقع» — HTML for the two canvases. Pure string builders (unit-tested); fonts, logo and the
 * hero photo arrive as data URIs so the headless page never touches the network.
 *
 * House rules baked in: Handicrafts Black for the title, heavy Alexandria (800–900) for numbers,
 * IBM Plex for small text, the original white Sabq logo top-right over a soft shade, no boxes or
 * borders, one hero photo, an «AI-generated image» label, RTL. Every text block carries `data-qa`
 * so the renderer can measure overflow and overlaps on the exported page itself.
 */
import { randomBytes } from "node:crypto";
import { INFOGRAPHIC_STUDIO_CANVAS } from "@shared/infographicStudio";
import type { InfographicBrief } from "./brief";

export interface TemplateAssets {
  heroDataUri: string;
  logoWhiteSvg: string;
  /** Natural-colour logo for light cool backgrounds (designed canvases only). */
  logoColorSvg?: string;
  fonts: { handicraftsBlack: string; alexandriaArabic: string; alexandriaLatin: string; plexSemiBold: string; plexRegular: string };
}

export const AI_IMAGE_LABEL = "صورة مولدة بالذكاء الاصطناعي";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function rgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

function channels(hex: string): number[] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lum(c: number[]): number {
  const f = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
}

function ratio(a: number[], b: number[]): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Moves `color` toward black (on a light wash) or white (on a dark wash) until it reaches `min`
 * contrast against the wash. Keeps the model's hue; only fixes colours that would read weakly.
 */
export function ensureContrast(color: string, wash: string, min: number): string {
  const bg = channels(wash);
  const target = lum(bg) > 0.4 ? [0, 0, 0] : [255, 255, 255];
  let c = channels(color);
  for (let i = 0; i < 20 && ratio(c, bg) < min; i++) c = c.map((v, k) => Math.round(v + (target[k] - v) * 0.15));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

/** Brief colours made safe for text before any HTML is built. */
export function withSafeColours<T extends { ink: string; accent: string; wash: string }>(b: T): T {
  return { ...b, ink: ensureContrast(b.ink, b.wash, 7), accent: ensureContrast(b.accent, b.wash, 4.5) };
}

const AR_LETTER = /[\u0621-\u064A]/;
const AR_MARK = /[\u064B-\u065F\u0670]/;
/** Letters that never join the letter after them: a kashida after them would float. */
const NON_JOINING = new Set(Array.from("اأإآٱدذرزوؤةءى"));
const ALEF = new Set(Array.from("اأإآٱ"));
const KASHIDA = "ـــ";
const MAX_STRETCHED_PER_LINE = 2;
const MIN_STRETCH_LETTERS = 4;

/**
 * House kashida (guide v2): one stretch per word, in the middle of the word, not before its last
 * letter when an earlier join exists («بيـــوتهم» not «بيوتهـــم»). Never after the article «ال»,
 * never inside lam-alef, and diacritics stay with their letter.
 */
export function stretchWord(word: string): string {
  const chars = Array.from(word);
  const letters: number[] = [];
  chars.forEach((c, i) => {
    if (AR_LETTER.test(c)) letters.push(i);
  });
  if (letters.length < MIN_STRETCH_LETTERS || word.includes("ـ")) return word;
  const lead = chars[letters[0]] === "ا" && chars[letters[1]] === "ل" ? 2 : 0;
  const stemLen = letters.length - lead;
  if (stemLen < 3) return word;
  const candidates: number[] = [];
  for (let k = Math.max(lead, 1); k <= letters.length - 2; k++) {
    const cur = chars[letters[k]];
    const next = chars[letters[k + 1]];
    if (NON_JOINING.has(cur) || (cur === "ل" && ALEF.has(next))) continue;
    if (!chars.slice(letters[k] + 1, letters[k + 1]).every((c) => AR_MARK.test(c))) continue;
    candidates.push(k);
  }
  if (!candidates.length) return word;
  // Stretch after the letter that ends the first half of the stem.
  const target = lead + Math.ceil(stemLen / 2) - 1;
  const k = candidates.reduce((best, c) => (Math.abs(c - target) < Math.abs(best - target) ? c : best));
  let at = letters[k] + 1;
  while (at < chars.length && AR_MARK.test(chars[at])) at++;
  return chars.slice(0, at).join("") + KASHIDA + chars.slice(at).join("");
}

/** The longest stretchable words of a title line (up to two), so the stretch reads as rhythm, not noise. */
export function wordsToStretch(line: string): Set<string> {
  const words = Array.from(new Set(line.split(/\s+/).filter((w) => stretchWord(w) !== w)));
  const count = (w: string) => Array.from(w).filter((c) => AR_LETTER.test(c)).length;
  return new Set(words.sort((a, b) => count(b) - count(a)).slice(0, MAX_STRETCHED_PER_LINE));
}

function stretchText(text: string, chosen: Set<string>): string {
  return text
    .split(/(\s+)/)
    .map((w) => (chosen.has(w) ? stretchWord(w) : w))
    .join("");
}

/** Title line with house kashida and the highlight word wrapped once, everything escaped. */
export function titleLineHtml(line: string, highlight: string): string {
  const chosen = wordsToStretch(line);
  const out = (t: string) => escapeHtml(stretchText(t, chosen));
  if (!highlight || !line.includes(highlight)) return out(line);
  const i = line.indexOf(highlight);
  return `${out(line.slice(0, i))}<span class="hl">${out(highlight)}</span>${out(line.slice(i + highlight.length))}`;
}

/** «102 ألف ريال» → big «102» + small «ألف ريال». A value without leading digits stays whole. */
export function splitFigureValue(value: string): { num: string; unit: string } {
  const m = value.trim().match(/^([+\-−]?[\d٠-٩][\d٠-٩.,٫٬]*\s*[%٪]?)\s*(.*)$/);
  return m ? { num: m[1].trim(), unit: m[2].trim() } : { num: value.trim(), unit: "" };
}

/** Photo panel sizes. The text sits on a solid wash; the photo never runs under it. */
export const VERTICAL_PHOTO_HEIGHT = { figures: 800, points: 660 } as const;
export const WIDE_PHOTO_WIDTH = 860;
export const PHOTO_FADE = 240;

export function verticalPhotoHeight(b: Pick<InfographicBrief, "mode">): number {
  return VERTICAL_PHOTO_HEIGHT[b.mode === "points" ? "points" : "figures"];
}

function fontFaces(a: TemplateAssets): string {
  return `
@font-face{font-family:HC;src:url(${a.fonts.handicraftsBlack}) format("opentype");font-weight:900}
@font-face{font-family:Alex;src:url(${a.fonts.alexandriaArabic}) format("woff2");font-weight:100 900}
@font-face{font-family:Alex;src:url(${a.fonts.alexandriaLatin}) format("woff2");font-weight:100 900;unicode-range:U+0000-00FF}
@font-face{font-family:Plex;src:url(${a.fonts.plexSemiBold}) format("truetype");font-weight:600}
@font-face{font-family:Plex;src:url(${a.fonts.plexRegular}) format("truetype");font-weight:400}`;
}

/**
 * Page-side fitter: shrinks --s until no [data-zone] overflows (min 0.7). A zone that still
 * overflows (model CSS with fixed px sizes) gets its own text scaled down, to 0.55 at most.
 */
const FIT_SCRIPT = `
window.__fit = function(){
  // Repeat calls (render measures before and after the contrast pass) resume from the last fit.
  var root=document.documentElement, s=parseFloat(root.style.getPropertyValue('--s'))||1, k=1;
  function overZone(z){ return z.scrollHeight>z.clientHeight+1||z.scrollWidth>z.clientWidth+1; }
  function over(){
    var zones=document.querySelectorAll('[data-zone]');
    for(var i=0;i<zones.length;i++){ if(overZone(zones[i])) return true; }
    return false;
  }
  while(over() && s>0.7){ s=Math.round((s-0.04)*100)/100; root.style.setProperty('--s', String(s)); }
  var zones=document.querySelectorAll('[data-zone]');
  for(var i=0;i<zones.length;i++){
    var z=zones[i], els=[z].concat(Array.prototype.slice.call(z.querySelectorAll('*')));
    var f=parseFloat(z.dataset.fk||'1');
    if(!z.dataset.fk) els.forEach(function(el){ el.dataset.fs=String(parseFloat(getComputedStyle(el).fontSize)); });
    while(overZone(z) && f>0.55){
      f=Math.round((f-0.03)*100)/100;
      els.forEach(function(el){ el.style.fontSize=(parseFloat(el.dataset.fs)*f)+'px'; });
    }
    z.dataset.fk=String(f);
    if(f<k) k=f;
  }
  return s*k;
};`;

function base(a: TemplateAssets, b: InfographicBrief, w: number, h: number, css: string, body: string): string {
  // Only our fitter runs: the nonce blocks any script or inline handler that slips into model-written markup.
  const nonce = randomBytes(16).toString("base64");
  const csp = `default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'`;
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>
${fontFaces(a)}
:root{--s:1;--ink:${b.ink};--accent:${b.accent};--wash:${rgb(b.wash)};--a1:0.8;--a2:0.5;--photo:url(${a.heroDataUri})}
body.bg-only .zone,body.bg-only .foot,body.bg-only .ai,body.bg-only .logo,body.bg-only [data-qa]{visibility:hidden}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${w}px;height:${h}px;background:#000}
.canvas{position:relative;width:${w}px;height:${h}px;overflow:hidden;background:${b.wash}}
.photo{position:absolute;background:${b.wash} var(--photo) center/cover no-repeat}
.photo::after{content:"";position:absolute;inset:0}
.logo-shade{position:absolute;width:640px;height:540px;border-radius:50%;background:radial-gradient(closest-side,rgba(20,28,40,.55),rgba(20,28,40,0));pointer-events:none}
.logo{position:absolute;width:170px;height:auto}
.logo svg{width:100%;height:auto;display:block}
.kicker{font:600 calc(32px*var(--s))/1.35 Plex;color:var(--accent)}
.title{font:900 calc(104px*var(--s))/1.18 HC;color:var(--ink)}
.title .hl{color:var(--accent)}
.hero .v{font:900 calc(168px*var(--s))/1 Alex;color:var(--accent);direction:ltr;unicode-bidi:isolate;text-align:right}
.hero .u{font:800 calc(46px*var(--s))/1.15 Alex;color:var(--ink)}
.hero .c{font:600 calc(32px*var(--s))/1.4 Plex;color:var(--ink);opacity:.92}
.fig .v{font:900 calc(88px*var(--s))/1 Alex;color:var(--accent);direction:ltr;unicode-bidi:isolate;text-align:right;white-space:nowrap}
.fig .vu{font:800 calc(30px*var(--s))/1.25 Alex;color:var(--accent);margin-top:6px}
.fig .l{font:600 calc(28px*var(--s))/1.35 Plex;color:var(--ink);margin-top:8px}
.pts{display:flex;flex-direction:column;gap:calc(26px*var(--s))}
.pt{display:flex;gap:calc(22px*var(--s));align-items:flex-start}
.pt .n{font:900 calc(46px*var(--s))/1.05 Alex;color:var(--accent);direction:ltr;unicode-bidi:isolate;flex:none;min-width:calc(64px*var(--s))}
.pt .t{font:800 calc(44px*var(--s))/1.2 Alex;color:var(--ink)}
.pt .x{font:600 calc(29px*var(--s))/1.45 Plex;color:var(--ink);opacity:.92;margin-top:4px}
.ai{font:400 22px Plex;color:rgba(255,255,255,.82);text-shadow:0 1px 6px rgba(0,0,0,.7)}
${css}
</style><script nonce="${nonce}">${FIT_SCRIPT}</script></head><body><div class="canvas">${body}</div></body></html>`;
}

function heroHtml(b: InfographicBrief, wide: boolean): string {
  if (!b.hero) return "";
  const v = `<div class="v">${escapeHtml(b.hero.value)}</div>`;
  const rest = `<div class="u">${escapeHtml(b.hero.unit)}</div><div class="c">${escapeHtml(b.hero.caption)}</div>`;
  return `<div class="hero" data-qa="hero">${wide ? `${v}<div>${rest}</div>` : v + rest}</div>`;
}

/** Points mode: short numbered points; the order is the story's own, so 01–04 carry meaning. */
function pointsHtml(b: InfographicBrief, max: number): string {
  const items = b.points
    .slice(0, max)
    .map(
      (p, i) =>
        `<div class="pt" data-qa="point"><div class="n">${String(i + 1).padStart(2, "0")}</div><div><div class="t">${escapeHtml(p.title)}</div>${
          p.text ? `<div class="x">${escapeHtml(p.text)}</div>` : ""
        }</div></div>`,
    )
    .join("");
  return `<div class="pts">${items}</div>`;
}

function figureHtml(f: { value: string; label: string }): string {
  const { num, unit } = splitFigureValue(f.value);
  return `<div class="fig" data-qa="figure"><div class="v">${escapeHtml(num)}</div>${unit ? `<div class="vu">${escapeHtml(unit)}</div>` : ""}<div class="l">${escapeHtml(f.label)}</div></div>`;
}

function titleHtml(b: InfographicBrief): string {
  return `<div class="title" data-qa="title">${b.titleLines.map((l) => titleLineHtml(l, b.highlight)).join("<br>")}</div>`;
}

/**
 * Vertical 1080×1920: text on a solid wash in the upper part, the photo in its own panel at the
 * bottom, fading into the wash. The photo never runs under the text.
 */
export function buildVerticalHtml(b: InfographicBrief, a: TemplateAssets): string {
  const { width, height } = INFOGRAPHIC_STUDIO_CANVAS.vertical;
  const points = b.mode === "points";
  const photoH = verticalPhotoHeight(b);
  const zoneTop = 250;
  const zoneH = height - zoneTop - photoH + 40;
  const css = `
.photo{left:0;right:0;bottom:0;height:${photoH}px}
.photo::after{background:linear-gradient(180deg,rgb(var(--wash)) 0,rgba(var(--wash),.6) ${Math.round(PHOTO_FADE * 0.45)}px,rgba(var(--wash),0) ${PHOTO_FADE}px)}
.foot-scrim{position:absolute;left:0;right:0;bottom:0;height:260px;background:linear-gradient(0deg,rgba(0,0,0,.55),rgba(0,0,0,0))}
.logo-shade{top:-170px;right:-190px}
.logo{top:60px;right:64px}
.zone{position:absolute;right:64px;left:64px;top:${zoneTop}px;height:${zoneH}px;display:flex;flex-direction:column;justify-content:center;gap:calc(${points ? 34 : 40}px*var(--s));overflow:hidden}
.figs{display:flex;gap:calc(40px*var(--s));justify-content:flex-start;margin-top:calc(6px*var(--s))}
.fig{flex:1 1 0;min-width:0}
.foot{position:absolute;right:64px;left:64px;bottom:52px;display:flex;justify-content:space-between;align-items:flex-end;gap:24px}
.src{font:400 25px/1.45 Plex;color:rgba(255,255,255,.9);text-shadow:0 1px 8px rgba(0,0,0,.6);max-width:640px}
.site{font:600 27px Alex;color:#fff;text-shadow:0 1px 8px rgba(0,0,0,.6)}
.ai{position:absolute;left:64px;bottom:118px}`;
  const figures = b.figures.slice(0, 3).map(figureHtml).join("");
  const body = `
<div class="photo"></div><div class="foot-scrim"></div><div class="logo-shade"></div>
<div class="logo" data-qa="logo">${a.logoWhiteSvg}</div>
<div class="zone" data-zone="main">
  <div class="kicker" data-qa="kicker">${escapeHtml(b.kicker)}</div>
  ${titleHtml(b)}
  ${points ? pointsHtml(b, 4) : `${heroHtml(b, false)}${figures ? `<div class="figs">${figures}</div>` : ""}`}
</div>
<div class="ai" data-qa="ai-label">${AI_IMAGE_LABEL}</div>
<div class="foot"><div class="src" data-qa="source">${escapeHtml(b.sourceLine)}</div><div class="site">sabq.org</div></div>`;
  return base(a, b, width, height, css, body);
}

/** Wide 1920×1080 cover: photo panel on the left fading into the wash, title and one number on the right. */
export function buildWideHtml(b: InfographicBrief, a: TemplateAssets): string {
  const { width, height } = INFOGRAPHIC_STUDIO_CANVAS.wide;
  const css = `
.photo{left:0;top:0;bottom:0;width:${WIDE_PHOTO_WIDTH}px}
.photo::after{background:linear-gradient(270deg,rgb(var(--wash)) 0,rgba(var(--wash),.6) ${Math.round(PHOTO_FADE * 0.45)}px,rgba(var(--wash),0) ${PHOTO_FADE}px)}
.logo-shade{top:-170px;right:-190px}
.logo{top:56px;right:70px}
.zone{position:absolute;top:240px;bottom:110px;right:110px;left:${WIDE_PHOTO_WIDTH - 20}px;display:flex;flex-direction:column;justify-content:center;gap:calc(34px*var(--s));overflow:hidden}
.title{font-size:calc(112px*var(--s))}
.hero{display:flex;align-items:baseline;gap:28px}
.hero .v{font-size:calc(160px*var(--s))}
.ai{position:absolute;left:40px;bottom:30px}`;
  const body = `
<div class="photo"></div><div class="logo-shade"></div>
<div class="logo" data-qa="logo">${a.logoWhiteSvg}</div>
<div class="zone" data-zone="main">
  ${titleHtml(b)}
  ${b.hero ? heroHtml(b, true) : `<div class="kicker" data-qa="kicker">${escapeHtml(b.kicker)}</div>`}
</div>
<div class="ai" data-qa="ai-label">${AI_IMAGE_LABEL}</div>`;
  return base(a, b, width, height, css, body);
}

/**
 * A canvas designed by the art-director step: its CSS and markup inside the house shell (fonts,
 * colours, fitter, `--photo`). Both arrive sanitised; placeholders are filled here.
 */
export function buildDesignedHtml(
  b: InfographicBrief,
  a: TemplateAssets,
  kind: "vertical" | "wide",
  design: { css: string; html: string },
): string {
  const { width, height } = INFOGRAPHIC_STUDIO_CANVAS[kind];
  const body = design.html
    .replaceAll("{{LOGO_WHITE}}", a.logoWhiteSvg)
    .replaceAll("{{LOGO_COLOR}}", a.logoColorSvg ?? a.logoWhiteSvg)
    .replaceAll("{{AI_LABEL}}", AI_IMAGE_LABEL);
  const css = `
.canvas{direction:rtl}
.canvas [data-qa=logo] svg{width:100%;height:auto;display:block}
${design.css}`;
  return base(a, b, width, height, css, body);
}

/** Article body: two short paragraphs as escaped `<p>` blocks. */
export function buildBodyHtml(paragraphs: string[]): string {
  return paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("");
}
