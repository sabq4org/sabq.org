package com.sabq.smart.data.push

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.sabq.smart.MainActivity
import com.sabq.smart.R
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * FCM entry point for the editorial push system. Receives token
 * rotations and incoming messages while the app is in the
 * background. iOS counterpart: `SabqAppDelegate.didReceive...`
 *
 * Expected `RemoteMessage.data` envelope (matches what
 * `server/jobs/pushWorker.ts` sends to APNs and FCM):
 *   - `title` — Arabic notification title
 *   - `body`  — Arabic notification body
 *   - `notification_id` — optional editorial-notification row id
 *   - `article_slug` — optional canonical slug for deep-linking
 *   - `kind` or `type` — event type (`gc.majlis.*` for council events)
 *   - `deeplink`, `majlisId`, `fixtureId` — Majlis navigation fields
 *
 * Majlis FCM messages are intentionally data-only so this callback owns the
 * notification in both foreground and background. When an event type is
 * present we render the corresponding system
 * notification on the [CHANNEL_EDITORIAL] channel and attach a
 * deep-link [PendingIntent] that opens [MainActivity] with the
 * relevant extras; [MainActivity] then forwards them to the Compose
 * nav graph (article detail or notifications list, depending on
 * payload).
 */
@AndroidEntryPoint
class SabqMessagingService : FirebaseMessagingService() {

    @Inject lateinit var deviceManager: DeviceRegistrationManager

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        Log.i(TAG, "FCM token rotated, length=${token.length}")
        scope.launch { runCatching { deviceManager.onNewToken(token) } }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        val title = data["title"]
            ?: message.notification?.title
            ?: getString(R.string.app_name)
        val body = data["body"]
            ?: message.notification?.body
            ?: return
        showNotification(
            title = title,
            body = body,
            notificationId = data["notification_id"] ?: data["deliveryId"] ?: data["delivery_id"],
            articleSlug = data["article_slug"],
            kind = data["kind"] ?: data["type"],
            deeplink = data["deeplink"],
            majlisId = data["majlisId"] ?: data["majlis_id"],
            majlisCode = data["majlisCode"] ?: data["majlis_code"],
            fixtureId = data["fixtureId"] ?: data["fixture_id"],
        )
    }

    private fun showNotification(
        title: String,
        body: String,
        notificationId: String?,
        articleSlug: String?,
        kind: String?,
        deeplink: String?,
        majlisId: String?,
        majlisCode: String?,
        fixtureId: String?,
    ) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.POST_NOTIFICATIONS,
            ) == PackageManager.PERMISSION_GRANTED
            if (!granted) {
                Log.w(TAG, "POST_NOTIFICATIONS not granted — dropping push display")
                return
            }
        }

        val isMajlis = kind?.startsWith("gc.majlis") == true ||
            !majlisId.isNullOrBlank() || !majlisCode.isNullOrBlank() ||
            deeplink?.contains("/gulf-cup/majlis") == true
        ensureChannels(this)

        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            data = when {
                !deeplink.isNullOrBlank() -> Uri.parse(
                    if (deeplink.startsWith('/')) "https://sabq.org$deeplink" else deeplink,
                )
                !majlisCode.isNullOrBlank() -> Uri.parse("sabqgulfcup://majlis?code=${Uri.encode(majlisCode)}")
                !majlisId.isNullOrBlank() -> Uri.parse(
                    buildString {
                        append("sabqgulfcup://majlis?id=${Uri.encode(majlisId)}")
                        if (!fixtureId.isNullOrBlank()) append("&fixture=${Uri.encode(fixtureId)}")
                    },
                )
                else -> Uri.parse("sabq://push?slug=${Uri.encode(articleSlug.orEmpty())}&id=${Uri.encode(notificationId.orEmpty())}&kind=${Uri.encode(kind.orEmpty())}")
            }
            putExtra(EXTRA_ARTICLE_SLUG, articleSlug)
            putExtra(EXTRA_NOTIFICATION_ID, notificationId)
            putExtra(EXTRA_KIND, kind)
            putExtra(EXTRA_MAJLIS_ID, majlisId)
            putExtra(EXTRA_MAJLIS_CODE, majlisCode)
            putExtra(EXTRA_FIXTURE_ID, fixtureId)
        }
        val requestCode = notificationId?.hashCode() ?: title.hashCode()
        val pending = PendingIntent.getActivity(
            this,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val builder = NotificationCompat.Builder(this, if (isMajlis) CHANNEL_GULF_CUP_MAJLIS else CHANNEL_EDITORIAL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_SOCIAL)
            .setAutoCancel(true)
            .setContentIntent(pending)

        NotificationManagerCompat.from(this).notify(requestCode, builder.build())
    }

    companion object {
        private const val TAG = "SabqMessagingService"

        /** Editorial push channel id (matches iOS APS topic semantics). */
        const val CHANNEL_EDITORIAL = "sabq_editorial"
        const val CHANNEL_GULF_CUP_MAJLIS = "gulf_cup_majlis"

        const val EXTRA_ARTICLE_SLUG = "sabq.push.article_slug"
        const val EXTRA_NOTIFICATION_ID = "sabq.push.notification_id"
        const val EXTRA_KIND = "sabq.push.kind"
        const val EXTRA_MAJLIS_ID = "sabq.push.majlis_id"
        const val EXTRA_MAJLIS_CODE = "sabq.push.majlis_code"
        const val EXTRA_FIXTURE_ID = "sabq.push.fixture_id"

        /**
         * Create the editorial-push notification channel. Safe to call
         * repeatedly; the OS de-dupes by [CHANNEL_EDITORIAL] id.
         * Public so [com.sabq.smart.SabqApplication] can register it on
         * app startup (before any push arrives).
         */
        fun ensureChannel(context: Context) = ensureChannels(context)

        fun ensureChannels(context: Context) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
            val manager = context.getSystemService(NotificationManager::class.java) ?: return
            if (manager.getNotificationChannel(CHANNEL_EDITORIAL) == null) {
                manager.createNotificationChannel(
                    NotificationChannel(
                        CHANNEL_EDITORIAL,
                        context.getString(R.string.push_channel_editorial_name),
                        NotificationManager.IMPORTANCE_HIGH,
                    ).apply {
                        description = context.getString(R.string.push_channel_editorial_description)
                        enableLights(true)
                        enableVibration(true)
                    },
                )
            }
            if (manager.getNotificationChannel(CHANNEL_GULF_CUP_MAJLIS) == null) {
                manager.createNotificationChannel(
                    NotificationChannel(
                        CHANNEL_GULF_CUP_MAJLIS,
                        "مجالس توقعات خليجي 27",
                        NotificationManager.IMPORTANCE_HIGH,
                    ).apply {
                        description = "تنبيهات الإقفال وتغيّر الترتيب وانضمام أعضاء المجلس"
                        enableLights(true)
                        enableVibration(true)
                    },
                )
            }
        }
    }
}
