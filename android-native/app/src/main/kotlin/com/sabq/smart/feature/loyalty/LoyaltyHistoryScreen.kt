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
import androidx.compose.foundation.lazy.LazyColumn
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.sabq.smart.data.LoyaltyHistoryEvent
import com.sabq.smart.ui.theme.SabqTheme
import java.time.Instant
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import androidx.compose.foundation.lazy.rememberLazyListState

/**
 * "سجل نقاطي" — paginated activity feed. Ports iOS
 * `Screens/LoyaltyHistoryView.swift` 1:1. Each row: 38 dp tinted
 * circle with action emoji + Arabic action label + relative time +
 * "+points" with sparkles. Infinite scroll near tail, empty / error
 * states match iOS copy.
 */
@Composable
fun LoyaltyHistoryScreen(
    onBack: () -> Unit,
    viewModel: LoyaltyHistoryViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val listState = rememberLazyListState()

    // Auto-load next page when within 3 items of the end. Matches the
    // iOS `task { await loadMore() }` ProgressView trigger.
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
            state.isRefreshing && state.items.isEmpty() ->
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = SabqTheme.colors.primaryEnd)
                }
            state.items.isEmpty() && state.loadError != null ->
                ErrorState(message = state.loadError!!, onRetry = viewModel::reload)
            state.items.isEmpty() ->
                EmptyState()
            else -> LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(
                    horizontal = SabqTheme.dimens.screenPaddingH,
                    vertical = 16.dp,
                ),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(state.items)
                if (state.hasMore) {
                    item {
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
                item { Spacer(modifier = Modifier.height(28.dp)) }
            }
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.items(items: List<LoyaltyHistoryEvent>) {
    items.forEach { item ->
        item(key = item.id) { EventRow(event = item) }
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
            text = "سجل نقاطي",
            fontSize = 17.sp,
            fontWeight = FontWeight.Bold,
            color = SabqTheme.colors.ink,
        )
        Spacer(modifier = Modifier.weight(1f))
        Spacer(modifier = Modifier.size(40.dp))
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
            .border(width = 0.5.dp, color = SabqTheme.colors.outline.copy(alpha = 0.35f), shape = shape)
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            modifier = Modifier
                .size(38.dp)
                .clip(CircleShape)
                .background(tint.copy(alpha = 0.12f)),
            contentAlignment = Alignment.Center,
        ) {
            Text(text = actionEmoji(event.action), fontSize = 18.sp)
        }
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(
                text = actionLabel(event.action),
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                color = SabqTheme.colors.ink,
            )
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
    "DAILY_LOGIN" -> Color(0xFFFF8C00)
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
