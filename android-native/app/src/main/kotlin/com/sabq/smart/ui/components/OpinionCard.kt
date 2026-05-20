package com.sabq.smart.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FormatQuote
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sabq.smart.data.Article
import com.sabq.smart.ui.theme.SabqTheme

@Composable
fun OpinionCard(
    article: Article,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clickable { onClick() }
            .padding(vertical = 6.dp),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Row(
                    modifier = Modifier
                        .clip(CircleShape)
                        .background(SabqTheme.colors.primaryEnd.copy(alpha = 0.10f))
                        .padding(horizontal = 10.dp, vertical = 5.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(5.dp),
                ) {
                    Icon(
                        imageVector = Icons.Filled.FormatQuote,
                        contentDescription = null,
                        tint = SabqTheme.colors.primaryEnd,
                        modifier = Modifier.size(11.dp),
                    )
                    Text(
                        text = "مقال رأي",
                        style = SabqTheme.typography.metaSmall.copy(
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Black,
                            letterSpacing = 0.5.sp,
                            color = SabqTheme.colors.primaryEnd,
                        ),
                    )
                }
            }

            Text(
                text = article.title,
                style = SabqTheme.typography.compactCardTitle.copy(
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Bold,
                    color = SabqTheme.colors.ink,
                    lineHeight = 24.sp,
                ),
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
            )

            if (article.excerpt.isNotBlank()) {
                Text(
                    text = article.excerpt,
                    style = SabqTheme.typography.excerpt.copy(
                        fontSize = 14.sp,
                        color = SabqTheme.colors.secondaryInk,
                        lineHeight = 21.sp,
                    ),
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }

            // Byline + reading time + date.
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                article.authorName?.takeIf { it.isNotBlank() }?.let { name ->
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.Edit,
                            contentDescription = null,
                            tint = SabqTheme.colors.primaryEnd,
                            modifier = Modifier.size(10.dp),
                        )
                        Text(
                            text = "${article.bylineLabel}: $name",
                            style = SabqTheme.typography.metaSmall.copy(
                                fontSize = 11.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = SabqTheme.colors.primaryEnd,
                            ),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f, fill = false),
                        )
                    }
                }
                Text(
                    text = "·",
                    style = SabqTheme.typography.metaSmall.copy(fontSize = 11.sp),
                    color = SabqTheme.colors.tertiaryInk.copy(alpha = 0.6f),
                )
                Text(
                    text = article.dateFormatted,
                    style = SabqTheme.typography.metaSmall.copy(
                        fontSize = 11.sp,
                        color = SabqTheme.colors.tertiaryInk,
                    ),
                    maxLines = 1,
                )
            }
        }

        // Author thumbnail / hero image.
        OpinionPortrait(article = article)
    }
}

@Composable
private fun OpinionPortrait(article: Article) {
    val shape = RoundedCornerShape(SabqTheme.dimens.thumbnailRadius)
    Box(
        modifier = Modifier
            .size(80.dp)
            .clip(shape)
            .background(SabqTheme.colors.primaryEnd.copy(alpha = 0.10f), shape),
        contentAlignment = Alignment.Center,
    ) {
        if (!article.imageUrl.isNullOrBlank()) {
            FocalCachedAsyncImage(
                url = article.imageUrl,
                focalPoint = article.focalPoint,
                modifier = Modifier.fillMaxSize(),
            )
        } else {
            Text(
                text = (article.authorName?.take(1) ?: "ك"),
                style = SabqTheme.typography.cardTitle.copy(
                    fontSize = 28.sp,
                    fontWeight = FontWeight.Bold,
                    color = SabqTheme.colors.primaryEnd,
                ),
            )
        }
    }
}
