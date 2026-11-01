package com.sabq.smart.feature.trending

import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft

import com.sabq.smart.ui.components.sabqNewsSurface

import androidx.compose.foundation.border

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material.icons.outlined.AccessTime
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.sabq.smart.data.Article
import com.sabq.smart.ui.components.FocalCachedAsyncImage
import com.sabq.smart.ui.components.SurfaceCard
import com.sabq.smart.ui.theme.SabqTheme

/**
 * "الأكثر تداولاً" — the dedicated trending screen. Ports iOS
 * `Screens/TrendingView.swift` 1:1. Layout:
 *
 *   1. Toolbar — back chevron + "الأكثر تداولاً" 17 sp bold rounded.
 *   2. Hero    — orange flame 28 sp + "الأكثر تداولاً" 22 sp bold +
 *                "الأخبار الأكثر مشاهدة في آخر 48 ساعة" 13 sp.
 *   3. Tags    — when present, "الوسوم الرائجة" label + FlowRow of
 *                primaryEnd-8% capsule pills; each navigates to the
 *                keyword screen.
 *   4. List    — SurfaceCard with ranked rows (number coloured by
 *                podium index 0→2 then tertiary, title 15 sp 2-line,
 *                category 11 sp primaryEnd, clock + relative date,
 *                64 dp focal-cropped thumbnail right-aligned).
 *   5. States  — 5-row skeleton card while loading, flame empty state
 *                when no articles, plain error message on failure.
 */
@Composable
fun TrendingScreen(
    onBack: () -> Unit,
    onArticleClick: (Article) -> Unit,
    onTagClick: (String) -> Unit,
    viewModel: TrendingViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(SabqTheme.colors.background),
    ) {
        TopBar(onBack = onBack)

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(
                horizontal = SabqTheme.dimens.screenPaddingH,
                vertical = 8.dp,
            ),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            item { HeroSection() }

            if (state.tags.isNotEmpty()) {
                item { TagsSection(tags = state.tags, onTagClick = onTagClick) }
            }

            when {
                state.isLoading -> item { LoadingSkeleton() }
                state.loadError != null && state.articles.isEmpty() ->
                    item { ErrorState(message = state.loadError!!, onRetry = viewModel::reload) }
                state.articles.isEmpty() -> item { TrendingEmptyState() }
                else -> item { ArticlesCard(articles = state.articles, onClick = onArticleClick) }
            }

            item { Spacer(modifier = Modifier.height(28.dp)) }
        }
    }
}

@Composable
private fun TopBar(onBack: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(44.dp)
                .sabqNewsSurface(CircleShape)
                .background(SabqTheme.colors.surface.copy(alpha = 0.92f))
                .clickable { onBack() },
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.KeyboardArrowLeft,
                contentDescription = "رجوع",
                tint = SabqTheme.colors.ink,
                modifier = Modifier.size(28.dp),
            )
        }
        Spacer(modifier = Modifier.weight(1f))
        Text(
            text = "الأكثر تداولاً",
            style = SabqTheme.typography.cardTitle.copy(fontSize = 17.sp, fontWeight = FontWeight.SemiBold),
            color = SabqTheme.colors.ink,
        )
        Spacer(modifier = Modifier.weight(1f))
        Spacer(modifier = Modifier.size(44.dp))
    }
}

@Composable
private fun HeroSection() {
    // iOS SabqPageIntro: سطر تعريف واحد تحت عنوان التنقّل.
    Text(
        text = "الأخبار الأكثر مشاهدة في آخر 48 ساعة",
        style = SabqTheme.typography.excerpt,
        color = SabqTheme.colors.secondaryInk,
        modifier = Modifier.fillMaxWidth(),
    )
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TagsSection(tags: List<String>, onTagClick: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        com.sabq.smart.ui.components.HomeSectionHeader(title = "الوسوم الرائجة")
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            tags.forEach { tag ->
                TagPill(tag = tag, onClick = { onTagClick(tag) })
            }
        }
    }
}

@Composable
private fun TagPill(tag: String, onClick: () -> Unit) {
    // iOS DiscoveryChip: كبسولة بيضاء بحدّ رفيع.
    val capsule = RoundedCornerShape(50)
    Box(
        modifier = Modifier
            .clip(capsule)
            .background(SabqTheme.colors.surface)
            .border(0.75.dp, SabqTheme.colors.outline, capsule)
            .clickable { onClick() }
            .padding(horizontal = 14.dp, vertical = 8.dp),
    ) {
        Text(
            text = tag,
            style = SabqTheme.typography.meta.copy(fontWeight = FontWeight.SemiBold),
            color = SabqTheme.colors.ink,
        )
    }
}

