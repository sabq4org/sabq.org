package com.sabq.smart.feature.passport

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Business
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Newspaper
import androidx.compose.material.icons.filled.Photo
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material.icons.outlined.AutoStories
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.sabq.smart.data.Passport
import com.sabq.smart.data.PassportAIFootprint
import com.sabq.smart.data.PassportAIImage
import com.sabq.smart.data.PassportPeople
import com.sabq.smart.data.PassportPerson
import com.sabq.smart.data.PassportPublisher
import com.sabq.smart.data.PassportSEOEntry
import com.sabq.smart.data.PassportSource
import com.sabq.smart.data.PassportTimelineEvent
import com.sabq.smart.data.PassportTrustBadge
import com.sabq.smart.ui.components.FocalCachedAsyncImage
import com.sabq.smart.ui.components.PassportSplitBar
import com.sabq.smart.ui.theme.SabqTheme
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Full-height Content Passport sheet. 1:1 port of iOS
 * `PassportSheetView` (`Screens/PassportSheetView.swift`, 1046 lines).
 *
 * Composition (top to bottom):
 *   1. PassportTrustHeader  — tier circle + label + credibility + verified date
 *   2. PassportAIFootprintCard — total bar + 3 surfaces (body/cover/seo)
 *   3. PassportPeopleCard — reporter / submitter / reviewer / verifier / publisher approver
 *   4. PassportSourceCard — channel + rawSource + publisher + canonical link
 *   5. PassportAIImagesCard (if any) — grid of AI-generated images
 *   6. PassportSEOHistoryCard (if any) — latest SEO version
 *   7. PassportTimelineCard — events with actor + staff-only details
 *
 * Top bar: "جواز المحتوى" title, close X on the trailing edge.
 * Share + QR are deferred to a later iteration (iOS implementation in
 * lines 50-83 — both rely on iOS-specific share/QR APIs).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PassportSheet(
    slug: String,
    onDismiss: () -> Unit,
    viewModel: PassportViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val context = LocalContext.current

    LaunchedEffect(slug) { viewModel.load(slug) }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = SabqTheme.colors.background,
        contentColor = SabqTheme.colors.ink,
        dragHandle = null,
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            HeaderBar(
                onClose = onDismiss,
                onShare = {
                    val url = "https://sabq.org/article/$slug/passport"
                    val intent = Intent(Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(Intent.EXTRA_TEXT, "جواز المحتوى — سبق\n$url")
                    }
                    context.startActivity(Intent.createChooser(intent, "مشاركة الجواز").apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    })
                },
            )
            HorizontalDivider(color = SabqTheme.colors.outline.copy(alpha = 0.4f))

            when (val s = state) {
                PassportUiState.Loading -> LoadingState()
                is PassportUiState.Error -> ErrorState(message = s.message, onRetry = viewModel::retry)
                is PassportUiState.Loaded -> LoadedContent(passport = s.passport)
            }
        }
    }
}

// ============================================================
// Header bar
// ============================================================

@Composable
private fun HeaderBar(onClose: () -> Unit, onShare: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Share icon on the leading edge (visual right in RTL — matches
        // iOS `topBarLeading`).
        Icon(
            imageVector = Icons.Filled.Share,
            contentDescription = "مشاركة",
            tint = SabqTheme.colors.primaryEnd,
            modifier = Modifier
                .size(36.dp)
                .clip(CircleShape)
                .clickable(onClick = onShare)
                .padding(8.dp),
        )
        Spacer(modifier = Modifier.weight(1f))
        Text(
            text = "جواز المحتوى",
            fontSize = 17.sp,
            fontWeight = FontWeight.Bold,
            color = SabqTheme.colors.ink,
        )
        Spacer(modifier = Modifier.weight(1f))
        // Close X on the trailing edge (visual left in RTL).
        Icon(
            imageVector = Icons.Filled.Close,
            contentDescription = "إغلاق",
            tint = SabqTheme.colors.tertiaryInk,
            modifier = Modifier
                .size(36.dp)
                .clip(CircleShape)
                .clickable(onClick = onClose)
                .padding(6.dp),
        )
    }
}

