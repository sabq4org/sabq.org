package com.sabq.smart.feature.lite

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sabq.smart.data.Article
import com.sabq.smart.feature.home.HomeFeedUiState
import com.sabq.smart.ui.components.CompactArticleRow
import com.sabq.smart.ui.theme.SabqTheme

/**
 * الرئيسية في وضع Lite — نقل iOS `HomeLiteView`: قائمة أخبار مسطحة
 * فقط، بلا هيرو ولا أشرطة ولا حركات. تستهلك نفس حالة
 * [com.sabq.smart.feature.home.HomeFeedViewModel] (المقالات + المحفوظات)
 * فتُضمَّن مكان LoadedFeed داخل HomeFeedScreen عندما يكون Lite نشطاً.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeLiteScreen(
    state: HomeFeedUiState.Loaded,
    onArticleClick: (Article) -> Unit,
    onBookmark: (String) -> Unit,
    onLoadMore: () -> Unit,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
) {
    PullToRefreshBox(
        isRefreshing = state.isRefreshing,
        onRefresh = onRefresh,
        modifier = modifier
            .fillMaxSize()
            .background(SabqTheme.colors.background),
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(
                start = SabqTheme.dimens.screenPaddingH,
                end = SabqTheme.dimens.screenPaddingH,
                top = WindowInsets.statusBars.asPaddingValues().calculateTopPadding() + 16.dp,
                bottom = SabqTheme.dimens.tabBarSafeArea,
            ),
        ) {
            item(key = "lite-header") { LiteHeader() }

            itemsIndexed(
                items = state.articles,
                key = { _, article -> "lite-${article.id}" },
            ) { index, article ->
                Column {
                    CompactArticleRow(
                        article = article,
                        isBookmarked = article.bookmarkKey in state.bookmarkedIds,
                        onBookmark = { onBookmark(article.bookmarkKey) },
                        onClick = { onArticleClick(article) },
                    )
                    if (index < state.articles.lastIndex) {
                        HorizontalDivider(
                            thickness = 0.5.dp,
                            color = SabqTheme.colors.outline,
                        )
                    }
                }
            }

            if (state.hasMore) {
                item(key = "lite-load-more") {
                    LoadMoreButton(
                        isLoading = state.isLoadingMore,
                        onClick = onLoadMore,
                    )
                }
            }
        }
    }
}

@Composable
private fun LiteHeader() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(
            modifier = Modifier
                .size(38.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(SabqTheme.colors.primaryEnd.copy(alpha = 0.12f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Filled.Bolt,
                contentDescription = null,
                tint = SabqTheme.colors.primaryEnd,
                modifier = Modifier.size(20.dp),
            )
        }
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                text = "سبق Lite",
                style = SabqTheme.typography.sectionHeader.copy(
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Bold,
                    color = SabqTheme.colors.ink,
                ),
            )
            Text(
                text = "عرض الأخبار فقط — أسرع وأخف",
                style = SabqTheme.typography.metaSmall.copy(
                    fontSize = 12.sp,
                    color = SabqTheme.colors.secondaryInk,
                ),
            )
        }
    }
}

@Composable
private fun LoadMoreButton(isLoading: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 14.dp),
        contentAlignment = Alignment.Center,
    ) {
        if (isLoading) {
            CircularProgressIndicator(
                modifier = Modifier.size(22.dp),
                strokeWidth = 2.dp,
                color = SabqTheme.colors.primaryEnd,
            )
        } else {
            Text(
                text = "تحميل المزيد",
                style = SabqTheme.typography.ctaButton.copy(
                    fontSize = 14.sp,
                    color = SabqTheme.colors.primaryEnd,
                ),
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .clip(RoundedCornerShape(14.dp))
                    .background(SabqTheme.colors.primaryEnd.copy(alpha = 0.10f))
                    .clickable { onClick() }
                    .padding(horizontal = 26.dp, vertical = 10.dp),
            )
        }
    }
}
