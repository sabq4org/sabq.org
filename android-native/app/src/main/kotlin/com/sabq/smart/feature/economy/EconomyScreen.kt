package com.sabq.smart.feature.economy

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
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
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.Sensors
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.runtime.CompositionLocalProvider
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.sabq.smart.ui.components.SkeletonBox
import com.sabq.smart.ui.theme.SabqTheme
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

@HiltViewModel
class EconomyViewModel @Inject constructor(private val repo: EconomyRepository) : ViewModel() {
    val state: StateFlow<EconomyRepository.State> = repo.state
    private val _refreshing = MutableStateFlow(false)
    val refreshing: StateFlow<Boolean> = _refreshing.asStateFlow()

    fun load() {
        viewModelScope.launch {
            repo.loadSnapshotIfNeeded(60_000)
            repo.loadStoriesIfNeeded()
        }
    }

    fun refresh() {
        viewModelScope.launch {
            _refreshing.value = true
            try { repo.refreshAll() } finally { _refreshing.value = false }
        }
    }
}

/** صفحة «الاقتصاد بالأرقام» — نقل iOS `EconomyView` (الويب `/economy`، #1493–#1506). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EconomyScreen(
    onBack: () -> Unit,
    onBusinessNewsClick: () -> Unit,
    viewModel: EconomyViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val refreshing by viewModel.refreshing.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { viewModel.load() }

    Box(Modifier.fillMaxSize().background(SabqTheme.colors.background)) {
        PullToRefreshBox(isRefreshing = refreshing, onRefresh = { viewModel.refresh() }, modifier = Modifier.fillMaxSize()) {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 32.dp),
                verticalArrangement = Arrangement.spacedBy(28.dp),
            ) {
                item { Spacer(Modifier.statusBarsPadding().height(56.dp)) }
                item { EconomyHero(latestAsOf = state.snapshot?.latestAsOf, onBusinessNewsClick = onBusinessNewsClick) }
                val s = state.snapshot
                if (s != null && s.indicators.isNotEmpty()) {
                    item { EconomyTicker(s) }
                    item { EconomyDecisionLine(s) }
                    if (state.weekly != null || s.weekly != null) {
                        item { EconomyWeeklyModule(story = state.weekly, summary = s.weekly) }
                    }
                    val monthlyStory = state.monthly
                    if (monthlyStory != null) {
                        item { EconomyMonthlyModule(MonthlyContent.from(monthlyStory)) }
                    } else if (s.monthly != null) {
                        item { EconomyMonthlyModule(MonthlyContent.from(s.monthly)) }
                    }
                    if (s.samaNews.isNotEmpty()) item { EconomySamaNews(s.samaNews) }
                } else if (state.isLoadingSnapshot) {
                    item { SkeletonBox(height = 112.dp, radius = 16.dp) }
                    item { SkeletonBox(height = 220.dp, radius = 16.dp) }
                } else {
                    item {
                        Text(
                            "البيانات قيد التحميل من البنك المركزي — عُد بعد دقائق.",
                            fontSize = 14.sp, fontWeight = FontWeight.Medium, color = SabqTheme.colors.secondaryInk,
                            textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(vertical = 40.dp),
                        )
                    }
                }
            }
        }
        // رأس عائم: رجوع + العنوان (نمط صفحة التصنيف).
        // خلفية شبه معتمة تحت الرأس كي لا ينزلق المحتوى تحت العنوان (مراجعة 10.3.3).
        Row(
            modifier = Modifier.fillMaxWidth().background(SabqTheme.colors.background.copy(alpha = 0.94f)).statusBarsPadding().padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier.size(40.dp).clip(CircleShape).background(SabqTheme.colors.surface.copy(alpha = 0.92f)).clickable { onBack() },
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = "رجوع", tint = SabqTheme.colors.ink, modifier = Modifier.size(20.dp))
            }
            Text(
                "الاقتصاد بالأرقام", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = SabqTheme.colors.ink,
                textAlign = TextAlign.Center, modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(40.dp))
        }
    }
}

// ---------------------------------------------------------------- hero
@Composable
private fun EconomyHero(latestAsOf: String?, onBusinessNewsClick: () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(top = 6.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Box(
            Modifier.size(56.dp).clip(RoundedCornerShape(16.dp)).background(SabqTheme.colors.primaryEnd.copy(alpha = 0.10f)),
            contentAlignment = Alignment.Center,
        ) { Icon(Icons.Filled.AccountBalance, contentDescription = null, tint = SabqTheme.colors.primaryEnd, modifier = Modifier.size(26.dp)) }
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("الاقتصاد السعودي بالأرقام…", fontSize = 26.sp, fontWeight = FontWeight.Black, color = SabqTheme.colors.ink, textAlign = TextAlign.Center)
            Text("من البنك المركزي إلى شاشتك", fontSize = 26.sp, fontWeight = FontWeight.Black, color = SabqTheme.colors.primaryEnd, textAlign = TextAlign.Center)
        }
        Text(
            "إنفاق الأسبوع، السعوديون في شهر، أسعار الصرف، الفائدة والتضخم — أرقام رسمية تتحدث تلقائيًا لحظة صدورها من البنك المركزي السعودي.",
            fontSize = 14.sp, fontWeight = FontWeight.Medium, color = SabqTheme.colors.ink.copy(alpha = 0.7f), textAlign = TextAlign.Center, lineHeight = 22.sp,
        )
        Row(
            modifier = Modifier.clip(CircleShape).background(SabqTheme.colors.primaryEnd).clickable { onBusinessNewsClick() }.padding(horizontal = 18.dp, vertical = 9.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text("أخبار الأعمال", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color.White)
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, contentDescription = null, tint = Color.White, modifier = Modifier.size(14.dp))
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Icon(Icons.Filled.Sensors, contentDescription = null, tint = EconomyTone.up, modifier = Modifier.size(12.dp))
            val line = buildString {
                append("يتحدث تلقائيًا فور صدور بيانات البنك المركزي")
                if (latestAsOf != null) append(" · آخر بيان: ${EconomyFormat.fmtDateAr(latestAsOf)}")
            }
            Text(line, fontSize = 11.sp, color = SabqTheme.colors.tertiaryInk, textAlign = TextAlign.Center)
        }
    }
}

// ---------------------------------------------------------------- ticker
private data class TickerCard(val id: String, val label: String, val value: String, val unit: String, val sub: String, val change: Double?, val digits: Int, val suffix: String)

private fun tickerCards(s: EconomySnapshot): List<TickerCard> {
    val cards = mutableListOf<TickerCard>()
    s.weekly?.let { w ->
        cards += TickerCard("weekly", "إنفاق الأسبوع", EconomyFormat.fmtSar(w.totalValue), "ريال", "نقاط البيع · ${w.weekLabelAr}", w.totalChangePct, 1, "")
    }
    for (code in EconomyFxRate.tickerCodes) {
        s.fx.firstOrNull { it.code == code }?.let { f ->
            cards += TickerCard("fx-$code", f.nameAr, EconomyFormat.fmtRate(f.rate), "ريال", EconomyFormat.fmtDateAr(f.date, withYear = false), f.changePct, 2, "")
        }
    }
    for (key in EconomyIndicator.order) {
        s.indicators.firstOrNull { it.key == key }?.let { i ->
            val delta = i.previousValue?.let { i.value - it }
            cards += TickerCard("ind-$key", i.shortAr, EconomyFormat.trimNum(i.value, 2), "%", EconomyFormat.indicatorSub(i), delta, 2, " نقطة")
        }
    }
    return cards
}

@Composable
private fun EconomyTicker(s: EconomySnapshot) {
    val cards = tickerCards(s)
    TwoColumnGrid(cards.size) { i ->
        val c = cards[i]
        val shape = RoundedCornerShape(12.dp)
        Column(
            Modifier.fillMaxSize().clip(shape).background(SabqTheme.colors.surface).border(1.dp, SabqTheme.colors.outline, shape).padding(horizontal = 12.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(c.label, fontSize = 11.sp, fontWeight = FontWeight.Medium, color = SabqTheme.colors.secondaryInk, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(c.value, fontSize = 18.sp, fontWeight = FontWeight.Black, color = SabqTheme.colors.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(c.unit, fontSize = 11.sp, fontWeight = FontWeight.Medium, color = SabqTheme.colors.secondaryInk, modifier = Modifier.padding(bottom = 3.dp))
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(c.sub, fontSize = 10.sp, color = SabqTheme.colors.tertiaryInk, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                EconomyChangeChip(value = c.change, digits = c.digits, suffix = c.suffix, hideEmpty = true)
            }
        }
    }
}

// ---------------------------------------------------------------- decision
@Composable
private fun EconomyDecisionLine(s: EconomySnapshot) {
    val repo = s.indicators.firstOrNull { it.key == "repo" } ?: return
    val d = s.decision ?: return
    if (d.isDecisionNight) {
        val shape = RoundedCornerShape(12.dp)
        Row(
            Modifier.fillMaxWidth().clip(shape).background(SabqTheme.colors.primaryEnd.copy(alpha = 0.05f)).border(1.dp, SabqTheme.colors.primaryEnd.copy(alpha = 0.4f), shape).padding(14.dp),
            verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("قرار الفائدة الليلة", fontSize = 15.sp, fontWeight = FontWeight.Bold, color = SabqTheme.colors.ink)
                Text("نتابع البنك المركزي لحظة بلحظة — الريبو الآن ${repo.valueText}، وسيتحدث هنا فور الإعلان.", fontSize = 12.sp, color = SabqTheme.colors.secondaryInk)
            }
            Text("رصد كل 60 ثانية", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = SabqTheme.colors.primaryEnd)
        }
    } else if (d.nextDecisionDate != null) {
        Text(
            "قرار الفائدة القادم: ${EconomyFormat.fmtDateAr(d.nextDecisionDate)} — الريبو ثابت عند ${repo.valueText} منذ ${EconomyFormat.fmtDateAr(repo.asOf)}. المصدر: البنك المركزي السعودي.",
            fontSize = 11.sp, color = SabqTheme.colors.tertiaryInk,
        )
    }
}

// ---------------------------------------------------------------- shared heads
@Composable
private fun EconomySectionHead(title: String, description: String? = null) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(title, fontSize = 18.sp, fontWeight = FontWeight.Bold, color = SabqTheme.colors.ink)
        if (description != null) Text(description, fontSize = 12.sp, color = SabqTheme.colors.secondaryInk)
    }
}

// ---------------------------------------------------------------- weekly
@Composable
private fun EconomyWeeklyModule(story: EconomyWeeklyStory?, summary: EconomyWeeklySummary?) {
    val weekLabel = story?.weekLabelAr ?: summary?.weekLabelAr ?: ""
    val ingestedAt = story?.ingestedAt ?: summary?.ingestedAt
    val kpis = story?.kpis ?: summary?.kpis ?: emptyList()
    val stories = story?.stories ?: summary?.stories ?: emptyList()
    val headline = story?.lead?.headline ?: summary?.headline ?: ""
    Column(verticalArrangement = Arrangement.spacedBy(20.dp)) {
        EconomyCard {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("إنفاق الأسبوع · نقاط البيع", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = SabqTheme.colors.primaryEnd)
                if (EconomyFormat.isFresh(ingestedAt)) EconomyNewBadge("تقرير جديد")
            }
            Text(headline, fontSize = 20.sp, fontWeight = FontWeight.Black, color = SabqTheme.colors.ink, lineHeight = 30.sp)
            story?.lead?.intro?.takeIf { it.isNotEmpty() }?.let { Text(it, fontSize = 13.sp, color = SabqTheme.colors.secondaryInk, lineHeight = 21.sp) }
            Text("الأسبوع $weekLabel · المصدر: البنك المركزي السعودي — تقرير عمليات نقاط البيع الأسبوعي", fontSize = 11.sp, color = SabqTheme.colors.tertiaryInk)
        }
        if (kpis.isNotEmpty()) TwoColumnGrid(kpis.size) { i -> KpiCard(kpis[i]) }
        if (stories.isNotEmpty()) {
            EconomySectionHead("أرقام الأسبوع", "قصص يستخرجها النظام من الجدولين تلقائيًا — كل بطاقة عنوان خبر جاهز.")
            val shown = stories.take(6)
            TwoColumnGrid(shown.size) { i -> StoryCard(shown[i]) }
        }
        if (story != null) {
            EconomySectionHead("أين ذهب الإنفاق؟ — القطاعات", "القطاعات الرئيسية بخط داكن وفروعها تحتها.")
            SectorsList(story)
            EconomySectionHead("إجمالي الإنفاق الأسبوعي عبر أربعة أسابيع (ريال)")
            EconomyWeeksChart(values = story.totals.series, labels = story.weeks)
            EconomySectionHead("توزيع المدن", "حصة كل مدينة من إجمالي الإنفاق، ثم أبرز المدن الصاعدة والهابطة.")
            CitiesShare(story)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.height(IntrinsicSize.Max)) {
                Box(Modifier.weight(1f).fillMaxSize()) { MoverList("المدن الصاعدة هذا الأسبوع", story.risers) }
                Box(Modifier.weight(1f).fillMaxSize()) { MoverList("المدن الهابطة هذا الأسبوع", story.fallers) }
            }
        }
    }
}

private fun kpiValue(k: EconomyKpi): String = when (k.key) {
    "total" -> EconomyFormat.fmtSar(k.value)
    "count" -> EconomyFormat.fmtCount(k.value)
    "avgTicket" -> EconomyFormat.trimNum(k.value, 1)
    "vs4w" -> "${if (k.value >= 0) "+" else ""}${EconomyFormat.trimNum(k.value, 1)}%"
    else -> EconomyFormat.trimNum(k.value, 1)
}

@Composable
private fun KpiCard(k: EconomyKpi) {
    EconomyCard(modifier = Modifier.fillMaxSize()) {
        Text(k.labelAr, fontSize = 11.sp, fontWeight = FontWeight.Medium, color = SabqTheme.colors.secondaryInk)
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
            CompositionLocalProvider(LocalLayoutDirection provides if (k.key == "vs4w") LayoutDirection.Ltr else LayoutDirection.Rtl) {
                Text(kpiValue(k), fontSize = 18.sp, fontWeight = FontWeight.Black, color = SabqTheme.colors.ink)
            }
            if (k.key != "vs4w") Text(k.unitAr, fontSize = 11.sp, fontWeight = FontWeight.Medium, color = SabqTheme.colors.secondaryInk, modifier = Modifier.padding(bottom = 3.dp))
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                EconomyChangeChip(value = k.changePct, hideEmpty = true)
                k.noteAr?.let { Text(it, fontSize = 10.sp, color = SabqTheme.colors.tertiaryInk) }
            }
            if (k.key != "vs4w" && k.series.size >= 2) {
                EconomySparkline(values = k.series, modifier = Modifier.size(width = 72.dp, height = 26.dp), tint = if ((k.changePct ?: 0.0) >= 0) EconomyTone.up else EconomyTone.down)
            }
        }
    }
}

@Composable
private fun StoryCard(st: EconomyStoryCard) {
    EconomyAccentCard(tone = EconomyTone.color(st.tone) ?: SabqTheme.colors.primaryEnd, modifier = Modifier.fillMaxSize()) {
        Column(Modifier.padding(12.dp).padding(top = 3.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(st.cardTitle, fontSize = 11.sp, fontWeight = FontWeight.Medium, color = SabqTheme.colors.secondaryInk)
            Text(st.headline, fontSize = 14.sp, fontWeight = FontWeight.Bold, color = SabqTheme.colors.ink)
            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                Text(st.figure, fontSize = 18.sp, fontWeight = FontWeight.Black, color = EconomyTone.color(st.tone) ?: SabqTheme.colors.ink, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.End)
            }
            Text(st.detailAr, fontSize = 12.sp, color = SabqTheme.colors.secondaryInk)
        }
    }
}

@Composable
private fun SectorsList(story: EconomyWeeklyStory) {
    val leafMax = story.sectors.filter { !it.isGroup }.maxOfOrNull { kotlin.math.abs(it.value) } ?: 1.0
    val shape = RoundedCornerShape(14.dp)
    Column(Modifier.fillMaxWidth().clip(shape).background(SabqTheme.colors.surface).border(1.dp, SabqTheme.colors.outline, shape).padding(horizontal = 14.dp)) {
        story.sectors.forEachIndexed { index, s ->
            if (index > 0) androidx.compose.material3.HorizontalDivider(color = SabqTheme.colors.outline.copy(alpha = 0.6f))
            Column(Modifier.padding(vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        if (s.isGroup) s.ar else "↳ ${s.ar}",
                        fontSize = 13.sp, fontWeight = if (s.isGroup) FontWeight.Bold else FontWeight.Normal,
                        color = if (s.isGroup) SabqTheme.colors.ink else SabqTheme.colors.secondaryInk,
                        maxLines = 1, overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f).padding(start = if (s.isGroup) 0.dp else 12.dp),
                    )
                    EconomyChangeChip(value = s.changePct, hideEmpty = true)
                }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    val fraction = (kotlin.math.abs(s.value) / maxOf(leafMax, 1.0)).coerceIn(0.0, 1.0).toFloat()
                    Box(Modifier.weight(1f).height(6.dp)) {
                        Box(
                            Modifier.fillMaxWidth(fraction.coerceAtLeast(0.01f)).height(6.dp).clip(RoundedCornerShape(3.dp))
                                .background(SabqTheme.colors.primaryEnd.copy(alpha = if (s.isGroup) 0.9f else 0.6f)),
                        )
                    }
                    Text("${EconomyFormat.fmtSar(s.value)} ريال", fontSize = 11.sp, fontWeight = FontWeight.Medium, color = SabqTheme.colors.secondaryInk, modifier = Modifier.width(96.dp))
                }
            }
        }
    }
}

private val shareOpacities = listOf(1f, 0.8f, 0.62f, 0.46f, 0.34f, 0.24f)

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CitiesShare(story: EconomyWeeklyStory) {
    val top = story.citiesShareTop.take(6)
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(Modifier.fillMaxWidth().height(32.dp).clip(RoundedCornerShape(8.dp)), horizontalArrangement = Arrangement.spacedBy(1.dp)) {
            top.forEachIndexed { i, c ->
                val w = (maxOf(0.0, c.share) / 100.0).toFloat().coerceAtLeast(0.005f)
                Box(Modifier.weight(w).fillMaxSize().background(SabqTheme.colors.primaryEnd.copy(alpha = shareOpacities[minOf(i, 5)])), contentAlignment = Alignment.Center) {
                    if (c.share > 6) Text(c.ar, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, color = if (i < 2) Color.White else SabqTheme.colors.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            val rest = (maxOf(0.0, story.otherCitiesShare) / 100.0).toFloat().coerceAtLeast(0.05f)
            Box(Modifier.weight(rest).fillMaxSize().background(SabqTheme.colors.outline.copy(alpha = 0.6f)), contentAlignment = Alignment.Center) {
                Text("بقية المدن ${EconomyFormat.trimNum(story.otherCitiesShare, 0)}%", fontSize = 10.sp, fontWeight = FontWeight.SemiBold, color = SabqTheme.colors.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            top.forEachIndexed { i, c ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                    Box(Modifier.size(8.dp).clip(CircleShape).background(SabqTheme.colors.primaryEnd.copy(alpha = shareOpacities[minOf(i, 5)])))
                    Text("${c.ar} ${EconomyFormat.fmtPct(c.share)}", fontSize = 11.sp, fontWeight = FontWeight.Medium, color = SabqTheme.colors.secondaryInk)
                }
            }
        }
    }
}

@Composable
private fun MoverList(title: String, items: List<EconomyMover>) {
    EconomyCard(modifier = Modifier.fillMaxSize()) {
        Text(title, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = SabqTheme.colors.ink)
        items.take(7).forEach { m ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(m.ar, fontSize = 12.sp, color = SabqTheme.colors.secondaryInk, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                EconomyChangeChip(value = m.changePct)
            }
        }
    }
}

/** مسار أربعة أسابيع بقيم فوق النقاط وتسميات الأسابيع تحته (الأقدم على اليمين). */
@Composable
private fun EconomyWeeksChart(values: List<Double>, labels: List<String>) {
    val measurer = rememberTextMeasurer()
    val ink = SabqTheme.colors.ink
    val tint = SabqTheme.colors.primaryEnd
    val shape = RoundedCornerShape(14.dp)
    Column(Modifier.fillMaxWidth().clip(shape).background(SabqTheme.colors.surface).border(1.dp, SabqTheme.colors.outline, shape).padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Canvas(Modifier.fillMaxWidth().height(150.dp)) {
            val v = values.filter { it.isFinite() }
            if (v.size < 2) return@Canvas
            val minV = v.min(); val maxV = v.max()
            val span = maxOf(maxV - minV, 0.000001)
            val inset = 36.dp.toPx()
            val stepX = (size.width - inset * 2) / (v.size - 1)
            val pts = v.mapIndexed { i, value ->
                Offset(size.width - inset - i * stepX, size.height - 8.dp.toPx() - ((value - minV) / span).toFloat() * (size.height - 40.dp.toPx()))
            }
            val area = Path().apply { moveTo(pts[0].x, size.height); pts.forEach { lineTo(it.x, it.y) }; lineTo(pts.last().x, size.height); close() }
            drawPath(area, Brush.verticalGradient(listOf(tint.copy(alpha = 0.25f), tint.copy(alpha = 0.02f))))
            val line = Path().apply { moveTo(pts[0].x, pts[0].y); pts.drop(1).forEach { lineTo(it.x, it.y) } }
            drawPath(line, tint, style = Stroke(width = 2.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
            pts.forEachIndexed { i, pt ->
                drawCircle(tint, radius = 3.5.dp.toPx(), center = pt)
                val layout = measurer.measure(EconomyFormat.fmtSar(v[i]), TextStyle(fontSize = 10.sp, fontWeight = FontWeight.SemiBold, color = ink))
                drawText(layout, topLeft = Offset(pt.x - layout.size.width / 2f, maxOf(0f, pt.y - 14.dp.toPx() - layout.size.height / 2f)))
            }
        }
        Row(Modifier.fillMaxWidth()) {
            labels.forEach { l ->
                Text(l, fontSize = 9.sp, color = SabqTheme.colors.tertiaryInk, maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center, modifier = Modifier.weight(1f))
            }
        }
    }
}

// ---------------------------------------------------------------- monthly
private data class MonthlyContent(
    val monthLabel: String, val headline: String, val intro: String?,
    val cards: List<EconomyMonthlyCard>, val trackers: List<EconomyTracker>, val ingestedAt: String?,
) {
    companion object {
        fun from(story: EconomyMonthlyStory) = MonthlyContent(story.monthLabelAr, story.lead.headline, story.lead.intro, story.cards, story.trackers, story.ingestedAt)
        fun from(summary: EconomyMonthlySummary) = MonthlyContent(summary.monthLabelAr, summary.headline, null, summary.cards, emptyList(), summary.ingestedAt)
    }
}

@Composable
private fun EconomyMonthlyModule(m: MonthlyContent) {
    Column(verticalArrangement = Arrangement.spacedBy(20.dp)) {
        EconomyCard {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("السعوديون في ${m.monthLabel} · النشرة الإحصائية الشهرية", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = SabqTheme.colors.primaryEnd, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                if (EconomyFormat.isFresh(m.ingestedAt)) EconomyNewBadge("نشرة جديدة")
            }
            Text(m.headline, fontSize = 20.sp, fontWeight = FontWeight.Black, color = SabqTheme.colors.ink, lineHeight = 30.sp)
            m.intro?.takeIf { it.isNotEmpty() }?.let { Text(it, fontSize = 13.sp, color = SabqTheme.colors.secondaryInk, lineHeight = 21.sp) }
            Text("المصدر: البنك المركزي السعودي — النشرة الإحصائية الشهرية، ${m.monthLabel}", fontSize = 11.sp, color = SabqTheme.colors.tertiaryInk)
        }
        TwoColumnGrid(m.cards.size) { i -> MonthlyCardView(m.cards[i]) }
        if (m.trackers.isNotEmpty()) {
            EconomySectionHead("مؤشرات تتراكم شهرًا بعد شهر", "آخر 13 شهرًا — تُحدَّث تلقائيًا مع كل نشرة.")
            TwoColumnGrid(m.trackers.size) { i ->
                val t = m.trackers[i]
                EconomyCard(modifier = Modifier.fillMaxSize()) {
                    Text(t.titleAr, fontSize = 11.sp, fontWeight = FontWeight.Medium, color = SabqTheme.colors.secondaryInk, maxLines = 2)
                    Text(t.series.lastOrNull()?.let { EconomyFormat.fmtUnit(it.value, t.unit) } ?: "—", fontSize = 16.sp, fontWeight = FontWeight.Black, color = SabqTheme.colors.ink)
                    EconomyMiniArea(values = t.series.map { it.value }, labels = t.series.map { EconomyFormat.fmtMonthShort(it.period) }, modifier = Modifier.fillMaxWidth().height(80.dp))
                }
            }
        }
    }
}

@Composable
private fun MonthlyCardView(card: EconomyMonthlyCard) {
    val tone = EconomyTone.color(card.tone)
    EconomyAccentCard(tone = tone ?: SabqTheme.colors.primaryEnd, modifier = Modifier.fillMaxSize()) {
        Column(Modifier.padding(12.dp).padding(top = 3.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(card.cardTitle, fontSize = 11.sp, fontWeight = FontWeight.Medium, color = SabqTheme.colors.secondaryInk, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(card.headline, fontSize = 15.sp, fontWeight = FontWeight.Bold, color = SabqTheme.colors.ink)
            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                Text(card.figure, fontSize = 24.sp, fontWeight = FontWeight.Black, color = tone ?: SabqTheme.colors.ink, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.End)
            }
            Text(card.detailAr, fontSize = 12.sp, color = SabqTheme.colors.secondaryInk)
            if (card.series.size > 1) {
                EconomyMiniArea(values = card.series.map { it.value }, labels = card.series.map { EconomyFormat.fmtMonthShort(it.period) }, modifier = Modifier.fillMaxWidth().height(96.dp), tint = tone ?: SabqTheme.colors.primaryEnd)
                card.seriesLabelAr?.let { Text(it, fontSize = 10.sp, color = SabqTheme.colors.tertiaryInk) }
            }
        }
    }
}

// ---------------------------------------------------------------- SAMA news
@Composable
private fun EconomySamaNews(items: List<EconomySamaNews>) {
    val uriHandler = LocalUriHandler.current
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.Bottom) {
            Text("من البنك المركزي", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = SabqTheme.colors.ink, modifier = Modifier.weight(1f))
            Text("إعلانات ساما الرسمية", fontSize = 11.sp, color = SabqTheme.colors.tertiaryInk)
        }
        val shape = RoundedCornerShape(12.dp)
        Column(Modifier.fillMaxWidth().clip(shape).background(SabqTheme.colors.surface).border(1.dp, SabqTheme.colors.outline, shape).padding(horizontal = 14.dp)) {
            items.take(5).forEachIndexed { index, n ->
                if (index > 0) androidx.compose.material3.HorizontalDivider(color = SabqTheme.colors.outline)
                Row(
                    Modifier.fillMaxWidth().clickable { runCatching { uriHandler.openUri(n.url) } }.padding(vertical = 10.dp),
                    verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(n.title, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = SabqTheme.colors.ink)
                        Text(EconomyFormat.fmtDateAr(n.publishedAt), fontSize = 11.sp, color = SabqTheme.colors.tertiaryInk)
                    }
                    Icon(Icons.Filled.OpenInNew, contentDescription = null, tint = SabqTheme.colors.tertiaryInk, modifier = Modifier.size(14.dp))
                }
            }
        }
    }
}
