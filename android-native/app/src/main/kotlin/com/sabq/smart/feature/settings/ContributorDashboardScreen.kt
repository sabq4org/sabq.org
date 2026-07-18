package com.sabq.smart.feature.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.api.*
import com.sabq.smart.ui.theme.SabqTheme
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

// ── ViewModel ───────────────────────────────────────────────────────

data class DashboardState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val analytics: ApiContributorAnalytics? = null,
    val ranking: ApiContributorRanking? = null,
    /** دعوات الاستطلاع المفتوحة — بطاقة «استطلاع بانتظارك» أعلى اللوحة */
    val pendingSurveys: List<ApiMySurveyInvite> = emptyList(),
    val schedule: ApiWriterScheduleResponse? = null,
    val savingDay: Boolean = false,
    val scheduleError: String? = null,
)

@HiltViewModel
class ContributorDashboardViewModel @Inject constructor(
    private val api: SabqApi,
) : ViewModel() {
    private val _state = MutableStateFlow(DashboardState())
    val state = _state.asStateFlow()

    init { load() }

    fun load() {
        viewModelScope.launch {
            _state.value = DashboardState(isLoading = true)
            try {
                val analytics = api.getContributorAnalytics()
                val ranking = runCatching { api.getContributorRanking() }.getOrNull()
                val pendingSurveys = runCatching { api.getMySurveys().items }.getOrDefault(emptyList())
                val schedule = runCatching { api.getContributorSchedule() }.getOrNull()
                _state.value = DashboardState(
                    isLoading = false,
                    analytics = analytics,
                    ranking = ranking,
                    pendingSurveys = pendingSurveys,
                    schedule = schedule,
                )
            } catch (e: Exception) {
                _state.value = DashboardState(isLoading = false, error = "تعذّر تحميل البيانات")
            }
        }
    }

    /** تثبيت اليوم الأسبوعي المختار — مرة واحدة؛ الخادم يرفض التغيير بعدها */
    fun pickDay(weekday: Int) {
        viewModelScope.launch {
            _state.update { it.copy(savingDay = true, scheduleError = null) }
            try {
                api.setContributorSchedule(WriterSchedulePickRequest(weekday))
                val schedule = runCatching { api.getContributorSchedule() }.getOrNull()
                _state.update { it.copy(savingDay = false, schedule = schedule) }
            } catch (e: Exception) {
                _state.update { it.copy(savingDay = false, scheduleError = "تعذر حفظ اليوم — حاول مرة أخرى") }
            }
        }
    }
}

// ── Colors ──────────────────────────────────────────────────────────

private val AccentBlue = Color(0xFF4090F8)
private val AccentPink = Color(0xFFED5C7A)
private val AccentCyan = Color(0xFF33C7D9)
private val AccentAmber = Color(0xFFF59E0B)
private val AccentGreen = Color(0xFF2ED573)
private val AccentRed = Color(0xFFEF4444)

// ── Screen ──────────────────────────────────────────────────────────

@Composable
fun ContributorDashboardScreen(
    onBack: () -> Unit,
    onOpenSurvey: (token: String) -> Unit = {},
    viewModel: ContributorDashboardViewModel = androidx.hilt.navigation.compose.hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(SabqTheme.colors.background)
            .statusBarsPadding()
    ) {
        // Top bar
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Spacer(Modifier.weight(1f))
            Text(
                "لوحة الأداء",
                style = SabqTheme.typography.compactCardTitle.copy(
                    fontSize = 18.sp, fontWeight = FontWeight.Black, color = SabqTheme.colors.ink
                ),
            )
            Spacer(Modifier.weight(1f))
            IconButton(onClick = onBack, modifier = Modifier.size(32.dp)) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, null, tint = SabqTheme.colors.ink, modifier = Modifier.size(20.dp))
            }
        }

        when {
            state.isLoading -> {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = AccentBlue)
                }
            }
            state.error != null -> {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Icon(Icons.Filled.BarChart, null, modifier = Modifier.size(48.dp), tint = SabqTheme.colors.secondaryInk.copy(alpha = 0.4f))
                        Text(state.error!!, style = SabqTheme.typography.metaSmall.copy(color = SabqTheme.colors.secondaryInk))
                        TextButton(onClick = { viewModel.load() }) {
                            Text("إعادة المحاولة", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = AccentBlue)
                        }
                    }
                }
            }
            state.analytics != null -> {
                val data = state.analytics!!
                Column(
                    modifier = Modifier
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = 16.dp)
                        .padding(bottom = SabqTheme.dimens.tabBarSafeArea),
                    verticalArrangement = Arrangement.spacedBy(20.dp),
                ) {
                    HeaderSection(data)
                    // موعد النشر الأسبوعي — لكتّاب الرأي فقط: بانر لمن له يوم،
                    // أو بطاقة الاختيار (مرة واحدة) لمن لا يوم له
                    if (data.role == "writer") {
                        state.schedule?.let { sched ->
                            sched.banner?.let { WriterScheduleBannerCard(it) }
                                ?: if (sched.canChoose) {
                                    WriterDayPickerCard(
                                        dayLoads = sched.dayLoads,
                                        saving = state.savingDay,
                                        errorText = state.scheduleError,
                                        onPick = viewModel::pickDay,
                                    )
                                } else Unit
                        }
                    }
                    state.pendingSurveys.forEach { invite ->
                        PendingSurveyCard(invite = invite, onOpen = { onOpenSurvey(invite.token) })
                    }
                    StatsCards(data)
                    OverviewSection(data)
                    if (data.topArticles.isNotEmpty()) TopArticlesSection(data.topArticles)
                    data.featuredComment?.let { FeaturedCommentCard(it) }
                    AudienceSection(data, state.ranking)
                    PublishingSection(data.publishingActivity)
                    if (data.articles.isNotEmpty()) ArticlesSection(data)
                    Spacer(Modifier.height(8.dp))
                }
            }
        }
    }
}

