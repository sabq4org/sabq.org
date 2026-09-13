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
import androidx.compose.foundation.layout.height
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.foundation.border
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material3.CircularProgressIndicator
import com.sabq.smart.ui.components.EmptyStateView
import com.sabq.smart.ui.components.ErrorStateView
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
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
                // حالة الخطأ الموحدة (أيقونة + رسالة القارئ + إعادة المحاولة)
                // كما في الوسم والرائج — نقل #1573.
                ErrorStateView(
                    message = s.message,
                    onRetry = { viewModel.retry() },
                    modifier = Modifier.align(Alignment.Center).padding(32.dp),
                )
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
                    if (s.articles.isEmpty()) {
                        item {
                            EmptyStateView(
                                icon = visual.icon,
                                tint = visual.tint(),
                                title = "لا أخبار في هذا القسم حاليًا",
                                subtitle = "تابع الأقسام الأخرى أو عد لاحقًا.",
                                modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                            )
                        }
                    }
                    item {
                        SurfaceCard {
                            s.articles.forEachIndexed { idx, article ->
                                key(article.id) {
                                    if (idx > 0) {
                                        HorizontalDivider(color = SabqTheme.colors.outline)
                                    }
                                    CompactArticleRow(
                                        article = article,
                                        isBookmarked = false,
                                        onBookmark = {},
                                        onClick = { onArticleClick(article) },
                                        // رأس الصفحة يسمّي القسم — لا تكرار في البطاقات (#1642)
                                        showsCategory = false,
                                    )
                                }
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
    // شريط علوي بلون القسم + توهّج شعاعي 12٪ من الزاوية الأمامية + مسار
    // «الرئيسية › التصنيفات › القسم» + مربع أيقونة 36 — نقل الويب 8afef17.
    val topPadding = androidx.compose.foundation.layout.WindowInsets
        .statusBars.asPaddingValues().calculateTopPadding() + 56.dp
    val tint = visual.tint()
    val shape = RoundedCornerShape(16.dp)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = topPadding)
            .clip(shape)
            .background(SabqTheme.colors.publicSurface, shape)
            .background(
                androidx.compose.ui.graphics.Brush.radialGradient(
                    colors = listOf(tint.copy(alpha = 0.12f), androidx.compose.ui.graphics.Color.Transparent),
                    center = androidx.compose.ui.geometry.Offset(Float.POSITIVE_INFINITY, 0f),
                    radius = 900f,
                ),
            )
            .border(1.dp, SabqTheme.colors.outline, shape),
    ) {
        Box(Modifier.fillMaxWidth().height(3.dp).background(tint))
        Column(
            modifier = Modifier.padding(horizontal = 16.dp).padding(top = 12.dp, bottom = 12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Icon(Icons.Outlined.Home, contentDescription = null, tint = SabqTheme.colors.secondaryInk, modifier = Modifier.size(12.dp))
                Text("الرئيسية", fontSize = 12.sp, color = SabqTheme.colors.secondaryInk)
                Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, contentDescription = null, tint = SabqTheme.colors.secondaryInk.copy(alpha = 0.6f), modifier = Modifier.size(12.dp))
                Text("التصنيفات", fontSize = 12.sp, color = SabqTheme.colors.secondaryInk)
                Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, contentDescription = null, tint = SabqTheme.colors.secondaryInk.copy(alpha = 0.6f), modifier = Modifier.size(12.dp))
                Text(name, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = SabqTheme.colors.ink, maxLines = 1)
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(tint.copy(alpha = 0.12f))
                        .border(1.dp, tint.copy(alpha = 0.30f), RoundedCornerShape(8.dp)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(visual.icon, contentDescription = null, tint = tint, modifier = Modifier.size(18.dp))
                }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.weight(1f)) {
                    Text(name, fontSize = 22.sp, fontWeight = FontWeight.Bold, color = SabqTheme.colors.ink)
                    StatusChip(title = "$count خبر", tint = tint)
                }
            }
        }
    }
}
