package com.sabq.smart.feature.bookmarks

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.sabq.smart.data.Article
import com.sabq.smart.ui.components.CompactArticleRow
import com.sabq.smart.ui.components.SurfaceCard
import com.sabq.smart.ui.theme.SabqTheme

/**
 * Bookmarks tab — list of saved articles. Mirrors iOS
 * [BookmarksView]'s structure: header + stat tiles + list. v1 skips
 * the stat tiles; lands once the offline cache is in place.
 */
@Composable
fun BookmarksScreen(
    viewModel: BookmarksViewModel = hiltViewModel(),
    onArticleClick: (Article) -> Unit = {},
) {
    val uiState by viewModel.state.collectAsStateWithLifecycle()

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(SabqTheme.colors.background),
    ) {
        when (val s = uiState) {
            BookmarksUiState.Loading -> Loading()
            BookmarksUiState.Empty -> Empty()
            is BookmarksUiState.Error -> Error(message = s.message)
            is BookmarksUiState.Loaded -> Loaded(
                items = s.items,
                onUnbookmark = viewModel::unbookmark,
                onArticleClick = onArticleClick,
            )
        }
    }
}

@Composable
private fun Loaded(
    items: List<Article>,
    onUnbookmark: (String) -> Unit,
    onArticleClick: (Article) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize().statusBarsPadding(),
        contentPadding = PaddingValues(
            start = SabqTheme.dimens.screenPaddingH,
            end = SabqTheme.dimens.screenPaddingH,
            top = 24.dp,
            bottom = 120.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        item {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    text = "المحفوظات",
                    style = SabqTheme.typography.screenTitle,
                    color = SabqTheme.colors.ink,
                )
                Text(
                    text = "${items.size} مقال محفوظ",
                    style = SabqTheme.typography.meta,
                    color = SabqTheme.colors.secondaryInk,
                )
            }
        }
        item {
            SurfaceCard {
                items.forEachIndexed { index, article ->
                    if (index > 0) {
                        HorizontalDivider(
                            color = SabqTheme.colors.outline.copy(alpha = 0.3f),
                            thickness = 0.5.dp,
                        )
                    }
                    CompactArticleRow(
                        article = article,
                        isBookmarked = true,
                        onBookmark = { onUnbookmark(article.id) },
                        onClick = { onArticleClick(article) },
                    )
                }
            }
        }
    }
}

@Composable
private fun Empty() {
    Box(modifier = Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Icon(
                imageVector = Icons.Outlined.BookmarkBorder,
                contentDescription = null,
                tint = SabqTheme.colors.tertiaryInk,
                modifier = Modifier.padding(8.dp),
            )
            Text(
                text = "لا توجد محفوظات بعد",
                style = SabqTheme.typography.sectionHeader,
                color = SabqTheme.colors.ink,
            )
            Text(
                text = "اضغط على أيقونة الحفظ في الأخبار لتضيفها هنا",
                style = SabqTheme.typography.meta,
                color = SabqTheme.colors.secondaryInk,
            )
        }
    }
}

@Composable
private fun Loading() {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = SabqTheme.colors.primaryEnd)
    }
}

@Composable
private fun Error(message: String) {
    Box(modifier = Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                text = "تعذّر تحميل المحفوظات",
                style = SabqTheme.typography.sectionHeader,
                color = SabqTheme.colors.ink,
            )
            Text(
                text = message,
                style = SabqTheme.typography.meta,
                color = SabqTheme.colors.secondaryInk,
            )
        }
    }
}
