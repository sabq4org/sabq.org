package com.sabq.smart.feature.muqtarab

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.LayersClear
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.SubcomposeAsyncImage
import com.sabq.smart.data.MuqAngle
import com.sabq.smart.data.MuqTopic
import com.sabq.smart.data.MuqWriter
import com.sabq.smart.ui.components.ArticleListSkeleton
import com.sabq.smart.ui.components.EmptyStateView
import com.sabq.smart.ui.theme.SabqTheme

/**
 * «مُقترب» topic detail — angle pill, title, writer byline, smart
 * summary, hero, HTML body, keywords, signature, related. 1:1 port of
 * iOS `MuqtarabTopicView` (`Screens/MuqtarabView.swift:636-905`).
 */
@Composable
fun MuqtarabTopicScreen(
    onBack: () -> Unit,
    onAngleClick: (slug: String) -> Unit,
    onWriterClick: (id: String) -> Unit,
    onTopicClick: (angleSlug: String, topicSlug: String) -> Unit,
    viewModel: MuqtarabTopicViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val angleSlug = viewModel.angleSlug
    val topicSlug = viewModel.topicSlug
    val theme = MuqTheme(state.angle?.colorHex)

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(SabqTheme.colors.background),
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            MuqTopBar(
                onBack = onBack,
                onShare = {
                    shareMuqtarab(
                        context,
                        "https://sabq.org/muqtarab/$angleSlug/topic/$topicSlug",
                        state.topic?.title ?: "مُقترب",
                    )
                },
            )

            when {
                state.isLoading && state.topic == null ->
                    ArticleListSkeleton(rows = 4, modifier = Modifier.padding(top = 16.dp))

                state.error != null && state.topic == null ->
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        EmptyStateView(
                            icon = Icons.Filled.LayersClear,
                            tint = SabqTheme.colors.coral,
                            title = "تعذّر التحميل",
                            subtitle = state.error!!,
                            actionTitle = "إعادة المحاولة",
                            onAction = viewModel::load,
                        )
                    }

                state.topic != null -> {
                    val topic = state.topic!!
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(horizontal = 18.dp, vertical = 14.dp),
                        verticalArrangement = Arrangement.spacedBy(18.dp),
                    ) {
                        item {
                            AnglePill(
                                angle = state.angle,
                                theme = theme,
                                onClick = { onAngleClick(angleSlug) },
                            )
                        }
                        item {
                            Text(
                                text = topic.title,
                                fontSize = 26.sp,
                                fontWeight = FontWeight.Black,
                                color = SabqTheme.colors.ink,
                                lineHeight = 34.sp,
                            )
                        }
                        item {
                            Box(
                                modifier = Modifier
                                    .width(72.dp)
                                    .height(4.dp)
                                    .clip(CircleShape)
                                    .background(theme.color),
                            )
                        }
                        item {
                            WriterByline(
                                writer = state.writer,
                                angleName = state.angle?.nameAr,
                                theme = theme,
                                onWriterClick = onWriterClick,
                            )
                        }
                        item { TopicMetaRow(topic = topic) }

                        topic.excerpt?.takeIf { it.isNotBlank() }?.let { excerpt ->
                            item { SmartSummary(excerpt = excerpt, theme = theme) }
                        }

                        muqAbsolutize(topic.heroImageUrl)?.let { hero ->
                            item {
                                val shape = RoundedCornerShape(SabqTheme.dimens.tileRadius)
                                SubcomposeAsyncImage(
                                    model = hero,
                                    contentDescription = null,
                                    contentScale = ContentScale.Crop,
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(210.dp)
                                        .clip(shape)
                                        .background(SabqTheme.colors.outline.copy(alpha = 0.4f), shape),
                                    loading = { Box(Modifier.fillMaxSize().background(SabqTheme.colors.paleFill)) },
                                    error = { Box(Modifier.fillMaxSize().background(SabqTheme.colors.paleFill)) },
                                )
                            }
                        }

                        item { TopicBody(topic = topic, accent = theme.color) }

                        if (topic.keywords.isNotEmpty()) {
                            item { KeywordsRow(keywords = topic.keywords, theme = theme) }
                        }

                        state.angle?.writerSignature?.takeIf { it.isNotBlank() }?.let { sig ->
                            item { SignatureCard(signature = sig, theme = theme) }
                        }

                        if (state.related.isNotEmpty()) {
                            item {
                                MuqSectionTitle(
                                    text = "المزيد من ${state.angle?.nameAr ?: "الزاوية"}",
                                    accent = theme.color,
                                )
                            }
                            items(
                                count = state.related.size,
                                key = { idx -> state.related[idx].id },
                            ) { idx ->
                                val related = state.related[idx]
                                MuqTopicCard(
                                    topic = related,
                                    angleColorHex = state.angle?.colorHex,
                                    onClick = { onTopicClick(angleSlug, related.slug) },
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun AnglePill(angle: MuqAngle?, theme: MuqTheme, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .clip(CircleShape)
            .background(theme.soft)
            .clickable { onClick() }
            .padding(horizontal = 12.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = muqIcon(angle?.iconKey),
            contentDescription = null,
            tint = theme.color,
            modifier = Modifier.size(12.dp),
        )
        Text(
            text = "زاوية ${angle?.nameAr ?: "مُقترب"}",
            fontSize = 12.sp,
            fontWeight = FontWeight.Black,
            color = theme.color,
        )
    }
}

@Composable
private fun WriterByline(
    writer: MuqWriter?,
    angleName: String?,
    theme: MuqTheme,
    onWriterClick: (id: String) -> Unit,
) {
    val name = writer?.name?.takeIf { it.isNotBlank() } ?: return
    val writerId = writer.id
    Row(
        modifier = Modifier.then(
            if (!writerId.isNullOrBlank()) Modifier.clickable { onWriterClick(writerId) } else Modifier,
        ),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(44.dp)
                .clip(CircleShape)
                .background(theme.soft)
                .border(2.dp, theme.border, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            val avatar = muqAbsolutize(writer.avatar)
            if (avatar != null) {
                SubcomposeAsyncImage(
                    model = avatar,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                    loading = { Box(Modifier.fillMaxSize().background(theme.soft)) },
                    error = { Text(name.take(1), fontSize = 16.sp, fontWeight = FontWeight.Black, color = theme.color) },
                )
            } else {
                Text(name.take(1), fontSize = 16.sp, fontWeight = FontWeight.Black, color = theme.color)
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(text = name, fontSize = 14.sp, fontWeight = FontWeight.Black, color = SabqTheme.colors.ink)
            Text(
                text = angleName?.let { "كاتب زاوية $it" } ?: "كاتب الزاوية",
                fontSize = 11.sp,
                fontWeight = FontWeight.Medium,
                color = SabqTheme.colors.tertiaryInk,
            )
        }
    }
}

@Composable
private fun TopicMetaRow(topic: MuqTopic) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        muqFormatDate(topic.publishedAt)?.let { date ->
            MetaLabel(icon = Icons.Filled.CalendarMonth, text = date)
        }
        MetaLabel(icon = Icons.Filled.Schedule, text = "${muqReadingMinutes(topic)} دقائق قراءة")
        if (topic.viewCount != null && topic.viewCount > 0) {
            MetaLabel(icon = Icons.Filled.Visibility, text = "${topic.viewCount} مشاهدة")
        }
    }
}

@Composable
private fun MetaLabel(icon: androidx.compose.ui.graphics.vector.ImageVector, text: String) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = SabqTheme.colors.tertiaryInk, modifier = Modifier.size(12.dp))
        Text(text = text, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = SabqTheme.colors.tertiaryInk)
    }
}

