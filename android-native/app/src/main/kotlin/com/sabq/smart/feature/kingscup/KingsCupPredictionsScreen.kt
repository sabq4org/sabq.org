package com.sabq.smart.feature.kingscup

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.ProvideTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import coil.compose.AsyncImage
import com.sabq.smart.feature.predictions.PredContest
import com.sabq.smart.feature.predictions.PredDates
import com.sabq.smart.feature.predictions.PredLeaderEntry
import com.sabq.smart.feature.predictions.PredLedgerItem
import com.sabq.smart.feature.predictions.PredMyEntry
import com.sabq.smart.feature.predictions.PredScorePayload
import com.sabq.smart.feature.predictions.PredictionsRepository
import com.sabq.smart.ui.theme.IbmPlexSansArabic
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

// توقعات كأس الملك — على المنصة المركزية predictions-core عبر
// /api/v1/predictions/* (لا نستنسخ شبكات iOS KcPredictionsView القديمة —
// نقاطها متوقفة). مرآة توقعات روشن حرفيًا: أربعة تبويبات (المباريات /
// نقاطي / المتصدرون / الطريقة) بدرع النتيجة المفصولة وبوابة الجلسة،
// واكتشاف معرّف المسابقة من الخادم ببادئة "kings-cup" لا ثابت مزروع.

/** تفكيك نصوص "home-away" — لا نعرض النص الخام أبدًا (ينقلب بصريًا في RTL). */
internal fun kcParseScorePair(raw: String?): Pair<Int, Int>? {
    val parts = raw?.split("-")?.mapNotNull { it.trim().toIntOrNull() } ?: return null
    return if (parts.size == 2) parts[0] to parts[1] else null
}

