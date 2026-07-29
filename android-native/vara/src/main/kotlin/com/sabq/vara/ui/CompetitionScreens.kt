package com.sabq.vara.ui

// شاشتا «البطولات» (القائمة) و«تفاصيل البطولة» — نقل 1:1 من
// CompetitionsView.swift (292) وCompetitionDetailView.swift (1478) في iOS.
// كل المساعدات private بادئتها Cp لتفادي التصادم مع بقية الملفات.

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.FormatListNumbered
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Sensors
import androidx.compose.material.icons.filled.SportsSoccer
import androidx.compose.material.icons.filled.Stadium
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import com.sabq.vara.core.Fixture
import com.sabq.vara.core.Leader
import com.sabq.vara.core.Standing
import com.sabq.vara.core.Transfer
import com.sabq.vara.core.VaraFormat
import com.sabq.vara.core.VaraViewModel
import com.sabq.vara.core.bool
import com.sabq.vara.core.findArray
import com.sabq.vara.core.int
import com.sabq.vara.core.latinNumber
import com.sabq.vara.core.obj
import com.sabq.vara.core.parseFixture
import com.sabq.vara.core.parseLeader
import com.sabq.vara.core.parseStanding
import com.sabq.vara.core.string
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

// أخضر «جارية الآن» ثابت (نظير SpTheme.leaf) — المحور accent قد لا يكون أخضر.
private val CpGreen = Color(0xFF2E9D63)

// ترتيب الفئات وتسمياتها — نظير SportsConstants.categoryOrder/categoryLabel.
private val CpCategoryOrder = listOf("saudi", "gulf", "arab", "european", "world")

private fun CpCategoryLabel(category: String): String = when (category) {
    "saudi" -> "البطولات السعودية"
    "gulf" -> "البطولات الخليجية"
    "arab" -> "البطولات العربية"
    "european" -> "البطولات الأوروبية"
    "world" -> "بطولات عالمية"
    else -> "بطولات"
}

private fun CpCategoryIcon(category: String): ImageVector = when (category) {
    "saudi" -> Icons.Default.Star
    "gulf" -> Icons.Default.EmojiEvents
    "arab" -> Icons.Default.Flag
    "european" -> Icons.Default.Public
    "world" -> Icons.Default.Language
    else -> Icons.Default.SportsSoccer
}

/// شارة الحالة العربية الملوّنة — «جارية الآن» أخضر / «تنطلق قريبًا» ذهبي /
/// «انتهت» رمادي. لا نصوص إنجليزية خام أبدًا.
private fun CpStatusInfo(status: String?, gold: Color, faint: Color): Pair<String, Color>? = when (status) {
    "ongoing" -> "جارية الآن" to CpGreen
    "upcoming" -> "تنطلق قريبًا" to gold
    "finished" -> "انتهت" to faint
    else -> null
}

// نموذج البطولة الكامل — نظير SpCompetition (الموديل المشترك Competition لا يحمل
// type/hasStandings/hasScorers/season فنفكّ محليًّا).
private data class CpComp(
    val slug: String,
    val name: String,
    val type: String,        // "league" | "cup"
    val category: String,    // saudi | gulf | arab | european | world
    val hasStandings: Boolean,
    val hasScorers: Boolean,
    val logo: String,
    val season: Int?,
    val status: String,      // ongoing | upcoming | finished
)

private fun CpNormalizeUrl(raw: String?): String = when {
    raw.isNullOrBlank() -> ""
    raw.startsWith("http") -> raw
    else -> "https://sabq.org" + if (raw.startsWith('/')) raw else "/$raw"
}

private fun CpParseComp(e: JsonElement): CpComp? {
    val o = e as? JsonObject ?: return null
    val slug = o.string("slug", "key", "code") ?: return null
    val type = o.string("type") ?: "league"
    return CpComp(
        slug = slug,
        name = o.string("nameAr", "name_ar", "name", "title") ?: slug,
        type = type,
        category = o.string("category", "region") ?: "",
        hasStandings = o.bool("hasStandings", "has_standings") ?: (type != "cup"),
        hasScorers = o.bool("hasScorers", "has_scorers") ?: true,
        logo = CpNormalizeUrl(o.string("logo", "image", "emblem")),
        season = o.int("season"),
        status = o.string("status") ?: "",
    )
}

/// لقطة قائمة البطولات على القرص — تجعل بطاقة «بطولاتي» ترسم فورًا بأسمائها
/// وشعاراتها قبل وصول الشبكة (نظير مخزن SpCompetitionFavorites الكامل في iOS).
private object CpCompCache {
    @Volatile private var memory: List<CpComp>? = null

    fun load(context: Context): List<CpComp> {
        memory?.let { return it }
        val raw = context.getSharedPreferences("vara_competitions_cache", Context.MODE_PRIVATE)
            .getString("competitions_json", null) ?: return emptyList()
        val list = runCatching { Json.parseToJsonElement(raw) }.getOrNull()
            ?.let { it as? JsonArray }?.mapNotNull(::CpParseComp).orEmpty()
        memory = list
        return list
    }

    fun save(context: Context, raw: JsonArray, list: List<CpComp>) {
        memory = list
        context.getSharedPreferences("vara_competitions_cache", Context.MODE_PRIVATE)
            .edit().putString("competitions_json", raw.toString()).apply()
    }
}

// MARK: - شاشة البطولات (القائمة)

