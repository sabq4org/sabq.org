package com.sabq.smart.feature.roshn

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
import androidx.compose.ui.draw.shadow
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
import com.sabq.smart.feature.predictions.PredLeaderboardResponse
import com.sabq.smart.feature.predictions.PredMyEntry
import com.sabq.smart.feature.predictions.PredRule
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

// توقعات دوري روشن — صفحة مستقلة (طلب المالك 2026-08-02) على المنصة
// المركزية predictions-core عبر /api/v1/predictions/* — مرآة iOS
// `RoshnPredictionsView`: ثلاثة تبويبات (المباريات / المتصدرون / طريقة
// التوقعات)، ونص نظام النقاط يُولَّد من ملف الاحتساب الفعّال على الخادم.

/** تفكيك نصوص "home-away" القادمة من الخادم — لا نعرض النص الخام أبدًا
 *  (سلاسل LTR داخل جملة عربية تنقلب بصريًا — شكوى المالك 2026-08-02). */
internal fun parseScorePair(raw: String?): Pair<Int, Int>? {
    val parts = raw?.split("-")?.mapNotNull { it.trim().toIntOrNull() } ?: return null
    return if (parts.size == 2) parts[0] to parts[1] else null
}

@HiltViewModel
class RoshnPredictionsViewModel @Inject constructor(
    private val predRepo: PredictionsRepository,
    private val tokenStore: com.sabq.smart.data.auth.AuthTokenStore,
) : ViewModel() {
    enum class Tab { MATCHES, LEDGER, LEADERS, HOW }

    data class State(
        val tab: Tab = Tab.MATCHES,
        val slug: String? = null,
        val contests: List<PredContest> = emptyList(),
        val board: PredLeaderboardResponse? = null,
        val rule: PredRule? = null,
        val loading: Boolean = true,
        val error: String? = null,
        val savingContest: String? = null,
        val savedContest: String? = null,
        // «سجلّي» — دفتر النقاط، كسول ويتطلب جلسة عضو (401 بلا Bearer).
        val ledger: List<PredLedgerItem> = emptyList(),
        val ledgerLoading: Boolean = false,
        val ledgerError: String? = null,
        val didLoadLedger: Boolean = false,
        /** جلسة عضو قائمة — تحدد الدعوة مقابل بطاقات الحصاد في الهيرو. */
        val isSignedIn: Boolean = false,
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            _state.update { it.copy(isSignedIn = tokenStore.current() != null) }
            load()
            // جلبة انتهازية للدفتر — تغذي «دقّتي» في الهيرو وشبكة الحصاد
            // (401 بلا جلسة يمر وتظهر دعوة الدخول عند فتح «نقاطي»).
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

    /** اكتشاف معرّف المسابقة من الخادم لا ثابت مزروع — نفس منطق iOS. */
    suspend fun load(force: Boolean = false) {
        if (_state.value.loading && force) return
        _state.update { it.copy(loading = true, error = null) }
        runCatching {
            val slug = _state.value.slug ?: predRepo.competitions().competitions.let { comps ->
                comps.firstOrNull { it.slug.startsWith("rsl") }?.slug
                    ?: comps.firstOrNull { it.nameAr.contains("روشن") }?.slug
            }
            if (slug == null) {
                _state.update { it.copy(loading = false, error = "مسابقة توقعات الدوري لم تُفعَّل بعد") }
                return
            }
            coroutineScope {
                val contests = async { predRepo.competition(slug).contests }
                val board = async { runCatching { predRepo.leaderboard(slug) }.getOrNull() }
                val loaded = contests.await()
                // ملف الاحتساب لتبويب «طريقة التوقعات» — من أول مباراة، ومرة واحدة.
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
fun RoshnPredictionsScreen(
    onBack: () -> Unit,
    onRequireLogin: () -> Unit,
    viewModel: RoshnPredictionsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    // مسودات درجات التوقع لكل مباراة — نمط كأس آسيا (mutableStateMapOf).
    val drafts = remember { mutableStateMapOf<String, Pair<Int, Int>>() }

    ProvideTextStyle(LocalTextStyle.current.copy(fontFamily = IbmPlexSansArabic)) {
        Column(Modifier.fillMaxSize().background(RoshnColors.canvas)) {
            RoshnHeader("توقعات دوري روشن", onBack)
            LazyColumn(
                contentPadding = PaddingValues(start = 14.dp, end = 14.dp, bottom = 28.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                item { PredHero(state) }
                item { PredTabBar(state.tab, viewModel::select) }
                when (state.tab) {
                    RoshnPredictionsViewModel.Tab.MATCHES -> predMatchesTab(state, viewModel, drafts, onRequireLogin)
                    RoshnPredictionsViewModel.Tab.LEDGER -> predLedgerTab(state, viewModel)
                    RoshnPredictionsViewModel.Tab.LEADERS -> predLeadersTab(state, viewModel)
                    RoshnPredictionsViewModel.Tab.HOW -> item { PredHowSection(state) }
                }
            }
        }
    }
}

// ── الترويسة — زمردية بخط ذهبي، مع نقاط العضو ومركزه ──

@Composable
private fun PredHero(state: RoshnPredictionsViewModel.State) {
    Box(
        modifier = Modifier.fillMaxWidth()
            .shadow(4.dp, RoundedCornerShape(24.dp), spotColor = RoshnColors.cardShadow, ambientColor = RoshnColors.cardShadow)
            .clip(RoundedCornerShape(24.dp))
            .background(RoshnColors.hero),
    ) {
        Box(
            Modifier.align(Alignment.TopCenter).fillMaxWidth().padding(horizontal = 40.dp)
                .height(3.dp).clip(RoundedCornerShape(2.dp)).background(RoshnColors.gold),
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
                        "توقّع نتائج الجولة ونافس على نقاط الموسم",
                        color = Color.White.copy(alpha = 0.85f), fontSize = 11.sp, maxLines = 1,
                    )
                }
            }
            val my = state.board?.myRank
            if (state.isSignedIn) {
                // المسجّل يرى بطاقاته الثلاث دائمًا — أصفار/شرطات قبل أول تسوية
                // (myRank لا يوجد إلا بعد تسويات، فلا يُشترط لعرض البطاقات).
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    PredHeroStat("${my?.points ?: 0}", "نقطة حصدتها", Modifier.weight(1f))
                    PredHeroStat(my?.rank?.toString() ?: "—", "مركزي", Modifier.weight(1f))
                    PredHeroStat(accuracyPercent(state)?.let { "$it٪" } ?: "—", "دقّتي", Modifier.weight(1f))
                }
                val race = my?.let { raceProgress(state, it) }
                if (race != null) {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Box(Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(50)).background(Color.White.copy(alpha = 0.14f))) {
                            Box(
                                Modifier.fillMaxWidth(race.first.coerceIn(0.03f, 1f)).height(6.dp)
                                    .clip(RoundedCornerShape(50)).background(RoshnColors.gold),
                            )
                        }
                        Text(race.second, color = Color.White.copy(alpha = 0.9f), fontSize = 9.sp)
                    }
                } else {
                    Text(
                        "نقاطك تبدأ مع أول تسوية — توقّع الجولة كاملة وعُد بعد الصافرة",
                        color = Color.White.copy(alpha = 0.9f), fontSize = 9.sp,
                    )
                }
            } else {
                // بلا جلسة فقط: دعوة تسجيل الدخول بدل الأرقام.
                Box(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(11.dp)).background(Color.White.copy(alpha = 0.16f)).padding(vertical = 9.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        "سجّل دخولك وتوقّع نتائج الجولة ونافس على نقاط الموسم",
                        color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold,
                    )
                }
            }
        }
    }
}

