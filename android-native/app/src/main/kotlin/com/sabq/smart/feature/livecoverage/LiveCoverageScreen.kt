package com.sabq.smart.feature.livecoverage

import android.content.Intent
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material.icons.outlined.FormatQuote
import androidx.compose.material.icons.outlined.Podcasts
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.sabq.smart.data.LiveCountry
import com.sabq.smart.data.LiveEvent
import com.sabq.smart.data.countryFlag
import com.sabq.smart.ui.theme.SabqTheme
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * "لحظة بلحظة" — multi-country live coverage screen. Ports iOS
 * `Screens/LiveCoverageView.swift` 1:1. Distinct from the
 * MomentByMoment feed: this is curated topical coverage (Gulf attacks
 * etc.) with timeline grouped by date, per-country filter pills, and
 * severity-coloured event cards.
 *
 * iOS doesn't currently wire an entry point to this destination either
 * — the screen exists as a ready-but-orphan route. Android mirrors that:
 * the composable is registered under [SabqRoutes.LiveCoverage] but no
 * tap-target pushes it yet. Add an Explore entry when iOS does.
 */
@Composable
fun LiveCoverageScreen(
    onBack: () -> Unit,
    viewModel: LiveCoverageViewModel = hiltViewModel(),
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
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 18.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            item { HeaderSection(title = state.data?.titleAr ?: "لحظة بلحظة", isLive = state.data?.isLive == true, lastUpdated = state.data?.stats?.lastUpdated) }

            when {
                state.isLoading && state.data == null -> item { LoadingSection() }
                state.loadError != null && state.data == null ->
                    item { ErrorState(message = state.loadError!!, onRetry = viewModel::reload) }
                state.data?.isLive != true -> item { EmptyState() }
                else -> {
                    val data = state.data!!
                    if (data.countries.isNotEmpty()) {
                        item {
                            CountryFilter(
                                countries = data.countries,
                                allCount = data.total,
                                selected = state.selectedCountry,
                                onSelect = viewModel::selectCountry,
                            )
                        }
                    }
                    timelineSection(
                        groups = state.groupedEvents,
                    )
                }
            }

            item { Spacer(modifier = Modifier.height(40.dp)) }
        }
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
            text = "لحظة بلحظة",
            fontSize = 17.sp,
            fontWeight = FontWeight.Bold,
            color = SabqTheme.colors.ink,
        )
        Spacer(modifier = Modifier.weight(1f))
        Spacer(modifier = Modifier.size(40.dp))
    }
}

@Composable
private fun HeaderSection(title: String, isLive: Boolean, lastUpdated: String?) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            PulsingAntenna()
            Text(
                text = title,
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
                color = SabqTheme.colors.ink,
                lineHeight = 26.sp,
                modifier = Modifier.weight(1f),
            )
        }
        if (isLive) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .clip(CircleShape)
                        .background(SabqTheme.colors.coral),
                )
                Text(
                    text = "مباشر",
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    color = SabqTheme.colors.coral,
                )
                lastUpdated?.let { iso ->
                    Text(
                        text = "·",
                        color = SabqTheme.colors.tertiaryInk,
                    )
                    Text(
                        text = "آخر تحديث: ${formatRelativeTime(iso)}",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                        color = SabqTheme.colors.tertiaryInk,
                    )
                }
            }
        }
    }
}

@Composable
private fun PulsingAntenna() {
    val transition = rememberInfiniteTransition(label = "live-coverage-pulse")
    val pulseScale by transition.animateFloat(
        initialValue = 1f,
        targetValue = 1.6f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1400, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "scale",
    )
    val pulseAlpha by transition.animateFloat(
        initialValue = 0.8f,
        targetValue = 0f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1400, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "alpha",
    )
    Box(modifier = Modifier.size(32.dp), contentAlignment = Alignment.Center) {
        Box(
            modifier = Modifier
                .size(32.dp)
                .clip(CircleShape)
                .background(SabqTheme.colors.coral.copy(alpha = 0.2f)),
        )
        Icon(
            imageVector = Icons.Outlined.Podcasts,
            contentDescription = null,
            tint = SabqTheme.colors.coral,
            modifier = Modifier.size(16.dp),
        )
        Box(
            modifier = Modifier
                .size(32.dp)
                .scale(pulseScale)
                .alpha(pulseAlpha)
                .clip(CircleShape)
                .border(BorderStroke(2.dp, SabqTheme.colors.coral.copy(alpha = 0.4f)), CircleShape),
        )
    }
}

@Composable
private fun CountryFilter(
    countries: List<LiveCountry>,
    allCount: Int,
    selected: String?,
    onSelect: (String?) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        FilterPill(
            label = "الكل",
            count = allCount,
            isSelected = selected == null,
            onClick = { onSelect(null) },
        )
        countries.forEach { country ->
            FilterPill(
                label = country.nameAr,
                count = country.count,
                isSelected = selected == country.key,
                onClick = { onSelect(country.key) },
            )
        }
    }
}

