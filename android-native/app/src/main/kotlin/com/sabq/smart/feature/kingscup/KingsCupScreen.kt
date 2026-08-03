package com.sabq.smart.feature.kingscup

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.ProvideTextStyle
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage

import com.sabq.smart.ui.theme.IbmPlexSansArabic

// مركز كأس خادم الحرمين الشريفين — port ‏1:1 لشاشة iOS `KingsCupView.swift`
// بهوية المونديال (زمردي + ذهبي): هيرو البطل/المباراة المميزة، بوابة
// التوقعات، حقائق النسخة السابقة، المباريات بتبويبات، شجرة الأدوار،
// السباقات الفردية، الأندية، وسجلّ الأبطال. البيانات من /api/kings-cup/*.

// ── ذرّات مشتركة بين شاشات كأس الملك ──

/** نتيجة/رقم داخل جملة RTL: الضيف أولًا داخل عزل LTR فيظهر المضيف يمينًا. */
@Composable
internal fun KcLtrText(text: String, color: Color, fontSize: Int, weight: FontWeight = FontWeight.Bold) {
    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
        Text(text, color = color, fontSize = fontSize.sp, fontWeight = weight, maxLines = 1)
    }
}

@Composable
internal fun KcTeamLogo(url: String, size: Int = 30, padding: Int = 3) {
    Box(
        modifier = Modifier.size(size.dp).clip(CircleShape).background(Color.White).padding(padding.dp),
        contentAlignment = Alignment.Center,
    ) {
        AsyncImage(model = url, contentDescription = null, contentScale = ContentScale.Fit, modifier = Modifier.fillMaxWidth())
    }
}

@Composable
internal fun KcSectionHeader(emoji: String, title: String, subtitle: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(
            modifier = Modifier.size(38.dp).clip(RoundedCornerShape(12.dp)).background(KingsCupColors.emeraldDeep.copy(alpha = 0.12f)),
            contentAlignment = Alignment.Center,
        ) { Text(emoji, fontSize = 16.sp) }
        Column {
            Text(title, color = KingsCupColors.onDark, fontSize = 17.sp, fontWeight = FontWeight.Bold)
            Text(subtitle, color = KingsCupColors.onDarkDim, fontSize = 10.sp)
        }
    }
}

@Composable
internal fun KcEmptyText(text: String) {
    Box(Modifier.fillMaxWidth().padding(vertical = 28.dp), contentAlignment = Alignment.Center) {
        Text(text, color = KingsCupColors.onDarkDim, fontSize = 13.sp, textAlign = TextAlign.Center)
    }
}

@Composable
internal fun KcLoading() {
    Box(Modifier.fillMaxWidth().padding(vertical = 32.dp), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = KingsCupColors.emeraldDeep)
    }
}

/** بطاقة مرتفعة بمفردات القسم — بديل wcElevatedCard. */
@Composable
internal fun kcCardModifier(cornerRadius: Int = 14): Modifier =
    Modifier.fillMaxWidth()
        .clip(RoundedCornerShape(cornerRadius.dp))
        .background(KingsCupColors.card)
        .border(0.5.dp, KingsCupColors.cardStroke.copy(alpha = 0.5f), RoundedCornerShape(cornerRadius.dp))

internal fun kcLiveMinute(status: KcStatus): String? {
    val elapsed = status.elapsed?.takeIf { it > 0 } ?: return null
    val extra = status.extra?.takeIf { it > 0 }?.let { "+$it" } ?: ""
    return "$elapsed$extra'"
}

/** شارة حالة المباراة: مباشر (أحمر) / انتهت / وقت الانطلاق — مرآة KcStatusPill. */
@Composable
internal fun KcStatusPill(f: KcFixture) {
    when {
        f.status.live -> Row(
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp),
            modifier = Modifier.clip(RoundedCornerShape(50)).background(KingsCupColors.liveRed).padding(horizontal = 8.dp, vertical = 3.dp),
        ) {
            Box(Modifier.size(5.dp).clip(CircleShape).background(Color.White))
            KcLtrText(kcLiveMinute(f.status)?.let { m -> if (f.status.label.isEmpty()) m else "${f.status.label} · $m" } ?: f.status.label.ifEmpty { "مباشر" }, Color.White, 11, FontWeight.Medium)
        }
        f.status.finished -> Text(
            f.status.label.ifEmpty { "انتهت" }, color = KingsCupColors.liveRed, fontSize = 11.sp,
            modifier = Modifier.clip(RoundedCornerShape(50)).background(KingsCupColors.liveRed.copy(alpha = 0.12f)).padding(horizontal = 8.dp, vertical = 3.dp),
        )
        else -> Text(
            KcFormat.time(f), color = KingsCupColors.emeraldDeep, fontSize = 11.sp, fontWeight = FontWeight.Medium,
            modifier = Modifier.clip(RoundedCornerShape(50)).background(KingsCupColors.emerald.copy(alpha = 0.16f)).padding(horizontal = 8.dp, vertical = 3.dp),
        )
    }
}

