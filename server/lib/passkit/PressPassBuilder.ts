import { PassBuilder, PressPassData } from './PassBuilder';
import { PKPass } from 'passkit-generator';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Arabic Wallet fields: right-aligned for RTL legibility. */
const RTL_FIELD = { textAlignment: 'PKTextAlignmentRight' as const };

// ────────────────────────────────────────────────────────────────────
// 2026-07-21 redesign (نمط Blinq المعتمد من المالك):
// بطاقة Generic زرقاء صافية بلون سبق — الاسم كبيراً مع صورة شخصية
// دائرية على الجهة المقابلة، المسمى الوظيفي والجهة تحته كحقول أصلية،
// وQR مربع كبير أسفل الوسط (نمط generic يرسمه هكذا تلقائياً).
// لا strip بعد اليوم: نمط generic لا يدعمه أصلاً، وحقول Apple الأصلية
// تعطي Dynamic Type نظيفاً كما في بطاقة المرجع.
// ────────────────────────────────────────────────────────────────────

/**
 * شعار سبق مبيّضاً بالكامل لخانة اللوقو أعلى-يسار البطاقة (أزرق داكن
 * على أزرق لا يُقرأ): قناع الشفافية من الأصل + تعبئة بيضاء.
 *
 * Apple's hard limits for logo.png: 1x 160×50, 2x 320×100, 3x 480×150.
 */
async function buildWhiteSabqLogoBuffers(): Promise<{ x1: Buffer; x2: Buffer; x3: Buffer } | null> {
  const src = path.resolve(process.cwd(), 'public/branding/sabq-logo.png');
  if (!fs.existsSync(src)) {
    console.warn('[PressPassBuilder] logo source missing at', src);
    return null;
  }
  try {
    const whiten = async (height: number): Promise<Buffer> => {
      const resized = await sharp(src).resize({ height, withoutEnlargement: true }).png().toBuffer();
      const meta = await sharp(resized).metadata();
      const alpha = await sharp(resized).ensureAlpha().extractChannel('alpha').toBuffer();
      return sharp({
        create: {
          width: meta.width ?? height,
          height: meta.height ?? height,
          channels: 3,
          background: { r: 255, g: 255, b: 255 },
        },
      })
        .joinChannel(alpha)
        .png()
        .toBuffer();
    };
    const [x1, x2, x3] = await Promise.all([whiten(44), whiten(88), whiten(132)]);
    return { x1, x2, x3 };
  } catch (e) {
    console.warn('[PressPassBuilder] sharp logo whitening failed:', e);
    return null;
  }
}

/**
 * الصورة الشخصية دائرية لخانة thumbnail (يمين البطاقة في نمط generic) —
 * الاستدارة تُخبز في الصورة نفسها بقناع SVG لأن Wallet يعرض المصغرة
 * بزوايا خفيفة فقط. مقاس Apple: حتى 90×90pt.
 *
 * الإطار (بطلب المالك): الصورة → فراغ بسيط → حلقة بيضاء رفيعة →
 * حلقة عريضة بأبيض شفيف — نفس لمسة بطاقة المرجع.
 */
