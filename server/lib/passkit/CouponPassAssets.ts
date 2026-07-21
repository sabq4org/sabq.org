// أصول بطاقة قسيمة سبق بلس في Apple Wallet.
//
// شعار سبق أبيض بالكامل (بطلب المالك): نستخرج قناة الشفافية من الشعار
// الأصلي ونملأ صورته بالأبيض — فيظهر نقياً على البنفسجي مهما كانت
// ألوان المصدر. المحاذاة يسار خانة اللوقو (موضع Apple الأصلي) مع هوامش
// مريحة كي لا يلتصق بالحد المسنّن ولا بالإطار.

import fs from "fs";
import path from "path";
import sharp from "sharp";

const LOGO_SRC = () => path.resolve(process.cwd(), "public/branding/sabq-logo.png");

/** مقاسات خانة اللوقو في Wallet + هوامش داخل الصورة. */
const LOGO_SIZES = [
  { name: "x1" as const, w: 160, h: 50, topPad: 8, sidePad: 10 },
  { name: "x2" as const, w: 320, h: 100, topPad: 16, sidePad: 20 },
  { name: "x3" as const, w: 480, h: 150, topPad: 24, sidePad: 30 },
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
      LOGO_SIZES.map(async ({ w, h, topPad, sidePad }) => {
        const bottomPad = Math.round(topPad / 2);
        const contentH = h - topPad - bottomPad;
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

        // تبييض الشعار: قناع الشفافية من الأصل + تعبئة بيضاء.
        const alpha = await sharp(resized).ensureAlpha().extractChannel("alpha").toBuffer();
        const whiteMark = await sharp({
          create: {
            width: markW,
            height: markH,
            channels: 3,
            background: { r: 255, g: 255, b: 255 },
          },
        })
          .joinChannel(alpha)
          .png()
          .toBuffer();

        // محاذاة يسار الخانة (موضع Apple الأصلي) بهامش جانبي.
        const left = sidePad;
        const top = topPad + Math.max(0, Math.floor((contentH - markH) / 2));

        return sharp({
          create: {
            width: w,
            height: h,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          },
        })
          .composite([{ input: whiteMark, left, top }])
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
