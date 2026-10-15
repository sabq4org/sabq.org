package com.sabq.smart.data

import java.io.IOException
import kotlinx.serialization.SerializationException
import retrofit2.HttpException

/**
 * نصوص فشل التسجيل بحسب الحالة — نقل `registrationUpload.ts` (#1530) ونظير iOS
 * `RegistrationErrorMessage`: لا رمز خام، وضمان «بياناتك ما زالت في النموذج»
 * في كل حالة لا نستطيع فيها إثبات أن الطلب حُفظ (انقطاع/5xx/استجابة مشوّهة).
 */
object RegistrationErrorMessage {
    const val CONNECTION = "تعذر تأكيد إرسال الطلب بسبب انقطاع الاتصال. بياناتك ما زالت في النموذج؛ تحقق من اتصالك وحاول بعد قليل."
    const val TOO_LARGE = "حجم المرفقات كبير. اختر ملفات أصغر ثم أعد تقديم الطلب."
    const val TOO_MANY = "تم تجاوز عدد المحاولات. انتظر قليلاً ثم حاول مجدداً."
    const val FORBIDDEN = "تعذر إتمام التحقق من الطلب. حاول مجدداً بعد قليل."
    const val UNCONFIRMED = "تعذر تأكيد استلام الطلب. بياناتك ما زالت في النموذج؛ حاول بعد قليل."

    fun message(error: Throwable): String {
        return when (error) {
            // رسالة الخادم (مثل «البريد مستخدم») تبقى كما هي؛ ورمز الحالة يقرر البقية.
            is AuthHttpException -> byStatus(error.statusCode, error.message)
            is AuthException -> error.message?.takeIf { it.isNotBlank() } ?: UNCONFIRMED
            is HttpException -> byStatus(error.code(), null)
            is SerializationException -> CONNECTION
            is IOException -> CONNECTION
            else -> UNCONFIRMED
        }
    }

    fun byStatus(code: Int, serverMessage: String?): String = when {
        code == 413 -> TOO_LARGE
        code == 429 -> TOO_MANY
        code == 403 -> FORBIDDEN
        code >= 500 || code == 408 -> CONNECTION
        !serverMessage.isNullOrBlank() -> serverMessage
        else -> UNCONFIRMED
    }
}
