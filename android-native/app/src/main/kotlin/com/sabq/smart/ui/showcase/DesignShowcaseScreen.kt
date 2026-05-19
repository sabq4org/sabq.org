package com.sabq.smart.ui.showcase

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import com.sabq.smart.data.Article
import com.sabq.smart.data.ArticleCategory
import com.sabq.smart.nav.AppTab
import com.sabq.smart.ui.components.BreakingPill
import com.sabq.smart.ui.components.CategoryChip
import com.sabq.smart.ui.components.CompactArticleRow
import com.sabq.smart.ui.components.DetailLabelPill
import com.sabq.smart.ui.components.FeaturedArticleCard
import com.sabq.smart.ui.components.ImageFocalPoint
import com.sabq.smart.ui.components.PrimaryCTAButton
import com.sabq.smart.ui.components.SabqTabBar
import com.sabq.smart.ui.components.SmallActionButton
import com.sabq.smart.ui.components.SmallSquareBadge
import com.sabq.smart.ui.components.SquareIconBadge
import com.sabq.smart.ui.components.StatusChip
import com.sabq.smart.ui.components.SurfaceCard
import com.sabq.smart.ui.theme.SabqTheme

/**
 * Showcase screen — visual proof that every primitive in the design
 * system renders correctly. Use side-by-side against iOS to catch
 * token drift early.
 */
