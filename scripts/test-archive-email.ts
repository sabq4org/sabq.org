/**
 * Test script: archive + permanent-delete notification emails
 *
 * Renders the FOUR new email templates and either:
 *   1. Writes them to /tmp/*.html previews (always works, no API key).
 *   2. If MAILERSEND_API_KEY is set, sends all four to the recipient
 *      passed as the first CLI argument.
 *
 * Templates rendered:
 *   - Archive — news (خبر)        — sendReporterArchiveEmail
 *   - Archive — opinion (مقال)    — sendOpinionAuthorArchiveEmail
 *   - Delete  — news (خبر)        — sendReporterDeletionEmail
 *   - Delete  — opinion (مقال)    — sendOpinionAuthorDeletionEmail
 *
 * Usage:
 *   npx tsx scripts/test-archive-email.ts ali@alhazmi.org
 */

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { MailerSend, EmailParams, Sender, Recipient } from "mailersend";

const FROM_EMAIL = process.env.FROM_EMAIL || "noreply@sabq.sa";
const FROM_NAME = "صحيفة سبق الإلكترونية";

async function sendViaMailerSend(opts: {
  apiKey: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const ms = new MailerSend({ apiKey: opts.apiKey });
    const params = new EmailParams()
      .setFrom(new Sender(FROM_EMAIL, FROM_NAME))
      .setTo([new Recipient(opts.to)])
      .setSubject(opts.subject)
      .setHtml(opts.html)
      .setText(opts.text);
    await ms.email.send(params);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function formatArabicDateTime(date: Date): string {
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Riyadh",
  }).format(date);
}

/* ----------------------------- خبر (news) ----------------------------- */