// ============================================================
// Loaded content
// ============================================================

@Composable
private fun LoadedContent(passport: Passport) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item { PassportTrustHeader(badge = passport.trustBadge, verifiedAt = passport.article.verifiedAt) }
        item { PassportAIFootprintCard(footprint = passport.aiFootprint, isStaff = passport.viewerIsStaff) }
        item { PassportPeopleCard(people = passport.people, publisher = passport.publisher) }
        item {
            PassportSourceCard(
                source = passport.source,
                publisher = passport.publisher,
                isPublisherNews = passport.article.isPublisherNews,
            )
        }
        if (passport.aiImageGenerations.isNotEmpty()) {
            item { PassportAIImagesCard(images = passport.aiImageGenerations, isStaff = passport.viewerIsStaff) }
        }
        passport.seoHistoryLatest?.let { seo ->
            item { PassportSEOHistoryCard(entry = seo) }
        }
        item { PassportTimelineCard(events = passport.timeline, isStaff = passport.viewerIsStaff) }
    }
}

// ============================================================
// 1. Trust header — tier circle + label + credibility
// ============================================================

@Composable
private fun PassportTrustHeader(badge: PassportTrustBadge, verifiedAt: String?) {
    val tint = tierColor(badge.tier)
    val icon = tierIcon(badge.tier)
    val shape = RoundedCornerShape(SabqTheme.dimens.tileRadius)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(SabqTheme.colors.surface, shape)
            .border(width = 1.dp, color = tint.copy(alpha = 0.25f), shape = shape)
            .padding(vertical = 22.dp, horizontal = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(
            modifier = Modifier
                .size(88.dp)
                .clip(CircleShape)
                .background(tint.copy(alpha = 0.12f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = tint,
                modifier = Modifier.size(40.dp),
            )
        }
        Text(
            text = badge.labelAr,
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
            color = SabqTheme.colors.ink,
            textAlign = TextAlign.Center,
        )
        badge.credibilityScore?.let { score ->
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Icon(
                    imageVector = Icons.Filled.Shield,
                    contentDescription = null,
                    tint = tint,
                    modifier = Modifier.size(12.dp),
                )
                Text(
                    text = "درجة المصداقية: ${formatScore(score)}",
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = tint,
                )
            }
        }
        verifiedAt?.takeIf { it.isNotBlank() }?.let { iso ->
            Text(
                text = "تم التحقّق في ${formatDate(iso)}",
                fontSize = 11.sp,
                fontWeight = FontWeight.Medium,
                color = SabqTheme.colors.tertiaryInk,
            )
        }
    }
}

private fun tierColor(tier: String): Color = when (tier) {
    "human_edited" -> Color(red = 0.16f, green = 0.68f, blue = 0.40f, alpha = 1f)
    "ai_assisted" -> Color(red = 0.20f, green = 0.50f, blue = 0.92f, alpha = 1f)
    "ai_drafted_human_reviewed" -> Color(red = 0.95f, green = 0.60f, blue = 0.10f, alpha = 1f)
    else -> Color(red = 0.36f, green = 0.74f, blue = 0.91f, alpha = 1f) // fallback brand-ish
}

private fun tierIcon(tier: String): ImageVector = when (tier) {
    "human_edited" -> Icons.Filled.VerifiedUser
    "ai_assisted" -> Icons.Filled.AutoAwesome
    "ai_drafted_human_reviewed" -> Icons.Filled.AutoAwesome
    else -> Icons.Filled.Shield
}

private fun formatScore(score: Double): String {
    val pct = if (score > 1.0) score else score * 100
    return "${pct.toInt()}%"
}

// ============================================================
// 2. AI Footprint card — total + 3 rows (body/cover/seo)
// ============================================================

