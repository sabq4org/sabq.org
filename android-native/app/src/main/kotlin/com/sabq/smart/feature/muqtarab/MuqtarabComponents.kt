package com.sabq.smart.feature.muqtarab

import android.content.Intent
import android.net.Uri
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
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.ClickableText
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.SubcomposeAsyncImage
import com.sabq.smart.data.MuqTopic
import com.sabq.smart.ui.components.TwitterEmbedView
import com.sabq.smart.ui.theme.SabqTheme
import com.sabq.smart.util.BlockNode
import com.sabq.smart.util.HtmlSimpleParser
import com.sabq.smart.util.InlineRun

// ── Top bar (back chevron + optional share) ──────────────────────────

@Composable
fun MuqTopBar(
    onBack: () -> Unit,
    onShare: (() -> Unit)? = null,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        MuqCircleButton(icon = Icons.AutoMirrored.Filled.ArrowForward, contentDescription = "رجوع", onClick = onBack)
        Spacer(modifier = Modifier.weight(1f))
        if (onShare != null) {
            MuqCircleButton(icon = Icons.Filled.Share, contentDescription = "مشاركة", onClick = onShare)
        }
    }
}

@Composable
private fun MuqCircleButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .size(40.dp)
            .clip(CircleShape)
            .background(SabqTheme.colors.surface.copy(alpha = 0.92f))
            .clickable { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            tint = SabqTheme.colors.ink,
            modifier = Modifier.size(18.dp),
        )
    }
}

// ── Angle card (cover/colour + icon + name + writer) ─────────────────

@Composable
fun MuqAngleCard(angle: com.sabq.smart.data.MuqAngle, onClick: () -> Unit) {
    val theme = MuqTheme(angle.colorHex)
    val shape = RoundedCornerShape(18.dp)
    Column(
        modifier = Modifier
            .width(168.dp)
            .height(154.dp)
            .clip(shape)
            .background(SabqTheme.colors.surface, shape)
            .border(0.5.dp, theme.border, shape)
            .clickable { onClick() },
    ) {
        Box(
            modifier = Modifier
                .width(168.dp)
                .height(96.dp),
            contentAlignment = Alignment.Center,
        ) {
            val cover = muqAbsolutize(angle.coverImageUrl)
            if (cover != null) {
                SubcomposeAsyncImage(
                    model = cover,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                    loading = { Box(Modifier.fillMaxSize().background(theme.gradient())) },
                    error = { Box(Modifier.fillMaxSize().background(theme.gradient())) },
                )
            } else {
                Box(Modifier.fillMaxSize().background(theme.gradient()))
            }
            Icon(
                imageVector = muqIcon(angle.iconKey),
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(28.dp),
            )
        }
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                text = angle.nameAr,
                fontSize = 15.sp,
                fontWeight = FontWeight.Black,
                color = SabqTheme.colors.ink,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            val writer = angle.writerName?.takeIf { it.isNotBlank() }
            if (writer != null) {
                Text(
                    text = writer,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = SabqTheme.colors.secondaryInk,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            } else if (angle.topicCount != null) {
                Text(
                    text = "${angle.topicCount} موضوعًا",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = SabqTheme.colors.tertiaryInk,
                )
            }
        }
    }
}

// ── Topic card (vertical list row) ───────────────────────────────────

