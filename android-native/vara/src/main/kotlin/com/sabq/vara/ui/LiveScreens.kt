package com.sabq.vara.ui

// «عالمية» — نقل 1:1 لشاشة LiveView الحالية في iOS (تبويب واحد): كل مباريات
// العالم الجارية الآن (/sports/world-live) مجمّعة بمستويين: قسم فئة (بطولاتنا
// السعودية أولًا ثم بطولاتنا ثم بقية العالم) ← مجموعة بطولة (شعار/علم + اسم
// منظّف + دولة) ← صفوف مسطّحة مفصولة بخطوط رفيعة. الفئة تُشتق من
// competitionSlug عبر خريطة تُبنى من /sports/competitions، ومباريات الأندية
// السعودية في البطولات القارية تُرفع عبر معرّفاتها (isSaudiFixture).
// (تبويب «المباريات» بجدول الأيام يغطّيه «مركز المباريات» — كما في iOS.)
// كل المساعدات private بادئتها Lv/lv لتفادي التصادم.

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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import com.sabq.vara.core.Fixture
import com.sabq.vara.core.VaraFormat
import com.sabq.vara.core.VaraViewModel
import com.sabq.vara.core.findArray
import com.sabq.vara.core.int
import com.sabq.vara.core.parseCompetition
import com.sabq.vara.core.parseFixture
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

// MARK: - ثوابت (منقولة حرفيًا من SportsConstants في iOS)

/// شرائح البطولات السعودية (category == "saudi").
private val LvSaudiSlugs = setOf(
    "pro-league", "division-1", "division-2", "kings-cup", "super-cup", "womens-league",
)

/// معرّفات الأندية/المنتخب السعودية (api-sports) — لإبراز مبارياتها حتى في
/// البطولات القارية. منقولة حرفيًا من SportsConstants.saudiTeamIds.
private val LvSaudiTeamIds = setOf(
    23, // المنتخب السعودي
    // دوري روشن للرجال
    2928, 2929, 2931, 2932, 2933, 2934, 2936, 2938, 2939, 2940,
    2944, 2945, 2956, 2977, 2992, 10509, 10511, 10513,
    // الدوري الممتاز للسيدات
    24884, 27712, 27713, 27714, 27715, 27716, 27717, 27718,
)

/// ترتيب عرض الفئات (السعودية أولًا) — نظير SportsConstants.categoryOrder.
private val LvCategoryOrder = listOf("saudi", "gulf", "arab", "european", "world")

/// هل المباراة «سعودية»؟ بطولة سعودية أو نادٍ/منتخب سعودي في بطولة قارية.
private fun lvIsSaudiFixture(f: Fixture): Boolean =
    f.competitionSlug in LvSaudiSlugs || f.home.id in LvSaudiTeamIds || f.away.id in LvSaudiTeamIds

/// رتبة الفئة للترتيب — نظير SportsConstants.categoryRank (المجهولة آخرًا).
private fun lvCategoryRank(category: String): Int =
    LvCategoryOrder.indexOf(category).let { if (it >= 0) it else LvCategoryOrder.size }

/// نظير SportsConstants.categoryLabel.
private fun lvCategoryLabel(category: String): String = when (category) {
    "saudi" -> "البطولات السعودية"
    "gulf" -> "البطولات الخليجية"
    "arab" -> "البطولات العربية"
    "european" -> "البطولات الأوروبية"
    "world" -> "بطولات عالمية"
    else -> "بطولات"
}

/// عنوان الفئة — المجهولة تُعرض «بطولات أخرى» (نظير categoryTitle في iOS).
private fun lvCategoryTitle(category: String): String =
    if (category == "other") "بطولات أخرى" else lvCategoryLabel(category)

// MARK: - نماذج (نظير SpWorldLiveItem/LiveGroup/LiveCategorySection)

/// عنصر world-live: المباراة + leagueId للتجميع (بقية الحقول داخل Fixture:
/// competitionName النصي وcountryAr/flag/leagueLogo يقرأها parseFixture).
private data class LvWorldItem(val leagueId: Int, val fixture: Fixture)

private fun lvParseWorldItem(e: JsonElement): LvWorldItem? {
    val o = e as? JsonObject ?: return null
    val fx = parseFixture(e) ?: return null
    return LvWorldItem(o.int("leagueId", "league_id") ?: 0, fx)
}

