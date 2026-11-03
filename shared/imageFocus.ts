// تركيز الصورة: حساب موضع القص (object-position) لكل إطار من «مربع الموضوع».
//
// الكاشف (server/services/imageFocusDetector.ts) يحفظ في articles.image_focal_point:
//   { x, y }            مركز الموضوع كنسبة مئوية (يبقى للتوافق مع iOS والإصدارات القديمة)
//   box: {x,y,w,h}      مربع الوجه/الموضوع الرئيسي كنسب مئوية من الصورة الأصلية
//   iw, ih              أبعاد الصورة الأصلية بالبكسل
//   kind                "face" | "group" | "subject"
// نقطة يدوية من المحرر تحمل x,y فقط، فتُستخدم كما هي.
//
// منطق خالص بلا DOM حتى يُختبر في tests/unit.

export interface ImageFocusBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ImageFocusData {
  x: number;
  y: number;
  needsReview?: boolean;
  confidence?: "high" | "medium" | "low";
  box?: ImageFocusBox;
  iw?: number;
  ih?: number;
  kind?: "face" | "group" | "subject";
  source?: "gemini-box" | "manual";
}

export type FocusFrameMode = "hero" | "card";

export interface FocusPlacement {
  objectPosition: string;
  /** أسفل مربع الموضوع داخل الإطار المعروض (0 أعلى الإطار، 1 أسفله). null عند غياب المربع. */
  subjectBottom: number | null;
}

/** الافتراضي عند غياب نقطة موثوقة: الثلث العلوي، لأن الوجوه في صور الأخبار غالبًا في الأعلى. */
export const DEFAULT_FOCUS_POSITION = "50% 30%";

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const pct = (v: number) => `${Math.round(v * 10) / 10}%`;

function readNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** يقرأ بيانات التركيز من الخبر (camelCase أو snake_case) ويتحقق من صحتها. */
export function readImageFocus(article: unknown): ImageFocusData | null {
  if (!article || typeof article !== "object") return null;
  const a = article as Record<string, unknown>;
  const raw = (a.imageFocalPoint ?? a.image_focal_point) as Record<string, unknown> | null | undefined;
  if (!raw || typeof raw !== "object") return null;
  const x = readNumber(raw.x);
  const y = readNumber(raw.y);
  if (x === null || y === null) return null;
  const out: ImageFocusData = { x: clamp(x, 0, 100), y: clamp(y, 0, 100) };
  const b = raw.box as Record<string, unknown> | undefined;
  const iw = readNumber(raw.iw);
  const ih = readNumber(raw.ih);
  if (b && typeof b === "object" && iw && ih && iw > 0 && ih > 0) {
    const bx = readNumber(b.x), by = readNumber(b.y), bw = readNumber(b.w), bh = readNumber(b.h);
    if (bx !== null && by !== null && bw !== null && bh !== null && bw > 0 && bh > 0) {
      out.box = { x: clamp(bx, 0, 100), y: clamp(by, 0, 100), w: clamp(bw, 0, 100), h: clamp(bh, 0, 100) };
      out.iw = iw;
      out.ih = ih;
      if (raw.kind === "face" || raw.kind === "group" || raw.kind === "subject") out.kind = raw.kind;
    }
  }
  return out;
}

/**
 * موضع CSS بلا معرفة بمقاس الإطار: يُستخدم قبل القياس، وللنقاط اليدوية والقديمة.
 * النقطة 50/50 بالضبط كانت تخمين الكاشف القديم في معظم الصور، فتُعامل كغياب نقطة.
 */
export function legacyObjectPosition(focus: ImageFocusData | null): string {
  if (!focus) return DEFAULT_FOCUS_POSITION;
  if (focus.box) {
    // تقدير معقول قبل القياس: مركز الموضوع أفقيًا، وأعلاه عموديًا.
    return `${pct(focus.box.x + focus.box.w / 2)} ${pct(clamp(focus.box.y, 0, 100))}`;
  }
  if (focus.x === 50 && focus.y === 50) return DEFAULT_FOCUS_POSITION;
  return `${pct(focus.x)} ${pct(focus.y)}`;
}

