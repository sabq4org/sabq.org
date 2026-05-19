package com.sabq.smart.ui.components

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
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.sabq.smart.data.Article
import com.sabq.smart.ui.theme.SabqTheme

/**
 * iOS [FeaturedArticleCard] (SabqComponents.swift line 1130-1284).
 * Hero 200dp + title + excerpt + meta row. The image area uses a
 * fixed-size Box (`Color.clear → .overlay(FocalCachedAsyncImage)` in
 * iOS) — this is what keeps long Arabic titles from bleeding past the
 * carousel page's right edge in RTL.
 *
 * Compose equivalent: the outer `Column` is `fillMaxWidth`, and the
 * hero `Box` has a fixed `height(200.dp)` + `fillMaxWidth` so its size
 * is parent-driven, not image-driven. The image is painted via
 * [FocalCachedAsyncImage] which clips internally.
 */
@Composable
fun FeaturedArticleCard(
    article: Article,
    isBookmarked: Boolean,
    onBookmark: () -> Unit,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val haptics = rememberSabqHaptics()
    val shape = RoundedCornerShape(SabqTheme.dimens.cardRadius)
    val heroShape = RoundedCornerShape(
        topStart = SabqTheme.dimens.cardRadius,
        topEnd = SabqTheme.dimens.cardRadius,
        bottomStart = 0.dp,
        bottomEnd = 0.dp,
    )

    Column(
        modifier = modifier
            .fillMaxWidth()
            .shadow(
                elevation = 10.dp,
                shape = shape,
                ambientColor = SabqTheme.colors.shadow,
                spotColor = SabqTheme.colors.deepShadow,
            )
            .clip(shape)
            .background(SabqTheme.colors.surface, shape)
            .border(BorderStroke(0.5.dp, SabqTheme.colors.outline.copy(alpha = 0.5f)), shape)
            .clickable { onClick() },
    ) {
        // Hero — fixed 200dp height, parent-width driven.
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(SabqTheme.dimens.heroImageHeight)
                .clip(heroShape)
                .background(
                    Brush.linearGradient(
                        listOf(
                            article.category.tint().copy(alpha = 0.15f),
                            article.category.tint().copy(alpha = 0.05f),
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
                    tint = article.category.tint().copy(alpha = 0.15f),
                    modifier = Modifier
                        .size(80.dp)
                        .align(Alignment.Center),
                )
            }
        }

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(SabqTheme.dimens.cardPadding),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = article.title,
                style = SabqTheme.typography.featuredCardTitle,
                color = SabqTheme.colors.ink,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = article.excerpt,
                style = SabqTheme.typography.excerpt,
                color = SabqTheme.colors.secondaryInk,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(5.dp),
                ) {
                    Icon(
                        imageVector = Icons.Outlined.Schedule,
                        contentDescription = null,
                        tint = SabqTheme.colors.tertiaryInk,
                        modifier = Modifier.size(12.dp),
                    )
                    Text(
                        text = article.readingTime,
                        style = SabqTheme.typography.meta,
                        color = SabqTheme.colors.tertiaryInk,
                    )
                }
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(5.dp),
                ) {
                    Icon(
                        imageVector = Icons.Outlined.CalendarMonth,
                        contentDescription = null,
                        tint = SabqTheme.colors.tertiaryInk,
                        modifier = Modifier.size(12.dp),
                    )
                    Text(
                        text = article.dateFormatted,
                        style = SabqTheme.typography.meta,
                        color = SabqTheme.colors.tertiaryInk,
                    )
                }
                Spacer(modifier = Modifier.weight(1f))
                Icon(
                    imageVector = if (isBookmarked) Icons.Filled.Bookmark else Icons.Outlined.BookmarkBorder,
                    contentDescription = null,
                    tint = if (isBookmarked) SabqTheme.colors.primaryEnd else SabqTheme.colors.tertiaryInk,
                    modifier = Modifier
                        .size(20.dp)
                        .clickable {
                            haptics.light()
                            onBookmark()
                        },
                )
            }
        }
    }
}
