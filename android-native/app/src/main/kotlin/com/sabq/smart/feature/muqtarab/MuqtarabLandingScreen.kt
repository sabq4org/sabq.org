package com.sabq.smart.feature.muqtarab

import androidx.compose.foundation.background
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
import androidx.compose.material.icons.filled.CenterFocusStrong
import androidx.compose.material.icons.filled.LayersClear
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.sabq.smart.ui.components.ArticleListSkeleton
import com.sabq.smart.ui.components.EmptyStateView
import com.sabq.smart.ui.theme.SabqTheme

/**
 * «مُقترب» landing — angle rail + latest featured topics. 1:1 port of
 * iOS `MuqtarabLandingView` (`Screens/MuqtarabView.swift:143-272`).
 */
@Composable
fun MuqtarabLandingScreen(
    onBack: () -> Unit,
    onAngleClick: (slug: String) -> Unit,
    onTopicClick: (angleSlug: String, topicSlug: String) -> Unit,
    viewModel: MuqtarabLandingViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(SabqTheme.colors.background),
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            MuqTopBar(onBack = onBack)

            when {
                state.isLoading && state.angles.isEmpty() && state.topics.isEmpty() ->
                    ArticleListSkeleton(rows = 4, modifier = Modifier.padding(top = 16.dp))

                state.error != null && state.topics.isEmpty() && state.angles.isEmpty() ->
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

                state.angles.isEmpty() && state.topics.isEmpty() ->
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        EmptyStateView(
                            icon = Icons.Filled.LayersClear,
                            tint = SabqTheme.colors.tertiaryInk,
                            title = "لا توجد مواضيع بعد",
                            subtitle = "زوايا مُقترب التحليلية قيد التحضير — قريبًا.",
                        )
                    }

                else -> LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(
                        horizontal = 18.dp,
                        vertical = 14.dp,
                    ),
                    verticalArrangement = Arrangement.spacedBy(24.dp),
                ) {
                    item { LandingHeader() }

                    if (state.angles.isNotEmpty()) {
                        item {
                            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                Text(
                                    text = "الزوايا",
                                    fontSize = 17.sp,
                                    fontWeight = FontWeight.Black,
                                    color = SabqTheme.colors.ink,
                                )
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .horizontalScroll(rememberScrollState()),
                                    horizontalArrangement = Arrangement.spacedBy(14.dp),
                                ) {
                                    state.angles.forEach { angle ->
                                        MuqAngleCard(angle = angle, onClick = { onAngleClick(angle.slug) })
                                    }
                                }
                            }
                        }
                    }

                    if (state.topics.isNotEmpty()) {
                        item {
                            Text(
                                text = "أحدث المواضيع",
                                fontSize = 17.sp,
                                fontWeight = FontWeight.Black,
                                color = SabqTheme.colors.ink,
                            )
                        }
                        items(
                            count = state.topics.size,
                            key = { idx -> state.topics[idx].id },
                        ) { idx ->
                            val topic = state.topics[idx]
                            val angleSlug = topic.angle?.slug
                            if (angleSlug != null) {
                                MuqTopicCard(
                                    topic = topic,
                                    showAnglePill = true,
                                    onClick = { onTopicClick(angleSlug, topic.slug) },
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
private fun LandingHeader() {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Box(
            modifier = Modifier
                .size(56.dp)
                .clip(CircleShape)
                .background(SabqTheme.colors.sky.copy(alpha = 0.14f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Filled.CenterFocusStrong,
                contentDescription = null,
                tint = SabqTheme.colors.sky,
                modifier = Modifier.size(26.dp),
            )
        }
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                text = "مُقترب",
                fontSize = 24.sp,
                fontWeight = FontWeight.Black,
                color = SabqTheme.colors.ink,
            )
            Text(
                text = "زوايا تحليلية بأقلام كتّاب سبق",
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                color = SabqTheme.colors.tertiaryInk,
            )
        }
    }
}
