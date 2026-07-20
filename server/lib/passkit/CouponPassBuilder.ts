import { PassBuilder, PassData } from './PassBuilder';
import { PKPass } from 'passkit-generator';
import path from 'path';
import { buildCouponLogoBuffers } from './CouponPassAssets';
import { renderCouponPassStrip } from './CouponPassStripRenderer';

// بطاقة قسيمة «سبق بلس × ولاء ون» — نمط Coupon في Apple Wallet.
// تُوقَّع بنفس شهادة الولاء (passTypeId واحد يصلح لأي نمط بطاقة)؛
// رمز QR يحمل رقم القسيمة نفسه لأن هذا ما يُمسح عند الشريك.
//
// التخطيط (نفس درس البطاقة الصحفية):
//   • strip.png يحمل القيمة الكبيرة + اسم الشريك (البطل البصري)
//   • الحقول الأصلية تحت الشريط فقط: رقم القسيمة + الانتهاء
//   • لا primaryFields فوق الـ strip (تتراكب نصاً أبيض وتفسّد التسلسل)
//   • نص العرض الطويل في الخلف
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

    // البطل البصري: القيمة + الشريك داخل الـ strip — لا يعتمد على primary الضخم.
    try {
      const strips = await renderCouponPassStrip({
        valueLabel: data.valueLabel,
        partnerName: data.partnerName,
      });
      pass.addBuffer('strip.png', strips.x1);
      pass.addBuffer('strip@2x.png', strips.x2);
      pass.addBuffer('strip@3x.png', strips.x3);
    } catch (e) {
      console.warn('[CouponPassBuilder] strip render failed, falling back to header value:', e);
      // إن فشل الـ canvas نُبقي القيمة ظاهرة في الرأس حتى لا تُصدر بطاقة فارغة.
      pass.headerFields.push({
        key: 'value',
        label: 'القيمة',
        value: data.valueLabel,
        ...RTL,
      });
      pass.secondaryFields.push({
        key: 'partner',
        label: 'قسيمة',
        value: data.partnerName,
        ...RTL,
      });
    }

    // في وضع الطيّ (stack) يظهر الرأس بجانب اللوقو — نضع القيمة هناك
    // فقط إن نجح الـ strip (وإلا دُفعت أعلاه كـ fallback).
    if (pass.headerFields.length === 0) {
      pass.headerFields.push({
        key: 'value',
        label: 'القيمة',
        value: data.valueLabel,
        ...RTL,
      });
    }

    const expiresLabel = data.voucherExpiresAt.toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

    // صف واحد تحت الشريط: انتهاء ثم رقم — يظهر الرمز يميناً في تدفق عربي
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
        key: 'partner',
        label: 'الجهة',
        value: data.partnerName,
        ...RTL,
      },
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
        key: 'remove',
        label: 'إزالة البطاقة من Wallet',
        value:
          'لحذف هذه البطاقة من Apple Wallet: افتح البطاقة ثم اضغط ⋯ أو (i) في الأعلى واختر «حذف البطاقة». PassKit لا يسمح بزر حذف على وجه البطاقة.',
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
