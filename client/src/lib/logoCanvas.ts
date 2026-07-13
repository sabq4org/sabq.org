// أدوات معالجة الشعارات (اللوقوهات) لصورة الخبر البارزة:
// رسم الشعار على لوحة 16:9 بخلفية بيضاء بدل قصّه بـ object-fit: cover.
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

    // cover: نقص من مصدر الصورة مستطيلاً بنسبة النصف متمحوراً حول نقطة
    // التركيز (مثبّتاً داخل الحدود) ثم نرسمه ممتلئاً
    const drawCovering = (photo: LoadedLogo, dx: number, focal?: FocalPoint | null) => {
      const targetRatio = halfW / halfH;
      const sourceRatio = photo.width / photo.height;
      let sw = photo.width;
      let sh = photo.height;
      if (sourceRatio > targetRatio) {
        sw = photo.height * targetRatio; // أعرض من اللازم — نقص الجانبين
      } else {
        sh = photo.width / targetRatio; // أطول من اللازم — نقص الأعلى والأسفل
      }
      const fx = clamp(focal?.fx ?? 0.5, 0, 1);
      const fy = clamp(focal?.fy ?? 0.5, 0, 1);
      const sx = clamp(fx * photo.width - sw / 2, 0, photo.width - sw);
      const sy = clamp(fy * photo.height - sh / 2, 0, photo.height - sh);
      ctx.drawImage(photo.source, sx, sy, sw, sh, dx, 0, halfW, halfH);
    };

    drawCovering(first, halfW + PHOTO_GAP_PX, options.firstFocal); // يمين
    drawCovering(second, 0, options.secondFocal); // يسار

    return await canvasToBlob(canvas);
  } finally {
    first.cleanup();
    second.cleanup();
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