// ── مشتقات الحصاد — من الدفتر ومباريات المسابقة (صفر تغيير خادم) ──

private val HIT_REASONS = setOf("exact", "margin", "outcome")

/** توقعاتي المُسوّاة = مباريات المسابقة التي لي فيها توقع وحُسمت. */
private fun settledMineCount(state: RoshnPredictionsViewModel.State): Int =
    state.contests.count { it.myEntry != null && it.status == "settled" }

private fun accuracyPercent(state: RoshnPredictionsViewModel.State): Int? {
    val settled = settledMineCount(state)
    if (settled <= 0) return null
    val hits = state.ledger.count { it.reasonCode in HIT_REASONS }
    return ((hits.toDouble() / settled) * 100).toInt()
}

/** شريط السباق: خارج العشرة → المسافة للعاشر؛ داخلها → المسافة للصدارة. */
private fun raceProgress(
    state: RoshnPredictionsViewModel.State,
    my: com.sabq.smart.feature.predictions.PredMyRank,
): Pair<Float, String>? {
    val entries = state.board?.entries.orEmpty()
    if (entries.isEmpty()) return null
    if (my.rank == 1) return 1f to "أنت في الصدارة 👑 — حافظ عليها بتوقّع كل جولة"
    val (target, targetLabel) = if (my.rank <= 10) {
        (entries.firstOrNull()?.points ?: my.points) to "الصدارة"
    } else {
        (entries.getOrNull(9)?.points ?: entries.lastOrNull()?.points ?: my.points) to "العاشر"
    }
    if (target <= 0) return null
    val gap = (target - my.points).coerceAtLeast(0)
    val fraction = (my.points.toFloat() / target).coerceIn(0f, 1f)
    return if (gap == 0) {
        1f to "لامست $targetLabel — تسوية واحدة تحسمها"
    } else {
        fraction to "يفصلك $gap نقطة عن $targetLabel — توقّع الجولة كاملة"
    }
}

