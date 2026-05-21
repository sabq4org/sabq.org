package com.sabq.smart.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Reply
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.boundsInParent
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.sabq.smart.data.Comment
import com.sabq.smart.ui.theme.SabqTheme
import java.time.Duration
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.util.Locale

/**
 * Single comment plus its replies (one level deep). Ports iOS
 * `CommentRow` (Components/CommentRow.swift) 1:1, including the
 * curved thread-line overlay that connects the parent avatar's
 * bottom to each reply's avatar via a Bezier elbow.
 *
 * Geometry constants come from iOS ThreadLineOverlay (line 216-265):
 *   trunkFromLeading   = 16  // X of trunk relative to row leading
 *   trunkStartY        = 42  // padding-top 10 + avatar 32
 *   avatarEdgeFromLeading = 38  // where reply avatar's outer edge sits
 *   avatarCenterYOffset = 26  // padding-top 10 + half-avatar 16
 *   cornerRadius       = 8   // elbow curve radius
 *
 * RTL: the iOS Canvas mirrors X coords against `size.width`. Compose
 * does the same with `LocalLayoutDirection.current`.
 */
@Composable
fun CommentRow(
    comment: Comment,
    depth: Int = 0,
    onReply: ((Comment) -> Unit)? = null,
) {
    val isRTL = LocalLayoutDirection.current == LayoutDirection.Rtl
    // Y positions of reply avatars in pixels — captured via
    // onGloballyPositioned so the thread-line Canvas can draw to them.
    val replyAvatarCentersPx = remember { mutableStateListOf<Float>() }

    Box(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            // Header — avatar + name + relative time.
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                CommentAvatar(comment = comment, size = 32.dp)
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    Text(
                        text = comment.userName ?: "مستخدم",
                        style = SabqTheme.typography.compactCardTitle.copy(
                            fontSize = 13.5f.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = SabqTheme.colors.ink,
                        ),
                    )
                    Text(
                        text = relativeTime(comment.createdAt),
                        style = SabqTheme.typography.metaSmall.copy(
                            fontSize = 11.5f.sp,
                            fontWeight = FontWeight.Medium,
                            color = SabqTheme.colors.tertiaryInk,
                        ),
                    )
                }
            }

            // Body — indented past the avatar.
            Text(
                text = comment.body,
                style = SabqTheme.typography.body.copy(
                    fontSize = 14.5f.sp,
                    color = SabqTheme.colors.secondaryInk,
                    lineHeight = 22.5f.sp,
                ),
                modifier = Modifier.padding(start = 42.dp),
            )

            // Footer — reply button + AI-moderation chip.
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 42.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                if (depth == 0 && onReply != null) {
                    val haptics = rememberSabqHaptics()
                    Row(
                        modifier = Modifier.clickable {
                            haptics.light()
                            onReply(comment)
                        },
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.Reply,
                            contentDescription = null,
                            tint = SabqTheme.colors.primaryEnd,
                            modifier = Modifier.size(11.dp),
                        )
                        Text(
                            text = "رد",
                            style = SabqTheme.typography.metaSmall.copy(
                                fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = SabqTheme.colors.primaryEnd,
                            ),
                        )
                    }
                }

                if (comment.isPending) {
                    AiModerationChip()
                }

                Spacer(modifier = Modifier.weight(1f))
            }

            // Replies stack (one level only; matches iOS).
            if (comment.replies.isNotEmpty()) {
                Column(
                    modifier = Modifier
                        .padding(start = 38.dp, top = 4.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    comment.replies.forEachIndexed { idx, reply ->
                        Box(
                            modifier = Modifier.onGloballyPositioned { coords ->
                                // Top-Y of this reply's row in the parent
                                // Box's coordinate space. The thread-line
                                // Canvas adds the 26 px avatar-centre
                                // offset itself so we just need the row's
                                // top here.
                                val y = coords.boundsInParent().top
                                while (replyAvatarCentersPx.size <= idx) {
                                    replyAvatarCentersPx.add(0f)
                                }
                                replyAvatarCentersPx[idx] = y
                            },
                        ) {
                            CommentRow(comment = reply, depth = depth + 1)
                        }
                    }
                }
            }
        }

        // Thread-line overlay — drawn on TOP of the column so the
        // curves visually thread under the avatars. The Canvas only
        // draws when there are replies and at least one is positioned.
        if (comment.replies.isNotEmpty()) {
            ThreadLineOverlay(
                replyTopYs = replyAvatarCentersPx,
                isRTL = isRTL,
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}

@Composable
private fun CommentAvatar(comment: Comment, size: androidx.compose.ui.unit.Dp) {
    val url = comment.userAvatar
    val initials = comment.userName?.take(1) ?: "م"
    if (!url.isNullOrBlank()) {
        AsyncImage(
            model = url,
            contentDescription = null,
            modifier = Modifier
                .size(size)
                .clip(CircleShape),
            contentScale = androidx.compose.ui.layout.ContentScale.Crop,
        )
    } else {
        Box(
            modifier = Modifier
                .size(size)
                .clip(CircleShape)
                .background(SabqTheme.colors.primaryEnd.copy(alpha = 0.15f)),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = initials,
                style = SabqTheme.typography.compactCardTitle.copy(
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    color = SabqTheme.colors.primaryEnd,
                ),
            )
        }
    }
}

