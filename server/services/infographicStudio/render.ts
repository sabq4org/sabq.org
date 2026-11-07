/**
 * «إنفو للموقع» — headless render + checks on the exported page itself.
 * Uses the runtime Chromium already in the Railway image (same resolution as the PR-report PDF).
 * One render at a time per replica: Chromium is heavy and the API shares the box.
 *
 * Checks: fonts loaded, nothing overflows its zone or the canvas, no text blocks overlap, title lines,
 * a non-blank export, and legibility: the page is shot once without text, and the background under
 * every text block is measured. Busy or low-contrast areas get a stronger scrim (up to 3 passes).
 */
import fs from "fs";
import sharp from "sharp";
import type { Page } from "puppeteer";
import { withAiProvenance } from "../../utils/aiImageProvenance";

export interface LayoutReport {
  scale: number;
  fontsLoaded: boolean;
  overflow: string[];
  overlaps: string[];
  titleLines: number;
  /** Text blocks whose background stayed busy or low-contrast after the strongest scrim. */
  lowContrast: string[];
  /** True when the exported PNG is a flat colour (failed paint). */
  blank: boolean;
}

export interface RenderedCanvas {
  png: Buffer;
  report: LayoutReport;
}

/** Hard failures block the job; everything else becomes an editor-facing warning. */
export function layoutProblems(report: LayoutReport, maxTitleLines = 2): { hard: string[]; warnings: string[] } {
  const hard: string[] = [];
  const warnings: string[] = [];
  if (report.blank) hard.push("خرجت الصورة المصدّرة فارغة");
  if (!report.fontsLoaded) hard.push("لم تُحمَّل خطوط سبق في التصميم");
  if (report.overflow.length) hard.push(`نص خارج مساحته: ${report.overflow.join("، ")}`);
  if (report.overlaps.length) warnings.push(`تداخل بين: ${report.overlaps.join("، ")}`);
  if (report.titleLines > maxTitleLines) warnings.push(`العنوان في ${report.titleLines} أسطر`);
  if (report.scale < 0.8) warnings.push("صُغّرت النصوص لتتسع؛ راجع وضوحها على الجوال");
  if (report.lowContrast.length) warnings.push(`خلفية مزدحمة أو تباين ضعيف تحت: ${report.lowContrast.join("، ")}`);
  return { hard, warnings };
}

/** WCAG relative luminance of an sRGB colour (0–255 channels). */
export function luminance([r, g, b]: number[]): number {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(a: number[], b: number[]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Legible: strong contrast (≥ 4.5) on any background, or large-text contrast (≥ 3) on a calm one.
 * `bgStdev` is the busiest channel's standard deviation under the text, with the text hidden.
 */
export function isLegible(ink: number[], bgMean: number[], bgStdev: number): boolean {
  const ratio = contrastRatio(ink, bgMean);
  return ratio >= 4.5 || (ratio >= 3 && bgStdev <= 40);
}

function resolveChrome(): string {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    "/usr/bin/sabq-chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome-stable",
  ].filter(Boolean) as string[];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  throw new Error("CHROME_NOT_FOUND");
}

let queue: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

interface TextBox {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  ink: number[];
}

async function measureLayout(page: Page) {
  return page.evaluate(async () => {
    const w = window as unknown as { __fit: () => number };
    await document.fonts.ready;
    const scale = w.__fit();
    const fontsLoaded = ["900 40px HC", "900 40px Alex", "600 20px Plex"].every((f) => document.fonts.check(f));
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const overflow: string[] = [];
    document.querySelectorAll<HTMLElement>("[data-zone]").forEach((z) => {
      if (z.scrollHeight > z.clientHeight + 1 || z.scrollWidth > z.clientWidth + 1) overflow.push(z.dataset.zone || "zone");
    });
    const all = Array.from(document.querySelectorAll<HTMLElement>("[data-qa]")).map((el) => ({ el, name: el.dataset.qa || "", r: el.getBoundingClientRect() }));
    all.forEach((b) => {
      if (b.r.right > vw + 1 || b.r.left < -1 || b.r.bottom > vh + 1 || b.r.top < -1) overflow.push(b.name);
    });
    const overlaps: string[] = [];
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i].r;
        const b = all[j].r;
        const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (ix > 2 && iy > 2) overlaps.push(`${all[i].name}/${all[j].name}`);
      }
    }
    const title = document.querySelector<HTMLElement>("[data-qa=title]");
    const lh = title ? parseFloat(getComputedStyle(title).lineHeight) : 1;
    const titleLines = title && lh > 0 ? Math.round(title.getBoundingClientRect().height / lh) : 0;
    // Legibility is judged on the text itself, not on the logo or the small AI label.
    const boxes = all
      .filter((b) => !["logo", "ai-label"].includes(b.name))
      .flatMap((b) => {
        const parts = b.el.children.length ? Array.from(b.el.children as HTMLCollectionOf<HTMLElement>) : [b.el];
        return parts.map((el, k) => {
          // Tight box around the glyphs: a block element spans the whole row, text often does not.
          const range = document.createRange();
          range.selectNodeContents(el);
          const r = range.getBoundingClientRect();
          const m = getComputedStyle(el).color.match(/\d+(\.\d+)?/g) || ["0", "0", "0"];
          return { name: parts.length > 1 ? `${b.name}:${k + 1}` : b.name, x: r.left, y: r.top, w: r.width, h: r.height, ink: m.slice(0, 3).map(Number) };
        });
      })
      .filter((b) => b.w > 4 && b.h > 4);
    return { scale, fontsLoaded, overflow, overlaps, titleLines, boxes };
  });
}

