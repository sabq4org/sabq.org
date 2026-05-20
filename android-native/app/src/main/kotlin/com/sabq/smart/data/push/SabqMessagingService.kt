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
 *   - `kind` — optional event type (scheduled / published / rejected
 *              / needs_revision / archived)
 *
 * When `kind` is present we render the corresponding system
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
            notificationId = data["notification_id"],
            articleSlug = data["article_slug"],
            kind = data["kind"],
        )
    }

    private fun showNotification(
        title: String,
        body: String,
        notificationId: String?,
        articleSlug: String?,
        kind: String?,
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

        ensureChannel(this)

        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            data = Uri.parse("sabq://push?slug=${Uri.encode(articleSlug.orEmpty())}&id=${Uri.encode(notificationId.orEmpty())}&kind=${Uri.encode(kind.orEmpty())}")
            putExtra(EXTRA_ARTICLE_SLUG, articleSlug)
            putExtra(EXTRA_NOTIFICATION_ID, notificationId)
            putExtra(EXTRA_KIND, kind)
        }
        val requestCode = notificationId?.hashCode() ?: title.hashCode()
        val pending = PendingIntent.getActivity(
            this,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val builder = NotificationCompat.Builder(this, CHANNEL_EDITORIAL)
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

        const val EXTRA_ARTICLE_SLUG = "sabq.push.article_slug"
        const val EXTRA_NOTIFICATION_ID = "sabq.push.notification_id"
        const val EXTRA_KIND = "sabq.push.kind"

        /**
         * Create the editorial-push notification channel. Safe to call
         * repeatedly; the OS de-dupes by [CHANNEL_EDITORIAL] id.
         * Public so [com.sabq.smart.SabqApplication] can register it on
         * app startup (before any push arrives).
         */
        fun ensureChannel(context: Context) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
            val manager = context.getSystemService(NotificationManager::class.java) ?: return
            if (manager.getNotificationChannel(CHANNEL_EDITORIAL) != null) return
            val channel = NotificationChannel(
                CHANNEL_EDITORIAL,
                context.getString(R.string.push_channel_editorial_name),
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = context.getString(R.string.push_channel_editorial_description)
                enableLights(true)
                enableVibration(true)
            }
            manager.createNotificationChannel(channel)
        }
    }
}
