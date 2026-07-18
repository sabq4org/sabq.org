package com.sabq.smart.feature.settings

/**
 * موعد النشر الأسبوعي لكاتب الرأي — القطع المشتركة بين لوحة الأداء
 * وشاشة إرسال المقال (مطابقة لتجربة iOS نفسها):
 * - [WriterScheduleBannerCard]: بانر بثلاث حالات (عادي / تذكير / متأخر)
 * - [WriterDayPickerCard]: اختيار اليوم مرة واحدة مع ازدحام كل يوم
 * - [WriterScheduleViewModel]: حالة الموعد لبوابة الإرسال
 */

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.EventAvailable
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.ReportProblem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.api.ApiWriterScheduleBanner
import com.sabq.smart.data.api.ApiWriterScheduleResponse
import com.sabq.smart.data.api.SabqApi
import com.sabq.smart.data.api.WriterSchedulePickRequest
import com.sabq.smart.ui.theme.SabqTheme
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import javax.inject.Inject

internal val writerWeekdaysAr = listOf("الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت")

private val ScheduleBlue = Color(0xFF4090F8)
private val ScheduleAmber = Color(0xFFF59E0B)
private val ScheduleRed = Color(0xFFEF4444)

/** تنسيق تاريخ ISO بتوقيت الرياض وبالعربية — "الثلاثاء 21 يوليو – 6:00 ص" */
internal fun formatRiyadhDate(iso: String?, withTime: Boolean = true): String {
    if (iso.isNullOrBlank()) return ""
    return try {
        val instant = Instant.parse(iso)
        val pattern = if (withTime) "EEEE d MMMM – h:mm a" else "EEEE d MMMM"
        DateTimeFormatter.ofPattern(pattern, Locale("ar"))
            .withZone(ZoneId.of("Asia/Riyadh"))
            .format(instant)
    } catch (_: Exception) {
        ""
    }
}

// -- بانر الموعد ---------------------------------------------------

@Composable
internal fun WriterScheduleBannerCard(banner: ApiWriterScheduleBanner) {
    val tint = when (banner.state) {
        "late" -> ScheduleRed
        "reminder" -> ScheduleAmber
        else -> ScheduleBlue
    }
    val icon = when (banner.state) {
        "late" -> Icons.Filled.ReportProblem
        "reminder" -> Icons.Filled.NotificationsActive
        else -> Icons.Filled.EventAvailable
    }
    val title = when (banner.state) {
        "late" -> "فات موعد النشر لهذا الأسبوع"
        "reminder" -> "تذكير: اقترب موعد مقالتك"
        else -> "يومك المخصص للنشر: ${writerWeekdaysAr.getOrElse(banner.weekday) { "" }}"
    }
    val subtitle = when {
        banner.state == "late" ->
            "عند إرسال مقالتك الآن ستُجدول ليوم ${formatRiyadhDate(banner.nextPublishAt)}"
        banner.state == "reminder" ->
            "أرسلها قبل ${formatRiyadhDate(banner.submitDeadline, withTime = false)} — تُنشر ${formatRiyadhDate(banner.nextPublishAt)}"
        banner.hasUpcoming ->
            "مقالتك القادمة في مسار النشر — موعدها ${formatRiyadhDate(banner.nextPublishAt)}"
        else ->
            "مقالتك القادمة تُنشر ${formatRiyadhDate(banner.nextPublishAt)} — آخر موعد للإرسال ${formatRiyadhDate(banner.submitDeadline, withTime = false)}"
    }

    val shape = RoundedCornerShape(SabqTheme.dimens.cardRadius)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(SabqTheme.colors.surface, shape)
            .border(1.dp, tint.copy(alpha = 0.35f), shape)
            .padding(14.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(tint.copy(alpha = 0.12f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(20.dp))
        }
        Column(verticalArrangement = Arrangement.spacedBy(3.dp), modifier = Modifier.weight(1f)) {
            Text(title, fontSize = 14.sp, fontWeight = FontWeight.Black, color = SabqTheme.colors.ink)
            Text(subtitle, fontSize = 12.sp, fontWeight = FontWeight.Medium, color = SabqTheme.colors.secondaryInk, lineHeight = 18.sp)
        }
    }
}

// -- بطاقة اختيار اليوم ---------------------------------------------