@Composable
fun CompetitionsScreen(nav: NavHostController, vm: VaraViewModel) {
    val c = LocalVaraColors.current
    val context = LocalContext.current
    // قراءة تفاعلية للمفضلة: State محلي يُحدَّث مع prefs معًا كي يُعاد الرسم.
    var favorites by remember { mutableStateOf(vm.preferences.favoriteCompetitionSlugs) }
    var comps by remember { mutableStateOf(CpCompCache.load(context)) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var refreshing by remember { mutableStateOf(false) }
    var revision by remember { mutableIntStateOf(0) }
    var selectedCategory by remember { mutableStateOf("all") }

    fun setFavorites(value: Set<String>) {
        favorites = value
        vm.preferences.favoriteCompetitionSlugs = value
    }

    LaunchedEffect(revision) {
        val force = revision > 0
        if (comps.isEmpty()) loading = true
        runCatching {
            findArray(vm.api.publicGet("/sports/competitions", ignoreCache = force), "competitions", "items")
        }.onSuccess { raw ->
            val list = raw.mapNotNull(::CpParseComp)
            if (list.isNotEmpty()) {
                comps = list
                CpCompCache.save(context, raw, list)
                // مزامنة: نحذف من المفضلة أي slug لم يعد في ردّ الخادم.
                val pruned = favorites.filter { s -> list.any { it.slug == s } }.toSet()
                if (pruned != favorites) setFavorites(pruned)
            }
            // الخطأ لا يمحو المعروض — يُمسح فقط عند النجاح.
            error = null
        }.onFailure { if (comps.isEmpty()) error = it.message ?: "تعذّر التحميل" }
        loading = false
        refreshing = false
    }

    val grouped = remember(comps, selectedCategory) {
        val source = if (selectedCategory == "all") comps else comps.filter { it.category == selectedCategory }
        CpCategoryOrder.mapNotNull { cat ->
            source.filter { it.category == cat }.takeIf { it.isNotEmpty() }?.let { cat to it }
        }
    }
    // رقائق ديناميكية من الفئات الموجودة فعلًا في ردّ الخادم (نظير availableFilters).
    val filters = remember(comps) {
        buildList {
            add(Triple("all", "الكل", Icons.Default.GridView))
            CpCategoryOrder.forEach { cat ->
                if (comps.any { it.category == cat }) add(Triple(cat, CpCategoryLabel(cat), CpCategoryIcon(cat)))
            }
        }
    }

    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(c.screenTop, c.screenBottom)))) {
        VaraPullRefresh(refreshing = refreshing, onRefresh = { refreshing = true; revision++ }) {
            LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                item {
                    Row(Modifier.fillMaxWidth().background(c.surface).padding(horizontal = 18.dp, vertical = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("البطولات", style = MaterialTheme.typography.headlineSmall, color = c.text)
                            Text("كل بطولاتنا مجمّعة حسب الفئة", color = c.textDim, fontSize = 12.sp)
                        }
                        VaraWordmark(18)
                    }
                }

                // المفضّلات المحلية تظهر فورًا — لا نُخفي كل الواجهة خلف طلب واحد.
                if (favorites.isNotEmpty()) {
                    item {
                        CpMyCompetitionsCard(
                            favorites = favorites,
                            comps = comps,
                            loading = loading,
                            onOpen = { nav.navigate("competition/$it") },
                            onRemove = { setFavorites(favorites - it) },
                        )
                    }
                }

                if (loading && comps.isEmpty()) {
                    item { Box(Modifier.fillMaxWidth().height(160.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = c.accent) } }
                } else if (error != null && comps.isEmpty()) {
                    item { EmptyState("تعذّر التحميل", error.orEmpty()) }
                } else {
                    item {
                        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            filters.forEach { (key, label, icon) ->
                                val active = selectedCategory == key
                                Row(
                                    Modifier.clip(CircleShape)
                                        .background(if (active) c.accent else c.chip)
                                        .clickable { selectedCategory = key }
                                        .padding(horizontal = 12.dp, vertical = 9.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                                ) {
                                    Icon(icon, null, tint = if (active) Color.White else c.textDim, modifier = Modifier.size(13.dp))
                                    Text(label, color = if (active) Color.White else c.text, fontSize = 12.5.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }
                    grouped.forEach { (category, items) ->
                        item(key = "cat-$category") {
                            CpCategorySection(
                                category = category,
                                items = items,
                                favorites = favorites,
                                onOpen = { nav.navigate("competition/$it") },
                                onToggleFavorite = { slug ->
                                    setFavorites(if (slug in favorites) favorites - slug else favorites + slug)
                                },
                            )
                        }
                    }
                }
                item { Spacer(Modifier.height(14.dp)) }
            }
        }
    }
}

/// بطاقة «بطولاتي» أعلى القائمة — عدّاد + صفوف + نجمة إزالة (نظير myCompetitionsCard).
@Composable
private fun CpMyCompetitionsCard(
    favorites: Set<String>,
    comps: List<CpComp>,
    loading: Boolean,
    onOpen: (String) -> Unit,
    onRemove: (String) -> Unit,
) {
    val c = LocalVaraColors.current
    val favComps = comps.filter { it.slug in favorites }
    Column(Modifier.padding(horizontal = 16.dp)) {
        Column(
            Modifier.fillMaxWidth().clip(VaraCardShape).background(c.surface)
                .border(1.dp, c.outline.copy(alpha = if (c.dark) 0f else 1f), VaraCardShape),
        ) {
            Row(Modifier.fillMaxWidth().padding(start = 14.dp, end = 14.dp, top = 14.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Star, null, tint = c.gold, modifier = Modifier.size(15.dp))
                Spacer(Modifier.width(6.dp))
                Text("بطولاتي", color = c.text, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.width(8.dp))
                Text("${favorites.size}", color = c.textFaint, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.weight(1f))
            }
            if (favComps.isEmpty()) {
                Text(
                    if (loading) "جارٍ تحميل بطولاتك…" else "أضف بطولاتك المفضّلة بالنجمة من القائمة",
                    color = c.textDim, fontSize = 11.sp,
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                )
            } else {
                Column(Modifier.padding(bottom = 6.dp)) {
                    favComps.forEachIndexed { idx, comp ->
                        if (idx > 0) HorizontalDivider(color = c.outline.copy(alpha = .65f), modifier = Modifier.padding(start = 62.dp))
                        CpCompetitionRow(comp, isFavorite = true, onToggleFavorite = { onRemove(comp.slug) }, onOpen = { onOpen(comp.slug) })
                    }
                }
            }
        }
    }
}

/// قسم فئة — رأس (أيقونة + التسمية + عدّاد) وبطاقة واحدة بصفوف مفصولة بخطوط خفيفة.
@Composable
private fun CpCategorySection(
    category: String,
    items: List<CpComp>,
    favorites: Set<String>,
    onOpen: (String) -> Unit,
    onToggleFavorite: (String) -> Unit,
) {
    val c = LocalVaraColors.current
    val isSaudi = category == "saudi"
    Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(CpCategoryIcon(category), null, tint = if (isSaudi) c.accent else c.textFaint, modifier = Modifier.size(14.dp))
            Spacer(Modifier.width(8.dp))
            Text(CpCategoryLabel(category), color = c.text, fontSize = 16.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.weight(1f))
            Text("${items.size}", color = c.textFaint, fontSize = 13.sp, fontWeight = FontWeight.Bold)
        }
        Column(
            Modifier.fillMaxWidth().clip(VaraCardShape).background(c.surface)
                .border(1.dp, c.outline.copy(alpha = if (c.dark) 0f else .7f), VaraCardShape),
        ) {
            items.forEachIndexed { idx, comp ->
                if (idx > 0) HorizontalDivider(color = c.outline.copy(alpha = .6f), modifier = Modifier.padding(start = 62.dp))
                CpCompetitionRow(
                    comp,
                    isFavorite = comp.slug in favorites,
                    onToggleFavorite = { onToggleFavorite(comp.slug) },
                    onOpen = { onOpen(comp.slug) },
                )
            }
        }
    }
}

/// صفّ بطولة — شعار + اسم + شارة حالة عربية + نجمة تبديل مفضلة قابلة للنقر + سهم.
@Composable
private fun CpCompetitionRow(comp: CpComp, isFavorite: Boolean, onToggleFavorite: () -> Unit, onOpen: () -> Unit) {
    val c = LocalVaraColors.current
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onOpen).padding(horizontal = 14.dp, vertical = 13.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (comp.logo.isNotBlank()) {
            RemoteLogo(comp.logo, comp.name, 36)
        } else {
            // احتياطي بلا شعار: كأس للبطولات الإقصائية وملعب للدوريات (نظير iOS).
            Box(Modifier.size(36.dp).clip(CircleShape).background(c.accent.copy(alpha = .10f)), contentAlignment = Alignment.Center) {
                Icon(if (comp.type == "cup") Icons.Default.EmojiEvents else Icons.Default.Stadium, null, tint = c.accent, modifier = Modifier.size(17.dp))
            }
        }
        Spacer(Modifier.width(12.dp))
        Text(
            comp.name,
            color = c.text, fontSize = 14.5.sp, fontWeight = FontWeight.Bold,
            maxLines = 2, overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        Spacer(Modifier.width(8.dp))
        CpStatusInfo(comp.status, c.gold, c.textFaint)?.let { (label, color) ->
            Text(label, color = color, fontSize = 10.5.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.width(4.dp))
        }
        IconButton(onClick = onToggleFavorite, modifier = Modifier.size(32.dp)) {
            Icon(
                if (isFavorite) Icons.Default.Star else Icons.Default.StarBorder,
                if (isFavorite) "إزالة من بطولاتي" else "إضافة إلى بطولاتي",
                tint = if (isFavorite) c.gold else c.textFaint,
                modifier = Modifier.size(18.dp),
            )
        }
        Icon(Icons.Default.ChevronLeft, null, tint = c.textFaint, modifier = Modifier.size(16.dp))
    }
}

// MARK: - نماذج تفاصيل البطولة

private data class CpChampion(val id: Int, val name: String, val logo: String)
private data class CpSignal(
    val key: String,
    val label: String,
    val title: String,
    val value: String,
    val subtitle: String,
    val logo: String,
    val teamId: Int?,
    val playerId: Int?,
)
private data class CpInsights(
    val competitionName: String,
    val summarySubtitle: String,
    val signals: List<CpSignal>,
)
private data class CpRound(val key: String, val label: String)
private data class CpWcGroup(val name: String, val rows: List<Standing>)
private data class CpWcLeader(
    val rank: Int,
    val id: Int,
    val name: String,
    val photo: String,
    val team: String,
    val teamLogo: String,
    val goals: Int,
    val assists: Int,
    val yellow: Int,
    val red: Int,
    val matches: Int,
)
private data class CpWcBracketRound(val round: String, val matches: List<Fixture>)
private data class CpWcSlot(
    val matchNo: Int,
    val fixture: Fixture?,
    val topName: String,
    val topLogo: String,
    val bottomName: String,
    val bottomLogo: String,
)
private data class CpWcColumn(val key: String, val label: String, val slots: List<CpWcSlot>)

private data class CpDetail(
    val meta: CpComp? = null,
    val matchesLoaded: Boolean = false,
    val live: List<Fixture> = emptyList(),
    val today: List<Fixture> = emptyList(),
    val upcoming: List<Fixture> = emptyList(),
    val results: List<Fixture> = emptyList(),
    val standings: List<Standing> = emptyList(),
    val scorers: List<Leader> = emptyList(),
    val assists: List<Leader> = emptyList(),
    val outlookSeason: Int? = null,
    val champion: CpChampion? = null,
    val insights: CpInsights? = null,
    val transfers: List<Transfer> = emptyList(),
    val rounds: List<CpRound> = emptyList(),
    val currentRound: String? = null,
    // كأس العالم
    val wcFixtures: List<Fixture> = emptyList(),
    val wcGroups: List<CpWcGroup> = emptyList(),
    val wcBracketRounds: List<CpWcBracketRound> = emptyList(),
    val wcColumns: List<CpWcColumn> = emptyList(),
    val wcScorers: List<CpWcLeader> = emptyList(),
    val wcAssists: List<CpWcLeader> = emptyList(),
    val wcCards: List<CpWcLeader> = emptyList(),
) {
    val allFixtures: List<Fixture> get() = live + today + upcoming + results
    // أي بيانات وصلت من أي نداء — لا نحجب الصفحة كلها لأن نداءً واحدًا فشل.
    val hasAny: Boolean get() = matchesLoaded || standings.isNotEmpty() || scorers.isNotEmpty() ||
        assists.isNotEmpty() || champion != null || insights != null || outlookSeason != null ||
        transfers.isNotEmpty() || rounds.isNotEmpty() ||
        wcFixtures.isNotEmpty() || wcGroups.isNotEmpty() || wcColumns.isNotEmpty() ||
        wcBracketRounds.isNotEmpty() || wcScorers.isNotEmpty() || wcAssists.isNotEmpty() || wcCards.isNotEmpty()
}

// MARK: - فكّ ردود التفاصيل

private fun CpParseStandings(root: JsonElement): List<Standing> =
    findArray(root, "standings", "table", "rows", "items").mapNotNull { parseStanding(it) }