// ── Header ──────────────────────────────────────────────────────────

@Composable
private fun HeaderSection(data: ApiContributorAnalytics) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Icon(
            if (data.role == "reporter") Icons.Filled.Newspaper else Icons.Filled.Edit,
            null, tint = AccentBlue, modifier = Modifier.size(22.dp),
        )
        Text(
            if (data.role == "reporter") "لوحة المراسل" else "لوحة كاتب الرأي",
            style = SabqTheme.typography.compactCardTitle.copy(fontSize = 20.sp, fontWeight = FontWeight.Black, color = SabqTheme.colors.ink),
        )
    }
    Text(
        "مرحباً بك في لوحة التحكم الخاصة بك",
        style = SabqTheme.typography.metaSmall.copy(fontSize = 13.sp, color = SabqTheme.colors.secondaryInk),
    )
}

// ── Stats Cards ─────────────────────────────────────────────────────

@Composable
private fun StatsCards(data: ApiContributorAnalytics) {
    val shape = RoundedCornerShape(SabqTheme.dimens.cardRadius)
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            StatCard(Modifier.weight(1f), "المشاهدات", data.totalViews, Icons.Filled.Visibility, AccentBlue,
                trendPct(data.comparison.viewsThisMonth, data.comparison.viewsLastMonth))
            StatCard(Modifier.weight(1f), "الإعجابات", data.totalLikes, Icons.Filled.Favorite, AccentPink,
                trendPct(data.comparison.likesThisMonth, data.comparison.likesLastMonth))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            StatCard(Modifier.weight(1f), "التعليقات", data.totalComments, Icons.Filled.ChatBubble, AccentCyan, null)
            StatCard(Modifier.weight(1f), "المفضلة", data.totalBookmarks, Icons.Filled.Bookmark, AccentAmber, null)
        }
    }
}