@Composable
private fun ArticlesCard(articles: List<Article>, onClick: (Article) -> Unit) {
    // iOS articlesSection: الصفوف على سطح أبيض واحد بفواصل رفيعة.
    val shape = RoundedCornerShape(SabqTheme.dimens.cardRadius)
    Column(
        Modifier
            .fillMaxWidth()
            .sabqNewsSurface(shape)
            .background(SabqTheme.colors.surface, shape)
            .padding(horizontal = 12.dp),
    ) {
        articles.forEachIndexed { index, article ->
            if (index > 0) com.sabq.smart.ui.components.SabqRowDivider()
            TrendingRow(index = index, article = article, onClick = { onClick(article) })
        }
    }
}

@Composable
private fun TrendingRow(index: Int, article: Article, onClick: () -> Unit) {
    // iOS rankedRow: رقم الترتيب في مربع أزرق هادئ، ثم صف بمقاس
    // CompactArticleRow (العنوان، شارة القسم والوقت، والصورة 104×78 يسارًا).
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() }
            .padding(vertical = 16.dp),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            modifier = Modifier
                .size(28.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(SabqTheme.colors.primaryEnd.copy(alpha = 0.08f)),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = "${index + 1}",
                style = SabqTheme.typography.meta.copy(fontWeight = FontWeight.SemiBold),
                color = SabqTheme.colors.primaryEnd,
            )
        }
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = article.title,
                style = SabqTheme.typography.compactCardTitle,
                color = SabqTheme.colors.ink,
                maxLines = 3,
                overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
            )
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                com.sabq.smart.ui.components.SabqCategoryPill(title = article.categoryLabel.ifBlank { article.category.title })
                Text(
                    text = article.dateFormatted,
                    style = SabqTheme.typography.metaSmall,
                    color = SabqTheme.colors.tertiaryInk,
                )
            }
        }
        val thumb = RoundedCornerShape(8.dp)
        Box(
            Modifier
                .size(width = 104.dp, height = 78.dp)
                .clip(thumb)
                .background(SabqTheme.colors.paleFill)
                .border(0.75.dp, SabqTheme.colors.separator, thumb),
        ) {
            if (!article.imageUrl.isNullOrBlank()) {
                FocalCachedAsyncImage(
                    url = article.imageUrl,
                    focalPoint = article.focalPoint,
                    modifier = Modifier.fillMaxSize(),
                )
            }
            com.sabq.smart.ui.components.BoxScopedAIImageBadgeOverlay(
                isVisible = article.isAiGeneratedImage,
                model = article.aiImageModel,
                inset = 4.dp,
                sizeScale = 0.65f,
                modifier = Modifier.align(Alignment.TopEnd),
            )
        }
    }
}

@Composable
private fun rankColor(index: Int): Color = when (index) {
    0 -> SabqTheme.colors.trendingAccent
    1 -> SabqTheme.colors.primaryEnd
    2 -> SabqTheme.colors.teal
    else -> SabqTheme.colors.tertiaryInk
}

@Composable
private fun LoadingSkeleton() {
    val shape = RoundedCornerShape(SabqTheme.dimens.cardRadius)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(SabqTheme.colors.surface, shape)
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        repeat(5) {
            Row(
                verticalAlignment = Alignment.Top,
                horizontalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                com.sabq.smart.ui.components.SkeletonCircle(diameter = 36.dp)
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    com.sabq.smart.ui.components.SkeletonBox(height = 14.dp, radius = 4.dp)
                    com.sabq.smart.ui.components.SkeletonBox(
                        width = 120.dp, height = 10.dp, radius = 4.dp,
                    )
                }
                com.sabq.smart.ui.components.SkeletonBox(
                    width = 64.dp, height = 64.dp, radius = 8.dp,
                )
            }
        }
    }
}

@Composable
private fun TrendingEmptyState() {
    // iOS uses shared EmptyStateView with flame icon + orange tint
    // (TrendingView.swift:21-26).
    com.sabq.smart.ui.components.EmptyStateView(
        icon = Icons.Filled.LocalFireDepartment,
        tint = SabqTheme.colors.trendingAccent,
        title = "لا توجد أخبار رائجة",
        subtitle = "تابعنا لاحقاً لمعرفة الأكثر تداولاً",
    )
}

@Composable
private fun ErrorState(message: String, onRetry: () -> Unit) {
    com.sabq.smart.ui.components.ErrorStateView(
        message = message,
        onRetry = onRetry,
    )
}