/** شريط احتمالات الفوز الثلاثي — يختفي مع غياب التوقّع أو نهاية المباراة. */
@Composable
internal fun KcProbabilityBar(f: KcFixture, p: KcPrediction) {
    val total = (p.homePct + p.drawPct + p.awayPct).coerceAtLeast(1)
    val h = p.homePct * 100 / total
    val d = p.drawPct * 100 / total
    val a = p.awayPct * 100 / total
    Column(verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("فوز ${f.home.name} $h٪", color = KingsCupColors.emeraldDeep, fontSize = 11.sp)
            Spacer(Modifier.weight(1f))
            Text("تعادل $d٪", color = KingsCupColors.onDarkDim, fontSize = 11.sp)
            Spacer(Modifier.weight(1f))
            Text("فوز ${f.away.name} $a٪", color = KingsCupColors.emeraldDeep, fontSize = 11.sp)
        }
        // بلا قلب اتجاه: الصف أعلاه RTL (المضيف يمينًا) والشريط يتبعه (قاعدة المالك).
        Row(Modifier.fillMaxWidth().height(10.dp).clip(RoundedCornerShape(50))) {
            Box(Modifier.weight(h.coerceAtLeast(1).toFloat()).fillMaxSize().background(KingsCupColors.royal))
            Box(Modifier.weight(d.coerceAtLeast(1).toFloat()).fillMaxSize().background(KingsCupColors.onDarkDim.copy(alpha = 0.5f)))
            Box(Modifier.weight(a.coerceAtLeast(1).toFloat()).fillMaxSize().background(KingsCupColors.gold))
        }
        Text("توقعات خوارزمية للاستئناس من مزود البيانات", color = KingsCupColors.onDarkDim, fontSize = 10.sp)
    }
}

// ── الشاشة ──

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun KingsCupScreen(
    onBack: () -> Unit,
    onOpenMatch: (Int) -> Unit,
    onOpenTeam: (KcTeam) -> Unit,
    onOpenPredictions: () -> Unit,
    viewModel: KingsCupHubViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    ProvideTextStyle(LocalTextStyle.current.copy(fontFamily = IbmPlexSansArabic)) {
        Column(Modifier.fillMaxSize().background(KingsCupColors.sectionBackground)) {
            KcScreenHeader("كأس الملك", onBack)
            PullToRefreshBox(isRefreshing = state.refreshing, onRefresh = viewModel::refresh, modifier = Modifier.weight(1f)) {
                LazyColumn(
                    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 32.dp),
                    verticalArrangement = Arrangement.spacedBy(18.dp),
                ) {
                    item { KcHeroSection(state, onOpenMatch, onOpenTeam) }
                    item { KcPredictCta(onOpenPredictions) }
                    state.history?.takeIf { it.hasContent }?.let { h -> item { KcHistorySection(h) } }
                    kcMatchesSection(state, onOpenMatch)
                    item { KcBracketSection(state, onOpenMatch) }
                    item { KcRacesSection(state) }
                    if (state.teams.isNotEmpty()) item { KcTeamsGrid(state.teams, onOpenTeam) }
                    state.record?.takeIf { it.editions.isNotEmpty() }?.let { r -> item { KcRecordSection(r) } }
                }
            }
        }
    }
}

@Composable
internal fun KcScreenHeader(title: String, onBack: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 4.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null, tint = KingsCupColors.onDark) }
        Text(title, color = KingsCupColors.onDark, fontSize = 17.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f), textAlign = TextAlign.Center)
        Spacer(Modifier.width(48.dp))
    }
}

// ── الهيرو ──

@Composable
private fun KcHeroSection(state: KingsCupHubViewModel.State, onOpenMatch: (Int) -> Unit, onOpenTeam: (KcTeam) -> Unit) {
    val ov = state.overview
    val featured = ov?.matchOfTheDay?.fixture ?: ov?.nextMatch
    val liveCount = ov?.live?.count { it.status.live } ?: 0

    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp), modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(
                "🏆 تغطية خاصة", color = KingsCupColors.gold, fontSize = 11.sp, fontWeight = FontWeight.Medium,
                modifier = Modifier.clip(RoundedCornerShape(50)).background(KingsCupColors.gold.copy(alpha = 0.18f)).padding(horizontal = 12.dp, vertical = 5.dp),
            )
            if (liveCount > 0) {
                Row(
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp),
                    modifier = Modifier.clip(RoundedCornerShape(50)).background(KingsCupColors.liveRed).padding(horizontal = 12.dp, vertical = 5.dp),
                ) {
                    Box(Modifier.size(5.dp).clip(CircleShape).background(Color.White))
                    Text(if (liveCount == 1) "مباراة مباشرة" else "$liveCount مباريات مباشرة", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Medium)
                }
            }
        }
        Text("كأس الملك", color = KingsCupColors.emeraldDeep, fontSize = 28.sp, fontWeight = FontWeight.Bold)
        Text(
            "كأس خادم الحرمين الشريفين · تغطية حية بتوقيت الرياض",
            color = KingsCupColors.onDarkDim, fontSize = 12.sp, textAlign = TextAlign.Center,
        )

        when {
            state.overviewLoading && ov == null -> Box(kcCardModifier(22).padding(vertical = 30.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = KingsCupColors.emerald)
            }
            ov?.champion != null -> KcChampionHero(ov.champion)
            featured != null -> KcHeroMatchCard(featured, ov, onOpenMatch, onOpenTeam)
            else -> Column(
                kcCardModifier(22).padding(vertical = 24.dp),
                horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text("✨", fontSize = 26.sp)
                Text("تغطية كأس الملك تنطلق قريبًا", color = KingsCupColors.onDark, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                Text("جدول المباريات والنتائج الحية ستجدها هنا أولًا بأول", color = KingsCupColors.onDarkDim, fontSize = 12.sp, textAlign = TextAlign.Center)
            }
        }

        val today = ov?.today.orEmpty()
        if (today.size >= 2) KcTodayStrip(today, featured?.id, onOpenMatch)
    }
}