@HiltViewModel
class KingsCupPredictionsViewModel @Inject constructor(
    private val predRepo: PredictionsRepository,
    private val tokenStore: com.sabq.smart.data.auth.AuthTokenStore,
) : ViewModel() {
    enum class Tab { MATCHES, LEDGER, LEADERS, HOW }

    data class State(
        val tab: Tab = Tab.MATCHES,
        val slug: String? = null,
        val contests: List<PredContest> = emptyList(),
        val board: com.sabq.smart.feature.predictions.PredLeaderboardResponse? = null,
        val rule: com.sabq.smart.feature.predictions.PredRule? = null,
        val loading: Boolean = true,
        val error: String? = null,
        val savingContest: String? = null,
        val savedContest: String? = null,
        val ledger: List<PredLedgerItem> = emptyList(),
        val ledgerLoading: Boolean = false,
        val ledgerError: String? = null,
        val didLoadLedger: Boolean = false,
        val isSignedIn: Boolean = false,
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            _state.update { it.copy(isSignedIn = tokenStore.current() != null) }
            load()
            loadLedger()
        }
    }

    fun select(tab: Tab) {
        _state.update { it.copy(tab = tab) }
        if (tab == Tab.LEDGER && !_state.value.didLoadLedger) {
            viewModelScope.launch { loadLedger() }
        }
    }

    fun refresh() = viewModelScope.launch {
        load(force = true)
        if (_state.value.didLoadLedger) loadLedger(force = true)
    }

    /** اكتشاف معرّف المسابقة ببادئة "kings-cup" — صامد عبر المواسم. */
    suspend fun load(force: Boolean = false) {
        if (_state.value.loading && force) return
        _state.update { it.copy(loading = true, error = null) }
        runCatching {
            val slug = _state.value.slug ?: predRepo.competitions().competitions.let { comps ->
                comps.firstOrNull { it.slug.startsWith("kings-cup") }?.slug
                    ?: comps.firstOrNull { it.nameAr.contains("كأس الملك") || it.nameAr.contains("خادم الحرمين") }?.slug
            }
            if (slug == null) {
                _state.update { it.copy(loading = false, error = "مسابقة توقعات كأس الملك لم تُفعَّل بعد") }
                return
            }
            coroutineScope {
                val contests = async { predRepo.competition(slug).contests }
                val board = async { runCatching { predRepo.leaderboard(slug) }.getOrNull() }
                val loaded = contests.await()
                val rule = _state.value.rule ?: loaded.firstOrNull()?.let { first ->
                    runCatching { predRepo.contest(first.id).rule }.getOrNull()
                }
                _state.update {
                    it.copy(
                        slug = slug, contests = loaded, board = board.await(), rule = rule,
                        loading = false, error = null,
                    )
                }
            }
        }.onFailure { e ->
            if (e is CancellationException) throw e
            _state.update { it.copy(loading = false, error = "تعذّر تحميل التوقعات حاليًا — أعد المحاولة بعد لحظات") }
        }
    }

    suspend fun loadLedger(force: Boolean = false) {
        val s = _state.value
        if (s.ledgerLoading) return
        if (s.didLoadLedger && !force) return
        _state.update { it.copy(ledgerLoading = true) }
        runCatching {
            val slug = _state.value.slug ?: run { load(); _state.value.slug }
            if (slug == null) {
                _state.update { it.copy(ledgerLoading = false) }
                return
            }
            val items = predRepo.ledger(slug).items
            _state.update { it.copy(ledger = items, ledgerLoading = false, ledgerError = null, didLoadLedger = true) }
        }.onFailure { e ->
            if (e is CancellationException) throw e
            val unauthorized = e is retrofit2.HttpException && e.code() == 401
            _state.update {
                it.copy(
                    ledgerLoading = false,
                    ledgerError = if (unauthorized) "سجّل دخولك لعرض سجل توقعاتك ونقاطك" else "تعذّر تحميل سجلك حاليًا — أعد المحاولة بعد لحظات",
                )
            }
        }
    }

    fun retryLedger() = viewModelScope.launch { loadLedger(force = true) }

    fun submit(contestId: String, home: Int, away: Int, onUnauthorized: () -> Unit) {
        if (_state.value.savingContest != null) return
        _state.update { it.copy(savingContest = contestId, error = null) }
        viewModelScope.launch {
            runCatching { predRepo.submitEntry(contestId, home, away) }
                .onSuccess {
                    // ثبّت التوقع محليًا بلا إعادة تحميل كاملة (لا وميض للقائمة).
                    _state.update { s ->
                        s.copy(
                            savingContest = null, savedContest = contestId,
                            contests = s.contests.map { c ->
                                if (c.id == contestId) c.copy(
                                    myEntry = PredMyEntry(
                                        id = c.myEntry?.id ?: "mine",
                                        payload = PredScorePayload(home, away),
                                    ),
                                ) else c
                            },
                        )
                    }
                }
                .onFailure { e ->
                    if (e is CancellationException) throw e
                    val unauthorized = e is retrofit2.HttpException && e.code() == 401
                    _state.update {
                        it.copy(
                            savingContest = null,
                            error = if (unauthorized) "سجّل دخولك للمشاركة في التوقعات" else "تعذّر حفظ التوقع — أعد المحاولة",
                        )
                    }
                    if (unauthorized) onUnauthorized()
                }
        }
    }
}

@Composable
fun KingsCupPredictionsScreen(
    onBack: () -> Unit,
    onRequireLogin: () -> Unit,
    viewModel: KingsCupPredictionsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val drafts = remember { mutableStateMapOf<String, Pair<Int, Int>>() }

    ProvideTextStyle(LocalTextStyle.current.copy(fontFamily = IbmPlexSansArabic)) {
        Column(Modifier.fillMaxSize().background(KingsCupColors.sectionBackground)) {
            KcScreenHeader("توقعات كأس الملك", onBack)
            LazyColumn(
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 28.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                item { KcPredHero(state) }
                item { KcPredTabBar(state.tab, viewModel::select) }
                when (state.tab) {
                    KingsCupPredictionsViewModel.Tab.MATCHES -> kcPredMatchesTab(state, viewModel, drafts, onRequireLogin)
                    KingsCupPredictionsViewModel.Tab.LEDGER -> kcPredLedgerTab(state, viewModel)
                    KingsCupPredictionsViewModel.Tab.LEADERS -> kcPredLeadersTab(state, viewModel)
                    KingsCupPredictionsViewModel.Tab.HOW -> item { KcPredHowSection(state) }
                }
            }
        }
    }
}

