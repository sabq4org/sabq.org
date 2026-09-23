/**
 * استخراج نصّ PDF كأسطر مرتّبة (pdfjs-dist) — تقارير ساما جداول بسيطة تكفيها
 * إعادة تجميع العناصر حسب الإحداثي y ثم ترتيبها حسب x.
 */
export interface PdfTextItem {
  x: number;
  y: number;
  str: string;
}

export interface PdfLine {
  y: number;
  items: PdfTextItem[];
  text: string;
}

export interface PdfPageText {
  page: number;
  lines: PdfLine[];
}

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
let pdfjsPromise: Promise<PdfJs> | null = null;
function loadPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromise) pdfjsPromise = import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjsPromise;
}

/** يجمّع العناصر التي تتقارب y بينها ضمن `yTolerance` نقطة في سطر واحد. */
export async function extractPdfPages(buffer: Buffer | Uint8Array, yTolerance = 3): Promise<PdfPageText[]> {
  const pdfjs = await loadPdfJs();
  const data = buffer instanceof Uint8Array ? new Uint8Array(buffer) : new Uint8Array(buffer);
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true, disableFontFace: true, isEvalSupported: false })
    .promise;
  const pages: PdfPageText[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const items: PdfTextItem[] = [];
      for (const it of content.items) {
        if (!("str" in it) || !it.str.trim()) continue;
        items.push({ x: it.transform[4], y: it.transform[5], str: it.str.trim() });
      }
      items.sort((a, b) => b.y - a.y || a.x - b.x);
      const lines: PdfLine[] = [];
      for (const it of items) {
        const last = lines[lines.length - 1];
        if (last && Math.abs(last.y - it.y) <= yTolerance) last.items.push(it);
        else lines.push({ y: it.y, items: [it], text: "" });
      }
      for (const l of lines) {
        l.items.sort((a, b) => a.x - b.x);
        l.text = l.items.map((i) => i.str).join(" ");
      }
      pages.push({ page: p, lines });
    }
  } finally {
    await doc.destroy();
  }
  return pages;
}
