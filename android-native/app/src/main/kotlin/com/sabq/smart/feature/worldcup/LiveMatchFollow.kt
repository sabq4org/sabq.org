package com.sabq.smart.feature.worldcup

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * منطق «المتابعة المباشرة» لمباراة كأس العالم — نظير LiveMatchActivityManager
 * في iOS (النشاط المباشر على شاشة القفل). على أندرويد يقابله إشعار جارٍ
 * تحدّثه [LiveMatchService]. كل الدوال هنا نقيّة وقابلة للاختبار.
 */
object LiveMatchFollow {

    /** أكواد توقّف الساعة (استراحة/فاصل/ركلات ترجيح/إيقاف) — تجمّد العدّاد. */
    private val PAUSED_CODES = setOf("HT", "BT", "P", "PEN", "BREAK", "INT", "SUSP", "HALF_TIME")

    private val KEY_EVENTS = setOf("goal", "yellow-card", "red-card", "missed-penalty")

    /** مدة بقاء النتيجة النهائية في الإشعار بعد صافرة النهاية (ساعتان كـ iOS). */
    const val FINAL_KEEP_MS: Long = 2 * 60 * 60 * 1000L

    private val _activeFixtureId = MutableStateFlow<Int?>(null)

    /** المباراة المتابَعة الآن (واحدة فقط في كل مرة) — يقرؤها زر مركز المباراة. */
    val activeFixtureId: StateFlow<Int?> = _activeFixtureId.asStateFlow()

    internal fun setActive(id: Int?) {
        _activeFixtureId.value = id
    }

    /** يظهر الزر للمباراة الجارية، أو القادمة خلال ساعة من انطلاقها. */
    fun isEligible(f: WcFixture, nowSec: Long): Boolean {
        if (f.status.live) return true
        if (f.status.finished) return false
        val toKickoff = f.timestamp.toLong() - nowSec
        return toKickoff <= 3600 && toKickoff > -120
    }

    fun isUpcoming(f: WcFixture): Boolean = !f.status.live && !f.status.finished

    fun buttonTitle(running: Boolean, f: WcFixture): String = when {
        running -> "إيقاف المتابعة المباشرة"
        isUpcoming(f) -> "ذكّرني على شاشة القفل"
        else -> "تابع على شاشة القفل"
    }

    /**
     * فاصل السحب بالمللي ثانية، أو null لإيقاف السحب:
     * 5 ث أثناء اللعب، 60 ث قبل الانطلاق بأكثر من 3 دقائق،
     * 15 ث من −3 دقائق حتى +30 دقيقة، ثم توقّف (تأجيل/إلغاء).
     */
    fun pollIntervalMs(f: WcFixture, nowSec: Long): Long? {
        if (f.status.finished) return null
        if (f.status.live) return 5_000L
        val toKickoff = f.timestamp.toLong() - nowSec
        if (toKickoff > 180) return 60_000L
        if (toKickoff > -1800) return 15_000L
        return null
    }

    fun minuteText(s: WcStatus): String {
        val elapsed = s.elapsed ?: return ""
        if (elapsed <= 0) return ""
        val extra = s.extra
        return if (extra != null && extra > 0) "$elapsed+$extra'" else "$elapsed'"
    }

    fun isClockRunning(code: String): Boolean = code.uppercase() !in PAUSED_CODES

    /**
     * مرساة الساعة الذاتية بالمللي ثانية = الآن − (المنقضي + بدل الضائع) دقائق.
     * null وقت التوقّف كي يُجمَّد العرض على الدقيقة المدفوعة.
     */
    fun clockStartMillis(s: WcStatus, nowMs: Long): Long? {
        if (!s.live || s.finished) return null
        val m = s.elapsed ?: return null
        if (m <= 0 || !isClockRunning(s.code)) return null
        return nowMs - (m + (s.extra ?: 0)) * 60_000L
    }

    /**
     * مرساة ساعة ثابتة بين الردود: الخادم يعطي الدقيقة كاملة فقط، فلو أعدنا
     * الحساب في كل سحب (كل 5 ث) لارتدّ العدّاد إلى «:00» مرارًا داخل الدقيقة.
     * نُبقي المرساة ما دامت الدقيقة/بدل الضائع/الكود كما هي، ونصحّحها عند تغيّرها.
     */
    class ClockAnchor {
        private var key: Triple<Int?, Int?, String>? = null
        private var start: Long? = null

        fun anchor(s: WcStatus, nowMs: Long): Long? {
            val fresh = clockStartMillis(s, nowMs)
            if (fresh == null) {
                key = null
                start = null
                return null
            }
            val k = Triple(s.elapsed, s.extra, s.code.uppercase())
            if (k != key || start == null) {
                key = k
                start = fresh
            }
            return start
        }
    }

    /** آخر حدث مهم (هدف/بطاقة/ركلة جزاء ضائعة) على سطر واحد. */
    fun lastEventText(events: List<WcMatchEvent>): String? {
        val ev = events
            .sortedWith(compareByDescending<WcMatchEvent> { it.minute }.thenByDescending { it.extraMinute ?: 0 })
            .firstOrNull { it.type in KEY_EVENTS } ?: return null
        val icon = when (ev.type) {
            "goal" -> "⚽"
            "yellow-card" -> "🟨"
            "red-card" -> "🟥"
            "missed-penalty" -> "❌"
            else -> "•"
        }
        val minute = "${ev.minute}${ev.extraMinute?.let { "+$it" } ?: ""}'"
        val who = ev.player.ifBlank { ev.label }
        return "$icon $minute $who"
    }

    /** سطر النتيجة: «المضيف 2 - 1 الضيف»، أو «المضيف ضد الضيف» قبل البداية. */
    fun scoreLine(f: WcFixture): String {
        val h = f.goals.home
        val a = f.goals.away
        return if (!isUpcoming(f) || (h != null && a != null)) {
            "${f.home.name} ${h ?: 0} - ${a ?: 0} ${f.away.name}"
        } else {
            "${f.home.name} ضد ${f.away.name}"
        }
    }

    /** السطر الثاني في الإشعار: الحالة/الدقيقة ثم آخر حدث. */
    fun detailLine(d: WcMatchDetail): String {
        val f = d.fixture
        val status = when {
            f.status.finished -> f.status.label.ifBlank { "انتهت المباراة" }
            f.status.live -> {
                val minute = minuteText(f.status)
                if (!isClockRunning(f.status.code) || minute.isEmpty()) f.status.label.ifBlank { minute } else minute
            }
            else -> "تنطلق المباراة قريبًا"
        }
        val last = lastEventText(d.events)
        return listOf(status, last).filter { !it.isNullOrBlank() }.joinToString(" · ")
    }
}
