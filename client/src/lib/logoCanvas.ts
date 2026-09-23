// أدوات معالجة الشعارات (اللوقوهات) وصور الأشخاص لصورة الخبر البارزة:
// رسم الشعار على لوحة 16:9 بخلفية بيضاء بدل قصّه بـ object-fit: cover،
// والصورة الشخصية الطولية على امتداد خلفيتها الأصلية.
// المعالجة كلها في المتصفح — الناتج ملف جاهز للرفع عبر /api/media/upload.

export const LOGO_CANVAS_WIDTH = 1200;
export const LOGO_CANVAS_HEIGHT = 675;

// هامش داخلي حول الشعار كنسبة من ارتفاع اللوحة (المواصفة: 10-12%)
const PADDING_RATIO = 0.12;

const JPEG_QUALITY = 0.92;
const DIVIDER_COLOR = "#E5E7EB";
const DIVIDER_WIDTH = 2;
const DIVIDER_HEIGHT_RATIO = 0.6;

export interface MergeLogosOptions {
  /** رسم خط فاصل رمادي فاتح في منتصف اللوحة */
  divider?: boolean;
}

/** منطقة اقتصاص بإحداثيات بكسل الصورة الأصلية (وليس أبعاد المعاينة) */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface LoadedLogo {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
}

async function loadLogo(file: File): Promise<LoadedLogo> {
  // createImageBitmap أسرع، لكن دعمه لـ SVG غير مضمون — نستخدم Image كمسار بديل
  if (typeof createImageBitmap === "function" && file.type !== "image/svg+xml") {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close(),
      };
    } catch {
      // بعض الصيغ تفشل هنا وتنجح عبر Image — نكمل للمسار البديل
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("تعذر قراءة ملف الشعار"));
      el.src = url;
    });
    if (!img.naturalWidth || !img.naturalHeight) {
      throw new Error("تعذر تحديد أبعاد الشعار (ملف SVG بدون أبعاد؟)");
    }
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      cleanup: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function createWhiteCanvas(): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const canvas = document.createElement("canvas");
  canvas.width = LOGO_CANVAS_WIDTH;
  canvas.height = LOGO_CANVAS_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("المتصفح لا يدعم معالجة الصور (Canvas)");
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, LOGO_CANVAS_WIDTH, LOGO_CANVAS_HEIGHT);
  return { canvas, ctx };
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("فشل إنشاء الصورة النهائية"));
      },
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}

/**
 * ضبط شعار واحد: توسيطه على لوحة 1200×675 بيضاء بأقصى حجم ممكن
 * دون قص ودون تشويه النسبة (contain)، مع هامش داخلي حوله.
 */
export async function renderFittedLogo(file: File): Promise<Blob> {
  const logo = await loadLogo(file);
  try {
    const { canvas, ctx } = createWhiteCanvas();
    const pad = LOGO_CANVAS_HEIGHT * PADDING_RATIO;
    const availW = LOGO_CANVAS_WIDTH - pad * 2;
    const availH = LOGO_CANVAS_HEIGHT - pad * 2;
    const scale = Math.min(availW / logo.width, availH / logo.height);
    const w = logo.width * scale;
    const h = logo.height * scale;
    ctx.drawImage(
      logo.source,
      (LOGO_CANVAS_WIDTH - w) / 2,
      (LOGO_CANVAS_HEIGHT - h) / 2,
      w,
      h,
    );
    return await canvasToBlob(canvas);
  } finally {
    logo.cleanup();
  }
}

/**
 * اقتصاص حر: قص المنطقة المحددة من الصورة (بإحداثيات البكسل الأصلية)
 * ثم توسيطها على لوحة 1200×675 بيضاء بنفس منطق ضبط الشعار (contain + هامش).
 */
