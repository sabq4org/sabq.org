package com.sabq.vara.ui

// مركز المباريات الموحّد — نقل 1:1 من MatchesCenterView.swift (iOS):
// نافذة 67–127 يومًا، تجزئة comps لدفعات 8، سجل بطولات حي، عدسة + شرائح،
// شريط أيام متزامن ثنائي الاتجاه، تلخيص الأيام البعيدة، بلوك «مبارياتي»،
// ورقة إعداد البطولات، واستطلاع متكيّف 10/30/45ث.

import android.content.Context
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DoneAll
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.SportsSoccer
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import coil.compose.AsyncImage
import com.sabq.vara.core.Competition
import com.sabq.vara.core.Fixture
import com.sabq.vara.core.VaraFormat
import com.sabq.vara.core.VaraViewModel
import com.sabq.vara.core.findArray
import com.sabq.vara.core.latinNumber
import com.sabq.vara.core.obj
import com.sabq.vara.core.parseCompetition
import com.sabq.vara.core.parseFixture
import com.sabq.vara.push.MatchReminderScheduler
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

// MARK: — ثوابت المركز (نظير SpCenterFilter)

private const val MxLensPrefKey = "matches_lens"

/// السلة الافتراضية المعتمدة — نفس ترتيب iOS (يُستخدم أيضًا رتبةً للتلخيص).
private val MxDefaultSlugs = listOf(
    "pro-league",
    "world-cup",
    "kings-cup",
    "uefa-super-cup",
    "la-liga",
    "premier-league",
)

/// أقصى مباريات ظاهرة لكل بطولة في الأيام البعيدة (بعد غد فما بعد).
private const val MxFeaturedPerComp = 3

private val MxSaudiSlugs = setOf("pro-league", "kings-cup", "saudi-super-cup", "first-division")

/// أسماء مختصرة للشرائح — الأسماء الرسمية الطويلة تزحم الشريط (نقل حرفي من iOS).
private val MxShortNames = mapOf(
    "دوري روشن السعودي" to "روشن",
    "الدوري الإنجليزي" to "الإنجليزي",
    "الدوري الإسباني" to "الإسباني",
    "الدوري الإيطالي" to "الإيطالي",
    "الدوري الألماني" to "الألماني",
    "الدوري الفرنسي" to "الفرنسي",
    "كأس العالم" to "المونديال",
    "كأس الخليج" to "الخليجي",
)

private fun mxShortName(name: String): String = MxShortNames[name] ?: name

private data class MxLens(val key: String, val title: String, val icon: ImageVector)

/// عدسات النطاق — القيَم مطابقة لما يفهمه mxEffectiveSlugs.
private val MxLenses = listOf(
    MxLens("all", "الكل", Icons.Default.GridView),
    MxLens("lens:important", "الأهم", Icons.Default.AutoAwesome),
    MxLens("lens:category:saudi", "السعودية", Icons.Default.Flag),
    MxLens("lens:category:european", "أوروبا", Icons.Default.Public),
    MxLens("lens:category:world", "العالمية", Icons.Default.Language),
)

private data class MxDay(val id: String, val date: LocalDate, val round: String, val fixtures: List<Fixture>)

private data class MxCompSlice(
    val id: String,
    val slug: String?,
    val name: String?,
    val featured: List<Fixture>,
    val hiddenCount: Int,
)

// MARK: — مساعدات غير مرئية

private fun mxLoadSelection(context: Context): String =
    context.getSharedPreferences("vara_preferences", Context.MODE_PRIVATE).getString(MxLensPrefKey, "all") ?: "all"

private fun mxSaveSelection(context: Context, value: String) {
    context.getSharedPreferences("vara_preferences", Context.MODE_PRIVATE).edit().putString(MxLensPrefKey, value).apply()
}

private fun mxCategoryRank(category: String): Int = when (category.lowercase()) {
    "saudi" -> 0; "gulf" -> 1; "arab" -> 2; "european" -> 3; "world" -> 4; else -> 5
}

private fun mxCategoryLabel(category: String): String = when (category.lowercase()) {
    "saudi" -> "السعودية"; "gulf" -> "الخليجية"; "arab" -> "العربية"
    "european" -> "الأوروبية"; "world" -> "العالمية"
    else -> category.ifBlank { "بطولات أخرى" }
}

/// وصف حالة البطولة في صف الاختيار — يطمئن المستخدم أن الجدول سيمتلئ لاحقًا.
private fun mxCompStatusHint(status: String): String? = when (status) {
    "ongoing" -> "جارية الآن"; "upcoming" -> "تنطلق قريبًا"; "finished" -> "انتهت"; else -> null
}

/// ترتيب داخل اليوم: مباشر → قادمة → منتهية.
private fun mxDayRank(f: Fixture): Int = when {
    f.status.live -> 0
    f.status.finished -> 2
    else -> 1
}

/// تجميع الجدول بالأيام (تقويم الرياض) + ترتيب داخل اليوم بالحالة ثم الوقت ثم id.
private fun mxMakeDays(fixtures: List<Fixture>, liveOnly: Boolean): List<MxDay> {
    val source = if (liveOnly) fixtures.filter { it.status.live } else fixtures
    val buckets = LinkedHashMap<LocalDate, MutableList<Fixture>>()
    for (f in source) {
        val instant = VaraFormat.instantOf(f) ?: continue
        buckets.getOrPut(VaraFormat.localDate(instant)) { mutableListOf() }.add(f)
    }
    return buckets.entries.map { (date, list) ->
        val sorted = list.sortedWith(
            compareBy({ mxDayRank(it) }, { it.timestamp ?: Long.MAX_VALUE }, { it.id }),
        )
        MxDay(id = date.toString(), date = date, round = sorted.firstOrNull()?.round.orEmpty(), fixtures = sorted)
    }.sortedBy { it.date }
}

/// بصمة مرئية — تمنع إعادة بناء القائمة عندما لا يتغيّر شيء يُرى.
private fun mxSignature(rows: List<Fixture>): String = rows.joinToString("|") { f ->
    "${f.id}:${f.timestamp}:${f.status.code}:${f.status.elapsed}:${f.status.extra}:${f.status.live}:${f.status.finished}:" +
        "${f.homeScore}-${f.awayScore}:p${f.penHome}-${f.penAway}:${f.home.id}-${f.away.id}:${f.competitionSlug}"
}

/// `/sports/fixtures` لا يعيد خانات المونديال الصناعية التي يبنيها
/// `/world-cup/bracket` للمواجهات المستقبلية قبل نشرها من المزوّد — ندمجها هنا
/// حتى تظهر مباريات مثل ربع النهائي بمجرد حسم طرفيها (نقل mergeWorldCupBracketFixtures).
private fun mxMergeWorldCupBracket(bracketRoot: JsonElement?, unified: List<Fixture>): List<Fixture> {
    val byId = LinkedHashMap<Int, Fixture>()
    fun addBracketFixture(element: JsonElement?) {
        val fx = element?.let(::parseFixture) ?: return
        byId[fx.id] = if (fx.competitionSlug.isBlank()) {
            fx.copy(competitionSlug = "world-cup", competitionName = fx.competitionName.ifBlank { "كأس العالم" })
        } else fx
    }
    val tree = (bracketRoot as? JsonObject)?.obj("tree")
    if (tree != null) {
        (tree["columns"] as? JsonArray)?.forEach { column ->
            ((column as? JsonObject)?.get("slots") as? JsonArray)?.forEach { slot ->
                addBracketFixture((slot as? JsonObject)?.get("fixture"))
            }
        }
        addBracketFixture(tree.obj("thirdPlace", "third_place"))
    }
    for (fixture in unified) byId[fixture.id] = fixture
    return byId.values.sortedWith(compareBy({ it.timestamp ?: Long.MAX_VALUE }, { it.id }))
}

