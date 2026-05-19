package com.sabq.smart.feature.notifications

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Archive
import androidx.compose.material.icons.filled.Article
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.FormatQuote
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.sabq.smart.data.EditorialNotification
import com.sabq.smart.ui.components.SurfaceCard
import com.sabq.smart.ui.theme.SabqTheme
import com.sabq.smart.util.formatRelativeDateAr

/**
 * Detail screen for a single editorial notification. Mirrors iOS
 * `EditorialNotificationDetailView` (`EditorialNotificationsView.swift:425-719`):
 *   - typeHeader: 80 dp tint circle + label capsule + title
 *   - titleCard: "المحتوى المعني" + article title + body (or split
 *     date/time rows for scheduled events)
 *   - reviewerNoteCard (when reviewerNote is non-empty)
 *   - metadataRow: clock + relative date
 *   - actionButton: gradient CTA for "published" with article slug.
 *     Other types render no CTA — same as iOS, which only routes
 *     "published" today.
 */
@Composable
fun EditorialNotificationDetailScreen(
    onBack: () -> Unit,
    onOpenArticle: (slug: String) -> Unit,
    viewModel: EditorialNotificationDetailViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(SabqTheme.colors.background),
    ) {
        DetailTopBar(onBack = onBack)

        Box(modifier = Modifier.fillMaxSize()) {
            when (val s = state) {
                EditorialNotificationDetailViewModel.DetailState.Loading -> CenteredSpinner()
                is EditorialNotificationDetailViewModel.DetailState.Loaded -> DetailContent(
                    item = s.item,
                    onOpenArticle = onOpenArticle,
                )
                EditorialNotificationDetailViewModel.DetailState.NotFound -> CenteredMessage(
                    text = "هذا الإشعار لم يعد متاحاً.",
                )
                is EditorialNotificationDetailViewModel.DetailState.Failed -> CenteredMessage(
                    text = s.message,
                )
            }
        }
    }
}

@Composable
private fun DetailTopBar(onBack: () -> Unit) {
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
                imageVector = Icons.Filled.Close,
                contentDescription = "إغلاق",
                tint = SabqTheme.colors.tertiaryInk,
                modifier = Modifier.size(20.dp),
            )
        }
        Spacer(modifier = Modifier.weight(1f))
        Text(
            text = "تفاصيل الإشعار",
            style = SabqTheme.typography.cardTitle.copy(fontSize = 15.sp),
            color = SabqTheme.colors.ink,
        )
        Spacer(modifier = Modifier.weight(1f))
        Spacer(modifier = Modifier.size(40.dp))
    }
}

@Composable
private fun DetailContent(
    item: EditorialNotification,
    onOpenArticle: (String) -> Unit,
) {
    val style = detailStyle(item.type)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp)
            .padding(top = 16.dp, bottom = 40.dp),
        verticalArrangement = Arrangement.spacedBy(22.dp),
    ) {
        TypeHeader(item = item, style = style)
        TitleCard(item = item)
        item.reviewerNote
            ?.takeIf { it.isNotEmpty() }
            ?.let { note -> ReviewerNoteCard(note = note, tint = style.tint) }
        MetadataRow(item = item)
        if (item.type == "published" && !item.articleSlug.isNullOrBlank()) {
            ActionButton(
                title = "اقرأ المقال",
                onClick = { onOpenArticle(item.articleSlug) },
            )
        }
    }
}

private data class DetailStyle(
    val icon: ImageVector,
    val tint: Color,
    val label: String,
)

@Composable
private fun detailStyle(type: String): DetailStyle {
    val colors = SabqTheme.colors
    return when (type) {
        "scheduled" -> DetailStyle(Icons.Filled.Schedule, colors.sky, "جدولة")
        "published" -> DetailStyle(Icons.Filled.CheckCircle, colors.leaf, "نشر")
        "rejected" -> DetailStyle(Icons.Filled.Cancel, colors.coral, "اعتذار")
        "needs_revision" -> DetailStyle(Icons.Filled.Edit, colors.primaryEnd, "طلب تعديل")
        "archived" -> DetailStyle(Icons.Filled.Archive, colors.tertiaryInk, "أرشفة")
        else -> DetailStyle(Icons.Filled.Notifications, colors.secondaryInk, "إشعار")
    }
}

@Composable
private fun TypeHeader(item: EditorialNotification, style: DetailStyle) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            modifier = Modifier
                .size(80.dp)
                .clip(CircleShape)
                .background(style.tint.copy(alpha = 0.14f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = style.icon,
                contentDescription = null,
                tint = style.tint,
                modifier = Modifier.size(36.dp),
            )
        }
        Row(
            modifier = Modifier
                .clip(CircleShape)
                .background(style.tint.copy(alpha = 0.10f))
                .border(
                    BorderStroke(0.5.dp, style.tint.copy(alpha = 0.25f)),
                    CircleShape,
                )
                .padding(horizontal = 10.dp, vertical = 4.dp),
        ) {
            Text(
                text = style.label,
                style = SabqTheme.typography.metaSmall.copy(
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Black,
                    letterSpacing = 0.5.sp,
                    color = style.tint,
                ),
            )
        }
        Text(
            text = item.title,
            style = SabqTheme.typography.cardTitle.copy(
                fontSize = 18.sp,
                fontWeight = FontWeight.Black,
                color = SabqTheme.colors.ink,
            ),
        )
    }
}