@Composable
fun MuqTopicCard(
    topic: MuqTopic,
    showAnglePill: Boolean = false,
    angleColorHex: String? = null,
    onClick: () -> Unit,
) {
    val theme = MuqTheme(angleColorHex ?: topic.angle?.colorHex)
    val shape = RoundedCornerShape(SabqTheme.dimens.tileRadius)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(SabqTheme.colors.surface, shape)
            .border(0.5.dp, theme.border, shape)
            .clickable { onClick() }
            .padding(14.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (showAnglePill) {
                topic.angle?.name?.takeIf { it.isNotBlank() }?.let { name ->
                    MuqPill(text = name, tint = theme.color)
                }
            }
            Text(
                text = topic.title,
                fontSize = 16.sp,
                fontWeight = FontWeight.Black,
                color = SabqTheme.colors.ink,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                lineHeight = 22.sp,
            )
            topic.excerpt?.takeIf { it.isNotBlank() }?.let { excerpt ->
                Text(
                    text = excerpt,
                    fontSize = 12.sp,
                    color = SabqTheme.colors.secondaryInk,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            MuqMetaRow(publishedAt = topic.publishedAt, viewCount = topic.viewCount)
        }

        val hero = muqAbsolutize(topic.heroImageUrl)
        if (hero != null) {
            val imgShape = RoundedCornerShape(14.dp)
            SubcomposeAsyncImage(
                model = hero,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .size(88.dp)
                    .clip(imgShape)
                    .background(SabqTheme.colors.outline.copy(alpha = 0.4f), imgShape),
                loading = { Box(Modifier.fillMaxSize().background(SabqTheme.colors.outline.copy(alpha = 0.4f))) },
                error = { Box(Modifier.fillMaxSize().background(SabqTheme.colors.outline.copy(alpha = 0.4f))) },
            )
        }
    }
}

@Composable
fun MuqPill(text: String, tint: Color) {
    Box(
        modifier = Modifier
            .clip(CircleShape)
            .background(tint.copy(alpha = 0.12f))
            .padding(horizontal = 8.dp, vertical = 3.dp),
    ) {
        Text(
            text = text,
            fontSize = 10.sp,
            fontWeight = FontWeight.Black,
            color = tint,
        )
    }
}

@Composable
fun MuqMetaRow(publishedAt: String?, viewCount: Int?) {
    val date = muqFormatDate(publishedAt)
    if (date == null && (viewCount == null || viewCount <= 0)) return
    Row(
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (date != null) {
            MuqMetaItem(icon = Icons.Filled.CalendarMonth, text = date)
        }
        if (viewCount != null && viewCount > 0) {
            MuqMetaItem(icon = Icons.Filled.Visibility, text = viewCount.toString())
        }
    }
}

@Composable
private fun MuqMetaItem(icon: androidx.compose.ui.graphics.vector.ImageVector, text: String) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = SabqTheme.colors.tertiaryInk,
            modifier = Modifier.size(12.dp),
        )
        Text(
            text = text,
            fontSize = 10.sp,
            fontWeight = FontWeight.SemiBold,
            color = SabqTheme.colors.tertiaryInk,
        )
    }
}

// ── HTML body renderer ───────────────────────────────────────────────

/**
 * Renders a topic's TipTap HTML body using the shared [HtmlSimpleParser].
 * Covers the block kinds Muqtarab essays use (headings, paragraphs,
 * lists, quotes, images, dividers, tweets). Mirrors the iOS
 * `ArticleContentView` reuse in `MuqtarabTopicView`.
 */
@Composable
fun MuqContent(html: String, accent: Color) {
    val blocks = remember(html) { HtmlSimpleParser.parse(html) }
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        blocks.forEach { block -> MuqBlock(block = block, accent = accent) }
    }
}