/// تجميع يوم بعيد حسب البطولة: 3 مباريات مميّزة + عدد المخفي.
/// أولوية الظهور: مباشر → متابَعة → فريق متابَع → سعودي → قادمة قبل المنتهية.
private fun mxCompetitionSlices(
    fixtures: List<Fixture>,
    followedIds: Set<Int>,
    teamIds: Set<Int>,
    saudiSlugs: Set<String>,
): List<MxCompSlice> {
    val order = mutableListOf<String>()
    val buckets = mutableMapOf<String, MutableList<Fixture>>()
    val names = mutableMapOf<String, String>()
    for (f in fixtures) {
        val key = f.competitionSlug.ifBlank { "_unknown" }
        if (key !in buckets) order.add(key)
        buckets.getOrPut(key) { mutableListOf() }.add(f)
        if (key !in names && f.competitionName.isNotBlank()) names[key] = f.competitionName
    }
    fun sliceRank(slug: String): Int {
        MxDefaultSlugs.indexOf(slug).takeIf { it >= 0 }?.let { return it }
        if (slug in saudiSlugs) return 100
        if (slug == "_unknown") return 9_999
        return 500
    }
    val sortedOrder = order.sortedWith(
        compareBy({ sliceRank(it) }, { key -> buckets[key]?.minOfOrNull { it.timestamp ?: Long.MAX_VALUE } ?: Long.MAX_VALUE }),
    )
    return sortedOrder.map { key ->
        val ranked = buckets[key]!!.sortedWith(
            compareBy<Fixture>(
                { if (it.status.live) 0 else 1 },
                { if (it.id in followedIds) 0 else 1 },
                { if (it.home.id in teamIds || it.away.id in teamIds) 0 else 1 },
                { if (it.competitionSlug in saudiSlugs) 0 else 1 },
                { if (it.status.finished) 1 else 0 },
                { it.timestamp ?: Long.MAX_VALUE },
                { it.id },
            ),
        )
        val featured = ranked.take(MxFeaturedPerComp)
        MxCompSlice(
            id = key,
            slug = key.takeIf { it != "_unknown" },
            name = names[key],
            featured = featured,
            hiddenCount = (ranked.size - featured.size).coerceAtLeast(0),
        )
    }
}

