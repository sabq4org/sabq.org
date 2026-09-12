package com.sabq.smart.feature.auth

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.platform.LocalContext
import com.google.android.gms.auth.api.phone.SmsRetriever
import com.google.android.gms.common.api.CommonStatusCodes
import com.google.android.gms.common.api.Status

/**
 * التقاط رمز التحقق من رسالة SABQ تلقائيًا عبر SMS User Consent API.
 *
 * لا يحتاج صلاحية READ_SMS ولا بصمة تطبيق في نص الرسالة: عند وصول رسالة تحوي
 * رمزًا من 4–10 أرقام خلال 5 دقائق، يعرض النظام نافذة موافقة واحدة
 * («السماح لتطبيق سبق بقراءة هذه الرسالة؟») ثم نستخرج الرمز ونمرّره.
 *
 * يُستدعى داخل خطوة إدخال الرمز فقط؛ يُلغى تلقائيًا عند مغادرتها.
 */
@Composable
fun SmsOtpAutofill(enabled: Boolean, onCode: (String) -> Unit) {
    val context = LocalContext.current
    val latestOnCode = rememberUpdatedState(onCode)

    val consentLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            val message = result.data?.getStringExtra(SmsRetriever.EXTRA_SMS_MESSAGE).orEmpty()
            extractOtp(message)?.let { latestOnCode.value(it) }
        }
    }

    DisposableEffect(enabled) {
        if (!enabled) return@DisposableEffect onDispose {}

        val receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context, intent: Intent) {
                if (intent.action != SmsRetriever.SMS_RETRIEVED_ACTION) return
                val extras = intent.extras ?: return
                @Suppress("DEPRECATION")
                val status = extras.get(SmsRetriever.EXTRA_STATUS) as? Status ?: return
                if (status.statusCode == CommonStatusCodes.SUCCESS) {
                    @Suppress("DEPRECATION")
                    val consentIntent = extras.getParcelable<Intent>(SmsRetriever.EXTRA_CONSENT_INTENT)
                    if (consentIntent != null) {
                        runCatching { consentLauncher.launch(consentIntent) }
                    }
                }
            }
        }
        val filter = IntentFilter(SmsRetriever.SMS_RETRIEVED_ACTION)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(receiver, filter, SmsRetriever.SEND_PERMISSION, null, Context.RECEIVER_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            context.registerReceiver(receiver, filter, SmsRetriever.SEND_PERMISSION, null)
        }
        // null = أي مُرسِل؛ الرسالة تأتي من اسم SABQ (أو Twilio تراجعًا) فلا نقيّد الرقم.
        runCatching { SmsRetriever.getClient(context).startSmsUserConsent(null) }

        onDispose { runCatching { context.unregisterReceiver(receiver) } }
    }
}

/** أول رقم من 6 خانات في النص (يطابق `رمز التحقق من سبق: 123456`). */
internal fun extractOtp(message: String): String? =
    Regex("(?<!\\d)(\\d{6})(?!\\d)").find(message)?.groupValues?.get(1)
