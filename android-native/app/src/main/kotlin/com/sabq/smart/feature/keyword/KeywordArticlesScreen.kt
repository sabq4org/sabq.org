package com.sabq.smart.feature.keyword

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.LocalOffer
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.sabq.smart.data.Article
import com.sabq.smart.data.BookmarksStore
import com.sabq.smart.ui.components.EmptyStateView
import com.sabq.smart.ui.components.CompactArticleRow
import com.sabq.smart.ui.components.OpinionCard
import com.sabq.smart.ui.components.rememberSabqHaptics
import com.sabq.smart.ui.theme.SabqTheme
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.launch

@EntryPoint
@InstallIn(SingletonComponent::class)
interface KeywordEntryPoint {
    fun bookmarksStore(): BookmarksStore
}

@Composable
fun KeywordArticlesScreen(
    onBack: () -> Unit,
    onArticleClick: (Article) -> Unit,
    onSearchClick: () -> Unit,
    viewModel: KeywordArticlesViewModel = hiltViewModel(),
) {
    val uiState by viewModel.state.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(SabqTheme.colors.background),
    ) {
        // Top Nav bar - Simple back button to match iOS
        KeywordTopBar(onBack = onBack)

        HorizontalDivider(color = SabqTheme.colors.outline.copy(alpha = 0.5f))

        Box(modifier = Modifier.fillMaxSize()) {
            when (val s = uiState) {
                KeywordArticlesUiState.Loading -> {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = SabqTheme.colors.primaryEnd)
                    }
                }
                is KeywordArticlesUiState.Error -> {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        Text(
                            text = s.message,
                            style = SabqTheme.typography.meta,
                            color = SabqTheme.colors.secondaryInk,
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Button(
                            onClick = viewModel::retry,
                            colors = ButtonDefaults.buttonColors(containerColor = SabqTheme.colors.primaryEnd)
                        ) {
                            Text("إعادة المحاولة", color = Color.White)
                        }
                    }
                }
                is KeywordArticlesUiState.Loaded -> {
                    KeywordFeed(
                        keyword = viewModel.keyword,
                        state = s,
                        isFollowed = s.isFollowed,
                        onFollowToggle = viewModel::toggleFollow,
                        onArticleClick = onArticleClick,
                        onSearchClick = onSearchClick,
                    )
                }
            }
        }
    }
}

@Composable
private fun KeywordTopBar(onBack: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(SabqTheme.colors.surface)
                .clickable { onBack() },
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                contentDescription = "رجوع",
                tint = SabqTheme.colors.ink,
                modifier = Modifier.size(20.dp),
            )
        }
    }
}