private fun CpApplyMatches(d: CpDetail, root: JsonElement): CpDetail {
    val o = root as? JsonObject ?: return d
    fun bucket(vararg keys: String): List<Fixture> =
        keys.firstNotNullOfOrNull { o[it] as? JsonArray }?.mapNotNull(::parseFixture).orEmpty()
    return d.copy(
        matchesLoaded = true,
        live = bucket("live").sortedBy { it.timestamp ?: Long.MAX_VALUE },
        today = bucket("today").sortedBy { it.timestamp ?: Long.MAX_VALUE },
        upcoming = bucket("upcoming").sortedBy { it.timestamp ?: Long.MAX_VALUE },
        results = bucket("results").sortedByDescending { it.timestamp ?: 0L },
    )
}

private fun CpParseWcFixtures(root: JsonElement): List<Fixture> =
    findArray(root, "fixtures", "items").mapNotNull(::parseFixture).map {
        it.copy(
            competitionSlug = it.competitionSlug.ifBlank { "world-cup" },
            competitionName = it.competitionName.ifBlank { "كأس العالم" },
        )
    }

/// مجموعات المونديال — لا تُفلطح؛ بطاقة لكل مجموعة بحرفها (parseStanding(row, group)).
private fun CpParseWcGroups(root: JsonElement): List<CpWcGroup> =
    findArray(root, "groups", "items").mapNotNull { g ->
        val o = g as? JsonObject ?: return@mapNotNull null
        val name = o.string("group") ?: o.string("groupEn") ?: return@mapNotNull null
        val rows = findArray(o, "rows", "standings", "table", "items").mapNotNull { parseStanding(it, name) }
        if (rows.isEmpty()) null else CpWcGroup(name, rows)
    }

private fun CpParseWcLeader(e: JsonElement): CpWcLeader? {
    val o = e as? JsonObject ?: return null
    val team = o.obj("team")
    return CpWcLeader(
        rank = o.int("rank") ?: 0,
        id = o.int("id", "playerId") ?: 0,
        name = o.string("nameAr", "name") ?: return null,
        photo = CpNormalizeUrl(o.string("photo", "image")),
        team = team?.string("nameAr", "name") ?: "",
        teamLogo = CpNormalizeUrl(team?.string("logo")),
        goals = o.int("goals") ?: 0,
        assists = o.int("assists") ?: 0,
        yellow = o.int("yellow") ?: 0,
        red = o.int("red") ?: 0,
        matches = o.int("matches") ?: 0,
    )
}

private fun CpParseWcLeaders(root: JsonElement, vararg keys: String): List<CpWcLeader> =
    findArray(root, *keys).mapNotNull(::CpParseWcLeader)

/// حلّ طرف مواجهة إقصائية — نظير resolvedHome/resolvedAway في SpWcBracketSlot.
private fun CpResolveSide(fx: Fixture?, side: JsonObject?, code: String?, label: String?, home: Boolean): Pair<String, String> {
    val team = if (home) fx?.home else fx?.away
    if (team != null && team.id > 0 && team.logo.isNotBlank()) return team.name to team.logo
    val fallback = side?.let {
        val id = it.int("id") ?: 0
        val logo = CpNormalizeUrl(it.string("logo"))
        if (id > 0 && logo.isNotBlank()) (it.string("nameAr", "name") ?: "") to logo else null
    }
    if (fallback != null && fallback.first.isNotBlank()) return fallback
    if (!code.isNullOrBlank()) return code to ""
    return (label ?: "TBD") to ""
}

private fun CpParseBracket(root: JsonElement): Pair<List<CpWcBracketRound>, List<CpWcColumn>> {
    val o = root as? JsonObject ?: return emptyList<CpWcBracketRound>() to emptyList()
    val rounds = findArray(o, "rounds").mapNotNull { r ->
        val ro = r as? JsonObject ?: return@mapNotNull null
        val name = ro.string("round") ?: ro.string("roundEn") ?: return@mapNotNull null
        val matches = findArray(ro, "matches", "items").mapNotNull(::parseFixture).map {
            it.copy(competitionSlug = "world-cup", competitionName = it.competitionName.ifBlank { "كأس العالم" })
        }
        if (matches.isEmpty()) null else CpWcBracketRound(name, matches)
    }
    val tree = o.obj("tree")
    val hasAny = tree?.bool("hasAny") ?: true
    val columns = if (tree == null || !hasAny) emptyList() else findArray(tree, "columns").mapNotNull { col ->
        val co = col as? JsonObject ?: return@mapNotNull null
        val key = co.string("key") ?: return@mapNotNull null
        val slots = findArray(co, "slots").mapNotNull { s ->
            val so = s as? JsonObject ?: return@mapNotNull null
            val fixtureObj = so.obj("fixture")
            val fx = fixtureObj?.let(::parseFixture)?.copy(competitionSlug = "world-cup")
            val (topName, topLogo) = CpResolveSide(fx, so.obj("topTeam"), fixtureObj?.string("homeCode"), so.string("topLabel"), home = true)
            val (bottomName, bottomLogo) = CpResolveSide(fx, so.obj("bottomTeam"), fixtureObj?.string("awayCode"), so.string("bottomLabel"), home = false)
            CpWcSlot(so.int("matchNo") ?: 0, fx, topName, topLogo, bottomName, bottomLogo)
        }
        if (slots.isEmpty()) null else CpWcColumn(key, co.string("label") ?: key, slots)
    }
    return rounds to columns
}

private fun CpParseOutlook(root: JsonElement): Pair<Int?, CpChampion?> {
    val outlook = (root as? JsonObject)?.obj("outlook") ?: return null to null
    val champion = outlook.obj("champion")?.let { ch ->
        val id = ch.int("id") ?: 0
        val name = ch.string("nameAr", "name")
        if (name.isNullOrBlank()) null else CpChampion(id, name, CpNormalizeUrl(ch.string("logo")))
    }
    return outlook.int("season") to champion
}

private fun CpParseInsights(root: JsonElement): CpInsights? {
    val o = root as? JsonObject ?: return null
    val signals = findArray(o, "signals").mapNotNull { s ->
        val so = s as? JsonObject ?: return@mapNotNull null
        CpSignal(
            key = so.string("key") ?: (so.string("title") ?: return@mapNotNull null),
            label = so.string("label") ?: "",
            title = so.string("title") ?: return@mapNotNull null,
            value = so.string("value") ?: so.int("value")?.toString() ?: "",
            subtitle = so.string("subtitle") ?: "",
            logo = CpNormalizeUrl(so.string("logo")),
            teamId = so.int("teamId"),
            playerId = so.int("playerId"),
        )
    }
    val name = o.obj("competition")?.string("nameAr", "name") ?: ""
    val subtitle = o.obj("summary")?.string("subtitle") ?: ""
    if (signals.isEmpty() && name.isBlank() && subtitle.isBlank()) return null
    return CpInsights(name, subtitle, signals)
}

private fun CpParseRounds(root: JsonElement): Pair<List<CpRound>, String?> {
    val o = root as? JsonObject ?: return emptyList<CpRound>() to null
    val rounds = findArray(o, "rounds").mapNotNull { r ->
        val ro = r as? JsonObject ?: return@mapNotNull null
        val key = ro.string("key") ?: return@mapNotNull null
        CpRound(key, ro.string("label") ?: key)
    }
    return rounds to o.string("current")
}

private fun CpParseTransfers(root: JsonElement): List<Transfer> {
    val o = root as? JsonObject
    // `transfers` موجز زمني (الأحدث أولًا). `topDeals` أعلى مبلغ — قديم/غير مناسب للتبويب.
    val array = (o?.get("transfers") as? JsonArray)
        ?: (o?.get("topDeals") as? JsonArray)
        ?: findArray(root, "transfers", "topDeals", "items")
    return array.mapNotNull(::parseTransfer)
        .sortedWith(compareByDescending(Transfer::date).thenByDescending(Transfer::id))
}

// البطولات السعودية التي تعرض تبويب الانتقالات (فيد /sports/transfers السعودي).
private val CpSaudiTransferSlugs = setOf("pro-league", "kings-cup")

// مفاتيح التبويبات
private const val CpTabOverview = "overview"
private const val CpTabGroups = "groups"
private const val CpTabStandings = "standings"
private const val CpTabBracket = "bracket"
private const val CpTabScorers = "scorers"
private const val CpTabAssists = "assists"
private const val CpTabCards = "cards"
private const val CpTabMatches = "matches"
private const val CpTabTransfers = "transfers"

private fun CpTabLabel(key: String): String = when (key) {
    CpTabOverview -> "نظرة"
    CpTabGroups -> "المجموعات"
    CpTabStandings -> "الترتيب"
    CpTabBracket -> "الأدوار"
    CpTabScorers -> "الهدّافون"
    CpTabAssists -> "الصنّاع"
    CpTabCards -> "البطاقات"
    CpTabMatches -> "المباريات"
    CpTabTransfers -> "الانتقالات"
    else -> key
}

// MARK: - شاشة تفاصيل البطولة

