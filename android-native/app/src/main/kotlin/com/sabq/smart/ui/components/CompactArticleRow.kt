package com.sabq.smart.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.sabq.smart.data.Article
import com.sabq.smart.ui.theme.SabqTheme

/**
 * iOS [CompactArticleRow] (SabqComponents.swift line 1288-1479).
 * Classic variant only — the spacious 16:10 variant is opt-in via the
 * DataStore `"homeCardStyle"` pref and was rolled back as default
 * (too vertically heavy for dense feeds). Spacious lands later.
 */
@Composable
fun CompactArticleRow(
    article: Article,
    isBookmarked: Boolean,
    onBookmark: () -> Unit,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val haptics = rememberSabqHaptics()
    val thumbShape = RoundedCornerShape(SabqTheme.dimens.thumbnailRadius)

    Row(
        modifier = modifier
            .clickable { onClick() }
            .padding(vertical = 6.dp),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        // Text column on the LEADING edge (right in RTL, matching iOS
        // HStack iteration order under .sabqRTL()).
        androidx.compose.foundation.layout.Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StatusChip(title = article.category.title, tint = article.category.tint())
                if (article.isBreaking) BreakingPill()
            }

            Text(
                text = article.title,
                style = SabqTheme.typography.compactCardTitle,
                color = SabqTheme.colors.ink,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )

            metadataRow(article = article, isBookmarked = isBookmarked) {
                haptics.light()
                onBookmark()
            }
        }

        // Thumbnail on the trailing edge (left in RTL).
        Box(
            modifier = Modifier
                .size(SabqTheme.dimens.thumbnailSize)
                .clip(thumbShape)
                .background(
                    Brush.linearGradient(
                        listOf(
                            article.category.tint().copy(alpha = 0.12f),
                            article.category.tint().copy(alpha = 0.04f),
                        ),
                    ),
                ),
        ) {
            if (!article.imageUrl.isNullOrBlank()) {
                FocalCachedAsyncImage(
                    url = article.imageUrl,
                    focalPoint = article.focalPoint,
                    modifier = Modifier.fillMaxSize(),
                )
            } else {
                Icon(
                    imageVector = article.category.icon,
                    contentDescription = null,
                    tint = article.category.tint().copy(alpha = 0.6f),
                    modifier = Modifier
                        .size(28.dp)
                        .align(Alignment.Center),
                )
            }
        }
    }
}

@Composable
private fun metadataRow(
    article: Article,
    isBookmarked: Boolean,
    onBookmark: () -> Unit,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Icon(
                imageVector = Icons.Outlined.Schedule,
                contentDescription = null,
                tint = SabqTheme.colors.tertiaryInk,
                modifier = Modifier.size(11.dp),
            )
            Text(
                text = article.readingTime,
                style = SabqTheme.typography.metaSmall,
                color = SabqTheme.colors.tertiaryInk,
            )
        }
        Text(
            text = article.dateFormatted,
            style = SabqTheme.typography.metaSmall,
            color = SabqTheme.colors.tertiaryInk,
        )

        Spacer(modifier = Modifier.weight(1f))

        // 32 dp invisible-padding tap target wrapping the 16 dp glyph.
        // The raw icon was only 16 dp clickable — well below the 48 dp
        // Material guideline. The wrapper keeps the visual unchanged
        // while giving thumbs a fair tap zone, and circular-clips the
        // ripple so feedback hugs the glyph.
        Box(
            modifier = Modifier
                .size(32.dp)
                .clip(CircleShape)
                .clickable { onBookmark() },
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = if (isBookmarked) Icons.Filled.Bookmark else Icons.Outlined.BookmarkBorder,
                contentDescription = if (isBookmarked) "إزالة من المحفوظات" else "حفظ المقال",
                tint = if (isBookmarked) SabqTheme.colors.primaryEnd else SabqTheme.colors.tertiaryInk,
                modifier = Modifier.size(16.dp),
            )
        }
    }
}

@Suppress("unused")
private val _iconMarker = Icons.Filled.CalendarMonth
@Suppress("unused")
private val _spacerMarker: @Composable () -> Unit = { Spacer(Modifier.width(0.dp)) }
@Suppress("unused")
private val _contentScaleMarker = ContentScale.Crop