// MARK: — الشاشة

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MatchesScreen(nav: NavHostController, vm: VaraViewModel) {
    val c = LocalVaraColors.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val account by vm.account.collectAsState()
    val followedFixtures by vm.followedFixtures.collectAsState()

    // — الحالة
    var selection by remember { mutableStateOf(mxLoadSelection(context)) }
    var lensScope by remember {
        val s = mxLoadSelection(context)
        mutableStateOf(if (s == "all" || s.startsWith("lens:")) s else "all")
    }
    var favorites by remember { mutableStateOf(vm.preferences.favoriteCompetitionSlugs) }
    var registry by remember { mutableStateOf<List<Competition>>(emptyList()) }
    // لا نطلب الجدول قبل وصول سجل البطولات ومزامنة المفضّلة (نظير registryReady).
    var registryReady by remember { mutableStateOf(false) }
    var fixtures by remember { mutableStateOf<List<Fixture>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var refreshing by remember { mutableStateOf(false) }
    var loadError by remember { mutableStateOf<String?>(null) }
    var liveOnly by remember { mutableStateOf(false) }
    var showCompsManager by remember { mutableStateOf(false) }
    var showDatePicker by remember { mutableStateOf(false) }
    var scrolledDayId by remember { mutableStateOf<String?>(null) }
    var listStartsAtToday by remember { mutableStateOf(true) }
    var suppressRailUntil by remember { mutableLongStateOf(0L) }
    // طيّ الترويسة (عنوان + فلترة) مع تثبيت شريط الأيام — نظير SpCenterAutoCollapse.
    var headerHidden by remember { mutableStateOf(false) }
    var headerArmed by remember { mutableStateOf(false) }
    var headerSuppressUntil by remember { mutableLongStateOf(0L) }
    // جلبة جدول واحدة في كل لحظة — الطلبات المتزامنة كانت تتراكب فتضاعف الجلب.
    val loadInFlight = remember { AtomicBoolean(false) }

    // — المشتقّات
    val isMixed = selection == "all" || selection.startsWith("lens:")
    val todayDate = VaraFormat.today()
    val visibleDays = remember(fixtures, liveOnly) { mxMakeDays(fixtures, liveOnly) }
    val daySignature = visibleDays.joinToString("|") { it.id }
    val todayDayId = visibleDays.firstOrNull { it.date == todayDate }?.id
        ?: visibleDays.filter { it.date >= todayDate }.minByOrNull { it.date }?.id
        ?: visibleDays.lastOrNull()?.id.orEmpty()
    val todayHasMatches = visibleDays.any { it.date == todayDate }
    // قصّ الأيام السابقة حتى أول تفاعل (نظير daysForList).
    val daysForList = if (listStartsAtToday && todayDayId.isNotEmpty()) {
        val idx = visibleDays.indexOfFirst { it.id == todayDayId }
        if (idx > 0) visibleDays.subList(idx, visibleDays.size) else visibleDays
    } else visibleDays
    val myMatches = vm.visibleFollowedFixtures()
    val showMyMatches = myMatches.isNotEmpty()
    val leadingItems = if (showMyMatches) 1 else 0
    val followedIds = followedFixtures.map(Fixture::id).toSet()
    val teamFollowIds = account.follows.filter { it.kind == "team" }.mapNotNull { it.refId.toIntOrNull() }.toSet()
    val saudiSlugs = remember(registry) { MxSaudiSlugs + registry.filter { it.category == "saudi" }.map { it.slug } }

    /// شرائح البطولات = المفضّلة ضمن نطاق العدسة، مرتّبة بالفئة (السعودية أولًا).
    /// الكؤوس/البطولات المنتهية تسقط تلقائيًّا (المونديال بعد النهائي).
    val chipComps = registry
        .filter { it.slug in favorites && it.status != "finished" }
        .let { base ->
            when {
                lensScope == "lens:important" -> base.filter { it.slug in MxDefaultSlugs }
                lensScope.startsWith("lens:category:") -> {
                    val category = lensScope.removePrefix("lens:category:")
                    base.filter { it.category == category }
                }
                else -> base
            }
        }
        .sortedWith(compareBy({ mxCategoryRank(it.category) }, { it.name }))

    // شريط الأدوار — عند فلترة بطولة إقصائية واحدة بتعدد أدوار.
    val singleCupRounds = if (isMixed) emptyList() else {
        val rounds = visibleDays.mapNotNull { d -> d.round.takeIf(String::isNotBlank) }.distinct()
        // دوريات الجولات («الجولة 12») ليست أدوارًا إقصائية — لا شريط لها.
        if (rounds.all { it.startsWith("الجولة") }) emptyList() else rounds
    }
    val activeRound = visibleDays.firstOrNull { it.id == scrolledDayId }?.round

    val listState = rememberLazyListState()
    val railState = rememberLazyListState()
    val density = LocalDensity.current
    val nearTopPx = remember(density) { with(density) { 24.dp.toPx() } }
    val deepScrollPx = remember(density) { with(density) { 90.dp.toPx() } }
    fun mxSetHeaderHidden(hidden: Boolean) {
        if (headerHidden == hidden) return
        headerSuppressUntil = System.currentTimeMillis() + 400
        headerHidden = hidden
    }
    fun mxApproxScrollY(): Float {
        return if (listState.firstVisibleItemIndex == 0) {
            listState.firstVisibleItemScrollOffset.toFloat()
        } else {
            deepScrollPx + 1f
        }
    }
    val headerCollapseScroll = remember(nearTopPx, deepScrollPx) {
        object : NestedScrollConnection {
            override fun onPostScroll(
                consumed: Offset,
                available: Offset,
                source: NestedScrollSource,
            ): Offset {
                if (!headerArmed || System.currentTimeMillis() < headerSuppressUntil) return Offset.Zero
                // consumed.y سالب عند تمرير المحتوى للأعلى (قراءة) → delta موجب كـ iOS.
                val delta = -consumed.y
                val y = mxApproxScrollY()
                when {
                    y < nearTopPx -> mxSetHeaderHidden(false)
                    delta > 8f && y > deepScrollPx -> mxSetHeaderHidden(true)
                    delta < -8f -> mxSetHeaderHidden(false)
                }
                return Offset.Zero
            }
        }
    }

    // — دوال محلية

    /// ترجمة العدسة/الاختيار إلى slugs (نظير effectiveCompetitionSlugs).
    fun mxEffectiveSlugs(): List<String> = when {
        selection == "all" -> {
            val available = registry.filter { it.slug in favorites }.map { it.slug }
            if (available.isEmpty()) favorites.sorted() else available
        }
        selection == "lens:important" -> favorites.filter { it in MxDefaultSlugs }.sorted()
        selection.startsWith("lens:category:") -> {
            val category = selection.removePrefix("lens:category:")
            registry.filter { it.slug in favorites && it.category == category }.map { it.slug }
        }
        else -> listOf(selection)
    }

    /// جلبة كاملة: تجزئة الدفعات + دمج المونديال + بصمة مرئية. الفشل لا يمحو المعروض.
    suspend fun performLoad(force: Boolean) {
        // اختيار يتيم (بطولة أُزيلت من المفضّلة) → عودة لـ«الكل».
        if (selection != "all" && !selection.startsWith("lens:") && favorites.isNotEmpty() && selection !in favorites) {
            selection = "all"
            mxSaveSelection(context, "all")
            return // تغيّر reloadKey سيعيد التحميل بالاختيار الجديد
        }
        val comps = mxEffectiveSlugs()
        if (comps.isEmpty()) {
            // سلة فارغة = لا طلب — حالة «اختر بطولاتك» تُعرض في الجسم.
            fixtures = emptyList()
            loadError = null
            return
        }
        if (!force && fixtures.isEmpty()) loading = true
        // تُحسب لحظيًّا (لا من التقاط التركيب) — نداءات الاستطلاع تعيش أطول من التركيب الأول.
        val today = VaraFormat.today()
        val mixedNow = selection == "all" || selection.startsWith("lens:")
        val from = today.minusDays(7).toString()
        val span = if (mixedNow) 60L else 120L
        val to = today.plusDays(span).toString()
        val result = runCatching {
            coroutineScope {
                // حد الخادم 8 بطولات لكل طلب — تجزئة بالتوازي ثم دمج وترتيب.
                val parts = comps.chunked(8).map { chunk ->
                    async {
                        val root = vm.api.publicGet(
                            "/sports/fixtures",
                            mapOf("comps" to chunk.joinToString(","), "from" to from, "to" to to),
                            ignoreCache = force,
                        )
                        findArray(root, "fixtures", "matches", "items").mapNotNull(::parseFixture)
                    }
                }
                val bracket = if ("world-cup" in comps) {
                    async { runCatching { vm.api.publicGet("/world-cup/bracket", ignoreCache = force) }.getOrNull() }
                } else null
                mxMergeWorldCupBracket(bracket?.await(), parts.flatMap { it.await() })
            }
        }
        result.onSuccess { merged ->
            if (mxSignature(merged) != mxSignature(fixtures)) fixtures = merged
            vm.updateFollowedSnapshots(merged)
            loadError = null
        }.onFailure { error ->
            if (error is CancellationException) throw error
            if (fixtures.isEmpty()) loadError = error.message ?: "تعذّر الاتصال بخادم البيانات"
        }
    }

    /// منسّق التحميل: لا جلبة تتراكب فوق جارية — الطلب الوارد ينتظر خلوّ المضمار.
    suspend fun mxLoad(force: Boolean) {
        while (!loadInFlight.compareAndSet(false, true)) delay(100)
        try {
            performLoad(force)
        } finally {
            loadInFlight.set(false)
            loading = false
        }
    }

    fun mxGoToDay(id: String) {
        if (id.isEmpty()) return
        scope.launch {
            suppressRailUntil = System.currentTimeMillis() + 700
            scrolledDayId = id
            if (headerHidden) headerHidden = false
            headerArmed = false
            var days = daysForList
            if (days.none { it.id == id }) {
                listStartsAtToday = false
                days = visibleDays
                delay(60) // فرصة لإعادة بناء القائمة بالفهارس الجديدة
            }
            val idx = days.indexOfFirst { it.id == id }
            if (idx >= 0) runCatching { listState.animateScrollToItem(idx + leadingItems) }
            delay(500)
            headerArmed = true
        }
    }

    fun mxFirstDayIdForRound(round: String): String? {
        // يُفضَّل اليوم/القادم لا أقدم يوم تاريخيًّا.
        val days = visibleDays.filter { it.round == round }
        return (
            days.firstOrNull { d -> d.date >= todayDate || d.fixtures.any { it.status.live || !it.status.finished } }
                ?: days.firstOrNull()
            )?.id
    }

    fun mxToggleFollow(fx: Fixture) {
        val following = fx.id in followedIds
        if (following) vm.unfollowMatch(fx) else vm.followMatch(fx)
        MatchReminderScheduler.sync(context, fx, !following)
    }

    // — التأثيرات

    // سجل البطولات عند الفتح: مزامنة المفضّلة (حذف المسحوبة) قبل أول طلب جدول.
    LaunchedEffect(Unit) {
        runCatching { findArray(vm.api.publicGet("/sports/competitions"), "competitions", "items").mapNotNull(::parseCompetition) }
            .onSuccess { comps ->
                registry = comps
                if (comps.isNotEmpty()) {
                    val slugs = comps.map { it.slug }.toSet()
                    val synced = favorites.filter { it in slugs }.toSet()
                    if (synced != favorites) {
                        favorites = synced
                        vm.preferences.favoriteCompetitionSlugs = synced
                    }
                    if (selection != "all" && !selection.startsWith("lens:") && selection !in synced) {
                        selection = "all"
                        mxSaveSelection(context, "all")
                    }
                }
            }
        registryReady = true
    }

    // إعادة التحميل مع كل تغيير فلتر أو تعديل للمفضّلة (المهمة السابقة تُلغى).
    val reloadKey = "$registryReady|$selection|${favorites.sorted().joinToString(",")}"
    LaunchedEffect(reloadKey) {
        if (!registryReady) return@LaunchedEffect
        mxLoad(force = false)
    }

    // الاستطلاع المتكيّف: 10ث مباشر / 30ث قرب الانطلاق / 45ث خامل — بالمقدمة فقط،
    // وignoreCache فقط عند live/near-kickoff. أول نداء عند كل عودة للمقدمة = تحديث فوري.
    PollEffect(
        delayProvider = { adaptivePollDelayMs(fixtures) },
        onTick = { first ->
            if (first) {
                if (registryReady && fixtures.isNotEmpty()) mxLoad(force = true)
            } else if (registryReady) {
                val now = System.currentTimeMillis()
                val hasLive = fixtures.any { it.status.live }
                val nearKickoff = fixtures.any { fx ->
                    val k = fx.kickoffMs ?: return@any false
                    !fx.status.finished && !fx.status.live && k - now <= 30 * 60_000L && now - k <= 3 * 3_600_000L
                }
                mxLoad(force = hasLive || nearKickoff)
            }
        },
    )

    // التمرير الأولي لليوم + إبقاء الاختيار عند التحديثات الحية (نظير rebuildDays).
    LaunchedEffect(daySignature) {
        if (visibleDays.isEmpty()) {
            scrolledDayId = null
            return@LaunchedEffect
        }
        if (scrolledDayId != null && visibleDays.any { it.id == scrolledDayId }) return@LaunchedEffect
        listStartsAtToday = true
        scrolledDayId = todayDayId.ifEmpty { null }
        headerHidden = false
        headerArmed = false
        runCatching { listState.scrollToItem(0) }
        delay(350)
        headerArmed = true
    }

    // اتجاه ١: تمرير القائمة يحدّث شريحة اليوم النشطة.
    LaunchedEffect(daySignature, listStartsAtToday, leadingItems) {
        snapshotFlow { listState.firstVisibleItemIndex }.collect { raw ->
            if (System.currentTimeMillis() < suppressRailUntil) return@collect
            val day = daysForList.getOrNull((raw - leadingItems).coerceAtLeast(0)) ?: return@collect
            if (scrolledDayId != day.id) scrolledDayId = day.id
        }
    }

    // اتجاه ٢: تغيّر اليوم النشط يوسّط شريحته في شريط الأيام (المعكوس في RTL).
    val railDays = if (account.language == "en") visibleDays else visibleDays.reversed()
    LaunchedEffect(scrolledDayId, daySignature, account.language) {
        val id = scrolledDayId ?: return@LaunchedEffect
        val idx = railDays.indexOfFirst { it.id == id }
        if (idx >= 0) runCatching { railState.animateScrollToItem((idx - 2).coerceAtLeast(0)) }
    }

    // — الواجهة

    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(c.screenTop, c.screenBottom)))) {
        Column(Modifier.fillMaxSize()) {
            // الترويسة: العنوان والفلترة يُطويان عند التمرير؛ شريط الأيام يبقى مثبّتًا.
            Column(Modifier.fillMaxWidth().background(c.screenTop)) {
                AnimatedVisibility(
                    visible = !headerHidden,
                    enter = expandVertically(tween(250)) + fadeIn(tween(250)),
                    exit = shrinkVertically(tween(250)) + fadeOut(tween(250)),
                ) {
                    Column(Modifier.fillMaxWidth()) {
                        MxToolbar(
                            liveOnly = liveOnly,
                            onToggleLive = { liveOnly = !liveOnly },
                            onManage = { showCompsManager = true },
                            onCalendar = { showDatePicker = true },
                            loggedIn = account.loggedIn,
                            memberName = account.member?.name.orEmpty(),
                            memberAvatar = account.member?.avatar.orEmpty(),
                            onAccount = { nav.navigate(if (account.loggedIn) Routes.Account else Routes.Login) },
                        )
                        Spacer(Modifier.height(10.dp))
                        MxCompsStrip(
                            lensScope = lensScope,
                            selection = selection,
                            chips = chipComps,
                            onLens = { key ->
                                lensScope = key
                                selection = key
                                mxSaveSelection(context, key)
                            },
                            onChip = { slug ->
                                // إعادة الضغط على البطولة النشطة تزيل الفلتر وترجع لنطاق العدسة.
                                val newSelection = if (selection == slug) lensScope else slug
                                selection = newSelection
                                mxSaveSelection(context, newSelection)
                            },
                        )
                        if (singleCupRounds.size > 1) {
                            Spacer(Modifier.height(8.dp))
                            MxRoundStrip(
                                rounds = singleCupRounds,
                                activeRound = activeRound,
                                onPick = { round -> mxFirstDayIdForRound(round)?.let(::mxGoToDay) },
                            )
                        }
                    }
                }
                if (visibleDays.isNotEmpty()) {
                    Spacer(Modifier.height(8.dp))
                    MxDateRail(
                        railDays = railDays,
                        railState = railState,
                        activeId = scrolledDayId,
                        todayDate = todayDate,
                        onPick = ::mxGoToDay,
                    )
                }
                VaraDivider()
            }

            Box(Modifier.weight(1f)) {
                when {
                    loading && fixtures.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = c.accent)
                    }
                    loadError != null && fixtures.isEmpty() -> MxErrorState(loadError.orEmpty()) {
                        scope.launch { mxLoad(force = false) }
                    }
                    else -> VaraPullRefresh(
                        refreshing = refreshing,
                        onRefresh = {
                            scope.launch {
                                refreshing = true
                                mxLoad(force = true)
                                refreshing = false
                            }
                        },
                        modifier = Modifier.fillMaxSize(),
                    ) {
                        LazyColumn(
                            state = listState,
                            modifier = Modifier
                                .fillMaxSize()
                                .nestedScroll(headerCollapseScroll),
                            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 140.dp),
                            verticalArrangement = Arrangement.spacedBy(16.dp),
                        ) {
                            // بلوك «مبارياتي» — يختفي كليًّا بلا متابعات.
                            if (showMyMatches) item(key = "my-matches") {
                                MxMyMatchesCard(
                                    fixtures = myMatches,
                                    loggedIn = account.loggedIn,
                                    followedIds = followedIds,
                                    onOpen = { nav.navigate("match/${it.id}") },
                                    onToggleFollow = ::mxToggleFollow,
                                    onLogin = { nav.navigate(Routes.Login) },
                                )
                            }
                            if (daysForList.isEmpty()) {
                                item(key = "empty") {
                                    MxEmptyList(
                                        noFavorites = selection == "all" && favorites.isEmpty(),
                                        liveOnly = liveOnly,
                                    )
                                }
                            } else {
                                items(daysForList, key = { it.id }) { day ->
                                    MxDaySection(
                                        day = day,
                                        isMixed = isMixed,
                                        collapse = !liveOnly && day.date >= todayDate.plusDays(2),
                                        followedIds = followedIds,
                                        teamFollowIds = teamFollowIds,
                                        saudiSlugs = saudiSlugs,
                                        onOpenMatch = { nav.navigate("match/$it") },
                                        onOpenCompetition = { slug -> nav.navigate("competition/$slug/matches") },
                                        onToggleFollow = ::mxToggleFollow,
                                    )
                                }
                            }
                        }
                    }
                }

                // زر «مباريات اليوم/الأقرب» العائم عند الابتعاد عن اليوم.
                if (visibleDays.isNotEmpty() && todayDayId.isNotEmpty() && scrolledDayId != null && scrolledDayId != todayDayId) {
                    Row(
                        Modifier
                            .align(Alignment.BottomCenter)
                            .padding(bottom = 14.dp)
                            .clip(CircleShape)
                            .background(c.accent)
                            .border(1.dp, Color.White.copy(alpha = .15f), CircleShape)
                            .clickable { mxGoToDay(todayDayId) }
                            .padding(horizontal = 16.dp, vertical = 11.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            if (todayHasMatches) "مباريات اليوم" else "الأقرب",
                            color = Color.White,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }
            }
        }
    }

    // — ورقة إعداد البطولات
    if (showCompsManager) {
        MxCompsManagerSheet(
            registry = registry,
            favorites = favorites,
            onDismiss = { showCompsManager = false },
            onToggle = { slug, on ->
                val next = if (on) favorites + slug else favorites - slug
                favorites = next
                vm.preferences.favoriteCompetitionSlugs = next
            },
            onSelectAll = {
                val next = registry.map { it.slug }.toSet()
                favorites = next
                vm.preferences.favoriteCompetitionSlugs = next
            },
            onClearAll = {
                favorites = emptySet()
                vm.preferences.favoriteCompetitionSlugs = emptySet()
            },
        )
    }

    // — ورقة اختيار التاريخ (مقيّدة بنطاق الجدول، تنتقل لأقرب يوم)
    if (showDatePicker && visibleDays.isNotEmpty()) {
        val lo = visibleDays.first().date
        val hi = visibleDays.last().date
        val initial = (visibleDays.firstOrNull { it.id == scrolledDayId } ?: visibleDays.firstOrNull { it.id == todayDayId })?.date
            ?: todayDate
        val pickerState = rememberDatePickerState(
            initialSelectedDateMillis = initial.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
            selectableDates = object : SelectableDates {
                override fun isSelectableDate(utcTimeMillis: Long): Boolean {
                    val d = Instant.ofEpochMilli(utcTimeMillis).atZone(ZoneOffset.UTC).toLocalDate()
                    return !d.isBefore(lo) && !d.isAfter(hi)
                }
            },
        )
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton({
                    val millis = pickerState.selectedDateMillis
                    showDatePicker = false
                    if (millis != null) {
                        val picked = Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate()
                        visibleDays.minByOrNull { kotlin.math.abs(it.date.toEpochDay() - picked.toEpochDay()) }
                            ?.let { mxGoToDay(it.id) }
                    }
                }) { Text("اذهب", color = c.accent, fontWeight = FontWeight.Bold) }
            },
            dismissButton = { TextButton({ showDatePicker = false }) { Text("إلغاء", color = c.textDim) } },
        ) { DatePicker(pickerState, showModeToggle = false, title = { Text("اذهب إلى تاريخ", Modifier.padding(start = 24.dp, top = 16.dp), color = c.text) }) }
    } else if (showDatePicker) {
        showDatePicker = false
    }
}