@Composable
private fun PassportAIFootprintCard(footprint: PassportAIFootprint, isStaff: Boolean) {
    val shape = RoundedCornerShape(SabqTheme.dimens.tileRadius)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(SabqTheme.colors.surface, shape)
            .border(width = 0.5.dp, color = SabqTheme.colors.outline.copy(alpha = 0.5f), shape = shape)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(
                imageVector = Icons.Filled.AutoAwesome,
                contentDescription = null,
                tint = BLUE_ACCENT,
                modifier = Modifier.size(14.dp),
            )
            Text(
                text = "بصمة الذكاء الاصطناعي",
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
                color = SabqTheme.colors.ink,
            )
        }

        // Total block — pale-fill rounded chip with the bar + explanation.
        FootprintTotalBlock(footprint = footprint)

        // Three surfaces.
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            FootprintRow(
                title = "النص",
                accent = BLUE_ACCENT,
                icon = Icons.Filled.AutoAwesome,
                pct = footprint.percentages.body,
                primary = bodyTierLabel(footprint.body.tier),
                secondary = footprint.body.aiEditCount.takeIf { it > 0 }?.let { "$it تعديل بالذكاء الاصطناعي" },
                helper = "النسبة تعكس مقدار مساهمة الذكاء الاصطناعي في صياغة النص.",
            )
            FootprintRow(
                title = "الصورة",
                accent = PURPLE_ACCENT,
                icon = Icons.Filled.Photo,
                pct = footprint.percentages.cover,
                primary = if (footprint.cover.isAiGenerated) "صورة مولّدة بالذكاء الاصطناعي" else "صورة من تصوير بشري",
                secondary = coverMetadata(footprint, isStaff),
                helper = "تعكس النسبة ما إذا كانت الصورة الرئيسية مولّدة بالذكاء الاصطناعي.",
            )
            FootprintRow(
                title = "SEO",
                accent = EMERALD,
                icon = Icons.Filled.Search,
                pct = footprint.percentages.seo,
                primary = footprint.seo.status ?: (if (footprint.percentages.seo == 0) "تحرير يدوي" else "—"),
                secondary = seoMetadata(footprint),
                helper = "النسبة تعكس مقدار اعتماد البيانات الوصفية على الذكاء الاصطناعي.",
            )
        }
    }
}

@Composable
private fun FootprintTotalBlock(footprint: PassportAIFootprint) {
    val shape = RoundedCornerShape(SabqTheme.dimens.chipRadius)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(SabqTheme.colors.paleFill.copy(alpha = 0.5f), shape)
            .border(width = 0.5.dp, color = SabqTheme.colors.outline.copy(alpha = 0.4f), shape = shape)
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = "النسبة الإجمالية",
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                color = SabqTheme.colors.secondaryInk,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = "${footprint.percentages.total}%",
                fontSize = 22.sp,
                fontWeight = FontWeight.Black,
                color = AMBER,
            )
        }
        PassportSplitBar(aiPct = footprint.percentages.total)
        if (footprint.explanation.ar.isNotBlank()) {
            Text(
                text = footprint.explanation.ar,
                fontSize = 12.sp,
                color = SabqTheme.colors.secondaryInk,
                lineHeight = 18.sp,
            )
        }
    }
}

@Composable
private fun FootprintRow(
    title: String,
    accent: Color,
    icon: ImageVector,
    pct: Int,
    primary: String,
    secondary: String?,
    helper: String,
) {
    val shape = RoundedCornerShape(SabqTheme.dimens.chipRadius)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(accent.copy(alpha = 0.05f), shape)
            .border(width = 0.5.dp, color = accent.copy(alpha = 0.25f), shape = shape)
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.Top,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(accent.copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = accent,
                    modifier = Modifier.size(16.dp),
                )
            }
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                Text(text = title, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = SabqTheme.colors.ink)
                Text(text = primary, fontSize = 11.sp, fontWeight = FontWeight.Medium, color = SabqTheme.colors.secondaryInk)
                if (!secondary.isNullOrBlank()) {
                    Text(
                        text = secondary,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Medium,
                        color = SabqTheme.colors.tertiaryInk,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            Text(
                text = "$pct%",
                fontSize = 14.sp,
                fontWeight = FontWeight.Black,
                color = AMBER,
            )
        }
        PassportSplitBar(aiPct = pct)
        Text(
            text = helper,
            fontSize = 10.sp,
            color = SabqTheme.colors.tertiaryInk,
            lineHeight = 14.sp,
        )
    }
}

