/**
 * عقد موصل SMS — موصل واحد = «أرسل نصًا لرقم». لا يعرف شيئًا عن OTP:
 * توليد الرمز وتخزينه والتحقق منه مسؤولية server/services/otpService.ts.
 */
export type SmsProviderName = "bevatel" | "twilio";

export interface SmsSendResult {
  ok: boolean;
  provider: SmsProviderName;
  /** معرّف الرسالة لدى المزوّد إن أعاده (Bevatel لا يوثّق شكل الرد؛ نقرأه بمرونة). */
  messageId?: string;
  /** سبب الفشل — للّوغ فقط، لا يُعرض للمستخدم. */
  error?: string;
}

export interface SmsProvider {
  readonly name: SmsProviderName;
  /** هل المتغيرات اللازمة موجودة؟ (لا يفحص الشبكة) */
  isConfigured(): boolean;
  /** إرسال نص لرقم بصيغة E.164 (+9665XXXXXXXX). لا يرمي؛ يعيد ok=false عند الفشل. */
  send(to: string, body: string): Promise<SmsSendResult>;
}