@Composable
private fun SmartSummary(excerpt: String, theme: MuqTheme) {
    val shape = RoundedCornerShape(18.dp)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(SabqTheme.colors.surface, shape)
            .border(1.5.dp, theme.color, shape)
            .padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Filled.AutoAwesome, contentDescription = null, tint = theme.color, modifier = Modifier.size(14.dp))
            Text(text = "الموجز الذكي", fontSize = 12.sp, fontWeight = FontWeight.Black, color = theme.color)
            Box(
                modifier = Modifier
                    .clip(CircleShape)
                    .background(theme.soft)
                    .padding(horizontal = 6.dp, vertical = 2.dp),
            ) {
                Text(text = "AI", fontSize = 9.sp, fontWeight = FontWeight.Black, color = theme.color)
            }
        }
        Text(
            text = excerpt,
            fontSize = 16.sp,
            color = SabqTheme.colors.ink.copy(alpha = 0.92f),
            lineHeight = 26.sp,
        )
    }
}

@Composable
private fun TopicBody(topic: MuqTopic, accent: Color) {
    val html = topic.html
    if (html.isNotEmpty()) {
        val cleaned = remember(html, topic.title, topic.excerpt) {
            muqStripDuplicateLead(html = html, title = topic.title, excerpt = topic.excerpt)
        }
        MuqContent(html = cleaned, accent = accent)
    } else if (topic.fallbackText.isNotEmpty()) {
        Text(
            text = topic.fallbackText,
            fontSize = 16.sp,
            color = SabqTheme.colors.ink.copy(alpha = 0.9f),
            lineHeight = 28.sp,
        )
    }
}

@Composable
private fun KeywordsRow(keywords: List<String>, theme: MuqTheme) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            text = "الكلمات المفتاحية",
            fontSize = 12.sp,
            fontWeight = FontWeight.Black,
            color = SabqTheme.colors.tertiaryInk,
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            keywords.forEach { tag ->
                MuqPill(text = "#$tag", tint = theme.color)
            }
        }
    }
}

@Composable
private fun SignatureCard(signature: String, theme: MuqTheme) {
    val shape = RoundedCornerShape(18.dp)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(theme.softer, shape)
            .border(0.5.dp, theme.border, shape)
            .padding(16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Box(
            modifier = Modifier
                .size(44.dp)
                .clip(CircleShape)
                .background(theme.soft),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Filled.Person, contentDescription = null, tint = theme.color, modifier = Modifier.size(18.dp))
        }
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(text = "توقيع الكاتب", fontSize = 11.sp, fontWeight = FontWeight.Black, color = theme.color)
            Text(
                text = signature,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                color = SabqTheme.colors.ink,
                lineHeight = 22.sp,
            )
        }
    }
}