export async function renderCroppedImage(
  file: File,
  crop: CropRect,
): Promise<Blob> {
  const logo = await loadLogo(file);
  try {
    // قصر التحديد على حدود الصورة — إحداثيات المعاينة قد تتجاوزها بكسور
    const sx = Math.max(0, Math.min(crop.x, logo.width - 1));
    const sy = Math.max(0, Math.min(crop.y, logo.height - 1));
    const sw = Math.min(crop.width, logo.width - sx);
    const sh = Math.min(crop.height, logo.height - sy);
    if (sw < 1 || sh < 1) {
      throw new Error("منطقة الاقتصاص خارج حدود الصورة");
    }

    const { canvas, ctx } = createWhiteCanvas();
    const pad = LOGO_CANVAS_HEIGHT * PADDING_RATIO;
    const availW = LOGO_CANVAS_WIDTH - pad * 2;
    const availH = LOGO_CANVAS_HEIGHT - pad * 2;
    const scale = Math.min(availW / sw, availH / sh);
    const w = sw * scale;
    const h = sh * scale;
    ctx.drawImage(
      logo.source,
      sx,
      sy,
      sw,
      sh,
      (LOGO_CANVAS_WIDTH - w) / 2,
      (LOGO_CANVAS_HEIGHT - h) / 2,
      w,
      h,
    );
    return await canvasToBlob(canvas);
  } finally {
    logo.cleanup();
  }
}

/**
 * دمج شعارين جنباً إلى جنب على لوحة 1200×675 بيضاء.
 * الشعار الأول في النصف الأيمن والثاني في الأيسر (ترتيب عربي).
 *
 * الموازنة البصرية: contain وحده يجعل الشعار العريض يبدو أضخم من المربع،
 * لذا نوحّد المساحة المرئية — نستهدف نفس sqrt(العرض×الارتفاع) للشعارين
 * عند أكبر قيمة يتّسع لها صندوقا النصفين معاً.
 */
export async function renderMergedLogos(
  firstFile: File,
  secondFile: File,
  options: MergeLogosOptions = {},
): Promise<Blob> {
  const [first, second] = await Promise.all([
    loadLogo(firstFile),
    loadLogo(secondFile),
  ]);
  try {
    const { canvas, ctx } = createWhiteCanvas();
    const halfW = LOGO_CANVAS_WIDTH / 2;
    const pad = LOGO_CANVAS_HEIGHT * PADDING_RATIO;
    const boxW = halfW - pad * 2;
    const boxH = LOGO_CANVAS_HEIGHT - pad * 2;

    const visualSize = (logo: LoadedLogo) => Math.sqrt(logo.width * logo.height);
    const maxScale = (logo: LoadedLogo) =>
      Math.min(boxW / logo.width, boxH / logo.height);

    // أكبر مقياس بصري مشترك يظل فيه كلا الشعارين داخل صندوقه
    const targetVisual = Math.min(
      maxScale(first) * visualSize(first),
      maxScale(second) * visualSize(second),
    );

    const drawInHalf = (logo: LoadedLogo, centerX: number) => {
      const scale = targetVisual / visualSize(logo);
      const w = logo.width * scale;
      const h = logo.height * scale;
      ctx.drawImage(
        logo.source,
        centerX - w / 2,
        (LOGO_CANVAS_HEIGHT - h) / 2,
        w,
        h,
      );
    };

    drawInHalf(first, LOGO_CANVAS_WIDTH - halfW / 2); // يمين
    drawInHalf(second, halfW / 2); // يسار

    if (options.divider) {
      const dividerH = LOGO_CANVAS_HEIGHT * DIVIDER_HEIGHT_RATIO;
      ctx.fillStyle = DIVIDER_COLOR;
      ctx.fillRect(
        (LOGO_CANVAS_WIDTH - DIVIDER_WIDTH) / 2,
        (LOGO_CANVAS_HEIGHT - dividerH) / 2,
        DIVIDER_WIDTH,
        dividerH,
      );
    }

    return await canvasToBlob(canvas);
  } finally {
    first.cleanup();
    second.cleanup();
  }
}

// عرض الفراغ الأبيض بين الصورتين في دمج الصور
const PHOTO_GAP_PX = 14;

