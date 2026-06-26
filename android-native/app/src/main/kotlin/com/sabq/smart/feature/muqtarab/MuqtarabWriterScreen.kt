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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.PersonOff
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.SubcomposeAsyncImage
import com.sabq.smart.data.MuqWriterProfile
import com.sabq.smart.ui.components.ArticleListSkeleton
import com.sabq.smart.ui.components.EmptyStateView
import com.sabq.smart.ui.theme.SabqTheme

/**
 * «مُقترب» writer profile — hero (avatar + bio + angle chips) + their
 * published topics. 1:1 port of iOS `MuqtarabWriterView`
 * (`Screens/MuqtarabView.swift:909-1090`).
 */
@Composable
fun MuqtarabWriterScreen(
    onBack: () -> Unit,
    onAngleClick: (slug: String) -> Unit,
    onTopicClick: (angleSlug: String, topicSlug: String) -> Unit,
    viewModel: MuqtarabWriterViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val theme = MuqTheme(state.profile?.angles?.firstOrNull()?.colorHex)

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(SabqTheme.colors.background),
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            MuqTopBar(onBack = onBack)

            when {
                state.isLoading && state.profile == null ->
                    ArticleListSkeleton(rows = 4, modifier = Modifier.padding(top = 16.dp))

                state.error != null && state.profile == null ->
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        EmptyStateView(
                            icon = Icons.Filled.PersonOff,
                            tint = SabqTheme.colors.coral,
                            title = "الكاتب غير موجود",
                            subtitle = state.error!!,
                            actionTitle = "إعادة المحاولة",
                            onAction = viewModel::load,
                        )
                    }

                state.profile != null -> {
                    val profile = state.profile!!
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(bottom = 60.dp),
                        verticalArrangement = Arrangement.spacedBy(18.dp),
                    ) {
                        item { WriterHero(profile = profile, theme = theme, onAngleClick = onAngleClick) }

                        item {
                            Row(
                                modifier = Modifier.padding(horizontal = 18.dp),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(
                                    text = "مواضيع الكاتب",
                                    fontSize = 18.sp,
                                    fontWeight = FontWeight.Black,
                                    color = SabqTheme.colors.ink,
                                )
                                Box(
                                    modifier = Modifier
                                        .clip(CircleShape)
                                        .background(theme.soft)
                                        .padding(horizontal = 8.dp, vertical = 2.dp),
                                ) {
                                    Text(
                                        text = profile.topics.size.toString(),
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Black,
                                        color = theme.color,
                                    )
                                }
                            }
                        }

                        if (profile.topics.isEmpty()) {
                            item {
                                Box(Modifier.fillMaxWidth().padding(18.dp), contentAlignment = Alignment.Center) {
                                    EmptyStateView(
                                        icon = Icons.Filled.Description,
                                        tint = theme.color,
                                        title = "لا مواضيع بعد",
                                        subtitle = "لم ينشر هذا الكاتب مواضيع حتى الآن.",
                                    )
                                }
                            }
                        } else {
                            items(
                                count = profile.topics.size,
                                key = { idx -> profile.topics[idx].id },
                            ) { idx ->
                                val topic = profile.topics[idx]
                                Box(modifier = Modifier.padding(horizontal = 18.dp)) {
                                    WriterTopicCard(
                                        topic = topic,
                                        onClick = { onTopicClick(topic.angleSlug, topic.slug) },
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun WriterHero(
    profile: MuqWriterProfile,
    theme: MuqTheme,
    onAngleClick: (slug: String) -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(theme.gradient())
            .padding(vertical = 28.dp, horizontal = 18.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            modifier = Modifier
                .size(96.dp)
                .clip(CircleShape)
                .background(Color.White.copy(alpha = 0.2f))
                .border(3.dp, Color.White.copy(alpha = 0.45f), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            val avatar = muqAbsolutize(profile.writer.avatar)
            if (avatar != null) {
                SubcomposeAsyncImage(
                    model = avatar,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                    loading = { Box(Modifier.fillMaxSize().background(Color.White.copy(alpha = 0.2f))) },
                    error = {
                        Text(profile.writer.name.take(1), fontSize = 36.sp, fontWeight = FontWeight.Black, color = Color.White)
                    },
                )
            } else {
                Text(profile.writer.name.take(1), fontSize = 36.sp, fontWeight = FontWeight.Black, color = Color.White)
            }
        }

        Text(text = profile.writer.name, fontSize = 24.sp, fontWeight = FontWeight.Black, color = Color.White)
        Text(text = "كاتب في مُقترب", fontSize = 12.sp, fontWeight = FontWeight.Medium, color = Color.White.copy(alpha = 0.8f))

        profile.writer.bio?.takeIf { it.isNotBlank() }?.let { bio ->
            Text(
                text = bio,
                fontSize = 14.sp,
                color = Color.White.copy(alpha = 0.92f),
                textAlign = TextAlign.Center,
                lineHeight = 20.sp,
                modifier = Modifier.padding(horizontal = 8.dp),
            )
        }

        if (profile.angles.isNotEmpty()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                profile.angles.forEach { angle ->
                    Row(
                        modifier = Modifier
                            .clip(CircleShape)
                            .background(Color.White.copy(alpha = 0.18f))
                            .clickable { onAngleClick(angle.slug) }
                            .padding(horizontal = 12.dp, vertical = 7.dp),
                        horizontalArrangement = Arrangement.spacedBy(5.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            imageVector = muqIcon(angle.iconKey),
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(11.dp),
                        )
                        Text(text = angle.nameAr, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Color.White)
                    }
                }
            }
        }
    }
}

@Composable
private fun WriterTopicCard(
    topic: com.sabq.smart.data.MuqWriterTopic,
    onClick: () -> Unit,
) {
    val theme = MuqTheme(topic.colorHex)
    val shape = androidx.compose.foundation.shape.RoundedCornerShape(SabqTheme.dimens.tileRadius)
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
            MuqPill(text = topic.angleName, tint = theme.color)
            Text(
                text = topic.title,
                fontSize = 16.sp,
                fontWeight = FontWeight.Black,
                color = SabqTheme.colors.ink,
                maxLines = 2,
                lineHeight = 22.sp,
            )
            topic.excerpt?.takeIf { it.isNotBlank() }?.let { excerpt ->
                Text(
                    text = excerpt,
                    fontSize = 12.sp,
                    color = SabqTheme.colors.secondaryInk,
                    maxLines = 2,
                )
            }
            MuqMetaRow(publishedAt = topic.publishedAt, viewCount = topic.viewCount)
        }

        muqAbsolutize(topic.heroImageUrl)?.let { hero ->
            val imgShape = androidx.compose.foundation.shape.RoundedCornerShape(14.dp)
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
