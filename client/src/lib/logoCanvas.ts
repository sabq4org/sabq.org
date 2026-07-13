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

/**
 * دمج صورتين (فوتوغرافيتين) جنباً إلى جنب على لوحة 1200×675.
 * عكس دمج الشعارات: كل صورة تملأ نصفها بالكامل (cover) مع قص متمركز
 * للفائض — بلا هوامش خارجية، وبينهما فراغ أبيض رفيع فقط.
 * الصورة الأولى في النصف الأيمن والثانية في الأيسر (ترتيب عربي).
 */
export async function renderMergedPhotos(
  firstFile: File,
  secondFile: File,
): Promise<Blob> {
  const [first, second] = await Promise.all([
    loadLogo(firstFile),
    loadLogo(secondFile),
  ]);
  try {
    const { canvas, ctx } = createWhiteCanvas();
    const halfW = (LOGO_CANVAS_WIDTH - PHOTO_GAP_PX) / 2;
    const halfH = LOGO_CANVAS_HEIGHT;

    // cover: نقص من مصدر الصورة مستطيلاً بنفس نسبة النصف ثم نرسمه ممتلئاً
    const drawCovering = (photo: LoadedLogo, dx: number) => {
      const targetRatio = halfW / halfH;
      const sourceRatio = photo.width / photo.height;
      let sw = photo.width;
      let sh = photo.height;
      if (sourceRatio > targetRatio) {
        sw = photo.height * targetRatio; // أعرض من اللازم — نقص الجانبين
      } else {
        sh = photo.width / targetRatio; // أطول من اللازم — نقص الأعلى والأسفل
      }
      const sx = (photo.width - sw) / 2;
      const sy = (photo.height - sh) / 2;
      ctx.drawImage(photo.source, sx, sy, sw, sh, dx, 0, halfW, halfH);
    };

    drawCovering(first, halfW + PHOTO_GAP_PX); // يمين
    drawCovering(second, 0); // يسار

    return await canvasToBlob(canvas);
  } finally {
    first.cleanup();
    second.cleanup();
  }
}
