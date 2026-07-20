// أصول بطاقة قسيمة سبق بلس في Apple Wallet.
//
// PassKit يثبّت خانة اللوقو في أعلى-يسار البطاقة ولا يوفّر RTL حقيقياً.
// نقرّب الشكل العربي عبر:
//   1) حشوة علوية شفافة داخل صورة اللوقو حتى لا يلاصق الحد المسنّن
//   2) رسم علامة سبق على يمين خانة اللوقو (اتجاه «الجهة الأخرى»)
//   3) مقاسات Apple الرسمية (لا مربّع 751×661 الذي كان في القالب)

import fs from "fs";
import path from "path";
import sharp from "sharp";

const LOGO_SRC = () => path.resolve(process.cwd(), "public/branding/sabq-logo.png");

/** مقاسات خانة اللوقو في Wallet + حشوة علوية داخل الصورة. */
const LOGO_SIZES = [
  { name: "x1" as const, w: 160, h: 50, topPad: 8 },
  { name: "x2" as const, w: 320, h: 100, topPad: 16 },
  { name: "x3" as const, w: 480, h: 150, topPad: 24 },
];

export async function buildCouponLogoBuffers(): Promise<{
  x1: Buffer;
  x2: Buffer;
  x3: Buffer;
} | null> {
  const src = LOGO_SRC();
  if (!fs.existsSync(src)) {
    console.warn("[CouponPassAssets] logo source missing at", src);
    return null;
  }

  try {
    const buffers = await Promise.all(
      LOGO_SIZES.map(async ({ w, h, topPad }) => {
        const contentH = h - topPad;
        // هامش يمين صغير + المحاذاة لليمين داخل الخانة اليسرى.
        const sidePad = Math.round(w * 0.04);
        const resized = await sharp(src)
          .resize({
            height: contentH,
            width: w - sidePad * 2,
            fit: "inside",
            withoutEnlargement: true,
          })
          .png()
          .toBuffer();

        const meta = await sharp(resized).metadata();
        const markW = meta.width ?? contentH;
        const markH = meta.height ?? contentH;
        const left = w - sidePad - markW;
        const top = topPad + Math.max(0, Math.floor((contentH - markH) / 2));

        return sharp({
          create: {
            width: w,
            height: h,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          },
        })
          .composite([{ input: resized, left, top }])
          .png()
          .toBuffer();
      }),
    );

    return { x1: buffers[0], x2: buffers[1], x3: buffers[2] };
  } catch (e) {
    console.warn("[CouponPassAssets] logo build failed:", e);
    return null;
  }
}