@Composable
private fun PredHeroStat(value: String, label: String, modifier: Modifier) {
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
private fun PredTabBar(selected: RoshnPredictionsViewModel.Tab, onSelect: (RoshnPredictionsViewModel.Tab) -> Unit) {
    val labels = mapOf(
        RoshnPredictionsViewModel.Tab.MATCHES to "المباريات",
        RoshnPredictionsViewModel.Tab.LEDGER to "نقاطي",
        RoshnPredictionsViewModel.Tab.LEADERS to "المتصدرون",
        RoshnPredictionsViewModel.Tab.HOW to "الطريقة",
    )
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        RoshnPredictionsViewModel.Tab.entries.forEach { tab ->
            val active = tab == selected
            Box(
                modifier = Modifier.weight(1f).clip(RoundedCornerShape(11.dp))
                    .background(if (active) RoshnColors.ink else RoshnColors.card)
                    .clickable { onSelect(tab) }.padding(vertical = 9.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    labels.getValue(tab),
                    color = if (active) Color.White else RoshnColors.inkSoft,
                    fontSize = 12.sp, fontWeight = if (active) FontWeight.Bold else FontWeight.Normal, maxLines = 1,
                )
            }
        }
    }
}

// ── تبويب المباريات ──

private fun androidx.compose.foundation.lazy.LazyListScope.predMatchesTab(
    state: RoshnPredictionsViewModel.State,
    viewModel: RoshnPredictionsViewModel,
    drafts: androidx.compose.runtime.snapshots.SnapshotStateMap<String, Pair<Int, Int>>,
    onRequireLogin: () -> Unit,
) {
    state.error?.let { error -> item { RsRetryBanner(error, viewModel::refresh) } }

    val open = state.contests
        .filter { it.isMatchScore && it.status == "open" }
        .sortedBy { PredDates.parse(it.locksAt)?.epochSecond ?: Long.MAX_VALUE }
    val settled = state.contests
        .filter { it.isMatchScore && it.status in listOf("settled", "locked", "ready") }
        .sortedByDescending { PredDates.parse(it.locksAt)?.epochSecond ?: 0L }

    // تقدّم الجولة: كم مباراة مفتوحة توقّعتها — يدفع لإكمالها.
    if (open.size > 1 && state.isSignedIn) {
        val openMine = open.count { it.myEntry?.payload != null }
        item {
            Row(
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp))
                    .background(RoshnColors.skySoft.copy(alpha = 0.6f)).padding(11.dp),
            ) {
                Text("📋", fontSize = 12.sp)
                Text(
                    "توقعاتك هذه الجولة: $openMine من ${open.size}",
                    color = RoshnColors.ink, fontSize = 12.sp, fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1f),
                )
                if (openMine < open.size) {
                    Text("أكملها 👇", color = RoshnColors.inkSoft, fontSize = 10.sp)
                } else {
                    Text("اكتملت ✓", color = RoshnColors.pitch, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }

    if (state.loading && state.contests.isEmpty()) {
        item { RsLoadingRows(4, 110) }
    } else if (open.isEmpty() && settled.isEmpty() && state.error == null) {
        item { RsEmptyState("مباريات التوقع تُفتح قبل كل جولة — عُد قريبًا") }
    }

    items(open, key = { "pred-${it.id}" }) { contest ->
        PredContestCard(contest, state, drafts) { h, a ->
            viewModel.submit(contest.id, h, a, onRequireLogin)
        }
    }

    if (settled.isNotEmpty()) {
        item { PredSectionLabel("آخر المباريات") }
        items(settled.take(8), key = { "preddone-${it.id}" }) { contest -> PredSettledRow(contest) }
    }
}

// ── تبويب سجلّي — دفتر نقاطي ──

private fun androidx.compose.foundation.lazy.LazyListScope.predLedgerTab(
    state: RoshnPredictionsViewModel.State,
    viewModel: RoshnPredictionsViewModel,
) {
    state.ledgerError?.let { error -> item { RsRetryBanner(error, viewModel::retryLedger) } }

    if (state.ledgerLoading && state.ledger.isEmpty()) {
        item { RsLoadingRows(6, 52) }
    } else if (state.ledger.isEmpty() && state.ledgerError == null) {
        item { RsEmptyState("حصادك يبدأ مع أول تسوية — توقّع مباريات الجولة وعُد بعد صافرة النهاية") }
    } else {
        state.board?.myRank?.let { my ->
            item {
                Row(
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp)).background(RoshnColors.goldSoft).padding(12.dp),
                ) {
                    Text("Σ", color = RoshnColors.gold, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    Text("مجموع ما حصدته هذا الموسم", color = RoshnColors.ink, fontSize = 12.sp, modifier = Modifier.weight(1f))
                    Text("${my.points} نقطة", color = RoshnColors.sky, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                }
            }
        }

        item { PredSectionLabel("حصاد الموسم") }
        item { PredHarvestGrid(state) }

        item { PredSectionLabel("سجلّ التسويات") }
        items(state.ledger, key = { "ledger-${it.id}" }) { item -> PredLedgerRow(item, state.contests) }
    }
}

@Composable
private fun PredHarvestTile(value: String, label: String, tint: Color, modifier: Modifier) {
    Column(
        modifier = modifier
            .shadow(2.dp, RoundedCornerShape(14.dp), spotColor = RoshnColors.cardShadow, ambientColor = RoshnColors.cardShadow)
            .clip(RoundedCornerShape(14.dp)).background(RoshnColors.card).padding(vertical = 9.dp),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        Text(value, color = tint, fontSize = 16.sp, fontWeight = FontWeight.Bold)
        Text(label, color = RoshnColors.inkSoft, fontSize = 9.sp, maxLines = 1)
    }
}

@Composable
private fun PredHarvestGrid(state: RoshnPredictionsViewModel.State) {
    val exact = state.ledger.count { it.reasonCode == "exact" }
    val margin = state.ledger.count { it.reasonCode == "margin" }
    val outcome = state.ledger.count { it.reasonCode == "outcome" }
    val best = state.ledger.maxOfOrNull { it.points } ?: 0
    Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            PredHarvestTile("${settledMineCount(state)}", "توقعًا مُسوّى", RoshnColors.ink, Modifier.weight(1f))
            PredHarvestTile("$exact", "نتيجة دقيقة 🎯", RoshnColors.gold, Modifier.weight(1f))
            PredHarvestTile("$margin", "فارق صحيح", RoshnColors.ink, Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            PredHarvestTile("$outcome", "اتجاه صحيح", RoshnColors.ink, Modifier.weight(1f))
            PredHarvestTile(accuracyPercent(state)?.let { "$it٪" } ?: "—", "نسبة الإصابة", RoshnColors.pitch, Modifier.weight(1f))
            PredHarvestTile("$best", "أفضل تسوية", RoshnColors.gold, Modifier.weight(1f))
        }
    }
}