/// `initialTab`: 0 = نظرة (الافتراضي)، أي قيمة أكبر تفتح تبويب «المباريات» مباشرة
/// (نظير openOnMatches في iOS).
@Composable
fun CompetitionScreen(nav: NavHostController, vm: VaraViewModel, slug: String, initialTab: Int = 0) {
    val c = LocalVaraColors.current
    val context = LocalContext.current
    val isWorldCup = slug == "world-cup"
    val scope = rememberCoroutineScope()

    var d by remember(slug) { mutableStateOf(CpDetail(meta = CpCompCache.load(context).firstOrNull { it.slug == slug })) }
    var loading by remember(slug) { mutableStateOf(true) }
    var error by remember(slug) { mutableStateOf<String?>(null) }
    var refreshing by remember(slug) { mutableStateOf(false) }
    var revision by remember(slug) { mutableIntStateOf(0) }
    var tabKey by remember(slug) { mutableStateOf(if (initialTab > 0) CpTabMatches else CpTabOverview) }
    var selectedRound by remember(slug) { mutableStateOf<String?>(null) }
    var roundFixtures by remember(slug) { mutableStateOf<List<Fixture>>(emptyList()) }
    var roundLoading by remember(slug) { mutableStateOf(false) }

    suspend fun loadRound(key: String, force: Boolean) {
        roundLoading = true
        runCatching { vm.api.publicGet("/sports/$slug/round", mapOf("name" to key), ignoreCache = force) }
            .onSuccess { roundFixtures = findArray(it, "fixtures", "items").mapNotNull(::parseFixture) }
        roundLoading = false
    }

    /// تحديث حيّ خفيف: الترتيب + المباريات فقط بـignoreCache (نظير refreshLive).
    suspend fun refreshLive() {
        coroutineScope {
            if (isWorldCup) {
                val st = async { runCatching { vm.api.publicGet("/world-cup/standings", ignoreCache = true) }.getOrNull() }
                val fx = async { runCatching { vm.api.publicGet("/world-cup/fixtures", ignoreCache = true) }.getOrNull() }
                st.await()?.let { root -> CpParseWcGroups(root).takeIf { it.isNotEmpty() }?.let { d = d.copy(wcGroups = it) } }
                fx.await()?.let { root -> CpParseWcFixtures(root).takeIf { it.isNotEmpty() }?.let { d = d.copy(wcFixtures = it) } }
            } else {
                val st = async { runCatching { vm.api.publicGet("/sports/$slug/standings", ignoreCache = true) }.getOrNull() }
                val m = async { runCatching { vm.api.publicGet("/sports/$slug/matches", ignoreCache = true) }.getOrNull() }
                st.await()?.let { root -> CpParseStandings(root).takeIf { it.isNotEmpty() }?.let { d = d.copy(standings = it) } }
                m.await()?.let { root -> d = CpApplyMatches(d, root) }
            }
        }
    }

    // الجلب المتوازي — فشل نداء واحد لا يحجب الصفحة، والتحديث الفاشل لا يمحو المعروض.
    LaunchedEffect(slug, revision) {
        val force = revision > 0
        if (!d.hasAny) loading = true
        coroutineScope {
            val metaJob = async {
                runCatching { findArray(vm.api.publicGet("/sports/competitions"), "competitions", "items") }.getOrNull()
            }
            if (isWorldCup) {
                val fx = async { runCatching { vm.api.publicGet("/world-cup/fixtures", ignoreCache = force) }.getOrNull() }
                val st = async { runCatching { vm.api.publicGet("/world-cup/standings", ignoreCache = force) }.getOrNull() }
                val br = async { runCatching { vm.api.publicGet("/world-cup/bracket", ignoreCache = force) }.getOrNull() }
                val sc = async { runCatching { vm.api.publicGet("/world-cup/scorers", ignoreCache = force) }.getOrNull() }
                val asx = async { runCatching { vm.api.publicGet("/world-cup/assists", ignoreCache = force) }.getOrNull() }
                val cd = async { runCatching { vm.api.publicGet("/world-cup/cards", ignoreCache = force) }.getOrNull() }
                fx.await()?.let { d = d.copy(wcFixtures = CpParseWcFixtures(it)) }
                st.await()?.let { d = d.copy(wcGroups = CpParseWcGroups(it)) }
                // الترتيب والمباريات هما سطح الفتح — تُفتح الصفحة فور وصولهما.
                if (d.hasAny) loading = false
                br.await()?.let { root ->
                    val (rounds, columns) = CpParseBracket(root)
                    d = d.copy(wcBracketRounds = rounds, wcColumns = columns)
                }
                sc.await()?.let { d = d.copy(wcScorers = CpParseWcLeaders(it, "scorers", "leaders", "items")) }
                asx.await()?.let { d = d.copy(wcAssists = CpParseWcLeaders(it, "leaders", "assists", "items")) }
                cd.await()?.let { d = d.copy(wcCards = CpParseWcLeaders(it, "leaders", "cards", "items")) }
            } else {
                val matches = async { runCatching { vm.api.publicGet("/sports/$slug/matches", ignoreCache = force) }.getOrNull() }
                val standings = async { runCatching { vm.api.publicGet("/sports/$slug/standings", ignoreCache = force) }.getOrNull() }
                val scorers = async { runCatching { vm.api.publicGet("/sports/$slug/scorers", ignoreCache = force) }.getOrNull() }
                val assists = async { runCatching { vm.api.publicGet("/sports/$slug/assists", ignoreCache = force) }.getOrNull() }
                val outlook = async { runCatching { vm.api.publicGet("/sports/$slug/outlook", ignoreCache = force) }.getOrNull() }
                val insights = async { runCatching { vm.api.publicGet("/sports/$slug/insights", ignoreCache = force) }.getOrNull() }
                val rounds = async { runCatching { vm.api.publicGet("/sports/$slug/rounds", ignoreCache = force) }.getOrNull() }
                val transfers = if (slug in CpSaudiTransferSlugs) {
                    async { runCatching { vm.api.publicGet("/sports/transfers", mapOf("since" to "4"), ignoreCache = force) }.getOrNull() }
                } else null

                matches.await()?.let { d = CpApplyMatches(d, it) }
                standings.await()?.let { d = d.copy(standings = CpParseStandings(it)) }
                if (d.hasAny) loading = false
                scorers.await()?.let { root ->
                    d = d.copy(scorers = findArray(root, "scorers", "leaders", "items").mapNotNull { parseLeader(it) })
                }
                assists.await()?.let { root ->
                    d = d.copy(assists = findArray(root, "assists", "leaders", "items").mapNotNull { parseLeader(it, arrayOf("assists", "value", "total")) })
                }
                outlook.await()?.let { root ->
                    val (season, champion) = CpParseOutlook(root)
                    d = d.copy(outlookSeason = season ?: d.outlookSeason, champion = champion ?: d.champion)
                }
                insights.await()?.let { root -> CpParseInsights(root)?.let { d = d.copy(insights = it) } }
                transfers?.await()?.let { d = d.copy(transfers = CpParseTransfers(it)) }
                rounds.await()?.let { root ->
                    val (list, current) = CpParseRounds(root)
                    d = d.copy(rounds = list, currentRound = current)
                }
                // اختيار الدور الافتراضي: المُختار سابقًا ثم الجاري ثم الأول.
                val pick = selectedRound ?: d.currentRound ?: d.rounds.firstOrNull()?.key
                if (pick != null && (selectedRound == null || force)) {
                    selectedRound = pick
                    loadRound(pick, force)
                }
            }
            // الاسم/الشعار/الموسم/الحالة من ردّ الخادم — لا خرائط أسماء ثابتة.
            metaJob.await()?.let { raw ->
                val list = raw.mapNotNull(::CpParseComp)
                if (list.isNotEmpty()) {
                    CpCompCache.save(context, raw, list)
                    list.firstOrNull { it.slug == slug }?.let { d = d.copy(meta = it) }
                }
            }
        }
        error = if (d.hasAny) null else "تعذّر تحميل بيانات البطولة"
        loading = false
        refreshing = false
    }

    // استطلاع حيّ: 8ث عند مباراة/صف جارٍ، 30ث قرب الانطلاق، فحص خامل كل 60ث.
    val nearWindowMs = 30 * 60_000L
    val afterWindowMs = 3 * 60 * 60_000L
    fun cpPollIsLive(): Boolean {
        val fx = if (isWorldCup) d.wcFixtures else d.allFixtures
        return d.standings.any { it.live } || d.wcGroups.any { g -> g.rows.any { it.live } } || fx.any { it.status.live }
    }
    fun cpPollIsNear(): Boolean {
        val now = System.currentTimeMillis()
        val fx = if (isWorldCup) d.wcFixtures else d.allFixtures
        return fx.any { f ->
            val k = f.kickoffMs ?: return@any false
            !f.status.live && !f.status.finished && k - now <= nearWindowMs && now - k <= afterWindowMs
        }
    }
    PollEffect(
        slug,
        delayProvider = { if (cpPollIsLive()) 8_000L else if (cpPollIsNear()) 30_000L else 60_000L },
    ) { first ->
        if (first) return@PollEffect
        if (cpPollIsLive() || cpPollIsNear()) refreshLive()
    }

    // بيانات مشتقة للعرض
    val name = d.meta?.name
        ?: d.insights?.competitionName?.takeIf { it.isNotBlank() }
        ?: d.allFixtures.firstOrNull { it.competitionName.isNotBlank() }?.competitionName
        ?: if (isWorldCup) "كأس العالم" else slug
    val season = d.outlookSeason ?: d.meta?.season
    val tabs = remember(d, slug) {
        buildList {
            add(CpTabOverview)
            if (isWorldCup) {
                if (d.wcGroups.isNotEmpty()) add(CpTabGroups)
                add(CpTabMatches)
                if (d.wcColumns.isNotEmpty() || d.wcBracketRounds.isNotEmpty()) add(CpTabBracket)
                if (d.wcScorers.isNotEmpty()) add(CpTabScorers)
                if (d.wcAssists.isNotEmpty()) add(CpTabAssists)
                if (d.wcCards.isNotEmpty()) add(CpTabCards)
            } else {
                if (d.standings.isNotEmpty()) add(CpTabStandings)
                if (d.scorers.isNotEmpty()) add(CpTabScorers)
                if (d.assists.isNotEmpty()) add(CpTabAssists)
                add(CpTabMatches)
                if (slug in CpSaudiTransferSlugs && d.transfers.isNotEmpty()) add(CpTabTransfers)
            }
        }
    }
    val effectiveTab = if (tabKey in tabs) tabKey else CpTabOverview

    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(c.screenTop, c.screenBottom)))) {
        VaraPullRefresh(refreshing = refreshing, onRefresh = { refreshing = true; revision++ }) {
            LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                item { BackHeader(nav, name) }
                item { CpHero(d, name, season, isWorldCup) }
                if (loading && !d.hasAny) {
                    item { Box(Modifier.fillMaxWidth().height(160.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = c.accent) } }
                } else if (error != null && !d.hasAny) {
                    item {
                        val errState: LoadState<Unit> = LoadState.Error(error.orEmpty())
                        LoadStateHost(errState, { revision++ }) { }
                    }
                } else {
                    item { DetailTabs(tabs.map(::CpTabLabel), tabs.indexOf(effectiveTab)) { tabKey = tabs[it] } }
                    item {
                        // تبويب الانتقالات خارج العمود المبطّن — TransferRow المشترك
                        // يبطّن أفقيًا 16 داخليًا فلا نضاعفها.
                        if (effectiveTab == CpTabTransfers) {
                            CpTransfersContent(d.transfers, nav)
                        } else Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                            when (effectiveTab) {
                                CpTabOverview -> if (isWorldCup) {
                                    CpWcOverview(d, nav, openTab = { tabKey = it })
                                } else {
                                    CpOverview(d, season, nav, openTab = { tabKey = it })
                                }
                                CpTabGroups -> CpWcGroupsContent(d.wcGroups, nav)
                                CpTabStandings -> CpStandingsTable(d.standings, nav)
                                CpTabBracket -> CpWcBracketContent(d, nav)
                                CpTabScorers -> if (isWorldCup) {
                                    CpWcLeaderList(d.wcScorers, unit = "هدف", nav = nav) { l -> "${latinNumber(l.matches)} مباراة · ${latinNumber(l.assists)} صناعة" to l.goals }
                                } else {
                                    CpLeaderList(d.scorers, unit = "هدف", secondaryUnit = "صناعة", nav = nav)
                                }
                                CpTabAssists -> if (isWorldCup) {
                                    CpWcLeaderList(d.wcAssists, unit = "صناعة", nav = nav) { l -> "${latinNumber(l.matches)} مباراة · ${latinNumber(l.goals)} هدف" to l.assists }
                                } else {
                                    CpLeaderList(d.assists, unit = "صناعة", secondaryUnit = "هدف", nav = nav)
                                }
                                CpTabCards -> CpWcLeaderList(d.wcCards, unit = "بطاقة", nav = nav) { l -> "${latinNumber(l.yellow)} صفراء · ${latinNumber(l.red)} حمراء" to (l.yellow + l.red) }
                                CpTabMatches -> CpMatchesContent(
                                    d = d,
                                    isWorldCup = isWorldCup,
                                    selectedRound = selectedRound,
                                    roundFixtures = roundFixtures,
                                    roundLoading = roundLoading,
                                    onSelectRound = { key ->
                                        if (key != selectedRound) {
                                            selectedRound = key
                                            scope.launch { loadRound(key, force = false) }
                                        }
                                    },
                                    nav = nav,
                                )
                            }
                        }
                    }
                }
                item { Spacer(Modifier.height(20.dp)) }
            }
        }
    }
}