private fun bodyTierLabel(tier: String): String = when (tier) {
    "human" -> "كتابة بشرية"
    "assisted" -> "بمساعدة الذكاء الاصطناعي"
    "ai_drafted" -> "مسودة بالذكاء الاصطناعي"
    else -> tier
}

private fun coverMetadata(footprint: PassportAIFootprint, isStaff: Boolean): String? {
    if (!footprint.cover.isAiGenerated) return null
    val parts = mutableListOf<String>()
    footprint.cover.model?.takeIf { it.isNotBlank() }?.let(parts::add)
    if (isStaff) {
        footprint.cover.prompt?.takeIf { it.isNotBlank() }?.let { parts.add("«$it»") }
    }
    return parts.takeIf { it.isNotEmpty() }?.joinToString(" · ")
}

private fun seoMetadata(footprint: PassportAIFootprint): String? {
    val parts = mutableListOf<String>()
    footprint.seo.provider?.takeIf { it.isNotBlank() }?.let(parts::add)
    footprint.seo.model?.takeIf { it.isNotBlank() }?.let(parts::add)
    return parts.takeIf { it.isNotEmpty() }?.joinToString(" · ")
}

// ============================================================
// 3. People card
// ============================================================

@Composable
private fun PassportPeopleCard(people: PassportPeople, publisher: PassportPublisher?) {
    val rows = buildList {
        people.reporter?.let { add("مراسل" to it) }
        people.submitter?.takeIf { it.id != people.reporter?.id }?.let { add("أرسل" to it) }
        people.reviewer?.let { add("مُراجِع" to it) }
        people.verifier?.let { add("محقّق" to it) }
        people.publisherApprover?.let { add("اعتماد الوكالة" to it) }
    }
    if (rows.isEmpty() && publisher == null) return

    val shape = RoundedCornerShape(SabqTheme.dimens.tileRadius)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(SabqTheme.colors.surface, shape)
            .border(width = 0.5.dp, color = SabqTheme.colors.outline.copy(alpha = 0.5f), shape = shape)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Text(
            text = "المسؤولون عن المحتوى",
            fontSize = 14.sp,
            fontWeight = FontWeight.Bold,
            color = SabqTheme.colors.ink,
        )
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            rows.forEachIndexed { idx, (label, person) ->
                PersonRow(label = label, person = person)
                if (idx != rows.lastIndex) {
                    HorizontalDivider(color = SabqTheme.colors.outline.copy(alpha = 0.5f))
                }
            }
        }
    }
}

@Composable
private fun PersonRow(label: String, person: PassportPerson) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        PersonAvatar(person = person)
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(
                text = person.displayName.ifBlank { "—" },
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                color = SabqTheme.colors.ink,
                maxLines = 1,
            )
            Text(
                text = label,
                fontSize = 11.sp,
                fontWeight = FontWeight.Medium,
                color = SabqTheme.colors.tertiaryInk,
            )
        }
    }
}

@Composable
private fun PersonAvatar(person: PassportPerson, size: androidx.compose.ui.unit.Dp = 36.dp) {
    val initials = person.displayName
        .split(" ")
        .filter { it.isNotBlank() }
        .take(2)
        .mapNotNull { it.firstOrNull()?.toString() }
        .joinToString("")
        .ifBlank { "—" }
    Box(
        modifier = Modifier
            .size(size)
            .clip(CircleShape)
            .background(SabqTheme.colors.paleFill),
        contentAlignment = Alignment.Center,
    ) {
        if (!person.profileImageUrl.isNullOrBlank()) {
            FocalCachedAsyncImage(
                url = person.profileImageUrl,
                focalPoint = null,
                modifier = Modifier
                    .size(size)
                    .clip(CircleShape),
            )
        } else {
            Text(
                text = initials,
                fontSize = (size.value / 2.7f).sp,
                fontWeight = FontWeight.Bold,
                color = SabqTheme.colors.secondaryInk,
            )
        }
    }
}