@Composable
internal fun WriterDayPickerCard(
    dayLoads: List<Int>,
    saving: Boolean,
    errorText: String?,
    onPick: (Int) -> Unit,
) {
    var picked by remember { mutableStateOf<Int?>(null) }
    val shape = RoundedCornerShape(SabqTheme.dimens.cardRadius)

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(SabqTheme.colors.surface, shape)
            .border(1.dp, ScheduleBlue.copy(alpha = 0.35f), shape)
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(ScheduleBlue.copy(alpha = 0.12f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.CalendarMonth, contentDescription = null, tint = ScheduleBlue, modifier = Modifier.size(20.dp))
            }
            Column(verticalArrangement = Arrangement.spacedBy(3.dp), modifier = Modifier.weight(1f)) {
                Text("اختر يومك الأسبوعي للنشر", fontSize = 14.sp, fontWeight = FontWeight.Black, color = SabqTheme.colors.ink)
                Text(
                    "مقالتك ستُنشر في هذا اليوم من كل أسبوع. يُحدد مرة واحدة، وتغييره لاحقاً عبر إدارة التحرير.",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                    color = SabqTheme.colors.secondaryInk,
                    lineHeight = 18.sp,
                )
            }
        }

        // الأيام السبعة: صف 4 + صف 3 — خلايا لمس مريحة بعدّاد الكتّاب
        writerWeekdaysAr.indices.chunked(4).forEach { rowDays ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                rowDays.forEach { day ->
                    val selected = picked == day
                    val cellShape = RoundedCornerShape(10.dp)
                    Column(
                        modifier = Modifier
                            .weight(1f)
                            .clip(cellShape)
                            .background(
                                if (selected) ScheduleBlue.copy(alpha = 0.12f) else SabqTheme.colors.outline.copy(alpha = 0.06f),
                                cellShape,
                            )
                            .border(
                                1.dp,
                                if (selected) ScheduleBlue.copy(alpha = 0.6f) else SabqTheme.colors.outline.copy(alpha = 0.2f),
                                cellShape,
                            )
                            .clickable(enabled = !saving) { picked = day }
                            .padding(vertical = 8.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
                        Text(
                            writerWeekdaysAr[day],
                            fontSize = 12.sp,
                            fontWeight = if (selected) FontWeight.Black else FontWeight.SemiBold,
                            color = if (selected) ScheduleBlue else SabqTheme.colors.ink,
                        )
                        val load = dayLoads.getOrElse(day) { 0 }
                        Text(
                            if (load > 0) "$load كاتب" else "شاغر",
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Medium,
                            color = SabqTheme.colors.secondaryInk,
                        )
                    }
                }
                // موازنة الصف الثاني (3 أيام) ليبقى عرض الخلايا متسقاً
                repeat(4 - rowDays.size) { Spacer(Modifier.weight(1f)) }
            }
        }

        errorText?.let { ErrorBanner(message = it) }

        PrimaryGradientButton(
            title = picked?.let { "تثبيت يوم ${writerWeekdaysAr[it]}" } ?: "اختر يوماً أولاً",
            isLoading = saving,
            enabled = picked != null && !saving,
            onClick = { picked?.let(onPick) },
        )
    }
}

// -- حالة الموعد لبوابة الإرسال --------------------------------------

data class WriterScheduleState(
    val schedule: ApiWriterScheduleResponse? = null,
    val saving: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class WriterScheduleViewModel @Inject constructor(
    private val api: SabqApi,
) : ViewModel() {
    private val _state = MutableStateFlow(WriterScheduleState())
    val state = _state.asStateFlow()

    fun load() {
        viewModelScope.launch {
            val schedule = runCatching { api.getContributorSchedule() }.getOrNull()
            _state.update { it.copy(schedule = schedule) }
        }
    }

    /** تثبيت اليوم — عند النجاح يُستدعى onDone (لاستكمال الإرسال مثلاً) */
    fun pickDay(weekday: Int, onDone: () -> Unit = {}) {
        viewModelScope.launch {
            _state.update { it.copy(saving = true, error = null) }
            try {
                api.setContributorSchedule(WriterSchedulePickRequest(weekday))
                val schedule = runCatching { api.getContributorSchedule() }.getOrNull()
                _state.update { it.copy(saving = false, schedule = schedule) }
                onDone()
            } catch (_: Exception) {
                _state.update { it.copy(saving = false, error = "تعذر حفظ اليوم — حاول مرة أخرى") }
            }
        }
    }
}
