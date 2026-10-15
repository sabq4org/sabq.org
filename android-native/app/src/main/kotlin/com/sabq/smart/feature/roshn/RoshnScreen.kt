package com.sabq.smart.feature.roshn

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
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
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.ProvideTextStyle
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import com.sabq.smart.R
import com.sabq.smart.ui.theme.IbmPlexSansArabic

// مركز دوري روشن السعودي — port ‏1:1 لشاشة iOS `RoshnView.swift` بهوية
// «أخضر الملعب» (2026-08-01): هيرو زمردي صلب، قماشة فستقية، بطاقات بلا
// حدود، وأربعة تبويبات: المباريات بدلاء الخادم، الترتيب الملوّن بالمناطق،
// سباقات الموسم، و«الجدول» — متصفّح الجولات الـ٣٤.
// البيانات من /api/rsl/hero و/api/sports/pro-league/*.

// ── ذرّات مشتركة بين شاشات روشن ──

/** نتيجة/رقم داخل جملة RTL: الضيف أولًا داخل عزل LTR فيظهر المضيف يمينًا. */
@Composable
internal fun RsLtrText(text: String, color: Color, fontSize: Int, weight: FontWeight = FontWeight.Bold) {
    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
        Text(text, color = color, fontSize = fontSize.sp, fontWeight = weight, maxLines = 1)
    }
}

@Composable
internal fun RsTeamLogo(url: String, size: Int = 30, padding: Int = 3) {
    Box(
        modifier = Modifier.size(size.dp).clip(CircleShape).background(Color.White).padding(padding.dp),
        contentAlignment = Alignment.Center,
    ) {
        AsyncImage(model = url, contentDescription = null, contentScale = ContentScale.Fit, modifier = Modifier.fillMaxWidth())
    }
}

@Composable
internal fun RsSectionHeading(title: String, subtitle: String, icon: @Composable () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(
            modifier = Modifier.size(36.dp).clip(RoundedCornerShape(11.dp)).background(RoshnColors.skySoft),
            contentAlignment = Alignment.Center,
        ) { icon() }
        Column {
            Text(title, color = RoshnColors.ink, fontSize = 17.sp, fontWeight = FontWeight.Bold)
            Text(subtitle, color = RoshnColors.inkSoft, fontSize = 10.sp)
        }
    }
}

@Composable
internal fun RsEmptyState(text: String) {
    Box(Modifier.fillMaxWidth().padding(vertical = 44.dp), contentAlignment = Alignment.Center) {
        Text(text, color = RoshnColors.inkSoft, fontSize = 13.sp, textAlign = TextAlign.Center)
    }
}

@Composable
internal fun RsRetryBanner(message: String, onRetry: () -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp),
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp))
            .background(RoshnColors.goldSoft.copy(alpha = 0.75f)).padding(11.dp),
    ) {
        Text(message, color = RoshnColors.inkSoft, fontSize = 11.sp, modifier = Modifier.weight(1f))
        Text(
            "إعادة", color = RoshnColors.sky, fontSize = 11.sp, fontWeight = FontWeight.Bold,
            modifier = Modifier.clickable(onClick = onRetry),
        )
    }
}

@Composable
internal fun RsLoadingRows(count: Int, height: Int) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        repeat(count) {
            Box(Modifier.fillMaxWidth().height(height.dp).clip(RoundedCornerShape(14.dp)).background(RoshnColors.skySoft.copy(alpha = 0.5f)))
        }
    }
}

internal fun rsLiveMinute(status: RsStatus): String? {
    val elapsed = status.elapsed?.takeIf { it > 0 } ?: return null
    val extra = status.extra?.takeIf { it > 0 }?.let { "+$it" } ?: ""
    return "$elapsed$extra'"
}