@Composable
private fun StatCard(modifier: Modifier, title: String, value: Int, icon: ImageVector, color: Color, trend: Int?) {
    val shape = RoundedCornerShape(SabqTheme.dimens.cardRadius)
    Column(
        modifier = modifier
            .clip(shape)
            .background(SabqTheme.colors.surface, shape)
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier.size(32.dp).clip(RoundedCornerShape(8.dp)).background(color.copy(alpha = 0.12f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(icon, null, tint = color, modifier = Modifier.size(15.dp))
            }
            Spacer(Modifier.weight(1f))
            if (trend != null) {
                val trendColor = if (trend >= 0) AccentGreen else AccentRed
                Row(
                    modifier = Modifier
                        .clip(RoundedCornerShape(50))
                        .background(trendColor.copy(alpha = 0.1f))
                        .padding(horizontal = 6.dp, vertical = 3.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    Icon(
                        if (trend >= 0) Icons.Filled.TrendingUp else Icons.Filled.TrendingDown,
                        null, tint = trendColor, modifier = Modifier.size(10.dp),
                    )
                    Text("${kotlin.math.abs(trend)}%", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = trendColor)
                }
            }
        }
        Text("$value", fontSize = 24.sp, fontWeight = FontWeight.Black, color = SabqTheme.colors.ink)
        Text(title, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = SabqTheme.colors.secondaryInk)
    }
}

// ── Overview ────────────────────────────────────────────────────────

@Composable
private fun OverviewSection(data: ApiContributorAnalytics) {
    SectionTitle("نظرة عامة")
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        // Status breakdown
        val shape = RoundedCornerShape(SabqTheme.dimens.cardRadius)
        Column(
            modifier = Modifier.weight(1f).clip(shape).background(SabqTheme.colors.surface, shape).padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            StatusDot("منشور", data.publishedArticles, AccentGreen)
            StatusDot("مسودة", data.draftArticles, AccentAmber)
            StatusDot("قيد المراجعة", data.pendingArticles, AccentBlue)
            StatusDot("مرفوض", data.rejectedArticles, AccentRed)
        }
        // Best article
        data.bestArticleThisWeek?.let { best ->
            val bShape = RoundedCornerShape(SabqTheme.dimens.cardRadius)
            Column(
                modifier = Modifier.weight(1f).clip(bShape).background(AccentAmber.copy(alpha = 0.06f), bShape).padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    Icon(Icons.Filled.EmojiEvents, null, tint = AccentAmber, modifier = Modifier.size(14.dp))
                    Text("الأفضل هذا الأسبوع", fontSize = 10.sp, fontWeight = FontWeight.SemiBold, color = SabqTheme.colors.secondaryInk)
                }
                Text(best.title, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = SabqTheme.colors.ink, maxLines = 3, overflow = TextOverflow.Ellipsis)
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                    Icon(Icons.Filled.Visibility, null, tint = SabqTheme.colors.secondaryInk, modifier = Modifier.size(12.dp))
                    Text("${best.views}", fontSize = 11.sp, fontWeight = FontWeight.Medium, color = SabqTheme.colors.secondaryInk)
                }
            }
        }
    }
}

@Composable
private fun StatusDot(label: String, count: Int, color: Color) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(modifier = Modifier.size(8.dp).clip(CircleShape).background(color))
        Spacer(Modifier.width(6.dp))
        Text(label, fontSize = 12.sp, fontWeight = FontWeight.Medium, color = SabqTheme.colors.ink)
        Spacer(Modifier.weight(1f))
        Text("$count", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = SabqTheme.colors.ink)
    }
}

// ── Top Articles ────────────────────────────────────────────────────

