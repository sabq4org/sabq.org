package com.sabq.smart.feature.brief

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.AutoStories
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ChromeReaderMode
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material.icons.filled.Newspaper
import androidx.compose.material.icons.filled.Psychology
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material.icons.filled.WbSunny
import androidx.compose.material.icons.outlined.BarChart
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import com.sabq.smart.data.Article
import com.sabq.smart.data.MemberInterest
import com.sabq.smart.data.User
import com.sabq.smart.ui.components.FocalCachedAsyncImage
import com.sabq.smart.ui.theme.SabqTheme
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit

/**
 * "موجزك في سبق" — two-mode landing reached by tapping the home
 * greeting block. Ports iOS `Screens/DailyBriefView.swift` 1:1:
 *
 *  - **Guest** (no session): value-prop landing with hero, 2×2 feature
 *    tiles, interests preview chips, benefits list, sign-up + sign-in
 *    CTAs.
 *  - **Member** (signed in): personal dashboard — hero with avatar,
 *    role pill, email, three stat tiles (bookmarks/interests/days),
 *    interests card with "تعديل" link, optional suggestions rail
 *    (filtered by interest slug), and a soft mood card.
 *
 * The interests-edit affordance pushes [InterestsPickerScreen] via
 * the parent's [onPickInterests]; the picker pops back here on save and
 * the VM's profile refresh propagates the new interests automatically.
 */
@Composable
fun DailyBriefScreen(
    onBack: () -> Unit,
    onLogin: () -> Unit,
    onSignUp: () -> Unit,
    onPickInterests: () -> Unit,
    onArticleClick: (Article) -> Unit,
    viewModel: DailyBriefViewModel = hiltViewModel(),
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
            contentPadding = PaddingValues(horizontal = 18.dp, vertical = 18.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            val user = state.user
            if (user != null) {
                memberDashboard(
                    user = user,
                    bookmarksCount = state.bookmarksCount,
                    suggestions = state.suggestions,
                    onPickInterests = onPickInterests,
                    onArticleClick = onArticleClick,
                )
            } else {
                guestLanding(onSignUp = onSignUp, onLogin = onLogin)
            }
            item { Spacer(modifier = Modifier.height(40.dp)) }
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
        Spacer(modifier = Modifier.weight(1f))
        Text(
            text = "موجزك",
            fontSize = 17.sp,
            fontWeight = FontWeight.Bold,
            color = SabqTheme.colors.ink,
        )
        Spacer(modifier = Modifier.weight(1f))
        Spacer(modifier = Modifier.size(40.dp))
    }
}

// ────────────────────── Member dashboard ──────────────────────

private fun androidx.compose.foundation.lazy.LazyListScope.memberDashboard(
    user: User,
    bookmarksCount: Int,
    suggestions: List<Article>,
    onPickInterests: () -> Unit,
    onArticleClick: (Article) -> Unit,
) {
    item { MemberHero(user = user) }
    item { StatsRow(bookmarksCount = bookmarksCount, user = user) }
    item { InterestsCard(interests = user.interests, onEdit = onPickInterests) }
    if (suggestions.isNotEmpty()) {
        item { SuggestionsSection(articles = suggestions, onArticleClick = onArticleClick) }
    }
    item { MoodCard(user = user) }
}

@Composable
private fun MemberHero(user: User) {
    val shape = RoundedCornerShape(SabqTheme.dimens.cardRadius)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            // iOS uses `.fill(.ultraThinMaterial)` here
            // (DailyBriefView.swift:291) — true blurred frosted glass.
            // Compose has no native blur prior to API 31 + Material 3
            // BlurEffect; the closest approximation is a translucent
            // surface that lets the background tint bleed through.
            // 0.85 alpha sits between fully opaque and fully see-through,
            // matching the visual weight iOS lands on.
            .background(SabqTheme.colors.surface.copy(alpha = 0.85f), shape)
            .background(
                Brush.linearGradient(
                    listOf(
                        SabqTheme.colors.primaryEnd.copy(alpha = 0.08f),
                        SabqTheme.colors.sky.copy(alpha = 0.04f),
                    ),
                ),
                shape,
            )
            .border(width = 0.5.dp, color = SabqTheme.colors.primaryEnd.copy(alpha = 0.18f), shape = shape)
            .padding(18.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Avatar(user = user)
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(
                text = user.displayName,
                fontSize = 18.sp,
                fontWeight = FontWeight.Black,
                color = SabqTheme.colors.ink,
                maxLines = 1,
            )
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Icon(
                    imageVector = Icons.Filled.AutoAwesome,
                    contentDescription = null,
                    tint = SabqTheme.colors.primaryEnd,
                    modifier = Modifier.size(11.dp),
                )
                Text(
                    text = user.localizedRole,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = SabqTheme.colors.primaryEnd,
                    maxLines = 1,
                )
            }
            user.email?.takeIf { it.isNotBlank() }?.let { email ->
                Text(
                    text = email,
                    fontSize = 11.sp,
                    color = SabqTheme.colors.tertiaryInk,
                    maxLines = 1,
                )
            }
        }
    }
}