/** صفّ مباراة — مطابق iOS `RoshnMatchRow`: المضيف يمين والنتيجة بعزل LTR. */
@Composable
internal fun RoshnMatchRow(fixture: RsFixture, onOpen: () -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.fillMaxWidth()
            .shadow(2.dp, RoundedCornerShape(14.dp), spotColor = RoshnColors.cardShadow, ambientColor = RoshnColors.cardShadow)
            .clip(RoundedCornerShape(14.dp)).background(RoshnColors.card)
            .clickable(onClick = onOpen).padding(horizontal = 12.dp, vertical = 12.dp),
    ) {
        // المضيف — أول عنصر في RTL فيظهر يمينًا (قاعدة المالك الموثّقة).
        Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            RsTeamLogo(fixture.home.logo)
            Text(
                fixture.home.name, color = RoshnColors.ink, fontSize = 13.sp, fontWeight = FontWeight.Bold,
                maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f),
            )
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.width(92.dp)) {
            if (fixture.started) {
                // النتيجة داخل قرص ملوّن مسطّح: زمردي للمنتهية وأحمر للحية.
                Box(
                    Modifier.clip(RoundedCornerShape(9.dp))
                        .background(if (fixture.status.live) RoshnColors.liveRed else RoshnColors.sky)
                        .padding(horizontal = 9.dp, vertical = 3.dp),
                ) {
                    RsLtrText("${fixture.goals.away ?: 0} - ${fixture.goals.home ?: 0}", Color.White, 15)
                }
                if (fixture.status.live) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Box(Modifier.size(5.dp).clip(CircleShape).background(RoshnColors.liveRed))
                        Text(rsLiveMinute(fixture.status) ?: fixture.status.label, color = RoshnColors.liveRed, fontSize = 10.sp, fontWeight = FontWeight.Medium, maxLines = 1)
                    }
                } else {
                    Text(fixture.status.label, color = RoshnColors.inkSoft, fontSize = 9.sp, maxLines = 1)
                }
            } else {
                Text(RsFormat.time(fixture), color = RoshnColors.sky, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                Text(
                    fixture.venue.name.ifEmpty { "يُعلن لاحقًا" }, color = RoshnColors.inkSoft, fontSize = 8.sp,
                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
            }
        }
        Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            Text(
                fixture.away.name, color = RoshnColors.ink, fontSize = 13.sp, fontWeight = FontWeight.Bold,
                maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.End, modifier = Modifier.weight(1f),
            )
            RsTeamLogo(fixture.away.logo)
        }
    }
}

// ── شريط دوري روشن في الواجهة الرئيسية ──
//
// «أخضر الملعب» (2026-08-02): بطاقة زمردية صلبة بنص أبيض — نفس لون هيرو
// المركز — بثلاثة عناصر فقط: شعار الدوري، سطرا الهوية، وشارة حالة واحدة
// (عدّاد/نتيجة حية/بطل). قرار المالك بعد البطاقة البيضاء المزدحمة.
// تختفي كليًا عند إطفاء البلوك من لوحة التحكم (blockHidden) — نفس مفتاح الويب.

@Composable
fun RoshnHomeStrip(onClick: () -> Unit, viewModel: RoshnStripViewModel = hiltViewModel()) {
    val hero by viewModel.hero.collectAsStateWithLifecycle()
    val h = hero ?: return
    if (h.blockHidden) return

    val offSeasonChampion = if (h.outlook.phase == "off-season") h.outlook.champion ?: h.lastSeason?.champion else null
    val matchdayMode = h.inSeason && (h.matchday?.count ?: 0) >= 3
    val cardFixture = h.live.firstOrNull() ?: h.nextMatch ?: h.outlook.openers.firstOrNull()
    if (offSeasonChampion == null && cardFixture == null && !matchdayMode) return

    ProvideTextStyle(LocalTextStyle.current.copy(fontFamily = IbmPlexSansArabic)) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(11.dp),
            modifier = Modifier.fillMaxWidth()
                .shadow(4.dp, RoundedCornerShape(22.dp), spotColor = RoshnColors.cardShadow, ambientColor = RoshnColors.cardShadow)
                .clip(RoundedCornerShape(22.dp))
                .background(RoshnColors.sky)
                .clickable(onClick = onClick)
                .padding(horizontal = 14.dp, vertical = 13.dp),
        ) {
            Image(
                painter = painterResource(R.drawable.roshn_league_logo),
                contentDescription = null, contentScale = ContentScale.Fit,
                modifier = Modifier.size(40.dp)
                    .clip(RoundedCornerShape(11.dp)).background(Color.White).padding(4.dp),
            )
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text("دوري روشن", color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                val subtitle = when {
                    offSeasonChampion != null -> "اكتمل الموسم"
                    h.preSeason && !h.inSeason && cardFixture != null && !cardFixture.started -> "الموسم الجديد"
                    matchdayMode && h.matchday != null ->
                        "${h.matchday.round ?: "جولة الدوري"} · ${h.matchday.count} ${if (h.matchday.count == 2) "مباراتان" else "مباريات"}"
                    cardFixture != null && cardFixture.status.live -> "${cardFixture.home.name} × ${cardFixture.away.name}"
                    cardFixture != null -> "${cardFixture.home.name} × ${cardFixture.away.name} · ${RsFormat.time(cardFixture)}"
                    else -> "تغطية حية بتوقيت الرياض"
                }
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(subtitle, color = Color.White.copy(alpha = 0.85f), fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    if (offSeasonChampion == null && h.preSeason && !h.inSeason && cardFixture != null && !cardFixture.started) {
                        RsLtrText(
                            RsFormat.seasonLabel(h.outlook.nextSeason ?: h.outlook.season),
                            Color.White.copy(alpha = 0.85f), 10, FontWeight.Normal,
                        )
                    }
                }
            }

            when {
                offSeasonChampion != null -> RsBannerChip(RoshnColors.gold) {
                    Text("🏆 ${offSeasonChampion.name}", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                }
                matchdayMode && h.matchday != null && h.matchday.liveCount > 0 -> RsBannerChip(RoshnColors.liveRed) {
                    Box(Modifier.size(5.dp).clip(CircleShape).background(Color.White))
                    Text(
                        if (h.matchday.liveCount == 1) "مباشر" else "${h.matchday.liveCount} مباشر",
                        color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold,
                    )
                }
                matchdayMode && h.matchday?.nextKickoffTs != null ->
                    RsCountdownChip("تنطلق بعد", h.matchday.nextKickoffTs)
                cardFixture != null && cardFixture.status.live -> RsBannerChip(RoshnColors.liveRed) {
                    Box(Modifier.size(5.dp).clip(CircleShape).background(Color.White))
                    RsLtrText("${cardFixture.goals.away ?: 0} - ${cardFixture.goals.home ?: 0}", Color.White, 13)
                    rsLiveMinute(cardFixture.status)?.let { RsLtrText(it, Color.White, 11, FontWeight.Medium) }
                }
                cardFixture != null && !cardFixture.started -> {
                    val ts = if (h.preSeason && !h.inSeason) h.outlook.firstKickoffTs ?: cardFixture.timestamp else cardFixture.timestamp
                    if (ts > 0) RsCountdownChip(if (h.preSeason) "ينطلق بعد" else "تنطلق بعد", ts)
                }
            }

            Box(
                Modifier.size(22.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.18f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    Icons.AutoMirrored.Filled.KeyboardArrowLeft, null,
                    tint = Color.White, modifier = Modifier.size(15.dp),
                )
            }
        }
    }
}