@Composable
private fun TitleCard(item: EditorialNotification) {
    SurfaceCard {
        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text(
                text = "المحتوى المعني",
                style = SabqTheme.typography.metaSmall.copy(
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Black,
                    color = SabqTheme.colors.tertiaryInk,
                ),
            )
            Text(
                text = item.articleTitle?.takeIf { it.isNotBlank() } ?: item.title,
                style = SabqTheme.typography.cardTitle.copy(
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    color = SabqTheme.colors.ink,
                ),
            )
            val body = bodyWithoutTitlePrefix(item)
            if (body.isNotEmpty()) {
                Text(
                    text = body,
                    style = SabqTheme.typography.meta.copy(
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium,
                        color = SabqTheme.colors.secondaryInk,
                    ),
                )
            }
        }
    }
}

@Composable
private fun ReviewerNoteCard(note: String, tint: Color) {
    SurfaceCard(accent = tint) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(
                    imageVector = Icons.Filled.FormatQuote,
                    contentDescription = null,
                    tint = tint,
                    modifier = Modifier.size(14.dp),
                )
                Text(
                    text = "ملاحظة المحرر",
                    style = SabqTheme.typography.cardTitle.copy(
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                        color = SabqTheme.colors.ink,
                    ),
                )
            }
            val shape = RoundedCornerShape(SabqTheme.dimens.chipRadius)
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(shape)
                    .background(tint.copy(alpha = 0.08f), shape)
                    .border(BorderStroke(0.5.dp, tint.copy(alpha = 0.20f)), shape)
                    .padding(12.dp),
            ) {
                Text(
                    text = note,
                    style = SabqTheme.typography.meta.copy(
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Medium,
                        color = SabqTheme.colors.ink,
                    ),
                )
            }
        }
    }
}

@Composable
private fun MetadataRow(item: EditorialNotification) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Icon(
            imageVector = Icons.Filled.Schedule,
            contentDescription = null,
            tint = SabqTheme.colors.tertiaryInk,
            modifier = Modifier.size(11.dp),
        )
        Text(
            text = formatRelativeDateAr(item.createdAt),
            style = SabqTheme.typography.metaSmall.copy(
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
                color = SabqTheme.colors.tertiaryInk,
            ),
        )
    }
}

@Composable
private fun ActionButton(title: String, onClick: () -> Unit) {
    val shape = RoundedCornerShape(SabqTheme.dimens.buttonRadius)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(
                Brush.linearGradient(
                    listOf(SabqTheme.colors.primaryStart, SabqTheme.colors.primaryEnd),
                ),
                shape,
            )
            .clickable { onClick() }
            .padding(vertical = 15.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Filled.Article,
            contentDescription = null,
            tint = Color.White,
            modifier = Modifier.size(14.dp),
        )
        Spacer(modifier = Modifier.size(8.dp))
        Text(
            text = title,
            style = SabqTheme.typography.cardTitle.copy(
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White,
            ),
        )
    }
}

@Composable
private fun CenteredSpinner() {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(
            color = SabqTheme.colors.primaryEnd,
            strokeWidth = 2.dp,
            modifier = Modifier.size(28.dp),
        )
    }
}

@Composable
private fun CenteredMessage(text: String) {
    Box(modifier = Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
        Text(
            text = text,
            style = SabqTheme.typography.meta.copy(
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                color = SabqTheme.colors.secondaryInk,
            ),
        )
    }
}

/** Removes the `«title» —` lead from the body so the article title
 *  doesn't render twice when the body starts with it. Mirrors iOS
 *  `EditorialNotificationDetailView.bodyWithoutTitlePrefix`. */
private fun bodyWithoutTitlePrefix(item: EditorialNotification): String {
    val raw = stripReviewerNoteSuffix(item)
    val dashIdx = raw.indexOf('—')
    return if (dashIdx > 0) {
        raw.substring(dashIdx + 1).trim()
    } else {
        raw
    }
}

private fun stripReviewerNoteSuffix(item: EditorialNotification): String {
    val raw = item.body
    val note = item.reviewerNote
    if (note.isNullOrEmpty()) return raw
    val firstDash = raw.indexOf('—')
    if (firstDash < 0) return raw
    val secondDash = raw.indexOf('—', firstDash + 1)
    return if (secondDash > 0) raw.substring(0, secondDash).trim() else raw
}
