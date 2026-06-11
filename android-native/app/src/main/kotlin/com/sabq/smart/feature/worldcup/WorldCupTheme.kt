package com.sabq.smart.feature.worldcup

import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.DecimalStyle
import java.util.Locale

/**
 * لوحة ألوان «الملعب الليلي» الموحّدة للقسم — ثابتة عبر الوضعين (مطابقة لـiOS WCTheme).
 */
object WcColors {
    val stadiumTop = Color(0.02f, 0.15f, 0.11f)
    val stadiumMid = Color(0.03f, 0.18f, 0.13f)
    val stadiumBottom = Color(0.02f, 0.22f, 0.16f)
    val emerald = Color(0.20f, 0.83f, 0.60f)
    val emeraldDeep = Color(0.06f, 0.50f, 0.36f)
    val pitchTop = Color(0.13f, 0.55f, 0.35f)
    val pitchBottom = Color(0.09f, 0.42f, 0.27f)
    val liveRed = Color(0.90f, 0.22f, 0.22f)
    val sky = Color(0.35f, 0.66f, 0.96f)
    val gold = Color(0.92f, 0.68f, 0.20f)
    val leaf = Color(0.40f, 0.73f, 0.22f)

    val card = Color.White.copy(alpha = 0.06f)
    val cardStroke = Color.White.copy(alpha = 0.10f)
    val onDark = Color.White
    val onDarkDim = Color.White.copy(alpha = 0.62f)
    val chipFill = Color.White.copy(alpha = 0.10f)

    val sectionBackground: Brush
        get() = Brush.verticalGradient(listOf(stadiumTop, stadiumMid, stadiumBottom))
}

/**
 * منسّقات التوقيت — توقيت الرياض، ميلادي، أرقام لاتينية.
 * ملاحظة: DateTimeFormatter في جافا ميلادي افتراضًا (بخلاف iOS الذي يتحوّل
 * للهجري مع ar_SA)، لكن نفرض DecimalStyle.STANDARD لأرقام لاتينية.
 */
object WcFormat {
    private val riyadh: ZoneId = ZoneId.of("Asia/Riyadh")
    private val ar: Locale = Locale.forLanguageTag("ar")

    private val timeFmt: DateTimeFormatter =
        DateTimeFormatter.ofPattern("h:mm a", ar).withDecimalStyle(DecimalStyle.STANDARD).withZone(riyadh)

    private val dayFmt: DateTimeFormatter =
        DateTimeFormatter.ofPattern("EEEE، d MMMM", ar).withDecimalStyle(DecimalStyle.STANDARD).withZone(riyadh)

    private fun instant(iso: String) = runCatching { OffsetDateTime.parse(iso).toInstant() }.getOrNull()

    fun time(f: WcFixture): String = instant(f.date)?.let { timeFmt.format(it) } ?: ""
    fun day(f: WcFixture): String = instant(f.date)?.let { dayFmt.format(it) } ?: ""

    /** مفتاح اليوم بتوقيت الرياض من سلسلة ISO (تصل بإزاحة +03:00 فالقصّ مباشر) */
    fun dayKey(iso: String): String = iso.take(10)

    fun todayKey(): String = LocalDate.now(riyadh).toString()

    /** صياغة عربية سليمة، أو HH:MM:SS في آخر يوم */
    fun countdown(timestamp: Int, nowMillis: Long): String {
        val total = (timestamp.toLong() * 1000L - nowMillis).coerceAtLeast(0L) / 1000L
        val days = (total / 86_400).toInt()
        val hours = ((total % 86_400) / 3_600).toInt()
        val minutes = ((total % 3_600) / 60).toInt()
        val seconds = (total % 60).toInt()
        if (days == 0) return String.format(Locale.US, "%02d:%02d:%02d", hours, minutes, seconds)
        val d = arabicDays(days)
        return if (hours > 0) "$d و${arabicHours(hours)}" else d
    }

    fun arabicDays(n: Int): String = when {
        n == 1 -> "يوم"
        n == 2 -> "يومين"
        n in 3..10 -> "$n أيام"
        else -> "$n يومًا"
    }

    fun arabicHours(n: Int): String = when {
        n == 1 -> "ساعة"
        n == 2 -> "ساعتين"
        n in 3..10 -> "$n ساعات"
        else -> "$n ساعة"
    }
}
