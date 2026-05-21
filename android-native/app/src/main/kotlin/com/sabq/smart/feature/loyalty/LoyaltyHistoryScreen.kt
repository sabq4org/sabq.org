package com.sabq.smart.feature.loyalty

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
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.History
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.sabq.smart.data.LoyaltyHistoryEvent
import com.sabq.smart.ui.theme.SabqTheme
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.time.temporal.WeekFields
import java.util.Locale

/**
 * "سجل نقاطي" — 1:1 with iOS LoyaltyHistoryView.swift (today's
 * rewrite). Layout when loaded:
 *
 *   1) Totals strip — three pills at the top: إجمالي السجل / اليوم /
 *      هذا الأسبوع, summing visible events.
 *   2) Grouped buckets — اليوم / أمس / هذا الأسبوع / هذا الشهر / أقدم,
 *      each with a section header showing the bucket subtotal as a
 *      leaf-tinted pill, then the event rows.
 *   3) Each row shows the action icon + Arabic label + article title
 *      (when the event was earned for an article) + relative time +
 *      "+points ✨". Article title comes from the backend's hydration
 *      added 2026-05-21.
 *
 *   When the list is empty it shows EmptyStateView, on transient
 *   errors ErrorState, and at the tail a spinner triggers loadMore().
 */
@Composable
fun LoyaltyHistoryScreen(
    onBack: () -> Unit,
    viewModel: LoyaltyHistoryViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val listState = rememberLazyListState()

    val nearEnd by remember {
        derivedStateOf {
            val info = listState.layoutInfo
            val total = info.totalItemsCount
            val last = info.visibleItemsInfo.lastOrNull()?.index ?: return@derivedStateOf false
            total > 0 && last >= total - 3
        }
    }
    LaunchedEffect(nearEnd, state.hasMore, state.isLoading) {
        if (nearEnd && state.hasMore && !state.isLoading) viewModel.loadMore()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(SabqTheme.colors.background),
    ) {
        TopBar(onBack = onBack)

        when {
            state.isRefreshing && state.items.isEmpty() -> {
                // Skeleton: totals strip + 6 history rows.
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        repeat(3) {
                            Box(modifier = Modifier.weight(1f)) {
                                com.sabq.smart.ui.components.SkeletonBox(
                                    height = 76.dp,
                                    radius = 14.dp,
                                )
                            }
                        }
                    }
                    repeat(6) {
                        com.sabq.smart.ui.components.SkeletonBox(
                            height = 60.dp,
                            radius = SabqTheme.dimens.tileRadius,
                        )
                    }
                }
            }
            state.items.isEmpty() && state.loadError != null ->
                ErrorState(message = state.loadError!!, onRetry = viewModel::reload)
            state.items.isEmpty() ->
                EmptyState()
            else -> LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                item("totals") { TotalsStrip(items = state.items) }

                buckets(events = state.items)

                if (state.hasMore) {
                    item("more") {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 18.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            CircularProgressIndicator(
                                color = SabqTheme.colors.primaryEnd,
                                strokeWidth = 2.dp,
                                modifier = Modifier.size(24.dp),
                            )
                        }
                    }
                }
                item("tail-spacer") { Spacer(modifier = Modifier.height(28.dp)) }
            }
        }
    }
}

// ============================================================
// Totals strip — three pills summing visible events
// ============================================================

@Composable
private fun TotalsStrip(items: List<LoyaltyHistoryEvent>) {
    val total = remember(items) { items.sumOf { it.points } }
    val today = remember(items) {
        items.filter { isToday(it.createdAt) }.sumOf { it.points }
    }
    val week = remember(items) {
        items.filter { isInThisWeek(it.createdAt) }.sumOf { it.points }
    }
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        TotalsCell(value = total, label = "إجمالي السجل", tint = SabqTheme.colors.primaryEnd, modifier = Modifier.weight(1f))
        TotalsCell(value = today, label = "اليوم", tint = SabqTheme.colors.leaf, modifier = Modifier.weight(1f))
        // SwiftUI .orange — iOS LoyaltyHistoryView.swift:60 uses Color.orange (#FF9500).
        TotalsCell(value = week, label = "هذا الأسبوع", tint = Color(0xFFFF9500), modifier = Modifier.weight(1f))
    }
}

@Composable
private fun TotalsCell(value: Int, label: String, tint: Color, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(14.dp)
    Column(
        modifier = modifier
            .clip(shape)
            .background(SabqTheme.colors.surface, shape)
            .border(0.5.dp, tint.copy(alpha = 0.18f), shape)
            .padding(vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                text = "+$value",
                fontSize = 19.sp,
                fontWeight = FontWeight.Black,
                color = tint,
            )
            Icon(
                imageVector = Icons.Filled.AutoAwesome,
                contentDescription = null,
                tint = tint.copy(alpha = 0.75f),
                modifier = Modifier.size(10.dp),
            )
        }
        Text(
            text = label,
            fontSize = 11.sp,
            fontWeight = FontWeight.SemiBold,
            color = SabqTheme.colors.secondaryInk,
        )
    }
}

