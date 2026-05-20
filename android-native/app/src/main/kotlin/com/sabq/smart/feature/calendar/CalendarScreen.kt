package com.sabq.smart.feature.calendar

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.EventBusy
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.sabq.smart.data.CalendarEvent
import com.sabq.smart.ui.theme.SabqTheme
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * "أحداث وأيام عالمية" — public events calendar (world days, gulf /
 * national commemorations, editorial dates). Ports iOS
 * `Screens/CalendarView.swift` 1:1. Layout:
 *
 *  1. Toolbar — back chevron + "التقويم" centred.
 *  2. Header  — 56dp gold circle with calendar glyph + "أحداث وأيام
 *               عالمية" 20sp heavy + "ما يحدث في العالم خلال الأسبوع
 *               القادم" subtitle.
 *  3. Body    — events grouped by Arabic full date. Each group: faint
 *               date label + stacked event cards.
 *  4. Card    — 3dp tinted vertical bar + type chip + optional 4-5
 *               importance stars + title 14sp bold + optional 12sp
 *               description (3 lines).
 *  5. States  — 3 skeleton boxes while loading, EmptyState (calendar
 *               icon + "لا توجد أحداث" + subtitle) when empty,
 *               ErrorState (calendar-warning + retry) on failure.
 */
@Composable
fun CalendarScreen(
    onBack: () -> Unit,
    viewModel: CalendarViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(SabqTheme.colors.background),
    ) {
        TopBar(onBack = onBack)
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(horizontal = 18.dp, vertical = 18.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            item { Header() }

            when {
                state.isLoading -> item { SkeletonList() }
                state.loadError != null -> item {
                    ErrorState(
                        message = state.loadError!!,
                        onRetry = viewModel::reload,
                    )
                }
                state.events.isEmpty() -> item { EmptyState() }
                else -> {
                    state.grouped.forEach { group ->
                        item(key = "header-${group.dateKey}") {
                            DateLabel(dateKey = group.dateKey)
                        }
                        items(group.events)
                    }
                }
            }

            item { Spacer(modifier = Modifier.height(40.dp)) }
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.items(events: List<CalendarEvent>) {
    events.forEach { event ->
        item(key = event.id) { EventCard(event = event) }
    }
}

@Composable
private fun TopBar(onBack: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(SabqTheme.colors.surface.copy(alpha = 0.92f))
                .clickable { onBack() },
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                contentDescription = "رجوع",
                tint = SabqTheme.colors.ink,
                modifier = Modifier.size(18.dp),
            )
        }
        Spacer(modifier = Modifier.weight(1f))
        Text(
            text = "التقويم",
            fontSize = 17.sp,
            fontWeight = FontWeight.Bold,
            color = SabqTheme.colors.ink,
        )
        Spacer(modifier = Modifier.weight(1f))
        Spacer(modifier = Modifier.size(40.dp))
    }
}

@Composable
private fun Header() {
    Row(
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(
            modifier = Modifier
                .size(56.dp)
                .clip(CircleShape)
                .background(SabqTheme.colors.gold.copy(alpha = 0.14f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Filled.CalendarMonth,
                contentDescription = null,
                tint = SabqTheme.colors.gold,
                modifier = Modifier.size(24.dp),
            )
        }
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                text = "أحداث وأيام عالمية",
                fontSize = 20.sp,
                fontWeight = FontWeight.Black,
                color = SabqTheme.colors.ink,
            )
            Text(
                text = "ما يحدث في العالم خلال الأسبوع القادم",
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
                color = SabqTheme.colors.tertiaryInk,
            )
        }
    }
}

@Composable
private fun DateLabel(dateKey: String) {
    Text(
        text = formatDateLabel(dateKey),
        fontSize = 12.sp,
        fontWeight = FontWeight.Black,
        color = SabqTheme.colors.tertiaryInk,
        modifier = Modifier.padding(horizontal = 4.dp, vertical = 4.dp),
    )
}