// MARK: - الترويسة البطلة

@Composable
private fun CpHero(d: CpDetail, name: String, season: Int?, isWorldCup: Boolean) {
    val c = LocalVaraColors.current
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp)
            .clip(RoundedCornerShape(22.dp)).background(c.surface)
            .border(1.dp, c.outline.copy(alpha = if (c.dark) 0f else 1f), RoundedCornerShape(22.dp))
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        if (!d.meta?.logo.isNullOrBlank()) {
            RemoteLogo(d.meta?.logo.orEmpty(), name, 64)
        } else {
            Box(Modifier.size(64.dp).clip(CircleShape).background(c.accent.copy(alpha = .10f)), contentAlignment = Alignment.Center) {
                Icon(Icons.Default.EmojiEvents, null, tint = c.accent, modifier = Modifier.size(28.dp))
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(name, color = c.text, fontSize = 22.sp, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (season != null) {
                    Icon(Icons.Default.CalendarMonth, null, tint = c.textDim, modifier = Modifier.size(12.dp))
                    ForceLtr { Text("$season/${season + 1}", color = c.textDim, fontSize = 12.sp, fontWeight = FontWeight.SemiBold) }
                }
                CpStatusInfo(d.meta?.status, c.gold, c.textFaint)?.let { (label, color) ->
                    Text(label, color = color, fontSize = 10.5.sp, fontWeight = FontWeight.Bold)
                }
            }
            if (d.standings.isNotEmpty()) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                    Icon(Icons.Default.Groups, null, tint = c.textFaint, modifier = Modifier.size(13.dp))
                    Text("${d.standings.size} ناديًا", color = c.textFaint, fontSize = 12.sp)
                }
            } else if (isWorldCup && d.wcGroups.isNotEmpty()) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                    Icon(Icons.Default.Flag, null, tint = c.textFaint, modifier = Modifier.size(13.dp))
                    Text("${d.wcGroups.sumOf { it.rows.size }} منتخبًا", color = c.textFaint, fontSize = 12.sp)
                }
            }
        }
    }
}

// MARK: - نظرة شاملة

@Composable
private fun CpOverview(d: CpDetail, season: Int?, nav: NavHostController, openTab: (String) -> Unit) {
    val c = LocalVaraColors.current
    // بانر البطل الذهبي (من outlook.champion)
    d.champion?.let { champ ->
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(c.surface)
                .border(1.dp, c.gold.copy(alpha = .45f), RoundedCornerShape(20.dp))
                .clickable(enabled = champ.id > 0) { nav.navigate("team/${champ.id}") }
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Icon(Icons.Default.EmojiEvents, null, tint = c.gold, modifier = Modifier.size(26.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(if (season != null) "بطل موسم $season/${season + 1}" else "بطل الموسم", color = c.gold, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                Text(champ.name, color = c.text, fontSize = 20.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            RemoteLogo(champ.logo, champ.name, 56)
        }
    }

    // بلاطات الحقائق: الموسم / الأندية / أهداف وصناعة المتصدّر
    val facts = buildList<Triple<String, String, Color?>> {
        if (season != null) add(Triple("$season/${season + 1}", "الموسم", c.accent))
        d.meta?.let { add(Triple(if (it.type == "cup") "كأس" else "دوري", "النوع", null)) }
        if (d.standings.isNotEmpty()) add(Triple("${d.standings.size}", "الأندية", null))
        d.scorers.firstOrNull()?.let { add(Triple("${it.value}", "أهداف المتصدّر", null)) }
        d.assists.firstOrNull()?.let { add(Triple("${it.value}", "صناعة المتصدّر", null)) }
    }
    if (facts.isNotEmpty()) {
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            facts.forEach { (value, label, tint) -> CpFactTile(value, label, tint) }
        }
    }

    // إشارات البطولة (insights) — بطاقات صغيرة قابلة للنقر (لاعب/فريق).
    d.insights?.takeIf { it.signals.isNotEmpty() }?.let { insights ->
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            SectionHeader("إشارات البطولة", subtitle = insights.summarySubtitle.ifBlank { null }, count = minOf(insights.signals.size, 6), icon = Icons.Default.AutoAwesome)
            insights.signals.take(6).chunked(2).forEach { pair ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    pair.forEach { signal -> CpSignalCard(signal, Modifier.weight(1f).widthIn(min = 0.dp), nav) }
                    if (pair.size == 1) Spacer(Modifier.weight(1f))
                }
            }
        }
    }

    // مقتطف الترتيب — أعلى 5 + زرّ الترتيب الكامل.
    if (d.standings.isNotEmpty()) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.FormatListNumbered, null, tint = c.accent, modifier = Modifier.size(14.dp))
                Spacer(Modifier.width(6.dp))
                Text("الترتيب", color = c.accent, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.weight(1f))
                TextButton({ openTab(CpTabStandings) }) {
                    Text("الترتيب الكامل", color = c.accent, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    Icon(Icons.Default.ChevronLeft, null, tint = c.accent, modifier = Modifier.size(12.dp))
                }
            }
            Column(Modifier.fillMaxWidth().clip(VaraTileShape).background(c.surface).padding(vertical = 6.dp)) {
                d.standings.take(5).forEachIndexed { idx, row ->
                    if (idx > 0) HorizontalDivider(color = c.outline.copy(alpha = .5f), modifier = Modifier.padding(start = 16.dp))
                    CpStandingRow(row, nav)
                }
            }
        }
    }

    // بطاقتا هدّاف/صانع البطولة.
    val scorer = d.scorers.firstOrNull()
    val assister = d.assists.firstOrNull()
    if (scorer != null || assister != null) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            scorer?.let { CpPerformerCard("هدّاف البطولة", it, "${it.value}", "هدف", Modifier.weight(1f), nav) }
            assister?.let { CpPerformerCard("صانع البطولة", it, "${it.value}", "صناعة", Modifier.weight(1f), nav) }
        }
    }

    // آخر النتائج (4) + زرّ كل المباريات.
    if (d.results.isNotEmpty()) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.CheckCircle, null, tint = c.accent, modifier = Modifier.size(14.dp))
                Spacer(Modifier.width(6.dp))
                Text("آخر النتائج", color = c.accent, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.weight(1f))
                TextButton({ openTab(CpTabMatches) }) {
                    Text("كل المباريات", color = c.accent, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
            }
            d.results.take(4).forEach { fx -> FixtureCard(fx, { nav.navigate("match/${fx.id}") }) }
        }
    }
}