// ============================================================
// Day-grouped buckets
// ============================================================

private data class Bucket(
    val label: String,
    val events: List<LoyaltyHistoryEvent>,
) {
    val subtotal: Int get() = events.sumOf { it.points }
}

private fun groupBuckets(events: List<LoyaltyHistoryEvent>): List<Bucket> {
    val today = mutableListOf<LoyaltyHistoryEvent>()
    val yesterday = mutableListOf<LoyaltyHistoryEvent>()
    val thisWeek = mutableListOf<LoyaltyHistoryEvent>()
    val thisMonth = mutableListOf<LoyaltyHistoryEvent>()
    val older = mutableListOf<LoyaltyHistoryEvent>()

    val now = LocalDate.now()
    val todayDate = now
    val yesterdayDate = now.minusDays(1)
    val weekFields = WeekFields.of(Locale.getDefault())
    val nowWeek = now.get(weekFields.weekOfWeekBasedYear())
    val nowWeekYear = now.get(weekFields.weekBasedYear())

    for (event in events) {
        val date = event.localDate()
        if (date == null) { older.add(event); continue }
        when {
            date == todayDate -> today.add(event)
            date == yesterdayDate -> yesterday.add(event)
            date.year == now.year && date.monthValue == now.monthValue
                && date.get(weekFields.weekOfWeekBasedYear()) == nowWeek
                && date.get(weekFields.weekBasedYear()) == nowWeekYear -> thisWeek.add(event)
            date.year == now.year && date.monthValue == now.monthValue -> thisMonth.add(event)
            else -> older.add(event)
        }
    }

    val out = mutableListOf<Bucket>()
    if (today.isNotEmpty()) out += Bucket("اليوم", today)
    if (yesterday.isNotEmpty()) out += Bucket("أمس", yesterday)
    if (thisWeek.isNotEmpty()) out += Bucket("هذا الأسبوع", thisWeek)
    if (thisMonth.isNotEmpty()) out += Bucket("هذا الشهر", thisMonth)
    if (older.isNotEmpty()) out += Bucket("أقدم", older)
    return out
}

private fun LoyaltyHistoryEvent.localDate(): LocalDate? {
    val iso = createdAt?.takeIf { it.isNotBlank() } ?: return null
    return runCatching {
        OffsetDateTime.parse(iso, DateTimeFormatter.ISO_OFFSET_DATE_TIME)
            .toInstant().atZone(ZoneId.systemDefault()).toLocalDate()
    }.getOrElse {
        runCatching { Instant.parse(iso).atZone(ZoneId.systemDefault()).toLocalDate() }.getOrNull()
    }
}

private fun LazyListScope.buckets(events: List<LoyaltyHistoryEvent>) {
    val buckets = groupBuckets(events)
    for (bucket in buckets) {
        item("section-${bucket.label}") {
            SectionHeader(label = bucket.label, subtotal = bucket.subtotal)
        }
        for (event in bucket.events) {
            item(event.id) { EventRow(event = event) }
        }
    }
}

@Composable
private fun SectionHeader(label: String, subtotal: Int) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            fontSize = 13.sp,
            fontWeight = FontWeight.Black,
            color = SabqTheme.colors.ink,
        )
        Spacer(modifier = Modifier.weight(1f))
        Row(
            modifier = Modifier
                .clip(CircleShape)
                .background(SabqTheme.colors.leaf.copy(alpha = 0.10f))
                .padding(horizontal = 8.dp, vertical = 3.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(3.dp),
        ) {
            Text(
                text = "+$subtotal",
                fontSize = 12.sp,
                fontWeight = FontWeight.Black,
                color = SabqTheme.colors.leaf,
            )
            Icon(
                imageVector = Icons.Filled.AutoAwesome,
                contentDescription = null,
                tint = SabqTheme.colors.leaf,
                modifier = Modifier.size(9.dp),
            )
        }
    }
}

// ============================================================
// Top bar + Event row
// ============================================================

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
            text = "سجل نقاطي",
            fontSize = 17.sp,
            fontWeight = FontWeight.Bold,
            color = SabqTheme.colors.ink,
        )
        Spacer(modifier = Modifier.weight(1f))
        Spacer(modifier = Modifier.width(40.dp))
    }
}

@Composable
private fun EventRow(event: LoyaltyHistoryEvent) {
    val tint = actionColor(event.action)
    val shape = RoundedCornerShape(14.dp)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(SabqTheme.colors.surface, shape)
            .border(0.5.dp, SabqTheme.colors.outline.copy(alpha = 0.35f), shape)
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(tint.copy(alpha = 0.12f)),
            contentAlignment = Alignment.Center,
        ) {
            Text(text = actionEmoji(event.action), fontSize = 19.sp)
        }
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(3.dp),
        ) {
            Text(
                text = actionLabel(event.action),
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                color = SabqTheme.colors.ink,
            )
            event.articleTitle?.takeIf { it.isNotBlank() }?.let { title ->
                Text(
                    text = title,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                    color = SabqTheme.colors.secondaryInk,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            event.createdAt?.let { iso ->
                Text(
                    text = relativeTime(iso),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Medium,
                    color = SabqTheme.colors.tertiaryInk,
                )
            }
        }
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(
                text = "+${event.points}",
                fontSize = 15.sp,
                fontWeight = FontWeight.Black,
                color = SabqTheme.colors.leaf,
            )
            Icon(
                imageVector = Icons.Filled.AutoAwesome,
                contentDescription = null,
                tint = SabqTheme.colors.leaf.copy(alpha = 0.7f),
                modifier = Modifier.size(11.dp),
            )
        }
    }
}