// ── الترويسة — تدرّج الهوية بخط ذهبي، مع نقاط العضو ومركزه ──

@Composable
private fun KcPredHero(state: KingsCupPredictionsViewModel.State) {
    Box(
        modifier = Modifier.fillMaxWidth()
            .clip(RoundedCornerShape(24.dp))
            .background(Brush.linearGradient(listOf(KingsCupColors.heroTop, KingsCupColors.royal, KingsCupColors.heroBottom))),
    ) {
        Box(
            Modifier.align(Alignment.TopCenter).fillMaxWidth().padding(horizontal = 40.dp)
                .height(3.dp).clip(RoundedCornerShape(2.dp)).background(KingsCupColors.gold),
        )
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(13.dp)) {
                Box(
                    Modifier.size(56.dp).clip(RoundedCornerShape(15.dp)).background(Color.White.copy(alpha = 0.16f)),
                    contentAlignment = Alignment.Center,
                ) { Text("🎯", fontSize = 24.sp) }
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("توقّع وتنافس", color = Color.White, fontSize = 21.sp, fontWeight = FontWeight.Bold)
                    Text(
                        "توقّع نتائج كأس الملك ونافس على نقاط البطولة",
                        color = Color.White.copy(alpha = 0.85f), fontSize = 11.sp, maxLines = 1,
                    )
                }
            }
            val my = state.board?.myRank
            if (state.isSignedIn) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    KcPredHeroStat("${my?.points ?: 0}", "نقطة حصدتها", Modifier.weight(1f))
                    KcPredHeroStat(my?.rank?.toString() ?: "—", "مركزي", Modifier.weight(1f))
                    KcPredHeroStat(kcAccuracyPercent(state)?.let { "$it٪" } ?: "—", "دقّتي", Modifier.weight(1f))
                }
            } else {
                Box(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(11.dp)).background(Color.White.copy(alpha = 0.16f)).padding(vertical = 9.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        "سجّل دخولك وتوقّع نتائج البطولة ونافس على الصدارة",
                        color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold,
                    )
                }
            }
        }
    }
}

private val KC_HIT_REASONS = setOf("exact", "margin", "outcome")

private fun kcSettledMineCount(state: KingsCupPredictionsViewModel.State): Int =
    state.contests.count { it.myEntry != null && it.status == "settled" }

private fun kcAccuracyPercent(state: KingsCupPredictionsViewModel.State): Int? {
    val settled = kcSettledMineCount(state)
    if (settled <= 0) return null
    val hits = state.ledger.count { it.reasonCode in KC_HIT_REASONS }
    return ((hits.toDouble() / settled) * 100).toInt()
}

@Composable
private fun KcPredHeroStat(value: String, label: String, modifier: Modifier) {
    Row(
        modifier = modifier.clip(RoundedCornerShape(11.dp)).background(Color.White.copy(alpha = 0.16f)).padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(value, color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Bold)
        Text(label, color = Color.White, fontSize = 10.sp)
    }
}

@Composable
private fun KcPredTabBar(selected: KingsCupPredictionsViewModel.Tab, onSelect: (KingsCupPredictionsViewModel.Tab) -> Unit) {
    val labels = mapOf(
        KingsCupPredictionsViewModel.Tab.MATCHES to "المباريات",
        KingsCupPredictionsViewModel.Tab.LEDGER to "نقاطي",
        KingsCupPredictionsViewModel.Tab.LEADERS to "المتصدرون",
        KingsCupPredictionsViewModel.Tab.HOW to "الطريقة",
    )
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        KingsCupPredictionsViewModel.Tab.entries.forEach { tab ->
            val active = tab == selected
            Box(
                modifier = Modifier.weight(1f).clip(RoundedCornerShape(11.dp))
                    .background(if (active) KingsCupColors.emeraldDeep else KingsCupColors.card)
                    .clickable { onSelect(tab) }.padding(vertical = 9.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    labels.getValue(tab),
                    color = if (active) Color.White else KingsCupColors.onDarkDim,
                    fontSize = 12.sp, fontWeight = if (active) FontWeight.Bold else FontWeight.Normal, maxLines = 1,
                )
            }
        }
    }
}