/**
 * يحسب موضع القص لإطار بعرض/ارتفاع معيّنين.
 * - قص أفقي (الصورة أعرض من الإطار): يتوسط الموضوع. إن كان أعرض من الإطار (وجهان متباعدان)
 *   يتوسط مركز النقطة المحفوظة x التي يضعها الكاشف على الوجه الأوضح.
 * - قص عمودي: يبقى أعلى الموضوع (مع هامش للشماغ/الغترة) قرب أعلى الإطار.
 *   في البارزة يُترك أسفل الإطار للعنوان.
 */
export function computeFocusPlacement(
  focus: ImageFocusData | null,
  frameW: number,
  frameH: number,
  mode: FocusFrameMode = "card",
): FocusPlacement {
  if (!focus || !focus.box || !focus.iw || !focus.ih || frameW <= 0 || frameH <= 0) {
    return { objectPosition: legacyObjectPosition(focus), subjectBottom: null };
  }
  const R = frameW / frameH;
  const imgR = focus.iw / focus.ih;
  const bx = focus.box.x / 100, by = focus.box.y / 100, bw = focus.box.w / 100, bh = focus.box.h / 100;

  let posX = 50;
  let posY = 50;
  let visTop = 0;
  let visH = 1;

  if (imgR > R) {
    // الإطار أضيق: يظهر جزء من العرض فقط.
    const visW = R / imgR;
    const center = bw <= visW * 0.95 ? bx + bw / 2 : focus.x / 100;
    const left = clamp(center - visW / 2, 0, 1 - visW);
    posX = (left / (1 - visW)) * 100;
  } else if (imgR < R) {
    // الإطار أعرض: يظهر جزء من الارتفاع فقط.
    visH = imgR / R;
    // هامش فوق الوجه يعادل 60% من ارتفاعه حتى لا يُقص الشماغ.
    const headroom = focus.kind === "subject" ? 0.08 * bh : 0.6 * (focus.kind === "group" ? bh / 2 : bh);
    const subjectTop = Math.max(0, by - headroom);
    let top = subjectTop - 0.06 * visH;
    const maxBottom = mode === "hero" ? 0.9 : 0.96;
    if (by + bh > top + visH * maxBottom) {
      // الموضوع أطول من الإطار: نضع مركزه في الثلث العلوي للبارزة، والوسط للبطاقة.
      top = by + bh * 0.42 - (mode === "hero" ? 0.3 : 0.45) * visH;
    }
    visTop = clamp(top, 0, 1 - visH);
    posY = (visTop / (1 - visH)) * 100;
  }

  const subjectBottom = clamp((by + bh - visTop) / visH, 0, 1.5);
  return { objectPosition: `${pct(posX)} ${pct(posY)}`, subjectBottom };
}

/** أعلى نقطة يبدأ عندها العنوان فوق صورة البارزة (نسبة من ارتفاع الإطار). */
export const HERO_CAPTION_TOP = 0.66;
/** على الجوال الإطار أقصر فيبدأ العنوان (سطران + التاريخ) قرب منتصفه. */
export const HERO_CAPTION_TOP_MOBILE = 0.52;

/**
 * هل يغطي العنوان الوجه في البارزة؟ عندها يُعرض العنوان تحت الصورة بدل فوقها.
 * يُحسب بنسبة إطار ثابتة (لا بالقياس) حتى لا يتذبذب الشكل عند تغيّر المقاس.
 */
export function heroCaptionShouldMoveBelow(
  focus: ImageFocusData | null,
  frameRatio: number,
  captionTop: number = HERO_CAPTION_TOP,
): boolean {
  if (!focus?.box || focus.kind === "subject") return false;
  const p = computeFocusPlacement(focus, frameRatio * 1000, 1000, "hero");
  return p.subjectBottom !== null && p.subjectBottom > captionTop;
}

