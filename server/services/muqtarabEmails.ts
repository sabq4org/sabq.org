/**
 * مُقترب — قوالب الإيميلات المتعلقة بدورة حياة الزوايا والمواضيع.
 *
 *   1. sendSubmissionReceivedEmail  — للمتقدّم عند تقديم طلب زاوية
 *   2. sendTopicPublishedEmail      — للكاتب عند موافقة الإدارة على موضوعه
 *   3. sendTopicReturnedEmail       — للكاتب عند إرجاع موضوعه للتعديل
 *
 * (بريد بيانات الدخول عند الموافقة على الطلب يعيش في muqtarabProvisioning.ts.)
 * كلها RTL بنفس ستايل بطاقة سبق المتدرّجة، وتُرسل عبر sendEmailNotification.
 */

import { sendEmailNotification } from "./email";

const BASE_URL = "https://sabq.org";

interface EmailShellOptions {
  emoji: string;
  headerGradient: string; // CSS gradient for the header band
  headerTitle: string;
  headerSubtitle?: string;
  bodyHtml: string;
}

function emailShell({ emoji, headerGradient, headerTitle, headerSubtitle, bodyHtml }: EmailShellOptions): string {
  return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="UTF-8"></head>
<body style="font-family: 'Segoe UI', Tahoma, Arial, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); margin: 0; padding: 40px 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 20px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
    <div style="background: ${headerGradient}; padding: 40px 30px; text-align: center;">
      <div style="font-size: 56px; margin-bottom: 12px;">${emoji}</div>
      <h1 style="color: white; margin: 0; font-size: 26px;">${headerTitle}</h1>
      ${headerSubtitle ? `<p style="color: rgba(255,255,255,0.9); margin: 10px 0 0; font-size: 17px;">${headerSubtitle}</p>` : ""}
    </div>
    <div style="padding: 36px 30px;">
      ${bodyHtml}
    </div>
    <div style="background: #f9fafb; padding: 25px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
      <p style="color: #9ca3af; font-size: 13px; margin: 0;">مع تحيات فريق <strong style="color: #6366f1;">سبق</strong> | منصة مُقترب</p>
    </div>
  </div>
</body>
</html>`;
}

function ctaButton(href: string, label: string): string {
  return `<div style="text-align: center; margin: 24px 0;">
    <a href="${href}" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; text-decoration: none; padding: 14px 38px; border-radius: 10px; font-size: 16px; font-weight: bold;">${label}</a>
  </div>`;
}

/** يُرسَل للمتقدّم فور تقديم طلب الزاوية. */
export async function sendSubmissionReceivedEmail(submission: {
  email: string;
  fullName: string;
  angleName: string;
}): Promise<void> {
  const firstName = submission.fullName.split(" ")[0];
  const body = `
    <p style="color: #1f2937; font-size: 18px; line-height: 1.8; margin: 0 0 18px;">أهلاً <strong>${firstName}</strong> 👋</p>
    <p style="color: #4b5563; font-size: 16px; line-height: 1.8; margin: 0 0 18px;">
      وصلنا طلبك لإنشاء زاوية <strong style="color: #6366f1;">"${submission.angleName}"</strong> في منصة مُقترب،
      وهو الآن قيد المراجعة من فريقنا التحريري.
    </p>
    <div style="background: #eef2ff; border-right: 4px solid #6366f1; padding: 18px; border-radius: 10px; margin-bottom: 18px;">
      <p style="color: #3730a3; margin: 0; font-size: 15px;">سنوافيك بالنتيجة خلال أيام قليلة عبر هذا البريد. جهّز أفكارك ومواضيعك الأولى! ✨</p>
    </div>
    <p style="color: #6b7280; font-size: 14px; line-height: 1.8; margin: 0;">شكراً لثقتك بـ سبق 🌟</p>`;

  await sendEmailNotification({
    to: submission.email,
    subject: `✅ استلمنا طلبك لإنشاء زاوية "${submission.angleName}" في مُقترب`,
    html: emailShell({
      emoji: "✅",
      headerGradient: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
      headerTitle: "استلمنا طلبك",
      headerSubtitle: "طلبك الآن قيد المراجعة",
      bodyHtml: body,
    }),
  });
}

/** يُرسَل للكاتب عند موافقة الإدارة على موضوعه ونشره. */
export async function sendTopicPublishedEmail(opts: {
  toEmail: string;
  firstName: string;
  topicTitle: string;
  angleName: string;
  topicUrl: string;
}): Promise<void> {
  const body = `
    <p style="color: #1f2937; font-size: 18px; line-height: 1.8; margin: 0 0 18px;">أهلاً <strong>${opts.firstName}</strong> 🎉</p>
    <p style="color: #4b5563; font-size: 16px; line-height: 1.8; margin: 0 0 18px;">
      اعتمد فريق التحرير ونشر موضوعك <strong style="color: #10b981;">"${opts.topicTitle}"</strong>
      في زاوية <strong>${opts.angleName}</strong>. أصبح الآن متاحاً للقرّاء! 👇
    </p>
    ${ctaButton(opts.topicUrl, "شاهد الموضوع المنشور")}
    <p style="color: #6b7280; font-size: 14px; line-height: 1.8; margin: 0;">واصل إبداعك ونتطلع لمواضيعك القادمة! 🚀</p>`;

  await sendEmailNotification({
    to: opts.toEmail,
    subject: `🎉 تم نشر موضوعك "${opts.topicTitle}" في مُقترب`,
    html: emailShell({
      emoji: "🎉",
      headerGradient: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
      headerTitle: "تم نشر موضوعك!",
      headerSubtitle: opts.angleName,
      bodyHtml: body,
    }),
  });
}

/** يُرسَل للكاتب عند إرجاع موضوعه للتعديل مع ملاحظات المراجع. */
export async function sendTopicReturnedEmail(opts: {
  toEmail: string;
  firstName: string;
  topicTitle: string;
  reviewNotes?: string | null;
  editUrl: string;
}): Promise<void> {
  const notesBlock = opts.reviewNotes
    ? `<div style="background: #fffbeb; border-right: 4px solid #f59e0b; padding: 18px; border-radius: 10px; margin-bottom: 18px;">
        <p style="color: #92400e; margin: 0; font-size: 15px;"><strong>📝 ملاحظات المراجع:</strong><br>${opts.reviewNotes}</p>
      </div>`
    : "";
  const body = `
    <p style="color: #1f2937; font-size: 18px; line-height: 1.8; margin: 0 0 18px;">مرحباً <strong>${opts.firstName}</strong> 👋</p>
    <p style="color: #4b5563; font-size: 16px; line-height: 1.8; margin: 0 0 18px;">
      راجع فريق التحرير موضوعك <strong>"${opts.topicTitle}"</strong> ويحتاج لبعض التعديلات قبل النشر.
    </p>
    ${notesBlock}
    <p style="color: #4b5563; font-size: 16px; line-height: 1.8; margin: 0 0 8px;">عدّله من لوحتك ثم أعد إرساله للمراجعة 💪</p>
    ${ctaButton(opts.editUrl, "تعديل الموضوع")}`;

  await sendEmailNotification({
    to: opts.toEmail,
    subject: `📝 ملاحظات على موضوعك "${opts.topicTitle}" في مُقترب`,
    html: emailShell({
      emoji: "📝",
      headerGradient: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
      headerTitle: "موضوعك يحتاج تعديلاً",
      bodyHtml: body,
    }),
  });
}

export const MUQTARAB_EDIT_URL = `${BASE_URL}/dashboard/my-angle`;

export function buildTopicUrl(angleSlug: string, topicSlug: string): string {
  return `${BASE_URL}/muqtarab/${angleSlug}/topic/${topicSlug}`;
}