@Composable
private fun KcChampionHero(c: KcChampion) {
    Column(
        modifier = Modifier.fillMaxWidth()
            .clip(RoundedCornerShape(24.dp)).background(KingsCupColors.card)
            .border(1.dp, KingsCupColors.gold.copy(alpha = 0.3f), RoundedCornerShape(24.dp))
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text("🏆", fontSize = 32.sp)
        Text("بطل كأس الملك", color = KingsCupColors.gold, fontSize = 12.sp, fontWeight = FontWeight.Medium)
        Box(
            Modifier.size(72.dp).clip(CircleShape).background(Color.White)
                .border(2.dp, KingsCupColors.gold.copy(alpha = 0.6f), CircleShape).padding(8.dp),
            contentAlignment = Alignment.Center,
        ) {
            AsyncImage(model = c.team.logo, contentDescription = null, contentScale = ContentScale.Fit, modifier = Modifier.fillMaxWidth())
        }
        Text(c.team.name, color = KingsCupColors.onDark, fontSize = 22.sp, fontWeight = FontWeight.Bold)
        val runnerUp = c.runnerUp
        val score = c.score
        if (runnerUp != null && score != null) {
            // «الفائز أولًا» من الخادم فلا انقلاب في RTL.
            Text(
                "فاز على ${runnerUp.name} في النهائي $score${c.penalties?.let { " (بركلات الترجيح $it)" } ?: ""}",
                color = KingsCupColors.emeraldDeep, fontSize = 11.sp, textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
private fun KcHeroMatchCard(f: KcFixture, ov: KcOverview?, onOpenMatch: (Int) -> Unit, onOpenTeam: (KcTeam) -> Unit) {
    Column(
        kcCardModifier(24).padding(20.dp),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            Text(
                when {
                    f.status.live -> "تجري الآن"
                    KcFormat.dayKey(f.date) == KcFormat.todayKey() -> "مباراة اليوم"
                    else -> "المباراة القادمة"
                },
                color = KingsCupColors.emeraldDeep, fontSize = 11.sp,
            )
            Text("·", color = KingsCupColors.onDarkDim, fontSize = 11.sp)
            Text(f.round, color = KingsCupColors.onDarkDim, fontSize = 11.sp)
        }

        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            KcHeroTeamColumn(f.home, Modifier.weight(1f)) { onOpenTeam(f.home) }
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.width(110.dp)) {
                if (f.started) {
                    KcLtrText("${f.goals.away ?: 0} - ${f.goals.home ?: 0}", KingsCupColors.onDark, 28)
                    f.penaltyOutcome?.let { po ->
                        Text(
                            "فاز ${po.winnerName} بالترجيح (${po.winnerScore}-${po.loserScore})",
                            color = KingsCupColors.emeraldDeep, fontSize = 11.sp, fontWeight = FontWeight.Medium, textAlign = TextAlign.Center,
                        )
                    }
                    KcStatusPill(f)
                } else {
                    Text(KcFormat.time(f), color = KingsCupColors.onDark, fontSize = 22.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                    Text("🗓 ${KcFormat.day(f)}", color = KingsCupColors.onDarkDim, fontSize = 11.sp, textAlign = TextAlign.Center)
                }
            }
            KcHeroTeamColumn(f.away, Modifier.weight(1f)) { onOpenTeam(f.away) }
        }

        if (!f.started) KcCountdownChips(f.timestamp)

        // شريط الاحتمالات — يصل جاهزًا مع overview للمباراة المميّزة.
        val pred = ov?.matchOfTheDay?.prediction
        if (pred != null && f.id == ov.matchOfTheDay.fixture.id && !f.status.finished) {
            KcProbabilityBar(f, pred)
        }

        Text(
            "مركز المباراة", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Bold,
            modifier = Modifier.clip(RoundedCornerShape(50)).background(KingsCupColors.royal)
                .clickable { onOpenMatch(f.id) }.padding(horizontal = 24.dp, vertical = 10.dp),
        )
    }
}

@Composable
private fun KcHeroTeamColumn(team: KcTeam, modifier: Modifier, onOpen: () -> Unit) {
    Column(
        modifier.clickable(onClick = onOpen),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        KcTeamLogo(team.logo, size = 64, padding = 8)
        Text(
            team.name, color = KingsCupColors.onDark, fontSize = 15.sp, fontWeight = FontWeight.Bold,
            maxLines = 2, textAlign = TextAlign.Center, overflow = TextOverflow.Ellipsis,
        )
    }
}

/** عدّ تنازلي حي (يوم/ساعة/دقيقة/ثانية) — مرآة KcCountdownChips. */
@Composable
private fun KcCountdownChips(timestamp: Int) {
    val now = rememberKcSecondTicker()
    val total = (timestamp.toLong() * 1000L - now).coerceAtLeast(0L) / 1000L
    if (total <= 0L) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Box(Modifier.size(8.dp).clip(CircleShape).background(KingsCupColors.emerald))
            Text("حان موعد الانطلاق — التغطية الحية تبدأ خلال لحظات", color = KingsCupColors.onDark, fontSize = 12.sp, fontWeight = FontWeight.Medium)
        }
    } else {
        val days = (total / 86_400).toInt()
        val hours = ((total % 86_400) / 3_600).toInt()
        val minutes = ((total % 3_600) / 60).toInt()
        val seconds = (total % 60).toInt()
        // شرائح الأرقام بعزل LTR — نفس عقد iOS (الأيام يمين المشهد المقلوب مقصود هناك أيضًا).
        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                KcCountChip(days, "يوم")
                KcCountChip(hours, "ساعة")
                KcCountChip(minutes, "دقيقة")
                KcCountChip(seconds, "ثانية")
            }
        }
    }
}