/**
 * يحوّل مربعات الكاشف (نسب 0..1) إلى بيانات التركيز المحفوظة.
 * faces: وجوه مرتبة أو غير مرتبة؛ subject: مربع الموضوع عند غياب الوجوه.
 */
export function buildFocusFromBoxes(input: {
  faces: ImageFocusBox[];
  subject?: ImageFocusBox | null;
  iw: number;
  ih: number;
}): Pick<ImageFocusData, "x" | "y" | "box" | "iw" | "ih" | "kind"> | null {
  const faces = input.faces.filter((f) => f.w > 0 && f.h > 0 && f.w * f.h >= 0.0015);
  if (faces.length) {
    const sorted = [...faces].sort((a, b) => b.w * b.h - a.w * a.h);
    const main = sorted[0];
    const group = sorted.filter((f) => f.w * f.h >= 0.35 * main.w * main.h);
    const x0 = Math.min(...group.map((f) => f.x));
    const y0 = Math.min(...group.map((f) => f.y));
    const x1 = Math.max(...group.map((f) => f.x + f.w));
    const y1 = Math.max(...group.map((f) => f.y + f.h));
    const box = { x: x0 * 100, y: y0 * 100, w: (x1 - x0) * 100, h: (y1 - y0) * 100 };
    return {
      // x على الوجه الأوضح: يُستخدم عندما لا تتسع البطاقة لكل الوجوه.
      x: Math.round((main.x + main.w / 2) * 1000) / 10,
      y: Math.round((main.y + main.h * 0.42) * 1000) / 10,
      box: roundBox(box),
      iw: input.iw,
      ih: input.ih,
      kind: group.length > 1 ? "group" : "face",
    };
  }
  const s = input.subject;
  if (s && s.w > 0 && s.h > 0) {
    return {
      x: Math.round((s.x + s.w / 2) * 1000) / 10,
      y: Math.round((s.y + s.h / 2) * 1000) / 10,
      box: roundBox({ x: s.x * 100, y: s.y * 100, w: s.w * 100, h: s.h * 100 }),
      iw: input.iw,
      ih: input.ih,
      kind: "subject",
    };
  }
  return null;
}

function roundBox(b: ImageFocusBox): ImageFocusBox {
  const r = (v: number) => Math.round(clamp(v, 0, 100) * 10) / 10;
  return { x: r(b.x), y: r(b.y), w: r(b.w), h: r(b.h) };
}

// ── تحليل رد Gemini (خالص، مختبر في tests/unit/imageFocus.test.ts) ──

/** يحوّل [ymin,xmin,ymax,xmax] بمقياس 0..1000 إلى مربع 0..1، أو null إن كان غير صالح. */
export function parseGeminiBox(raw: unknown): ImageFocusBox | null {
  if (!Array.isArray(raw) || raw.length !== 4) return null;
  const n = raw.map((v) => Number(v));
  if (n.some((v) => !Number.isFinite(v))) return null;
  const [ymin, xmin, ymax, xmax] = n.map((v) => Math.min(Math.max(v, 0), 1000) / 1000);
  if (xmax <= xmin || ymax <= ymin) return null;
  return { x: xmin, y: ymin, w: xmax - xmin, h: ymax - ymin };
}

export function parseFocusResponse(text: string): { faces: ImageFocusBox[]; subject: ImageFocusBox | null; description: string } {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("no JSON in focus response");
  const parsed = JSON.parse(match[0]) as { faces?: unknown; subject?: unknown; description?: unknown };
  const faces = Array.isArray(parsed.faces)
    ? parsed.faces.map(parseGeminiBox).filter((b): b is ImageFocusBox => b !== null)
    : [];
  return {
    faces,
    subject: parseGeminiBox(parsed.subject),
    description: typeof parsed.description === "string" ? parsed.description.slice(0, 200) : "",
  };
}
