package com.sabq.vara.push

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.sabq.vara.R
import com.sabq.vara.VaraActivity
import com.sabq.vara.core.SecureSessionStore
import com.sabq.vara.core.VaraApi
import com.sabq.vara.core.VaraPreferences
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.serialization.json.contentOrNull

class VaraMessagingService : FirebaseMessagingService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        scope.launch {
            val sessions = SecureSessionStore(applicationContext)
            val api = VaraApi(applicationContext, sessions, VaraPreferences(applicationContext))
            runCatching {
                if (sessions.read().isNullOrBlank()) return@runCatching
                val root = api.memberGet("/members/profile")
                val memberId = (root as? kotlinx.serialization.json.JsonObject)?.obj("member", "user")?.string("id", "userId")
                api.registerDevice(token, memberId)
            }
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        val title = data["title"] ?: message.notification?.title ?: "VARA"
        // إشعار بعنوان فقط (بلا body) يبقى صالحًا — كان يُبتلع سابقًا.
        val body = data["body"] ?: message.notification?.body ?: ""
        if (title.isBlank() && body.isBlank()) return
        val fixtureId = data["fixtureId"] ?: data["fixture_id"]
        val deeplink = data["deeplink"] ?: fixtureId?.let { "sabqsports://match/$it" } ?: "sabqsports://account"
        showNotification(title, body, deeplink, data["notification_id"] ?: data["deliveryId"])
    }

    private fun showNotification(title: String, body: String, deeplink: String, id: String?) {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        ensureChannel(this)
        val intent = Intent(this, VaraActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            data = Uri.parse(if (deeplink.startsWith('/')) "https://sabq.org$deeplink" else deeplink)
            putExtra("deeplink", deeplink)
        }
        val requestCode = id?.hashCode() ?: deeplink.hashCode()
        val pending = PendingIntent.getActivity(this, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notification = NotificationCompat.Builder(this, CHANNEL_SPORTS)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_EVENT)
            .setAutoCancel(true)
            .setContentIntent(pending)
            .build()
        NotificationManagerCompat.from(this).notify(requestCode, notification)
    }

    companion object {
        const val CHANNEL_SPORTS = "vara_sports_alerts"
        fun ensureChannel(context: Context) {
            if (Build.VERSION.SDK_INT < 26) return
            val manager = context.getSystemService(NotificationManager::class.java) ?: return
            if (manager.getNotificationChannel(CHANNEL_SPORTS) == null) {
                manager.createNotificationChannel(NotificationChannel(CHANNEL_SPORTS, "تنبيهات VARA الرياضية", NotificationManager.IMPORTANCE_HIGH).apply {
                    description = "أهداف وبطاقات وفار ونهاية المباريات والانتقالات"
                    enableVibration(true); enableLights(true)
                })
            }
        }
    }
}

private fun kotlinx.serialization.json.JsonObject.obj(vararg keys: String): kotlinx.serialization.json.JsonObject? = keys.firstNotNullOfOrNull { this[it] as? kotlinx.serialization.json.JsonObject }
private fun kotlinx.serialization.json.JsonObject.string(vararg keys: String): String? = keys.firstNotNullOfOrNull { (this[it] as? kotlinx.serialization.json.JsonPrimitive)?.contentOrNull }