@Composable
private fun KcPredRetryBanner(message: String, onRetry: () -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp),
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp))
            .background(KingsCupColors.gold.copy(alpha = 0.12f)).padding(11.dp),
    ) {
        Text(message, color = KingsCupColors.onDarkDim, fontSize = 11.sp, modifier = Modifier.weight(1f))
        Text(
            "إعادة", color = KingsCupColors.emeraldDeep, fontSize = 11.sp, fontWeight = FontWeight.Bold,
            modifier = Modifier.clickable(onClick = onRetry),
        )
    }
}

@Composable
private fun KcPredSectionLabel(title: String) {
    Row(
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
        modifier = Modifier.padding(top = 4.dp),
    ) {
        Box(Modifier.size(6.dp).clip(CircleShape).background(KingsCupColors.gold))
        Text(title, color = KingsCupColors.emeraldDeep, fontSize = 12.sp, fontWeight = FontWeight.Bold)
    }
}

// ── تبويب المباريات ──

private fun androidx.compose.foundation.lazy.LazyListScope.kcPredMatchesTab(
    state: KingsCupPredictionsViewModel.State,
    viewModel: KingsCupPredictionsViewModel,
    drafts: androidx.compose.runtime.snapshots.SnapshotStateMap<String, Pair<Int, Int>>,
    onRequireLogin: () -> Unit,
) {
    state.error?.let { error -> item { KcPredRetryBanner(error, viewModel::refresh) } }

    val open = state.contests
        .filter { it.isMatchScore && it.status == "open" }
        .sortedBy { PredDates.parse(it.locksAt)?.epochSecond ?: Long.MAX_VALUE }
    val settled = state.contests
        .filter { it.isMatchScore && it.status in listOf("settled", "locked", "ready") }
        .sortedByDescending { PredDates.parse(it.locksAt)?.epochSecond ?: 0L }

    if (open.size > 1 && state.isSignedIn) {
        val openMine = open.count { it.myEntry?.payload != null }
        item {
            Row(
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp))
                    .background(KingsCupColors.chipFill).padding(11.dp),
            ) {
                Text("📋", fontSize = 12.sp)
                Text(
                    "توقعاتك هذه الجولة: $openMine من ${open.size}",
                    color = KingsCupColors.onDark, fontSize = 12.sp, fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1f),
                )
                if (openMine < open.size) {
                    Text("أكملها 👇", color = KingsCupColors.onDarkDim, fontSize = 10.sp)
                } else {
                    Text("اكتملت ✓", color = KingsCupColors.emeraldDeep, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }

    if (state.loading && state.contests.isEmpty()) {
        item { KcLoading() }
    } else if (open.isEmpty() && settled.isEmpty() && state.error == null) {
        item { KcEmptyText("مباريات التوقع تُفتح قبل كل دور — عُد قريبًا") }
    }

    items(open, key = { "kcpred-${it.id}" }) { contest ->
        KcPredContestCard(contest, state, drafts) { h, a ->
            viewModel.submit(contest.id, h, a, onRequireLogin)
        }
    }

    if (settled.isNotEmpty()) {
        item { KcPredSectionLabel("آخر المباريات") }
        items(settled.take(8), key = { "kcpreddone-${it.id}" }) { contest -> KcPredSettledRow(contest) }
    }
}

// ── تبويب نقاطي ──

private fun androidx.compose.foundation.lazy.LazyListScope.kcPredLedgerTab(
    state: KingsCupPredictionsViewModel.State,
    viewModel: KingsCupPredictionsViewModel,
) {
    state.ledgerError?.let { error -> item { KcPredRetryBanner(error, viewModel::retryLedger) } }

    if (state.ledgerLoading && state.ledger.isEmpty()) {
        item { KcLoading() }
    } else if (state.ledger.isEmpty() && state.ledgerError == null) {
        item { KcEmptyText("حصادك يبدأ مع أول تسوية — توقّع مباريات الدور وعُد بعد صافرة النهاية") }
    } else {
        state.board?.myRank?.let { my ->
            item {
                Row(
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp)).background(KingsCupColors.gold.copy(alpha = 0.12f)).padding(12.dp),
                ) {
                    Text("Σ", color = KingsCupColors.gold, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    Text("مجموع ما حصدته في البطولة", color = KingsCupColors.onDark, fontSize = 12.sp, modifier = Modifier.weight(1f))
                    Text("${my.points} نقطة", color = KingsCupColors.emeraldDeep, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                }
            }
        }

        item { KcPredSectionLabel("حصاد البطولة") }
        item { KcPredHarvestGrid(state) }

        item { KcPredSectionLabel("سجلّ التسويات") }
        items(state.ledger, key = { "kcledger-${it.id}" }) { entry -> KcPredLedgerRow(entry, state.contests) }
    }
}

@Composable
private fun KcPredHarvestTile(value: String, label: String, tint: Color, modifier: Modifier) {
    Column(
        modifier = modifier.clip(RoundedCornerShape(14.dp)).background(KingsCupColors.card).padding(vertical = 9.dp),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        Text(value, color = tint, fontSize = 16.sp, fontWeight = FontWeight.Bold)
        Text(label, color = KingsCupColors.onDarkDim, fontSize = 9.sp, maxLines = 1)
    }
}

@Composable
private fun KcPredHarvestGrid(state: KingsCupPredictionsViewModel.State) {
    val exact = state.ledger.count { it.reasonCode == "exact" }
    val margin = state.ledger.count { it.reasonCode == "margin" }
    val outcome = state.ledger.count { it.reasonCode == "outcome" }
    val best = state.ledger.maxOfOrNull { it.points } ?: 0
    Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            KcPredHarvestTile("${kcSettledMineCount(state)}", "توقعًا مُسوّى", KingsCupColors.onDark, Modifier.weight(1f))
            KcPredHarvestTile("$exact", "نتيجة دقيقة 🎯", KingsCupColors.gold, Modifier.weight(1f))
            KcPredHarvestTile("$margin", "فارق صحيح", KingsCupColors.onDark, Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            KcPredHarvestTile("$outcome", "اتجاه صحيح", KingsCupColors.onDark, Modifier.weight(1f))
            KcPredHarvestTile(kcAccuracyPercent(state)?.let { "$it٪" } ?: "—", "نسبة الإصابة", KingsCupColors.emeraldDeep, Modifier.weight(1f))
            KcPredHarvestTile("$best", "أفضل تسوية", KingsCupColors.gold, Modifier.weight(1f))
        }
    }
}