@Composable
private fun KcCountChip(value: Int, label: String) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(1.dp),
        modifier = Modifier.width(56.dp).clip(RoundedCornerShape(12.dp)).background(KingsCupColors.chipFill).padding(vertical = 6.dp),
    ) {
        Text("$value", color = KingsCupColors.onDark, fontSize = 18.sp, fontWeight = FontWeight.Bold)
        Text(label, color = KingsCupColors.emeraldDeep, fontSize = 10.sp)
    }
}

/** شريط «مباريات اليوم» أسفل الهيرو — يظهر عندما يضم اليوم مباراتين فأكثر. */
@Composable
private fun KcTodayStrip(matches: List<KcFixture>, activeId: Int?, onOpenMatch: (Int) -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            Text("🗓 مباريات اليوم", color = KingsCupColors.emeraldDeep, fontSize = 11.sp, fontWeight = FontWeight.Medium)
            Text("(${matches.size})", color = KingsCupColors.onDarkDim, fontSize = 12.sp)
        }
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(matches, key = { "today-${it.id}" }) { f ->
                val active = f.id == activeId
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp),
                    modifier = Modifier.clip(RoundedCornerShape(16.dp))
                        .background(if (active) KingsCupColors.emerald.copy(alpha = 0.15f) else KingsCupColors.chipFill)
                        .border(1.dp, if (active) KingsCupColors.emerald.copy(alpha = 0.5f) else KingsCupColors.cardStroke.copy(alpha = 0.4f), RoundedCornerShape(16.dp))
                        .clickable { onOpenMatch(f.id) }
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        KcTeamLogo(f.home.logo, size = 22, padding = 2)
                        Box(Modifier.width(48.dp), contentAlignment = Alignment.Center) {
                            if (f.started) {
                                KcLtrText("${f.goals.away ?: 0} - ${f.goals.home ?: 0}", KingsCupColors.onDark, 11, FontWeight.Normal)
                            } else {
                                Text(KcFormat.time(f), color = KingsCupColors.onDark, fontSize = 11.sp, maxLines = 1)
                            }
                        }
                        KcTeamLogo(f.away.logo, size = 22, padding = 2)
                    }
                    if (f.status.live) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                            Box(Modifier.size(5.dp).clip(CircleShape).background(KingsCupColors.liveRed))
                            Text(f.status.label.ifEmpty { "مباشر" }, color = KingsCupColors.liveRed, fontSize = 10.sp)
                        }
                    } else {
                        Text(if (f.status.finished) "انتهت" else "لم تبدأ", color = KingsCupColors.onDarkDim, fontSize = 10.sp)
                    }
                }
            }
        }
    }
}

// ── بوابة التوقعات ──

@Composable
private fun KcPredictCta(onTap: () -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp),
        modifier = Modifier.fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(Brush.linearGradient(listOf(KingsCupColors.heroTop, KingsCupColors.royal, KingsCupColors.heroBottom)))
            .border(1.dp, KingsCupColors.gold.copy(alpha = 0.30f), RoundedCornerShape(20.dp))
            .clickable(onClick = onTap)
            .padding(horizontal = 16.dp, vertical = 14.dp),
    ) {
        Box(
            Modifier.size(44.dp).clip(CircleShape)
                .background(Brush.verticalGradient(listOf(KingsCupColors.gold, KingsCupColors.gold.copy(alpha = 0.7f)))),
            contentAlignment = Alignment.Center,
        ) { Text("🎯", fontSize = 20.sp) }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text("توقّع وتنافس", color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Bold)
            Text(
                "توقّع نتائج كأس الملك ونافس على الصدارة",
                color = Color.White.copy(alpha = 0.85f), fontSize = 11.sp, maxLines = 2,
            )
        }
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, null, tint = KingsCupColors.gold, modifier = Modifier.size(20.dp))
    }
}

// ── حقائق النسخة السابقة ──

