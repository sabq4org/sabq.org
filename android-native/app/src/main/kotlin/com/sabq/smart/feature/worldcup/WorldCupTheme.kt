package com.sabq.smart.feature.worldcup

import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import com.sabq.smart.ui.theme.SabqTheme
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.DecimalStyle
import java.util.Locale

/**
 * يفرض الوضع الداكن على شجرة فرعية بصرف النظر عن نمط التطبيق — تستخدمه
 * الأسطح الداكنة الثابتة (مركز المباراة، بطاقة اللاعب، شريط الهوم،
 * بطاقات الملعب) لتبقى بيضاء النص مهما كان الوضع. عند `null` تتبع
 * الألوان التكيّفية نمط التطبيق (فاتح/داكن) — مطابقة لـiOS WCTheme.
 */
val LocalWcForceDark = staticCompositionLocalOf<Boolean?> { null }

/**
 * لوحة ألوان قسم المونديال. الرموز المُعلَّمة (royal/azure/gold/...)
 * ثابتة عبر الوضعين كهوية بصرية، بينما الأسطح والنصوص تكيّفية
 * (`@Composable get()`) تتبع `LocalWcForceDark` ثم نمط التطبيق —
 * 1:1 مع iOS `WCTheme` (هيرو فاتح في الوضع الفاتح).
 */
object WcColors {
    // ── رموز ثابتة (هوية الملعب) ──
    val stadiumTop = Color(0.03f, 0.18f, 0.12f)
    val stadiumMid = Color(0.03f, 0.18f, 0.13f)
    val stadiumBottom = Color(0.05f, 0.28f, 0.18f)
    val heroTop = Color(0.03f, 0.34f, 0.22f)
    val heroBottom = Color(0.08f, 0.56f, 0.36f)
    val royal = Color(0.06f, 0.50f, 0.33f)
    val emerald = Color(0.16f, 0.74f, 0.48f) // azure — إبراز ساطع
    val pitchTop = Color(0.06f, 0.34f, 0.20f)
    val pitchBottom = Color(0.04f, 0.22f, 0.13f)
    val liveRed = Color(0.93f, 0.26f, 0.30f)
    val sky = Color(0.18f, 0.70f, 0.60f)
    val gold = Color(0.96f, 0.72f, 0.20f)
    val leaf = Color(0.45f, 0.78f, 0.30f)

    private val darkMode: Boolean
        @Composable @ReadOnlyComposable
        get() = LocalWcForceDark.current ?: SabqTheme.colors.isDark

    // ── أسطح/نصوص تكيّفية ──
    /** نص/أيقونة العلامة: أخضر غامق على الفاتح، أخضر فاتح على الداكن. */
    val emeraldDeep: Color
        @Composable @ReadOnlyComposable
        get() = if (darkMode) Color(0.22f, 0.80f, 0.52f) else Color(0.04f, 0.42f, 0.28f)

    /** نص أساسي. */
    val onDark: Color
        @Composable @ReadOnlyComposable
        get() = if (darkMode) Color.White else Color(0.06f, 0.13f, 0.10f)

    /** نص ثانوي. */
    val onDarkDim: Color
        @Composable @ReadOnlyComposable
        get() = if (darkMode) Color.White.copy(alpha = 0.62f) else Color(0.36f, 0.46f, 0.42f)

    /** سطح بطاقة مرتفع. */
    val card: Color
        @Composable @ReadOnlyComposable
        get() = if (darkMode) Color.White.copy(alpha = 0.06f) else Color.White

    /** حدّ البطاقة. */
    val cardStroke: Color
        @Composable @ReadOnlyComposable
        get() = if (darkMode) Color.White.copy(alpha = 0.10f) else Color(0.04f, 0.42f, 0.28f, 0.12f)

    /** ظلّ البطاقة — خفيف في الفاتح ليرفعها عن الخلفية الخضراء. */
    val cardShadow: Color
        @Composable @ReadOnlyComposable
        get() = if (darkMode) Color.Transparent else Color(0.04f, 0.20f, 0.13f, 0.10f)

    /** تعبئة شارة/شريحة خفيفة. */
    val chipFill: Color
        @Composable @ReadOnlyComposable
        get() = if (darkMode) Color.White.copy(alpha = 0.10f) else Color(0.10f, 0.55f, 0.35f, 0.08f)

    /** خلفية صلبة لورقة سفلية (ModalBottomSheet) — تتبع لون القسم
     *  التكيّفي بدل الأخضر الداكن الثابت، مطابقة iOS WCPlayerSheet/SquadSheet. */
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

    /** يوم انطلاق المباراة من سلسلة ISO (kickoffAt) — لسجلّ التوقّعات. */
    fun dayFromIso(iso: String?): String =
        iso?.let { instant(it)?.let { i -> dayFmt.format(i) } } ?: "كأس العالم 2026"

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