@Composable
private fun KcPredLedgerRow(entry: PredLedgerItem, contests: List<PredContest>) {
    val contest = contests.firstOrNull { it.id == entry.contestId }
    val final = kcParseScorePair(entry.breakdown?.finalScore)
    val predicted = kcParseScorePair(entry.breakdown?.prediction)

    Row(
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
        modifier = kcCardModifier(13).padding(horizontal = 12.dp, vertical = 9.dp),
    ) {
        val reasonEmoji = when (entry.reasonCode) {
            "exact" -> "🎯"
            "margin" -> "📐"
            "outcome" -> "✅"
            else -> "⭐"
        }
        Box(
            Modifier.size(30.dp).clip(CircleShape).background(KingsCupColors.chipFill),
            contentAlignment = Alignment.Center,
        ) { Text(reasonEmoji, fontSize = 12.sp) }

        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            if (contest != null && final != null) {
                // سطر المباراة: [مضيف][نتيجته]-[نتيجة الضيف][ضيف] — RTL طبيعي.
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                    Text(
                        contest.metadata?.home?.name ?: "—",
                        color = KingsCupColors.onDark, fontSize = 12.sp, fontWeight = FontWeight.Bold,
                        maxLines = 1, overflow = TextOverflow.Ellipsis,
                    )
                    KcSplitScore(home = final.first, away = final.second, emphasized = false)
                    Text(
                        contest.metadata?.away?.name ?: "—",
                        color = KingsCupColors.onDark, fontSize = 12.sp, fontWeight = FontWeight.Bold,
                        maxLines = 1, overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    entry.reasonLabelAr.ifEmpty { "تسوية توقع" },
                    color = if (contest != null) KingsCupColors.onDarkDim else KingsCupColors.onDark,
                    fontSize = if (contest != null) 10.sp else 12.sp,
                    fontWeight = if (contest != null) FontWeight.Normal else FontWeight.Bold,
                    maxLines = 2, overflow = TextOverflow.Ellipsis,
                )
                if (predicted != null) {
                    Text("· توقعت", color = KingsCupColors.onDarkDim, fontSize = 9.sp)
                    KcSplitScore(home = predicted.first, away = predicted.second, emphasized = false)
                }
            }
            if (entry.createdAt.isNotEmpty()) {
                Text(
                    "${PredDates.dayAr(entry.createdAt)} · ${PredDates.kickoffTimeAr(entry.createdAt)}",
                    color = KingsCupColors.onDarkDim, fontSize = 9.sp,
                )
            }
        }

        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.clip(RoundedCornerShape(9.dp)).background(KingsCupColors.emeraldDeep)
                .padding(horizontal = 9.dp, vertical = 4.dp),
        ) {
            Text("+", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            Text("${entry.points}", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold)
        }
    }
}