@Composable
private fun PredLedgerRow(item: PredLedgerItem, contests: List<PredContest>) {
    // اسم الفريقين من مباريات المسابقة المحمّلة (ربط contestId)،
    // والنتيجة/التوقع من تفكيك التسوية — أرقام مفصولة لا نص خام.
    val contest = contests.firstOrNull { it.id == item.contestId }
    val final = parseScorePair(item.breakdown?.finalScore)
    val predicted = parseScorePair(item.breakdown?.prediction)

    Row(
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.fillMaxWidth()
            .shadow(2.dp, RoundedCornerShape(13.dp), spotColor = RoshnColors.cardShadow, ambientColor = RoshnColors.cardShadow)
            .clip(RoundedCornerShape(13.dp)).background(RoshnColors.card)
            .padding(horizontal = 12.dp, vertical = 9.dp),
    ) {
        val reasonEmoji = when (item.reasonCode) {
            "exact" -> "🎯"
            "margin" -> "📐"
            "outcome" -> "✅"
            else -> "⭐"
        }
        Box(
            Modifier.size(30.dp).clip(CircleShape).background(RoshnColors.pitchSoft),
            contentAlignment = Alignment.Center,
        ) { Text(reasonEmoji, fontSize = 12.sp) }

        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            if (contest != null && final != null) {
                // سطر المباراة: [مضيف][نتيجته]-[نتيجة الضيف][ضيف] — RTL طبيعي.
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                    Text(
                        contest.metadata?.home?.name ?: "—",
                        color = RoshnColors.ink, fontSize = 12.sp, fontWeight = FontWeight.Bold,
                        maxLines = 1, overflow = TextOverflow.Ellipsis,
                    )
                    SplitScore(home = final.first, away = final.second, emphasized = false)
                    Text(
                        contest.metadata?.away?.name ?: "—",
                        color = RoshnColors.ink, fontSize = 12.sp, fontWeight = FontWeight.Bold,
                        maxLines = 1, overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    item.reasonLabelAr.ifEmpty { "تسوية توقع" },
                    color = if (contest != null) RoshnColors.inkSoft else RoshnColors.ink,
                    fontSize = if (contest != null) 10.sp else 12.sp,
                    fontWeight = if (contest != null) FontWeight.Normal else FontWeight.Bold,
                    maxLines = 2, overflow = TextOverflow.Ellipsis,
                )
                if (predicted != null) {
                    Text("· توقعت", color = RoshnColors.inkSoft, fontSize = 9.sp)
                    SplitScore(home = predicted.first, away = predicted.second, emphasized = false)
                }
            }
            if (item.createdAt.isNotEmpty()) {
                Text(
                    "${PredDates.dayAr(item.createdAt)} · ${PredDates.kickoffTimeAr(item.createdAt)}",
                    color = RoshnColors.inkSoft, fontSize = 9.sp,
                )
            }
        }

        // نقاط التسوية — رقم واحد فلا التباس.
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.clip(RoundedCornerShape(9.dp)).background(RoshnColors.sky)
                .padding(horizontal = 9.dp, vertical = 4.dp),
        ) {
            Text("+", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            Text("${item.points}", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold)
        }
    }
}