@Composable
private fun FilterPill(label: String, count: Int, isSelected: Boolean, onClick: () -> Unit) {
    val bg = if (isSelected) SabqTheme.colors.primaryEnd else SabqTheme.colors.paleFill
    val fg = if (isSelected) Color.White else SabqTheme.colors.ink
    val badgeBg = if (isSelected) Color.White.copy(alpha = 0.25f) else SabqTheme.colors.outline
    Row(
        modifier = Modifier
            .clip(CircleShape)
            .background(bg)
            .clickable { onClick() }
            .padding(horizontal = 14.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(
            text = label,
            fontSize = 13.sp,
            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
            color = fg,
        )
        Box(
            modifier = Modifier
                .clip(CircleShape)
                .background(badgeBg)
                .padding(horizontal = 6.dp, vertical = 2.dp),
        ) {
            Text(
                text = "$count",
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                color = fg,
            )
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.timelineSection(
    groups: List<LiveCoverageViewModel.DateGroup>,
) {
    groups.forEach { group ->
        item(key = "header-${group.date}") { DateHeader(date = group.date) }
        group.events.forEach { event ->
            item(key = event.id) { EventCard(event = event) }
        }
    }
}

@Composable
private fun DateHeader(date: String) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.padding(vertical = 12.dp),
    ) {
        Box(
            modifier = Modifier
                .weight(1f)
                .height(0.5.dp)
                .background(SabqTheme.colors.outline),
        )
        Text(
            text = formatDateHeader(date),
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold,
            color = SabqTheme.colors.tertiaryInk,
        )
        Box(
            modifier = Modifier
                .weight(1f)
                .height(0.5.dp)
                .background(SabqTheme.colors.outline),
        )
    }
}

@Composable
private fun EventCard(event: LiveEvent) {
    val context = LocalContext.current
    val severityTint = severityColor(event.severity)
    val isUrgent = event.priority == "urgent"
    val dotColor = if (isUrgent) SabqTheme.colors.coral else severityTint
    val cardShape = RoundedCornerShape(14.dp)
    val cardBg = if (isUrgent) SabqTheme.colors.coral.copy(alpha = 0.04f) else SabqTheme.colors.paleFill
    val cardBorder = if (isUrgent) SabqTheme.colors.coral.copy(alpha = 0.2f) else Color.Transparent

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.Top,
    ) {
        // Timeline rail: dot + line
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Box(
                modifier = Modifier
                    .size(12.dp)
                    .clip(CircleShape)
                    .background(dotColor),
                contentAlignment = Alignment.Center,
            ) {
                if (isUrgent) {
                    Icon(
                        imageVector = Icons.Filled.Bolt,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(6.dp),
                    )
                }
            }
            Box(
                modifier = Modifier
                    .width(1.5.dp)
                    .heightIn(min = 40.dp)
                    .background(SabqTheme.colors.outline),
            )
        }
        // Content
        Column(
            modifier = Modifier
                .weight(1f)
                .clip(cardShape)
                .background(cardBg, cardShape)
                .border(width = 1.dp, color = cardBorder, shape = cardShape)
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    text = formatEventTime(event.publishedAt),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace,
                    color = SabqTheme.colors.tertiaryInk,
                )
                if (isUrgent) {
                    SmallChip(label = "عاجل", bg = SabqTheme.colors.coral, fg = Color.White)
                }
                SmallChip(
                    label = event.eventTypeLabelAr,
                    bg = severityTint.copy(alpha = 0.12f),
                    fg = severityTint,
                )
                if (event.isUpdate) {
                    SmallChip(
                        label = "تحديث",
                        bg = SabqTheme.colors.primaryEnd.copy(alpha = 0.10f),
                        fg = SabqTheme.colors.primaryEnd,
                    )
                }
            }
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text(
                    text = countryFlag(event.country),
                    fontSize = 14.sp,
                )
                Text(
                    text = event.countryNameAr,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = SabqTheme.colors.secondaryInk,
                )
            }
            Text(
                text = event.content,
                fontSize = 15.sp,
                fontWeight = FontWeight.Normal,
                color = SabqTheme.colors.ink,
                lineHeight = 22.sp,
            )
            event.sourceName?.let { source ->
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Icon(
                        imageVector = Icons.Outlined.FormatQuote,
                        contentDescription = null,
                        tint = SabqTheme.colors.tertiaryInk,
                        modifier = Modifier.size(11.dp),
                    )
                    Text(
                        text = source,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Medium,
                        color = SabqTheme.colors.tertiaryInk,
                    )
                }
            }
            if (event.isPinned) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Icon(
                        imageVector = Icons.Filled.PushPin,
                        contentDescription = null,
                        tint = SabqTheme.colors.primaryEnd,
                        modifier = Modifier.size(11.dp),
                    )
                    Text(
                        text = "مثبت",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = SabqTheme.colors.primaryEnd,
                    )
                }
            }
            Row(
                modifier = Modifier.clickable {
                    val shareText = """
                        ${countryFlag(event.country)} ${event.countryNameAr} | ${event.eventTypeLabelAr}
                        ${event.content}

                        المصدر: صحيفة سبق
                    """.trimIndent()
                    val intent = Intent(Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(Intent.EXTRA_TEXT, shareText)
                    }
                    runCatching {
                        context.startActivity(
                            Intent.createChooser(intent, "مشاركة").apply {
                                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                            },
                        )
                    }
                },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Icon(
                    imageVector = Icons.Filled.Share,
                    contentDescription = null,
                    tint = SabqTheme.colors.secondaryInk,
                    modifier = Modifier.size(13.dp),
                )
                Text(
                    text = "شارك",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                    color = SabqTheme.colors.secondaryInk,
                )
            }
        }
    }
}