// ============================================================
// 4. Source card
// ============================================================

@Composable
private fun PassportSourceCard(
    source: PassportSource,
    publisher: PassportPublisher?,
    isPublisherNews: Boolean,
) {
    val shape = RoundedCornerShape(SabqTheme.dimens.tileRadius)
    val context = LocalContext.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(SabqTheme.colors.surface, shape)
            .border(width = 0.5.dp, color = SabqTheme.colors.outline.copy(alpha = 0.5f), shape = shape)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(text = "المصدر", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = SabqTheme.colors.ink)

        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Icon(
                imageVector = channelIcon(source.channel),
                contentDescription = null,
                tint = SabqTheme.colors.primaryEnd,
                modifier = Modifier.size(16.dp),
            )
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    text = channelLabel(source.channel),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = SabqTheme.colors.ink,
                )
                source.rawSource?.takeIf { it.isNotBlank() }?.let {
                    Text(
                        text = it,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Medium,
                        color = SabqTheme.colors.tertiaryInk,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }

        if (isPublisherNews && publisher != null) {
            HorizontalDivider(color = SabqTheme.colors.outline.copy(alpha = 0.5f))
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Icon(
                    imageVector = Icons.Filled.Newspaper,
                    contentDescription = null,
                    tint = SabqTheme.colors.primaryEnd,
                    modifier = Modifier.size(16.dp),
                )
                Text(
                    text = publisher.agencyName,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = SabqTheme.colors.ink,
                )
            }
        }

        source.sourceUrl?.takeIf { it.isNotBlank() }?.let { url ->
            Row(
                modifier = Modifier
                    .clip(CircleShape)
                    .clickable {
                        runCatching {
                            context.startActivity(
                                Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url))
                                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                            )
                        }
                    }
                    .padding(vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.OpenInNew,
                    contentDescription = null,
                    tint = SabqTheme.colors.primaryEnd,
                    modifier = Modifier.size(12.dp),
                )
                Text(
                    text = "فتح المصدر الأصلي",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = SabqTheme.colors.primaryEnd,
                )
            }
        }
    }
}

private fun channelLabel(channel: String): String = when (channel) {
    "manual" -> "تحرير يدوي"
    "email" -> "وارد عبر البريد الإلكتروني"
    "whatsapp" -> "وارد عبر واتساب"
    "publisher" -> "وكالة أنباء"
    "external" -> "مصدر خارجي"
    else -> channel
}

private fun channelIcon(channel: String): ImageVector = when (channel) {
    "manual" -> Icons.Outlined.Edit
    "email" -> Icons.Filled.Email
    "whatsapp" -> Icons.Filled.Chat
    "publisher" -> Icons.Filled.Newspaper
    "external" -> Icons.AutoMirrored.Filled.OpenInNew
    else -> Icons.Outlined.AutoStories
}

// ============================================================
// 5. AI Images grid
// ============================================================