@Composable
private fun RsBannerChip(background: Color, content: @Composable RowScope.() -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp),
        modifier = Modifier.clip(RoundedCornerShape(50)).background(background)
            .padding(horizontal = 10.dp, vertical = 6.dp),
        content = content,
    )
}

@Composable
private fun RsCountdownChip(prefix: String, timestamp: Int) {
    val now = rememberRsSecondTicker()
    RsBannerChip(Color.White.copy(alpha = 0.16f)) {
        Text(
            "$prefix ${RsFormat.countdown(timestamp, now)}",
            color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold, maxLines = 1,
        )
    }
}

// ── مركز الدوري ──

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RoshnScreen(
    onBack: () -> Unit,
    onOpenMatch: (Int) -> Unit,
    onOpenTeam: (RsTeam) -> Unit,
    onOpenPredictions: () -> Unit = {},
    viewModel: RoshnHubViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val hero by viewModel.hero.collectAsStateWithLifecycle()
    // اختيار المستخدم لدلو المباريات — حالة شاشة بنمط iOS `@State matchBucket`.
    var matchBucket by rememberSaveable { mutableStateOf<RsBucket?>(null) }

    ProvideTextStyle(LocalTextStyle.current.copy(fontFamily = IbmPlexSansArabic)) {
        Column(Modifier.fillMaxSize().background(RoshnColors.canvas)) {
            RoshnHeader("دوري روشن", onBack)
            PullToRefreshBox(isRefreshing = state.refreshing, onRefresh = viewModel::refresh, modifier = Modifier.weight(1f)) {
                LazyColumn(
                    contentPadding = PaddingValues(start = 14.dp, end = 14.dp, bottom = 28.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    item { RoshnHero(hero, state) }
                    item { RoshnTabBar(state.tab, hero?.predictionsEnabled == true, onOpenPredictions, viewModel::select) }
                    when (state.tab) {
                        RoshnHubViewModel.Tab.MATCHES ->
                            matchesTab(state, viewModel, onOpenMatch, matchBucket) { matchBucket = it }
                        RoshnHubViewModel.Tab.STANDINGS -> standingsTab(state, viewModel, onOpenTeam)
                        RoshnHubViewModel.Tab.RACES -> item { RoshnRacesSection(state, viewModel::retryRaces) }
                        RoshnHubViewModel.Tab.SCHEDULE -> scheduleTab(state, viewModel, onOpenMatch)
                    }
                }
            }
        }
    }
}

@Composable
internal fun RoshnHeader(title: String, onBack: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().background(RoshnColors.canvas).statusBarsPadding().padding(horizontal = 4.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null, tint = RoshnColors.ink) }
        Text(title, color = RoshnColors.ink, fontSize = 17.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f), textAlign = TextAlign.Center)
        Spacer(Modifier.width(48.dp))
    }
}