@Composable
private fun MuqBlock(block: BlockNode, accent: Color) {
    when (block) {
        is BlockNode.Heading -> {
            val size = when (block.level) {
                1 -> 24
                2 -> 21
                3 -> 19
                else -> 17
            }
            Text(
                text = block.runs.toAnnotated(SabqTheme.colors.ink),
                fontSize = size.sp,
                fontWeight = FontWeight.Black,
                color = SabqTheme.colors.ink,
                lineHeight = (size + 8).sp,
            )
        }
        is BlockNode.Paragraph -> {
            MuqInlineText(runs = block.runs)
        }
        is BlockNode.ListBlock -> {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                block.items.forEachIndexed { idx, runs ->
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(
                            text = if (block.ordered) "${idx + 1}." else "•",
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold,
                            color = accent,
                            modifier = Modifier.width(20.dp),
                        )
                        MuqInlineText(runs = runs, modifier = Modifier.weight(1f))
                    }
                }
            }
        }
        is BlockNode.Blockquote -> {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(accent.copy(alpha = 0.06f))
                    .padding(14.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Box(
                    modifier = Modifier
                        .width(3.dp)
                        .height(20.dp)
                        .clip(CircleShape)
                        .background(accent),
                )
                MuqInlineText(runs = block.runs, italic = true, modifier = Modifier.weight(1f))
            }
        }
        is BlockNode.Image -> {
            val url = muqAbsolutize(block.url)
            if (url != null) {
                val shape = RoundedCornerShape(SabqTheme.dimens.tileRadius)
                SubcomposeAsyncImage(
                    model = url,
                    contentDescription = block.alt,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(shape)
                        .background(SabqTheme.colors.paleFill, shape),
                    loading = {
                        Box(Modifier.fillMaxWidth().height(200.dp).background(SabqTheme.colors.paleFill))
                    },
                    error = { Box(Modifier.size(0.dp)) },
                )
            }
        }
        is BlockNode.ImageGallery -> {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                block.images.forEach { img ->
                    muqAbsolutize(img.url)?.let { url ->
                        val shape = RoundedCornerShape(SabqTheme.dimens.tileRadius)
                        SubcomposeAsyncImage(
                            model = url,
                            contentDescription = img.caption,
                            contentScale = ContentScale.Fit,
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(shape)
                                .background(SabqTheme.colors.paleFill, shape),
                            loading = {
                                Box(Modifier.fillMaxWidth().height(200.dp).background(SabqTheme.colors.paleFill))
                            },
                            error = { Box(Modifier.size(0.dp)) },
                        )
                    }
                }
            }
        }
        is BlockNode.TwitterEmbed -> {
            TwitterEmbedView(tweetUrl = block.tweetUrl)
        }
        is BlockNode.VideoEmbed -> {
            MuqLinkCard(label = "مشاهدة الفيديو", url = block.sourceUrl ?: block.embedUrl, accent = accent)
        }
        is BlockNode.WhatsAppCta -> {
            MuqLinkCard(label = block.phrase, url = block.url, accent = Color(0xFF25D366))
        }
        BlockNode.Divider -> {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(1.dp)
                    .background(SabqTheme.colors.outline),
            )
        }
    }
}

@Composable
private fun MuqLinkCard(label: String, url: String, accent: Color) {
    val context = LocalContext.current
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(accent.copy(alpha = 0.10f))
            .clickable {
                runCatching {
                    context.startActivity(
                        Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        },
                    )
                }
            }
            .padding(16.dp),
    ) {
        Text(text = label, fontSize = 14.sp, fontWeight = FontWeight.Bold, color = accent)
    }
}

@Composable
private fun MuqInlineText(
    runs: List<InlineRun>,
    italic: Boolean = false,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val baseColor = SabqTheme.colors.ink.copy(alpha = 0.92f)
    val annotated = runs.toAnnotated(baseColor)
    ClickableText(
        text = annotated,
        modifier = modifier,
        style = TextStyle(
            fontSize = 16.sp,
            lineHeight = 28.sp,
            color = baseColor,
            fontStyle = if (italic) FontStyle.Italic else FontStyle.Normal,
        ),
        onClick = { offset ->
            annotated.getStringAnnotations(tag = "URL", start = offset, end = offset)
                .firstOrNull()?.let { annotation ->
                    runCatching {
                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(annotation.item)))
                    }
                }
        },
    )
}

private fun List<InlineRun>.toAnnotated(linkBase: Color): AnnotatedString = buildAnnotatedString {
    this@toAnnotated.forEach { run ->
        val decorations = mutableListOf<TextDecoration>()
        if (run.underline) decorations.add(TextDecoration.Underline)
        if (run.strikethrough) decorations.add(TextDecoration.LineThrough)
        val color = run.colorHex?.let { muqColorFromHex(it) }
            ?: if (run.link != null) linkBase else Color.Unspecified
        val style = SpanStyle(
            fontWeight = if (run.bold) FontWeight.Bold else null,
            fontStyle = if (run.italic) FontStyle.Italic else null,
            textDecoration = if (decorations.isNotEmpty()) TextDecoration.combine(decorations) else null,
            color = color,
        )
        if (run.link != null) {
            pushStringAnnotation(tag = "URL", annotation = run.link!!)
        }
        withStyle(style) { append(run.text) }
        if (run.link != null) {
            pop()
        }
    }
}