@Composable
private fun EmptyState() {
    com.sabq.smart.ui.components.EmptyStateView(
        icon = Icons.Filled.History,
        tint = SabqTheme.colors.primaryEnd,
        title = "لا يوجد نشاط بعد",
        subtitle = "ابدأ بالقراءة والتفاعل لكسب نقاطك الأولى ⭐",
    )
}

@Composable
private fun ErrorState(message: String, onRetry: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(top = 60.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            text = message,
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
            color = SabqTheme.colors.coral,
        )
        Text(
            text = "إعادة المحاولة",
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            color = SabqTheme.colors.primaryEnd,
            modifier = Modifier
                .clickable { onRetry() }
                .padding(horizontal = 14.dp, vertical = 8.dp),
        )
    }
}

// ─────────────────── Helpers (1:1 with iOS) ───────────────────

private fun actionLabel(action: String): String = when (action) {
    "READ" -> "قراءة مقال"
    "READ_DEEP" -> "قراءة عميقة"
    "LIKE" -> "إعجاب بمقال"
    "SHARE" -> "مشاركة مقال"
    "COMMENT" -> "تعليق"
    "NOTIFICATION_OPEN" -> "فتح إشعار"
    "DAILY_LOGIN" -> "دخول يومي"
    "PROFILE_COMPLETE" -> "إكمال الملف الشخصي 🎉"
    "EMAIL_VERIFIED" -> "تأكيد البريد الإلكتروني"
    else -> action
}

private fun actionEmoji(action: String): String = when (action) {
    "READ" -> "📖"
    "READ_DEEP" -> "📕"
    "LIKE" -> "❤️"
    "SHARE" -> "🔄"
    "COMMENT" -> "💬"
    "NOTIFICATION_OPEN" -> "🔔"
    "DAILY_LOGIN" -> "🚪"
    "PROFILE_COMPLETE" -> "🎉"
    "EMAIL_VERIFIED" -> "✉️"
    else -> "✨"
}

@Composable
private fun actionColor(action: String): Color = when (action) {
    // SwiftUI .orange — iOS LoyaltyHistoryView.swift:297.
    "DAILY_LOGIN" -> Color(0xFFFF9500)
    "READ", "READ_DEEP" -> SabqTheme.colors.primaryEnd
    "LIKE" -> SabqTheme.colors.coral
    "COMMENT" -> Color(red = 0.40f, green = 0.73f, blue = 0.22f)
    "SHARE" -> Color(red = 0.40f, green = 0.50f, blue = 0.95f)
    "PROFILE_COMPLETE", "EMAIL_VERIFIED" -> SabqTheme.colors.leaf
    else -> SabqTheme.colors.secondaryInk
}

private fun relativeTime(iso: String): String {
    if (iso.isBlank()) return ""
    val parsed = runCatching {
        OffsetDateTime.parse(iso, DateTimeFormatter.ISO_OFFSET_DATE_TIME).toInstant()
    }.getOrElse {
        runCatching { Instant.parse(iso) }.getOrNull() ?: return ""
    }
    val seconds = ChronoUnit.SECONDS.between(parsed, Instant.now())
    return when {
        seconds < 60 -> "الآن"
        seconds < 3600 -> "قبل ${seconds / 60} د"
        seconds < 86400 -> "قبل ${seconds / 3600} س"
        seconds < 604800 -> "قبل ${seconds / 86400} يوم"
        else -> "قبل ${seconds / 604800} أسبوع"
    }
}

private fun isToday(iso: String?): Boolean {
    val date = isoToLocalDate(iso) ?: return false
    return date == LocalDate.now()
}

private fun isInThisWeek(iso: String?): Boolean {
    val date = isoToLocalDate(iso) ?: return false
    val now = LocalDate.now()
    val fields = WeekFields.of(Locale.getDefault())
    return date.get(fields.weekOfWeekBasedYear()) == now.get(fields.weekOfWeekBasedYear())
        && date.get(fields.weekBasedYear()) == now.get(fields.weekBasedYear())
}

private fun isoToLocalDate(iso: String?): LocalDate? {
    val src = iso?.takeIf { it.isNotBlank() } ?: return null
    return runCatching {
        OffsetDateTime.parse(src, DateTimeFormatter.ISO_OFFSET_DATE_TIME)
            .toInstant().atZone(ZoneId.systemDefault()).toLocalDate()
    }.getOrElse {
        runCatching { Instant.parse(src).atZone(ZoneId.systemDefault()).toLocalDate() }.getOrNull()
    }
}