@Composable
private fun TopArticlesSection(articles: List<ApiTopArticle>) {
    SectionTitle("أعلى المقالات تفاعلاً")
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        articles.take(5).forEachIndexed { i, article ->
            val shape = RoundedCornerShape(10.dp)
            Row(
                modifier = Modifier.fillMaxWidth().clip(shape).background(SabqTheme.colors.surface, shape).padding(horizontal = 14.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Box(
                    modifier = Modifier.size(26.dp).clip(CircleShape)
                        .background(if (i < 3) AccentAmber.copy(alpha = 0.12f) else SabqTheme.colors.outline.copy(alpha = 0.15f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("${i + 1}", fontSize = 12.sp, fontWeight = FontWeight.Black, color = if (i < 3) AccentAmber else SabqTheme.colors.secondaryInk)
                }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text(article.title, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = SabqTheme.colors.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        MiniStat(Icons.Filled.Visibility, article.views)
                        MiniStat(Icons.Filled.Favorite, article.likes)
                        MiniStat(Icons.Filled.ChatBubble, article.comments)
                    }
                }
            }
        }
    }
}

// ── Featured Comment ────────────────────────────────────────────────

@Composable
private fun FeaturedCommentCard(comment: ApiFeaturedComment) {
    val shape = RoundedCornerShape(SabqTheme.dimens.cardRadius)
    Column(
        modifier = Modifier.fillMaxWidth().clip(shape).background(AccentCyan.copy(alpha = 0.04f), shape).padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Icon(Icons.Filled.FormatQuote, null, tint = AccentCyan, modifier = Modifier.size(16.dp))
            Text("أبرز تعليق هذا الأسبوع", fontSize = 12.sp, fontWeight = FontWeight.Black, color = SabqTheme.colors.ink)
        }
        Text("«${comment.content}»", fontSize = 14.sp, fontWeight = FontWeight.Medium, fontStyle = FontStyle.Italic, color = SabqTheme.colors.ink, maxLines = 3, overflow = TextOverflow.Ellipsis)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Icon(Icons.Filled.Person, null, tint = SabqTheme.colors.secondaryInk, modifier = Modifier.size(13.dp))
            Text("${comment.userName} · ${comment.articleTitle}", fontSize = 11.sp, fontWeight = FontWeight.Medium, color = SabqTheme.colors.secondaryInk, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

// ── Audience ────────────────────────────────────────────────────────

@Composable
private fun AudienceSection(data: ApiContributorAnalytics, ranking: ApiContributorRanking?) {
    SectionTitle("الجمهور")
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        // Followers
        val shape = RoundedCornerShape(SabqTheme.dimens.cardRadius)
        Column(
            modifier = Modifier.weight(1f).clip(shape).background(SabqTheme.colors.surface, shape).padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Icon(Icons.Filled.Group, null, tint = AccentBlue, modifier = Modifier.size(14.dp))
                Text("المتابعون", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = SabqTheme.colors.secondaryInk)
            }
            Text("${data.followers.count}", fontSize = 24.sp, fontWeight = FontWeight.Black, color = SabqTheme.colors.ink)
            if (data.followers.dailyGrowth.isNotEmpty()) {
                val total = data.followers.dailyGrowth.sumOf { it.count }
                Text("+$total آخر 30 يوم", fontSize = 10.sp, fontWeight = FontWeight.Medium, color = AccentGreen)
            }
        }
        // Ranking
        ranking?.let { r ->
            Column(
                modifier = Modifier.weight(1f).clip(shape).background(SabqTheme.colors.surface, shape).padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    Icon(Icons.Filled.MilitaryTech, null, tint = AccentAmber, modifier = Modifier.size(14.dp))
                    Text("ترتيبك", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = SabqTheme.colors.secondaryInk)
                }
                if (r.rank != null) {
                    Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("#${r.rank}", fontSize = 24.sp, fontWeight = FontWeight.Black, color = SabqTheme.colors.ink)
                        Text("من ${r.totalAuthors}", fontSize = 11.sp, fontWeight = FontWeight.Medium, color = SabqTheme.colors.secondaryInk,
                            modifier = Modifier.padding(bottom = 4.dp))
                    }
                    if (r.isTopTen) {
                        Text(
                            "الأكثر قراءة", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = AccentAmber,
                            modifier = Modifier.clip(RoundedCornerShape(50)).background(AccentAmber.copy(alpha = 0.12f)).padding(horizontal = 6.dp, vertical = 2.dp),
                        )
                    } else {
                        Text("أعلى من ${r.percentile}%", fontSize = 10.sp, fontWeight = FontWeight.Medium, color = SabqTheme.colors.secondaryInk)
                    }
                } else {
                    Text("لم تنشر هذا الشهر", fontSize = 12.sp, fontWeight = FontWeight.Medium, color = SabqTheme.colors.secondaryInk)
                }
            }
        }
    }
}

// ── Publishing Activity ─────────────────────────────────────────────

@Composable
private fun PublishingSection(pa: ApiPublishingActivity) {
    val shape = RoundedCornerShape(SabqTheme.dimens.cardRadius)
    Column(
        modifier = Modifier.fillMaxWidth().clip(shape).background(SabqTheme.colors.surface, shape).padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        SectionTitle("نشاط النشر")
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(
                modifier = Modifier.weight(1f).clip(RoundedCornerShape(10.dp)).background(AccentBlue.copy(alpha = 0.06f)).padding(vertical = 10.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text("${pa.thisWeekCount}", fontSize = 20.sp, fontWeight = FontWeight.Black, color = SabqTheme.colors.ink)
                Text("هذا الأسبوع", fontSize = 10.sp, fontWeight = FontWeight.Medium, color = SabqTheme.colors.secondaryInk)
            }
            Column(
                modifier = Modifier.weight(1f).clip(RoundedCornerShape(10.dp)).background(AccentGreen.copy(alpha = 0.06f)).padding(vertical = 10.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text("${pa.thisMonthCount}", fontSize = 20.sp, fontWeight = FontWeight.Black, color = SabqTheme.colors.ink)
                Text("هذا الشهر", fontSize = 10.sp, fontWeight = FontWeight.Medium, color = SabqTheme.colors.secondaryInk)
            }
        }
        pa.daysSinceLastPublished?.let { days ->
            val warn = days > 14
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Icon(Icons.Filled.Schedule, null, tint = if (warn) AccentAmber else SabqTheme.colors.secondaryInk, modifier = Modifier.size(13.dp))
                Text(
                    when (days) { 0 -> "آخر نشر: اليوم"; 1 -> "آخر نشر: أمس"; else -> "آخر نشر منذ $days يوم" },
                    fontSize = 12.sp, fontWeight = FontWeight.Medium, color = if (warn) AccentAmber else SabqTheme.colors.secondaryInk,
                )
            }
        }
    }
}