// ── تبويب المتصدرين ──

private fun androidx.compose.foundation.lazy.LazyListScope.kcPredLeadersTab(
    state: KingsCupPredictionsViewModel.State,
    viewModel: KingsCupPredictionsViewModel,
) {
    state.error?.let { error -> item { KcPredRetryBanner(error, viewModel::refresh) } }
    val leaders = state.board?.entries.orEmpty()
    if (state.loading && leaders.isEmpty()) {
        item { KcLoading() }
    } else if (leaders.isEmpty()) {
        item { KcEmptyText("الصدارة تتشكّل مع أول جولة توقعات — كن أول المتنافسين") }
    } else {
        items(leaders.take(20), key = { "kclead-${it.userId}" }) { entry -> KcPredLeaderRow(entry) }
    }
}

@Composable
private fun KcPredLeaderRow(entry: PredLeaderEntry) {
    Row(
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
        modifier = kcCardModifier(13).padding(horizontal = 12.dp, vertical = 8.dp),
    ) {
        Box(
            modifier = Modifier.size(24.dp).clip(CircleShape)
                .background(if (entry.rank <= 3) KingsCupColors.gold.copy(alpha = 0.15f) else KingsCupColors.chipFill),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                "${entry.rank}", color = if (entry.rank <= 3) KingsCupColors.gold else KingsCupColors.onDarkDim,
                fontSize = 11.sp, fontWeight = FontWeight.Bold,
            )
        }
        AsyncImage(
            model = entry.profileImageUrl, contentDescription = null, contentScale = ContentScale.Crop,
            modifier = Modifier.size(30.dp).clip(CircleShape).background(KingsCupColors.chipFill),
        )
        Text(
            entry.name, color = KingsCupColors.onDark, fontSize = 12.sp, fontWeight = FontWeight.Bold,
            maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f),
        )
        Text("${entry.points} نقطة", color = KingsCupColors.emeraldDeep, fontSize = 12.sp, fontWeight = FontWeight.Bold)
    }
}

// ── تبويب طريقة التوقعات ──