// MARK: — الترويسة

@Composable
private fun MxToolbar(
    liveOnly: Boolean,
    onToggleLive: () -> Unit,
    onManage: () -> Unit,
    onCalendar: () -> Unit,
    loggedIn: Boolean,
    memberName: String,
    memberAvatar: String,
    onAccount: () -> Unit,
) {
    val c = LocalVaraColors.current
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Default.SportsSoccer, null, tint = c.accent, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(8.dp))
        Text("المباريات", color = c.text, fontSize = 22.sp, fontWeight = FontWeight.Bold, maxLines = 1)
        Spacer(Modifier.weight(1f))
        // أزرار الترويسة أيقونات عارية بلا صناديق (chrome أخف).
        IconButton(onManage, Modifier.size(34.dp)) {
            Icon(Icons.Default.Tune, "اختيار البطولات", tint = c.textDim, modifier = Modifier.size(19.dp))
        }
        IconButton(onCalendar, Modifier.size(34.dp)) {
            Icon(Icons.Default.CalendarMonth, "اختيار التاريخ", tint = c.textDim, modifier = Modifier.size(19.dp))
        }
        // زر «مباشر» — نقطة + نص بلا كبسولة؛ القرمزي لمسة الحالة النشطة فقط.
        Row(
            Modifier
                .clip(CircleShape)
                .clickable(onClick = onToggleLive)
                .padding(horizontal = 8.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Box(Modifier.size(7.dp).clip(CircleShape).background(if (liveOnly) c.live else c.textFaint))
            Text("مباشر", color = if (liveOnly) c.live else c.textDim, fontSize = 13.sp, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.width(4.dp))
        MxAccountChip(loggedIn, memberName, memberAvatar, onAccount)
    }
}