/** الترويسة — ضباب صباحي ناعم بشعار الدوري ومقاييس سريعة وعدّاد ما قبل الموسم. */
@Composable
private fun RoshnHero(hero: RsHero?, state: RoshnHubViewModel.State) {
    Box(
        modifier = Modifier.fillMaxWidth()
            .shadow(4.dp, RoundedCornerShape(24.dp), spotColor = RoshnColors.cardShadow, ambientColor = RoshnColors.cardShadow)
            .clip(RoundedCornerShape(24.dp))
            .background(RoshnColors.hero),
    ) {
        Column(Modifier.padding(17.dp), verticalArrangement = Arrangement.spacedBy(15.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(13.dp)) {
                Image(
                    painter = painterResource(R.drawable.roshn_league_logo),
                    contentDescription = null, contentScale = ContentScale.Fit,
                    modifier = Modifier.size(64.dp)
                        .clip(RoundedCornerShape(17.dp)).background(Color.White).padding(7.dp),
                )
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("دوري روشن السعودي", color = RoshnColors.heroOn, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                    // نفس صياغة iOS: «موسم 2026-27 · تغطية حية بتوقيت الرياض».
                    val season = hero?.outlook?.let { it.nextSeason ?: it.season }
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                        if (season != null) {
                            Text("موسم", color = RoshnColors.heroOnSoft, fontSize = 11.sp, maxLines = 1)
                            RsLtrText(RsFormat.seasonLabel(season), RoshnColors.heroOnSoft, 11, FontWeight.Normal)
                            Text("·", color = RoshnColors.heroOnSoft, fontSize = 11.sp)
                        }
                        Text("تغطية حية بتوقيت الرياض", color = RoshnColors.heroOnSoft, fontSize = 11.sp, maxLines = 1)
                    }
                }
                val liveCount = hero?.live?.size ?: 0
                if (liveCount > 0) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp),
                        modifier = Modifier.clip(RoundedCornerShape(50)).background(RoshnColors.liveRed).padding(horizontal = 9.dp, vertical = 6.dp),
                    ) {
                        Box(Modifier.size(6.dp).clip(CircleShape).background(Color.White))
                        Text(if (liveCount == 1) "مباشر" else "$liveCount مباشر", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                RoshnHeroMetric("${state.standings.size}", "نادٍ", Modifier.weight(1f))
                RoshnHeroMetric("${state.buckets?.upcoming?.size ?: 0}", "قادمة", Modifier.weight(1f))
                RoshnHeroMetric("${state.scorers.size}", "في السباق", Modifier.weight(1f))
            }

            val h = hero
            if (h != null && h.preSeason && !h.inSeason && h.outlook.firstKickoffTs != null) {
                val now = rememberRsSecondTicker()
                Box(
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(RoshnColors.heroChip)
                        .padding(vertical = 10.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        "الموسم الجديد ينطلق بعد ${RsFormat.countdown(h.outlook.firstKickoffTs!!, now)}",
                        color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1,
                    )
                }
            }
        }
    }
}

@Composable
private fun RoshnHeroMetric(value: String, label: String, modifier: Modifier) {
    Row(
        modifier = modifier.clip(RoundedCornerShape(12.dp)).background(RoshnColors.heroChip).padding(vertical = 9.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(value, color = RoshnColors.heroOn, fontSize = 14.sp, fontWeight = FontWeight.Bold)
        Text(label, color = RoshnColors.heroOn, fontSize = 10.sp)
    }
}

@Composable
private fun RoshnTabBar(
    selected: RoshnHubViewModel.Tab,
    showPredictions: Boolean,
    onOpenPredictions: () -> Unit,
    onSelect: (RoshnHubViewModel.Tab) -> Unit,
) {
    val labels = mapOf(
        RoshnHubViewModel.Tab.MATCHES to "المباريات",
        RoshnHubViewModel.Tab.STANDINGS to "الترتيب",
        RoshnHubViewModel.Tab.RACES to "الهدّافون",
        RoshnHubViewModel.Tab.SCHEDULE to "الجدول",
    )
    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        items(RoshnHubViewModel.Tab.entries.toList()) { tab ->
            val active = tab == selected
            Text(
                labels.getValue(tab),
                color = if (active) Color.White else RoshnColors.inkSoft,
                fontSize = 13.sp, fontWeight = if (active) FontWeight.Bold else FontWeight.Normal,
                modifier = Modifier.clip(RoundedCornerShape(50))
                    .background(if (active) RoshnColors.ink else RoshnColors.card)
                    .clickable { onSelect(tab) }
                    .padding(horizontal = 15.dp, vertical = 10.dp),
            )
        }
        // «التوقعات» بوابة لصفحة مستقلة — ذهبية، تظهر فقط عند تفعيل المسابقة
        // من الخادم (hero.predictionsEnabled). طلب المالك: صفحة لا تبويبًا.
        if (showPredictions) {
            item {
                Text(
                    "التوقعات 🎯",
                    color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold,
                    modifier = Modifier.clip(RoundedCornerShape(50))
                        .background(RoshnColors.gold)
                        .clickable(onClick = onOpenPredictions)
                        .padding(horizontal = 15.dp, vertical = 10.dp),
                )
            }
        }
    }
}

