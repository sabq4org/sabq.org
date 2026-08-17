package com.sabq.smart.feature.roshn

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import com.sabq.smart.ui.theme.SabqTheme
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.DecimalStyle
import java.util.Locale
import kotlinx.coroutines.delay

/**
 * هوية روشن «أخضر الملعب» (2026-08-01) — منقولة رقمًا برقم من iOS
 * `RoshnTheme` (Services/RoshnModels.swift) بعد اعتماد المالك: ألوان مسطّحة
 * نقية بتشبّع متوسط، صفر تدرّجات وصفر حدود؛ زمردي للهيرو والتفاعل، قماشة
 * فستقية-رملية تُبرز البطاقات البيضاء بالظل الخفيف، ذهب للتتويج، وحبر
 * داكن مخضرّ. التكيّف الليلي عبر `SabqTheme.colors.isDark`.
 */
object RoshnColors {
    private val darkMode: Boolean
        @Composable @ReadOnlyComposable get() = SabqTheme.colors.isDark

    /** الزمردي الأساسي — هيرو/تفاعل/نتائج (الاسم `sky` تاريخي، مطابق iOS). */
    val sky: Color
        @Composable @ReadOnlyComposable
        get() = if (darkMode) Color(0.18f, 0.71f, 0.47f) else Color(0.12f, 0.62f, 0.39f)

    /** أرضية زمردية ناعمة (شارات/أقراص أرقام). */
    val skySoft: Color
        @Composable @ReadOnlyComposable
        get() = if (darkMode) Color(0.09f, 0.15f, 0.11f) else Color(0.89f, 0.95f, 0.91f)

    /** زمردي أعمق للمؤشرات الإيجابية. */
    val pitch: Color
        @Composable @ReadOnlyComposable
        get() = if (darkMode) Color(0.25f, 0.64f, 0.43f) else Color(0.09f, 0.48f, 0.30f)

    val pitchSoft: Color
        @Composable @ReadOnlyComposable
        get() = if (darkMode) Color(0.09f, 0.15f, 0.11f) else Color(0.89f, 0.95f, 0.91f)

    /** ذهبي التتويج والمراكز الأولى. */
    val gold: Color
        @Composable @ReadOnlyComposable
        get() = if (darkMode) Color(0.88f, 0.71f, 0.33f) else Color(0.85f, 0.66f, 0.25f)

    val goldSoft: Color
        @Composable @ReadOnlyComposable
        get() = if (darkMode) Color(0.17f, 0.14f, 0.07f) else Color(0.97f, 0.93f, 0.85f)

    /** حبر داكن مخضرّ للنصوص الأساسية، ورمادي مخضرّ للثانوية. */
    val ink: Color
        @Composable @ReadOnlyComposable
        get() = if (darkMode) Color(0.91f, 0.94f, 0.91f) else Color(0.08f, 0.16f, 0.13f)

    val inkSoft: Color
        @Composable @ReadOnlyComposable
        get() = if (darkMode) Color(0.58f, 0.64f, 0.60f) else Color(0.36f, 0.44f, 0.40f)

    /** فواصل نادرة — الهوية بلا حدود؛ يبقى للحالات الاضطرارية. */
    val line: Color
        @Composable @ReadOnlyComposable
        get() = if (darkMode) Color(0.15f, 0.19f, 0.16f) else Color(0.89f, 0.90f, 0.85f)

    val liveRed = Color(0.82f, 0.31f, 0.31f)

    /** هبوط (المراكز الثلاثة الأخيرة في الترتيب). */
    val danger = Color(0.82f, 0.31f, 0.31f)

    /** حبر داكن للإبراز (شارات المنصّة) — عائلة ink الفاتح. */
    val navy = Color(0.08f, 0.16f, 0.13f)

    /** القماشة الفستقية-الرملية — ليست بيضاء عمدًا كي تتمايز البطاقات بلا حدود. */
    val canvas: Color
        @Composable @ReadOnlyComposable
        get() = if (darkMode) Color(0.07f, 0.09f, 0.07f) else Color(0.94f, 0.94f, 0.90f)

    val card: Color
        @Composable @ReadOnlyComposable
        get() = if (darkMode) Color(0.11f, 0.14f, 0.11f) else Color(1f, 1f, 1f)

    /** الهيرو زمردي صلب — النص عليه أبيض دائمًا في النمطين. */
    val heroOn = Color.White
    val heroOnSoft = Color.White.copy(alpha = 0.85f)

    /** شارة فوق الهيرو الزمردي (عدّاد/مقاييس/حالات) — بيضاء شفافة. */
    val heroChip = Color.White.copy(alpha = 0.16f)

    /** سطح الهيرو (المركز/النادي/المباراة) — زمردي مسطّح بلا تدرّج. */
    val hero: Color @Composable @ReadOnlyComposable get() = sky

    /** ظل البطاقات الموحّد — بديل الحدود على القماشة الفستقية. */
    val cardShadow = Color(0.08f, 0.24f, 0.16f).copy(alpha = 0.35f)
}

/**
 * تنسيق التوقيت والأرقام — الرياض/ميلادي/لاتيني، مرآة iOS `RsFormat`
 * (نفس منطق WcFormat لكن ذاتي الاكتفاء حتى لا يرتبط روشن الدائم
 * بقسم بطولة موسمية قد يُزال).
 */
object RsFormat {
    private val riyadh: ZoneId = ZoneId.of("Asia/Riyadh")
    private val ar: Locale = Locale.forLanguageTag("ar")

    private val timeFmt: DateTimeFormatter =
        DateTimeFormatter.ofPattern("h:mm a", ar).withDecimalStyle(DecimalStyle.STANDARD).withZone(riyadh)
    private val dayFmt: DateTimeFormatter =
        DateTimeFormatter.ofPattern("EEEE، d MMMM", ar).withDecimalStyle(DecimalStyle.STANDARD).withZone(riyadh)

    private fun instant(iso: String) = runCatching { OffsetDateTime.parse(iso).toInstant() }.getOrNull()

    fun time(f: RsFixture): String = instant(f.date)?.let { timeFmt.format(it) } ?: ""
    fun day(f: RsFixture): String = instant(f.date)?.let { dayFmt.format(it) } ?: ""
    fun day(iso: String): String = instant(iso)?.let { dayFmt.format(it) } ?: ""

    /** «2026-27» — الدوري يُوسم بموسم مزدوج. يُعرض داخل عزل LTR. */
    fun seasonLabel(season: Int): String = "$season-${(season + 1).toString().takeLast(2)}"

    /** صياغة عربية سليمة، أو HH:MM:SS في آخر يوم — نفس عقد iOS WCFormat.countdown. */
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
}

/** نبضة ثانية للعدّادات — نفس idiom كأس العالم لكن محليًا للقسم. */
@Composable
fun rememberRsSecondTicker(): Long {
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(1000)
            now = System.currentTimeMillis()
        }
    }
    return now
}