@Composable
private fun SmallChip(label: String, bg: Color, fg: Color) {
    Box(
        modifier = Modifier
            .clip(CircleShape)
            .background(bg)
            .padding(horizontal = 6.dp, vertical = 2.dp),
    ) {
        Text(
            text = label,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            color = fg,
        )
    }
}

@Composable
private fun LoadingSection() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 60.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        CircularProgressIndicator(color = SabqTheme.colors.primaryEnd)
        Text(
            text = "جاري تحميل البث الحي...",
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
            color = SabqTheme.colors.secondaryInk,
        )
    }
}

@Composable
private fun EmptyState() {
    com.sabq.smart.ui.components.EmptyStateView(
        icon = Icons.Outlined.Podcasts,
        tint = SabqTheme.colors.coral,
        title = "لا يوجد بث حي حالياً",
        subtitle = "تابعنا لاحقاً للتغطيات المباشرة",
    )
}

@Composable
private fun ErrorState(message: String, onRetry: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 60.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(
            imageVector = Icons.Filled.WifiOff,
            contentDescription = null,
            tint = SabqTheme.colors.tertiaryInk,
            modifier = Modifier.size(28.dp),
        )
        Text(
            text = message,
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
            color = SabqTheme.colors.secondaryInk,
        )
        Text(
            text = "إعادة المحاولة",
            modifier = Modifier.clickable { onRetry() },
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            color = SabqTheme.colors.primaryEnd,
        )
    }
}

// ─────────────────── Severity + formatters ───────────────────

@Composable
private fun severityColor(severity: String): Color = when (severity) {
    "success" -> Color(red = 0.13f, green = 0.77f, blue = 0.37f)
    "info" -> Color(red = 0.23f, green = 0.51f, blue = 0.96f)
    "warning" -> Color(red = 0.92f, green = 0.70f, blue = 0.03f)
    "danger" -> Color(red = 0.98f, green = 0.45f, blue = 0.09f)
    "critical" -> Color(red = 0.86f, green = 0.15f, blue = 0.15f)
    else -> SabqTheme.colors.tertiaryInk
}

private val RIYADH_ZONE: ZoneId = ZoneId.of("Asia/Riyadh")
private val TIME_FORMATTER: DateTimeFormatter =
    DateTimeFormatter.ofPattern("HH:mm", Locale("ar"))
private val ARABIC_FULL_DATE: DateTimeFormatter =
    DateTimeFormatter.ofPattern("EEEE، d MMMM yyyy", Locale("ar"))

private fun parseIso(iso: String): OffsetDateTime? = runCatching {
    OffsetDateTime.parse(iso, DateTimeFormatter.ISO_OFFSET_DATE_TIME)
}.getOrElse {
    runCatching {
        OffsetDateTime.parse(iso, DateTimeFormatter.ISO_DATE_TIME)
    }.getOrNull()
}

private fun formatEventTime(iso: String): String {
    if (iso.isBlank()) return ""
    val parsed = parseIso(iso) ?: return ""
    return parsed.atZoneSameInstant(RIYADH_ZONE).format(TIME_FORMATTER)
}

private fun formatDateHeader(yyyyMmDd: String): String {
    if (yyyyMmDd.isBlank() || yyyyMmDd == "unknown") return ""
    return runCatching {
        LocalDate.parse(yyyyMmDd).format(ARABIC_FULL_DATE)
    }.getOrDefault(yyyyMmDd)
}

private fun formatRelativeTime(iso: String): String {
    if (iso.isBlank()) return ""
    val parsed = parseIso(iso) ?: return ""
    val diffSeconds = java.time.Duration.between(parsed.toInstant(), java.time.Instant.now()).seconds
    return when {
        diffSeconds < 60 -> "الآن"
        diffSeconds < 3600 -> "قبل ${diffSeconds / 60} د"
        diffSeconds < 86400 -> "قبل ${diffSeconds / 3600} س"
        else -> "قبل ${diffSeconds / 86400} ي"
    }
}