@Composable
private fun AiModerationChip() {
    Row(
        modifier = Modifier
            .clip(CircleShape)
            .background(
                Brush.linearGradient(
                    listOf(SabqTheme.colors.primaryEnd, SabqTheme.colors.teal),
                ),
            )
            .padding(horizontal = 8.dp, vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Icon(
            imageVector = Icons.Filled.AutoAwesome,
            contentDescription = null,
            tint = Color.White,
            modifier = Modifier.size(9.dp),
        )
        Text(
            text = "SABQ AI يراجع",
            style = SabqTheme.typography.metaSmall.copy(
                fontSize = 10.5f.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White,
            ),
        )
    }
}

/**
 * Curved thread-guide that emerges from beneath the parent's avatar
 * and elbows into each reply's avatar. iOS uses
 * `addQuadCurve` for the elbow corner; Compose Path's
 * `quadraticBezierTo` is the direct equivalent.
 */
@Composable
private fun ThreadLineOverlay(
    replyTopYs: List<Float>,
    isRTL: Boolean,
    modifier: Modifier = Modifier,
) {
    val density = LocalDensity.current
    val strokeColor = SabqTheme.colors.outline.copy(alpha = 0.55f)
    Canvas(modifier = modifier) {
        if (replyTopYs.isEmpty()) return@Canvas

        val trunkFromLeading = with(density) { 16.dp.toPx() }
        val trunkStartY = with(density) { 42.dp.toPx() }
        val avatarEdgeFromLeading = with(density) { 38.dp.toPx() }
        val avatarCenterYOffset = with(density) { 26.dp.toPx() }
        val cornerRadius = with(density) { 8.dp.toPx() }

        // In RTL, leading = right edge → mirror X against canvas width.
        val trunkX = if (isRTL) size.width - trunkFromLeading else trunkFromLeading
        val avatarEdgeX = if (isRTL) size.width - avatarEdgeFromLeading else avatarEdgeFromLeading
        val dir = if (isRTL) -1f else 1f

        // Each reply row reports its TOP Y (in our coordinate space).
        // The avatar's centre sits 26 px below that top.
        val centreYs = replyTopYs.map { it + avatarCenterYOffset }
        val lastY = centreYs.lastOrNull() ?: return@Canvas

        val stroke = Stroke(width = with(density) { 1.5.dp.toPx() })

        // Trunk — single vertical line from below parent avatar down
        // to (last reply Y − cornerRadius). Intermediate elbows just
        // cross the trunk at their corner points.
        val trunk = Path().apply {
            moveTo(trunkX, trunkStartY)
            lineTo(trunkX, maxOf(trunkStartY, lastY - cornerRadius))
        }
        drawPath(trunk, color = strokeColor, style = stroke)

        // Per-reply branch with curved elbow.
        for (y in centreYs) {
            val branch = Path().apply {
                moveTo(trunkX, y - cornerRadius)
                quadraticBezierTo(
                    x1 = trunkX,
                    y1 = y,
                    x2 = trunkX + cornerRadius * dir,
                    y2 = y,
                )
                // Stop 2 px shy of the avatar's outer edge so the line
                // doesn't visually touch the circle.
                lineTo(avatarEdgeX - 2f * dir, y)
            }
            drawPath(branch, color = strokeColor, style = stroke)
        }
    }
}

// MARK: - Relative-time formatter

/**
 * Arabic relative-time string ("قبل 3 دقائق", "أمس", "قبل أسبوع").
 * Mirrors iOS `RelativeDateTimeFormatter` with `Locale("ar")` — we
 * roll our own breakpoints because Android's built-in
 * `RelativeDateTimeFormatter` doesn't perfectly round-trip the iOS
 * Arabic output.
 */
private fun relativeTime(rawIso: String): String {
    val date = parseIso(rawIso) ?: return rawIso
    val now = ZonedDateTime.now(ZoneId.of("Asia/Riyadh"))
    val diff = Duration.between(date, now)
    return when {
        diff.isNegative -> "الآن"
        diff.toMinutes() < 1 -> "الآن"
        diff.toMinutes() < 60 -> "قبل ${diff.toMinutes()} دقيقة"
        diff.toHours() < 24 -> "قبل ${diff.toHours()} ساعة"
        diff.toDays() < 2 -> "أمس"
        diff.toDays() < 7 -> "قبل ${diff.toDays()} أيام"
        diff.toDays() < 14 -> "قبل أسبوع"
        diff.toDays() < 30 -> "قبل ${diff.toDays() / 7} أسابيع"
        diff.toDays() < 60 -> "قبل شهر"
        diff.toDays() < 365 -> "قبل ${diff.toDays() / 30} أشهر"
        else -> "قبل سنة"
    }
}

private fun parseIso(s: String): ZonedDateTime? {
    if (s.isBlank()) return null
    return runCatching { OffsetDateTime.parse(s).atZoneSameInstant(ZoneId.of("Asia/Riyadh")) }
        .recoverCatching { ZonedDateTime.parse(s) }
        .getOrNull()
}