@Composable
private fun Avatar(user: User) {
    val initial = user.displayName.firstOrNull()?.toString() ?: "س"
    Box(
        modifier = Modifier
            .size(64.dp)
            .clip(CircleShape)
            .background(SabqTheme.colors.primaryEnd.copy(alpha = 0.15f))
            .border(width = 1.5.dp, color = SabqTheme.colors.primaryEnd.copy(alpha = 0.3f), shape = CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        if (!user.avatarUrl.isNullOrBlank()) {
            AsyncImage(
                model = user.avatarUrl,
                contentDescription = null,
                modifier = Modifier
                    .size(64.dp)
                    .clip(CircleShape),
            )
        } else {
            Text(
                text = initial,
                fontSize = 22.sp,
                fontWeight = FontWeight.Black,
                color = SabqTheme.colors.primaryEnd,
            )
        }
    }
}

@Composable
private fun StatsRow(bookmarksCount: Int, user: User) {
    val daysSinceJoined = remember(user.createdAt) { daysSinceJoined(user.createdAt) }
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        StatTile(
            modifier = Modifier.weight(1f),
            value = "$bookmarksCount",
            label = "محفوظ",
            icon = Icons.Filled.Bookmark,
            tint = SabqTheme.colors.primaryEnd,
        )
        StatTile(
            modifier = Modifier.weight(1f),
            value = "${user.interests.size}",
            label = "اهتماماتك",
            icon = Icons.Filled.Tune,
            tint = SabqTheme.colors.teal,
        )
        StatTile(
            modifier = Modifier.weight(1f),
            value = daysSinceJoined?.toString() ?: "—",
            label = "يوم معك",
            icon = Icons.Filled.CalendarToday,
            tint = SabqTheme.colors.gold,
        )
    }
}

@Composable
private fun StatTile(
    modifier: Modifier = Modifier,
    value: String,
    label: String,
    icon: ImageVector,
    tint: Color,
) {
    val shape = RoundedCornerShape(SabqTheme.dimens.tileRadius)
    Column(
        modifier = modifier
            .clip(shape)
            .background(SabqTheme.colors.surface, shape)
            .border(width = 0.5.dp, color = tint.copy(alpha = 0.16f), shape = shape)
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = tint,
            modifier = Modifier.size(14.dp),
        )
        Text(
            text = value,
            fontSize = 22.sp,
            fontWeight = FontWeight.Black,
            color = SabqTheme.colors.ink,
        )
        Text(
            text = label,
            fontSize = 11.sp,
            fontWeight = FontWeight.Medium,
            color = SabqTheme.colors.secondaryInk,
            maxLines = 1,
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun InterestsCard(interests: List<MemberInterest>, onEdit: () -> Unit) {
    val shape = RoundedCornerShape(SabqTheme.dimens.tileRadius)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(SabqTheme.colors.surface, shape)
            .border(width = 0.5.dp, color = SabqTheme.colors.outline.copy(alpha = 0.35f), shape = shape)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                imageVector = Icons.Filled.Tune,
                contentDescription = null,
                tint = SabqTheme.colors.primaryEnd,
                modifier = Modifier.size(14.dp),
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = "اهتماماتك",
                fontSize = 15.sp,
                fontWeight = FontWeight.Black,
                color = SabqTheme.colors.ink,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = if (interests.isEmpty()) "اختر اهتماماتك" else "تعديل",
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                color = SabqTheme.colors.primaryEnd,
                modifier = Modifier.clickable { onEdit() },
            )
        }
        if (interests.isEmpty()) {
            Text(
                text = "لم تختر بعد اهتماماتك. اختر بضع تصنيفات لنقترح عليك أهم الأخبار في كل زيارة.",
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                color = SabqTheme.colors.secondaryInk,
                lineHeight = 19.sp,
            )
            Box(
                modifier = Modifier
                    .clip(CircleShape)
                    .background(SabqTheme.colors.primaryEnd)
                    .clickable { onEdit() }
                    .padding(horizontal = 14.dp, vertical = 10.dp),
            ) {
                Text(
                    text = "اختر اهتماماتك الآن",
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                )
            }
        } else {
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                interests.forEach { interest ->
                    Box(
                        modifier = Modifier
                            .clip(CircleShape)
                            .background(SabqTheme.colors.primaryEnd.copy(alpha = 0.12f))
                            .padding(horizontal = 11.dp, vertical = 7.dp),
                    ) {
                        Text(
                            text = interest.name ?: interest.slug ?: "—",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = SabqTheme.colors.primaryEnd,
                        )
                    }
                }
            }
            Text(
                text = "${interests.size} تصنيف نختار لك منه أخباراً يومية",
                fontSize = 11.sp,
                fontWeight = FontWeight.Medium,
                color = SabqTheme.colors.tertiaryInk,
            )
        }
    }
}

