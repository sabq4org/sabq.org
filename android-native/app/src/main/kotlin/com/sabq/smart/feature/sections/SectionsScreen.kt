package com.sabq.smart.feature.sections

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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.LocalOffer
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sabq.smart.data.ArticleCategory
import com.sabq.smart.ui.components.CompactScreenHeader
import com.sabq.smart.ui.components.SurfaceCard
import com.sabq.smart.ui.theme.SabqTheme

/**
 * "الأقسام" — 1:1 port of iOS `SectionsView`
 * (`Screens/SectionsView.swift`).
 *
 * Layout:
 *   1. CompactScreenHeader ("الأقسام" + "تصفح الأخبار حسب التصنيف")
 *   2. LazyVGrid 2-column of CategoryTile — one per ArticleCategory.
 *      The tile mirrors the iOS look from `CategoryTile`
 *      (SabqComponents.swift:1483-1550) and the Explore-screen
 *      Android version we shipped in PR #25: gradient background,
 *      tint stroke, chevron in the corner, subtle 1 dp shadow.
 *   3. "الكلمات المفتاحية" trending tags inside a SurfaceCard.
 *
 * On Android we don't have a `CategoryArticlesSheet` route yet; tile
 * tap is a TODO. Tag taps navigate to the existing
 * `SabqRoutes.KeywordArticles`.
 */
@Composable
fun SectionsScreen(
    onBack: () -> Unit,
    onCategoryClick: (ArticleCategory) -> Unit = {},
    onTagClick: (String) -> Unit = {},
    trendingTags: List<String> = DefaultFallbackTags,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(SabqTheme.colors.background),
    ) {
        SectionsTopBar(onBack = onBack)

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(
                start = SabqTheme.dimens.screenPaddingH,
                end = SabqTheme.dimens.screenPaddingH,
                top = 18.dp,
                bottom = SabqTheme.dimens.tabBarSafeArea,
            ),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            item {
                CompactScreenHeader(
                    title = "الأقسام",
                    subtitle = "تصفح الأخبار حسب التصنيف",
                )
            }

            // 2-column grid via chunked rows — Compose forbids nesting
            // LazyVerticalGrid inside an outer LazyColumn.
            val categories = ArticleCategory.entries
            item {
                Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    categories.chunked(2).forEach { pair ->
                        Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                            pair.forEach { category ->
                                CategoryTile(
                                    category = category,
                                    onClick = { onCategoryClick(category) },
                                    modifier = Modifier.weight(1f),
                                )
                            }
                            if (pair.size == 1) {
                                Spacer(modifier = Modifier.weight(1f))
                            }
                        }
                    }
                }
            }

            if (trendingTags.isNotEmpty()) {
                item { TrendingTagsCard(tags = trendingTags, onTagClick = onTagClick) }
            }
        }
    }
}

@Composable
private fun SectionsTopBar(onBack: () -> Unit) {
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
                modifier = Modifier.size(18.dp),
            )
        }
    }
}

/**
 * iOS `CategoryTile` (SabqComponents.swift:1483-1550) ported 1:1.
 * Same recipe Explore uses — kept screen-local rather than promoted
 * to a shared component because Explore's caller already inlined it
 * and the two could diverge later (e.g. SectionsScreen may add an
 * article count badge that Explore doesn't show).
 */
@Composable
private fun CategoryTile(
    category: ArticleCategory,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tint = category.tint()
    val shape = RoundedCornerShape(SabqTheme.dimens.tileRadius)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .shadow(
                elevation = 1.dp,
                shape = shape,
                ambientColor = Color.Transparent,
                spotColor = SabqTheme.colors.shadow,
            )
            .clip(shape)
            .background(color = SabqTheme.colors.surface, shape = shape)
            .clickable { onClick() }
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.Top,
        ) {
            Spacer(modifier = Modifier.weight(1f))
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(RoundedCornerShape(SabqTheme.dimens.badgeIconRadius))
                    .background(
                        Brush.linearGradient(
                            listOf(tint.copy(alpha = 0.12f), tint.copy(alpha = 0.06f)),
                        ),
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = category.icon,
                    contentDescription = null,
                    tint = tint,
                    modifier = Modifier.size(18.dp),
                )
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                text = category.title,
                style = SabqTheme.typography.tileTitle,
                color = SabqTheme.colors.ink,
            )
            Text(
                text = category.subtitle,
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
                color = SabqTheme.colors.tertiaryInk,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TrendingTagsCard(tags: List<String>, onTagClick: (String) -> Unit) {
    SurfaceCard(accent = SabqTheme.colors.primaryEnd) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(
                verticalAlignment = Alignment.Top,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text(
                        text = "الكلمات المفتاحية",
                        style = SabqTheme.typography.sectionHeader,
                        color = SabqTheme.colors.ink,
                    )
                    Text(
                        text = "أكثر المواضيع بحثاً",
                        fontSize = 13.sp,
                        color = SabqTheme.colors.secondaryInk,
                    )
                }
                Box(
                    modifier = Modifier
                        .size(44.dp)
                        .clip(RoundedCornerShape(SabqTheme.dimens.badgeIconRadius))
                        .background(SabqTheme.colors.primaryEnd.copy(alpha = 0.12f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Filled.LocalOffer,
                        contentDescription = null,
                        tint = SabqTheme.colors.primaryEnd,
                        modifier = Modifier.size(18.dp),
                    )
                }
            }

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
}

@Composable
private fun TagPill(tag: String, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .clip(CircleShape)
            .background(SabqTheme.colors.primaryEnd.copy(alpha = 0.08f))
            .clickable { onClick() }
            .padding(horizontal = 14.dp, vertical = 8.dp),
    ) {
        Text(
            text = tag,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            color = SabqTheme.colors.primaryStart,
        )
    }
}

/**
 * iOS fallback tags from SectionsView.swift:98-100. When the trending
 * API hasn't loaded yet (or returns empty) we render this static list
 * so the section never goes blank.
 */
private val DefaultFallbackTags = listOf(
    "رؤية 2030",
    "نيوم",
    "كأس العالم 2034",
    "أرامكو",
    "ذكاء اصطناعي",
    "موسم الرياض",
    "تاسي",
    "الدوري",
    "سياحة",
    "فضاء",
)