// ── تبويب المباريات — دلاء جاهزة من الخادم ──

private enum class RsBucket(val label: String) { LIVE("مباشر"), TODAY("اليوم"), UPCOMING("القادمة"), RESULTS("النتائج") }

private fun androidx.compose.foundation.lazy.LazyListScope.matchesTab(
    state: RoshnHubViewModel.State,
    viewModel: RoshnHubViewModel,
    onOpenMatch: (Int) -> Unit,
    selection: RsBucket?,
    onSelect: (RsBucket) -> Unit,
) {
    item { RsSectionHeading("مباريات الدوري", "المواعيد والنتائج لحظة بلحظة") { Text("⚽", fontSize = 15.sp) } }
    state.matchesError?.let { error -> item { RsRetryBanner(error, viewModel::retryMatches) } }
    item { MatchBucketChips(state, selection, onSelect) }
    if (state.loadingMatches && state.buckets == null) {
        item { RsLoadingRows(5, 74) }
    } else {
        val bucket = activeBucket(state, selection)
        val fixtures = fixturesFor(state, bucket)
        if (fixtures.isEmpty()) {
            item { RsEmptyState(emptyMessage(bucket)) }
        } else {
            groupedByDay(fixtures).forEach { (day, items) ->
                item(key = "day-$day-${items.firstOrNull()?.id ?: 0}") {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 4.dp)) {
                        Box(Modifier.size(6.dp).clip(CircleShape).background(RoshnColors.gold))
                        Text(day, color = RoshnColors.sky, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        items.firstOrNull()?.round?.takeIf { it.isNotEmpty() }?.let {
                            Text("· $it", color = RoshnColors.inkSoft, fontSize = 11.sp)
                        }
                    }
                }
                items(items, key = { "fx-${it.id}" }) { fixture -> RoshnMatchRow(fixture) { onOpenMatch(fixture.id) } }
            }
        }
    }
}

@Composable
private fun MatchBucketChips(state: RoshnHubViewModel.State, selection: RsBucket?, onSelect: (RsBucket) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        val active = activeBucket(state, selection)
        RsBucket.entries.forEach { bucket ->
            val selected = bucket == active
            Row(
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp),
                modifier = Modifier.clip(RoundedCornerShape(50))
                    .background(if (selected) RoshnColors.skySoft else Color.Transparent)
                    .clickable { onSelect(bucket) }
                    .padding(horizontal = 12.dp, vertical = 7.dp),
            ) {
                if (bucket == RsBucket.LIVE && (state.buckets?.live?.size ?: 0) > 0) {
                    Box(Modifier.size(6.dp).clip(CircleShape).background(RoshnColors.liveRed))
                }
                Text(
                    bucket.label, color = if (selected) RoshnColors.sky else RoshnColors.inkSoft,
                    fontSize = 12.sp, fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
                )
            }
        }
    }
}

/** الدلو الفعّال: اختيار المستخدم أولًا، وإلا مباشر ← اليوم ← القادمة (نفس منطق iOS). */
private fun activeBucket(state: RoshnHubViewModel.State, selection: RsBucket?): RsBucket {
    selection?.let { return it }
    val b = state.buckets ?: return RsBucket.UPCOMING
    if (b.live.isNotEmpty()) return RsBucket.LIVE
    if (b.today.isNotEmpty()) return RsBucket.TODAY
    return RsBucket.UPCOMING
}

private fun fixturesFor(state: RoshnHubViewModel.State, bucket: RsBucket): List<RsFixture> {
    val b = state.buckets ?: return emptyList()
    return when (bucket) {
        RsBucket.LIVE -> b.live
        RsBucket.TODAY -> b.today
        RsBucket.RESULTS -> b.results.sortedByDescending { it.timestamp }
        RsBucket.UPCOMING -> b.upcoming
    }
}

private fun emptyMessage(bucket: RsBucket): String = when (bucket) {
    RsBucket.LIVE -> "لا مباريات مباشرة الآن — عُد عند صافرة البداية"
    RsBucket.TODAY -> "لا مباريات اليوم"
    RsBucket.RESULTS -> "النتائج تظهر هنا فور انتهاء أول مباراة"
    RsBucket.UPCOMING -> "جدول الموسم يُعلن قريبًا — ستجده هنا فور اعتماده"
}

private fun groupedByDay(fixtures: List<RsFixture>): List<Pair<String, List<RsFixture>>> {
    val order = mutableListOf<String>()
    val groups = mutableMapOf<String, MutableList<RsFixture>>()
    for (f in fixtures) {
        val day = RsFormat.day(f)
        if (day !in groups) order.add(day)
        groups.getOrPut(day) { mutableListOf() }.add(f)
    }
    return order.map { it to (groups[it] ?: mutableListOf()) }
}