private data class LvGroup(
    val leagueId: Int,
    val name: String,
    val country: String,
    val flag: String,
    val logo: String,
    val category: String,
    val rank: Int,
    val matches: List<LvWorldItem>,
)

private data class LvCategorySection(
    val category: String,
    val rank: Int,
    val groups: List<LvGroup>,
) {
    val matchCount: Int get() = groups.sumOf { it.matches.size }
}

/// فئة مباراة world-live (نظير category(for:) في iOS): سعودية بالمعرّفات/
/// الشريحة، ثم خريطة البطولات، ثم الدولة، وإلا «other».
private fun lvWorldCategory(fx: Fixture, catBySlug: Map<String, String>): String {
    if (lvIsSaudiFixture(fx)) return "saudi"
    if (fx.competitionSlug.isNotBlank()) catBySlug[fx.competitionSlug]?.let { return it }
    if (fx.countryAr == "Saudi-Arabia" || fx.countryAr == "السعودية") return "saudi"
    return "other"
}

/// مجموعات البطولات (نظير worldGroups): rank الفئة ثم عدد المباريات تنازليًا
/// ثم الدولة ثم الاسم؛ داخل المجموعة الحية أولًا ثم elapsed تنازليًا.
private fun lvWorldGroups(items: List<LvWorldItem>, catBySlug: Map<String, String>): List<LvGroup> =
    items.groupBy { it.leagueId }.map { (leagueId, group) ->
        val first = group.first().fixture
        val category = lvWorldCategory(first, catBySlug)
        LvGroup(
            leagueId = leagueId,
            name = first.competitionName.ifBlank { first.countryAr }.ifBlank { "—" },
            country = first.countryAr,
            flag = first.flag,
            logo = first.leagueLogo,
            category = category,
            rank = lvCategoryRank(category),
            matches = group.sortedWith(
                compareByDescending<LvWorldItem> { it.fixture.status.live }
                    .thenByDescending { it.fixture.status.elapsed ?: 0 },
            ),
        )
    }.sortedWith(
        compareBy<LvGroup> { it.rank }
            .thenByDescending { it.matches.size }
            .thenBy { it.country }
            .thenBy { it.name },
    )

/// أقسام الفئات (نظير worldCategorySections): rank ثم عدد المباريات تنازليًا
/// ثم العنوان أبجديًا.
private fun lvWorldSections(items: List<LvWorldItem>, catBySlug: Map<String, String>): List<LvCategorySection> =
    lvWorldGroups(items, catBySlug).groupBy { it.category }.map { (category, groups) ->
        LvCategorySection(category, lvCategoryRank(category), groups)
    }.sortedWith(
        compareBy<LvCategorySection> { it.rank }
            .thenByDescending { it.matchCount }
            .thenBy { lvCategoryTitle(it.category) },
    )

/// يزيل لاحقة الدولة من اسم البطولة: « (الدولة)» و« - الدولة» ومرادفاتها.
private fun lvCleanLeagueName(name: String, country: String): String {
    val c = country.trim()
    val cleaned = name.trim()
    if (c.isEmpty()) return cleaned
    for (suffix in listOf(" ($c)", " - $c", " – $c", " — $c", " · $c")) {
        if (cleaned.endsWith(suffix)) return cleaned.removeSuffix(suffix).trim()
    }
    return cleaned
}

// MARK: - الشاشة

