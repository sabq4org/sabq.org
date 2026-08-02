package com.sabq.smart.feature.lite

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
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
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sabq.smart.data.Article
import com.sabq.smart.ui.components.FocalCachedAsyncImage
import com.sabq.smart.ui.components.StatusChip
import com.sabq.smart.ui.theme.SabqTheme
import com.sabq.smart.util.BlockNode
import com.sabq.smart.util.HtmlSimpleParser
import com.sabq.smart.util.formatRelativeDateAr

/**
 * جسد المقال في وضع Lite — نقل iOS `ArticleLiteView`: شارة القسم +
 * التاريخ النسبي، العنوان، صورة واحدة، ثم نص فقط. بلا تعليقات ولا
 * مرتبط ولا تفاعلات ولا صوت — المنسّق يضعه بديلاً عن ArticleBody
 * داخل ArticleDetailScreen عندما يكون Lite نشطاً.
 */
@Composable
fun ArticleLiteContent(
    article: Article,
    fontSize: Float,
    lineSpacing: Float,
    useSerif: Boolean,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    // التحليل مرة واحدة لكل جسد — لا يعاد مع كل recomposition.
    val blocks = remember(article.id, article.body) { HtmlSimpleParser.parse(article.body) }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(SabqTheme.colors.surface)
            .verticalScroll(rememberScrollState())
            .statusBarsPadding()
            .padding(bottom = SabqTheme.dimens.tabBarSafeArea),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        // شريط علوي بسيط: رجوع + وسم Lite + مشاركة.
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            LiteToolbarIcon(
                icon = Icons.AutoMirrored.Filled.ArrowForward,
                contentDescription = "رجوع",
                onClick = onBack,
            )
            Spacer(modifier = Modifier.weight(1f))
            Icon(
                imageVector = Icons.Filled.Bolt,
                contentDescription = null,
                tint = SabqTheme.colors.primaryEnd,
                modifier = Modifier.size(16.dp),
            )
            Spacer(modifier = Modifier.weight(1f))
            LiteToolbarIcon(
                icon = Icons.Outlined.Share,
                contentDescription = "مشاركة",
                onClick = { shareLite(context, article) },
            )
        }

        // شارة القسم + التاريخ النسبي.
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            StatusChip(
                title = article.categoryLabel.ifBlank { article.category.title },
                tint = article.category.tint(),
                compact = true,
            )
            Text(
                text = formatRelativeDateAr(article.publishedAtIso)
                    .ifBlank { article.dateFormatted },
                style = SabqTheme.typography.metaSmall,
                color = SabqTheme.colors.tertiaryInk,
            )
        }

        Text(
            text = article.title,
            style = SabqTheme.typography.articleDetailTitle,
            color = SabqTheme.colors.ink,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp),
        )

        // صورة واحدة فقط — 16:10 كما iOS.
        if (!article.imageUrl.isNullOrBlank()) {
            FocalCachedAsyncImage(
                url = article.imageUrl,
                focalPoint = article.focalPoint,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp)
                    .aspectRatio(16f / 10f)
                    .clip(RoundedCornerShape(SabqTheme.dimens.mediaCardRadius)),
            )
        }

        // نص فقط — الصور الداخلية والتضمينات تُتجاهل عمداً.
        blocks.forEach { block -> LiteBlock(block, fontSize, lineSpacing, useSerif) }

        // خلاصة النص غير المتوفر (مقالات ما قبل الترطيب): الموجز.
        if (blocks.isEmpty() && article.excerpt.isNotBlank()) {
            LiteBodyText(article.excerpt, fontSize, lineSpacing, useSerif)
        }
    }
}

@Composable
private fun LiteBlock(
    block: BlockNode,
    fontSize: Float,
    lineSpacing: Float,
    useSerif: Boolean,
) {
    when (block) {
        is BlockNode.Heading -> Text(
            text = block.runs.joinToString("") { it.text },
            fontSize = (fontSize + 3).sp,
            lineHeight = (fontSize + lineSpacing + 6).sp,
            fontWeight = FontWeight.Black,
            fontFamily = if (useSerif) FontFamily.Serif else FontFamily.Default,
            color = SabqTheme.colors.ink,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp),
        )
        is BlockNode.Paragraph ->
            LiteBodyText(block.runs.joinToString("") { it.text }, fontSize, lineSpacing, useSerif)
        is BlockNode.ListBlock -> Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            block.items.forEachIndexed { idx, runs ->
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = if (block.ordered) "${idx + 1}." else "•",
                        fontSize = fontSize.sp,
                        fontWeight = FontWeight.Bold,
                        color = SabqTheme.colors.primaryEnd,
                    )
                    Text(
                        text = runs.joinToString("") { it.text },
                        fontSize = fontSize.sp,
                        lineHeight = (fontSize + lineSpacing + 3).sp,
                        fontFamily = if (useSerif) FontFamily.Serif else FontFamily.Default,
                        color = SabqTheme.colors.ink.copy(alpha = 0.92f),
                    )
                }
            }
        }
        is BlockNode.Blockquote -> Text(
            text = block.runs.joinToString("") { it.text },
            fontSize = fontSize.sp,
            lineHeight = (fontSize + lineSpacing + 3).sp,
            fontStyle = FontStyle.Italic,
            fontFamily = if (useSerif) FontFamily.Serif else FontFamily.Default,
            color = SabqTheme.colors.secondaryInk,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(SabqTheme.colors.paleFill)
                .padding(14.dp),
        )
        // صور/معارض/تضمينات/فيديو/واتساب/فواصل — خارج نطاق Lite.
        else -> Unit
    }
}

@Composable
private fun LiteBodyText(
    text: String,
    fontSize: Float,
    lineSpacing: Float,
    useSerif: Boolean,
) {
    Text(
        text = text,
        fontSize = fontSize.sp,
        lineHeight = (fontSize + lineSpacing + 3).sp,
        fontFamily = if (useSerif) FontFamily.Serif else FontFamily.Default,
        color = SabqTheme.colors.ink.copy(alpha = 0.92f),
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp),
    )
}

@Composable
private fun LiteToolbarIcon(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .size(38.dp)
            .clip(CircleShape)
            .background(SabqTheme.colors.paleFill)
            .clickable { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            tint = SabqTheme.colors.ink,
            modifier = Modifier.size(17.dp),
        )
    }
}

private fun shareLite(context: android.content.Context, article: Article) {
    val url = article.articleUrl
        ?: "https://sabq.org/article/${article.slug ?: article.id}"
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, "${article.title}\n$url")
    }
    context.startActivity(Intent.createChooser(intent, "مشاركة الخبر"))
}
