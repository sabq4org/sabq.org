/**
 * «إنفو للموقع» — HTML for the two canvases. Pure string builders (unit-tested); fonts, logo and the
 * hero photo arrive as data URIs so the headless page never touches the network.
 *
 * House rules baked in: Handicrafts Black for the title, heavy Alexandria (800–900) for numbers,
 * IBM Plex for small text, the original white Sabq logo top-right over a soft shade, no boxes or
 * borders, one hero photo, an «AI-generated image» label, RTL. Every text block carries `data-qa`
 * so the renderer can measure overflow and overlaps on the exported page itself.
 */
import { INFOGRAPHIC_STUDIO_CANVAS } from "@shared/infographicStudio";
import type { InfographicBrief } from "./brief";

export interface TemplateAssets {
  heroDataUri: string;
  logoWhiteSvg: string;
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

/** Scrim alpha is a CSS variable so the renderer can strengthen it when text sits on a busy area. */
const washAt = (alphaVar: string) => `rgba(var(--wash),var(${alphaVar}))`;

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

/** Title line with the highlight word wrapped once, everything escaped. */
export function titleLineHtml(line: string, highlight: string): string {
  if (!highlight || !line.includes(highlight)) return escapeHtml(line);
  const i = line.indexOf(highlight);
  return `${escapeHtml(line.slice(0, i))}<span class="hl">${escapeHtml(highlight)}</span>${escapeHtml(line.slice(i + highlight.length))}`;
}

function fontFaces(a: TemplateAssets): string {
  return `
@font-face{font-family:HC;src:url(${a.fonts.handicraftsBlack}) format("opentype");font-weight:900}
@font-face{font-family:Alex;src:url(${a.fonts.alexandriaArabic}) format("woff2");font-weight:100 900}
@font-face{font-family:Alex;src:url(${a.fonts.alexandriaLatin}) format("woff2");font-weight:100 900;unicode-range:U+0000-00FF}
@font-face{font-family:Plex;src:url(${a.fonts.plexSemiBold}) format("truetype");font-weight:600}
@font-face{font-family:Plex;src:url(${a.fonts.plexRegular}) format("truetype");font-weight:400}`;
}

/** Page-side fitter: shrinks --s until no [data-qa] block overflows its zone (min 0.7). */
const FIT_SCRIPT = `
window.__fit = function(){
  var root=document.documentElement, s=1;
  function over(){
    var zones=document.querySelectorAll('[data-zone]');
    for(var i=0;i<zones.length;i++){var z=zones[i]; if(z.scrollHeight>z.clientHeight+1||z.scrollWidth>z.clientWidth+1) return true;}
    return false;
  }
  while(over() && s>0.7){ s=Math.round((s-0.04)*100)/100; root.style.setProperty('--s', String(s)); }
  return s;
};`;

function base(a: TemplateAssets, b: InfographicBrief, w: number, h: number, css: string, body: string): string {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>
${fontFaces(a)}
:root{--s:1;--ink:${b.ink};--accent:${b.accent};--wash:${rgb(b.wash)};--a1:0.8;--a2:0.5}
body.bg-only .zone,body.bg-only .foot,body.bg-only .ai,body.bg-only .logo{visibility:hidden}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${w}px;height:${h}px;background:#000}
.canvas{position:relative;width:${w}px;height:${h}px;overflow:hidden;background:${b.wash} url(${a.heroDataUri}) center/cover no-repeat}
.logo-shade{position:absolute;width:640px;height:540px;border-radius:50%;background:radial-gradient(closest-side,rgba(20,28,40,.55),rgba(20,28,40,0));pointer-events:none}
.logo{position:absolute;width:170px;height:auto}
.logo svg{width:100%;height:auto;display:block}
.kicker{font:600 calc(32px*var(--s))/1.35 Plex;color:var(--accent)}
.title{font:900 calc(104px*var(--s))/1.18 HC;color:var(--ink)}
.title .hl{color:var(--accent)}
.hero .v{font:900 calc(168px*var(--s))/1 Alex;color:var(--accent);direction:ltr;unicode-bidi:isolate;text-align:right}
.hero .u{font:800 calc(46px*var(--s))/1.15 Alex;color:var(--ink)}
.hero .c{font:600 calc(32px*var(--s))/1.4 Plex;color:var(--ink);opacity:.92}
.fig .v{font:900 calc(84px*var(--s))/1 Alex;color:var(--accent);direction:ltr;unicode-bidi:isolate;text-align:right}
.fig .l{font:600 calc(28px*var(--s))/1.35 Plex;color:var(--ink);margin-top:8px}
.ai{font:400 22px Plex;color:rgba(255,255,255,.82);text-shadow:0 1px 6px rgba(0,0,0,.7)}
${css}
</style><script>${FIT_SCRIPT}</script></head><body><div class="canvas">${body}</div></body></html>`;
}

export function buildVerticalHtml(b: InfographicBrief, a: TemplateAssets): string {
  const { width, height } = INFOGRAPHIC_STUDIO_CANVAS.vertical;
  const top = b.textZone === "top";
  const shadow = b.theme === "dark" ? "text-shadow:0 2px 18px rgba(0,0,0,.6);" : "text-shadow:0 0 22px rgba(255,255,255,.35);";
  const css = `
.scrim{position:absolute;left:0;right:0;${top ? "top:0" : "bottom:0"};height:1400px;background:linear-gradient(${top ? "180deg" : "0deg"},${washAt("--a1")} 0,${washAt("--a2")} 62%,rgba(var(--wash),0) 92%)}
.foot-scrim{position:absolute;left:0;right:0;bottom:0;height:260px;background:linear-gradient(0deg,rgba(0,0,0,.55),rgba(0,0,0,0))}
.logo-shade{top:-170px;right:-190px}
.logo{top:60px;right:64px}
.zone{position:absolute;right:64px;left:64px;${top ? "top:250px;height:900px" : "bottom:170px;height:900px"};display:flex;flex-direction:column;justify-content:${top ? "flex-start" : "flex-end"};gap:calc(30px*var(--s));overflow:hidden;${shadow}}
.figs{display:flex;gap:calc(44px*var(--s));justify-content:flex-start}
.fig{flex:1 1 0;min-width:0}
.foot{position:absolute;right:64px;left:64px;bottom:52px;display:flex;justify-content:space-between;align-items:flex-end;gap:24px}
.src{font:400 25px/1.45 Plex;color:rgba(255,255,255,.88);text-shadow:0 1px 8px rgba(0,0,0,.6);max-width:640px}
.site{font:600 27px Alex;color:#fff;text-shadow:0 1px 8px rgba(0,0,0,.6)}
.ai{position:absolute;left:64px;${top ? "bottom:118px" : "top:72px"}}`;
  const figures = b.figures
    .slice(0, 3)
    .map((f) => `<div class="fig" data-qa="figure"><div class="v">${escapeHtml(f.value)}</div><div class="l">${escapeHtml(f.label)}</div></div>`)
    .join("");
  const body = `
<div class="scrim"></div><div class="foot-scrim"></div><div class="logo-shade"></div>
<div class="logo" data-qa="logo">${a.logoWhiteSvg}</div>
<div class="zone" data-zone="main">
  <div class="kicker" data-qa="kicker">${escapeHtml(b.kicker)}</div>
  <div class="title" data-qa="title">${b.titleLines.map((l) => titleLineHtml(l, b.highlight)).join("<br>")}</div>
  <div class="hero" data-qa="hero"><div class="v">${escapeHtml(b.hero.value)}</div><div class="u">${escapeHtml(b.hero.unit)}</div><div class="c">${escapeHtml(b.hero.caption)}</div></div>
  <div class="figs">${figures}</div>
</div>
<div class="ai" data-qa="ai-label">${AI_IMAGE_LABEL}</div>
<div class="foot"><div class="src" data-qa="source">${escapeHtml(b.sourceLine)}</div><div class="site">sabq.org</div></div>`;
  return base(a, b, width, height, css, body);
}

export function buildWideHtml(b: InfographicBrief, a: TemplateAssets): string {
  const { width, height } = INFOGRAPHIC_STUDIO_CANVAS.wide;
  const shadow = b.theme === "dark" ? "text-shadow:0 2px 18px rgba(0,0,0,.6);" : "text-shadow:0 0 22px rgba(255,255,255,.35);";
  const css = `
.scrim{position:absolute;top:0;bottom:0;right:0;width:1240px;background:linear-gradient(270deg,${washAt("--a1")} 0,${washAt("--a2")} 45%,rgba(var(--wash),0) 100%)}
.logo-shade{top:-170px;right:-190px}
.logo{top:56px;right:70px}
.zone{position:absolute;top:150px;bottom:110px;right:300px;width:980px;display:flex;flex-direction:column;justify-content:center;gap:calc(34px*var(--s));overflow:hidden;${shadow}}
.title{font-size:calc(124px*var(--s))}
.hero{display:flex;align-items:baseline;gap:28px}
.hero .v{font-size:calc(170px*var(--s))}
.ai{position:absolute;left:40px;bottom:30px}`;
  const body = `
<div class="scrim"></div><div class="logo-shade"></div>
<div class="logo" data-qa="logo">${a.logoWhiteSvg}</div>
<div class="zone" data-zone="main">
  <div class="title" data-qa="title">${b.titleLines.map((l) => titleLineHtml(l, b.highlight)).join("<br>")}</div>
  <div class="hero" data-qa="hero"><div class="v">${escapeHtml(b.hero.value)}</div><div><div class="u">${escapeHtml(b.hero.unit)}</div><div class="c">${escapeHtml(b.hero.caption)}</div></div></div>
</div>
<div class="ai" data-qa="ai-label">${AI_IMAGE_LABEL}</div>`;
  return base(a, b, width, height, css, body);
}

/** Article body: two short paragraphs as escaped `<p>` blocks. */
export function buildBodyHtml(paragraphs: string[]): string {
  return paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("");
}