@Composable
private fun EventCard(event: CalendarEvent) {
    val tint = colorForType(event.type)
    val shape = RoundedCornerShape(SabqTheme.dimens.tileRadius)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(SabqTheme.colors.surface, shape)
            .border(width = 0.5.dp, color = SabqTheme.colors.outline.copy(alpha = 0.4f), shape = shape)
            .padding(14.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Box(
            modifier = Modifier
                .width(3.dp)
                .height(48.dp)
                .clip(RoundedCornerShape(3.dp))
                .background(tint),
        )
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Box(
                    modifier = Modifier
                        .clip(CircleShape)
                        .background(tint.copy(alpha = 0.10f))
                        .padding(horizontal = 8.dp, vertical = 3.dp),
                ) {
                    Text(
                        text = labelForType(event.type),
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Black,
                        color = tint,
                    )
                }
                event.importance?.takeIf { it >= 4 }?.let { imp ->
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
                        repeat(imp.coerceAtMost(5)) {
                            Icon(
                                imageVector = Icons.Filled.Star,
                                contentDescription = null,
                                tint = SabqTheme.colors.gold,
                                modifier = Modifier.size(8.dp),
                            )
                        }
                    }
                }
            }
            Text(
                text = event.title,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                color = SabqTheme.colors.ink,
                lineHeight = 20.sp,
                maxLines = 2,
            )
            event.description?.takeIf { it.isNotBlank() }?.let { desc ->
                Text(
                    text = desc,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Normal,
                    color = SabqTheme.colors.secondaryInk,
                    lineHeight = 17.sp,
                    maxLines = 3,
                )
            }
        }
    }
}

@Composable
private fun SkeletonList() {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        repeat(3) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(80.dp)
                    .clip(RoundedCornerShape(SabqTheme.dimens.tileRadius))
                    .background(SabqTheme.colors.paleFill),
            )
        }
    }
}

@Composable
private fun EmptyState() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 40.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(
            imageVector = Icons.Filled.CalendarMonth,
            contentDescription = null,
            tint = SabqTheme.colors.tertiaryInk,
            modifier = Modifier.size(32.dp),
        )
        Text(
            text = "لا توجد أحداث",
            fontSize = 15.sp,
            fontWeight = FontWeight.SemiBold,
            color = SabqTheme.colors.ink,
        )
        Text(
            text = "لا توجد فعاليات أو أيام عالمية مسجّلة للفترة القادمة.",
            fontSize = 13.sp,
            color = SabqTheme.colors.secondaryInk,
        )
    }
}

@Composable
private fun ErrorState(message: String, onRetry: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 40.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(
            imageVector = Icons.Filled.EventBusy,
            contentDescription = null,
            tint = SabqTheme.colors.coral,
            modifier = Modifier.size(32.dp),
        )
        Text(
            text = "تعذّر تحميل التقويم",
            fontSize = 15.sp,
            fontWeight = FontWeight.SemiBold,
            color = SabqTheme.colors.ink,
        )
        Text(
            text = message,
            fontSize = 13.sp,
            color = SabqTheme.colors.secondaryInk,
        )
        Box(
            modifier = Modifier
                .clip(CircleShape)
                .background(SabqTheme.colors.primaryEnd)
                .clickable { onRetry() }
                .padding(horizontal = 18.dp, vertical = 9.dp),
        ) {
            Text(
                text = "إعادة المحاولة",
                fontSize = 13.sp,
                fontWeight = FontWeight.Black,
                color = Color.White,
            )
        }
    }
}

// ─────────────────── Helpers ───────────────────

@Composable
private fun colorForType(type: String?): Color = when (type?.uppercase()) {
    "GLOBAL" -> SabqTheme.colors.sky
    "NATIONAL" -> SabqTheme.colors.primaryEnd
    "INTERNAL" -> SabqTheme.colors.teal
    else -> SabqTheme.colors.secondaryInk
}

private fun labelForType(type: String?): String = when (type?.uppercase()) {
    "GLOBAL" -> "يوم عالمي"
    "NATIONAL" -> "يوم وطني"
    "INTERNAL" -> "حدث داخلي"
    else -> "حدث"
}

private val ARABIC_FULL_DATE = DateTimeFormatter.ofPattern("EEEE، d MMMM yyyy", Locale("ar"))

private fun formatDateLabel(yyyyMmDd: String): String {
    if (yyyyMmDd.isBlank() || yyyyMmDd == "unknown") return ""
    return runCatching {
        LocalDate.parse(yyyyMmDd).format(ARABIC_FULL_DATE)
    }.getOrDefault(yyyyMmDd)
}