@Composable
private fun PassportAIImagesCard(images: List<PassportAIImage>, isStaff: Boolean) {
    val shape = RoundedCornerShape(SabqTheme.dimens.tileRadius)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(SabqTheme.colors.surface, shape)
            .border(width = 0.5.dp, color = SabqTheme.colors.outline.copy(alpha = 0.5f), shape = shape)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(
                imageVector = Icons.Filled.PhotoLibrary,
                contentDescription = null,
                tint = PURPLE_ACCENT,
                modifier = Modifier.size(14.dp),
            )
            Text(
                text = "صور مولّدة بالذكاء الاصطناعي",
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                color = SabqTheme.colors.ink,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = images.size.toString(),
                fontSize = 13.sp,
                fontWeight = FontWeight.Black,
                color = SabqTheme.colors.tertiaryInk,
            )
        }
        // 2-column grid as Compose Rows (avoids LazyVerticalGrid inside
        // a LazyColumn — Compose forbids that nesting).
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            images.chunked(2).forEach { pair ->
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    pair.forEach { img ->
                        AIImageCell(img = img, isStaff = isStaff, modifier = Modifier.weight(1f))
                    }
                    // If the row has an odd count, fill the gap so the
                    // single image doesn't stretch to full width.
                    if (pair.size == 1) Spacer(modifier = Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
private fun AIImageCell(
    img: PassportAIImage,
    isStaff: Boolean,
    modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(SabqTheme.dimens.chipRadius)
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(1f)
                .clip(shape)
                .background(SabqTheme.colors.paleFill),
            contentAlignment = Alignment.Center,
        ) {
            val url = img.thumbnailUrl ?: img.imageUrl
            if (!url.isNullOrBlank()) {
                FocalCachedAsyncImage(
                    url = url,
                    focalPoint = null,
                    modifier = Modifier.fillMaxSize(),
                )
            } else {
                Icon(
                    imageVector = Icons.Filled.Photo,
                    contentDescription = null,
                    tint = SabqTheme.colors.tertiaryInk,
                    modifier = Modifier.size(24.dp),
                )
            }
        }
        if (!img.prompt.isNullOrBlank()) {
            Text(
                text = img.prompt,
                fontSize = 11.sp,
                color = SabqTheme.colors.secondaryInk,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        } else if (!isStaff) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Icon(
                    imageVector = Icons.Outlined.Lock,
                    contentDescription = null,
                    tint = SabqTheme.colors.tertiaryInk,
                    modifier = Modifier.size(9.dp),
                )
                Text(
                    text = "الـ prompt للموظّفين فقط",
                    fontSize = 11.sp,
                    color = SabqTheme.colors.tertiaryInk,
                )
            }
        }
        Box(
            modifier = Modifier
                .clip(CircleShape)
                .background(SabqTheme.colors.paleFill)
                .border(width = 0.5.dp, color = SabqTheme.colors.outline.copy(alpha = 0.5f), shape = CircleShape)
                .padding(horizontal = 7.dp, vertical = 3.dp),
        ) {
            Text(
                text = img.model,
                fontSize = 10.sp,
                fontWeight = FontWeight.SemiBold,
                color = SabqTheme.colors.secondaryInk,
            )
        }
    }
}

// ============================================================
// 6. SEO history
// ============================================================

@Composable
private fun PassportSEOHistoryCard(entry: PassportSEOEntry) {
    val shape = RoundedCornerShape(SabqTheme.dimens.tileRadius)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(SabqTheme.colors.surface, shape)
            .border(width = 0.5.dp, color = SabqTheme.colors.outline.copy(alpha = 0.5f), shape = shape)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(
                imageVector = Icons.Filled.Search,
                contentDescription = null,
                tint = EMERALD,
                modifier = Modifier.size(14.dp),
            )
            Text(
                text = "سجل تحسين الظهور (SEO)",
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                color = SabqTheme.colors.ink,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = "v${entry.version}",
                fontSize = 12.sp,
                fontWeight = FontWeight.Black,
                color = SabqTheme.colors.secondaryInk,
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Tag(entry.provider, EMERALD)
            Tag(entry.model, SabqTheme.colors.secondaryInk)
            if (entry.manualOverride == true) Tag("تعديل يدوي", AMBER)
        }
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            (entry.generatedByName ?: entry.generatedBy)?.let {
                Text(
                    text = "مُنشئ: $it",
                    fontSize = 12.sp,
                    color = SabqTheme.colors.secondaryInk,
                )
            }
            Text(
                text = formatDate(entry.createdAt),
                fontSize = 11.sp,
                color = SabqTheme.colors.tertiaryInk,
            )
        }
    }
}

