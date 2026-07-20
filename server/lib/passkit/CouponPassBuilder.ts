import { PassBuilder, PassData } from './PassBuilder';
import { PKPass } from 'passkit-generator';
import path from 'path';

// بطاقة قسيمة «سبق بلس × ولاء ون» — نمط Coupon في Apple Wallet.
// تُوقَّع بنفس شهادة الولاء (passTypeId واحد يصلح لأي نمط بطاقة)؛
// رمز QR يحمل رقم القسيمة نفسه لأن هذا ما يُمسح عند الشريك.
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
    // WalaOne purple — matches the voucher card on /plus-preview.
    return 'rgb(123, 108, 224)';
  }

  protected getBarcodeMessage(data: CouponPassData): string {
    return data.couponCode;
  }

  configurePassFields(pass: PKPass, data: CouponPassData): void {
    pass.setExpirationDate(data.voucherExpiresAt);

    pass.headerFields.push({
      key: 'value',
      label: 'القيمة',
      value: data.valueLabel,
    });

    pass.primaryFields.push({
      key: 'partner',
      label: 'الشريك',
      value: data.partnerName,
    });

    pass.secondaryFields.push({
      key: 'offer',
      label: 'العرض',
      value: data.offer,
    });

    pass.auxiliaryFields.push({
      key: 'code',
      label: 'رقم القسيمة',
      value: data.couponCode,
    });

    pass.auxiliaryFields.push({
      key: 'expires',
      label: 'صالحة حتى',
      value: data.voucherExpiresAt.toLocaleDateString('ar-SA-u-ca-gregory-nu-latn'),
    });

    pass.backFields.push(
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
        value: 'صادرة من برنامج سبق بلس عبر ولاء ون. تسري شروط وأحكام ولاء ون والشريك، ولا يمكن استرداد النقاط بعد الإصدار.',
      },
      {
        key: 'website',
        label: 'الموقع الإلكتروني',
        value: 'https://sabq.org',
      }
    );
  }
}