// ── تبويب المتصدرين ──

private fun androidx.compose.foundation.lazy.LazyListScope.predLeadersTab(
    state: RoshnPredictionsViewModel.State,
    viewModel: RoshnPredictionsViewModel,
) {
    state.error?.let { error -> item { RsRetryBanner(error, viewModel::refresh) } }
    val leaders = state.board?.entries.orEmpty()
    if (state.loading && leaders.isEmpty()) {
        item { RsLoadingRows(8, 48) }
    } else if (leaders.isEmpty()) {
        item { RsEmptyState("الصدارة تتشكّل مع أول جولة توقعات — كن أول المتنافسين") }
    } else {
        items(leaders.take(20), key = { "predlead-${it.userId}" }) { entry -> PredLeaderRow(entry) }
    }
}

// ── تبويب طريقة التوقعات ──

@Composable
private fun PredHowSection(state: RoshnPredictionsViewModel.State) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        // ملف الاحتساب الفعّال من الخادم — لا نص ثابت يتقادم.
        Column(
            verticalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(RoshnColors.goldSoft).padding(14.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                Text("⭐", fontSize = 14.sp)
                Text("نظام النقاط", color = RoshnColors.ink, fontSize = 15.sp, fontWeight = FontWeight.Bold)
            }
            Text(
                state.rule?.summaryAr() ?: "تُحتسب النقاط بعد صافرة نهاية كل مباراة وتُضاف لرصيدك تلقائيًا",
                color = RoshnColors.ink, fontSize = 13.sp, lineHeight = 22.sp,
            )
        }

        Column(
            verticalArrangement = Arrangement.spacedBy(14.dp),
            modifier = Modifier.fillMaxWidth()
                .shadow(2.dp, RoundedCornerShape(16.dp), spotColor = RoshnColors.cardShadow, ambientColor = RoshnColors.cardShadow)
                .clip(RoundedCornerShape(16.dp)).background(RoshnColors.card).padding(14.dp),
        ) {
            PredHowStep(1, "✏️", "اختر نتيجة المباراة", "حدد أهداف كل فريق قبل انطلاق المباراة — التوقع يُقفل عند صافرة البداية")
            PredHowStep(2, "🔄", "عدّل توقعك متى شئت", "يمكنك تعديل توقعك بلا حدود حتى لحظة الإقفال، ويُعتمد آخر توقع محفوظ")
            PredHowStep(3, "✅", "النقاط تُحتسب تلقائيًا", "بعد صافرة النهاية تُوزَّع نقاط المباراة على المصيبين وتُضاف لرصيد موسمك")
            PredHowStep(4, "🏆", "نافس على صدارة الموسم", "رصيدك التراكمي يحدد مركزك بين المتنافسين في تبويب المتصدرين")
        }

        Row(
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp),
            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp))
                .background(RoshnColors.skySoft.copy(alpha = 0.6f)).padding(11.dp),
        ) {
            Text("👤", fontSize = 13.sp)
            Text(
                "المشاركة تتطلب تسجيل الدخول بحسابك في سبق — التصفح متاح للجميع",
                color = RoshnColors.inkSoft, fontSize = 11.sp,
            )
        }
    }
}

