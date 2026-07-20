import { PassBuilder, PassData } from './PassBuilder';
import { PKPass } from 'passkit-generator';
import path from 'path';
import { buildCouponLogoBuffers } from './CouponPassAssets';

// بطاقة قسيمة «سبق بلس × ولاء ون» — نمط Coupon في Apple Wallet.
// تُوقَّع بنفس شهادة الولاء (passTypeId واحد يصلح لأي نمط بطاقة)؛
// رمز QR يحمل رقم القسيمة نفسه لأن هذا ما يُمسح عند الشريك.
//
// تخطيط الواجهة الأمامية مقصود أن يكون ضيقاً ويميني المحاذاة:
// القيمة (header) + الشريك (secondary أصغر من primary) + الرمز + الانتهاء.
// لا نستخدم primaryFields لاسم المتجر — Apple يكبّره جداً ويجعله يساراً.
// نص العرض الطويل يذهب للخلف.
export interface CouponPassData extends PassData {
  partnerName: string;
  offer: string;
  valueLabel: string;
  couponCode: string;
  voucherExpiresAt: Date;
}

const RTL = { textAlignment: 'PKTextAlignmentRight' as const };

export class CouponPassBuilder extends PassBuilder {
  constructor(passTypeId: string, teamId: string) {
    super(passTypeId, teamId);
  }

  getTemplatePath(): string {
    // Always use the source template, not the dist version
    return path.resolve(process.cwd(), 'server/lib/passkit/coupon-pass-template.pass');
  }

  getPassDescription(): string {
    return 'Sabq Plus Voucher';
  }

  getOrganizationName(): string {
    return 'سبق بلس';
  }

  protected getBackgroundColor(): string {
    // نفس تدرّج بطاقة العضوية في /plus-preview — هوية سبق بلس لا بنفسجي ولاء ون.
    return 'rgb(13, 27, 42)';
  }

  protected getForegroundColor(): string {
    return 'rgb(234, 243, 251)';
  }

  protected getLabelColor(): string {
    return 'rgb(143, 184, 216)';
  }

  protected getBarcodeMessage(data: CouponPassData): string {
    return data.couponCode;
  }

  async configurePassFields(pass: PKPass, data: CouponPassData): Promise<void> {
    pass.setExpirationDate(data.voucherExpiresAt);

    // لوقو بمقاس صحيح + نزول عن الحد العلوي + علامة سبق يمين الخانة.
    try {
      const logos = await buildCouponLogoBuffers();
      if (logos) {
        pass.addBuffer('logo.png', logos.x1);
        pass.addBuffer('logo@2x.png', logos.x2);
        pass.addBuffer('logo@3x.png', logos.x3);
      }
    } catch (e) {
      console.warn('[CouponPassBuilder] logo injection failed, using template logos:', e);
    }

    const expiresLabel = data.voucherExpiresAt.toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

    pass.headerFields.push({
      key: 'value',
      label: 'القيمة',
      value: data.valueLabel,
      ...RTL,
    });

    // secondary أصغر من primary ويتراص عمودياً — يفتح مسافة قبل صف الانتهاء/الرمز
    // ولا يلاصق تسمية «قسيمة» حقول auxiliary كما كان مع primary الضخم.
    pass.secondaryFields.push({
      key: 'partner',
      label: 'قسيمة',
      value: data.partnerName,
      ...RTL,
    });

    // عمودان: نضع الانتهاء أولاً ثم الرمز حتى يظهر الرمز يميناً في تدفّق عربي
    // (Apple يرصف auxiliary من اليسار لليمين حسب ترتيب الإدخال).
    pass.auxiliaryFields.push({
      key: 'expires',
      label: 'صالحة حتى',
      value: expiresLabel,
      ...RTL,
    });

    pass.auxiliaryFields.push({
      key: 'code',
      label: 'رقم القسيمة',
      value: data.couponCode,
      ...RTL,
    });

    pass.backFields.push(
      {
        key: 'offer',
        label: 'العرض',
        value: data.offer,
        ...RTL,
      },
      {
        key: 'holder',
        label: 'صاحب القسيمة',
        value: data.userName,
        ...RTL,
      },
      {
        key: 'how',
        label: 'طريقة الاستخدام',
        value: 'أبرِز رمز QR أو رقم القسيمة عند الشريك قبل الدفع.',
        ...RTL,
      },
      {
        key: 'terms',
        label: 'الشروط',
        value:
          'صادرة من برنامج سبق بلس عبر ولاء ون. تسري شروط وأحكام ولاء ون والشريك، ولا يمكن استرداد النقاط بعد الإصدار.',
        ...RTL,
      },
      {
        key: 'website',
        label: 'الموقع الإلكتروني',
        value: 'https://sabq.org',
        ...RTL,
      },
    );
  }
}