@Composable
fun WorldLiveScreen(nav: NavHostController, vm: VaraViewModel) {
    val c = LocalVaraColors.current
    val scope = rememberCoroutineScope()

    var world by remember { mutableStateOf<List<LvWorldItem>?>(null) }
    var catBySlug by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var loadError by remember { mutableStateOf<String?>(null) }
    var refreshing by remember { mutableStateOf(false) }
    var loadedOnce by remember { mutableStateOf(false) }

    // تحميل شامل — كل نداء في runCatching مستقل: فشل خريطة البطولات لا يحجب
    // القائمة، والتحديث الفاشل يبقي المعروض (لا شاشة دوران كاملة ولا محو).
    val loadAll: suspend (Boolean) -> Unit = { ignore ->
        coroutineScope {
            val worldDeferred = async {
                runCatching {
                    findArray(
                        vm.api.publicGet("/sports/world-live", ignoreCache = ignore),
                        "matches", "live", "fixtures", "items",
                    ).mapNotNull(::lvParseWorldItem)
                }.getOrNull()
            }
            val compsDeferred = async {
                runCatching {
                    findArray(vm.api.publicGet("/sports/competitions", ignoreCache = ignore), "competitions", "items")
                        .mapNotNull(::parseCompetition)
                }.getOrNull()
            }
            compsDeferred.await()?.let { comps ->
                catBySlug = comps.associate { it.slug to it.category }
            }
            val w = worldDeferred.await()
            if (w != null) {
                world = w
                loadError = null
            } else if (world == null) {
                loadError = "تعذّر الاتصال بخادم البيانات"
            }
            loadedOnce = true
        }
    }

    // استطلاع بالمقدمة فقط: 10ث عند وجود مباريات / 30ث بدونها؛ أول نداء عند كل
    // عودة فوري — الأول إطلاقًا بالكاش والبقية بignoreCache.
    PollEffect(
        delayProvider = { if (world.isNullOrEmpty()) 30_000L else 10_000L },
        onTick = { first -> loadAll(!first || loadedOnce) },
    )

    val liveNowCount = world.orEmpty().count { it.fixture.status.live }

    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(c.screenTop, c.screenBottom)))) {
        VaraPullRefresh(
            refreshing = refreshing,
            onRefresh = {
                scope.launch {
                    refreshing = true
                    loadAll(true)
                    refreshing = false
                }
            },
            modifier = Modifier.fillMaxSize(),
        ) {
            LazyColumn(
                Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                contentPadding = PaddingValues(top = 14.dp, bottom = 28.dp),
            ) {
                item(key = "lv-header") { LvHeader(liveNowCount) }
                lvWorldItems(nav = nav, world = world, catBySlug = catBySlug, loadError = loadError)
            }
        }
    }
}

// MARK: - الترويسة

@Composable
private fun LvHeader(liveCount: Int) {
    val c = LocalVaraColors.current
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .clip(VaraCardShape)
            .background(c.surface)
            .border(1.dp, c.outline.copy(alpha = if (c.dark) 0f else 1f), VaraCardShape)
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            Modifier.size(48.dp).clip(CircleShape).background(c.accent.copy(alpha = .12f)),
            contentAlignment = Alignment.Center,
        ) { Icon(Icons.Default.Public, null, tint = c.accent, modifier = Modifier.size(24.dp)) }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("عالمية", style = MaterialTheme.typography.headlineSmall, color = c.text, maxLines = 1)
            Text(
                "المباريات الجارية حول العالم",
                color = c.textDim,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
            )
        }
        if (liveCount > 0) LvLiveBadge("$liveCount")
    }
}