@Composable
private fun PredHowStep(number: Int, emoji: String, title: String, text: String) {
    Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(11.dp)) {
        Box(
            Modifier.size(34.dp).clip(CircleShape).background(RoshnColors.skySoft),
            contentAlignment = Alignment.Center,
        ) { Text(emoji, fontSize = 14.sp) }
        Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text("$number. $title", color = RoshnColors.ink, fontSize = 13.sp, fontWeight = FontWeight.Bold)
            Text(text, color = RoshnColors.inkSoft, fontSize = 11.sp, lineHeight = 17.sp)
        }
    }
}

// ── عناصر مشتركة ──

@Composable
private fun PredSectionLabel(title: String) {
    Row(
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
        modifier = Modifier.padding(top = 4.dp),
    ) {
        Box(Modifier.size(6.dp).clip(CircleShape).background(RoshnColors.gold))
        Text(title, color = RoshnColors.sky, fontSize = 12.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun PredContestCard(
    contest: PredContest,
    state: RoshnPredictionsViewModel.State,
    drafts: androidx.compose.runtime.snapshots.SnapshotStateMap<String, Pair<Int, Int>>,
    onSubmit: (Int, Int) -> Unit,
) {
    val initial = contest.myEntry?.payload?.let { (it.predHome ?: 0) to (it.predAway ?: 0) } ?: (0 to 0)
    val draft = drafts[contest.id] ?: initial
    Column(
        verticalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.fillMaxWidth()
            .shadow(2.dp, RoundedCornerShape(16.dp), spotColor = RoshnColors.cardShadow, ambientColor = RoshnColors.cardShadow)
            .clip(RoundedCornerShape(16.dp)).background(RoshnColors.card).padding(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            PredTeamSide(contest.metadata?.home?.name, contest.metadata?.home?.logo, Modifier.weight(1f))
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    PredStepper(draft.first) { drafts[contest.id] = it to draft.second }
                    Text("-", color = RoshnColors.inkSoft)
                    PredStepper(draft.second) { drafts[contest.id] = draft.first to it }
                }
                PredDates.countdownAr(contest.locksAt)?.let {
                    Text(it, color = RoshnColors.inkSoft, fontSize = 9.sp)
                }
                // عدّاد المتوقّعين — إثبات اجتماعي، رقم بلا أسماء (عقد #1326).
                contest.entriesCount.takeIf { it > 0 }?.let { count ->
                    Text(
                        "👥 ${predictorsLabelAr(count)}",
                        color = RoshnColors.sky, fontSize = 9.sp, fontWeight = FontWeight.Medium,
                    )
                }
            }
            PredTeamSide(contest.metadata?.away?.name, contest.metadata?.away?.logo, Modifier.weight(1f))
        }
        val saving = state.savingContest == contest.id
        Box(
            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(11.dp)).background(RoshnColors.sky)
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
private fun PredTeamSide(name: String?, logo: String?, modifier: Modifier) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(5.dp)) {
        RsTeamLogo(logo.orEmpty(), size = 40)
        Text(
            name ?: "—", color = RoshnColors.ink, fontSize = 11.sp, fontWeight = FontWeight.Bold,
            maxLines = 1, overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun PredStepper(value: Int, onChange: (Int) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Box(
            Modifier.size(24.dp).clip(CircleShape).background(RoshnColors.skySoft)
                .clickable { onChange((value + 1).coerceAtMost(20)) },
            contentAlignment = Alignment.Center,
        ) { Icon(Icons.Filled.Add, null, tint = RoshnColors.sky, modifier = Modifier.size(13.dp)) }
        Text(
            "$value", color = RoshnColors.ink, fontSize = 20.sp, fontWeight = FontWeight.Bold,
            modifier = Modifier.width(26.dp), textAlign = TextAlign.Center,
        )
        Box(
            Modifier.size(24.dp).clip(CircleShape).background(RoshnColors.skySoft.copy(alpha = 0.6f))
                .clickable { onChange((value - 1).coerceAtLeast(0)) },
            contentAlignment = Alignment.Center,
        ) { Icon(Icons.Filled.Remove, null, tint = RoshnColors.inkSoft, modifier = Modifier.size(13.dp)) }
    }
}

// ── نتيجة بأرقام مفصولة — درع الانقلاب ──
//
// كل رقم عنصر مستقل ملاصق لفريقه في صف RTL طبيعي (المضيف يمينًا دائمًا)
// — لا زوج نصي داخل عزل LTR إطلاقًا، فلا يوجد ما ينقلب (قرار المالك
// 2026-08-02 بعد تكرار أخطاء النتيجة المقلوبة).

@Composable
private fun ScoreNumber(value: Int, emphasized: Boolean) {
    Text(
        "$value",
        color = if (emphasized) Color.White else RoshnColors.inkSoft,
        fontSize = if (emphasized) 13.sp else 10.sp,
        fontWeight = FontWeight.Bold,
        modifier = if (emphasized) {
            Modifier.clip(RoundedCornerShape(7.dp)).background(RoshnColors.sky)
                .padding(horizontal = 7.dp, vertical = 2.dp)
        } else Modifier,
    )
}

/** [مضيف][-][ضيف] في صف RTL: أول عنصر يظهر يمينًا — رقم المضيف تحت اسمه دائمًا. */
@Composable
private fun SplitScore(home: Int, away: Int, emphasized: Boolean = true) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
        ScoreNumber(home, emphasized)
        Text("-", color = RoshnColors.inkSoft, fontSize = if (emphasized) 11.sp else 9.sp)
        ScoreNumber(away, emphasized)
    }
}

@Composable
private fun PredSettledRow(contest: PredContest) {
    Row(
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.fillMaxWidth()
            .shadow(2.dp, RoundedCornerShape(13.dp), spotColor = RoshnColors.cardShadow, ambientColor = RoshnColors.cardShadow)
            .clip(RoundedCornerShape(13.dp)).background(RoshnColors.card)
            .padding(horizontal = 12.dp, vertical = 10.dp),
    ) {
        Text(
            contest.metadata?.home?.name ?: "—", color = RoshnColors.ink, fontSize = 12.sp,
            fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f),
        )
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(3.dp), modifier = Modifier.width(104.dp)) {
            val r = contest.result
            if (r?.finalHome != null && r.finalAway != null) {
                SplitScore(home = r.finalHome, away = r.finalAway)
            } else {
                Text("بانتظار النتيجة", color = RoshnColors.inkSoft, fontSize = 10.sp)
            }
            contest.myEntry?.payload?.let { p ->
                if (p.predHome != null && p.predAway != null) {
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("توقعت", color = RoshnColors.inkSoft, fontSize = 9.sp)
                        SplitScore(home = p.predHome, away = p.predAway, emphasized = false)
                    }
                }
            }
        }
        Text(
            contest.metadata?.away?.name ?: "—", color = RoshnColors.ink, fontSize = 12.sp,
            fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.End, modifier = Modifier.weight(1f),
        )
    }
}