@Composable
private fun Tag(title: String, tint: Color) {
    Box(
        modifier = Modifier
            .clip(CircleShape)
            .background(tint.copy(alpha = 0.10f), CircleShape)
            .border(width = 0.5.dp, color = tint.copy(alpha = 0.30f), shape = CircleShape)
            .padding(horizontal = 8.dp, vertical = 3.dp),
    ) {
        Text(text = title, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = tint)
    }
}

// ============================================================
// 7. Timeline
// ============================================================

@Composable
private fun PassportTimelineCard(events: List<PassportTimelineEvent>, isStaff: Boolean) {
    val shape = RoundedCornerShape(SabqTheme.dimens.tileRadius)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(SabqTheme.colors.surface, shape)
            .border(width = 0.5.dp, color = SabqTheme.colors.outline.copy(alpha = 0.5f), shape = shape)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(
                imageVector = Icons.Outlined.History,
                contentDescription = null,
                tint = SabqTheme.colors.secondaryInk,
                modifier = Modifier.size(14.dp),
            )
            Text(
                text = "سجل أحداث الخبر",
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                color = SabqTheme.colors.ink,
            )
        }

        if (events.isEmpty()) {
            Text(
                text = "لا توجد أحداث مسجّلة بعد.",
                fontSize = 12.sp,
                color = SabqTheme.colors.tertiaryInk,
            )
        } else {
            Column {
                events.forEachIndexed { idx, event ->
                    TimelineRow(event = event, isLast = idx == events.lastIndex, isStaff = isStaff)
                }
            }
        }
    }
}

@Composable
private fun TimelineRow(event: PassportTimelineEvent, isLast: Boolean, isStaff: Boolean) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = if (isLast) 0.dp else 14.dp),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        // Dot + connecting line column.
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.width(14.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(11.dp)
                    .clip(CircleShape)
                    .background(SabqTheme.colors.primaryEnd)
                    .border(width = 2.dp, color = SabqTheme.colors.background, shape = CircleShape),
            )
            if (!isLast) {
                Box(
                    modifier = Modifier
                        .width(1.dp)
                        .height(48.dp)
                        .background(SabqTheme.colors.outline.copy(alpha = 0.5f)),
                )
            }
        }

        // Content column.
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Box(
                    modifier = Modifier
                        .clip(CircleShape)
                        .background(SabqTheme.colors.primaryEnd.copy(alpha = 0.10f), CircleShape)
                        .padding(horizontal = 7.dp, vertical = 3.dp),
                ) {
                    Text(
                        text = eventLabel(event.eventType),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = SabqTheme.colors.primaryEnd,
                    )
                }
                Box(
                    modifier = Modifier
                        .clip(CircleShape)
                        .border(width = 0.5.dp, color = SabqTheme.colors.outline.copy(alpha = 0.5f), shape = CircleShape)
                        .padding(horizontal = 6.dp, vertical = 2.dp),
                ) {
                    Text(
                        text = sourceLabel(event.source),
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Medium,
                        color = SabqTheme.colors.tertiaryInk,
                    )
                }
                Spacer(modifier = Modifier.weight(1f))
                Text(
                    text = formatDate(event.createdAt),
                    fontSize = 10.sp,
                    color = SabqTheme.colors.tertiaryInk,
                )
            }

            event.summary?.takeIf { it.isNotBlank() }?.let {
                Text(text = it, fontSize = 12.sp, color = SabqTheme.colors.secondaryInk)
            }

            event.actor?.let { actor ->
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    PersonAvatar(person = actor, size = 20.dp)
                    Text(
                        text = actor.displayName.ifBlank { "—" },
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Medium,
                        color = SabqTheme.colors.secondaryInk,
                    )
                }
            }

            if (isStaff && !event.details.isNullOrEmpty()) {
                StaffDetailsBlock(details = event.details)
            }
        }
    }
}