@Composable
private fun CpWcOverview(d: CpDetail, nav: NavHostController, openTab: (String) -> Unit) {
    val c = LocalVaraColors.current
    val live = d.wcFixtures.count { it.status.live }
    val finished = d.wcFixtures.count { it.status.finished }
    val upcoming = d.wcFixtures.count { !it.status.live && !it.status.finished }

    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        CpFactTile("${d.wcGroups.size}", "المجموعات", c.accent, Modifier.weight(1f))
        CpFactTile("$live", "مباشر الآن", if (live > 0) c.live else null, Modifier.weight(1f))
        CpFactTile("$finished", "النتائج", null, Modifier.weight(1f))
        CpFactTile("$upcoming", "قادمة", null, Modifier.weight(1f))
    }

    if (d.wcGroups.isNotEmpty()) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.GridView, null, tint = c.accent, modifier = Modifier.size(14.dp))
                Spacer(Modifier.width(6.dp))
                Text("المجموعات", color = c.accent, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.weight(1f))
                TextButton({ openTab(CpTabGroups) }) {
                    Text("كل المجموعات", color = c.accent, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    Icon(Icons.Default.ChevronLeft, null, tint = c.accent, modifier = Modifier.size(12.dp))
                }
            }
            d.wcGroups.take(4).chunked(2).forEach { pair ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    pair.forEach { group -> CpWcGroupCard(group, compact = true, nav = nav, modifier = Modifier.weight(1f)) }
                    if (pair.size == 1) Spacer(Modifier.weight(1f))
                }
            }
        }
    }

    // أرقام اللاعبين: الهداف + صانع اللعب + أول البطاقات.
    val scorer = d.wcScorers.firstOrNull()
    val assister = d.wcAssists.firstOrNull()
    if (scorer != null || assister != null || d.wcCards.isNotEmpty()) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            SectionHeader("أرقام اللاعبين", icon = Icons.Default.TrendingUp)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                scorer?.let { CpWcPerformerCard("الهداف", it, "${it.goals}", "هدف", Modifier.weight(1f), nav) }
                assister?.let { CpWcPerformerCard("صانع اللعب", it, "${it.assists}", "صناعة", Modifier.weight(1f), nav) }
            }
            d.wcCards.firstOrNull()?.let { leader ->
                CpWcLeaderRow(leader, sub = "${latinNumber(leader.yellow)} صفراء · ${latinNumber(leader.red)} حمراء", value = leader.yellow + leader.red, unit = "بطاقة", nav = nav)
            }
        }
    }

    val results = d.wcFixtures.filter { it.status.finished }.sortedByDescending { it.timestamp ?: 0L }
    if (results.isNotEmpty()) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.CheckCircle, null, tint = c.accent, modifier = Modifier.size(14.dp))
                Spacer(Modifier.width(6.dp))
                Text("آخر النتائج", color = c.accent, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.weight(1f))
                TextButton({ openTab(CpTabMatches) }) {
                    Text("كل المباريات", color = c.accent, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
            }
            results.take(4).forEach { fx -> FixtureCard(fx, { nav.navigate("match/${fx.id}") }) }
        }
    }
}

