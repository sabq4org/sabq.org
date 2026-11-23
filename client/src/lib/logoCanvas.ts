// أدوات معالجة الشعارات (اللوقوهات) وصور الأشخاص لصورة الخبر البارزة:
// رسم الشعار على لوحة 16:9 بخلفية بيضاء بدل قصّه بـ object-fit: cover،
// والصورة الشخصية الطولية بقص نصفي على خلفية من الصورة نفسها مموّهة.
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
// الصورة الطولية تُقص قصًّا نصفيًا (الرأس والصدر) فيكبر الشخص في اللوحة،
// وتُملأ الجانبان بالصورة نفسها مموّهة ومفتّحة — بلا مدّ ألوان ولا تعتيم.

// نسبة القص النصفي (عرض/ارتفاع): أطول منها يُقص من الأسفل حول الوجه
const PORTRAIT_CROP_ASPECT = 0.9;
// موضع الوجه داخل القصّة (من الأعلى) حين تُعرف نقطة التركيز
const PORTRAIT_FACE_Y_IN_CROP = 0.38;
const PORTRAIT_FEATHER_PX = 60;
// الضبابية: تصغير ثم تكبير (يعمل في كل المتصفحات بما فيها Safari)
const PORTRAIT_BLUR_SCALE = 1 / 28;
// تفتيح الخلفية المموّهة بطبقة بيضاء شفافة
const PORTRAIT_BACKDROP_LIGHTEN = 0.18;

export interface PortraitOptions {
  /** مركز الوجه — يوجّه موضع القص النصفي والخلفية */
  focal?: FocalPoint | null;
}

export interface PortraitLayout {
  /** منطقة الصورة الأمامية من الأصل (بكسل) */
  crop: CropRect;
  /** عرض الصورة الأمامية على اللوحة (ارتفاعها = ارتفاع اللوحة) */
  drawnWidth: number;
}

/**
 * حساب القص النصفي للصورة الطولية: صورة أطول من 0.9 تُقص من الأسفل
 * (أو حول الوجه إن عُرف) حتى يظهر الرأس والصدر بحجم أكبر في اللوحة.
 */
export function computePortraitLayout(
  width: number,
  height: number,
  focal: FocalPoint | null | undefined,
  canvasHeight = LOGO_CANVAS_HEIGHT,
): PortraitLayout {
  let sh = height;
  let sy = 0;
  if (width / height < PORTRAIT_CROP_ASPECT) {
    sh = width / PORTRAIT_CROP_ASPECT;
    if (focal) {
      const fy = clamp(focal.fy, 0, 1);
      sy = clamp(fy * height - sh * PORTRAIT_FACE_Y_IN_CROP, 0, height - sh);
    }
  }
  return {
    crop: { x: 0, y: sy, width, height: sh },
    drawnWidth: Math.max(1, Math.round((width * canvasHeight) / sh)),
  };
}

/**
 * صورة شخص: قص نصفي في منتصف لوحة 1200×675، والجانبان من الصورة نفسها
 * مموّهة ومفتّحة. التوسيط مقصود: قوائم الموقع تقص الصورة مربعاً أو 4:3
 * من المنتصف، فيبقى الوجه سليماً في كل القصّات.
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

    // صورة أعرض من 16:9 أصلاً لا تحتاج خلفية: تملأ اللوحة حول الوجه
    if (photo.width / photo.height >= W / H) {
      const sw = photo.height * (W / H);
      const sx = clamp(fx * photo.width - sw / 2, 0, photo.width - sw);
      ctx.drawImage(photo.source, sx, 0, sw, photo.height, 0, 0, W, H);
      return await canvasToBlob(canvas);
    }

    // الخلفية: الصورة تغطي اللوحة حول الوجه، ثم تُموّه بالتصغير والتكبير
    const bgSh = photo.width * (H / W);
    const bgSy = clamp(fy * photo.height - bgSh * 0.45, 0, photo.height - bgSh);
    const tiny = document.createElement("canvas");
    tiny.width = Math.max(2, Math.round(W * PORTRAIT_BLUR_SCALE));
    tiny.height = Math.max(2, Math.round(H * PORTRAIT_BLUR_SCALE));
    const tctx = tiny.getContext("2d");
    if (!tctx) throw new Error("المتصفح لا يدعم معالجة الصور (Canvas)");
    tctx.imageSmoothingEnabled = true;
    tctx.imageSmoothingQuality = "high";
    tctx.drawImage(photo.source, 0, bgSy, photo.width, bgSh, 0, 0, tiny.width, tiny.height);
    // خطوة وسطى تنعّم التكبير فلا تظهر مربعات
    const mid = document.createElement("canvas");
    mid.width = tiny.width * 4;
    mid.height = tiny.height * 4;
    const mctx = mid.getContext("2d");
    if (!mctx) throw new Error("المتصفح لا يدعم معالجة الصور (Canvas)");
    mctx.imageSmoothingEnabled = true;
    mctx.imageSmoothingQuality = "high";
    mctx.drawImage(tiny, 0, 0, mid.width, mid.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(mid, 0, 0, W, H);
    ctx.fillStyle = `rgba(255,255,255,${PORTRAIT_BACKDROP_LIGHTEN})`;
    ctx.fillRect(0, 0, W, H);

    // الصورة الأمامية: قص نصفي بكامل الارتفاع مع تذويب خفيف للحافتين
    const { crop, drawnWidth } = computePortraitLayout(photo.width, photo.height, options.focal, H);
    const layer = document.createElement("canvas");
    layer.width = drawnWidth;
    layer.height = H;
    const lctx = layer.getContext("2d");
    if (!lctx) throw new Error("المتصفح لا يدعم معالجة الصور (Canvas)");
    lctx.imageSmoothingEnabled = true;
    lctx.imageSmoothingQuality = "high";
    lctx.drawImage(photo.source, crop.x, crop.y, crop.width, crop.height, 0, 0, drawnWidth, H);

    const feather = Math.min(PORTRAIT_FEATHER_PX, drawnWidth * 0.12) / drawnWidth;
    const mask = lctx.createLinearGradient(0, 0, drawnWidth, 0);
    mask.addColorStop(0, "rgba(0,0,0,0)");
    mask.addColorStop(feather, "rgba(0,0,0,1)");
    mask.addColorStop(1 - feather, "rgba(0,0,0,1)");
    mask.addColorStop(1, "rgba(0,0,0,0)");
    lctx.globalCompositeOperation = "destination-in";
    lctx.fillStyle = mask;
    lctx.fillRect(0, 0, drawnWidth, H);

    ctx.drawImage(layer, Math.round((W - drawnWidth) / 2), 0);
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
