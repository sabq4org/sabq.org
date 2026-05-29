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
                title = "المحفوظات",
                subtitle = "الأخبار التي حفظتها للقراءة لاحقاً",
            )
        }

        item { StatsRow(items = items) }

        item {
            SurfaceCard {
                items.forEachIndexed { index, article ->
                    key(article.id) {
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
}

// ============================================================
// Stats row — 3 tiles (count / reading minutes / unique categories)
// ============================================================

@Composable
private fun StatsRow(items: List<Article>) {
    val totalMinutes = items.sumOf { it.readingMinutesInt ?: 0 }
    val uniqueCategories = items.map { it.category }.toSet().size

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        StatTile(
            title = "محفوظة",
            value = items.size.toString(),
            icon = Icons.Filled.Bookmark,
            tint = SabqTheme.colors.primaryEnd,
            modifier = Modifier.weight(1f),
        )
        StatTile(
            title = "وقت القراءة",
            value = "$totalMinutes د",
            icon = Icons.Outlined.Schedule,
            tint = SabqTheme.colors.teal,
            modifier = Modifier.weight(1f),
        )
        StatTile(
            title = "أقسام",
            value = uniqueCategories.toString(),
            icon = Icons.Filled.GridView,
            tint = SabqTheme.colors.gold,
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun StatTile(
    title: String,
    value: String,
    icon: ImageVector,
    tint: Color,
    modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(SabqTheme.dimens.tileRadius)
    Column(
        modifier = modifier
            // Tint-aware glow — iOS `shadow(tint.opacity(0.08), radius:12, y:4)`.
            // Each tile picks up a tiny halo in its own tint (primaryEnd
            // for count, teal for reading-time, gold for categories) which
            // is the visual move that makes the three tiles read as a
            // colour-coded set instead of three flat boxes.
            .shadow(
                elevation = 6.dp,
                shape = shape,
                ambientColor = Color.Transparent,
                spotColor = tint.copy(alpha = 0.08f),
            )
            .clip(shape)
            .background(SabqTheme.colors.surface, shape)
            .background(tint.copy(alpha = 0.04f), shape)
            .border(width = 0.5.dp, color = tint.copy(alpha = 0.18f), shape = shape)
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(
            modifier = Modifier
                .size(32.dp)
                .clip(CircleShape)
                .background(tint.copy(alpha = 0.12f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = tint,
                modifier = Modifier.size(14.dp),
            )
        }
        Text(
            text = value,
            style = SabqTheme.typography.statValue,
            color = SabqTheme.colors.ink,
        )
        // iOS uses `.system(size: 12, weight: .medium)` for the label
        // (BookmarksView.swift:96-97). Closest existing token is `meta`
        // (13/Medium) but the 1-sp shrink matters here — keeping it
        // inline rather than nudging the token's global size.
        Text(
            text = title,
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
            color = SabqTheme.colors.tertiaryInk,
        )
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