@Composable
private fun SuggestionsSection(articles: List<Article>, onArticleClick: (Article) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                imageVector = Icons.Filled.AutoAwesome,
                contentDescription = null,
                tint = SabqTheme.colors.coral,
                modifier = Modifier.size(14.dp),
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = "اقتراحات لك من اهتماماتك",
                fontSize = 15.sp,
                fontWeight = FontWeight.Black,
                color = SabqTheme.colors.ink,
            )
        }
        LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            items(items = articles, key = { it.bookmarkKey }) { article ->
                SuggestionCard(article = article, onClick = { onArticleClick(article) })
            }
        }
    }
}

@Composable
private fun SuggestionCard(article: Article, onClick: () -> Unit) {
    val cardShape = RoundedCornerShape(SabqTheme.dimens.tileRadius)
    Column(
        modifier = Modifier
            .width(220.dp)
            .clickable { onClick() },
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(
            modifier = Modifier
                .width(220.dp)
                .height(124.dp)
                .clip(cardShape)
                .background(article.category.tint().copy(alpha = 0.15f)),
        ) {
            if (!article.imageUrl.isNullOrBlank()) {
                FocalCachedAsyncImage(
                    url = article.imageUrl,
                    focalPoint = article.focalPoint,
                    modifier = Modifier
                        .fillMaxSize()
                        .clip(cardShape),
                )
            }
            com.sabq.smart.ui.components.BoxScopedAIImageBadgeOverlay(
                isVisible = article.isAiGeneratedImage,
                model = article.aiImageModel,
                inset = 6.dp,
                sizeScale = 0.75f,
                modifier = Modifier.align(Alignment.TopEnd),
            )
        }
        Text(
            text = article.category.title,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            color = article.category.tint(),
        )
        Text(
            text = article.title,
            fontSize = 13.5.sp,
            fontWeight = FontWeight.Bold,
            color = SabqTheme.colors.ink,
            maxLines = 3,
            lineHeight = 18.sp,
        )
    }
}

@Composable
private fun MoodCard(user: User) {
    val descriptor = remember(user.interests) { inferMood(user.interests) }
    val tint = when (descriptor.tintKey) {
        MoodTint.Primary -> SabqTheme.colors.primaryEnd
        MoodTint.Teal -> SabqTheme.colors.teal
        MoodTint.Coral -> SabqTheme.colors.coral
        MoodTint.Gold -> SabqTheme.colors.gold
    }
    val shape = RoundedCornerShape(SabqTheme.dimens.tileRadius)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(tint.copy(alpha = 0.06f), shape)
            .border(width = 0.5.dp, color = tint.copy(alpha = 0.20f), shape = shape)
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(
            modifier = Modifier
                .size(46.dp)
                .clip(CircleShape)
                .background(tint.copy(alpha = 0.14f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = descriptor.icon,
                contentDescription = null,
                tint = tint,
                modifier = Modifier.size(20.dp),
            )
        }
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(3.dp),
        ) {
            Text(
                text = "مزاجك القرائي اليوم",
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold,
                color = SabqTheme.colors.tertiaryInk,
            )
            Text(
                text = descriptor.label,
                fontSize = 15.sp,
                fontWeight = FontWeight.Black,
                color = SabqTheme.colors.ink,
            )
            Text(
                text = descriptor.subtitle,
                fontSize = 12.sp,
                color = SabqTheme.colors.secondaryInk,
                lineHeight = 17.sp,
                maxLines = 2,
            )
        }
    }
}

// ────────────────────── Guest landing ──────────────────────

private fun androidx.compose.foundation.lazy.LazyListScope.guestLanding(
    onSignUp: () -> Unit,
    onLogin: () -> Unit,
) {
    item { GuestHero() }
    item { ValueGrid() }
    item { GuestInterestsPreview() }
    item { GuestBenefits() }
    item { GuestActions(onSignUp = onSignUp, onLogin = onLogin) }
}