/** نقطة تركيز نسبية داخل الصورة (0..1) — مركز الوجه/الموضوع المهم */
export interface FocalPoint {
  fx: number;
  fy: number;
}

export interface MergePhotosOptions {
  /** تركيز الصورة الأولى (اليمنى) — الافتراضي مركز الصورة */
  firstFocal?: FocalPoint | null;
  /** تركيز الصورة الثانية (اليسرى) — الافتراضي مركز الصورة */
  secondFocal?: FocalPoint | null;
  /**
   * تكبير/تصغير نسبةً إلى وضع cover: ‏1 = ملء النصف بالكامل (الافتراضي)،
   * أقل من 1 = تصغير يُظهر جزءاً أكبر من الصورة مع فراغ أبيض حولها —
   * للصور ذات الأبعاد المتطرفة التي يبترها القص مهما تحرّكت.
   */
  firstZoom?: number;
  secondZoom?: number;
}

/**
 * أدنى zoom مفيد لصورة داخل نصف الدمج: عنده تظهر الصورة كاملة (contain).
 * القيم الأدنى لا تضيف شيئاً سوى تصغير فارغ.
 */
export function minPhotoZoom(dims: { w: number; h: number }): number {
  const halfW = (LOGO_CANVAS_WIDTH - PHOTO_GAP_PX) / 2;
  const cover = Math.max(halfW / dims.w, LOGO_CANVAS_HEIGHT / dims.h);
  const contain = Math.min(halfW / dims.w, LOGO_CANVAS_HEIGHT / dims.h);
  return contain / cover;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

/**
 * دمج صورتين (فوتوغرافيتين) جنباً إلى جنب على لوحة 1200×675.
 * عكس دمج الشعارات: كل صورة تملأ نصفها بالكامل (cover) مع قص للفائض —
 * بلا هوامش خارجية، وبينهما فراغ أبيض رفيع فقط.
 * الصورة الأولى في النصف الأيمن والثانية في الأيسر (ترتيب عربي).
 *
 * القص واعٍ بنقطة التركيز: نافذة القص تنزاح لتتمركز حول نقطة التركيز
 * (وجه الشخص مثلاً) بدل مركز الصورة، مع تثبيتها داخل حدود الصورة —
 * فلا يُبتر الوجه في الصور التي يقع موضوعها بعيداً عن المنتصف.
 */
export async function renderMergedPhotos(
  firstFile: File,
  secondFile: File,
  options: MergePhotosOptions = {},
): Promise<Blob> {
  const [first, second] = await Promise.all([
    loadLogo(firstFile),
    loadLogo(secondFile),
  ]);
  try {
    const { canvas, ctx } = createWhiteCanvas();
    const halfW = (LOGO_CANVAS_WIDTH - PHOTO_GAP_PX) / 2;
    const halfH = LOGO_CANVAS_HEIGHT;

    // الرسم بمقياس zoom نسبةً إلى cover: عند 1 تملأ الصورة نصفها ويُقص
    // الفائض حول نقطة التركيز؛ عند التصغير يظهر جزء أكبر، وما دون حجم
    // النصف تتوسط الصورة على الخلفية البيضاء في ذلك المحور
    const drawPhoto = (photo: LoadedLogo, dxBase: number, focal?: FocalPoint | null, zoom = 1) => {
      const coverScale = Math.max(halfW / photo.width, halfH / photo.height);
      const containScale = Math.min(halfW / photo.width, halfH / photo.height);
      const scale = Math.max(coverScale * clamp(zoom, 0.05, 3), containScale);
      const fx = clamp(focal?.fx ?? 0.5, 0, 1);
      const fy = clamp(focal?.fy ?? 0.5, 0, 1);

      const drawnW = photo.width * scale;
      const drawnH = photo.height * scale;

      let sx = 0;
      let sw = photo.width;
      let dx = dxBase;
      let dw = halfW;
      if (drawnW >= halfW) {
        sw = halfW / scale;
        sx = clamp(fx * photo.width - sw / 2, 0, photo.width - sw);
      } else {
        dx = dxBase + (halfW - drawnW) / 2;
        dw = drawnW;
      }

      let sy = 0;
      let sh = photo.height;
      let dy = 0;
      let dh = halfH;
      if (drawnH >= halfH) {
        sh = halfH / scale;
        sy = clamp(fy * photo.height - sh / 2, 0, photo.height - sh);
      } else {
        dy = (halfH - drawnH) / 2;
        dh = drawnH;
      }

      ctx.drawImage(photo.source, sx, sy, sw, sh, dx, dy, dw, dh);
    };

    drawPhoto(first, halfW + PHOTO_GAP_PX, options.firstFocal, options.firstZoom); // يمين
    drawPhoto(second, 0, options.secondFocal, options.secondZoom); // يسار

    return await canvasToBlob(canvas);
  } finally {
    first.cleanup();
    second.cleanup();
  }
}

// ── صورة شخص (بورتريه) ──
// صورة رسمية طولية لا تُقص ولا تُموَّه ولا توضع على أبيض: تتوسط اللوحة بكامل
// ارتفاعها، وتُمدّ خلفيتها الأصلية على بقية العرض ثم تذوب حافتاها فيها.

type Rgb = [number, number, number];

// نصف الصورة العلوي فقط يُعتمد للون الخلفية — السفلي غالباً كتفان وبشت
const BACKDROP_SAMPLE_RATIO = 0.5;
// تنعيم رأسي (نسبة من الارتفاع) يمحو تفاصيل الحافة ويُبقي تدرّج الاستوديو
const BACKDROP_SMOOTH_RATIO = 0.09;
// تعتيم تدريجي للنصف السفلي الممتد حتى لا يبدو اللون مسطحاً
const BACKDROP_BOTTOM_DARKEN = 0.35;
// متوسط انحراف بكسلات الحافة عن لون صفها — فوقه الخلفية «مزدحمة» (مكتب، شارع)
const BACKDROP_BUSY_THRESHOLD = 18;
// بديل الخلفية المزدحمة: لون محايد داكن مشتق من ألوان الصورة نفسها
const BACKDROP_NEUTRAL: Rgb = [20, 22, 26];
const BACKDROP_NEUTRAL_MIX = 0.82;

/**
 * يبني لون كل صف في الخلفية الممتدة من شريطي حافتي الصورة (RGBA بعرض stripWidth).
 * يرجع busy=true حين لا تكون الحافة خلفية متجانسة — عندها تُستبدل بلون محايد
 * داكن بدل مدّ تفاصيل مزدحمة تتحول إلى خطوط قبيحة.
 */
export function buildPortraitBackdrop(
  left: Uint8ClampedArray,
  right: Uint8ClampedArray,
  stripWidth: number,
  height: number,
): { rows: Rgb[]; busy: boolean } {
  const sampleRows = Math.max(1, Math.floor(height * BACKDROP_SAMPLE_RATIO));
  const rowColors: Rgb[] = [];
  let deviation = 0;
  let samples = 0;

  for (let y = 0; y < sampleRows; y++) {
    const sum: Rgb = [0, 0, 0];
    for (const strip of [left, right]) {
      for (let x = 0; x < stripWidth; x++) {
        const i = (y * stripWidth + x) * 4;
        sum[0] += strip[i];
        sum[1] += strip[i + 1];
        sum[2] += strip[i + 2];
      }
    }
    const n = stripWidth * 2;
    const avg: Rgb = [sum[0] / n, sum[1] / n, sum[2] / n];
    rowColors.push(avg);
    for (const strip of [left, right]) {
      for (let x = 0; x < stripWidth; x++) {
        const i = (y * stripWidth + x) * 4;
        deviation +=
          (Math.abs(strip[i] - avg[0]) +
            Math.abs(strip[i + 1] - avg[1]) +
            Math.abs(strip[i + 2] - avg[2])) /
          3;
        samples++;
      }
    }
  }

  const busy = samples > 0 && deviation / samples > BACKDROP_BUSY_THRESHOLD;

  if (busy) {
    const mean: Rgb = [0, 0, 0];
    for (const c of rowColors) {
      mean[0] += c[0];
      mean[1] += c[1];
      mean[2] += c[2];
    }
    const base = mean.map(
      (v, i) =>
        (v / rowColors.length) * (1 - BACKDROP_NEUTRAL_MIX) +
        BACKDROP_NEUTRAL[i] * BACKDROP_NEUTRAL_MIX,
    ) as Rgb;
    const rows: Rgb[] = [];
    for (let y = 0; y < height; y++) {
      const k = 1 - 0.2 * (y / Math.max(1, height - 1));
      rows.push([base[0] * k, base[1] * k, base[2] * k].map(Math.round) as Rgb);
    }
    return { rows, busy };
  }

  const radius = Math.max(1, Math.round(height * BACKDROP_SMOOTH_RATIO));
  const rows: Rgb[] = [];
  for (let y = 0; y < sampleRows; y++) {
    const from = Math.max(0, y - radius);
    const to = Math.min(sampleRows - 1, y + radius);
    const acc: Rgb = [0, 0, 0];
    for (let j = from; j <= to; j++) {
      acc[0] += rowColors[j][0];
      acc[1] += rowColors[j][1];
      acc[2] += rowColors[j][2];
    }
    const count = to - from + 1;
    rows.push(acc.map((v) => Math.round(v / count)) as Rgb);
  }
  const last = rows[rows.length - 1];
  for (let y = sampleRows; y < height; y++) {
    const t = (y - sampleRows) / Math.max(1, height - sampleRows);
    const k = 1 - BACKDROP_BOTTOM_DARKEN * t;
    rows.push([last[0] * k, last[1] * k, last[2] * k].map(Math.round) as Rgb);
  }
  return { rows, busy };
}

// أطول صورة تُعرض كاملة (عرض/ارتفاع) — الأطول منها تُقص من الأعلى حول الوجه
// حتى لا يصغر الوجه في صور الجسم الكامل
const PORTRAIT_MIN_ASPECT = 0.62;
const PORTRAIT_CROP_ASPECT = 0.75;
const PORTRAIT_FEATHER_PX = 110;
const PORTRAIT_EDGE_STRIP_PX = 8;

export interface PortraitOptions {
  /** مركز الوجه — يوجّه القص في الصور الطويلة جداً فقط */
  focal?: FocalPoint | null;
}

/**
 * صورة شخص: الصورة الطولية تتوسط لوحة 1200×675 بكامل ارتفاعها دون قص،
 * وتُمدّ خلفيتها الأصلية (لون الاستوديو) على بقية العرض مع تذويب الحافتين.
 * التوسيط مقصود: قوائم الموقع تقص الصورة مربعاً أو 4:3 من المنتصف،
 * فيبقى الوجه سليماً في كل القصّات.
 */
export async function renderPortraitPhoto(
  file: File,
  options: PortraitOptions = {},
): Promise<Blob> {
  const photo = await loadLogo(file);
  try {
    const W = LOGO_CANVAS_WIDTH;
    const H = LOGO_CANVAS_HEIGHT;
    const { canvas, ctx } = createWhiteCanvas();
    const fx = clamp(options.focal?.fx ?? 0.5, 0, 1);
    const fy = clamp(options.focal?.fy ?? 0.3, 0, 1);

    // صورة أعرض من 16:9 أصلاً لا تحتاج امتداداً: تملأ اللوحة حول الوجه
    if (photo.width / photo.height >= W / H) {
      const sw = photo.height * (W / H);
      const sx = clamp(fx * photo.width - sw / 2, 0, photo.width - sw);
      ctx.drawImage(photo.source, sx, 0, sw, photo.height, 0, 0, W, H);
      return await canvasToBlob(canvas);
    }

    let sy = 0;
    let sh = photo.height;
    if (photo.width / photo.height < PORTRAIT_MIN_ASPECT) {
      sh = photo.width / PORTRAIT_CROP_ASPECT;
      // الوجه في الثلث العلوي من القصّة؛ بلا اكتشاف وجه نثبت أعلى الصورة
      sy = options.focal ? clamp(fy * photo.height - sh * 0.35, 0, photo.height - sh) : 0;
    }

    const drawnW = Math.max(1, Math.round((photo.width * H) / sh));
    const layer = document.createElement("canvas");
    layer.width = drawnW;
    layer.height = H;
    const lctx = layer.getContext("2d", { willReadFrequently: true });
    if (!lctx) throw new Error("المتصفح لا يدعم معالجة الصور (Canvas)");
    lctx.imageSmoothingEnabled = true;
    lctx.imageSmoothingQuality = "high";
    lctx.drawImage(photo.source, 0, sy, photo.width, sh, 0, 0, drawnW, H);

    const strip = Math.max(1, Math.min(PORTRAIT_EDGE_STRIP_PX, Math.floor(drawnW / 10)));
    const left = lctx.getImageData(0, 0, strip, H).data;
    const right = lctx.getImageData(drawnW - strip, 0, strip, H).data;
    const { rows } = buildPortraitBackdrop(left, right, strip, H);
    rows.forEach(([r, g, b], y) => {
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(0, y, W, 1);
    });

    // تعتيم خفيف للأطراف يعطي عمق خلفية الاستوديو
    const vignette = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.35, W / 2, H * 0.45, W * 0.75);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.28)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);

    // تذويب حافتي الصورة في الخلفية الممتدة — لا خط فاصل
    const feather = Math.min(PORTRAIT_FEATHER_PX, drawnW * 0.18) / drawnW;
    const mask = lctx.createLinearGradient(0, 0, drawnW, 0);
    mask.addColorStop(0, "rgba(0,0,0,0)");
    mask.addColorStop(feather, "rgba(0,0,0,1)");
    mask.addColorStop(1 - feather, "rgba(0,0,0,1)");
    mask.addColorStop(1, "rgba(0,0,0,0)");
    lctx.globalCompositeOperation = "destination-in";
    lctx.fillStyle = mask;
    lctx.fillRect(0, 0, drawnW, H);

    ctx.drawImage(layer, Math.round((W - drawnW) / 2), 0);
    return await canvasToBlob(canvas);
  } finally {
    photo.cleanup();
  }
}

