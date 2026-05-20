package com.sabq.smart.feature.audio

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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Headphones
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.VolumeOff
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.SubcomposeAsyncImage
import coil.request.ImageRequest
import com.sabq.smart.data.AudioNewsletter
import com.sabq.smart.feature.article.AudioPlayerEntryPoint
import com.sabq.smart.ui.components.rememberSabqHaptics
import com.sabq.smart.ui.theme.SabqTheme
import dagger.hilt.android.EntryPointAccessors

/**
 * "النشرات الصوتية" — full list with inline mini-player. iOS source:
 * Screens/AudioNewslettersView.swift. Rows expand-in-place to show a
 * playing state (coral pill + white pause icon) instead of opening a
 * detail page; the shared [com.sabq.smart.data.audio.AudioPlayerController]
 * owns playback so navigating away keeps the audio running.
 */
@Composable
fun AudioNewslettersScreen(
    onBack: () -> Unit,
    viewModel: AudioNewslettersViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val controller = remember {
        EntryPointAccessors
            .fromApplication(
                context.applicationContext,
                AudioPlayerEntryPoint::class.java,
            )
            .audioPlayerController()
    }
    val playerState by controller.state.collectAsState()
    val haptics = rememberSabqHaptics()

    Box(modifier = Modifier.fillMaxSize().background(SabqTheme.colors.background)) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(
                top = 0.dp,
                bottom = 60.dp,
            ),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            item { Spacer(modifier = Modifier.height(8.dp)) }
            item {
                Box(modifier = Modifier.padding(horizontal = 18.dp)) {
                    Header()
                }
            }

            when (val s = state) {
                is AudioNewslettersUiState.Loading -> {
                    items(3) {
                        Box(
                            modifier = Modifier
                                .padding(horizontal = 18.dp)
                                .fillMaxWidth()
                                .height(100.dp)
                                .clip(RoundedCornerShape(SabqTheme.dimens.tileRadius))
                                .background(SabqTheme.colors.paleFill),
                        )
                    }
                }
                is AudioNewslettersUiState.Empty -> {
                    item {
                        EmptyOrErrorBlock(
                            icon = Icons.Filled.GraphicEq,
                            tint = SabqTheme.colors.tertiaryInk,
                            title = "لا توجد نشرات صوتية",
                            subtitle = "النشرات الصوتية ستظهر هنا فور توفّرها.",
                            actionTitle = null,
                            onAction = null,
                        )
                    }
                }
                is AudioNewslettersUiState.Error -> {
                    item {
                        EmptyOrErrorBlock(
                            icon = Icons.Filled.VolumeOff,
                            tint = SabqTheme.colors.coral,
                            title = "تعذّر التحميل",
                            subtitle = s.message,
                            actionTitle = "إعادة المحاولة",
                            onAction = { viewModel.refresh() },
                        )
                    }
                }
                is AudioNewslettersUiState.Loaded -> {
                    items(s.items, key = { it.id }) { newsletter ->
                        Box(modifier = Modifier.padding(horizontal = 18.dp)) {
                            NewsletterRow(
                                newsletter = newsletter,
                                isPlayingThis = playerState.playingSlug == newsletter.id && playerState.isPlaying,
                                isLoadingThis = playerState.playingSlug == newsletter.id && playerState.isLoading,
                                onPlay = {
                                    val audio = newsletter.audioUrl ?: return@NewsletterRow
                                    haptics.light()
                                    controller.toggleUrl(id = newsletter.id, url = audio)
                                },
                            )
                        }
                    }
                }
            }
        }

        // Top toolbar — back chevron only (RTL: visually right). iOS
        // hides the system back; we mirror that with a manual button.
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Spacer(modifier = Modifier.weight(1f))
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(CircleShape)
                    .background(SabqTheme.colors.surface.copy(alpha = 0.85f), CircleShape)
                    .clickable { onBack() },
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                    contentDescription = "رجوع",
                    tint = SabqTheme.colors.ink,
                    modifier = Modifier.size(16.dp),
                )
            }
        }
    }
}

@Composable
private fun Header() {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(
            modifier = Modifier
                .size(56.dp)
                .clip(CircleShape)
                .background(SabqTheme.colors.coral.copy(alpha = 0.14f), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Filled.GraphicEq,
                contentDescription = null,
                tint = SabqTheme.colors.coral,
                modifier = Modifier.size(24.dp),
            )
        }
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                text = "النشرات الصوتية",
                fontSize = 20.sp,
                fontWeight = FontWeight.Black,
                color = SabqTheme.colors.ink,
            )
            Text(
                text = "أبرز ما يحدث، باختصار صوتي",
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
                color = SabqTheme.colors.tertiaryInk,
            )
        }
    }
}

