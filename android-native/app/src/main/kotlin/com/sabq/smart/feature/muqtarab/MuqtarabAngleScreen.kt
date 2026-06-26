package com.sabq.smart.feature.muqtarab

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.LayersClear
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
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
import com.sabq.smart.data.MuqWriter
import com.sabq.smart.ui.components.ArticleListSkeleton
import com.sabq.smart.ui.components.EmptyStateView
import com.sabq.smart.ui.theme.SabqTheme

/**
 * «مُقترب» angle page — cover hero + writer + the angle's topics.
 * 1:1 port of iOS `MuqtarabAngleView`
 * (`Screens/MuqtarabView.swift:450-632`).
 */
@Composable
fun MuqtarabAngleScreen(
    onBack: () -> Unit,
    onTopicClick: (angleSlug: String, topicSlug: String) -> Unit,
    onWriterClick: (id: String) -> Unit,
    viewModel: MuqtarabAngleViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val slug = viewModel.slug
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
                    shareMuqtarab(context, "https://sabq.org/muqtarab/$slug", state.angle?.nameAr ?: "مُقترب")
                },
            )

            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(bottom = 60.dp),
                verticalArrangement = Arrangement.spacedBy(18.dp),
            ) {
                item {
                    AngleHero(
                        angle = state.angle,
                        writer = state.writer,
                        topicCount = state.topics.size,
                        theme = theme,
                        onWriterClick = onWriterClick,
                    )
                }

                when {
                    state.isLoading && state.topics.isEmpty() -> item {
                        ArticleListSkeleton(rows = 3)
                    }
                    state.error != null && state.topics.isEmpty() -> item {
                        Box(Modifier.fillMaxWidth().padding(18.dp), contentAlignment = Alignment.Center) {
                            EmptyStateView(
                                icon = Icons.Filled.LayersClear,
                                tint = SabqTheme.colors.coral,
                                title = "تعذّر التحميل",
                                subtitle = state.error!!,
                                actionTitle = "إعادة المحاولة",
                                onAction = viewModel::load,
                            )
                        }
                    }
                    state.topics.isEmpty() -> item {
                        Box(Modifier.fillMaxWidth().padding(18.dp), contentAlignment = Alignment.Center) {
                            EmptyStateView(
                                icon = Icons.Filled.Description,
                                tint = theme.color,
                                title = "لا توجد مواضيع منشورة",
                                subtitle = "لم ينشر كاتب هذه الزاوية مواضيع بعد.",
                            )
                        }
                    }
                    else -> {
                        item {
                            MuqSectionTitle(text = "المواضيع", accent = theme.color, modifier = Modifier.padding(horizontal = 18.dp))
                        }
                        items(
                            count = state.topics.size,
                            key = { idx -> state.topics[idx].id },
                        ) { idx ->
                            val topic = state.topics[idx]
                            Box(modifier = Modifier.padding(horizontal = 18.dp)) {
                                MuqTopicCard(
                                    topic = topic,
                                    angleColorHex = state.angle?.colorHex,
                                    onClick = { onTopicClick(slug, topic.slug) },
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
private fun AngleHero(
    angle: MuqAngle?,
    writer: MuqWriter?,
    topicCount: Int,
    theme: MuqTheme,
    onWriterClick: (id: String) -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 240.dp),
        contentAlignment = Alignment.BottomStart,
    ) {
        val cover = muqAbsolutize(angle?.coverImageUrl)
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
        // Dark scrim for legible white text.
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        listOf(theme.color.copy(alpha = 0.55f), Color.Black.copy(alpha = 0.55f)),
                    ),
                ),
        )

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(64.dp)
                    .clip(CircleShape)
                    .background(Color.White.copy(alpha = 0.22f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = muqIcon(angle?.iconKey),
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(28.dp),
                )
            }
            Text(
                text = angle?.nameAr ?: "زاوية",
                fontSize = 28.sp,
                fontWeight = FontWeight.Black,
                color = Color.White,
            )
            if (writer?.name?.isNotBlank() == true) {
                val writerId = writer.id
                Row(
                    modifier = Modifier
                        .then(
                            if (!writerId.isNullOrBlank()) {
                                Modifier.clip(CircleShape).clickable { onWriterClick(writerId) }
                            } else Modifier
                        )
                        .padding(end = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    MuqWriterAvatarOnDark(name = writer.name!!, avatarUrl = writer.avatar)
                    Column {
                        Text(
                            text = writer.name!!,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Black,
                            color = Color.White,
                        )
                        Text(
                            text = "كاتب الزاوية",
                            fontSize = 11.sp,
                            color = Color.White.copy(alpha = 0.8f),
                        )
                    }
                }
            }
            angle?.shortDesc?.takeIf { it.isNotBlank() }?.let { desc ->
                Text(
                    text = desc,
                    fontSize = 14.sp,
                    color = Color.White.copy(alpha = 0.92f),
                    lineHeight = 20.sp,
                )
            }
            Box(
                modifier = Modifier
                    .clip(CircleShape)
                    .background(Color.White.copy(alpha = 0.2f))
                    .padding(horizontal = 10.dp, vertical = 5.dp),
            ) {
                Text(
                    text = "$topicCount موضوع",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Black,
                    color = Color.White,
                )
            }
        }
    }
}

@Composable
private fun MuqWriterAvatarOnDark(name: String, avatarUrl: String?) {
    val url = muqAbsolutize(avatarUrl)
    Box(
        modifier = Modifier
            .size(38.dp)
            .clip(CircleShape)
            .background(Color.White.copy(alpha = 0.2f)),
        contentAlignment = Alignment.Center,
    ) {
        if (url != null) {
            SubcomposeAsyncImage(
                model = url,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
                loading = { Box(Modifier.fillMaxSize().background(Color.White.copy(alpha = 0.2f))) },
                error = {
                    Text(name.take(1), fontSize = 14.sp, fontWeight = FontWeight.Black, color = Color.White)
                },
            )
        } else {
            Text(name.take(1), fontSize = 14.sp, fontWeight = FontWeight.Black, color = Color.White)
        }
    }
}

@Composable
fun MuqSectionTitle(text: String, accent: Color, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(width = 4.dp, height = 20.dp)
                .clip(CircleShape)
                .background(accent),
        )
        Text(
            text = text,
            fontSize = 18.sp,
            fontWeight = FontWeight.Black,
            color = SabqTheme.colors.ink,
        )
    }
}

internal fun shareMuqtarab(context: android.content.Context, url: String, title: String) {
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, "$title\n$url")
        putExtra(Intent.EXTRA_SUBJECT, title)
    }
    val chooser = Intent.createChooser(intent, "مشاركة").apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    context.startActivity(chooser)
}