// ── تبويب الترتيب — جدول ملوّن بالمناطق ──

private fun androidx.compose.foundation.lazy.LazyListScope.standingsTab(
    state: RoshnHubViewModel.State,
    viewModel: RoshnHubViewModel,
    onOpenTeam: (RsTeam) -> Unit,
) {
    item { RsSectionHeading("جدول الترتيب", "المراكز والنقاط وفارق الأهداف") { Text("📊", fontSize = 15.sp) } }
    state.standingsError?.let { error -> item { RsRetryBanner(error, viewModel::retryStandings) } }
    if (state.loadingStandings && state.standings.isEmpty()) {
        item { RsLoadingRows(9, 44) }
    } else if (state.standings.isEmpty()) {
        item { RsEmptyState("الترتيب يتشكّل مع أول جولة في الموسم") }
    } else {
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.padding(horizontal = 4.dp)) {
                StandingLegend(RoshnColors.gold, "اللقب")
                StandingLegend(RoshnColors.sky, "نخبة آسيا")
                StandingLegend(RoshnColors.danger, "هبوط")
            }
        }
        item {
            Row(Modifier.padding(horizontal = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("#", color = RoshnColors.inkSoft, fontSize = 10.sp, modifier = Modifier.width(22.dp))
                Text("النادي", color = RoshnColors.inkSoft, fontSize = 10.sp, modifier = Modifier.weight(1f))
                Text("ل", color = RoshnColors.inkSoft, fontSize = 10.sp, modifier = Modifier.width(26.dp), textAlign = TextAlign.Center)
                Text("+/-", color = RoshnColors.inkSoft, fontSize = 10.sp, modifier = Modifier.width(32.dp), textAlign = TextAlign.Center)
                Text("ن", color = RoshnColors.inkSoft, fontSize = 10.sp, modifier = Modifier.width(30.dp), textAlign = TextAlign.Center)
            }
        }
        itemsIndexed(state.standings, key = { _, row -> "st-${row.team.id}" }) { _, row ->
            RoshnStandingRowView(row, state.standings.size) { onOpenTeam(row.team) }
        }
    }
}

@Composable
private fun StandingLegend(color: Color, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        Box(Modifier.size(7.dp).clip(CircleShape).background(color))
        Text(label, color = RoshnColors.inkSoft, fontSize = 10.sp)
    }
}

/** صفّ ترتيب — لون منطقة المركز: لقب/نخبة آسيا/هبوط، كما جدول الويب وiOS. */
@Composable
internal fun RoshnStandingRowView(row: RsStandingRow, total: Int, onOpen: () -> Unit) {
    val zoneColor: Color? = when {
        row.rank == 1 -> RoshnColors.gold
        row.rank <= 3 -> RoshnColors.sky
        row.rank > total - 3 -> RoshnColors.danger
        else -> null
    }
    Row(
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.fillMaxWidth()
            .shadow(2.dp, RoundedCornerShape(12.dp), spotColor = RoshnColors.cardShadow, ambientColor = RoshnColors.cardShadow)
            .clip(RoundedCornerShape(12.dp)).background(RoshnColors.card)
            .clickable(onClick = onOpen).padding(horizontal = 10.dp, vertical = 8.dp),
    ) {
        Box(
            modifier = Modifier.size(22.dp).clip(CircleShape)
                .background(zoneColor?.copy(alpha = 0.14f) ?: RoshnColors.skySoft.copy(alpha = 0.6f)),
            contentAlignment = Alignment.Center,
        ) {
            Text("${row.rank}", color = zoneColor ?: RoshnColors.inkSoft, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        }
        RsTeamLogo(row.team.logo, size = 26, padding = 2)
        Text(
            row.team.name, color = RoshnColors.ink, fontSize = 13.sp, fontWeight = FontWeight.Bold,
            maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f),
        )
        if (row.live == true) Box(Modifier.size(6.dp).clip(CircleShape).background(RoshnColors.liveRed))
        Text("${row.played}", color = RoshnColors.inkSoft, fontSize = 12.sp, modifier = Modifier.width(26.dp), textAlign = TextAlign.Center)
        Box(Modifier.width(32.dp), contentAlignment = Alignment.Center) {
            RsLtrText(
                if (row.goalsDiff > 0) "+${row.goalsDiff}" else "${row.goalsDiff}",
                when { row.goalsDiff > 0 -> RoshnColors.pitch; row.goalsDiff < 0 -> RoshnColors.danger; else -> RoshnColors.inkSoft },
                12, FontWeight.Normal,
            )
        }
        Text("${row.points}", color = RoshnColors.ink, fontSize = 13.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(30.dp), textAlign = TextAlign.Center)
    }
}