function renderNewsArchiveEmail(data: {
  articleTitle: string;
  reporterName: string;
  archiveReason?: string;
  articleUrl?: string;
  archivedAt?: Date;
}): { html: string; text: string } {
  const reason = data.archiveReason?.trim() || "لم يتم تحديد سبب";
  const archivedAt = data.archivedAt ? formatArabicDateTime(data.archivedAt) : formatArabicDateTime(new Date());
  const articleLinkBlock = data.articleUrl
    ? `
      <div style="text-align: center; margin: 28px 0;">
        <a href="${data.articleUrl}"
           style="display: inline-block; padding: 12px 28px; background: #1f2937; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
          📄 عرض الخبر المؤرشف
        </a>
      </div>`
    : "";

  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: 'Tajawal', Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 0; direction: rtl; }
    .container { max-width: 600px; margin: 40px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #d97706, #b45309); color: white; padding: 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 22px; }
    .header p { margin: 6px 0 0; font-size: 13px; opacity: 0.9; }
    .content { padding: 32px; }
    .article-title { font-size: 18px; color: #1f2937; margin: 20px 0; padding: 16px; background: #fffbeb; border-radius: 8px; border-right: 4px solid #d97706; }
    .reason-box { background: #fff7ed; border-radius: 8px; padding: 16px; margin: 20px 0; border-right: 4px solid #f97316; }
    .reason-box h3 { margin: 0 0 8px 0; color: #9a3412; font-size: 14px; }
    .reason-box p { margin: 0; color: #c2410c; font-size: 14px; line-height: 1.7; }
    .meta { color: #6b7280; font-size: 13px; margin-top: 16px; }
    .footer { background: #f8fafc; padding: 20px; text-align: center; color: #64748b; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📦 تم نقل الخبر إلى الأرشيف</h1>
      <p>إشعار من فريق التحرير</p>
    </div>

    <div class="content">
      <p style="font-size: 16px; color: #374151;">مرحباً <strong>${data.reporterName}</strong>،</p>

      <p style="color: #4b5563; line-height: 1.8;">
        نودّ إعلامك بأنه تم نقل الخبر التالي إلى الأرشيف من قِبَل فريق التحرير.
        الخبر لم يُحذف، ويمكن للمحرّرين الرجوع إليه أو إعادة نشره لاحقاً عند الحاجة.
      </p>

      <div class="article-title">
        <strong>📰 عنوان الخبر:</strong><br>
        ${data.articleTitle}
      </div>

      <div class="reason-box">
        <h3>📋 سبب الأرشفة:</h3>
        <p>${reason}</p>
      </div>

      <div class="meta">
        🕒 وقت الأرشفة: ${archivedAt}
      </div>
${articleLinkBlock}

      <p style="color: #64748b; font-size: 14px; margin-top: 24px;">
        إن كانت لديك أي ملاحظات أو ترغب في إعادة معالجة الخبر، يُرجى التواصل مع رئيس التحرير.
      </p>

      <p style="color: #64748b; font-size: 14px; margin-top: 24px; text-align: center;">
        شكراً لتعاونك ومساهمتك في تغطية الأخبار
      </p>
    </div>

    <div class="footer">
      هذا إشعار تلقائي من نظام إدارة المحتوى<br>
      © ${new Date().getFullYear()} صحيفة سبق الإلكترونية
    </div>
  </div>
</body>
</html>
  `.trim();

  const text = `
مرحباً ${data.reporterName}،

تم نقل الخبر التالي إلى الأرشيف من قِبَل فريق التحرير.
الخبر لم يُحذف ويمكن إعادة نشره لاحقاً عند الحاجة.

📰 عنوان الخبر: ${data.articleTitle}

📋 سبب الأرشفة: ${reason}

🕒 وقت الأرشفة: ${archivedAt}
${data.articleUrl ? `\n📄 رابط الخبر: ${data.articleUrl}\n` : ""}
إن كانت لديك أي ملاحظات يُرجى التواصل مع رئيس التحرير.

---
صحيفة سبق الإلكترونية
  `.trim();

  return { html, text };
}

/* --------------------------- مقال (opinion) --------------------------- */

function renderOpinionArchiveEmail(data: {
  articleTitle: string;
  authorName: string;
  archiveReason?: string;
  articleUrl?: string;
  archivedAt?: Date;
}): { html: string; text: string } {
  const reason = data.archiveReason?.trim() || "لم يتم تحديد سبب";
  const archivedAt = data.archivedAt ? formatArabicDateTime(data.archivedAt) : formatArabicDateTime(new Date());
  const articleLinkBlock = data.articleUrl
    ? `
      <div style="text-align: center; margin: 28px 0;">
        <a href="${data.articleUrl}"
           style="display: inline-block; padding: 12px 28px; background: #1f2937; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
          ✍️ عرض المقال المؤرشف
        </a>
      </div>`
    : "";

  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: 'Tajawal', Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 0; direction: rtl; }
    .container { max-width: 600px; margin: 40px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #7c3aed, #5b21b6); color: white; padding: 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 22px; }
    .header p { margin: 6px 0 0; font-size: 13px; opacity: 0.9; }
    .content { padding: 32px; }
    .article-title { font-size: 18px; color: #1f2937; margin: 20px 0; padding: 16px; background: #f5f3ff; border-radius: 8px; border-right: 4px solid #7c3aed; }
    .reason-box { background: #fff7ed; border-radius: 8px; padding: 16px; margin: 20px 0; border-right: 4px solid #f97316; }
    .reason-box h3 { margin: 0 0 8px 0; color: #9a3412; font-size: 14px; }
    .reason-box p { margin: 0; color: #c2410c; font-size: 14px; line-height: 1.7; }
    .meta { color: #6b7280; font-size: 13px; margin-top: 16px; }
    .footer { background: #f8fafc; padding: 20px; text-align: center; color: #64748b; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📦 تم نقل المقال إلى الأرشيف</h1>
      <p>إشعار من هيئة التحرير</p>
    </div>

    <div class="content">
      <p style="font-size: 16px; color: #374151;">الأستاذ/ة <strong>${data.authorName}</strong> المحترم/ة،</p>

      <p style="color: #4b5563; line-height: 1.8;">
        نُحيطكم علماً بأنه تم نقل المقال التالي إلى الأرشيف.
        المقال لا يزال محفوظاً في النظام، ويسعدنا تواصلكم مع هيئة التحرير
        في حال رغبتم بإعادة نشره أو إجراء أي تعديلات.
      </p>

      <div class="article-title">
        <strong>✍️ عنوان المقال:</strong><br>
        ${data.articleTitle}
      </div>

      <div class="reason-box">
        <h3>📋 سبب الأرشفة:</h3>
        <p>${reason}</p>
      </div>

      <div class="meta">
        🕒 وقت الأرشفة: ${archivedAt}
      </div>
${articleLinkBlock}

      <p style="color: #64748b; font-size: 14px; margin-top: 24px;">
        نشكر لكم قلمكم القيّم ومساهماتكم المستمرة على صفحات صحيفة سبق.
      </p>

      <p style="color: #64748b; font-size: 14px; margin-top: 24px; text-align: center;">
        مع خالص التقدير،<br>
        هيئة التحرير
      </p>
    </div>

    <div class="footer">
      هذا إشعار تلقائي من نظام إدارة المحتوى<br>
      © ${new Date().getFullYear()} صحيفة سبق الإلكترونية
    </div>
  </div>
</body>
</html>
  `.trim();

  const text = `
الأستاذ/ة ${data.authorName} المحترم/ة،

نُحيطكم علماً بأنه تم نقل المقال التالي إلى الأرشيف.
المقال لا يزال محفوظاً في النظام، ويسعدنا تواصلكم مع هيئة التحرير
في حال رغبتم بإعادة نشره أو إجراء أي تعديلات.

✍️ عنوان المقال: ${data.articleTitle}

📋 سبب الأرشفة: ${reason}

🕒 وقت الأرشفة: ${archivedAt}
${data.articleUrl ? `\n✍️ رابط المقال: ${data.articleUrl}\n` : ""}
نشكر لكم قلمكم القيّم ومساهماتكم المستمرة على صفحات صحيفة سبق.

مع خالص التقدير،
هيئة التحرير

---
صحيفة سبق الإلكترونية
  `.trim();

  return { html, text };
}

/* ------------------------ DELETION (خبر) ------------------------ */

function renderNewsDeletionEmail(data: {
  articleTitle: string;
  reporterName: string;
  deletionReason?: string;
  deletedAt?: Date;
}): { html: string; text: string } {
  const reason = data.deletionReason?.trim() || "لم يتم تحديد سبب";
  const deletedAt = data.deletedAt ? formatArabicDateTime(data.deletedAt) : formatArabicDateTime(new Date());

  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: 'Tajawal', Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 0; direction: rtl; }
    .container { max-width: 600px; margin: 40px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #dc2626, #991b1b); color: white; padding: 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 22px; }
    .header p { margin: 6px 0 0; font-size: 13px; opacity: 0.9; }
    .content { padding: 32px; }
    .article-title { font-size: 18px; color: #1f2937; margin: 20px 0; padding: 16px; background: #fef2f2; border-radius: 8px; border-right: 4px solid #dc2626; }
    .reason-box { background: #fff7ed; border-radius: 8px; padding: 16px; margin: 20px 0; border-right: 4px solid #f97316; }
    .reason-box h3 { margin: 0 0 8px 0; color: #9a3412; font-size: 14px; }
    .reason-box p { margin: 0; color: #c2410c; font-size: 14px; line-height: 1.7; }
    .warning { background: #fef2f2; border-radius: 8px; padding: 14px 16px; margin: 20px 0; border-right: 4px solid #dc2626; color: #991b1b; font-size: 13px; line-height: 1.7; }
    .meta { color: #6b7280; font-size: 13px; margin-top: 16px; }
    .footer { background: #f8fafc; padding: 20px; text-align: center; color: #64748b; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>❌ تم حذف الخبر نهائياً</h1>
      <p>إشعار من فريق التحرير</p>
    </div>
    <div class="content">
      <p style="font-size: 16px; color: #374151;">مرحباً <strong>${data.reporterName}</strong>،</p>
      <p style="color: #4b5563; line-height: 1.8;">
        نُؤسفنا إبلاغك بأنه تم حذف الخبر التالي نهائياً من قِبَل فريق التحرير.
      </p>
      <div class="article-title">
        <strong>📰 عنوان الخبر:</strong><br>${data.articleTitle}
      </div>
      <div class="reason-box">
        <h3>📋 سبب الحذف:</h3>
        <p>${reason}</p>
      </div>
      <div class="warning">
        ⚠️ <strong>تنبيه:</strong> هذا الإجراء نهائي ولا يمكن التراجع عنه.
        لم يعد المحتوى متاحاً في النظام أو على المنصة.
      </div>
      <div class="meta">🕒 وقت الحذف: ${deletedAt}</div>
      <p style="color: #64748b; font-size: 14px; margin-top: 24px;">
        إن كانت لديك أي استفسارات أو ترغب بمناقشة هذا الإجراء، يُرجى التواصل مع رئيس التحرير.
      </p>
      <p style="color: #64748b; font-size: 14px; margin-top: 24px; text-align: center;">
        نشكر لك تفهمك وتعاونك
      </p>
    </div>
    <div class="footer">
      هذا إشعار تلقائي من نظام إدارة المحتوى<br>
      © ${new Date().getFullYear()} صحيفة سبق الإلكترونية
    </div>
  </div>
</body>
</html>`.trim();

  const text = `
مرحباً ${data.reporterName}،

نُؤسفنا إبلاغك بأنه تم حذف الخبر التالي نهائياً من قِبَل فريق التحرير.

📰 عنوان الخبر: ${data.articleTitle}

📋 سبب الحذف: ${reason}

⚠️ تنبيه: هذا الإجراء نهائي ولا يمكن التراجع عنه. لم يعد المحتوى متاحاً.

🕒 وقت الحذف: ${deletedAt}

---
صحيفة سبق الإلكترونية
  `.trim();

  return { html, text };
}

/* ----------------------- DELETION (مقال) ----------------------- */

function renderOpinionDeletionEmail(data: {
  articleTitle: string;
  authorName: string;
  deletionReason?: string;
  deletedAt?: Date;
}): { html: string; text: string } {
  const reason = data.deletionReason?.trim() || "لم يتم تحديد سبب";
  const deletedAt = data.deletedAt ? formatArabicDateTime(data.deletedAt) : formatArabicDateTime(new Date());

  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: 'Tajawal', Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 0; direction: rtl; }
    .container { max-width: 600px; margin: 40px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #dc2626, #991b1b); color: white; padding: 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 22px; }
    .header p { margin: 6px 0 0; font-size: 13px; opacity: 0.9; }
    .content { padding: 32px; }
    .article-title { font-size: 18px; color: #1f2937; margin: 20px 0; padding: 16px; background: #f5f3ff; border-radius: 8px; border-right: 4px solid #7c3aed; }
    .reason-box { background: #fff7ed; border-radius: 8px; padding: 16px; margin: 20px 0; border-right: 4px solid #f97316; }
    .reason-box h3 { margin: 0 0 8px 0; color: #9a3412; font-size: 14px; }
    .reason-box p { margin: 0; color: #c2410c; font-size: 14px; line-height: 1.7; }
    .warning { background: #fef2f2; border-radius: 8px; padding: 14px 16px; margin: 20px 0; border-right: 4px solid #dc2626; color: #991b1b; font-size: 13px; line-height: 1.7; }
    .meta { color: #6b7280; font-size: 13px; margin-top: 16px; }
    .footer { background: #f8fafc; padding: 20px; text-align: center; color: #64748b; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>❌ تم حذف المقال نهائياً</h1>
      <p>إشعار من هيئة التحرير</p>
    </div>
    <div class="content">
      <p style="font-size: 16px; color: #374151;">الأستاذ/ة <strong>${data.authorName}</strong> المحترم/ة،</p>
      <p style="color: #4b5563; line-height: 1.8;">
        يؤسفنا إبلاغكم بأنه تم حذف المقال التالي نهائياً من قِبَل هيئة التحرير.
        نتفهّم أن هذا الإجراء قد لا يكون متوقعاً، ونعتذر عن أي إزعاج قد يسببه.
      </p>
      <div class="article-title">
        <strong>✍️ عنوان المقال:</strong><br>${data.articleTitle}
      </div>
      <div class="reason-box">
        <h3>📋 سبب الحذف:</h3>
        <p>${reason}</p>
      </div>
      <div class="warning">
        ⚠️ <strong>تنبيه:</strong> هذا الإجراء نهائي ولا يمكن التراجع عنه.
        لم يعد المقال متاحاً في النظام أو على المنصة.
      </div>
      <div class="meta">🕒 وقت الحذف: ${deletedAt}</div>
      <p style="color: #64748b; font-size: 14px; margin-top: 24px;">
        يسعدنا تواصلكم مع هيئة التحرير لمناقشة هذا الإجراء أو لأي استفسار حوله.
        كما نرحب بأي مساهمات جديدة منكم على صفحات سبق.
      </p>
      <p style="color: #64748b; font-size: 14px; margin-top: 24px; text-align: center;">
        مع خالص التقدير،<br>هيئة التحرير
      </p>
    </div>
    <div class="footer">
      هذا إشعار تلقائي من نظام إدارة المحتوى<br>
      © ${new Date().getFullYear()} صحيفة سبق الإلكترونية
    </div>
  </div>
</body>
</html>`.trim();

  const text = `
الأستاذ/ة ${data.authorName} المحترم/ة،

يؤسفنا إبلاغكم بأنه تم حذف المقال التالي نهائياً من قِبَل هيئة التحرير.
نتفهّم أن هذا الإجراء قد لا يكون متوقعاً، ونعتذر عن أي إزعاج قد يسببه.

✍️ عنوان المقال: ${data.articleTitle}

📋 سبب الحذف: ${reason}

⚠️ تنبيه: هذا الإجراء نهائي ولا يمكن التراجع عنه. لم يعد المقال متاحاً.

🕒 وقت الحذف: ${deletedAt}

مع خالص التقدير،
هيئة التحرير

---
صحيفة سبق الإلكترونية
  `.trim();

  return { html, text };
}

/* ------------------------------- main ------------------------------- */

async function main() {
  const recipient = process.argv[2];
  if (!recipient) {
    console.error("Usage: npx tsx scripts/test-archive-email.ts <recipient-email>");
    process.exit(1);
  }

  const newsSample = {
    articleTitle: "بدء أعمال الصيانة الدورية لطريق الرياض - الدمام السريع",
    reporterName: "علي الحازمي",
    archiveReason:
      "تم أرشفة الخبر لأن المحتوى مكرر مع تغطية سابقة. يُرجى مراجعة الأرشيف قبل إعادة الإرسال.",
    articleUrl: "https://sabq.org/article/sample-news-article",
    archivedAt: new Date(),
  };

  const opinionSample = {
    articleTitle: "نحو رؤية وطنية متجددة للتعليم الرقمي",
    authorName: "د. سارة العنزي",
    archiveReason:
      "تم نقل المقال إلى الأرشيف بناءً على طلب الكاتبة لمراجعة بعض الفقرات قبل إعادة النشر.",
    articleUrl: "https://sabq.org/article/sample-opinion-article",
    archivedAt: new Date(),
  };

  const newsDeleteSample = {
    articleTitle: "بدء أعمال الصيانة الدورية لطريق الرياض - الدمام السريع",
    reporterName: "علي الحازمي",
    deletionReason:
      "تم حذف الخبر نهائياً بعد ثبوت عدم دقة المصدر، وبناءً على طلب الجهة الرسمية المختصة.",
    deletedAt: new Date(),
  };

  const opinionDeleteSample = {
    articleTitle: "نحو رؤية وطنية متجددة للتعليم الرقمي",
    authorName: "د. سارة العنزي",
    deletionReason:
      "تم حذف المقال نهائياً بناءً على طلب الكاتبة الرسمي للتراجع عن النشر.",
    deletedAt: new Date(),
  };

  const news = renderNewsArchiveEmail(newsSample);
  const opinion = renderOpinionArchiveEmail(opinionSample);
  const newsDelete = renderNewsDeletionEmail(newsDeleteSample);
  const opinionDelete = renderOpinionDeletionEmail(opinionDeleteSample);

  const newsPath = path.join("/tmp", "archive-email-news-preview.html");
  const opinionPath = path.join("/tmp", "archive-email-opinion-preview.html");
  const newsDeletePath = path.join("/tmp", "delete-email-news-preview.html");
  const opinionDeletePath = path.join("/tmp", "delete-email-opinion-preview.html");
  fs.writeFileSync(newsPath, news.html, "utf-8");
  fs.writeFileSync(opinionPath, opinion.html, "utf-8");
  fs.writeFileSync(newsDeletePath, newsDelete.html, "utf-8");
  fs.writeFileSync(opinionDeletePath, opinionDelete.html, "utf-8");

  console.log(`\n📄 Previews saved:`);
  console.log(`   • Archive — News (خبر):    ${newsPath}`);
  console.log(`   • Archive — Opinion (مقال): ${opinionPath}`);
  console.log(`   • Delete  — News (خبر):    ${newsDeletePath}`);
  console.log(`   • Delete  — Opinion (مقال): ${opinionDeletePath}`);
  console.log(`   macOS: open ${newsPath} ${opinionPath} ${newsDeletePath} ${opinionDeletePath}\n`);

  const apiKey = process.env.MAILERSEND_API_KEY;
  if (!apiKey) {
    console.log("⚠️  MAILERSEND_API_KEY not set — skipping actual send.");
    console.log("    Set it in .env.local (or run on Railway/Replit) and re-run.\n");
    process.exit(0);
  }

  const sends: { label: string; subject: string; html: string; text: string }[] = [
    { label: "Archive — News",    subject: `[تجربة] 📦 تم أرشفة خبرك: ${newsSample.articleTitle}`,            html: news.html,           text: news.text },
    { label: "Archive — Opinion", subject: `[تجربة] 📦 تم أرشفة مقالك: ${opinionSample.articleTitle}`,        html: opinion.html,        text: opinion.text },
    { label: "Delete  — News",    subject: `[تجربة] ❌ تم حذف خبرك نهائياً: ${newsDeleteSample.articleTitle}`, html: newsDelete.html,     text: newsDelete.text },
    { label: "Delete  — Opinion", subject: `[تجربة] ❌ تم حذف مقالك نهائياً: ${opinionDeleteSample.articleTitle}`, html: opinionDelete.html, text: opinionDelete.text },
  ];

  let allOk = true;
  for (const s of sends) {
    console.log(`📧 Sending [${s.label}] to ${recipient}...`);
    const r = await sendViaMailerSend({ apiKey, to: recipient, subject: s.subject, html: s.html, text: s.text });
    if (r.success) console.log(`✅ [${s.label}] sent.`);
    else {
      console.error(`❌ [${s.label}] failed: ${r.error}`);
      allOk = false;
    }
  }

  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