interface DetectedFaceBox {
  boundingBox: { x: number; y: number; width: number; height: number };
}

/**
 * اكتشاف تلقائي لنقطة التركيز عبر FaceDetector المدمج في المتصفح
 * (Chrome/Edge — غير مدعوم في Safari). يرجع مركز اتحاد مستطيلات الوجوه
 * المكتشفة، أو null حين لا دعم أو لا وجوه — فيبقى التوسيط الافتراضي
 * ويستطيع المحرر تحديد النقطة يدوياً بالنقر.
 */
export async function detectFaceFocalPoint(file: File): Promise<FocalPoint | null> {
  const FaceDetectorCtor = (
    window as unknown as {
      FaceDetector?: new (opts?: { fastMode?: boolean; maxDetectedFaces?: number }) => {
        detect(source: ImageBitmap): Promise<DetectedFaceBox[]>;
      };
    }
  ).FaceDetector;
  if (!FaceDetectorCtor) return null;

  try {
    const bitmap = await createImageBitmap(file);
    try {
      const detector = new FaceDetectorCtor({ fastMode: true, maxDetectedFaces: 5 });
      const faces = await detector.detect(bitmap);
      if (!faces?.length) return null;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const face of faces) {
        const b = face.boundingBox;
        minX = Math.min(minX, b.x);
        minY = Math.min(minY, b.y);
        maxX = Math.max(maxX, b.x + b.width);
        maxY = Math.max(maxY, b.y + b.height);
      }
      return {
        fx: clamp((minX + maxX) / 2 / bitmap.width, 0, 1),
        fy: clamp((minY + maxY) / 2 / bitmap.height, 0, 1),
      };
    } finally {
      bitmap.close();
    }
  } catch {
    return null;
  }
}