/// مؤشّر الحساب: ضيف = «دخول» ذهبية تفتح الدخول؛ عضو = أفتار + نقطة خضراء يفتح «حسابي».
@Composable
private fun MxAccountChip(loggedIn: Boolean, memberName: String, memberAvatar: String, onClick: () -> Unit) {
    val c = LocalVaraColors.current
    if (loggedIn) {
        Box(
            Modifier.size(34.dp).clip(CircleShape).clickable(onClick = onClick),
            contentAlignment = Alignment.Center,
        ) {
            if (memberAvatar.isNotBlank()) {
                AsyncImage(
                    model = memberAvatar,
                    contentDescription = "حسابي",
                    modifier = Modifier
                        .size(28.dp)
                        .clip(CircleShape)
                        .border(1.dp, Color(0xFF26C780).copy(alpha = .5f), CircleShape),
                )
            } else {
                Box(Modifier.size(28.dp).clip(CircleShape).background(c.accent), contentAlignment = Alignment.Center) {
                    Text(
                        memberName.trim().takeIf { it.isNotEmpty() }?.take(1) ?: "؟",
                        color = Color.White,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
            Box(
                Modifier
                    .align(Alignment.BottomEnd)
                    .size(9.dp)
                    .clip(CircleShape)
                    .background(Color(0xFF26C780))
                    .border(2.dp, c.surface, CircleShape),
            )
        }
    } else {
        Row(
            Modifier
                .height(34.dp)
                .clip(CircleShape)
                .background(c.gold)
                .clickable(onClick = onClick)
                .padding(horizontal = 11.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(5.dp),
        ) {
            Icon(Icons.Default.Person, null, tint = Color(0xFF1C1405), modifier = Modifier.size(14.dp))
            Text("دخول", color = Color(0xFF1C1405), fontSize = 13.sp, fontWeight = FontWeight.Bold)
        }
    }
}

/// صفّ فلترة واحد: حبّة «العدسة» تتصدّره، يليها فاصل رفيع ثم شرائح البطولات
/// ضمن النطاق — العدسة = النطاق، الشرائح = التنقّل داخله.
@Composable
private fun MxCompsStrip(
    lensScope: String,
    selection: String,
    chips: List<Competition>,
    onLens: (String) -> Unit,
    onChip: (String) -> Unit,
) {
    val c = LocalVaraColors.current
    Row(
        Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        MxLensPill(lensScope = lensScope, isActive = selection == lensScope, onLens = onLens)
        Box(Modifier.width(1.dp).height(20.dp).background(c.outline))
        chips.forEach { comp ->
            val active = selection == comp.slug
            Row(
                Modifier
                    .clip(CircleShape)
                    .background(if (active) c.accent.copy(alpha = .10f) else c.chip)
                    .border(1.dp, if (active) c.accent.copy(alpha = .55f) else c.outline, CircleShape)
                    .clickable { onChip(comp.slug) }
                    .padding(horizontal = 12.dp, vertical = 7.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                if (comp.logo.isNotBlank()) AsyncImage(comp.logo, comp.name, Modifier.size(16.dp))
                Text(
                    mxShortName(comp.name),
                    color = if (active) c.accent else c.textDim,
                    fontSize = 12.5.sp,
                    fontWeight = if (active) FontWeight.Bold else FontWeight.SemiBold,
                    maxLines = 1,
                )
            }
        }
    }
}

@Composable
private fun MxLensPill(lensScope: String, isActive: Boolean, onLens: (String) -> Unit) {
    val c = LocalVaraColors.current
    var menuOpen by remember { mutableStateOf(false) }
    val activeLens = MxLenses.firstOrNull { it.key == lensScope } ?: MxLenses[0]
    Box {
        // الحبّة مملوءة عندما يكون العرض على نطاق العدسة نفسه؛ محيطة عند التعمّق في بطولة.
        val fg = if (isActive) Color.White else c.accent
        Row(
            Modifier
                .clip(CircleShape)
                .background(if (isActive) c.accent else c.accent.copy(alpha = .10f))
                .border(1.dp, if (isActive) Color.Transparent else c.accent.copy(alpha = .35f), CircleShape)
                .clickable { menuOpen = true }
                .padding(horizontal = 12.dp, vertical = 7.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Icon(activeLens.icon, null, tint = fg, modifier = Modifier.size(12.dp))
            Text(activeLens.title, color = fg, fontSize = 12.5.sp, fontWeight = FontWeight.Bold, maxLines = 1)
            Icon(Icons.Default.KeyboardArrowDown, null, tint = fg, modifier = Modifier.size(13.dp))
        }
        DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
            MxLenses.forEach { lens ->
                DropdownMenuItem(
                    text = { Text(lens.title, color = c.text) },
                    leadingIcon = { Icon(lens.icon, null, tint = if (lens.key == lensScope) c.accent else c.textDim) },
                    onClick = {
                        menuOpen = false
                        onLens(lens.key)
                    },
                )
            }
        }
    }
}

/// شريط الأدوار — شرائح بأسماء الأدوار المعرَّبة تقفز لأول يوم في الدور.
@Composable
private fun MxRoundStrip(rounds: List<String>, activeRound: String?, onPick: (String) -> Unit) {
    val c = LocalVaraColors.current
    Row(
        Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        rounds.forEach { round ->
            val active = activeRound == round
            Text(
                round,
                color = if (active) c.accent else c.textDim,
                fontSize = 12.5.sp,
                fontWeight = if (active) FontWeight.Bold else FontWeight.SemiBold,
                modifier = Modifier
                    .clip(CircleShape)
                    .background(if (active) c.accent.copy(alpha = .10f) else Color.Transparent)
                    .border(1.dp, if (active) c.accent.copy(alpha = .55f) else c.outline, CircleShape)
                    .clickable { onPick(round) }
                    .padding(horizontal = 12.dp, vertical = 6.dp),
            )
        }
    }
}

// شريط التواريخ المتزامن — الحاوية LTR داخليًّا والمصفوفة معكوسة يدويًّا
// (علاج فساد إزاحة RTL الموثّق في iOS — لا تغيّره).
@Composable
private fun MxDateRail(
    railDays: List<MxDay>,
    railState: androidx.compose.foundation.lazy.LazyListState,
    activeId: String?,
    todayDate: LocalDate,
    onPick: (String) -> Unit,
) {
    ForceLtr {
        LazyRow(
            state = railState,
            contentPadding = PaddingValues(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
        ) {
            items(railDays, key = { it.id }) { day ->
                MxDateChip(
                    day = day,
                    active = activeId == day.id,
                    isToday = day.date == todayDate,
                    onClick = { onPick(day.id) },
                )
            }
        }
    }
}

@Composable
private fun MxDateChip(day: MxDay, active: Boolean, isToday: Boolean, onClick: () -> Unit) {
    val c = LocalVaraColors.current
    val hasLive = day.fixtures.any { it.status.live }
    val instant = day.date.atStartOfDay(VaraFormat.riyadh).toInstant()
    // الشريط الأب ForceLtr (ترتيب زمني أيسر→أيمن). نفصل اليوم/الشهر ونرتّبهما
    // بصريًا: الشهر يسارًا والرقم يمينًا — القراءة العربية الطبيعية («13 أغسطس»).
    Column(
        Modifier
            .widthIn(min = 88.dp)
            .clip(VaraChipShape)
            .background(if (active) c.accent.copy(alpha = .07f) else c.chip)
            .border(1.dp, if (active) c.accent.copy(alpha = .55f) else c.outline, VaraChipShape)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            // نقطة قرمزية للأيام التي فيها مباراة مباشرة.
            if (hasLive) Box(Modifier.size(5.dp).clip(CircleShape).background(c.live))
            Text(
                if (isToday) "اليوم" else VaraFormat.weekdayName(instant),
                color = if (active) c.accent else c.textDim,
                fontSize = 10.5.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
            )
        }
        Spacer(Modifier.height(4.dp))
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                VaraFormat.monthName(instant),
                color = if (active) c.accent else c.text,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
            )
            Text(
                VaraFormat.dayOfMonth(instant),
                color = if (active) c.accent else c.text,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
            )
        }
    }
}

// MARK: — الجسم

@Composable
private fun MxDaySection(
    day: MxDay,
    isMixed: Boolean,
    collapse: Boolean,
    followedIds: Set<Int>,
    teamFollowIds: Set<Int>,
    saudiSlugs: Set<String>,
    onOpenMatch: (Int) -> Unit,
    onOpenCompetition: (String) -> Unit,
    onToggleFollow: (Fixture) -> Unit,
) {
    val c = LocalVaraColors.current
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        // رأس اليوم بنفس خلفية ترويسة التاريخ في تفاصيل البطولة.
        DateSectionBanner(
            label = VaraFormat.dateLabel(day.date),
            count = day.fixtures.size,
            subtitle = if (!isMixed && day.round.isNotBlank()) day.round else null,
            modifier = Modifier.padding(top = 4.dp),
        )
        if (collapse) {
            // اليوم البعيد: تجميع بالبطولة + أفضل 3 + «بقية المباريات».
            val slices = mxCompetitionSlices(day.fixtures, followedIds, teamFollowIds, saudiSlugs)
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                slices.forEach { slice ->
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        if (isMixed && !slice.name.isNullOrBlank()) {
                            Text(
                                slice.name,
                                color = c.accent,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(horizontal = 4.dp),
                            )
                        }
                        MxMatchGroup(slice.featured, showCompetition = false, followedIds, onOpenMatch, onToggleFollow)
                        if (slice.hiddenCount > 0 && slice.slug != null) {
                            MxRestMatchesButton(slice.hiddenCount) { onOpenCompetition(slice.slug) }
                        } else if (slice.hiddenCount > 0) {
                            // لا سجل بطولة — لا رابط؛ نُبقي التلميح فقط (نادر).
                            MxRestMatchesLabel(slice.hiddenCount, dim = true)
                        }
                    }
                }
            }
        } else {
            MxMatchGroup(day.fixtures, showCompetition = isMixed, followedIds, onOpenMatch, onToggleFollow)
        }
    }
}

