package com.sabq.smart.feature.author

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
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Article
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.TrendingUp
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
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.sabq.smart.data.Article
import com.sabq.smart.data.AuthorCategory
import com.sabq.smart.data.AuthorPage
import com.sabq.smart.data.BookmarksStore
import com.sabq.smart.feature.keyword.KeywordEntryPoint
import com.sabq.smart.ui.components.CompactArticleRow
import com.sabq.smart.ui.components.FocalCachedAsyncImage
import com.sabq.smart.ui.components.OpinionCard
import com.sabq.smart.ui.theme.SabqTheme
import dagger.hilt.android.EntryPointAccessors
import kotlinx.coroutines.launch
import java.util.Locale

@Composable
fun AuthorArticlesScreen(
    onBack: () -> Unit,
    onArticleClick: (Article) -> Unit,
    viewModel: AuthorArticlesViewModel = hiltViewModel(),
) {
    val uiState by viewModel.state.collectAsState()
    val isLoadingMore by viewModel.isLoadingMore.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(SabqTheme.colors.background),
    ) {
        // Simple Top Nav bar
        AuthorTopBar(onBack = onBack, name = viewModel.name)

        HorizontalDivider(color = SabqTheme.colors.outline.copy(alpha = 0.5f))

        Box(modifier = Modifier.fillMaxSize()) {
            when (val s = uiState) {
                AuthorProfileUiState.Loading -> {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = SabqTheme.colors.primaryEnd)
                    }
                }
                is AuthorProfileUiState.Error -> {
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
                is AuthorProfileUiState.Loaded -> {
                    AuthorFeed(
                        authorPage = s.authorPage,
                        isLoadingMore = isLoadingMore,
                        isLastPage = viewModel.isLastPage,
                        onLoadMore = viewModel::loadMore,
                        onArticleClick = onArticleClick
                    )
                }
            }
        }
    }
}

@Composable
private fun AuthorTopBar(onBack: () -> Unit, name: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
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

        Text(
            text = name,
            style = SabqTheme.typography.cardTitle.copy(
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold
            ),
            color = SabqTheme.colors.ink,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f)
        )
    }
}

@Composable
private fun AuthorFeed(
    authorPage: AuthorPage,
    isLoadingMore: Boolean,
    isLastPage: Boolean,
    onLoadMore: () -> Unit,
    onArticleClick: (Article) -> Unit,
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
            vertical = 16.dp
        ),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Hero Section
        item {
            AuthorHeroCard(authorPage = authorPage)
        }

        // Stats Strip Section
        item {
            AuthorStatsStrip(authorPage = authorPage)
        }

        // Top Categories Section
        if (authorPage.topCategories.isNotEmpty()) {
            item {
                AuthorCategoriesSection(categories = authorPage.topCategories)
            }
        }

        // Publications Title Header
        item {
            Text(
                text = "أحدث المنشورات",
                style = SabqTheme.typography.cardTitle.copy(
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold
                ),
                color = SabqTheme.colors.ink,
                modifier = Modifier.padding(top = 8.dp)
            )
        }

        // Publications List
        items(authorPage.recentArticles, key = { it.id }) { article ->
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

        // Load More Button / Indicator
        if (!isLastPage) {
            item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 16.dp),
                    contentAlignment = Alignment.Center
                ) {
                    if (isLoadingMore) {
                        CircularProgressIndicator(
                            color = SabqTheme.colors.primaryEnd,
                            modifier = Modifier.size(24.dp),
                            strokeWidth = 2.dp
                        )
                    } else {
                        Button(
                            onClick = onLoadMore,
                            colors = ButtonDefaults.buttonColors(
                                containerColor = SabqTheme.colors.primaryEnd.copy(alpha = 0.1f),
                                contentColor = SabqTheme.colors.primaryEnd
                            ),
                            shape = RoundedCornerShape(12.dp),
                            contentPadding = PaddingValues(horizontal = 24.dp, vertical = 10.dp)
                        ) {
                            Text(
                                text = "جلب المزيد",
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun AuthorHeroCard(authorPage: AuthorPage) {
    val author = authorPage.author
    val gradient = Brush.linearGradient(
        colors = listOf(
            SabqTheme.colors.primaryStart.copy(alpha = 0.08f),
            SabqTheme.colors.primaryEnd.copy(alpha = 0.03f)
        )
    )

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(gradient)
            .shadow(
                elevation = 2.dp,
                shape = RoundedCornerShape(16.dp),
                ambientColor = SabqTheme.colors.shadow,
                spotColor = SabqTheme.colors.deepShadow
            )
            .background(SabqTheme.colors.surface)
            .padding(16.dp)
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            // Large Avatar
            Box(
                modifier = Modifier
                    .size(80.dp)
                    .clip(CircleShape)
                    .background(SabqTheme.colors.primaryEnd.copy(alpha = 0.12f))
            ) {
                if (!author.avatarUrl.isNullOrBlank()) {
                    FocalCachedAsyncImage(
                        url = author.avatarUrl,
                        focalPoint = null,
                        modifier = Modifier.fillMaxSize()
                    )
                } else {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = author.name.take(1),
                            style = SabqTheme.typography.cardTitle.copy(
                                fontSize = 32.sp,
                                fontWeight = FontWeight.Bold,
                                color = SabqTheme.colors.primaryEnd
                            )
                        )
                    }
                }
            }

            // Name
            Text(
                text = author.name,
                style = SabqTheme.typography.cardTitle.copy(
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold
                ),
                color = SabqTheme.colors.ink,
                textAlign = TextAlign.Center
            )

            // Role / Job title / Department
            val subtitle = listOfNotNull(
                author.jobTitle?.takeIf { it.isNotBlank() },
                author.department?.takeIf { it.isNotBlank() }
            ).joinToString(" - ")
            
            Text(
                text = subtitle.ifBlank { "كاتب صحفي" },
                style = SabqTheme.typography.meta.copy(fontSize = 13.sp),
                color = SabqTheme.colors.primaryEnd,
                textAlign = TextAlign.Center
            )

            // Bio
            author.bio?.takeIf { it.isNotBlank() }?.let { bio ->
                Text(
                    text = bio,
                    style = SabqTheme.typography.excerpt.copy(
                        fontSize = 13.sp,
                        lineHeight = 20.sp
                    ),
                    color = SabqTheme.colors.secondaryInk,
                    textAlign = TextAlign.Center,
                    maxLines = 4,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 4.dp)
                )
            }
        }
    }
}