// ── تبويب الجدول — متصفّح الجولات الـ٣٤ ──

private fun androidx.compose.foundation.lazy.LazyListScope.scheduleTab(
    state: RoshnHubViewModel.State,
    viewModel: RoshnHubViewModel,
    onOpenMatch: (Int) -> Unit,
) {
    item { RsSectionHeading("جدول الموسم", "كل مباريات الدوري جولةً بجولة") { Text("🗓", fontSize = 15.sp) } }
    if (state.scheduleError != null && state.rounds.isEmpty()) {
        item { RsRetryBanner(state.scheduleError, viewModel::retrySchedule) }
    }
    if (state.loadingSchedule && state.rounds.isEmpty()) {
        item { RsLoadingRows(6, 74) }
    } else if (state.rounds.isEmpty()) {
        item { RsEmptyState("جدول الموسم يُعلن قريبًا — ستجده هنا فور اعتماده") }
    } else {
        item { RoundPicker(state, viewModel::selectRound) }
        if (state.scheduleError != null && state.roundFixtures.isEmpty()) {
            item { RsRetryBanner(state.scheduleError, viewModel::retryRound) }
        }
        if (state.loadingRound) {
            item { RsLoadingRows(5, 74) }
        } else if (state.roundFixtures.isEmpty()) {
            item { RsEmptyState("مباريات هذه الجولة تُعلن قريبًا") }
        } else {
            items(state.roundFixtures, key = { "rf-${it.id}" }) { fixture -> RoshnMatchRow(fixture) { onOpenMatch(fixture.id) } }
        }
    }
}

/** شريط الجولات الأفقي — يفتتح على الجولة الحالية ويتمرّك حول المختارة. */
@Composable
private fun RoundPicker(state: RoshnHubViewModel.State, onSelect: (String) -> Unit) {
    val listState = rememberLazyListState()
    LaunchedEffect(state.selectedRoundKey, state.rounds.size) {
        val index = state.rounds.indexOfFirst { it.key == state.selectedRoundKey }
        if (index >= 0) listState.animateScrollToItem((index - 2).coerceAtLeast(0))
    }
    LazyRow(state = listState, horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(vertical = 2.dp)) {
        items(state.rounds, key = { it.key }) { round ->
            val selected = round.key == state.selectedRoundKey
            Text(
                round.label,
                color = if (selected) Color.White else RoshnColors.inkSoft,
                fontSize = 12.sp, fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
                modifier = Modifier.clip(RoundedCornerShape(50))
                    .background(if (selected) RoshnColors.sky else RoshnColors.card)
                    .clickable { onSelect(round.key) }
                    .padding(horizontal = 12.dp, vertical = 8.dp),
            )
        }
    }
}

// ── سباقات الموسم (هدّافون / صنّاع / بطاقات) ──

private enum class RsRace(val label: String) { GOALS("الهدّافون"), ASSISTS("صنّاع الأهداف"), CARDS("البطاقات") }