@Composable
private fun KcPredHowSection(state: KingsCupPredictionsViewModel.State) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        // ملف الاحتساب الفعّال من الخادم — لا نص ثابت يتقادم (وفيه «جائزة»).
        Column(
            verticalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(KingsCupColors.gold.copy(alpha = 0.12f)).padding(14.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                Text("⭐", fontSize = 14.sp)
                Text("نظام النقاط", color = KingsCupColors.onDark, fontSize = 15.sp, fontWeight = FontWeight.Bold)
            }
            Text(
                state.rule?.summaryAr() ?: "تُحتسب النقاط بعد صافرة نهاية كل مباراة وتُضاف لرصيدك تلقائيًا",
                color = KingsCupColors.onDark, fontSize = 13.sp, lineHeight = 22.sp,
            )
        }

        Column(
            verticalArrangement = Arrangement.spacedBy(14.dp),
            modifier = kcCardModifier(16).padding(14.dp),
        ) {
            KcPredHowStep(1, "✏️", "اختر نتيجة المباراة", "حدد أهداف كل فريق قبل انطلاق المباراة — التوقع يُقفل عند صافرة البداية")
            KcPredHowStep(2, "🔄", "عدّل توقعك متى شئت", "يمكنك تعديل توقعك بلا حدود حتى لحظة الإقفال، ويُعتمد آخر توقع محفوظ")
            KcPredHowStep(3, "✅", "النقاط تُحتسب تلقائيًا", "بعد صافرة النهاية تُوزَّع نقاط المباراة على المصيبين وتُضاف لرصيدك")
            KcPredHowStep(4, "🏆", "نافس على صدارة البطولة", "رصيدك التراكمي يحدد مركزك بين المتنافسين في تبويب المتصدرين")
        }

        Row(
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp),
            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp))
                .background(KingsCupColors.chipFill).padding(11.dp),
        ) {
            Text("👤", fontSize = 13.sp)
            Text(
                "المشاركة تتطلب تسجيل الدخول بحسابك في سبق — التصفح متاح للجميع",
                color = KingsCupColors.onDarkDim, fontSize = 11.sp,
            )
        }
    }
}

@Composable
private fun KcPredHowStep(number: Int, emoji: String, title: String, text: String) {
    Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(11.dp)) {
        Box(
            Modifier.size(34.dp).clip(CircleShape).background(KingsCupColors.chipFill),
            contentAlignment = Alignment.Center,
        ) { Text(emoji, fontSize = 14.sp) }
        Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text("$number. $title", color = KingsCupColors.onDark, fontSize = 13.sp, fontWeight = FontWeight.Bold)
            Text(text, color = KingsCupColors.onDarkDim, fontSize = 11.sp, lineHeight = 17.sp)
        }
    }
}

// ── بطاقة التوقع ──

@Composable
private fun KcPredContestCard(
    contest: PredContest,
    state: KingsCupPredictionsViewModel.State,
    drafts: androidx.compose.runtime.snapshots.SnapshotStateMap<String, Pair<Int, Int>>,
    onSubmit: (Int, Int) -> Unit,
) {
    val initial = contest.myEntry?.payload?.let { (it.predHome ?: 0) to (it.predAway ?: 0) } ?: (0 to 0)
    val draft = drafts[contest.id] ?: initial
    Column(
        verticalArrangement = Arrangement.spacedBy(10.dp),
        modifier = kcCardModifier(16).padding(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            KcPredTeamSide(contest.metadata?.home?.name, contest.metadata?.home?.logo, Modifier.weight(1f))
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    KcPredStepper(draft.first) { drafts[contest.id] = it to draft.second }
                    Text("-", color = KingsCupColors.onDarkDim)
                    KcPredStepper(draft.second) { drafts[contest.id] = draft.first to it }
                }
                PredDates.countdownAr(contest.locksAt)?.let {
                    Text(it, color = KingsCupColors.onDarkDim, fontSize = 9.sp)
                }
                // عدّاد المتوقّعين — إثبات اجتماعي، رقم بلا أسماء.
                contest.entriesCount.takeIf { it > 0 }?.let { count ->
                    Text(
                        "👥 ${kcPredictorsLabelAr(count)}",
                        color = KingsCupColors.emeraldDeep, fontSize = 9.sp, fontWeight = FontWeight.Medium,
                    )
                }
            }
            KcPredTeamSide(contest.metadata?.away?.name, contest.metadata?.away?.logo, Modifier.weight(1f))
        }
        val saving = state.savingContest == contest.id
        Box(
            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(11.dp)).background(KingsCupColors.emeraldDeep)
                .clickable(enabled = state.savingContest == null) { onSubmit(draft.first, draft.second) }
                .padding(vertical = 9.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                when {
                    saving -> "جارٍ الحفظ…"
                    state.savedContest == contest.id -> "تم حفظ توقعك ✓"
                    contest.myEntry?.payload == null -> "احفظ توقعك"
                    else -> "عدّل توقعك"
                },
                color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold,
            )
        }
    }
}

