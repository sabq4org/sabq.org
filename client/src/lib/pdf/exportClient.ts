import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import QRCode from 'qrcode';

interface ExportPdfOptions {
  elementId: string;
  filename: string;
  articleUrl: string;
}

/**
 * تصدير عنصر HTML إلى PDF مع دعم RTL والخطوط العربية
 */
export async function exportArticleToPdf({
  elementId,
  filename,
  articleUrl,
}: ExportPdfOptions): Promise<void> {
  try {
    const element = document.getElementById(elementId);
    
    if (!element) {
      throw new Error(`Element with id "${elementId}" not found`);
    }

    // توليد QR code
    const qrCodeDataUrl = await QRCode.toDataURL(articleUrl, {
      width: 150,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    });

    // حفظ QR في عنصر مخفي مؤقت
    const qrElement = element.querySelector('[data-qr-placeholder]');
    if (qrElement && qrElement instanceof HTMLImageElement) {
      qrElement.src = qrCodeDataUrl;
    }

    // تحويل العنصر إلى Canvas بجودة عالية
    const canvas = await html2canvas(element, {
      scale: 2, // جودة عالية (2x)
      useCORS: true, // للسماح بتحميل الصور من مصادر خارجية
      logging: false,
      backgroundColor: '#ffffff',
      imageTimeout: 0,
      width: 1200, // عرض ثابت لضمان تنسيق متسق
    });

    // التحقق من صحة أبعاد Canvas
    if (!canvas || canvas.width === 0 || canvas.height === 0) {
      throw new Error('فشل إنشاء الصورة - تأكد من أن المحتوى معروض بشكل صحيح');
    }

    // حساب أبعاد PDF (A4)
    const imgWidth = 210; // A4 width in mm
    const pageHeight = 297; // A4 height in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    
    // إنشاء PDF جديد
    const pdf = new jsPDF({
      orientation: imgHeight > imgWidth ? 'portrait' : 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    let heightLeft = imgHeight;
    let position = 0;

    // إضافة الصفحة الأولى
    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    // إضافة صفحات إضافية إذا لزم الأمر
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    // حفظ الملف
    pdf.save(filename);
  } catch (error) {
    console.error('Error exporting PDF:', error);
    throw error;
  }
}

/**
 * تنسيق اسم ملف PDF
 */
export function formatPdfFilename(slug: string): string {
  const date = new Date();
  const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
  return `ARTICLE-${slug}-${dateStr}-v1.pdf`;
}

/**
 * تحويل تاريخ ميلادي إلى هجري (تقريبي)
 */
export function toHijriDate(gregorianDate: Date): string {
  // حساب تقريبي للتاريخ الهجري
  // الفرق بين التقويمين حوالي 11 يوم سنوياً
  const hijriYear = Math.floor((gregorianDate.getFullYear() - 622) * 1.030684);
  const hijriMonths = [
    'محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر',
    'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان',
    'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'
  ];
  
  // حساب تقريبي للشهر
  const monthIndex = gregorianDate.getMonth();
  const hijriMonth = hijriMonths[monthIndex];
  const hijriDay = gregorianDate.getDate();
  
  return `${hijriDay} ${hijriMonth} ${hijriYear}هـ`;
}

/**
 * تنسيق التاريخ بالتوقيت السعودي
 */
export function formatSaudiDateTime(date: Date): string {
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  };
  
  const gregorian = new Intl.DateTimeFormat('ar-SA-u-ca-gregory', options).format(date);
  const hijri = toHijriDate(date);
  
  return `${gregorian} / ${hijri}`;
}
