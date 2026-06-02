/**
 * اختبار حاسم لمفتاح Google Indexing API على رابط واحد.
 *
 * يستهلك طلباً واحداً فقط من الحصة اليومية (~200). يطبع:
 *   - هل المفاتيح مُهيأة؟
 *   - هل الإرسال نجح (200) أم فشل (403 = الحساب ليس Owner في Search Console،
 *     404 = API غير مفعّل في Google Cloud، إلخ).
 *   - حالة الفهرسة الحالية للرابط لدى Google (getUrlStatus).
 *
 * التشغيل (على Railway حيث توجد المفاتيح):
 *   railway run tsx scripts/test-indexing-one.ts
 * أو لرابط مخصص:
 *   railway run tsx scripts/test-indexing-one.ts "https://sabq.org/article/qzVBFf1"
 */

import {
  isGoogleIndexingConfigured,
  notifyUrlUpdated,
  getUrlStatus,
} from '../server/services/googleIndexingService';

async function main() {
  const url = process.argv[2] || 'https://sabq.org/article/qzVBFf1';
  console.log('🔎 اختبار Google Indexing API');
  console.log('   الرابط:', url, '\n');

  if (!isGoogleIndexingConfigured()) {
    console.error('❌ المفاتيح غير مُهيأة — تحقق من GOOGLE_INDEXING_CLIENT_EMAIL و GOOGLE_INDEXING_PRIVATE_KEY');
    process.exit(1);
  }
  console.log('✅ المفاتيح مُهيأة (JWT تم إنشاؤه)\n');

  console.log('📤 إرسال URL_UPDATED ...');
  const res = await notifyUrlUpdated(url);
  if (res.success) {
    console.log('✅ نجح الإرسال لـ Google!');
    console.log('   نوع الإشعار:', res.notificationType);
    console.log('   وقت الإشعار:', res.latestUpdate, '\n');
  } else {
    console.error('❌ فشل الإرسال:', res.error);
    console.error('   التفسير المحتمل:');
    console.error('   - "Permission denied" / 403 → الحساب ليس Owner في Search Console');
    console.error('   - 404 / "not found"         → Web Search Indexing API غير مفعّل في Google Cloud');
    console.error('   - "invalid_grant"           → صيغة المفتاح الخاص خاطئة (مشكلة \\n)\n');
  }

  console.log('📊 حالة الرابط لدى Google (getUrlStatus):');
  const status = await getUrlStatus(url);
  console.log(JSON.stringify(status, null, 2));
}

main().catch((e) => {
  console.error('خطأ غير متوقع:', e);
  process.exit(1);
});
