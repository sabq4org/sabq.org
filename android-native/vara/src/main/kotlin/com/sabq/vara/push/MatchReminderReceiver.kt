package com.sabq.vara.push

import android.Manifest
import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.sabq.vara.R
import com.sabq.vara.VaraActivity
import com.sabq.vara.core.Fixture
import com.sabq.vara.core.VaraPreferences
import com.sabq.vara.core.parseFixture
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray

object MatchReminderScheduler {
    // تذكير محلي واحد قبل الانطلاق بعشر دقائق فقط — إشعار «انطلقت» يأتي من
    // الخادم (قرار المالك 2026-07-04 في iOS): المحلي كان يزدوج معه ويكذب عند
    // تأخّر صافرة البداية.
    fun sync(context: Context, fixture: Fixture, following: Boolean) {
        val kickoff = fixture.kickoffMs ?: return
        if (!following) { cancel(context, fixture.id); return }
        schedule(context, fixture, kickoff - 10 * 60_000L, "pre")
    }

    /** بعد إعادة التشغيل/تحديث التطبيق: المنبّهات تُمسح — نعيدها من لقطات المتابعة المحفوظة. */
    fun rescheduleAll(context: Context) {
        val raw = VaraPreferences(context).followedFixturesJson
        if (raw.isNullOrBlank()) return
        val fixtures = runCatching {
            (Json.parseToJsonElement(raw) as? JsonArray)?.mapNotNull(::parseFixture).orEmpty()
        }.getOrDefault(emptyList())
        fixtures.forEach { sync(context, it, following = true) }
    }

    fun cancel(context: Context, fixtureId: Int) {
        val alarms = context.getSystemService(AlarmManager::class.java) ?: return
        listOf("pre", "kickoff").forEach { kind -> alarms.cancel(pending(context, fixtureId, kind, null)) }
    }

    private fun schedule(context: Context, fixture: Fixture, at: Long, kind: String) {
        if (at <= System.currentTimeMillis()) return
        val alarms = context.getSystemService(AlarmManager::class.java) ?: return
        val intent = Intent(context, MatchReminderReceiver::class.java).apply {
            putExtra("fixtureId", fixture.id); putExtra("kind", kind)
            putExtra("match", "${fixture.home.name} × ${fixture.away.name}")
        }
        alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending(context, fixture.id, kind, intent))
    }

    private fun pending(context: Context, fixtureId: Int, kind: String, source: Intent?): PendingIntent {
        val intent = source ?: Intent(context, MatchReminderReceiver::class.java)
        return PendingIntent.getBroadcast(context, "$fixtureId:$kind".hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
}

/** يستعيد تذكيرات «قبل ١٠ دقائق» بعد إقلاع الجهاز أو تحديث الحزمة. */
class MatchReminderBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        when (intent?.action) {
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED ->
                MatchReminderScheduler.rescheduleAll(context.applicationContext)
        }
    }
}

class MatchReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val fixtureId = intent.getIntExtra("fixtureId", 0)
        val kind = intent.getStringExtra("kind") ?: "kickoff"
        val match = intent.getStringExtra("match") ?: "مباراة تتابعها"
        VaraMessagingService.ensureChannel(context)
        val open = Intent(context, VaraActivity::class.java).apply { data = Uri.parse("sabqsports://match/$fixtureId"); flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP }
        val pending = PendingIntent.getActivity(context, fixtureId, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val title = "تبدأ بعد ١٠ دقائق ⚽"
        val notification = NotificationCompat.Builder(context, VaraMessagingService.CHANNEL_SPORTS)
            .setSmallIcon(R.drawable.ic_notification).setContentTitle(title).setContentText(match)
            .setPriority(NotificationCompat.PRIORITY_HIGH).setAutoCancel(true).setContentIntent(pending).build()
        NotificationManagerCompat.from(context).notify("$fixtureId:$kind".hashCode(), notification)
    }
}