async function illegibleBoxes(page: Page, boxes: TextBox[], width: number, height: number): Promise<string[]> {
  await page.evaluate(() => document.body.classList.add("bg-only"));
  const bg = Buffer.from(await page.screenshot({ type: "png" }));
  await page.evaluate(() => document.body.classList.remove("bg-only"));
  const bad: string[] = [];
  for (const b of boxes) {
    const left = Math.max(0, Math.floor(b.x));
    const top = Math.max(0, Math.floor(b.y));
    const w = Math.min(width - left, Math.ceil(b.w));
    const h = Math.min(height - top, Math.ceil(b.h));
    if (w < 4 || h < 4) continue;
    // stats() reads the whole input and ignores extract(); crop to a buffer first.
    const crop = await sharp(bg).extract({ left, top, width: w, height: h }).png().toBuffer();
    const s = await sharp(crop).stats();
    const mean = s.channels.slice(0, 3).map((c) => c.mean);
    const stdev = Math.max(...s.channels.slice(0, 3).map((c) => c.stdev));
    if (!isLegible(b.ink, mean, stdev)) {
      if (process.env.INFOGRAPHIC_STUDIO_DEBUG) console.log("[infographic-studio] weak", b.name, JSON.stringify([left, top, w, h]), JSON.stringify(mean.map(Math.round)), JSON.stringify(b.ink), contrastRatio(b.ink, mean).toFixed(2), stdev.toFixed(1));
      bad.push(b.name);
    }
  }
  return bad;
}

/** Scrim strengths tried in order; the last one is close to an opaque wash. */
const SCRIM_STEPS: Array<[number, number]> = [
  [0.8, 0.5],
  [0.88, 0.72],
  [0.94, 0.86],
];

export function renderCanvases(pages: Array<{ html: string; width: number; height: number }>): Promise<RenderedCanvas[]> {
  return exclusive(async () => {
    const puppeteer = await import("puppeteer");
    const browser = await puppeteer.default.launch({
      headless: true,
      executablePath: resolveChrome(),
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--font-render-hinting=none"],
    } as Parameters<typeof puppeteer.default.launch>[0]);
    try {
      const out: RenderedCanvas[] = [];
      for (const p of pages) {
        const page = await browser.newPage();
        await page.setViewport({ width: p.width, height: p.height, deviceScaleFactor: 1 });
        await page.setContent(p.html, { waitUntil: "load", timeout: 60_000 });
        let layout = await measureLayout(page);
        let lowContrast: string[] = [];
        for (const [a1, a2] of SCRIM_STEPS) {
          await page.evaluate(
            (x, y) => {
              document.documentElement.style.setProperty("--a1", String(x));
              document.documentElement.style.setProperty("--a2", String(y));
            },
            a1,
            a2,
          );
          lowContrast = await illegibleBoxes(page, layout.boxes, p.width, p.height);
          if (lowContrast.length === 0) break;
        }
        layout = await measureLayout(page);
        // Viewport == canvas. A `clip` screenshot came back black with newer Chromium builds.
        const shot = Buffer.from(await page.screenshot({ type: "png" }));
        await page.close();
        const stats = await sharp(shot).stats();
        const report: LayoutReport = {
          scale: layout.scale,
          fontsLoaded: layout.fontsLoaded,
          overflow: layout.overflow,
          overlaps: layout.overlaps,
          titleLines: layout.titleLines,
          lowContrast,
          blank: stats.channels.slice(0, 3).every((c) => c.stdev < 4),
        };
        const png = await withAiProvenance(sharp(shot).png({ compressionLevel: 9 })).toBuffer();
        out.push({ png, report });
      }
      return out;
    } finally {
      await browser.close().catch(() => undefined);
    }
  });
}