@Composable
private fun GuestHero() {
    val shape = RoundedCornerShape(SabqTheme.dimens.cardRadius)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(SabqTheme.colors.surface, shape)
            .background(
                Brush.linearGradient(
                    listOf(
                        SabqTheme.colors.primaryEnd.copy(alpha = 0.08f),
                        SabqTheme.colors.sky.copy(alpha = 0.04f),
                    ),
                ),
                shape,
            )
            .border(width = 0.5.dp, color = SabqTheme.colors.primaryEnd.copy(alpha = 0.18f), shape = shape)
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(
            modifier = Modifier
                .size(74.dp)
                .clip(CircleShape)
                .background(SabqTheme.colors.primaryEnd.copy(alpha = 0.12f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Filled.AutoAwesome,
                contentDescription = null,
                tint = SabqTheme.colors.primaryEnd,
                modifier = Modifier.size(32.dp),
            )
        }
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                text = "موجزك في سبق",
                fontSize = 26.sp,
                fontWeight = FontWeight.Black,
                color = SabqTheme.colors.ink,
            )
            Text(
                text = "صفحة شخصية تبدأ من اهتماماتك: تختار ما يهمك، وسبق ترتّب لك موجزاً يومياً، توصيات، وإحصاءات قراءة واضحة.",
                fontSize = 14.sp,
                color = SabqTheme.colors.secondaryInk,
                lineHeight = 21.sp,
            )
        }
    }
}

@Composable
private fun ValueGrid() {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            FeatureTile(
                modifier = Modifier.weight(1f),
                title = "موجز يومي",
                subtitle = "أهم ما يهمك في دقائق",
                icon = Icons.Filled.ChromeReaderMode,
                tint = SabqTheme.colors.teal,
            )
            FeatureTile(
                modifier = Modifier.weight(1f),
                title = "اقتراحات ذكية",
                subtitle = "توصيات من سبق AI",
                icon = Icons.Filled.AutoAwesome,
                tint = SabqTheme.colors.coral,
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            FeatureTile(
                modifier = Modifier.weight(1f),
                title = "محفوظاتك",
                subtitle = "اقرأها من أي جهاز",
                icon = Icons.Filled.Bookmark,
                tint = SabqTheme.colors.primaryEnd,
            )
            FeatureTile(
                modifier = Modifier.weight(1f),
                title = "إحصاءات قراءتك",
                subtitle = "مقالاتك ووقتك",
                icon = Icons.Outlined.BarChart,
                tint = SabqTheme.colors.gold,
            )
        }
    }
}

@Composable
private fun FeatureTile(
    modifier: Modifier = Modifier,
    title: String,
    subtitle: String,
    icon: ImageVector,
    tint: Color,
) {
    val shape = RoundedCornerShape(SabqTheme.dimens.tileRadius)
    Column(
        modifier = modifier
            .clip(shape)
            .background(SabqTheme.colors.surface, shape)
            .border(width = 0.5.dp, color = tint.copy(alpha = 0.16f), shape = shape)
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(9.dp),
    ) {
        Box(
            modifier = Modifier
                .size(34.dp)
                .clip(CircleShape)
                .background(tint.copy(alpha = 0.13f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(imageVector = icon, contentDescription = null, tint = tint, modifier = Modifier.size(16.dp))
        }
        Text(
            text = title,
            fontSize = 14.sp,
            fontWeight = FontWeight.Black,
            color = SabqTheme.colors.ink,
        )
        Text(
            text = subtitle,
            fontSize = 11.sp,
            color = SabqTheme.colors.secondaryInk,
            maxLines = 2,
            lineHeight = 16.sp,
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun GuestInterestsPreview() {
    val shape = RoundedCornerShape(SabqTheme.dimens.tileRadius)
    val sampleInterests = remember {
        listOf(
            "محليات", "اقتصاد", "رياضة", "تقنية",
            "رأي", "لحظة بلحظة", "العالم", "صحة",
        )
    }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(SabqTheme.colors.surface, shape)
            .border(width = 0.5.dp, color = SabqTheme.colors.outline.copy(alpha = 0.35f), shape = shape)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                imageVector = Icons.Filled.Tune,
                contentDescription = null,
                tint = SabqTheme.colors.primaryEnd,
                modifier = Modifier.size(14.dp),
            )
            Spacer(modifier = Modifier.width(7.dp))
            Text(
                text = "ابدأ باختيار ما يهمك",
                fontSize = 15.sp,
                fontWeight = FontWeight.Black,
                color = SabqTheme.colors.ink,
            )
        }
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            sampleInterests.forEach { item ->
                Box(
                    modifier = Modifier
                        .clip(CircleShape)
                        .background(SabqTheme.colors.primaryEnd.copy(alpha = 0.08f))
                        .padding(horizontal = 10.dp, vertical = 7.dp),
                ) {
                    Text(
                        text = item,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = SabqTheme.colors.primaryEnd,
                    )
                }
            }
        }
    }
}

@Composable
private fun GuestBenefits() {
    val shape = RoundedCornerShape(SabqTheme.dimens.tileRadius)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(SabqTheme.colors.primaryEnd.copy(alpha = 0.05f), shape)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            text = "بعد التسجيل تحصل على",
            fontSize = 15.sp,
            fontWeight = FontWeight.Black,
            color = SabqTheme.colors.ink,
        )
        BenefitRow(text = "موجز صباحي أو مسائي مبني على اهتماماتك", icon = Icons.Filled.WbSunny)
        BenefitRow(text = "اقتراحات أخبار أدق كلما قرأت أكثر", icon = Icons.Filled.AutoAwesome)
        BenefitRow(text = "حفظ المقالات والعودة لها من أي جهاز", icon = Icons.Filled.Bookmark)
    }
}