/// صفوف اليوم مسطحة داخل حاوية واحدة بفواصل — لا بطاقات مستقلة.
@Composable
private fun MxMatchGroup(
    fixtures: List<Fixture>,
    showCompetition: Boolean,
    followedIds: Set<Int>,
    onOpenMatch: (Int) -> Unit,
    onToggleFollow: (Fixture) -> Unit,
) {
    val c = LocalVaraColors.current
    Column(
        Modifier
            .fillMaxWidth()
            .clip(VaraTileShape)
            .background(c.surface)
            .border(1.dp, c.outline.copy(alpha = if (c.dark) 0f else .7f), VaraTileShape),
    ) {
        fixtures.forEachIndexed { index, fx ->
            MxMatchRow(
                fx = fx,
                showCompetition = showCompetition,
                following = fx.id in followedIds,
                onToggleFollow = { onToggleFollow(fx) },
                onOpen = { onOpenMatch(fx.id) },
            )
            if (index < fixtures.lastIndex) {
                Box(Modifier.padding(horizontal = 10.dp)) { VaraDivider() }
            }
        }
    }
}

/// صفّ مباراة المركز: نجمة متابعة + المضيف يمينًا + المركز (نتيجة/وقت) + الضيف،
/// وشارة بطولة صغيرة تحت الوقت في الوضع المختلط. النقر يفتح مركز المباراة.
@Composable
private fun MxMatchRow(
    fx: Fixture,
    showCompetition: Boolean,
    following: Boolean,
    onToggleFollow: () -> Unit,
    onOpen: () -> Unit,
) {
    val c = LocalVaraColors.current
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(onClick = onOpen)
            .padding(horizontal = 8.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onToggleFollow, Modifier.size(24.dp)) {
            Icon(
                if (following) Icons.Default.Star else Icons.Default.StarBorder,
                contentDescription = if (following) "إلغاء متابعة المباراة" else "متابعة المباراة",
                tint = if (following) c.gold else c.textFaint,
                modifier = Modifier.size(16.dp),
            )
        }
        Spacer(Modifier.width(4.dp))
        MxTeamCell(fx.home.name, fx.home.logo, Modifier.weight(1f), reverse = false)
        MxRowCenter(fx, showCompetition)
        MxTeamCell(fx.away.name, fx.away.logo, Modifier.weight(1f), reverse = true)
    }
}