@Composable
private fun KcHistorySection(h: KcHistory) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        KcSectionHeader("🕰", "من النسخة السابقة", h.previousSeason?.let { "موسم $it" } ?: "أبرز أرقام البطولة")
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            h.champion?.let { champ ->
                KcFactCard("حامل اللقب", champ.name, champ.logo, null, KingsCupColors.gold, Modifier.weight(1f))
            }
            h.topScorer?.let { scorer ->
                KcFactCard("هدّاف النسخة", scorer.name, scorer.photo, "${scorer.goals} أهداف", KingsCupColors.emeraldDeep, Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun KcFactCard(label: String, name: String, logo: String, sub: String?, tint: Color, modifier: Modifier) {
    Row(
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
        modifier = modifier.clip(RoundedCornerShape(16.dp)).background(KingsCupColors.card)
            .border(0.5.dp, KingsCupColors.cardStroke.copy(alpha = 0.5f), RoundedCornerShape(16.dp))
            .padding(12.dp),
    ) {
        Box(
            Modifier.size(46.dp).clip(CircleShape).background(tint.copy(alpha = 0.14f)),
            contentAlignment = Alignment.Center,
        ) {
            if (logo.isEmpty()) {
                Text("🏆", fontSize = 15.sp)
            } else {
                AsyncImage(model = logo, contentDescription = null, contentScale = ContentScale.Fit, modifier = Modifier.size(34.dp).clip(CircleShape))
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(label, color = tint, fontSize = 10.sp, fontWeight = FontWeight.Medium)
            Text(name, color = KingsCupColors.onDark, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            sub?.let { Text(it, color = KingsCupColors.onDarkDim, fontSize = 10.sp) }
        }
    }
}

// ── المباريات (تبويبات) ──

private enum class KcMatchTab(val label: String) { LIVE("مباشر"), TODAY("اليوم"), UPCOMING("القادمة"), FINISHED("النتائج") }

private fun androidx.compose.foundation.lazy.LazyListScope.kcMatchesSection(
    state: KingsCupHubViewModel.State,
    onOpenMatch: (Int) -> Unit,
) {
    val live = state.fixtures.filter { it.status.live }
    // ترتيب اليوم: الحية أولًا ثم القادمة ثم المنتهية (نفس منطق iOS rank).
    val today = state.fixtures
        .filter { KcFormat.dayKey(it.date) == KcFormat.todayKey() }
        .sortedWith(
            compareBy<KcFixture> { if (it.status.live) 0 else if (it.status.finished) 2 else 1 }
                .thenBy { it.timestamp },
        )
    val upcoming = state.fixtures.filter { !it.status.live && !it.status.finished }
    val finished = state.fixtures.filter { it.status.finished }.reversed()

    item { KcSectionHeader("🗓", "المباريات", "جدول كأس الملك بتوقيت الرياض") }
    item {
        KcMatchesTabsAndList(live, today, upcoming, finished, state.fixturesLoading, onOpenMatch)
    }
}

@Composable
private fun KcMatchesTabsAndList(
    live: List<KcFixture>, today: List<KcFixture>, upcoming: List<KcFixture>, finished: List<KcFixture>,
    loading: Boolean,
    onOpenMatch: (Int) -> Unit,
) {
    var userTab by rememberSaveable { mutableStateOf<KcMatchTab?>(null) }
    val defaultTab = when {
        today.isNotEmpty() -> KcMatchTab.TODAY
        live.isNotEmpty() -> KcMatchTab.LIVE
        else -> KcMatchTab.UPCOMING
    }
    val tab = userTab ?: defaultTab
    val current = when (tab) {
        KcMatchTab.LIVE -> live
        KcMatchTab.TODAY -> today
        KcMatchTab.UPCOMING -> upcoming
        KcMatchTab.FINISHED -> finished
    }

    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(KcMatchTab.entries.toList()) { t ->
                val active = t == tab
                Row(
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp),
                    modifier = Modifier.clip(RoundedCornerShape(50))
                        .background(if (active) KingsCupColors.emeraldDeep else KingsCupColors.chipFill)
                        .clickable { userTab = t }
                        .padding(horizontal = 14.dp, vertical = 8.dp),
                ) {
                    Text(
                        t.label, color = if (active) Color.White else KingsCupColors.onDarkDim,
                        fontSize = 13.sp, fontWeight = FontWeight.Bold,
                    )
                    if (t == KcMatchTab.LIVE && live.isNotEmpty()) {
                        Text(
                            "${live.size}", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Medium,
                            modifier = Modifier.clip(RoundedCornerShape(50)).background(KingsCupColors.liveRed).padding(horizontal = 5.dp, vertical = 1.dp),
                        )
                    }
                }
            }
        }

        when {
            loading && current.isEmpty() -> KcLoading()
            current.isEmpty() -> KcEmptyText(
                when (tab) {
                    KcMatchTab.LIVE -> "لا توجد مباريات مباشرة الآن — عُد عند صافرة البداية"
                    KcMatchTab.TODAY -> "لا توجد مباريات اليوم"
                    KcMatchTab.UPCOMING -> "لا توجد مباريات قادمة معلنة بعد"
                    KcMatchTab.FINISHED ->
                        if (live.isEmpty()) "النتائج تظهر هنا فور انتهاء أول مباراة"
                        else "مباراة جارية الآن — نتيجتها تظهر هنا فور صافرة النهاية"
                },
            )
            else -> Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                kcGroupedByDay(current).forEach { (day, items) ->
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Box(Modifier.size(7.dp).clip(CircleShape).background(KingsCupColors.emeraldDeep))
                            Text(day, color = KingsCupColors.onDark, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                            Text("(${items.size})", color = KingsCupColors.onDarkDim, fontSize = 12.sp)
                        }
                        items.forEach { f -> KcMatchCard(f) { onOpenMatch(f.id) } }
                    }
                }
            }
        }
    }
}