@Composable
private fun NewsletterRow(
    newsletter: AudioNewsletter,
    isPlayingThis: Boolean,
    isLoadingThis: Boolean,
    onPlay: () -> Unit,
) {
    val coral = SabqTheme.colors.coral
    val rowShape = RoundedCornerShape(SabqTheme.dimens.tileRadius)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(rowShape)
            .background(SabqTheme.colors.surface, rowShape)
            .border(
                width = if (isPlayingThis) 1.dp else 0.5.dp,
                color = if (isPlayingThis) coral.copy(alpha = 0.3f)
                else SabqTheme.colors.outline.copy(alpha = 0.4f),
                shape = rowShape,
            )
            .padding(14.dp),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Cover(coverUrl = newsletter.coverImageUrl)

        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(
                text = newsletter.title,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                color = SabqTheme.colors.ink,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            newsletter.description?.takeIf { it.isNotBlank() }?.let { desc ->
                Text(
                    text = desc,
                    fontSize = 11.sp,
                    color = SabqTheme.colors.secondaryInk,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                newsletter.durationSeconds?.takeIf { it > 0 }?.let { secs ->
                    MetaChip(icon = Icons.Filled.Schedule, label = formatDuration(secs))
                }
                newsletter.totalListens?.let { n ->
                    MetaChip(icon = Icons.Filled.Headphones, label = "$n")
                }
            }
        }

        // Play / pause / loading button. iOS sizing: 44 dp circle.
        val disabled = newsletter.audioUrl.isNullOrBlank()
        Box(
            modifier = Modifier
                .size(44.dp)
                .clip(CircleShape)
                .background(
                    if (isPlayingThis) coral else SabqTheme.colors.primaryEnd.copy(alpha = 0.14f),
                    CircleShape,
                )
                .then(
                    if (!disabled && !isLoadingThis) Modifier.clickable { onPlay() }
                    else Modifier,
                ),
            contentAlignment = Alignment.Center,
        ) {
            when {
                isLoadingThis -> CircularProgressIndicator(
                    color = if (isPlayingThis) Color.White else SabqTheme.colors.primaryEnd,
                    strokeWidth = 2.dp,
                    modifier = Modifier.size(18.dp),
                )
                isPlayingThis -> Icon(
                    imageVector = Icons.Filled.Pause,
                    contentDescription = "إيقاف",
                    tint = Color.White,
                    modifier = Modifier.size(17.dp),
                )
                else -> Icon(
                    imageVector = Icons.Filled.PlayArrow,
                    contentDescription = "تشغيل",
                    tint = SabqTheme.colors.primaryEnd.copy(alpha = if (disabled) 0.4f else 1f),
                    modifier = Modifier.size(17.dp),
                )
            }
        }
    }
}

@Composable
private fun Cover(coverUrl: String?) {
    val shape = RoundedCornerShape(14.dp)
    val context = LocalContext.current
    val placeholderBrush = Brush.linearGradient(
        colors = listOf(
            SabqTheme.colors.coral.copy(alpha = 0.30f),
            SabqTheme.colors.primaryEnd.copy(alpha = 0.18f),
        ),
    )
    if (!coverUrl.isNullOrBlank()) {
        SubcomposeAsyncImage(
            model = ImageRequest.Builder(context)
                .data(coverUrl)
                .crossfade(180)
                .build(),
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .size(60.dp)
                .clip(shape)
                .background(placeholderBrush, shape),
            loading = { CoverPlaceholder() },
            error = { CoverPlaceholder() },
        )
    } else {
        Box(
            modifier = Modifier
                .size(60.dp)
                .clip(shape)
                .background(placeholderBrush, shape),
            contentAlignment = Alignment.Center,
        ) {
            CoverPlaceholder()
        }
    }
}

@Composable
private fun CoverPlaceholder() {
    Icon(
        imageVector = Icons.Filled.GraphicEq,
        contentDescription = null,
        tint = Color.White.copy(alpha = 0.7f),
        modifier = Modifier.size(22.dp),
    )
}

@Composable
private fun MetaChip(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = SabqTheme.colors.tertiaryInk,
            modifier = Modifier.size(11.dp),
        )
        Text(
            text = label,
            fontSize = 10.sp,
            fontWeight = FontWeight.SemiBold,
            color = SabqTheme.colors.tertiaryInk,
        )
    }
}

@Composable
private fun EmptyOrErrorBlock(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    tint: Color,
    title: String,
    subtitle: String,
    actionTitle: String?,
    onAction: (() -> Unit)?,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 18.dp, vertical = 60.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = tint,
            modifier = Modifier.size(40.dp),
        )
        Text(
            text = title,
            fontSize = 16.sp,
            fontWeight = FontWeight.Black,
            color = SabqTheme.colors.ink,
        )
        Text(
            text = subtitle,
            fontSize = 13.sp,
            color = SabqTheme.colors.secondaryInk,
        )
        if (actionTitle != null && onAction != null) {
            Box(
                modifier = Modifier
                    .clip(CircleShape)
                    .background(SabqTheme.colors.primaryEnd, CircleShape)
                    .clickable { onAction() }
                    .padding(horizontal = 18.dp, vertical = 10.dp),
            ) {
                Text(
                    text = actionTitle,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Black,
                    color = Color.White,
                )
            }
        }
    }
}

private fun formatDuration(seconds: Int): String {
    val m = seconds / 60
    val s = seconds % 60
    return "$m:${s.toString().padStart(2, '0')}"
}
