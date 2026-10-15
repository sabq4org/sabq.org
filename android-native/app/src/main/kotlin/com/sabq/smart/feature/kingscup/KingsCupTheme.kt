package com.sabq.smart.feature.kingscup

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import com.sabq.smart.ui.theme.SabqTheme
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.DecimalStyle
import java.util.Locale
import kotlinx.coroutines.delay

/**
 * لوحة قسم كأس الملك — تعيد استخدام هوية المونديال (WCTheme) رقمًا برقم كما
 * فعل iOS (emerald + gold): رموز ثابتة للهوية وأسطح/نصوص تكيّفية تتبع نمط
 * التطبيق عبر `SabqTheme.colors.isDark`.
 */
object KingsCupColors {
    // ── رموز ثابتة (هوية الملعب) ──
    val royal = Color(0.06f, 0.50f, 0.33f)
    val emerald = Color(0.16f, 0.74f, 0.48f)
    val gold = Color(0.96f, 0.72f, 0.20f)
    val liveRed = Color(0.93f, 0.26f, 0.30f)
    val sky = Color(0.18f, 0.70f, 0.60f)
    val leaf = Color(0.45f, 0.78f, 0.30f)
    val heroTop = Color(0.03f, 0.34f, 0.22f)
    val heroBottom = Color(0.08f, 0.56f, 0.36f)
    val stadiumTop = Color(0.03f, 0.18f, 0.12f)
    val stadiumBottom = Color(0.05f, 0.28f, 0.18f)
    val pitchTop = Color(0.06f, 0.34f, 0.20f)
    val pitchBottom = Color(0.04f, 0.22f, 0.13f)

    private val darkMode: Boolean
        @Composable @ReadOnlyComposable get() = SabqTheme.colors.isDark

    // ── أسطح/نصوص تكيّفية ──
    val emeraldDeep: Color
        @Composable @ReadOnlyComposable
        get() = if (darkMode) Color(0.22f, 0.80f, 0.52f) else Color(0.04f, 0.42f, 0.28f)

    val onDark: Color
        @Composable @ReadOnlyComposable
        get() = if (darkMode) Color.White else Color(0.06f, 0.13f, 0.10f)

    val onDarkDim: Color
        @Composable @ReadOnlyComposable
        get() = if (darkMode) Color.White.copy(alpha = 0.62f) else Color(0.36f, 0.46f, 0.42f)

    val card: Color
        @Composable @ReadOnlyComposable
        get() = if (darkMode) Color.White.copy(alpha = 0.06f) else Color.White

    val cardStroke: Color
        @Composable @ReadOnlyComposable
        get() = if (darkMode) Color.White.copy(alpha = 0.10f) else Color(0.04f, 0.42f, 0.28f, 0.12f)

    val chipFill: Color
        @Composable @ReadOnlyComposable
        get() = if (darkMode) Color.White.copy(alpha = 0.10f) else Color(0.10f, 0.55f, 0.35f, 0.08f)

    val sheetBackground: Color
        @Composable @ReadOnlyComposable
        get() = if (darkMode) Color(0.04f, 0.16f, 0.11f) else Color(0.94f, 0.98f, 0.95f)

    /** خلفية القسم — أخضر خفيف جدًا في الفاتح، أخضر داكن في الداكن. */
    val sectionBackground: Brush
        @Composable @ReadOnlyComposable
        get() = if (darkMode) {
            Brush.verticalGradient(
                listOf(Color(0.03f, 0.12f, 0.08f), Color(0.04f, 0.16f, 0.11f), Color(0.03f, 0.12f, 0.08f)),
            )
        } else {
            Brush.verticalGradient(
                listOf(Color(0.91f, 0.97f, 0.93f), Color(0.94f, 0.98f, 0.95f), Color(0.91f, 0.97f, 0.93f)),
            )
        }
}

/**
 * تنسيق التوقيت — الرياض/ميلادي/أرقام لاتينية، مرآة iOS `KcFormat`
 * (يعيد استخدام مُنسِّقات المونديال هناك — هنا ذاتي الاكتفاء بنمط RsFormat).
 */
object KcFormat {
    private val riyadh: ZoneId = ZoneId.of("Asia/Riyadh")
    private val ar: Locale = Locale.forLanguageTag("ar")

    private val timeFmt: DateTimeFormatter =
        DateTimeFormatter.ofPattern("h:mm a", ar).withDecimalStyle(DecimalStyle.STANDARD).withZone(riyadh)
    private val dayFmt: DateTimeFormatter =
        DateTimeFormatter.ofPattern("EEEE، d MMMM", ar).withDecimalStyle(DecimalStyle.STANDARD).withZone(riyadh)

    private fun instant(iso: String) = runCatching { OffsetDateTime.parse(iso).toInstant() }.getOrNull()

    fun time(f: KcFixture): String = instant(f.date)?.let { timeFmt.format(it) } ?: ""
    fun day(f: KcFixture): String = instant(f.date)?.let { dayFmt.format(it) } ?: ""
    fun day(iso: String): String = instant(iso)?.let { dayFmt.format(it) } ?: ""

    /** مفتاح اليوم بتوقيت الرياض (التواريخ تصل بإزاحة +03:00 فالقصّ مباشر). */
    fun dayKey(iso: String): String = iso.take(10)
    fun todayKey(): String = LocalDate.now(riyadh).toString()

    /** «2026» لدى المزوّد = نسخة 2025/26 (الكؤوس تُرقَّم بسنة النهاية). */
    fun seasonLabel(season: Int): String = "${season - 1}/${season.toString().takeLast(2)}"

    /** صياغة عربية سليمة، أو HH:MM:SS في آخر يوم — نفس عقد WCFormat.countdown. */
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

    fun latinDecimal(value: Double, digits: Int = 1): String =
        String.format(Locale.US, "%.${digits}f", value)

    /** «12 مليون يورو» — القيمة السوقية بصياغة iOS money(). */
    fun money(v: Double, currency: String): String = when {
        v >= 1_000_000 -> {
            val m = v / 1_000_000
            if (m == Math.floor(m)) "${m.toInt()} مليون $currency" else String.format(Locale.US, "%.1f مليون %s", m, currency)
        }
        v >= 1_000 -> "${(v / 1_000).toInt()} ألف $currency"
        else -> "${v.toInt()} $currency"
    }
}

/** نبضة ثانية للعدّادات — نفس idiom بقية أقسام البطولات. */
@Composable
fun rememberKcSecondTicker(): Long {
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(1000)
            now = System.currentTimeMillis()
        }
    }
    return now
}
