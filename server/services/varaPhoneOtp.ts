import twilio from "twilio";
import { sendOtp, verifyOtp } from "./otpService";

// خدمة OTP خاصّة بتطبيق VARA فقط — معزولة تمامًا عن خدمة Twilio المشتركة
// (WhatsApp/2FA في server/twilio.ts). تقرأ متغيّرات بيئة مستقلّة كي لا تتعارض
// مع اعتماد الخدمة الأخرى:
//   VARA_TWILIO_ACCOUNT_SID · VARA_TWILIO_AUTH_TOKEN · VARA_TWILIO_VERIFY_SERVICE_SID

function getVaraTwilioClient() {
  const accountSid = process.env.VARA_TWILIO_ACCOUNT_SID;
  const authToken = process.env.VARA_TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    throw new Error("VARA_TWILIO_ACCOUNT_SID / VARA_TWILIO_AUTH_TOKEN not configured");
  }
  return twilio(accountSid, authToken);
}

function getVaraVerifyServiceSid(): string | undefined {
  return process.env.VARA_TWILIO_VERIFY_SERVICE_SID;
}

/** إرسال رمز تحقّق (SMS) عبر Twilio Verify — للرقم بصيغة E.164 الدولية. */
async function legacyVaraSendOtp(
  phoneE164: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const verifySid = getVaraVerifyServiceSid();
    if (!verifySid) {
      console.error("❌ VARA_TWILIO_VERIFY_SERVICE_SID is not configured");
      throw new Error("VARA_TWILIO_VERIFY_SERVICE_SID environment variable is not configured");
    }

    const client = getVaraTwilioClient();
    const verification = await client.verify.v2
      .services(verifySid)
      .verifications.create({ to: phoneE164, channel: "sms" });

    return {
      success: verification.status === "pending",
      message:
        verification.status === "pending"
          ? "تم إرسال رمز التحقق إلى رقم جوالك"
          : "فشل في إرسال رمز التحقق",
    };
  } catch (error: any) {
    console.error("❌ [VARA OTP] send error:", {
      message: error?.message,
      code: error?.code,
    });
    let message = "فشل في إرسال رمز التحقق";
    if (error?.code === 60200 || error?.code === 60203) message = "رقم الجوال غير صحيح أو غير مدعوم";
    else if (error?.code === 60202) message = "تم تجاوز الحد الأقصى لمحاولات الإرسال. حاول لاحقًا";
    else if (error?.code === 60205) message = "خدمة التحقق غير متاحة حاليًا. حاول لاحقًا";
    else if (error?.code === 20003) message = "تعذّر الوصول إلى خدمة الرسائل. تحقّق من الإعدادات";
    return { success: false, message };
  }
}

/** التحقّق من الرمز — للرقم بصيغة E.164. */
async function legacyVaraVerifyOtp(
  phoneE164: string,
  code: string,
): Promise<{ valid: boolean; message: string }> {
  try {
    const verifySid = getVaraVerifyServiceSid();
    if (!verifySid) {
      throw new Error("VARA_TWILIO_VERIFY_SERVICE_SID environment variable is not configured");
    }

    const client = getVaraTwilioClient();
    const check = await client.verify.v2
      .services(verifySid)
      .verificationChecks.create({ to: phoneE164, code });

    return {
      valid: check.status === "approved",
      message: check.status === "approved" ? "تم التحقق بنجاح" : "الرمز غير صحيح أو منتهي الصلاحية",
    };
  } catch (error: any) {
    console.error("❌ [VARA OTP] verify error:", error?.message || error);
    return { valid: false, message: "الرمز غير صحيح أو منتهي الصلاحية" };
  }
}

/**
 * دخول الجوال (ويب + تطبيقات): الرمز مولَّد داخل سبق ويُرسل عبر Bevatel باسم
 * SABQ أساسًا وTwilio تراجعًا. مسار Twilio Verify الخاص بـVARA أعلاه يبقى
 * احتياطًا فقط حين لا يكون أي موصل SMS مهيّأً.
 */
export async function varaSendOtp(phoneE164: string): Promise<{ success: boolean; message: string }> {
  const own = await sendOtp(phoneE164, "login");
  if (own.configured) return { success: own.success, message: own.message };
  return legacyVaraSendOtp(phoneE164);
}

export async function varaVerifyOtp(phoneE164: string, code: string): Promise<{ valid: boolean; message: string }> {
  const own = await verifyOtp(phoneE164, code, "login");
  if (own.valid || !own.notFound) return { valid: own.valid, message: own.message };
  if (process.env.VARA_TWILIO_VERIFY_SERVICE_SID) return legacyVaraVerifyOtp(phoneE164, code);
  return { valid: false, message: own.message };
}