internal fun predictorsLabelAr(count: Int): String = when (count) {
    1 -> "متوقّع واحد"
    2 -> "متوقّعان"
    in 3..10 -> "$count متوقّعين"
    else -> "$count متوقّعًا"
}

@Composable
private fun PredLeaderRow(entry: PredLeaderEntry) {
    Row(
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.fillMaxWidth()
            .shadow(2.dp, RoundedCornerShape(13.dp), spotColor = RoshnColors.cardShadow, ambientColor = RoshnColors.cardShadow)
            .clip(RoundedCornerShape(13.dp)).background(RoshnColors.card)
            .padding(horizontal = 12.dp, vertical = 8.dp),
    ) {
        Box(
            modifier = Modifier.size(24.dp).clip(CircleShape)
                .background(if (entry.rank <= 3) RoshnColors.goldSoft else RoshnColors.skySoft.copy(alpha = 0.6f)),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                "${entry.rank}", color = if (entry.rank <= 3) RoshnColors.gold else RoshnColors.inkSoft,
                fontSize = 11.sp, fontWeight = FontWeight.Bold,
            )
        }
        AsyncImage(
            model = entry.profileImageUrl, contentDescription = null, contentScale = ContentScale.Crop,
            modifier = Modifier.size(30.dp).clip(CircleShape).background(RoshnColors.skySoft),
        )
        Text(
            entry.name, color = RoshnColors.ink, fontSize = 12.sp, fontWeight = FontWeight.Bold,
            maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f),
        )
        Text("${entry.points} نقطة", color = RoshnColors.sky, fontSize = 12.sp, fontWeight = FontWeight.Bold)
    }
}