/// خلية فريق في صف المواجهة — نفس ترتيب «عالمية»/iOS: الشعار ملاصق للمركز،
/// والاسم يملأ الطرف (المضيف: اسم←شعار، الضيف: شعار←اسم).
@Composable
private fun MxTeamCell(name: String, logo: String, modifier: Modifier, reverse: Boolean) {
    val c = LocalVaraColors.current
    Row(
        modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        if (reverse) {
            // الضيف (يسار في RTL): شعار نحو المركز ثم الاسم.
            RemoteLogo(logo, name, 30)
            TeamLabel(
                name = name,
                color = c.text,
                fontSize = 12.5.sp,
                maxLines = 2,
                textAlign = TextAlign.Start,
                modifier = Modifier.weight(1f),
            )
        } else {
            // المضيف (يمين في RTL): الاسم ثم شعار نحو المركز.
            TeamLabel(
                name = name,
                color = c.text,
                fontSize = 12.5.sp,
                maxLines = 2,
                textAlign = TextAlign.End,
                modifier = Modifier.weight(1f),
            )
            RemoteLogo(logo, name, 30)
        }
    }
}

/// العمود المركزي: نتيجة (بالضيف أولًا داخل LTR كي يبقى المضيف يمينًا في RTL)
/// أو وقت الانطلاق، مع الدقيقة الحية/الترجيح/ليبل المؤجلة وشارة البطولة.
@Composable
private fun MxRowCenter(fx: Fixture, showCompetition: Boolean) {
    val c = LocalVaraColors.current
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.widthIn(min = 52.dp, max = 72.dp).padding(horizontal = 4.dp),
    ) {
        when {
            fx.status.live || fx.status.finished -> {
                ForceLtr {
                    Text(
                        "${latinNumber(fx.awayScore)} - ${latinNumber(fx.homeScore)}",
                        color = c.text,
                        fontSize = 17.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }
                if (fx.hasPenalties || fx.shootoutLive) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                        Text("ترجيح", color = c.textDim, fontSize = 9.sp, fontWeight = FontWeight.Bold)
                        ForceLtr {
                            Text(
                                "${latinNumber(fx.penAway)} - ${latinNumber(fx.penHome)}",
                                color = if (fx.shootoutLive) c.live else c.textDim,
                                fontSize = 9.sp,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                    }
                }
                if (fx.status.live) {
                    LiveMinuteText(fx.status, c.live, 10)
                } else {
                    Text("انتهت", color = c.textDim, fontSize = 9.sp, fontWeight = FontWeight.SemiBold)
                }
            }
            else -> {
                val instant = VaraFormat.instantOf(fx)
                ForceLtr {
                    Text(
                        VaraFormat.time(instant).ifBlank { "--:--" },
                        color = c.text,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }
                // مؤجلة/ملغاة وغيرها: ليبل الخادم بدل «قادمة» المضللة.
                val codeUpper = fx.status.code.uppercase()
                if (codeUpper !in setOf("NS", "TBD") && fx.status.label.isNotBlank() && fx.status.label != fx.status.code) {
                    Text(fx.status.label, color = c.textDim, fontSize = 9.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                }
            }
        }
        if (showCompetition && fx.competitionName.isNotBlank()) {
            Text(
                fx.competitionName,
                color = c.textFaint,
                fontSize = 9.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.widthIn(max = 96.dp),
            )
        }
    }
}

@Composable
private fun MxRestMatchesButton(count: Int, onClick: () -> Unit) {
    val c = LocalVaraColors.current
    Row(
        Modifier
            .fillMaxWidth()
            .clip(VaraChipShape)
            .background(c.accent.copy(alpha = .10f))
            .border(1.dp, c.accent.copy(alpha = .25f), VaraChipShape)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text("بقية المباريات ($count)", color = c.accent, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        Icon(Icons.Default.ChevronLeft, null, tint = c.accent, modifier = Modifier.size(14.dp))
        Spacer(Modifier.weight(1f))
    }
}

@Composable
private fun MxRestMatchesLabel(count: Int, dim: Boolean) {
    val c = LocalVaraColors.current
    Text(
        "بقية المباريات ($count)",
        color = c.accent.copy(alpha = if (dim) .7f else 1f),
        fontSize = 12.sp,
        fontWeight = FontWeight.Bold,
        modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
    )
}

// MARK: — بلوك «مبارياتي»

@Composable
private fun MxMyMatchesCard(
    fixtures: List<Fixture>,
    loggedIn: Boolean,
    followedIds: Set<Int>,
    onOpen: (Fixture) -> Unit,
    onToggleFollow: (Fixture) -> Unit,
    onLogin: () -> Unit,
) {
    val c = LocalVaraColors.current
    VaraCard(Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.Star, null, tint = c.gold, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(7.dp))
            Text("مبارياتي", color = c.text, fontSize = 16.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.weight(1f))
            Text(
                "${fixtures.size}",
                color = c.gold,
                fontWeight = FontWeight.Bold,
                fontSize = 12.sp,
                modifier = Modifier.clip(CircleShape).background(c.gold.copy(alpha = .14f)).padding(horizontal = 9.dp, vertical = 3.dp),
            )
        }
        Spacer(Modifier.height(4.dp))
        fixtures.forEachIndexed { index, fx ->
            Column {
                MxMatchRow(
                    fx = fx,
                    showCompetition = true,
                    following = fx.id in followedIds,
                    onToggleFollow = { onToggleFollow(fx) },
                    onOpen = { onOpen(fx) },
                )
                // عدّاد تنازلي حيّ للمباريات القريبة (≤ ساعتين قبل الانطلاق).
                val kickoff = fx.kickoffMs
                if (kickoff != null && !fx.started && (kickoff - System.currentTimeMillis()) in 1..7_200_000L) {
                    Row(
                        Modifier.fillMaxWidth().padding(bottom = 8.dp),
                        horizontalArrangement = Arrangement.Center,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text("تنطلق بعد", color = c.textDim, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
                        Spacer(Modifier.width(6.dp))
                        MxCountdownText(kickoff)
                    }
                }
            }
            if (index < fixtures.lastIndex) VaraDivider()
        }
        if (!loggedIn) {
            Spacer(Modifier.height(8.dp))
            Text(
                "سجّل الدخول لإشعارات لحظية",
                color = c.accent,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.clickable(onClick = onLogin),
            )
        }
    }
}

/// نص تنازلي متجدد كل ثانية «HH:MM:SS» — نسخة مصغرة من CountdownChips.
@Composable
private fun MxCountdownText(targetMs: Long) {
    val c = LocalVaraColors.current
    val now = produceState(System.currentTimeMillis(), targetMs) {
        while (true) {
            value = System.currentTimeMillis()
            delay(1000)
        }
    }.value
    val total = ((targetMs - now) / 1000L).coerceAtLeast(0)
    val h = total / 3600
    val m = (total % 3600) / 60
    val s = total % 60
    ForceLtr {
        Text(
            String.format(java.util.Locale.US, "%02d:%02d:%02d", h, m, s),
            color = c.gold,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
        )
    }
}

// MARK: — الحالات

@Composable
private fun MxEmptyList(noFavorites: Boolean, liveOnly: Boolean) {
    val c = LocalVaraColors.current
    Column(Modifier.fillMaxWidth().padding(top = 40.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        when {
            noFavorites -> {
                Icon(Icons.Default.Tune, null, tint = c.accent, modifier = Modifier.size(32.dp))
                Spacer(Modifier.height(8.dp))
                Text("اختر بطولاتك", color = c.text, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(4.dp))
                Text(
                    "فعّل البطولات التي تهمّك من أيقونة الضبط أعلى الشاشة ليظهر جدولها الموحّد هنا",
                    color = c.textDim,
                    fontSize = 12.sp,
                    textAlign = TextAlign.Center,
                )
            }
            liveOnly -> EmptyState("لا مباريات مباشرة الآن", "أوقف فلتر «مباشر» لعرض الجدول كاملًا")
            else -> EmptyState("لا مباريات في هذه الفترة", "جرّب بطولة أخرى أو عد لاحقًا")
        }
    }
}

@Composable
private fun MxErrorState(message: String, retry: () -> Unit) {
    val c = LocalVaraColors.current
    Column(
        Modifier.fillMaxSize().padding(28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(Icons.Default.WifiOff, null, tint = c.textFaint, modifier = Modifier.size(34.dp))
        Spacer(Modifier.height(10.dp))
        Text("تعذّر التحميل", color = c.text, fontWeight = FontWeight.Bold, fontSize = 16.sp)
        Spacer(Modifier.height(4.dp))
        Text(message, color = c.textDim, fontSize = 12.sp, textAlign = TextAlign.Center)
        Spacer(Modifier.height(12.dp))
        TextButton(retry) { Text("إعادة المحاولة", color = c.accent, fontWeight = FontWeight.Bold) }
    }
}

// MARK: — ورقة إعداد البطولات

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MxCompsManagerSheet(
    registry: List<Competition>,
    favorites: Set<String>,
    onDismiss: () -> Unit,
    onToggle: (String, Boolean) -> Unit,
    onSelectAll: () -> Unit,
    onClearAll: () -> Unit,
) {
    val c = LocalVaraColors.current
    val allSelected = registry.isNotEmpty() && registry.all { it.slug in favorites }
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = c.surfaceRaised) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 18.dp)
                .padding(bottom = 28.dp),
        ) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text("بطولات الجدول", color = c.text, fontSize = 18.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                TextButton(onDismiss) { Text("تم", color = c.accent, fontWeight = FontWeight.Bold) }
            }
            Text(
                "ما تفعّله هنا يظهر جدوله في «الكل» وفي بلوك «بطولاتي» بتبويب البطولات — مصدر واحد للمفضّلة.",
                color = c.textDim,
                fontSize = 12.sp,
                lineHeight = 19.sp,
            )
            if (registry.isNotEmpty() && (!allSelected || favorites.isNotEmpty())) {
                // RTL: «إلغاء التحديد» يمينًا و«تحديد الكل» بجانبه يسارًا.
                Row(
                    Modifier.padding(top = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    if (favorites.isNotEmpty()) {
                        Row(
                            Modifier
                                .clip(VaraChipShape)
                                .clickable(onClick = onClearAll)
                                .padding(vertical = 6.dp, horizontal = 2.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Icon(Icons.Default.Close, null, tint = c.live, modifier = Modifier.size(15.dp))
                            Text("إلغاء التحديد", color = c.live, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                    if (!allSelected) {
                        Row(
                            Modifier
                                .clip(VaraChipShape)
                                .clickable(onClick = onSelectAll)
                                .padding(vertical = 6.dp, horizontal = 2.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Icon(Icons.Default.DoneAll, null, tint = c.accent, modifier = Modifier.size(15.dp))
                            Text("تحديد الكل", color = c.accent, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
            if (registry.isEmpty()) {
                Spacer(Modifier.height(20.dp))
                EmptyState("تعذّر تحميل سجل البطولات", "أغلق الورقة وحاول مجددًا بعد اتصال أفضل")
            } else {
                val grouped = registry.groupBy { it.category }
                    .entries
                    .sortedBy { mxCategoryRank(it.key) }
                grouped.forEach { (category, comps) ->
                    Spacer(Modifier.height(16.dp))
                    Text(
                        mxCategoryLabel(category),
                        color = c.textDim,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                    )
                    Spacer(Modifier.height(4.dp))
                    Column(
                        Modifier
                            .fillMaxWidth()
                            .clip(VaraTileShape)
                            .background(c.surface),
                    ) {
                        val sorted = comps.sortedBy { it.name }
                        sorted.forEachIndexed { index, comp ->
                            MxCompManagerRow(
                                comp = comp,
                                checked = comp.slug in favorites,
                                onChecked = { onToggle(comp.slug, it) },
                            )
                            if (index < sorted.lastIndex) Box(Modifier.padding(horizontal = 12.dp)) { VaraDivider() }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun MxCompManagerRow(comp: Competition, checked: Boolean, onChecked: (Boolean) -> Unit) {
    val c = LocalVaraColors.current
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        RemoteLogo(comp.logo, comp.name, 24)
        Column(Modifier.weight(1f)) {
            Text(comp.name, color = c.text, fontSize = 13.5.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            mxCompStatusHint(comp.status)?.let { hint ->
                Text(
                    hint,
                    color = if (comp.status == "ongoing") c.accent else c.textDim,
                    fontSize = 10.5.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
        // حفظ فوري — لا زر تأكيد.
        Switch(
            checked = checked,
            onCheckedChange = onChecked,
            colors = SwitchDefaults.colors(checkedTrackColor = c.accent),
        )
    }
}
