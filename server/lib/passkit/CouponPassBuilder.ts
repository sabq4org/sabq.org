import { PassBuilder, PassData } from './PassBuilder';
import { PKPass } from 'passkit-generator';
import path from 'path';

// بطاقة قسيمة «سبق بلس × ولاء ون» — نمط Coupon في Apple Wallet.
// تُوقَّع بنفس شهادة الولاء (passTypeId واحد يصلح لأي نمط بطاقة)؛
// رمز QR يحمل رقم القسيمة نفسه لأن هذا ما يُمسح عند الشريك.
//
// تخطيط الواجهة الأمامية مقصود أن يكون ضيقاً: القيمة + الشريك + الرمز + الانتهاء.
// نص العرض الطويل يذهب للخلف — وضعه في secondary/auxiliary يكدّس الأعمدة ويتداخل.
export interface CouponPassData extends PassData {
  partnerName: string;
  offer: string;
  valueLabel: string;
  couponCode: string;
  voucherExpiresAt: Date;
}

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

  configurePassFields(pass: PKPass, data: CouponPassData): void {
    pass.setExpirationDate(data.voucherExpiresAt);

    const expiresLabel = data.voucherExpiresAt.toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

    pass.headerFields.push({
      key: 'value',
      label: 'القيمة',
      value: data.valueLabel,
      textAlignment: 'PKTextAlignmentRight',
    });

    pass.primaryFields.push({
      key: 'partner',
      label: 'قسيمة',
      value: data.partnerName,
      textAlignment: 'PKTextAlignmentNatural',
    });

    // حقل واحد بعرض كامل — يتجنّب تزاحم الأعمدة مع تاريخ الانتهاء.
    pass.secondaryFields.push({
      key: 'code',
      label: 'رقم القسيمة',
      value: data.couponCode,
      textAlignment: 'PKTextAlignmentNatural',
    });

    pass.auxiliaryFields.push({
      key: 'expires',
      label: 'صالحة حتى',
      value: expiresLabel,
      textAlignment: 'PKTextAlignmentNatural',
    });

    pass.backFields.push(
      {
        key: 'offer',
        label: 'العرض',
        value: data.offer,
      },
      {
        key: 'holder',
        label: 'صاحب القسيمة',
        value: data.userName,
      },
      {
        key: 'how',
        label: 'طريقة الاستخدام',
        value: 'أبرِز رمز QR أو رقم القسيمة عند الشريك قبل الدفع.',
      },
      {
        key: 'terms',
        label: 'الشروط',
        value:
          'صادرة من برنامج سبق بلس عبر ولاء ون. تسري شروط وأحكام ولاء ون والشريك، ولا يمكن استرداد النقاط بعد الإصدار.',
      },
      {
        key: 'website',
        label: 'الموقع الإلكتروني',
        value: 'https://sabq.org',
      },
    );
  }
}