@Composable
private fun KcPredTeamSide(name: String?, logo: String?, modifier: Modifier) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(5.dp)) {
        KcTeamLogo(logo.orEmpty(), size = 40)
        Text(
            name ?: "—", color = KingsCupColors.onDark, fontSize = 11.sp, fontWeight = FontWeight.Bold,
            maxLines = 1, overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun KcPredStepper(value: Int, onChange: (Int) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Box(
            Modifier.size(24.dp).clip(CircleShape).background(KingsCupColors.emerald.copy(alpha = 0.15f))
                .clickable { onChange((value + 1).coerceAtMost(20)) },
            contentAlignment = Alignment.Center,
        ) { Icon(Icons.Filled.Add, null, tint = KingsCupColors.emeraldDeep, modifier = Modifier.size(13.dp)) }
        Text(
            "$value", color = KingsCupColors.onDark, fontSize = 20.sp, fontWeight = FontWeight.Bold,
            modifier = Modifier.width(26.dp), textAlign = TextAlign.Center,
        )
        Box(
            Modifier.size(24.dp).clip(CircleShape).background(KingsCupColors.chipFill)
                .clickable { onChange((value - 1).coerceAtLeast(0)) },
            contentAlignment = Alignment.Center,
        ) { Icon(Icons.Filled.Remove, null, tint = KingsCupColors.onDarkDim, modifier = Modifier.size(13.dp)) }
    }
}

// ── نتيجة بأرقام مفصولة — درع الانقلاب ──
//
// كل رقم عنصر مستقل ملاصق لفريقه في صف RTL طبيعي (المضيف يمينًا دائمًا) —
// لا زوج نصي داخل عزل LTR إطلاقًا فلا يوجد ما ينقلب (قرار المالك 2026-08-02).

@Composable
private fun KcScoreNumber(value: Int, emphasized: Boolean) {
    Text(
        "$value",
        color = if (emphasized) Color.White else KingsCupColors.onDarkDim,
        fontSize = if (emphasized) 13.sp else 10.sp,
        fontWeight = FontWeight.Bold,
        modifier = if (emphasized) {
            Modifier.clip(RoundedCornerShape(7.dp)).background(KingsCupColors.emeraldDeep)
                .padding(horizontal = 7.dp, vertical = 2.dp)
        } else Modifier,
    )
}

/** [مضيف][-][ضيف] في صف RTL: أول عنصر يظهر يمينًا — رقم المضيف تحت اسمه دائمًا. */
@Composable
private fun KcSplitScore(home: Int, away: Int, emphasized: Boolean = true) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
        KcScoreNumber(home, emphasized)
        Text("-", color = KingsCupColors.onDarkDim, fontSize = if (emphasized) 11.sp else 9.sp)
        KcScoreNumber(away, emphasized)
    }
}

@Composable
private fun KcPredSettledRow(contest: PredContest) {
    Row(
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
        modifier = kcCardModifier(13).padding(horizontal = 12.dp, vertical = 10.dp),
    ) {
        Text(
            contest.metadata?.home?.name ?: "—", color = KingsCupColors.onDark, fontSize = 12.sp,
            fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f),
        )
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(3.dp), modifier = Modifier.width(104.dp)) {
            val r = contest.result
            if (r?.finalHome != null && r.finalAway != null) {
                KcSplitScore(home = r.finalHome, away = r.finalAway)
            } else {
                Text("بانتظار النتيجة", color = KingsCupColors.onDarkDim, fontSize = 10.sp)
            }
            contest.myEntry?.payload?.let { p ->
                if (p.predHome != null && p.predAway != null) {
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("توقعت", color = KingsCupColors.onDarkDim, fontSize = 9.sp)
                        KcSplitScore(home = p.predHome, away = p.predAway, emphasized = false)
                    }
                }
            }
        }
        Text(
            contest.metadata?.away?.name ?: "—", color = KingsCupColors.onDark, fontSize = 12.sp,
            fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.End, modifier = Modifier.weight(1f),
        )
    }
}

internal fun kcPredictorsLabelAr(count: Int): String = when (count) {
    1 -> "متوقّع واحد"
    2 -> "متوقّعان"
    in 3..10 -> "$count متوقّعين"
    else -> "$count متوقّعًا"
}