@Composable
fun DesignShowcaseScreen() {
    var selectedTab by remember { mutableStateOf(AppTab.Home) }
    var selectedChip by remember { mutableStateOf("الكل") }
    var bookmarkedIds by remember { mutableStateOf(setOf<String>()) }

    val chipOptions = listOf("الكل", "محلية", "رياضة", "اقتصاد", "تقنية", "ثقافة", "دولية")
    val mockArticles = remember { mockArticles() }
    val featured = mockArticles.first()

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(SabqTheme.colors.background),
    ) {
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding(),
            contentPadding = PaddingValues(
                start = SabqTheme.dimens.screenPaddingH,
                end = SabqTheme.dimens.screenPaddingH,
                top = 24.dp,
                bottom = 120.dp, // breathing room for the floating tab bar
            ),
            verticalArrangement = Arrangement.spacedBy(28.dp),
        ) {
            item { sectionTypography() }

            item {
                Section(title = "Chips", subtitle = "CategoryChip · StatusChip · DetailLabelPill · BreakingPill") {
                    chipsRow(chipOptions.take(4), selectedChip) { selectedChip = it }
                    chipsRow(chipOptions.drop(4), selectedChip) { selectedChip = it }
                    Spacer(Modifier.height(4.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        StatusChip(title = "محلية", tint = SabqTheme.colors.primaryEnd)
                        StatusChip(title = "رياضة", tint = SabqTheme.colors.leaf)
                        StatusChip(title = "اقتصاد", tint = SabqTheme.colors.gold)
                        StatusChip(title = "تقنية", tint = SabqTheme.colors.teal)
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        DetailLabelPill(title = "موثَّق", tint = SabqTheme.colors.primaryEnd, icon = Icons.Filled.Verified)
                        DetailLabelPill(title = "مقال رأي", tint = SabqTheme.colors.gold)
                        BreakingPill()
                    }
                }
            }

            item {
                Section(title = "Badges", subtitle = "SmallSquareBadge 44dp · SquareIconBadge 72dp") {
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        SmallSquareBadge(icon = ArticleCategory.Sports.icon, tint = SabqTheme.colors.leaf)
                        SmallSquareBadge(icon = ArticleCategory.World.icon, tint = SabqTheme.colors.sky)
                        SmallSquareBadge(icon = ArticleCategory.Business.icon, tint = SabqTheme.colors.gold)
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        SquareIconBadge(icon = ArticleCategory.Sports.icon, tint = SabqTheme.colors.leaf)
                        SquareIconBadge(icon = ArticleCategory.Community.icon, tint = SabqTheme.colors.coral)
                        SquareIconBadge(icon = ArticleCategory.World.icon, tint = SabqTheme.colors.sky)
                    }
                }
            }

            item {
                Section(title = "Buttons", subtitle = "SmallActionButton · PrimaryCTAButton") {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        SmallActionButton(
                            title = "عرض الكل",
                            icon = Icons.AutoMirrored.Filled.ArrowForward,
                            tint = SabqTheme.colors.primaryEnd,
                            onClick = {},
                        )
                        SmallActionButton(
                            title = "حذف",
                            icon = Icons.AutoMirrored.Filled.ArrowForward,
                            tint = SabqTheme.colors.coral,
                            onClick = {},
                        )
                    }
                    PrimaryCTAButton(title = "متابعة القراءة", icon = Icons.Filled.PlayArrow, onClick = {})
                    PrimaryCTAButton(title = "غير متاح", icon = Icons.Filled.PlayArrow, enabled = false, onClick = {})
                }
            }

            item {
                Section(title = "FeaturedArticleCard", subtitle = "الكرت البارز — للكاروسيل أعلى الرئيسية") {
                    FeaturedArticleCard(
                        article = featured,
                        isBookmarked = featured.id in bookmarkedIds,
                        onBookmark = { bookmarkedIds = bookmarkedIds.toggle(featured.id) },
                        onClick = {},
                    )
                }
            }

            item {
                Section(title = "Latest", subtitle = "CompactArticleRow — تابع الأحدث") {
                    SurfaceCard {
                        mockArticles.drop(1).forEachIndexed { index, article ->
                            if (index > 0) {
                                HorizontalDivider(
                                    color = SabqTheme.colors.outline.copy(alpha = 0.3f),
                                    thickness = 0.5.dp,
                                )
                            }
                            CompactArticleRow(
                                article = article,
                                isBookmarked = article.id in bookmarkedIds,
                                onBookmark = { bookmarkedIds = bookmarkedIds.toggle(article.id) },
                                onClick = {},
                            )
                        }
                    }
                }
            }

            item {
                Section(title = "SurfaceCard", subtitle = "الحاوية الأساسية لكل المحتوى") {
                    SurfaceCard(accent = SabqTheme.colors.sky) {
                        Text(
                            "ولي العهد يلتقي وفداً اقتصادياً صينياً في الرياض ضمن مباحثات استثمارية",
                            style = SabqTheme.typography.cardTitle,
                            color = SabqTheme.colors.ink,
                        )
                        Text(
                            "تركّز المباحثات على فرص الاستثمار في قطاعات الطاقة المتجددة والذكاء الاصطناعي والبنية التحتية اللوجستية ضمن رؤية المملكة 2030.",
                            style = SabqTheme.typography.excerpt,
                            color = SabqTheme.colors.secondaryInk,
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            StatusChip(title = "محلية", tint = SabqTheme.colors.sky)
                            DetailLabelPill(title = "موثَّق", tint = SabqTheme.colors.primaryEnd, icon = Icons.Filled.Verified)
                        }
                    }
                }
            }
        }

        // Floating TabBar — positioned absolutely above content, like iOS.
        Box(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .navigationBarsPadding()
                .padding(bottom = 12.dp),
        ) {
            SabqTabBar(
                selectedTab = selectedTab,
                onSelect = { selectedTab = it },
            )
        }
    }
}

private fun Set<String>.toggle(id: String) =
    if (contains(id)) this - id else this + id

