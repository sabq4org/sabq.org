import crypto from "crypto";
import bcrypt from "bcrypt";
import { db } from "../db";
import { passwordResetTokens } from "@shared/schema";
import { sendEmailNotification } from "./email";

/**
 * استعادة كلمة المرور لمسار الموبايل (v1): بريد رمز من 6 أرقام + رابط ويب
 * احتياطي. انتُزع من server/routes/mobileApiRoutes.ts — سقف الأسطر (ratchet)
 * وADR-001: منطق قاعدة البيانات يسكن الخدمات لا ملفات المسارات.
 */

/**
 * ينشئ صف رابط ويب بصيغة الويب المركّبة `<tokenId>.<plaintext>` (bcrypt،
 * صالح ساعة) ويعيد رابط /reset-password كاملًا — للإصدارات المنتشرة التي
 * لا تملك شاشة لإدخال الرمز (أندرويد قبل شاشة الرمز في أغسطس 2026).
 */
export async function createWebResetLink(userId: string): Promise<string> {
  const plaintext = crypto.randomBytes(32).toString("hex");
  const hash = await bcrypt.hash(plaintext, 12);
  const [row] = await db.insert(passwordResetTokens).values({
    userId,
    token: hash,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
  }).returning({ id: passwordResetTokens.id });
  return `${process.env.FRONTEND_URL || "https://sabq.org"}/reset-password?token=${row.id}.${plaintext}`;
}

export async function sendPasswordResetCodeEmail(email: string, code: string, resetLink: string): Promise<boolean> {
  try {
    const htmlContent = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: 'Tajawal', Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 0; direction: rtl; }
          .container { max-width: 600px; margin: 40px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #e53935 0%, #c62828 100%); padding: 30px; text-align: center; }
          .header h1 { color: white; margin: 0; font-size: 24px; }
          .content { padding: 40px 30px; text-align: center; }
          .greeting { font-size: 20px; color: #333; margin-bottom: 20px; }
          .message { font-size: 16px; color: #666; line-height: 1.8; margin-bottom: 30px; }
          .code-box { background: #fff3f3; border: 2px dashed #e53935; border-radius: 12px; padding: 20px; margin: 20px 0; }
          .code { font-size: 36px; font-weight: bold; color: #e53935; letter-spacing: 8px; font-family: monospace; }
          .warning { font-size: 14px; color: #e53935; margin-top: 20px; font-weight: bold; }
          .note { font-size: 14px; color: #999; margin-top: 10px; }
          .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #999; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>استعادة كلمة المرور</h1>
          </div>
          <div class="content">
            <p class="greeting">مرحباً! 🔐</p>
            <p class="message">
              تلقينا طلباً لاستعادة كلمة المرور الخاصة بحسابك.<br>
              استخدم الرمز التالي لإعادة تعيين كلمة المرور:
            </p>
            <div class="code-box">
              <div class="code">${code}</div>
            </div>
            <p class="warning">
              هذا الرمز صالح لمدة 30 دقيقة فقط.
            </p>
            <p class="message" style="margin-top: 24px;">
              لا تجد مكانًا لإدخال الرمز في تطبيقك؟ يمكنك إعادة التعيين من المتصفح مباشرة:
            </p>
            <p>
              <a href="${resetLink}" style="display: inline-block; background: #e53935; color: white !important; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: bold;">
                إعادة تعيين كلمة المرور من المتصفح
              </a>
            </p>
            <p class="note" style="word-break: break-all;">
              أو انسخ الرابط: <span style="color: #e53935;">${resetLink}</span><br>
              (الرابط صالح لمدة ساعة واحدة)
            </p>
            <p class="note">
              إذا لم تطلب استعادة كلمة المرور، يرجى تجاهل هذه الرسالة.<br>
              حسابك آمن ولم يتم إجراء أي تغييرات.
            </p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} صحيفة سبق الإلكترونية - جميع الحقوق محفوظة</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const textContent = `
مرحباً!

تلقينا طلباً لاستعادة كلمة المرور الخاصة بحسابك.
استخدم الرمز التالي لإعادة تعيين كلمة المرور:

${code}

هذا الرمز صالح لمدة 30 دقيقة فقط.

لا تجد مكانًا لإدخال الرمز في تطبيقك؟ افتح الرابط التالي لإعادة التعيين من المتصفح (صالح لمدة ساعة):
${resetLink}

إذا لم تطلب استعادة كلمة المرور، يرجى تجاهل هذه الرسالة.

صحيفة سبق الإلكترونية
    `;

    const result = await sendEmailNotification({
      to: email,
      // الرمز لا يوضع في العنوان — يظهر في معاينات الإشعارات على شاشة القفل.
      subject: "رمز استعادة كلمة المرور - صحيفة سبق",
      html: htmlContent,
      text: textContent,
    });

    console.log(`[Mobile API] Password reset email sent: ${result.success}`); // لا نسجل العنوان (PII) — F-18
    return result.success;
  } catch (error) {
    console.error('[Mobile API] Failed to send password reset email:', error);
    return false;
  }
}