// ── Articles List ───────────────────────────────────────────────────

@Composable
private fun ArticlesSection(data: ApiContributorAnalytics) {
    SectionTitle(if (data.role == "reporter") "أخباري" else "مقالاتي")
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        data.articles.take(10).forEach { article ->
            val shape = RoundedCornerShape(10.dp)
            Row(
                modifier = Modifier.fillMaxWidth().clip(shape).background(SabqTheme.colors.surface, shape).padding(horizontal = 14.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(article.title, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = SabqTheme.colors.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        StatusPill(article.status, article.reviewStatus)
                        MiniStat(Icons.Filled.Visibility, article.views)
                        MiniStat(Icons.Filled.Favorite, article.likes)
                        MiniStat(Icons.Filled.ChatBubble, article.comments)
                    }
                }
            }
        }
    }
}

// ── Shared helpers ──────────────────────────────────────────────────

@Composable
private fun SectionTitle(text: String) {
    Text(text, fontSize = 16.sp, fontWeight = FontWeight.Black, color = SabqTheme.colors.ink)
}

@Composable
private fun MiniStat(icon: ImageVector, value: Int) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
        Icon(icon, null, tint = SabqTheme.colors.secondaryInk, modifier = Modifier.size(10.dp))
        Text("$value", fontSize = 10.sp, fontWeight = FontWeight.Medium, color = SabqTheme.colors.secondaryInk)
    }
}

@Composable
private fun StatusPill(status: String, reviewStatus: String?) {
    val (label, color) = when {
        reviewStatus == "needs_changes" -> "يحتاج تعديل" to AccentAmber
        reviewStatus == "pending_review" -> "قيد المراجعة" to AccentBlue
        status == "published" -> "منشور" to AccentGreen
        status == "draft" -> "مسودة" to AccentAmber
        status == "rejected" -> "مرفوض" to AccentRed
        status == "archived" -> "مؤرشف" to AccentRed
        else -> status to Color.Gray
    }
    Text(
        label, fontSize = 9.sp, fontWeight = FontWeight.Bold, color = color,
        modifier = Modifier.clip(RoundedCornerShape(50)).background(color.copy(alpha = 0.12f)).padding(horizontal = 6.dp, vertical = 2.dp),
    )
}

private fun trendPct(current: Int, previous: Int): Int? {
    if (previous <= 0) return if (current > 0) 100 else null
    return ((current - previous).toFloat() / previous * 100).toInt()
}


// ── بطاقة «استطلاع بانتظارك» ────────────────────────────────────────
// تطابق iOS `PendingSurveysCard`: تظهر لكل دعوة مفتوحة حتى لو فات
// الكاتبَ إشعارُ الدفع، والنقر يفتح شاشة الاستطلاع بالتوكن الشخصي.

@Composable
private fun PendingSurveyCard(invite: ApiMySurveyInvite, onOpen: () -> Unit) {
    val shape = RoundedCornerShape(18.dp)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(SabqTheme.colors.surface)
            .border(1.dp, SabqTheme.colors.sky.copy(alpha = 0.35f), shape)
            .clickable { onOpen() }
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(
            modifier = Modifier
                .size(44.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(SabqTheme.colors.sky.copy(alpha = 0.12f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.Filled.Checklist,
                contentDescription = null,
                tint = SabqTheme.colors.sky,
                modifier = Modifier.size(22.dp),
            )
        }
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(
                "استطلاع بانتظارك: ${invite.title}",
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = SabqTheme.typography.cardTitle.copy(
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Black,
                    color = SabqTheme.colors.ink,
                ),
            )
            Text(
                invite.purpose?.let { "رأيك يساعدنا في $it — ${invite.questionsCount} أسئلة" }
                    ?: "${invite.questionsCount} أسئلة قصيرة، دقائق معدودة",
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = SabqTheme.typography.metaSmall.copy(
                    fontSize = 12.5.sp,
                    color = SabqTheme.colors.secondaryInk,
                ),
            )
        }
        Icon(
            Icons.AutoMirrored.Filled.KeyboardArrowLeft,
            contentDescription = null,
            tint = SabqTheme.colors.tertiaryInk,
            modifier = Modifier.size(18.dp),
        )
    }
}
