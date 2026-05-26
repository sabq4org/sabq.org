package com.sabq.smart.feature.category

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
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
import com.sabq.smart.data.Article
import com.sabq.smart.data.ArticleCategory
import com.sabq.smart.ui.components.CompactArticleRow
import com.sabq.smart.ui.components.SmallSquareBadge
import com.sabq.smart.ui.components.StatusChip
import com.sabq.smart.ui.components.SurfaceCard
import com.sabq.smart.ui.theme.SabqTheme

@Composable
fun CategoryArticlesScreen(
    viewModel: CategoryArticlesViewModel = hiltViewModel(),
    onBack: () -> Unit = {},
    onArticleClick: (Article) -> Unit = {},
) {
    val uiState by viewModel.state.collectAsStateWithLifecycle()

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(SabqTheme.colors.background),
    ) {
        when (val s = uiState) {
            CategoryArticlesUiState.Loading -> {
                CircularProgressIndicator(
                    color = SabqTheme.colors.primaryEnd,
                    strokeWidth = 2.dp,
                    modifier = Modifier.size(22.dp).align(Alignment.Center),
                )
            }
            is CategoryArticlesUiState.Error -> {
                Column(
                    modifier = Modifier.align(Alignment.Center).padding(32.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text(s.message, color = SabqTheme.colors.tertiaryInk, fontSize = 14.sp)
                    Text(
                        "إعادة المحاولة",
                        color = SabqTheme.colors.primaryEnd,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.clickable { viewModel.retry() },
                    )
                }
            }
            is CategoryArticlesUiState.Loaded -> {
                val visual = ArticleCategory.fromSlug(s.slug)
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(
                        start = 16.dp, end = 16.dp,
                        top = 18.dp, bottom = 40.dp,
                    ),
                    verticalArrangement = Arrangement.spacedBy(20.dp),
                ) {
                    item {
                        HeroSection(
                            name = s.name,
                            subtitle = visual.subtitle,
                            count = s.articles.size,
                            visual = visual,
                        )
                    }
                    item {
                        SurfaceCard {
                            s.articles.forEachIndexed { idx, article ->
                                if (idx > 0) {
                                    HorizontalDivider(color = SabqTheme.colors.outline)
                                }
                                CompactArticleRow(
                                    article = article,
                                    isBookmarked = false,
                                    onBookmark = {},
                                    onClick = { onArticleClick(article) },
                                )
                            }
                            if (s.hasMore) {
                                HorizontalDivider(color = SabqTheme.colors.outline.copy(alpha = 0.3f))
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable { viewModel.loadMore() }
                                        .padding(vertical = 12.dp),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    if (s.isLoadingMore) {
                                        CircularProgressIndicator(
                                            color = SabqTheme.colors.primaryEnd,
                                            strokeWidth = 2.dp,
                                            modifier = Modifier.size(18.dp),
                                        )
                                    } else {
                                        Text(
                                            "تحميل المزيد",
                                            fontSize = 14.sp,
                                            fontWeight = FontWeight.SemiBold,
                                            color = SabqTheme.colors.primaryEnd,
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Top bar
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(SabqTheme.colors.surface.copy(alpha = 0.92f))
                    .clickable { onBack() },
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                    contentDescription = "رجوع",
                    tint = SabqTheme.colors.ink,
                    modifier = Modifier.size(14.dp),
                )
            }
        }
    }
}

@Composable
private fun HeroSection(
    name: String,
    subtitle: String,
    count: Int,
    visual: ArticleCategory,
) {
    val topPadding = androidx.compose.foundation.layout.WindowInsets
        .statusBars.asPaddingValues().calculateTopPadding() + 56.dp
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = topPadding),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = name,
                fontSize = 26.sp,
                fontWeight = FontWeight.Bold,
                color = SabqTheme.colors.ink,
            )
            Text(
                text = subtitle,
                fontSize = 15.sp,
                color = SabqTheme.colors.secondaryInk,
                lineHeight = 22.sp,
            )
            StatusChip(title = "$count خبر", tint = visual.tint())
        }
        SmallSquareBadge(icon = visual.icon, tint = visual.tint())
    }
}