@Composable
private fun KeywordFeed(
    keyword: String,
    state: KeywordArticlesUiState.Loaded,
    isFollowed: Boolean,
    onFollowToggle: () -> Unit,
    onArticleClick: (Article) -> Unit,
    onSearchClick: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    val entryPoint = remember {
        EntryPointAccessors.fromApplication(
            context.applicationContext,
            KeywordEntryPoint::class.java
        )
    }
    val bookmarksStore = remember { entryPoint.bookmarksStore() }
    val bookmarkedIds by bookmarksStore.ids.collectAsState(initial = emptySet())

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(
            horizontal = SabqTheme.dimens.screenPaddingH,
            vertical = 18.dp
        ),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Hero Section: Title + Description + Chips + tag badge
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalAlignment = Alignment.Top
            ) {
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(
                        text = keyword,
                        style = SabqTheme.typography.cardTitle.copy(
                            fontSize = 26.sp,
                            fontWeight = FontWeight.Bold
                        ),
                        color = SabqTheme.colors.ink
                    )

                    Text(
                        text = "أخبار ومقالات رأي تحمل هذا الوسم",
                        style = SabqTheme.typography.excerpt.copy(
                            fontSize = 15.sp,
                            lineHeight = 22.sp
                        ),
                        color = SabqTheme.colors.secondaryInk
                    )

                    if (state.articles.isNotEmpty()) {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.padding(top = 4.dp)
                        ) {
                            StatusChip(title = "${state.articles.size} مادة", tint = SabqTheme.colors.primaryEnd)
                            if (state.newsCount > 0) {
                                // iOS uses `SabqTheme.sky` here (KeywordArticlesView.swift:134).
                                StatusChip(title = "${state.newsCount} خبر", tint = SabqTheme.colors.sky)
                            }
                            if (state.opinionsCount > 0) {
                                // iOS uses `SabqTheme.gold` for opinion-count chip
                                // (KeywordArticlesView.swift:137). Was hard-coded as
                                // `Color(0xFFEAB308)` (#EAB308) which is close to but
                                // not exactly the gold token (#EBAD33).
                                StatusChip(title = "${state.opinionsCount} رأي", tint = SabqTheme.colors.gold)
                            }
                        }
                    }
                }

                SquareIconBadge(tint = SabqTheme.colors.primaryEnd)
            }
        }

        // Follow Toggle Button - aligned to start
        item {
            FollowToggleButton(isFollowed = isFollowed, onFollowToggle = onFollowToggle)
            Spacer(modifier = Modifier.height(4.dp))
        }

        if (state.articles.isEmpty()) {
            item {
                EmptyStateView(
                    icon = Icons.Default.LocalOffer,
                    tint = SabqTheme.colors.secondaryInk,
                    title = "لا توجد مواد",
                    subtitle = "لم نجد أخبارًا أو مقالات رأي تحمل هذا الوسم حاليًا",
                    actionTitle = "البحث عن أخبار",
                    onAction = onSearchClick,
                )
            }
        }

        // Articles List
        items(state.articles, key = { it.id }) { article ->
            if (article.isOpinion) {
                OpinionCard(
                    article = article,
                    onClick = { onArticleClick(article) }
                )
            } else {
                val isBookmarked = article.bookmarkKey in bookmarkedIds
                CompactArticleRow(
                    article = article,
                    isBookmarked = isBookmarked,
                    onBookmark = {
                        scope.launch { bookmarksStore.toggle(article.bookmarkKey) }
                    },
                    onClick = { onArticleClick(article) }
                )
            }
            HorizontalDivider(color = SabqTheme.colors.outline.copy(alpha = 0.4f))
        }
    }
}

@Composable
private fun SquareIconBadge(
    modifier: Modifier = Modifier,
    tint: Color
) {
    Box(
        modifier = modifier
            .size(72.dp)
            .clip(RoundedCornerShape(18.dp))
            .background(
                Brush.linearGradient(
                    colors = listOf(
                        tint.copy(alpha = 0.10f),
                        tint.copy(alpha = 0.05f)
                    )
                )
            ),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            imageVector = Icons.Default.LocalOffer,
            contentDescription = null,
            tint = tint,
            modifier = Modifier.size(26.dp)
        )
    }
}

@Composable
private fun FollowToggleButton(
    isFollowed: Boolean,
    onFollowToggle: () -> Unit
) {
    val haptics = rememberSabqHaptics()
    val containerColor = if (isFollowed) {
        SabqTheme.colors.primaryEnd
    } else {
        SabqTheme.colors.primaryEnd.copy(alpha = 0.12f)
    }
    val contentColor = if (isFollowed) Color.White else SabqTheme.colors.primaryEnd
    val strokeColor = if (isFollowed) Color.Transparent else SabqTheme.colors.primaryEnd.copy(alpha = 0.30f)

    Box(
        modifier = Modifier
            .clip(CircleShape)
            .background(containerColor)
            .clickable {
                haptics.light()
                onFollowToggle()
            }
            .then(
                if (isFollowed) Modifier else Modifier.border(
                    BorderStroke(0.5.dp, strokeColor),
                    CircleShape
                )
            )
            .padding(horizontal = 16.dp, vertical = 9.dp),
        contentAlignment = Alignment.Center
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(7.dp)
        ) {
            Icon(
                imageVector = if (isFollowed) Icons.Default.Check else Icons.Default.Add,
                contentDescription = null,
                tint = contentColor,
                modifier = Modifier.size(14.dp)
            )
            Text(
                text = if (isFollowed) "متابع" else "متابعة الوسم",
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                color = contentColor
            )
        }
    }
}

@Composable
private fun StatusChip(title: String, tint: Color) {
    Box(
        modifier = Modifier
            .clip(CircleShape)
            .background(tint.copy(alpha = 0.10f))
            .padding(horizontal = 11.dp, vertical = 7.dp)
    ) {
        Text(
            text = title,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            color = tint
        )
    }
}