/// شارة «N مباشرة» حمراء (نظير liveBadge في iOS).
@Composable
private fun LvLiveBadge(value: String) {
    val c = LocalVaraColors.current
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        modifier = Modifier
            .clip(CircleShape)
            .background(c.live.copy(alpha = .09f))
            .padding(horizontal = 9.dp, vertical = 6.dp),
    ) {
        Box(Modifier.size(6.dp).clip(CircleShape).background(c.live))
        Text("$value مباشرة", color = c.live, fontSize = 12.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun LvLoading() {
    val c = LocalVaraColors.current
    Box(Modifier.fillMaxWidth().height(180.dp), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = c.accent)
    }
}

// MARK: - المحتوى (الحالات الثلاث + أقسام الفئات)

private fun LazyListScope.lvWorldItems(
    nav: NavHostController,
    world: List<LvWorldItem>?,
    catBySlug: Map<String, String>,
    loadError: String?,
) {
    when {
        // أبقِ القائمة السابقة أثناء التحديث الصامت — الدوران فقط قبل أول بيانات.
        world == null && loadError == null -> item(key = "lv-w-loading") { LvLoading() }
        world == null -> item(key = "lv-w-error") { EmptyState("تعذّر التحميل", loadError.orEmpty()) }
        world.isEmpty() -> item(key = "lv-w-empty") {
            EmptyState("لا مباريات مباشرة عالميًا الآن", "ستظهر هنا أي مباراة جارية الآن حول العالم")
        }
        else -> {
            val sections = lvWorldSections(world, catBySlug)
            items(sections, key = { "lv-sec-${it.category}" }) { section ->
                LvWorldCategoryCard(section, nav)
            }
        }
    }
}

/// لون الفئة — محور واحد؛ الذهبي محجوز للتميّز لا لتلوين فئة.
@Composable
private fun lvCategoryTint(category: String): Color {
    val c = LocalVaraColors.current
    return when (category) {
        "saudi" -> c.accent
        "european", "world", "gulf", "arab" -> c.accent.copy(alpha = .55f)
        else -> c.textDim
    }
}

/// بطاقة قسم فئة: رأس (شريط لوني + عنوان + «N مباشرة») + مجموعات البطولات
/// مفصولة بخطوط.
@Composable
private fun LvWorldCategoryCard(section: LvCategorySection, nav: NavHostController) {
    val c = LocalVaraColors.current
    Column(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .clip(VaraCardShape)
            .background(c.surface)
            .border(1.dp, c.outline.copy(alpha = if (c.dark) 0f else 1f), VaraCardShape),
    ) {
        LvWorldCategoryHeader(section)
        section.groups.forEachIndexed { index, group ->
            if (index > 0) Box(
                Modifier.fillMaxWidth().padding(horizontal = 14.dp).height(1.dp).background(c.outline.copy(alpha = .72f)),
            )
            LvWorldGroupSection(group, nav)
        }
    }
}

@Composable
private fun LvWorldCategoryHeader(section: LvCategorySection) {
    val c = LocalVaraColors.current
    val tint = lvCategoryTint(section.category)
    Row(
        Modifier.fillMaxWidth().padding(start = 14.dp, end = 14.dp, top = 14.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(Modifier.size(width = 4.dp, height = 22.dp).clip(CircleShape).background(tint))
        Text(lvCategoryTitle(section.category), color = c.text, fontSize = 18.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.weight(1f))
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            Box(Modifier.size(6.dp).clip(CircleShape).background(c.live))
            Text("${section.matchCount} مباشرة", color = c.textDim, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        }
    }
}

/// مجموعة بطولة: ترويسة (شعار/علم + اسم منظّف + دولة) + صفوف مسطّحة مفصولة بخطوط.
@Composable
private fun LvWorldGroupSection(group: LvGroup, nav: NavHostController) {
    val c = LocalVaraColors.current
    Column(Modifier.fillMaxWidth().padding(top = 2.dp, bottom = 4.dp)) {
        LvWorldGroupHeader(group)
        Box(
            Modifier.fillMaxWidth().padding(start = 14.dp, end = 14.dp, top = 8.dp).height(1.dp)
                .background(c.outline.copy(alpha = .72f)),
        )
        group.matches.forEachIndexed { index, item ->
            if (index > 0) Box(
                Modifier.fillMaxWidth().padding(horizontal = 14.dp).height(1.dp).background(c.outline.copy(alpha = .52f)),
            )
            LvFlatMatchRow(item.fixture, Modifier.padding(horizontal = 6.dp)) { nav.navigate("match/${item.fixture.id}") }
        }
    }
}

@Composable
private fun LvWorldGroupHeader(group: LvGroup) {
    val c = LocalVaraColors.current
    val tint = lvCategoryTint(group.category)
    // ترويسة البطولة أخف من عنوان الفئة (18) وأوضح من أسماء الأندية (12).
    Row(
        Modifier
            .fillMaxWidth()
            .padding(start = 14.dp, end = 14.dp, top = 12.dp)
            .clip(VaraChipShape)
            .background(c.chip.copy(alpha = if (c.dark) 0.55f else 0.85f))
            .padding(horizontal = 10.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        val logoUrl = group.logo.ifBlank { group.flag }
        if (logoUrl.isNotBlank()) {
            RemoteLogo(logoUrl, group.name, 28)
        } else {
            Box(
                Modifier.size(28.dp).clip(CircleShape).background(tint.copy(alpha = .14f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    if (group.category == "saudi") Icons.Default.Star else Icons.Default.Public,
                    null,
                    tint = tint,
                    modifier = Modifier.size(14.dp),
                )
            }
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            // تسمية بطولة كـ«caption» أخف من أسماء الأندية (13) وعنوان الفئة (18).
            TeamLabel(
                name = lvCleanLeagueName(group.name, group.country),
                color = c.textDim,
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 2,
                textAlign = TextAlign.Start,
                modifier = Modifier.fillMaxWidth(),
            )
            // الدولة فقط — لا نكرر عنوان الفئة («بطولات أخرى») تحت كل بطولة.
            if (group.country.isNotBlank()) {
                Text(
                    group.country,
                    color = c.textFaint,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                )
            }
        }
    }
}

// MARK: - صفّ مباراة مسطّح (نظير SpFlatMatchRow/SpScoreRow)

/// صفّ بلا بطاقة: الشعار ملاصقًا للنتيجة، والاسم يملأ باقي الجانب (سطران).
/// المضيف يمينًا في RTL والنتيجة بالضيف أولًا داخل LTR.
@Composable
private fun LvFlatMatchRow(fixture: Fixture, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val c = LocalVaraColors.current
    val started = fixture.status.live || fixture.status.finished
    Row(
        modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 10.dp, horizontal = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        // المضيف (يمين في RTL): الاسم يملأ الجانب ← الشعار ملاصق للمركز. بلا Spacer يسرق العرض.
        Row(
            Modifier.weight(1f),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            TeamLabel(
                name = fixture.home.name,
                color = c.text,
                fontSize = 12.5.sp,
                maxLines = 2,
                textAlign = TextAlign.End,
                modifier = Modifier.weight(1f),
            )
            RemoteLogo(fixture.home.logo, fixture.home.name, 30)
        }
        Column(
            Modifier.widthIn(min = 44.dp, max = 58.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(1.dp),
        ) {
            if (started) {
                ForceLtr {
                    Text(
                        "${fixture.awayScore ?: 0}-${fixture.homeScore ?: 0}",
                        color = c.text,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                    )
                }
            } else {
                ForceLtr {
                    Text(
                        VaraFormat.time(VaraFormat.instantOf(fixture)),
                        color = c.text,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                    )
                }
            }
            LvRowStatusSub(fixture)
        }
        // الضيف (يسار في RTL): الشعار ملاصق للمركز ← الاسم يملأ باقي الجانب.
        Row(
            Modifier.weight(1f),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            RemoteLogo(fixture.away.logo, fixture.away.name, 30)
            TeamLabel(
                name = fixture.away.name,
                color = c.text,
                fontSize = 12.5.sp,
                maxLines = 2,
                textAlign = TextAlign.Start,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

/// سطر الحالة الموجز تحت النتيجة/الوقت: دقيقة حية/ركلات، «انتهت»، أو ليبل
/// الحالات الاستثنائية (مؤجلة/ملغاة…).
@Composable
private fun LvRowStatusSub(fixture: Fixture) {
    val c = LocalVaraColors.current
    when {
        fixture.status.live -> Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Box(Modifier.size(5.dp).clip(CircleShape).background(c.live))
            if (fixture.shootoutLive && fixture.hasPenalties) LvPenaltyDigits(fixture, c.live)
            else LiveMinuteText(fixture.status, c.live, 10)
        }
        fixture.status.finished ->
            if (fixture.hasPenalties) LvPenaltyDigits(fixture, c.accent)
            else Text("انتهت", color = c.textDim, fontSize = 10.5.sp, fontWeight = FontWeight.SemiBold)
        fixture.status.code.uppercase() !in setOf("NS", "TBD") ->
            Text(fixture.status.label, color = c.textFaint, fontSize = 10.5.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
    }
}

/// أرقام الترجيح بالضيف أولًا داخل LTR (كسطر النتيجة) — دمجها بسلسلة عربية
/// واحدة يقلب الأرقام في التصيير.
@Composable
private fun LvPenaltyDigits(fixture: Fixture, color: Color) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
        Text("ترجيح", color = color, fontSize = 10.5.sp, fontWeight = FontWeight.Bold)
        ForceLtr {
            Text(
                "${fixture.penAway ?: 0}-${fixture.penHome ?: 0}",
                color = color,
                fontSize = 10.5.sp,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}