@Composable
private fun BenefitRow(text: String, icon: ImageVector) {
    Row(
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(9.dp),
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = SabqTheme.colors.primaryEnd,
            modifier = Modifier
                .size(18.dp)
                .padding(top = 1.dp),
        )
        Text(
            text = text,
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
            color = SabqTheme.colors.secondaryInk,
            lineHeight = 19.sp,
        )
    }
}

@Composable
private fun GuestActions(onSignUp: () -> Unit, onLogin: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(SabqTheme.dimens.buttonRadius))
                .background(
                    Brush.linearGradient(
                        listOf(SabqTheme.colors.primaryStart, SabqTheme.colors.primaryEnd),
                    ),
                )
                .clickable { onSignUp() }
                .padding(vertical = 15.dp),
            contentAlignment = Alignment.Center,
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Icon(
                    imageVector = Icons.Filled.AutoAwesome,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(15.dp),
                )
                Text(
                    text = "ابدأ التسجيل مع SABQ AI",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Black,
                    color = Color.White,
                )
            }
        }
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { onLogin() }
                .padding(vertical = 12.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = "لديك حساب؟ تسجيل الدخول",
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                color = SabqTheme.colors.primaryEnd,
            )
        }
    }
}

// ────────────────────── Helpers ──────────────────────

private enum class MoodTint { Primary, Teal, Coral, Gold }

private data class MoodDescriptor(
    val icon: ImageVector,
    val label: String,
    val subtitle: String,
    val tintKey: MoodTint,
)

private fun inferMood(interests: List<MemberInterest>): MoodDescriptor {
    val slugs = interests.mapNotNull { it.slug?.lowercase() }.toSet()
    return when {
        slugs.isEmpty() -> MoodDescriptor(
            icon = Icons.Filled.AutoAwesome,
            label = "نبدأ معاً",
            subtitle = "اختر اهتماماتك لنخصّص لك مزاج قراءة يومي",
            tintKey = MoodTint.Primary,
        )
        "technology" in slugs || "business" in slugs -> MoodDescriptor(
            icon = Icons.Filled.Psychology,
            label = "مهتم بالتحليل",
            subtitle = "تميل لقراءة الاقتصاد والتقنية والتحليلات العميقة",
            tintKey = MoodTint.Teal,
        )
        "sports" in slugs -> MoodDescriptor(
            icon = Icons.Filled.LocalFireDepartment,
            label = "متابع نشط",
            subtitle = "تتابع الرياضة وأخبارها الحارة لحظة بلحظة",
            tintKey = MoodTint.Coral,
        )
        "culture" in slugs || "life" in slugs -> MoodDescriptor(
            icon = Icons.Filled.AutoStories,
            label = "قارئ منوّع",
            subtitle = "تستمتع بالثقافة والحياة وقصص الناس",
            tintKey = MoodTint.Gold,
        )
        else -> MoodDescriptor(
            icon = Icons.Filled.Newspaper,
            label = "متابع للأخبار",
            subtitle = "حاضر مع كل جديد من الأخبار المحلية والعالمية",
            tintKey = MoodTint.Primary,
        )
    }
}

private fun daysSinceJoined(raw: String?): Int? {
    if (raw.isNullOrBlank()) return null
    return runCatching {
        val dt = OffsetDateTime.parse(raw, DateTimeFormatter.ISO_OFFSET_DATE_TIME)
        ChronoUnit.DAYS.between(dt.toLocalDate(), LocalDate.now()).toInt().coerceAtLeast(0)
    }.getOrNull()
}