@Composable
internal fun RoshnRacesSection(state: RoshnHubViewModel.State, onRetry: () -> Unit) {
    var race by rememberSaveable { mutableStateOf(RsRace.GOALS) }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        RsSectionHeading("سباقات الموسم", "الهدافون وصنّاع الأهداف والبطاقات") { Text("🏆", fontSize = 15.sp) }

        state.racesError?.let { RsRetryBanner(it, onRetry) }

        if (state.racesFromArchive) {
            Box(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(RoshnColors.goldSoft).padding(vertical = 8.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text("لوحات الموسم الماضي — تتصفّر مع أول جولة للموسم الجديد", color = RoshnColors.gold, fontSize = 11.sp)
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            RsRace.entries.forEach { item ->
                val selected = race == item
                Text(
                    item.label, color = if (selected) RoshnColors.gold else RoshnColors.inkSoft,
                    fontSize = 12.sp, fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
                    modifier = Modifier.clip(RoundedCornerShape(50))
                        .background(if (selected) RoshnColors.goldSoft else Color.Transparent)
                        .clickable { race = item }
                        .padding(horizontal = 12.dp, vertical = 7.dp),
                )
            }
        }

        when (race) {
            RsRace.GOALS -> when {
                state.scorers.isEmpty() && state.loadingRaces -> RsLoadingRows(5, 58)
                state.scorers.isEmpty() -> RacesEmpty("سباق هدّاف الدوري ينطلق مع أول صافرة")
                else -> {
                    if (state.scorers.size >= 3) ScorersPodium(state.scorers)
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        val rest = if (state.scorers.size >= 3) state.scorers.drop(3) else state.scorers
                        rest.forEach { s ->
                            LeaderRow(s.rank, s.name, s.photo, s.team, "${s.goals}", "${s.assists} صناعة")
                        }
                    }
                }
            }
            RsRace.ASSISTS -> if (state.assists.isEmpty()) {
                RacesEmpty("سباق صنّاع الأهداف ينطلق مع أول صافرة")
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    state.assists.forEach { l ->
                        LeaderRow(l.rank, l.name, l.photo, l.teamRef, "${l.assists ?: 0}", "${l.goals ?: 0} أهداف")
                    }
                }
            }
            RsRace.CARDS -> {
                val yellow = state.cards?.yellow ?: emptyList()
                if (yellow.isEmpty()) {
                    RacesEmpty("لا بطاقات بعد — وعسى ألا تكثر")
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        yellow.forEach { l ->
                            LeaderRow(l.rank, l.name, l.photo, l.teamRef, "🟨 ${l.yellow ?: 0}", "🟥 ${l.red ?: 0}")
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun RacesEmpty(text: String) {
    Box(Modifier.fillMaxWidth().padding(vertical = 40.dp), contentAlignment = Alignment.Center) {
        Text(text, color = RoshnColors.inkSoft, fontSize = 13.sp, textAlign = TextAlign.Center)
    }
}

/** منصّة التتويج: الثاني ثم الأول (أكبر) ثم الثالث — نفس ترتيب iOS. */
@Composable
private fun ScorersPodium(scorers: List<RsScorer>) {
    val leaders = listOf(scorers[1], scorers[0], scorers[2])
    Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(vertical = 4.dp)) {
        leaders.forEachIndexed { index, scorer ->
            val champion = index == 1
            Column(
                horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp),
                modifier = Modifier.weight(1f)
                    .shadow(2.dp, RoundedCornerShape(17.dp), spotColor = RoshnColors.cardShadow, ambientColor = RoshnColors.cardShadow)
                    .clip(RoundedCornerShape(17.dp))
                    .background(if (champion) RoshnColors.goldSoft else RoshnColors.card)
                    .padding(vertical = if (champion) 14.dp else 11.dp),
            ) {
                Box {
                    AsyncImage(
                        model = scorer.photo, contentDescription = null, contentScale = ContentScale.Crop,
                        modifier = Modifier.size(if (champion) 72.dp else 58.dp).clip(CircleShape)
                            .background(RoshnColors.skySoft)
                            .border(if (champion) 3.dp else 0.dp, if (champion) RoshnColors.gold else Color.Transparent, CircleShape),
                    )
                    Box(
                        modifier = Modifier.size(20.dp).align(Alignment.BottomEnd).clip(CircleShape)
                            .background(if (champion) RoshnColors.gold else RoshnColors.navy),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("${scorer.rank}", color = Color.White, fontSize = 9.sp, fontWeight = FontWeight.Bold)
                    }
                }
                Text(
                    scorer.name, color = RoshnColors.ink, fontSize = if (champion) 12.sp else 11.sp,
                    fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(horizontal = 6.dp),
                )
                Text(
                    "${scorer.goals} هدف", color = if (champion) RoshnColors.gold else RoshnColors.inkSoft,
                    fontSize = if (champion) 14.sp else 12.sp, fontWeight = FontWeight.Bold,
                )
            }
        }
    }
}

@Composable
private fun LeaderRow(rank: Int, name: String, photo: String, team: RsTeam, primary: String, secondary: String) {
    Row(
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.fillMaxWidth()
            .shadow(2.dp, RoundedCornerShape(14.dp), spotColor = RoshnColors.cardShadow, ambientColor = RoshnColors.cardShadow)
            .clip(RoundedCornerShape(14.dp)).background(RoshnColors.card)
            .padding(horizontal = 12.dp, vertical = 9.dp),
    ) {
        Box(
            modifier = Modifier.size(24.dp).clip(CircleShape)
                .background(if (rank <= 3) RoshnColors.goldSoft else RoshnColors.skySoft.copy(alpha = 0.6f)),
            contentAlignment = Alignment.Center,
        ) {
            Text("$rank", color = if (rank <= 3) RoshnColors.gold else RoshnColors.inkSoft, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        }
        AsyncImage(
            model = photo, contentDescription = null, contentScale = ContentScale.Crop,
            modifier = Modifier.size(34.dp).clip(CircleShape).background(RoshnColors.skySoft),
        )
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(name, color = RoshnColors.ink, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                if (team.logo.isNotEmpty()) {
                    AsyncImage(model = team.logo, contentDescription = null, contentScale = ContentScale.Fit, modifier = Modifier.size(12.dp))
                }
                Text(team.name, color = RoshnColors.inkSoft, fontSize = 10.sp, maxLines = 1)
            }
        }
        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(primary, color = RoshnColors.ink, fontSize = 15.sp, fontWeight = FontWeight.Bold)
            Text(secondary, color = RoshnColors.inkSoft, fontSize = 9.sp)
        }
    }
}