@Composable
private fun AuthorStatsStrip(authorPage: AuthorPage) {
    val stats = authorPage.stats
    val earliest = stats.earliestPublish?.take(4) ?: "٢٠٢٤" // Fallback to a reasonable joined year

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        StatBox(
            modifier = Modifier.weight(1f),
            icon = Icons.Default.Article,
            value = formatStatsNumber(stats.articleCount),
            label = "المقالات"
        )
        StatBox(
            modifier = Modifier.weight(1f),
            icon = Icons.Default.TrendingUp,
            value = formatViews(stats.totalViews),
            label = "القراءات"
        )
        StatBox(
            modifier = Modifier.weight(1f),
            icon = Icons.Default.CalendarMonth,
            value = earliest,
            label = "عضو منذ"
        )
    }
}

@Composable
private fun StatBox(
    modifier: Modifier = Modifier,
    icon: ImageVector,
    value: String,
    label: String
) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .background(SabqTheme.colors.surface)
            .padding(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = SabqTheme.colors.primaryEnd.copy(alpha = 0.7f),
            modifier = Modifier.size(18.dp)
        )
        Text(
            text = value,
            fontSize = 15.sp,
            fontWeight = FontWeight.Bold,
            color = SabqTheme.colors.ink
        )
        Text(
            text = label,
            fontSize = 11.sp,
            fontWeight = FontWeight.Medium,
            color = SabqTheme.colors.tertiaryInk
        )
    }
}

@Composable
private fun AuthorCategoriesSection(categories: List<AuthorCategory>) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Text(
            text = "الأقسام المفضلة",
            style = SabqTheme.typography.meta.copy(
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold
            ),
            color = SabqTheme.colors.secondaryInk
        )

        LazyRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            contentPadding = PaddingValues(end = 16.dp)
        ) {
            items(categories, key = { it.id }) { cat ->
                val parsedColor = remember(cat.color) {
                    try {
                        if (!cat.color.isNullOrBlank()) {
                            Color(android.graphics.Color.parseColor(cat.color))
                        } else null
                    } catch (e: Exception) {
                        null
                    }
                }
                val tintColor = parsedColor ?: SabqTheme.colors.primaryEnd

                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(16.dp))
                        .background(tintColor.copy(alpha = 0.08f))
                        .padding(horizontal = 12.dp, vertical = 6.dp)
                ) {
                    Text(
                        text = "${cat.nameAr} (${cat.count})",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = tintColor
                    )
                }
            }
        }
    }
}

private fun formatStatsNumber(num: Int): String {
    return String.format(Locale.getDefault(), "%d", num)
}

private fun formatViews(num: Int): String {
    return when {
        num >= 1_000_000 -> String.format(Locale.getDefault(), "%.1fم", num / 1_000_000f)
        num >= 1_000 -> String.format(Locale.getDefault(), "%dألف", num / 1000)
        else -> num.toString()
    }
}