@Composable
private fun CpFactTile(value: String, label: String, tint: Color?, modifier: Modifier = Modifier) {
    val c = LocalVaraColors.current
    Column(
        modifier.clip(VaraTileShape).background(c.surface)
            .border(1.dp, c.outline.copy(alpha = if (c.dark) 0f else .6f), VaraTileShape)
            .padding(horizontal = 14.dp, vertical = 11.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        ForceLtr { Text(value, color = tint ?: c.text, fontSize = 16.sp, fontWeight = FontWeight.Bold, maxLines = 1) }
        Text(label, color = c.textDim, fontSize = 10.sp, maxLines = 1)
    }
}

@Composable
private fun CpSignalCard(signal: CpSignal, modifier: Modifier, nav: NavHostController) {
    val c = LocalVaraColors.current
    Column(
        modifier
            .widthIn(min = 0.dp)
            .clip(VaraTileShape)
            .background(c.surface)
            .border(1.dp, c.outline.copy(alpha = if (c.dark) 0f else .6f), VaraTileShape)
            .clickable(enabled = signal.playerId != null || signal.teamId != null) {
                signal.playerId?.let { nav.navigate("player/$it") } ?: signal.teamId?.let { nav.navigate("team/$it") }
            }
            .padding(horizontal = 12.dp, vertical = 11.dp),
        verticalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        // الفئة — شارة صغيرة بلون المحور (منفصلة بصريًا عن باقي النص).
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            if (signal.logo.isNotBlank()) {
                RemoteLogo(signal.logo, signal.title, 22)
            } else {
                Box(
                    Modifier.size(22.dp).clip(CircleShape).background(c.accent.copy(alpha = .12f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Default.TrendingUp, null, tint = c.accent, modifier = Modifier.size(12.dp))
                }
            }
            Text(
                signal.label,
                color = c.accent,
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier
                    .clip(CircleShape)
                    .background(c.accent.copy(alpha = .10f))
                    .padding(horizontal = 8.dp, vertical = 3.dp),
            )
        }
        // القيمة — البطل البصري (لون محور + حجم أوضح).
        Text(
            signal.value,
            color = c.accent,
            fontSize = 17.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        // الاسم — طبقة ثانية بلون النص الأساسي.
        Text(
            signal.title,
            color = c.text,
            fontSize = 12.5.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            lineHeight = 16.sp,
        )
        if (signal.subtitle.isNotBlank()) {
            Text(
                signal.subtitle,
                color = c.textFaint,
                fontSize = 10.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun CpPerformerCard(title: String, p: Leader, value: String, unit: String, modifier: Modifier, nav: NavHostController) {
    CpPerformerCardBody(title, p.image, p.name, p.team, value, unit, modifier) { if (p.id > 0) nav.navigate("player/${p.id}") }
}

@Composable
private fun CpWcPerformerCard(title: String, p: CpWcLeader, value: String, unit: String, modifier: Modifier, nav: NavHostController) {
    CpPerformerCardBody(title, p.photo, p.name, p.team, value, unit, modifier) { if (p.id > 0) nav.navigate("player/${p.id}") }
}

@Composable
private fun CpPerformerCardBody(title: String, photo: String, name: String, team: String, value: String, unit: String, modifier: Modifier, open: () -> Unit) {
    val c = LocalVaraColors.current
    Column(
        modifier.clip(VaraTileShape).background(c.surface)
            .border(1.dp, c.outline.copy(alpha = if (c.dark) 0f else .6f), VaraTileShape)
            .clickable(onClick = open)
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(title, color = c.accent, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            RemoteLogo(photo, name, 44)
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(name, color = c.text, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(team, color = c.textDim, fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            ForceLtr { Text(value, color = c.accent, fontSize = 24.sp, fontWeight = FontWeight.Bold) }
            Text(unit, color = c.textFaint, fontSize = 11.sp, modifier = Modifier.padding(bottom = 3.dp))
        }
    }
}

// MARK: - الترتيب

@Composable
private fun CpStandingsTable(rows: List<Standing>, nav: NavHostController) {
    val c = LocalVaraColors.current
    if (rows.isEmpty()) {
        EmptyState("لا يتوفّر ترتيب", "قد يكون الموسم لم يبدأ بعد")
        return
    }
    Column(Modifier.fillMaxWidth().clip(VaraTileShape).background(c.surface).padding(vertical = 8.dp)) {
        // رأس الأعمدة: # / النادي / لعب / +/- / نقاط
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("#", color = c.textFaint, fontSize = 10.sp, modifier = Modifier.width(40.dp))
            Text("النادي", color = c.textFaint, fontSize = 10.sp, modifier = Modifier.weight(1f))
            Text("لعب", color = c.textFaint, fontSize = 10.sp, modifier = Modifier.width(32.dp))
            Text("+/-", color = c.textFaint, fontSize = 10.sp, modifier = Modifier.width(40.dp))
            Text("نقاط", color = c.textFaint, fontSize = 10.sp, modifier = Modifier.width(36.dp))
        }
        rows.forEachIndexed { idx, row ->
            if (idx > 0) HorizontalDivider(color = c.outline.copy(alpha = .5f), modifier = Modifier.padding(start = 16.dp))
            CpStandingRow(row, nav)
        }
    }
}

@Composable
private fun CpStandingRow(row: Standing, nav: NavHostController) {
    val c = LocalVaraColors.current
    val isChampion = row.rank == 1
    val delta = row.liveDelta ?: 0
    Row(
        Modifier.fillMaxWidth()
            .background(
                when {
                    row.live -> c.live.copy(alpha = .04f)
                    isChampion -> c.gold.copy(alpha = .06f)
                    else -> Color.Transparent
                },
            )
            .clickable(enabled = row.team.id > 0) { nav.navigate("team/${row.team.id}") }
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(Modifier.width(40.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            if (isChampion) Icon(Icons.Default.EmojiEvents, null, tint = c.gold, modifier = Modifier.size(10.dp))
            Text("${row.rank}", color = if (row.rank <= 3) c.accent else c.textFaint, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            if (row.live) {
                Icon(
                    if (delta > 0) Icons.Default.ArrowUpward else if (delta < 0) Icons.Default.ArrowDownward else Icons.Default.Remove,
                    null,
                    tint = if (delta > 0) CpGreen else if (delta < 0) c.live else c.textFaint,
                    modifier = Modifier.size(9.dp),
                )
            }
        }
        Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            RemoteLogo(row.team.logo, row.team.name, 26)
            Text(
                row.team.name,
                color = c.text, fontSize = 13.sp,
                fontWeight = if (isChampion) FontWeight.Bold else FontWeight.SemiBold,
                maxLines = 1, overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f, fill = false),
            )
            if (row.live) CpLiveBadge()
        }
        Text("${row.played}", color = c.textDim, fontSize = 13.sp, modifier = Modifier.width(32.dp))
        ForceLtr {
            Text(if (row.goalsDiff > 0) "+${row.goalsDiff}" else "${row.goalsDiff}", color = c.textDim, fontSize = 13.sp, modifier = Modifier.width(40.dp))
        }
        Text("${row.points}", color = c.text, fontSize = 15.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(36.dp))
    }
}

@Composable
private fun CpLiveBadge(small: Boolean = false) {
    val c = LocalVaraColors.current
    Text(
        "مباشر",
        color = Color.White,
        fontSize = if (small) 8.sp else 9.sp,
        fontWeight = FontWeight.Bold,
        modifier = Modifier.clip(CircleShape).background(c.live).padding(horizontal = 6.dp, vertical = 1.dp),
    )
}

// MARK: - مجموعات المونديال

@Composable
private fun CpWcGroupsContent(groups: List<CpWcGroup>, nav: NavHostController) {
    if (groups.isEmpty()) {
        EmptyState("لا تتوفر المجموعات", "ستظهر فور تحديث بيانات البطولة")
        return
    }
    groups.forEach { group -> CpWcGroupCard(group, compact = false, nav = nav) }
}

@Composable
private fun CpWcGroupCard(group: CpWcGroup, compact: Boolean, nav: NavHostController, modifier: Modifier = Modifier) {
    val c = LocalVaraColors.current
    Column(
        modifier.fillMaxWidth().clip(VaraTileShape).background(c.surface)
            .border(1.dp, c.outline.copy(alpha = if (c.dark) 0f else .6f), VaraTileShape)
            .padding(if (compact) 10.dp else 14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(group.name, color = c.accent, fontSize = if (compact) 13.sp else 16.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            if (group.rows.any { it.live }) CpLiveBadge()
        }
        Column {
            group.rows.forEachIndexed { idx, row ->
                if (idx > 0) HorizontalDivider(color = c.outline.copy(alpha = .5f))
                CpWcGroupRow(row, compact, nav)
            }
        }
    }
}

@Composable
private fun CpWcGroupRow(row: Standing, compact: Boolean, nav: NavHostController) {
    val c = LocalVaraColors.current
    val delta = row.liveDelta ?: 0
    Row(
        Modifier.fillMaxWidth()
            .background(if (row.live) c.live.copy(alpha = .04f) else Color.Transparent)
            .clickable(enabled = row.team.id > 0) { nav.navigate("team/${row.team.id}") }
            .padding(vertical = if (compact) 5.dp else 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(if (compact) 6.dp else 9.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            Text("${row.rank}", color = if (row.rank <= 2) c.accent else c.textFaint, fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(18.dp))
            if (row.live) {
                Icon(
                    if (delta > 0) Icons.Default.ArrowUpward else if (delta < 0) Icons.Default.ArrowDownward else Icons.Default.Remove,
                    null,
                    tint = if (delta > 0) CpGreen else if (delta < 0) c.live else c.textFaint,
                    modifier = Modifier.size(8.dp),
                )
            }
        }
        RemoteLogo(row.team.logo, row.team.name, if (compact) 18 else 24)
        Text(
            row.team.name,
            color = c.text,
            fontSize = if (compact) 11.5.sp else 13.sp,
            fontWeight = if (row.rank <= 2) FontWeight.Bold else FontWeight.SemiBold,
            maxLines = 1, overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f, fill = false),
        )
        if (row.live) CpLiveBadge(small = true)
        Spacer(Modifier.weight(1f))
        Text("${row.played}", color = c.textFaint, fontSize = 11.sp, modifier = Modifier.width(22.dp))
        Text("${row.points}", color = c.text, fontSize = if (compact) 12.sp else 14.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(28.dp))
    }
}

// MARK: - إقصائيات المونديال

@Composable
private fun CpWcBracketContent(d: CpDetail, nav: NavHostController) {
    val c = LocalVaraColors.current
    if (d.wcColumns.isNotEmpty()) {
        // الشكل الشجري tree.columns — أعمدة أفقية قابلة للتمرير.
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            d.wcColumns.forEach { column ->
                Column(Modifier.width(230.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(column.label, color = c.accent, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    column.slots.forEach { slot -> CpBracketSlotCard(slot, nav) }
                }
            }
        }
    } else if (d.wcBracketRounds.isNotEmpty()) {
        // احتياطي: أدوار مرتبة بعناوينها وكل مواجهة صف قابل للنقر يفتح المباراة.
        d.wcBracketRounds.forEach { round ->
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                SectionHeader(round.round, count = round.matches.size, icon = Icons.Default.EmojiEvents, tint = c.gold)
                round.matches.forEach { fx -> FixtureCard(fx, { nav.navigate("match/${fx.id}") }) }
            }
        }
    } else {
        EmptyState("الأدوار لم تكتمل", "تظهر شجرة خروج المغلوب عند توفر مبارياتها")
    }
}

@Composable
private fun CpBracketSlotCard(slot: CpWcSlot, nav: NavHostController) {
    val c = LocalVaraColors.current
    val fx = slot.fixture
    val started = fx != null && (fx.status.live || fx.status.finished)
    Column(
        Modifier.fillMaxWidth().clip(VaraTileShape).background(c.surface)
            .border(1.dp, c.outline.copy(alpha = if (c.dark) 0f else .6f), VaraTileShape)
            .clickable(enabled = fx != null) { fx?.let { nav.navigate("match/${it.id}") } }
            .padding(10.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        CpBracketSide(slot.topName, slot.topLogo, if (started) fx?.homeScore else null)
        HorizontalDivider(color = c.outline.copy(alpha = .5f))
        CpBracketSide(slot.bottomName, slot.bottomLogo, if (started) fx?.awayScore else null)
        if (fx != null && !started) {
            Text(com.sabq.vara.core.fixtureKickoff(fx), color = c.textFaint, fontSize = 9.sp, maxLines = 1)
        } else if (fx != null && fx.status.live) {
            CpLiveBadge(small = true)
        }
    }
}

@Composable
private fun CpBracketSide(name: String, logo: String, score: Int?) {
    val c = LocalVaraColors.current
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
        RemoteLogo(logo, name, 22)
        Text(name, color = c.text, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        if (score != null) Text("$score", color = c.text, fontSize = 13.sp, fontWeight = FontWeight.Bold)
    }
}

// MARK: - الهدّافون / الصنّاع / البطاقات

@Composable
private fun CpLeaderList(rows: List<Leader>, unit: String, secondaryUnit: String, nav: NavHostController) {
    if (rows.isEmpty()) {
        EmptyState(if (unit == "هدف") "لا يتوفّر هدّافون" else "لا يتوفّر صنّاع", "قد يكون الموسم لم يبدأ بعد")
        return
    }
    rows.forEachIndexed { index, l ->
        CpRankedRow(
            rank = l.rank ?: (index + 1),
            photo = l.image,
            name = l.name,
            teamLogo = l.teamLogo,
            sub = "${latinNumber(l.matches ?: 0)} مباراة · ${latinNumber(l.secondary ?: 0)} $secondaryUnit",
            value = l.value,
            unit = unit,
            open = { if (l.id > 0) nav.navigate("player/${l.id}") },
        )
    }
}

@Composable
private fun CpWcLeaderList(rows: List<CpWcLeader>, unit: String, nav: NavHostController, line: (CpWcLeader) -> Pair<String, Int>) {
    if (rows.isEmpty()) {
        when (unit) {
            "هدف" -> EmptyState("لا يتوفّر هدّافون", "ستظهر القائمة بعد بداية البطولة")
            "صناعة" -> EmptyState("لا يتوفّر صنّاع", "ستظهر القائمة بعد تسجيل أول صناعة")
            else -> EmptyState("لا تتوفر البطاقات", "ستظهر بعد بداية مباريات البطولة")
        }
        return
    }
    rows.forEach { l ->
        val (sub, value) = line(l)
        CpWcLeaderRow(l, sub, value, unit, nav)
    }
}

@Composable
private fun CpWcLeaderRow(l: CpWcLeader, sub: String, value: Int, unit: String, nav: NavHostController) {
    CpRankedRow(
        rank = l.rank,
        photo = l.photo,
        name = l.name,
        teamLogo = l.teamLogo,
        sub = sub,
        value = value,
        unit = unit,
        open = { if (l.id > 0) nav.navigate("player/${l.id}") },
    )
}

/// صفّ متصدّر برتبة الخادم + صورة + شعار الفريق + سطر تفصيلي + القيمة/الوحدة.
@Composable
private fun CpRankedRow(rank: Int, photo: String, name: String, teamLogo: String, sub: String, value: Int, unit: String, open: () -> Unit) {
    val c = LocalVaraColors.current
    Row(
        Modifier.fillMaxWidth().clip(VaraTileShape).background(c.surface)
            .border(1.dp, c.outline.copy(alpha = if (c.dark) 0f else .6f), VaraTileShape)
            .clickable(onClick = open)
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("$rank", color = if (rank in 1..3) c.accent else c.textFaint, fontSize = 13.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(22.dp))
        RemoteLogo(photo, name, 38)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(name, color = c.text, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                if (teamLogo.isNotBlank()) RemoteLogo(teamLogo, "", 14)
                Text(sub, color = c.textDim, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Text("$value", color = c.accent, fontSize = 18.sp, fontWeight = FontWeight.Bold)
            Text(unit, color = c.textFaint, fontSize = 9.sp)
        }
    }
}

// MARK: - المباريات

@Composable
private fun CpMatchesContent(
    d: CpDetail,
    isWorldCup: Boolean,
    selectedRound: String?,
    roundFixtures: List<Fixture>,
    roundLoading: Boolean,
    onSelectRound: (String) -> Unit,
    nav: NavHostController,
) {
    val c = LocalVaraColors.current
    if (isWorldCup) {
        val now = System.currentTimeMillis()
        val today = VaraFormat.today()
        val live = d.wcFixtures.filter { it.status.live }.sortedBy { it.timestamp ?: 0L }
        val todayList = d.wcFixtures.filter { fx ->
            !fx.status.live && !fx.status.finished &&
                VaraFormat.instantOf(fx)?.let { VaraFormat.localDate(it) == today } == true
        }.sortedBy { it.timestamp ?: 0L }
        val upcoming = d.wcFixtures.filter { fx -> !fx.status.live && !fx.status.finished && (fx.kickoffMs ?: 0L) > now }
            .sortedBy { it.timestamp ?: 0L }
        val results = d.wcFixtures.filter { it.status.finished }.sortedByDescending { it.timestamp ?: 0L }
        if (d.wcFixtures.isEmpty()) {
            EmptyState("لا مباريات", "لم تصل بيانات جدول كأس العالم بعد")
        } else {
            CpMatchBucket("مباشر الآن", live, c.live, Icons.Default.Sensors, nav)
            CpMatchBucket("اليوم", todayList, c.accent, Icons.Default.CalendarMonth, nav)
            CpUpcomingBucket(upcoming, c.accent, nav)
            CpMatchBucket("النتائج", results, c.textDim, Icons.Default.CheckCircle, nav)
        }
        return
    }

    val hasBuckets = d.live.isNotEmpty() || d.today.isNotEmpty() || d.upcoming.isNotEmpty() || d.results.isNotEmpty()
    if (d.rounds.isNotEmpty()) {
        CpRoundsBrowser(d.rounds, d.currentRound, selectedRound, roundFixtures, roundLoading, onSelectRound, nav)
    }
    when {
        hasBuckets -> {
            CpMatchBucket("مباشر الآن", d.live, c.live, Icons.Default.Sensors, nav)
            CpMatchBucket("اليوم", d.today, c.accent, Icons.Default.CalendarMonth, nav)
            CpUpcomingBucket(d.upcoming, c.accent, nav)
            CpMatchBucket("النتائج", d.results, c.textDim, Icons.Default.CheckCircle, nav)
        }
        d.rounds.isEmpty() && d.matchesLoaded -> EmptyState("لا مباريات", "لا توجد مباريات متاحة حاليًا لهذه البطولة")
        d.rounds.isEmpty() -> EmptyState("تعذّر جلب المباريات", "حاول التحديث بالسحب للأسفل")
    }
}

/// متصفح الأدوار — شرائح أفقية بمؤشر «الجاري الآن»؛ النقر يجلب مباريات الدور.
@Composable
private fun CpRoundsBrowser(
    rounds: List<CpRound>,
    currentRound: String?,
    selectedRound: String?,
    roundFixtures: List<Fixture>,
    roundLoading: Boolean,
    onSelectRound: (String) -> Unit,
    nav: NavHostController,
) {
    val c = LocalVaraColors.current
    Column(
        Modifier.fillMaxWidth().clip(VaraTileShape).background(c.surface)
            .border(1.dp, c.outline.copy(alpha = if (c.dark) 0f else .6f), VaraTileShape)
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.EmojiEvents, null, tint = c.accent, modifier = Modifier.size(14.dp))
            Spacer(Modifier.width(6.dp))
            Text("أدوار البطولة", color = c.accent, fontSize = 15.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.weight(1f))
            if (currentRound != null) Text("الجاري الآن", color = c.accent, fontSize = 10.sp, fontWeight = FontWeight.Bold)
        }
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            rounds.forEach { round ->
                val active = round.key == selectedRound
                Row(
                    Modifier.clip(CircleShape)
                        .background(if (active) c.accent else c.chip)
                        .clickable { onSelectRound(round.key) }
                        .padding(horizontal = 12.dp, vertical = 7.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(5.dp),
                ) {
                    // نقطة «الجاري الآن» على شريحة الدور الحالي.
                    if (round.key == currentRound) {
                        Box(Modifier.size(5.dp).clip(CircleShape).background(if (active) Color.White else c.accent))
                    }
                    Text(round.label, color = if (active) Color.White else c.textDim, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
        when {
            roundLoading -> Box(Modifier.fillMaxWidth().padding(vertical = 12.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = c.accent, modifier = Modifier.size(24.dp))
            }
            roundFixtures.isNotEmpty() -> Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Icon(Icons.Default.CalendarMonth, null, tint = c.accent, modifier = Modifier.size(12.dp))
                    Text(
                        rounds.firstOrNull { it.key == selectedRound }?.label ?: selectedRound.orEmpty(),
                        color = c.textDim, fontSize = 13.sp, fontWeight = FontWeight.Bold,
                    )
                }
                roundFixtures.forEach { fx -> FixtureCard(fx, { nav.navigate("match/${fx.id}") }) }
            }
            selectedRound != null -> EmptyState("لا مباريات", "لا توجد مباريات معتمدة لهذا الدور بعد")
        }
    }
}

@Composable
private fun CpMatchBucket(title: String, items: List<Fixture>, tint: Color, icon: ImageVector, nav: NavHostController) {
    if (items.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        SectionHeader(title, count = items.size, icon = icon, tint = tint)
        items.forEach { fx -> FixtureCard(fx, { nav.navigate("match/${fx.id}") }) }
    }
}

/// دلو «قادمة» بتجميع يومي برؤوس VaraFormat.dateLabel (توقيت الرياض).
@Composable
private fun CpUpcomingBucket(items: List<Fixture>, tint: Color, nav: NavHostController) {
    if (items.isEmpty()) return
    val grouped = items.mapNotNull { fx -> VaraFormat.instantOf(fx)?.let { VaraFormat.localDate(it) to fx } }
        .groupBy({ it.first }, { it.second })
        .toSortedMap()
    val undated = items.filter { VaraFormat.instantOf(it) == null }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        SectionHeader("قادمة", count = items.size, icon = Icons.Default.Schedule, tint = tint)
        grouped.forEach { (date, fixtures) ->
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                DateSectionBanner(
                    label = VaraFormat.dateLabel(date),
                    count = fixtures.size,
                    tint = tint,
                )
                fixtures.sortedBy { it.timestamp ?: 0L }.forEach { fx -> FixtureCard(fx, { nav.navigate("match/${fx.id}") }) }
            }
        }
        undated.forEach { fx -> FixtureCard(fx, { nav.navigate("match/${fx.id}") }) }
    }
}

// MARK: - الانتقالات

@Composable
private fun CpTransfersContent(transfers: List<Transfer>, nav: NavHostController) {
    if (transfers.isEmpty()) {
        EmptyState("لا انتقالات", "لا توجد صفقات معلنة حاليًا")
        return
    }
    // TransferRow المشترك يبطّن أفقيًا 16 داخليًا — يُستدعى بلا عمود مبطّن.
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        transfers.forEach { t ->
            TransferRow(t) { t.playerId?.let { id -> nav.navigate("transfer-story/$id") } }
        }
    }
}
