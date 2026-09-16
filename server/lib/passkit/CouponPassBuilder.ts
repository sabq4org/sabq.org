import { PassBuilder, PassData } from './PassBuilder';
import { PKPass } from 'passkit-generator';
import path from 'path';
import { buildCouponLogoBuffers } from './CouponPassAssets';
import { renderCouponPassStrip } from './CouponPassStripRenderer';

// "1.50 ر.س" المختلطة تتقلب مع bidi (تظهر ر.س قبل المبلغ) — علامة RTL
// في أول السلسلة تثبّت الفقرة عربية فيبقى المبلغ يميناً يُقرأ أولاً.
const rtl = (s: string) => `‏${s}`;

// بطاقة قسيمة «سبق بلس × ولاء بلس» — نمط Coupon في Apple Wallet.
// تُوقَّع بنفس شهادة الولاء (passTypeId واحد يصلح لأي نمط بطاقة).
//
// نموذج المرحلة الأولى المعتمد (2026-07-23): كود شحن من 12 رقمًا يُنسخ
// ويُلصق في شاشة «الشحن» بتطبيق ولاء بلس — لا QR (الكود لا يُمسح ضوئيًا)،
// والكود يظهر نصًا كبيرًا في secondaryFields.
//
// التخطيط (نفس درس البطاقة الصحفية):
//   • strip.png يحمل القيمة الكبيرة + اسم المتجر (البطل البصري)
//   • تحت الشريط: كود الشحن (secondary، مجمّع 4-4-4) ثم الانتهاء (auxiliary)
//   • لا primaryFields فوق الـ strip (تتراكب نصاً أبيض وتفسّد التسلسل)
//   • التعليمات والشروط في الخلف
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
    // البنفسجي المعتمد — يبقى حتى توقيع الشراكة (قرار 2026-07-23)؛
    // القسيمة منتج الشريك والكحلي محفوظ لبطاقة العضوية.
    return 'rgb(95, 79, 209)';
  }

  protected getForegroundColor(): string {
    return 'rgb(255, 255, 255)';
  }

  protected getLabelColor(): string {
    return 'rgb(228, 222, 255)';
  }

  // كود الشحن يُلصق في تطبيق ولاء بلس ولا يُمسح عند كاشير — لا باركود.
  protected includeBarcode(): boolean {
    return false;
  }

  async configurePassFields(pass: PKPass, data: CouponPassData): Promise<void> {
    pass.setExpirationDate(data.voucherExpiresAt);

    // شعار سبق الرسمي مبيّضاً بالكامل (بطلب المالك) — محاذاة يسار خانة
    // اللوقو بهوامش مريحة؛ قالب الملفات fallback عند فشل sharp.
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
        value: rtl(data.valueLabel),
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
        value: rtl(data.valueLabel),
        ...RTL,
      });
    }

    const expiresLabel = data.voucherExpiresAt.toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

    // كود الشحن هو بطل البطاقة بعد الشريط — نص كبير مجمّع 4-4-4 (بلا QR).
    const groupedCode = data.couponCode.replace(/(.{4})(?=.)/g, '$1 ');
    pass.secondaryFields.push({
      key: 'code',
      label: 'كود الشحن — أدخله في شاشة «الشحن» بتطبيق ولاء بلس',
      value: groupedCode,
      ...RTL,
    });

    pass.auxiliaryFields.push({
      key: 'expires',
      label: 'صالحة حتى',
      value: expiresLabel,
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
        value:
          'انسخ كود الشحن، ثم افتح تطبيق ولاء بلس ← شاشة «الشحن» وألصق الكود — يُضاف الرصيد فورًا وتشتري قسيمة المتجر من داخل التطبيق.',
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
          'صادرة من برنامج سبق بلس عبر ولاء بلس. تسري شروط وأحكام ولاء بلس والمتجر، ولا يمكن استرداد النقاط بعد الإصدار.',
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
