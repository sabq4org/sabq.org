package com.sabq.smart.feature.bookmarks

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.sabq.smart.data.Article
import com.sabq.smart.ui.components.CompactArticleRow
import com.sabq.smart.ui.components.CompactScreenHeader
import com.sabq.smart.ui.components.sabqNewsSurface
import com.sabq.smart.ui.components.SurfaceCard
import com.sabq.smart.ui.theme.SabqTheme

/**
 * Bookmarks tab — 1:1 port of iOS `BookmarksView`
 * (`Screens/BookmarksView.swift`).
 *
 * Layout:
 *   - CompactScreenHeader ("المحفوظات" + subtitle)
 *   - Empty: SurfaceCard with bookmark icon + helper text
 *   - Loaded:
 *     - 3 stat tiles row (count / total reading minutes / unique categories)
 *     - SurfaceCard with the saved-article list
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
            BookmarksUiState.Empty -> EmptyContent()
            is BookmarksUiState.Error -> ErrorContent(message = s.message)
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
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding(),
        contentPadding = PaddingValues(
            start = SabqTheme.dimens.screenPaddingH,
            end = SabqTheme.dimens.screenPaddingH,
            top = 18.dp,
            bottom = 120.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        item {
            CompactScreenHeader(
                title = "محفوظاتي",
                subtitle = "الأخبار التي حفظتها للقراءة لاحقاً",
            )
        }

        item { StatsRow(items = items) }

        item {
            // iOS: الصفوف على سطح أبيض واحد بفواصل رفيعة.
            val listShape = RoundedCornerShape(SabqTheme.dimens.cardRadius)
            Column(
                Modifier
                    .fillMaxWidth()
                    .sabqNewsSurface(listShape)
                    .background(SabqTheme.colors.surface, listShape)
                    .padding(horizontal = 12.dp),
            ) {
                items.forEachIndexed { index, article ->
                    key(article.id) {
                        if (index > 0) com.sabq.smart.ui.components.SabqRowDivider()
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
}

// ============================================================
// Stats row — 3 tiles (count / reading minutes / unique categories)
// ============================================================

@Composable
private fun StatsRow(items: List<Article>) {
    // iOS BookmarksView: بطاقة واحدة بإحصاءين متجاورين (العدد والأقسام).
    val uniqueCategories = items.map { it.category }.toSet().size
    val shape = RoundedCornerShape(SabqTheme.dimens.cardRadius)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .sabqNewsSurface(shape)
            .background(SabqTheme.colors.surface, shape)
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        StatCell(title = "محفوظة", value = items.size.toString(), icon = Icons.Filled.Bookmark, modifier = Modifier.weight(1f))
        StatCell(title = "أقسام", value = uniqueCategories.toString(), icon = Icons.Filled.GridView, modifier = Modifier.weight(1f))
    }
}

@Composable
private fun StatCell(
    title: String,
    value: String,
    icon: ImageVector,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(text = value, style = SabqTheme.typography.statValue.copy(fontSize = 20.sp), color = SabqTheme.colors.ink)
            Icon(imageVector = icon, contentDescription = null, tint = SabqTheme.colors.primaryEnd, modifier = Modifier.size(16.dp))
        }
        Text(text = title, style = SabqTheme.typography.meta, color = SabqTheme.colors.tertiaryInk)
    }
}

// ============================================================
// States
// ============================================================

@Composable
private fun EmptyContent() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .padding(horizontal = SabqTheme.dimens.screenPaddingH, vertical = 18.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        CompactScreenHeader(
            title = "المحفوظات",
            subtitle = "الأخبار التي حفظتها للقراءة لاحقاً",
        )
        // iOS wraps EmptyStateView in a SurfaceCard
        // (BookmarksView.swift:40-48). Match exactly — including
        // the bookmark icon + primaryEnd tint + iOS copy.
        SurfaceCard {
            com.sabq.smart.ui.components.EmptyStateView(
                icon = Icons.Outlined.BookmarkBorder,
                tint = SabqTheme.colors.primaryEnd,
                title = "لا توجد محفوظات",
                subtitle = "احفظ الأخبار المهمة بالضغط على أيقونة الحفظ لقراءتها لاحقاً",
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
private fun ErrorContent(message: String) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = "تعذّر تحميل المحفوظات",
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                color = SabqTheme.colors.ink,
            )
            Text(
                text = message,
                fontSize = 13.sp,
                color = SabqTheme.colors.secondaryInk,
            )
        }
    }
}