@Composable
private fun StaffDetailsBlock(details: Map<String, String>) {
    var expanded by remember { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(
            modifier = Modifier.clickable { expanded = !expanded },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Icon(
                imageVector = Icons.Outlined.Lock,
                contentDescription = null,
                tint = SabqTheme.colors.tertiaryInk,
                modifier = Modifier.size(9.dp),
            )
            Text(
                text = "تفاصيل التغيير (للموظّفين)",
                fontSize = 11.sp,
                color = SabqTheme.colors.tertiaryInk,
            )
        }
        if (expanded) {
            val shape = RoundedCornerShape(6.dp)
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(shape)
                    .background(SabqTheme.colors.paleFill.copy(alpha = 0.5f), shape)
                    .padding(8.dp),
                verticalArrangement = Arrangement.spacedBy(3.dp),
            ) {
                details.entries.sortedBy { it.key }.forEach { (k, v) ->
                    Text(
                        text = "$k: $v",
                        fontSize = 10.sp,
                        color = SabqTheme.colors.secondaryInk,
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

private fun eventLabel(type: String): String = when (type) {
    "created", "create" -> "تم الإنشاء"
    "submitted" -> "تم الإرسال"
    "approved", "approve" -> "تم الاعتماد"
    "rejected", "reject" -> "تم الرفض"
    "published", "publish" -> "تم النشر"
    "updated", "update" -> "تم التحديث"
    "verified", "verify" -> "تم التحقق"
    "unpublish" -> "تم إلغاء النشر"
    else -> type
}

private fun sourceLabel(source: String): String = when (source) {
    "article_events" -> "سجل الأحداث"
    "audit_log" -> "سجل التدقيق"
    "synthetic" -> "مُستنتج"
    else -> source
}

// ============================================================
// Loading / Error
// ============================================================

@Composable
private fun LoadingState() {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(40.dp),
        contentAlignment = Alignment.Center,
    ) {
        CircularProgressIndicator(color = SabqTheme.colors.primaryEnd)
    }
}

@Composable
private fun ErrorState(message: String, onRetry: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(40.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(14.dp, Alignment.CenterVertically),
    ) {
        Icon(
            imageVector = Icons.Filled.Shield,
            contentDescription = null,
            tint = SabqTheme.colors.tertiaryInk,
            modifier = Modifier.size(48.dp),
        )
        Text(
            text = "تعذّر تحميل جواز المحتوى",
            fontSize = 16.sp,
            fontWeight = FontWeight.Bold,
            color = SabqTheme.colors.ink,
        )
        Text(
            text = message,
            fontSize = 13.sp,
            color = SabqTheme.colors.secondaryInk,
            textAlign = TextAlign.Center,
        )
        Box(
            modifier = Modifier
                .clip(CircleShape)
                .background(SabqTheme.colors.primaryEnd)
                .clickable(onClick = onRetry)
                .padding(horizontal = 18.dp, vertical = 8.dp),
        ) {
            Text(
                text = "إعادة المحاولة",
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White,
            )
        }
    }
}

// ============================================================
// Shared
// ============================================================

private val EMERALD = Color(red = 0.16f, green = 0.68f, blue = 0.40f, alpha = 1f)
private val AMBER = Color(red = 0.96f, green = 0.62f, blue = 0.04f, alpha = 1f)
private val BLUE_ACCENT = Color(red = 0.20f, green = 0.50f, blue = 0.92f, alpha = 1f)
private val PURPLE_ACCENT = Color(red = 0.62f, green = 0.36f, blue = 0.92f, alpha = 1f)

private val arabicDateFmt = DateTimeFormatter
    .ofPattern("d MMM yyyy، HH:mm", Locale("ar"))

private fun formatDate(iso: String): String {
    if (iso.isBlank()) return iso
    return runCatching {
        OffsetDateTime.parse(iso).format(arabicDateFmt)
    }.getOrDefault(iso)
}