private fun kcGroupedByDay(fixtures: List<KcFixture>): List<Pair<String, List<KcFixture>>> {
    val order = mutableListOf<String>()
    val groups = mutableMapOf<String, MutableList<KcFixture>>()
    for (f in fixtures) {
        val day = KcFormat.day(f)
        if (day !in groups) order.add(day)
        groups.getOrPut(day) { mutableListOf() }.add(f)
    }
    return order.map { it to (groups[it] ?: mutableListOf()) }
}

/** بطاقة مباراة بصفَّي فريقين (الفائز عريض) وسطر الملعب — مرآة KcMatchCard. */
@Composable
internal fun KcMatchCard(f: KcFixture, onOpen: () -> Unit) {
    Column(
        verticalArrangement = Arrangement.spacedBy(10.dp),
        modifier = kcCardModifier(20).clickable(onClick = onOpen).padding(14.dp),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(f.round, color = KingsCupColors.onDarkDim, fontSize = 11.sp, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            KcStatusPill(f)
        }
        KcMatchCardTeamRow(f.home, if (f.started) f.goals.home ?: 0 else null, f.home.winner == true)
        KcMatchCardTeamRow(f.away, if (f.started) f.goals.away ?: 0 else null, f.away.winner == true)
        f.penaltyOutcome?.let { po ->
            Text(
                "فاز ${po.winnerName} بركلات الترجيح (${po.winnerScore}-${po.loserScore})",
                color = KingsCupColors.emeraldDeep, fontSize = 11.sp, fontWeight = FontWeight.Medium,
            )
        }
        androidx.compose.material3.HorizontalDivider(color = KingsCupColors.cardStroke)
        Text(
            "📍 " + listOf(f.venue.name, f.venue.city).filter { it.isNotEmpty() }.joinToString(" — ").ifEmpty { f.round },
            color = KingsCupColors.onDarkDim, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun KcMatchCardTeamRow(team: KcTeam, goals: Int?, win: Boolean) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        KcTeamLogo(team.logo, size = 28, padding = 3)
        Text(
            team.name, color = KingsCupColors.onDark, fontSize = 14.sp,
            fontWeight = if (win) FontWeight.Black else FontWeight.Bold,
            maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f),
        )
        goals?.let {
            Text(
                "$it", color = if (win) KingsCupColors.emeraldDeep else KingsCupColors.onDark,
                fontSize = 16.sp, fontWeight = FontWeight.Bold,
            )
        }
    }
}

// ── شجرة الأدوار الإقصائية ──

@Composable
private fun KcBracketSection(state: KingsCupHubViewModel.State, onOpenMatch: (Int) -> Unit) {
    val rounds = state.bracket?.rounds.orEmpty().filter { it.matches.isNotEmpty() }
    if (state.bracketLoading && rounds.isEmpty()) {
        KcLoading()
        return
    }
    if (rounds.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        KcSectionHeader("🛤", "الأدوار الإقصائية", "طريق اللقب من الأدوار المبكرة حتى النهائي")
        LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            items(rounds, key = { it.round }) { round ->
                Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.width(210.dp)) {
                    Text(round.round, color = KingsCupColors.emeraldDeep, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                    round.matches.forEach { m -> KcBracketMatch(m) { onOpenMatch(m.id) } }
                }
            }
        }
    }
}

@Composable
private fun KcBracketMatch(m: KcFixture, onOpen: () -> Unit) {
    Column(
        verticalArrangement = Arrangement.spacedBy(6.dp),
        modifier = kcCardModifier(14).clickable(onClick = onOpen).padding(10.dp),
    ) {
        KcBracketTeamRow(m.home, if (m.started) m.goals.home else null, m.home.winner == true)
        KcBracketTeamRow(m.away, if (m.started) m.goals.away else null, m.away.winner == true)
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            KcStatusPill(m)
            Spacer(Modifier.weight(1f))
            m.penaltyOutcome?.let { po ->
                Text("ترجيح ${po.winnerScore}-${po.loserScore}", color = KingsCupColors.emeraldDeep, fontSize = 9.sp, fontWeight = FontWeight.Medium)
            }
        }
    }
}

@Composable
private fun KcBracketTeamRow(team: KcTeam, goals: Int?, win: Boolean) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        KcTeamLogo(team.logo, size = 22, padding = 2)
        Text(
            team.name, color = KingsCupColors.onDark, fontSize = 12.sp,
            fontWeight = if (win) FontWeight.Black else FontWeight.Normal,
            maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f),
        )
        goals?.let {
            Text("$it", color = if (win) KingsCupColors.emeraldDeep else KingsCupColors.onDark, fontSize = 11.sp)
        }
    }
}

// ── السباقات الفردية ──

private enum class KcRaceTab(val label: String) { SCORERS("الهدّافون"), ASSISTS("الصنّاع"), CARDS("البطاقات") }