async function buildCircularThumbnail(imageUrl: string): Promise<{ x1: Buffer; x2: Buffer; x3: Buffer } | null> {
  try {
    const response = await fetch(imageUrl, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const source = Buffer.from(await response.arrayBuffer());

    const circle = async (size: number): Promise<Buffer> => {
      const photoD = Math.round(size * 0.72);
      const resized = await sharp(source).resize(photoD, photoD, { fit: 'cover' }).png().toBuffer();
      const mask = Buffer.from(
        `<svg width="${photoD}" height="${photoD}"><circle cx="${photoD / 2}" cy="${photoD / 2}" r="${photoD / 2}" fill="#fff"/></svg>`,
      );
      const circled = await sharp(resized).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();

      const c = size / 2;
      const gap = size * 0.02;
      const thinW = size * 0.028;
      const wideW = size * 0.065;
      const thinR = photoD / 2 + gap + thinW / 2;
      const wideR = photoD / 2 + gap + thinW + wideW / 2;
      const rings = Buffer.from(
        `<svg width="${size}" height="${size}">` +
          `<circle cx="${c}" cy="${c}" r="${wideR}" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="${wideW}"/>` +
          `<circle cx="${c}" cy="${c}" r="${thinR}" fill="none" stroke="#ffffff" stroke-width="${thinW}"/>` +
          `</svg>`,
      );

      const offset = Math.round((size - photoD) / 2);
      return sharp({
        create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
      })
        .composite([
          { input: circled, left: offset, top: offset },
          { input: rings, left: 0, top: 0 },
        ])
        .png()
        .toBuffer();
    };

    const [x1, x2, x3] = await Promise.all([circle(88), circle(176), circle(264)]);
    return { x1, x2, x3 };
  } catch (e) {
    console.warn('[PressPassBuilder] thumbnail build failed:', e);
    return null;
  }
}

export class PressPassBuilder extends PassBuilder {
  constructor(passTypeId: string, teamId: string) {
    super(passTypeId, teamId);
  }

  getTemplatePath(): string {
    // Always use the source template, not the dist version
    return path.resolve(process.cwd(), 'server/lib/passkit/pass-template.pass');
  }

  getPassDescription(): string {
    return 'Sabq Smart Press Card';
  }

  getOrganizationName(): string {
    return 'سبق الذكية';
  }

  // أزرق سبق الرسمي المشتق من primary الويب HSL(203.89, 88.28%, 53.14%).
  protected getBackgroundColor(): string {
    return 'rgb(28, 164, 240)';
  }

  protected getForegroundColor(): string {
    return 'rgb(255, 255, 255)';
  }

  protected getLabelColor(): string {
    return 'rgb(219, 240, 254)';
  }

  async configurePassFields(pass: PKPass, data: PressPassData): Promise<void> {
    // شعار سبق الأبيض أعلى-يسار (المكافئ لشعار Blinq في المرجع).
    try {
      const logos = await buildWhiteSabqLogoBuffers();
      if (logos) {
        pass.addBuffer('logo.png', logos.x1);
        pass.addBuffer('logo@2x.png', logos.x2);
        pass.addBuffer('logo@3x.png', logos.x3);
      }
    } catch (e) {
      console.warn('[PressPassBuilder] logo injection failed, continuing without:', e);
    }

    // الصورة الشخصية الدائرية يمين البطاقة (thumbnail في نمط generic).
    if (data.profileImageUrl) {
      try {
        const thumbs = await buildCircularThumbnail(data.profileImageUrl);
        if (thumbs) {
          pass.addBuffer('thumbnail.png', thumbs.x1);
          pass.addBuffer('thumbnail@2x.png', thumbs.x2);
          pass.addBuffer('thumbnail@3x.png', thumbs.x3);
        }
      } catch (e) {
        console.warn('[PressPassBuilder] thumbnail injection failed, continuing without:', e);
      }
    }

    // أعلى-يمين: هوية البطاقة (المكافئ لـ "MUBASHER / Blinq Card").
    pass.headerFields.push({
      key: 'card_kind',
      label: 'صحيفة سبق',
      value: 'بطاقة صحفية',
      ...RTL_FIELD,
    });

    // الاسم — البطل البصري (label صغير وvalue ضخم في نمط generic).
    pass.primaryFields.push({
      key: 'name',
      label: 'الاسم',
      value: data.userName,
    });

    // المسمى الوظيفي ثم الجهة — صفان كما في المرجع.
    if (data.jobTitle) {
      pass.secondaryFields.push({
        key: 'job_title',
        label: 'المسمى الوظيفي',
        value: data.jobTitle,
      });
    }

    pass.auxiliaryFields.push({
      key: 'company',
      label: 'الجهة',
      value: data.department || 'صحيفة سبق الإلكترونية',
    });

    // وجه البطاقة نظيف كالمرجع — رقم البطاقة والصلاحية في الخلف.
    if (data.pressIdNumber) {
      pass.backFields.push({
        key: 'press_id',
        label: 'رقم البطاقة',
        value: data.pressIdNumber,
        ...RTL_FIELD,
      });
    }

    if (data.validUntil) {
      pass.backFields.push({
        key: 'valid_until',
        label: 'صالحة حتى',
        value: data.validUntil.toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        ...RTL_FIELD,
      });
    }

    pass.backFields.push(
      {
        key: 'description',
        label: 'عن البطاقة',
        value: 'بطاقة هوية صحفية رسمية صادرة من صحيفة سبق الإلكترونية',
        ...RTL_FIELD,
      },
      {
        key: 'website',
        label: 'الموقع الإلكتروني',
        value: 'https://sabq.org',
        ...RTL_FIELD,
      },
    );
  }
}
