package com.sabq.smart.ui.components

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.sabq.smart.data.Article
import com.sabq.smart.ui.theme.SabqTheme

/**
 * iOS [CompactArticleRow] classic layout (SabqComponents.swift,
 * `NewsRowStyle`): العنوان 16 متوسط في ثلاثة أسطر وتحته شارة القسم ووقت
 * النشر على الطرف القائد، والمصغّرة 104×78 بزوايا 8 وإطار رفيع على الطرف
 * الآخر. الحفظ بالضغط المطوّل كقائمة السياق في iOS.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun CompactArticleRow(
    article: Article,
    isBookmarked: Boolean,
    onBookmark: () -> Unit,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    /** صفحة التصنيف تسمّي القسم في رأسها فلا تكرره البطاقات (#1642). */
    showsCategory: Boolean = true,
) {
    val haptics = rememberSabqHaptics()
    val thumbShape = RoundedCornerShape(SabqTheme.dimens.thumbnailRadius)
    val bookmarkLabel = if (isBookmarked) "إزالة من المحفوظات" else "حفظ المقال"

    Row(
        modifier = modifier
            .combinedClickable(
                onClick = onClick,
                onLongClick = {
                    haptics.light()
                    onBookmark()
                },
                onLongClickLabel = bookmarkLabel,
            )
            .semantics {
                customActions = listOf(
                    CustomAccessibilityAction(bookmarkLabel) { onBookmark(); true },
                )
            }
            .padding(vertical = 16.dp),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = article.title,
                style = SabqTheme.typography.compactCardTitle,
                color = SabqTheme.colors.ink,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
            )

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                if (showsCategory) {
                    SabqCategoryPill(title = article.categoryLabel.ifBlank { article.category.title })
                }
                if (article.isBreaking) BreakingPill()
                Text(
                    text = article.dateFormatted,
                    style = SabqTheme.typography.metaSmall,
                    color = SabqTheme.colors.tertiaryInk,
                    maxLines = 1,
                )
            }
        }

        Box(
            modifier = Modifier
                .size(width = SabqTheme.dimens.rowThumbWidth, height = SabqTheme.dimens.rowThumbHeight)
                .clip(thumbShape)
                .background(SabqTheme.colors.paleFill)
                .border(0.75.dp, SabqTheme.colors.separator, thumbShape),
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
                    tint = SabqTheme.colors.tertiaryInk.copy(alpha = 0.5f),
                    modifier = Modifier
                        .size(26.dp)
                        .align(Alignment.Center),
                )
            }

            if (article.isAiGeneratedImage) {
                AIImageBadge(
                    model = article.aiImageModel,
                    sizeScale = 0.65f,
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(4.dp),
                )
            }
        }
    }
}