@Composable
private fun KcRacesSection(state: KingsCupHubViewModel.State) {
    var tab by rememberSaveable { mutableStateOf(KcRaceTab.SCORERS) }
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        KcSectionHeader("📊", "السباقات الفردية", "هدّافو وصنّاع أهداف البطولة")

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            KcRaceTab.entries.forEach { t ->
                val active = t == tab
                Text(
                    t.label, color = if (active) Color.White else KingsCupColors.onDarkDim,
                    fontSize = 13.sp, fontWeight = FontWeight.Bold,
                    modifier = Modifier.clip(RoundedCornerShape(50))
                        .background(if (active) KingsCupColors.emeraldDeep else KingsCupColors.chipFill)
                        .clickable { tab = t }
                        .padding(horizontal = 14.dp, vertical = 8.dp),
                )
            }
        }

        if (state.racesLoading && state.scorers.isEmpty()) {
            KcLoading()
            return
        }

        when (tab) {
            KcRaceTab.SCORERS -> if (state.scorers.isEmpty()) {
                KcEmptyText(if (state.started) "لا توجد أهداف مسجّلة بعد" else "قائمة الهدّافين تظهر بعد انطلاق البطولة")
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    state.scorers.take(15).forEach { s ->
                        KcRaceRow(s.rank, s.name, s.photo, s.team, "${s.goals}", "هدف", s.assists.takeIf { it > 0 }?.let { "$it صناعة" })
                    }
                }
            }
            KcRaceTab.ASSISTS -> if (state.assists.isEmpty()) {
                KcEmptyText(if (state.started) "لا توجد صناعات مسجّلة بعد" else "قائمة الصنّاع تظهر بعد انطلاق البطولة")
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    state.assists.take(15).forEach { l ->
                        KcRaceRow(l.rank, l.name, l.photo, l.team, "${l.assists ?: 0}", "صناعة", null)
                    }
                }
            }
            KcRaceTab.CARDS -> {
                val c = state.cards
                if (c == null || (c.yellow.isEmpty() && c.red.isEmpty())) {
                    KcEmptyText("لا توجد بطاقات مسجّلة بعد")
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        if (c.red.isNotEmpty()) {
                            Text("البطاقات الحمراء", color = KingsCupColors.liveRed, fontSize = 11.sp, fontWeight = FontWeight.Medium)
                            c.red.take(8).forEach { l ->
                                KcRaceRow(l.rank, l.name, l.photo, l.team, "${l.red ?: 0}", "حمراء", null, KingsCupColors.liveRed)
                            }
                        }
                        if (c.yellow.isNotEmpty()) {
                            Text("البطاقات الصفراء", color = KingsCupColors.gold, fontSize = 11.sp, fontWeight = FontWeight.Medium)
                            c.yellow.take(8).forEach { l ->
                                KcRaceRow(l.rank, l.name, l.photo, l.team, "${l.yellow ?: 0}", "صفراء", null, KingsCupColors.gold)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun KcRaceRow(rank: Int, name: String, photo: String, team: KcTeam, value: String, valueLabel: String, sub: String?, valueColor: Color? = null) {
    Row(
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
        modifier = kcCardModifier(14).padding(horizontal = 12.dp, vertical = 8.dp),
    ) {
        Text("$rank", color = KingsCupColors.onDarkDim, fontSize = 11.sp, fontWeight = FontWeight.Medium, modifier = Modifier.width(20.dp))
        if (photo.isEmpty()) {
            Box(Modifier.size(34.dp).clip(CircleShape).background(KingsCupColors.chipFill), contentAlignment = Alignment.Center) {
                Text(name.take(1), color = KingsCupColors.onDarkDim, fontSize = 12.sp, fontWeight = FontWeight.Medium)
            }
        } else {
            AsyncImage(
                model = photo, contentDescription = null, contentScale = ContentScale.Crop,
                modifier = Modifier.size(34.dp).clip(CircleShape).background(KingsCupColors.chipFill),
            )
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Text(name, color = KingsCupColors.onDark, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                if (team.logo.isNotEmpty()) {
                    AsyncImage(model = team.logo, contentDescription = null, contentScale = ContentScale.Fit, modifier = Modifier.size(14.dp))
                }
                Text(team.name, color = KingsCupColors.onDarkDim, fontSize = 10.sp, maxLines = 1)
                sub?.let { Text("· $it", color = KingsCupColors.onDarkDim, fontSize = 10.sp) }
            }
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(value, color = valueColor ?: KingsCupColors.emeraldDeep, fontSize = 17.sp, fontWeight = FontWeight.Bold)
            Text(valueLabel, color = KingsCupColors.onDarkDim, fontSize = 9.sp)
        }
    }
}

// ── الأندية المشاركة ──

@Composable
private fun KcTeamsGrid(teams: List<KcTeam>, onOpenTeam: (KcTeam) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        KcSectionHeader("🛡", "الأندية المشاركة", "${teams.size} ناديًا في البطولة")
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            teams.chunked(3).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    row.forEach { team ->
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.weight(1f).clip(RoundedCornerShape(16.dp)).background(KingsCupColors.card)
                                .border(0.5.dp, KingsCupColors.cardStroke.copy(alpha = 0.5f), RoundedCornerShape(16.dp))
                                .clickable { onOpenTeam(team) }
                                .padding(vertical = 12.dp),
                        ) {
                            KcTeamLogo(team.logo, size = 50, padding = 6)
                            Text(
                                team.name, color = KingsCupColors.onDark, fontSize = 11.sp,
                                maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(horizontal = 4.dp),
                            )
                        }
                    }
                    repeat(3 - row.size) { Spacer(Modifier.weight(1f)) }
                }
            }
        }
    }
}

// ── سجلّ البطولة ──