@Composable
private fun sectionTypography() {
    Section(title = "Typography", subtitle = "IBM Plex Sans Arabic · Downloadable Fonts") {
        Text("عنوان الشاشة", style = SabqTheme.typography.screenTitle, color = SabqTheme.colors.ink)
        Text("عنوان قسم", style = SabqTheme.typography.sectionHeader, color = SabqTheme.colors.ink)
        Text("عنوان كرت بارز — للقصص الرئيسية في الكاروسيل", style = SabqTheme.typography.featuredCardTitle, color = SabqTheme.colors.ink)
        Text("عنوان كرت مدمج — للأخبار الأحدث", style = SabqTheme.typography.compactCardTitle, color = SabqTheme.colors.ink)
        Text("مقتطف — لمحة موجزة من الخبر تظهر تحت العنوان مباشرة", style = SabqTheme.typography.excerpt, color = SabqTheme.colors.secondaryInk)
        Text("نص المقال — هذا نص تجريبي لطول الفقرات في الخبر الكامل، ليتأكد أن المسافات بين الأسطر مناسبة وأن القراءة مريحة على الجوال.", style = SabqTheme.typography.body, color = SabqTheme.colors.ink)
        Text("منذ ٣ ساعات • ٤ دقائق قراءة", style = SabqTheme.typography.meta, color = SabqTheme.colors.tertiaryInk)
    }
}

@Composable
private fun chipsRow(labels: List<String>, selected: String, onSelect: (String) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        labels.forEach { label ->
            CategoryChip(title = label, isSelected = selected == label, onClick = { onSelect(label) })
        }
    }
}

@Composable
private fun Section(
    title: String,
    subtitle: String,
    content: @Composable () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(title, style = SabqTheme.typography.sectionHeader, color = SabqTheme.colors.ink)
            Text(subtitle, style = SabqTheme.typography.meta, color = SabqTheme.colors.tertiaryInk)
        }
        content()
    }
}

@Suppress("unused")
private val _markers = listOf<Any>(RoundedCornerShape(0.dp), Modifier.clip(RoundedCornerShape(0.dp)))

/** Mock articles using real Sabq CDN URLs for visual fidelity. */
private fun mockArticles(): List<Article> = listOf(
    Article(
        id = "1",
        title = "ولي العهد يلتقي وفداً اقتصادياً صينياً في الرياض ضمن مباحثات استثمارية",
        excerpt = "تركّز المباحثات على فرص الاستثمار في قطاعات الطاقة المتجددة والذكاء الاصطناعي والبنية التحتية اللوجستية.",
        category = ArticleCategory.Local,
        imageUrl = "https://imagedelivery.net/zb6sxRkAU8YYxsfvJlt2KQ/1500x844/feature",
        focalPoint = ImageFocalPoint(0.5f, 0.4f),
        readingTime = "4 دقائق",
        dateFormatted = "اليوم 09:42",
        isFeatured = true,
    ),
    Article(
        id = "2",
        title = "الهلال يتفوق على النصر في كلاسيكو الرياض بثلاثية تاريخية",
        excerpt = "مباراة وصفها الجمهور بالأقوى منذ سنوات.",
        category = ArticleCategory.Sports,
        imageUrl = null,
        readingTime = "3 دقائق",
        dateFormatted = "منذ ساعتين",
        isBreaking = true,
    ),
    Article(
        id = "3",
        title = "مؤشر تاسي يقفز 1.2% مع إعلان نتائج الربع الأخير لكبرى الشركات",
        excerpt = "ارتفاع تقوده شركات الطاقة والبتروكيماويات.",
        category = ArticleCategory.Business,
        imageUrl = null,
        readingTime = "2 دقيقة",
        dateFormatted = "منذ 3 ساعات",
    ),
    Article(
        id = "4",
        title = "أبل تكشف عن نظارة Vision Pro 2 بدقة أعلى وسعر أقل في حدث خاص",
        excerpt = "النسخة الجديدة أخف بنسبة 30% وأرخص بنحو الثلث.",
        category = ArticleCategory.Technology,
        imageUrl = null,
        readingTime = "5 دقائق",
        dateFormatted = "أمس",
    ),
    Article(
        id = "5",
        title = "مهرجان الجنادرية يعود بعد ست سنوات بحلّة عصرية",
        excerpt = "الحدث يفتح أبوابه للزوار من جميع أنحاء العالم في نسخته الجديدة.",
        category = ArticleCategory.Culture,
        imageUrl = null,
        readingTime = "4 دقائق",
        dateFormatted = "أمس",
    ),
)
