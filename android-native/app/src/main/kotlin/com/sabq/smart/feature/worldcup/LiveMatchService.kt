package com.sabq.smart.feature.worldcup

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.sabq.smart.MainActivity
import com.sabq.smart.R
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * إشعار «المباراة الجارية» — نظير النشاط المباشر (Live Activity) في iOS.
 * خدمة أمامية بإشعار جارٍ يعرض النتيجة والدقيقة (عدّاد ذاتي) وآخر حدث،
 * وتسحب /api/world-cup/match/:id بفواصل iOS نفسها. عند صافرة النهاية تتوقف
 * الخدمة ويبقى إشعار النتيجة النهائية ساعتين. مباراة واحدة في كل مرة.
 */
@AndroidEntryPoint
class LiveMatchService : Service() {

    @Inject lateinit var repo: WorldCupRepository

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var pollJob: Job? = null
    private var fixtureId: Int = 0
    private var lastNotification: Notification? = null
    private val clockAnchor = LiveMatchFollow.ClockAnchor()

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopFollowing(removeNotification = true)
                return START_NOT_STICKY
            }
            ACTION_START -> {
                val id = intent.getIntExtra(EXTRA_FIXTURE_ID, 0)
                if (id <= 0) {
                    stopFollowing(removeNotification = true)
                    return START_NOT_STICKY
                }
                val title = intent.getStringExtra(EXTRA_TITLE).orEmpty().ifBlank { "مباراة كأس العالم" }
                ensureChannel(this)
                // يجب استدعاء startForeground خلال ثوانٍ من startForegroundService.
                // نعيد استخدام آخر إشعار للمباراة نفسها كي لا يرتد إلى نص التحميل.
                val current = lastNotification.takeIf { fixtureId == id }
                val placeholder = current ?: baseBuilder(id)
                    .setContentTitle(title)
                    .setContentText("جارٍ جلب آخر المستجدات…")
                    .setOngoing(true)
                    .build()
                startAsForeground(placeholder)
                if (fixtureId != id) {
                    fixtureId = id
                    LiveMatchFollow.setActive(id)
                    startPolling(id)
                }
                return START_NOT_STICKY
            }
        }
        // إعادة إنشاء بلا نية صالحة — لا شيء نتابعه.
        stopFollowing(removeNotification = true)
        return START_NOT_STICKY
    }

    private fun startAsForeground(n: Notification) {
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
        } else {
            0
        }
        ServiceCompat.startForeground(this, NOTIFICATION_ID, n, type)
    }

    private fun startPolling(id: Int) {
        pollJob?.cancel()
        pollJob = scope.launch {
            while (isActive) {
                val detail = runCatching { repo.match(id) }.getOrNull()
                if (detail != null) {
                    val f = detail.fixture
                    val nowMs = System.currentTimeMillis()
                    if (f.status.finished) {
                        showFinal(id, detail)
                        return@launch
                    }
                    notifyUpdate(build(id, detail, nowMs))
                    val next = LiveMatchFollow.pollIntervalMs(f, nowMs / 1000)
                    if (next == null) {
                        // مضى نصف ساعة على الموعد بلا بث (تأجيل/إلغاء) — توقّف.
                        stopFollowing(removeNotification = true)
                        return@launch
                    }
                    delay(next)
                } else {
                    // فشل شبكة عابر — أعد المحاولة بعد 15 ثانية.
                    delay(15_000L)
                }
            }
        }
    }

    private fun baseBuilder(id: Int): NotificationCompat.Builder {
        val open = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            data = Uri.parse("https://sabq.org/world-cup/match/$id")
        }
        val openPi = PendingIntent.getActivity(
            this, id, open,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentIntent(openPi)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOnlyAlertOnce(true)
            .setSilent(true)
    }

    private fun build(id: Int, d: WcMatchDetail, nowMs: Long): Notification {
        val f = d.fixture
        val stop = Intent(this, LiveMatchService::class.java).setAction(ACTION_STOP)
        val stopPi = PendingIntent.getService(
            this, 0, stop,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val b = baseBuilder(id)
            .setContentTitle(LiveMatchFollow.scoreLine(f))
            .setContentText(LiveMatchFollow.detailLine(d))
            .setOngoing(true)
            .addAction(0, "إيقاف المتابعة", stopPi)
        val clock = clockAnchor.anchor(f.status, nowMs)
        val kickoffMs = f.timestamp.toLong() * 1000
        when {
            clock != null -> b.setWhen(clock).setShowWhen(true).setUsesChronometer(true)
            LiveMatchFollow.isUpcoming(f) && kickoffMs > nowMs ->
                b.setWhen(kickoffMs).setShowWhen(true).setUsesChronometer(true).setChronometerCountDown(true)
            else -> b.setShowWhen(false).setUsesChronometer(false)
        }
        return b.build()
    }

    private fun showFinal(id: Int, d: WcMatchDetail) {
        val n = baseBuilder(id)
            .setContentTitle(LiveMatchFollow.scoreLine(d.fixture))
            .setContentText(LiveMatchFollow.detailLine(d))
            .setOngoing(false)
            .setAutoCancel(true)
            .setShowWhen(false)
            .setTimeoutAfter(LiveMatchFollow.FINAL_KEEP_MS)
            .build()
        // نفصل الإشعار عن الخدمة كي يبقى بعد توقفها، ثم نحدّثه بالنهائي.
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_DETACH)
        notifyUpdate(n)
        finishService()
    }

    private fun notifyUpdate(n: Notification) {
        lastNotification = n
        getSystemService(NotificationManager::class.java)?.notify(NOTIFICATION_ID, n)
    }

    private fun stopFollowing(removeNotification: Boolean) {
        ServiceCompat.stopForeground(
            this,
            if (removeNotification) ServiceCompat.STOP_FOREGROUND_REMOVE else ServiceCompat.STOP_FOREGROUND_DETACH,
        )
        if (removeNotification) getSystemService(NotificationManager::class.java)?.cancel(NOTIFICATION_ID)
        finishService()
    }

    private fun finishService() {
        pollJob?.cancel()
        pollJob = null
        fixtureId = 0
        lastNotification = null
        LiveMatchFollow.setActive(null)
        stopSelf()
    }

    override fun onDestroy() {
        scope.cancel()
        LiveMatchFollow.setActive(null)
        super.onDestroy()
    }

    companion object {
        const val CHANNEL_ID = "sabq_live_match"
        private const val NOTIFICATION_ID = 7_301
        private const val ACTION_START = "com.sabq.smart.livematch.START"
        private const val ACTION_STOP = "com.sabq.smart.livematch.STOP"
        private const val EXTRA_FIXTURE_ID = "fixtureId"
        private const val EXTRA_TITLE = "title"

        fun start(context: Context, fixture: WcFixture) {
            val i = Intent(context, LiveMatchService::class.java)
                .setAction(ACTION_START)
                .putExtra(EXTRA_FIXTURE_ID, fixture.id)
                .putExtra(EXTRA_TITLE, LiveMatchFollow.scoreLine(fixture))
            ContextCompat.startForegroundService(context, i)
        }

        fun stop(context: Context) {
            context.startService(Intent(context, LiveMatchService::class.java).setAction(ACTION_STOP))
        }

        /** هل يستطيع المستخدم رؤية الإشعار؟ (الإذن العام + القناة غير مكتومة). */
        fun notificationsVisible(context: Context): Boolean {
            val nm = context.getSystemService(NotificationManager::class.java) ?: return false
            if (!nm.areNotificationsEnabled()) return false
            val ch = nm.getNotificationChannel(CHANNEL_ID) ?: return true
            return ch.importance != NotificationManager.IMPORTANCE_NONE
        }

        fun ensureChannel(context: Context) {
            val nm = context.getSystemService(NotificationManager::class.java) ?: return
            if (nm.getNotificationChannel(CHANNEL_ID) != null) return
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "متابعة المباريات المباشرة", NotificationManager.IMPORTANCE_LOW).apply {
                    description = "النتيجة والدقيقة وآخر حدث للمباراة التي تتابعها"
                    setShowBadge(false)
                },
            )
        }
    }
}