@Composable
private fun KcRecordSection(record: KcRecord) {
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        KcSectionHeader(
            "🏛", "سجلّ البطولة",
            record.sinceSeason?.let { "أبطال النسخ منذ ${KcFormat.seasonLabel(it)} — من بيانات المزوّد" } ?: "أبطال النسخ الأخيرة",
        )

        record.editions.firstOrNull()?.let { holder ->
            holder.champion?.let { champion -> KcTitleHolderCard(holder, champion) }
        }

        if (record.titles.isNotEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                record.titles.chunked(2).forEach { row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        row.forEach { t -> KcTitleWallCard(t, Modifier.weight(1f)) }
                        repeat(2 - row.size) { Spacer(Modifier.weight(1f)) }
                    }
                }
            }
        }

        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            record.editions.chunked(2).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    row.forEach { e -> KcEditionCard(e, Modifier.weight(1f)) }
                    repeat(2 - row.size) { Spacer(Modifier.weight(1f)) }
                }
            }
        }

        Text(
            "البطولة أُطلقت عام 1957 ولها تاريخ أعرق من المدى المعروض",
            color = KingsCupColors.onDarkDim, fontSize = 10.sp,
        )
    }
}

@Composable
private fun KcTitleHolderCard(e: KcRecordEdition, champion: KcHistoryChampion) {
    Row(
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp),
        modifier = Modifier.fillMaxWidth()
            .clip(RoundedCornerShape(20.dp)).background(KingsCupColors.gold.copy(alpha = 0.08f))
            .border(1.dp, KingsCupColors.gold.copy(alpha = 0.35f), RoundedCornerShape(20.dp))
            .padding(14.dp),
    ) {
        Box {
            Box(
                Modifier.size(64.dp).clip(CircleShape).background(Color.White)
                    .border(2.dp, KingsCupColors.gold.copy(alpha = 0.7f), CircleShape).padding(8.dp),
                contentAlignment = Alignment.Center,
            ) {
                AsyncImage(model = champion.logo, contentDescription = null, contentScale = ContentScale.Fit, modifier = Modifier.fillMaxWidth())
            }
            Text("👑", fontSize = 13.sp, modifier = Modifier.align(Alignment.TopEnd))
        }
        Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text("حامل اللقب — نسخة ${KcFormat.seasonLabel(e.season)}", color = KingsCupColors.gold, fontSize = 11.sp, fontWeight = FontWeight.Medium)
            Text(champion.name, color = KingsCupColors.onDark, fontSize = 18.sp, fontWeight = FontWeight.Bold)
            e.runnerUp?.let { runnerUp ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("على حساب ${runnerUp.name}", color = KingsCupColors.onDarkDim, fontSize = 11.sp, maxLines = 1)
                    // نتيجة النهائي «الفائز أولًا» من الخادم — عزل LTR للسلسلة الرقمية فقط.
                    e.score?.let { KcLtrText(it, KingsCupColors.gold, 11, FontWeight.Black) }
                    e.penalties?.let { KcLtrText("($it ر.ت)", KingsCupColors.onDarkDim, 11, FontWeight.Normal) }
                }
            }
        }
    }
}

@Composable
private fun KcTitleWallCard(row: KcRecordTitleRow, modifier: Modifier) {
    Row(
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
        modifier = modifier.clip(RoundedCornerShape(14.dp)).background(KingsCupColors.card)
            .border(0.5.dp, KingsCupColors.cardStroke.copy(alpha = 0.5f), RoundedCornerShape(14.dp))
            .padding(horizontal = 10.dp, vertical = 8.dp),
    ) {
        KcTeamLogo(row.logo, size = 36, padding = 4)
        Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Text(row.name, color = KingsCupColors.onDark, fontSize = 12.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                "${kcTitleCount(row.titles)} · آخرها ${KcFormat.seasonLabel(row.lastSeason)}",
                color = KingsCupColors.onDarkDim, fontSize = 10.sp, maxLines = 1,
            )
        }
    }
}

private fun kcTitleCount(n: Int): String = when (n) {
    1 -> "لقب"
    2 -> "لقبان"
    else -> "$n ألقاب"
}

@Composable
private fun KcEditionCard(e: KcRecordEdition, modifier: Modifier) {
    Column(
        verticalArrangement = Arrangement.spacedBy(6.dp),
        modifier = modifier.clip(RoundedCornerShape(14.dp)).background(KingsCupColors.card)
            .border(0.5.dp, KingsCupColors.cardStroke.copy(alpha = 0.5f), RoundedCornerShape(14.dp))
            .padding(10.dp),
    ) {
        Text("نسخة ${KcFormat.seasonLabel(e.season)}", color = KingsCupColors.onDarkDim, fontSize = 10.sp, fontWeight = FontWeight.Medium)
        e.champion?.let { champion ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                KcTeamLogo(champion.logo, size = 28, padding = 3)
                Column {
                    Text(champion.name, color = KingsCupColors.onDark, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    e.score?.let { score ->
                        KcLtrText(score + (e.penalties?.let { " ($it ر.ت)" } ?: ""), KingsCupColors.onDarkDim, 10, FontWeight.Normal)
                    }
                }
            }
        }
        e.runnerUp?.let { Text("الوصيف: ${it.name}", color = KingsCupColors.onDarkDim, fontSize = 10.sp, maxLines = 1) }
    }
}
