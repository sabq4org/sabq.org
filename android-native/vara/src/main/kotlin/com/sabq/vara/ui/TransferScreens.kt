package com.sabq.vara.ui

// «مركز الانتقالات» و«قصة الانتقال» — نظير 1:1 لـTransferCenterView.swift (1424)
// وTransferCenterModels.swift (328) بثيم VARA:
//   • Hero: أضخم القصص الجارية  • عدّادا نافذتي الانتقالات
//   • تبويبا نطاق (سعودية/عالمية) × نوع (مؤكّدة/إشاعات/إعارات/تجديد)
//   • مقياس احتمال بصري + مصدر إلزامي بمؤشر موثوقية + وسم مؤكّد/إشاعة صريح
//   • إحصائيات السوق: مقارنة روشن/البريميرليغ + ميزان أندية روشن
// المؤكّد السعودي من /sports/transfers (since=4، بلا إعارات في «مؤكّدة»)،
// والباقي من /transfer-center/*. النقر يفتح القصة من الإشاعات/الهيرو فقط.
// الأرقام: الرقم ثم رمز العملة — «85 مليون €». كل المساعدات private ببادئة Tc.

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Autorenew
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.CompareArrows
import androidx.compose.material.icons.filled.GppMaybe
import androidx.compose.material.icons.filled.HistoryEdu
import androidx.compose.material.icons.filled.HourglassEmpty
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material.icons.filled.Newspaper
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.SwapHorizontalCircle
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import coil.compose.AsyncImage
import com.sabq.vara.core.VaraFormat
import com.sabq.vara.core.VaraViewModel
import com.sabq.vara.core.array
import com.sabq.vara.core.bool
import com.sabq.vara.core.findArray
import com.sabq.vara.core.int
import com.sabq.vara.core.obj
import com.sabq.vara.core.string
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import java.time.Instant
import java.time.LocalDate
import java.time.Period
import java.util.Locale

// MARK: - نماذج (نظير TransferCenterModels.swift — فكّ يدوي من JsonObject)

private data class TcParty(val id: Int, val name: String, val image: String, val leagueName: String, val saudi: Boolean)
private data class TcPlayerInfo(val id: Int, val name: String, val image: String, val position: String, val birthdate: String)
private data class TcSource(val name: String, val url: String, val tier: String)

private data class TcRumour(
    val id: Int,
    val date: String,
    // درجة نصية من المزوّد: LOW | MEDIUM | HIGH | IMMINENT.
    val probability: String,
    // transfer | loan | extension.
    val kind: String,
    val amount: Double?,
    val currency: String?,
    val source: TcSource,
    val hereWeGo: Boolean,
    val player: TcPlayerInfo,
    val from: TcParty,
    val to: TcParty,
    val saudi: Boolean,
)

private data class TcConfirmedItem(
    val id: Int,
    val date: String,
    // transfer | loan | free.
    val kind: String,
    val amount: Double?,
    val currency: String?,
    val player: TcPlayerInfo,
    val from: TcParty,
    val to: TcParty,
    val saudi: Boolean,
    val major: Boolean,
)

/// صفقة سعودية مؤكّدة من /sports/transfers — نظير SpLeagueTransfer.
private data class TcSaudiDeal(
    val id: String,
    val date: String,
    // النص العربي الجاهز (يحمل المبلغ/النوع).
    val typeAr: String,
    // permanent | loan | free | loanend | …
    val kind: String,
    val playerId: Int,
    val playerName: String,
    val fromName: String,
    val fromLogo: String,
    val toName: String,
    val toLogo: String,
    val inClubId: Int?,
    val outClubId: Int?,
)

private data class TcWindowInfo(val label: String, val opensAt: String, val closesAt: String)
private data class TcComparisonSide(val total: Double, val deals: Int)
private data class TcComparisonInfo(val basis: String, val roshn: TcComparisonSide, val premierLeague: TcComparisonSide)
private data class TcClubBalanceRow(val clubId: Int, val club: String, val logo: String, val spent: Double, val earned: Double)
private data class TcOverviewInfo(
    val hero: List<TcRumour>,
    // [السعودية، أوروبا] بالترتيب.
    val windows: List<TcWindowInfo>,
    val comparison: TcComparisonInfo?,
    val clubBalance: List<TcClubBalanceRow>,
)
private data class TcStoryInfo(val found: Boolean, val player: TcPlayerInfo?, val timeline: List<TcRumour>)
private data class TcRelatedArticle(val id: String, val title: String, val slug: String, val imageUrl: String, val publishedAt: String)

// MARK: - الفكّ

private fun tcDouble(o: JsonObject, vararg keys: String): Double? = keys.firstNotNullOfOrNull { key ->
    (o[key] as? JsonPrimitive)?.contentOrNull?.toDoubleOrNull()
}

private fun tcParseParty(e: JsonElement?): TcParty {
    val o = e as? JsonObject ?: return TcParty(0, "", "", "", false)
    return TcParty(
        id = o.int("id") ?: 0,
        name = o.string("name") ?: "",
        image = o.string("image") ?: "",
        leagueName = o.string("leagueName") ?: "",
        saudi = o.bool("saudi") ?: false,
    )
}

private fun tcParsePlayer(e: JsonElement?): TcPlayerInfo? {
    val o = e as? JsonObject ?: return null
    return TcPlayerInfo(
        id = o.int("id") ?: return null,
        name = o.string("name") ?: return null,
        image = o.string("image") ?: "",
        position = o.string("position") ?: "",
        birthdate = o.string("birthdate") ?: "",
    )
}

private fun tcParseSource(e: JsonElement?): TcSource {
    val o = e as? JsonObject ?: return TcSource("", "", "medium")
    return TcSource(name = o.string("name") ?: "", url = o.string("url") ?: "", tier = o.string("tier") ?: "medium")
}

private fun tcParseRumour(e: JsonElement): TcRumour? {
    val o = e as? JsonObject ?: return null
    return TcRumour(
        id = o.int("id") ?: return null,
        date = o.string("date") ?: "",
        probability = (o.string("probability") ?: "LOW").uppercase(),
        kind = o.string("kind") ?: "transfer",
        amount = tcDouble(o, "amount"),
        currency = o.string("currency"),
        source = tcParseSource(o["source"]),
        hereWeGo = o.bool("hereWeGo") ?: false,
        player = tcParsePlayer(o["player"]) ?: return null,
        from = tcParseParty(o["from"]),
        to = tcParseParty(o["to"]),
        saudi = o.bool("saudi") ?: false,
    )
}

private fun tcParseConfirmed(e: JsonElement): TcConfirmedItem? {
    val o = e as? JsonObject ?: return null
    return TcConfirmedItem(
        id = o.int("id") ?: return null,
        date = o.string("date") ?: "",
        kind = o.string("kind") ?: "transfer",
        amount = tcDouble(o, "amount"),
        currency = o.string("currency"),
        player = tcParsePlayer(o["player"]) ?: return null,
        from = tcParseParty(o["from"]),
        to = tcParseParty(o["to"]),
        saudi = o.bool("saudi") ?: false,
        major = o.bool("major") ?: false,
    )
}

private fun tcParseSaudiDeal(e: JsonElement): TcSaudiDeal? {
    val o = e as? JsonObject ?: return null
    val player = o.obj("player") ?: return null
    val from = o.obj("from")
    val to = o.obj("to")
    return TcSaudiDeal(
        id = o.string("id") ?: return null,
        date = o.string("date") ?: "",
        typeAr = o.string("type") ?: "",
        kind = o.string("kind") ?: "",
        playerId = player.int("id") ?: 0,
        playerName = player.string("name") ?: return null,
        fromName = from?.string("name") ?: "",
        fromLogo = from?.string("logo") ?: "",
        toName = to?.string("name") ?: "",
        toLogo = to?.string("logo") ?: "",
        inClubId = o.int("inClubId"),
        outClubId = o.int("outClubId"),
    )
}

private fun tcParseWindow(e: JsonElement?): TcWindowInfo? {
    val o = e as? JsonObject ?: return null
    return TcWindowInfo(
        label = o.string("label") ?: return null,
        opensAt = o.string("opensAt") ?: "",
        closesAt = o.string("closesAt") ?: "",
    )
}

private fun tcParseOverview(root: JsonObject): TcOverviewInfo {
    val windowsObj = root.obj("windows")
    val comparison = root.obj("comparison")?.let { comp ->
        val roshn = comp.obj("roshn")
        val premier = comp.obj("premierLeague")
        if (roshn == null || premier == null) null else TcComparisonInfo(
            basis = comp.string("basis") ?: "confirmed",
            roshn = TcComparisonSide(tcDouble(roshn, "total") ?: 0.0, roshn.int("deals") ?: 0),
            premierLeague = TcComparisonSide(tcDouble(premier, "total") ?: 0.0, premier.int("deals") ?: 0),
        )
    }
    return TcOverviewInfo(
        hero = root.array("hero")?.mapNotNull(::tcParseRumour) ?: emptyList(),
        windows = listOfNotNull(tcParseWindow(windowsObj?.get("saudi")), tcParseWindow(windowsObj?.get("europe"))),
        comparison = comparison,
        clubBalance = root.array("clubBalance")?.mapNotNull { e ->
            val o = e as? JsonObject ?: return@mapNotNull null
            TcClubBalanceRow(
                clubId = o.int("clubId") ?: 0,
                club = o.string("club") ?: return@mapNotNull null,
                logo = o.string("logo") ?: "",
                spent = tcDouble(o, "spent") ?: 0.0,
                earned = tcDouble(o, "earned") ?: 0.0,
            )
        } ?: emptyList(),
    )
}

private fun tcParseStory(root: JsonObject): TcStoryInfo = TcStoryInfo(
    found = root.bool("found") ?: false,
    player = tcParsePlayer(root["player"]),
    timeline = root.array("timeline")?.mapNotNull(::tcParseRumour) ?: emptyList(),
)

private fun tcParseRelated(e: JsonElement): TcRelatedArticle? {
    val o = e as? JsonObject ?: return null
    return TcRelatedArticle(
        id = o.string("id") ?: return null,
        title = o.string("title") ?: return null,
        slug = o.string("slug") ?: "",
        imageUrl = o.string("imageUrl") ?: "",
        publishedAt = o.string("publishedAt") ?: "",
    )
}

// MARK: - تنسيق المال والتاريخ والاحتمال

/// «85 مليون €» / «500 ألف €» — الرقم ثم الوحدة ثم رمز العملة (نظير TcMoney).
private fun tcMoney(amount: Double?, currency: String?): String? {
    if (amount == null || !amount.isFinite() || amount <= 0) return null
    val sym = when ((currency ?: "EUR").uppercase()) {
        "GBP" -> "£"; "USD" -> "$"; "SAR" -> "ر.س"; else -> "€"
    }
    return when {
        amount >= 1_000_000 -> {
            val millions = amount / 1_000_000
            val num = if (millions % 1.0 == 0.0) "${millions.toInt()}" else String.format(Locale.US, "%.1f", millions)
            "$num مليون $sym"
        }
        amount >= 1_000 -> "${Math.round(amount / 1_000)} ألف $sym"
        else -> "${amount.toInt()} $sym"
    }
}

/// «5 يوليو 2026» عربي/ميلادي/لاتيني بتوقيت الرياض (نظير TcDate.medium).
private fun tcDateMedium(iso: String): String {
    if (iso.length < 10) return iso
    val date = runCatching { LocalDate.parse(iso.take(10)) }.getOrNull() ?: return iso
    return VaraFormat.mediumDate(date.atStartOfDay(VaraFormat.riyadh).toInstant())
}

/// العمر المحسوب من تاريخ الميلاد (null عند غيابه/تعذّره).
private fun tcAge(birthdate: String): Int? {
    if (birthdate.length < 10) return null
    val d = runCatching { LocalDate.parse(birthdate.take(10)) }.getOrNull() ?: return null
    return Period.between(d, LocalDate.now(VaraFormat.riyadh)).years
}

private fun tcInstantMs(iso: String): Long? = runCatching { Instant.parse(iso).toEpochMilli() }.getOrNull()

/// «3 يومًا و5 ساعة» / «5 ساعة و12 دقيقة» — نظير remaining في TcWindowCountdown.
private fun tcRemaining(ms: Long): String {
    val secs = (ms / 1000L).coerceAtLeast(0)
    val days = secs / 86_400
    val hours = (secs % 86_400) / 3_600
    if (days > 0) return "$days يومًا و$hours ساعة"
    val mins = (secs % 3_600) / 60
    return "$hours ساعة و$mins دقيقة"
}

private fun tcProbSegments(prob: String): Int = when (prob) {
    "IMMINENT" -> 4; "HIGH" -> 3; "MEDIUM" -> 2; else -> 1
}

private fun tcProbLabel(prob: String): String = when (prob) {
    "IMMINENT" -> "وشيكة"; "HIGH" -> "قوية"; "MEDIUM" -> "متوسطة"; else -> "ضعيفة"
}

@Composable
private fun tcProbColor(prob: String): Color {
    val c = LocalVaraColors.current
    return when (prob) {
        "IMMINENT" -> c.live
        "HIGH" -> if (c.dark) Color(0xFFF5994D) else Color(0xFFD97319)
        "MEDIUM" -> if (c.dark) Color(0xFFF0C752) else Color(0xFFCC9E1A)
        else -> c.textFaint
    }
}

/// أخضر «مؤكّد» التحريري (نظير أخضر iOS الديناميكي).
@Composable
private fun tcGreen(): Color = if (LocalVaraColors.current.dark) Color(0xFF4DCC8C) else Color(0xFF0D8C59)

/// فيروزي الإعارات.
@Composable
private fun tcTeal(): Color = if (LocalVaraColors.current.dark) Color(0xFF55BDCE) else Color(0xFF0E7685)

private fun tcPlayerPhoto(id: Int): String = if (id > 0) "https://media.api-sports.io/football/players/$id.png" else ""

private fun tcOpenArticle(context: Context, slug: String) {
    if (slug.isBlank()) return
    // androidx.browser غير معلنة في dependencies وحدة vara — نفتح بACTION_VIEW.
    runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://sabq.org/article/$slug"))) }
}

// MARK: - عناصر مشتركة صغيرة

/// مقياس الاحتمال — أربع خانات تمتلئ حسب الدرجة (وشيكة تنبض). بلا ForceLtr:
/// الامتلاء من اليمين في RTL (قاعدة «الأشرطة بلا dir=ltr»).
@Composable
private fun TcProbabilityMeter(probability: String, showLabel: Boolean = true) {
    val c = LocalVaraColors.current
    val color = tcProbColor(probability)
    val segments = tcProbSegments(probability)
    val pulse = if (probability == "IMMINENT") {
        rememberInfiniteTransition(label = "tcPulse").animateFloat(
            initialValue = 1f, targetValue = 0.4f,
            animationSpec = infiniteRepeatable(tween(800), RepeatMode.Reverse), label = "tcPulseAlpha",
        ).value
    } else 1f
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(3.dp)) {
            repeat(4) { i ->
                Box(
                    Modifier.size(13.dp, 5.dp).clip(CircleShape)
                        .background(if (i < segments) color.copy(alpha = pulse) else c.outline),
                )
            }
        }
        if (showLabel) Text(tcProbLabel(probability), color = color, fontSize = 11.sp, fontWeight = FontWeight.Bold)
    }
}

/// شارة المصدر: مؤشر موثوقية تحريري + الاسم + أيقونة رابط خارجي.
@Composable
private fun TcSourceBadge(source: TcSource) {
    val c = LocalVaraColors.current
    val icon = when (source.tier) { "high" -> Icons.Default.VerifiedUser; "low" -> Icons.Default.GppMaybe; else -> Icons.Default.Shield }
    val color = when (source.tier) {
        "high" -> tcGreen()
        "low" -> if (c.dark) Color(0xFFEBB34D) else Color(0xFFBF850D)
        else -> c.textDim
    }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
        Icon(icon, null, tint = color, modifier = Modifier.size(12.dp))
        Text(source.name, color = color, fontSize = 11.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        if (source.url.isNotBlank()) Icon(Icons.AutoMirrored.Filled.OpenInNew, null, tint = color.copy(.6f), modifier = Modifier.size(10.dp))
    }
}

/// وسم صريح يفصل المؤكّد عن الإشاعة — لا يلتبس على القارئ أبدًا.
@Composable
private fun TcCertaintyTag(confirmed: Boolean) {
    val c = LocalVaraColors.current
    val color = if (confirmed) tcGreen() else c.textDim
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
        Icon(if (confirmed) Icons.Default.Verified else Icons.Default.RadioButtonUnchecked, null, tint = color, modifier = Modifier.size(11.dp))
        Text(if (confirmed) "مؤكّدة" else "إشاعة", color = color, fontSize = 10.sp, fontWeight = FontWeight.Bold)
    }
}

/// شارة «Here we go!» للصفقات الوشيكة.
@Composable
private fun TcHereWeGoBadge() {
    val c = LocalVaraColors.current
    Row(
        Modifier.clip(CircleShape).background(c.live).padding(horizontal = 8.dp, vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        Icon(Icons.Default.LocalFireDepartment, null, tint = Color.White, modifier = Modifier.size(11.dp))
        Text("Here we go!", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold)
    }
}

/// مبلغ الصفقة — نص عارٍ بحبر داكن (لا كبسولة ذهبية؛ الذهبي محجوز للتتويج).
@Composable
private fun TcMoneyText(amount: Double?, currency: String?, fontSize: Int = 13) {
    tcMoney(amount, currency)?.let {
        Text(it, color = LocalVaraColors.current.text, fontSize = fontSize.sp, fontWeight = FontWeight.Bold)
    }
}

/// شعار نادٍ صغير + اسم (لعرض «من ← إلى»).
@Composable
private fun TcPartyChip(name: String, image: String, emphasize: Boolean = false) {
    val c = LocalVaraColors.current
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
        if (image.isNotBlank()) RemoteLogo(image, name, 18)
        Text(
            name, color = if (emphasize) c.text else c.textDim, fontSize = 13.sp,
            fontWeight = if (emphasize) FontWeight.Bold else FontWeight.SemiBold,
            maxLines = 1, overflow = TextOverflow.Ellipsis,
        )
    }
}

/// سهم «من ← إلى» — AutoMirrored يشير نحو نادي الوجهة في RTL.
@Composable
private fun TcArrow(tint: Color, size: Int = 13) {
    Icon(Icons.AutoMirrored.Filled.ArrowForward, null, tint = tint, modifier = Modifier.size(size.dp))
}

/// صورة اللاعب بشعار النادي الوجهة متراكبًا أسفلها.
@Composable
private fun TcTransferAvatar(playerImage: String, teamLogo: String, name: String, size: Int = 40) {
    Box {
        RemoteLogo(playerImage, name, size)
        if (teamLogo.isNotBlank()) {
            Box(Modifier.align(Alignment.BottomEnd)) { RemoteLogo(teamLogo, "", (size * 0.46).toInt()) }
        }
    }
}

/// شريط تقدّم بامتلاء كسري — بلا dir=ltr (يمتلئ من اليمين في RTL).
@Composable
private fun TcBar(fraction: Float, color: Color, height: Int) {
    val c = LocalVaraColors.current
    Box(Modifier.fillMaxWidth().height(height.dp).clip(CircleShape).background(c.chip)) {
        Box(Modifier.fillMaxWidth(fraction.coerceIn(0f, 1f)).fillMaxHeight().clip(CircleShape).background(color))
    }
}

/// «#1» بعزل LTR (نظير environment(.leftToRight) على الرتب في iOS).
@Composable
private fun TcRank(rank: Int, fontSize: Int, color: Color) {
    ForceLtr { Text("#$rank", color = color, fontSize = fontSize.sp, fontWeight = FontWeight.Bold) }
}

// MARK: - محورا التصفية

private enum class TcScope(val label: String, val emoji: String) { SAUDI("سعودية", "🇸🇦"), GLOBAL("عالمية", "🌍") }
private enum class TcTab(val label: String) { CONFIRMED("مؤكّدة"), RUMOURS("إشاعات"), LOANS("إعارات"), EXTENSIONS("تجديد") }

// MARK: - الشاشة الرئيسية للمركز

@Composable
fun TransfersScreen(nav: NavHostController, vm: VaraViewModel) {
    val c = LocalVaraColors.current
    var rumours by remember { mutableStateOf<List<TcRumour>>(emptyList()) }
    var globalConfirmed by remember { mutableStateOf<List<TcConfirmedItem>>(emptyList()) }
    var saudiConfirmed by remember { mutableStateOf<List<TcSaudiDeal>>(emptyList()) }
    var overview by remember { mutableStateOf<TcOverviewInfo?>(null) }

    var scope by remember { mutableStateOf(TcScope.SAUDI) }
    var tab by remember { mutableStateOf(TcTab.CONFIRMED) }
    // null = كل الدرجات، وإلا IMMINENT/HIGH/MEDIUM/LOW.
    var probFilter by remember { mutableStateOf<String?>(null) }
    var majorsOnly by remember { mutableStateOf(true) }

    var loading by remember { mutableStateOf(true) }
    var loadedGlobal by remember { mutableStateOf(false) }
    var globalLoadFailed by remember { mutableStateOf(false) }
    var saudiVisibleCount by remember { mutableIntStateOf(40) }
    var refreshing by remember { mutableStateOf(false) }
    var revision by remember { mutableIntStateOf(0) }
    var globalReload by remember { mutableIntStateOf(0) }
    var initialError by remember { mutableStateOf<String?>(null) }

    // ثلاثة نداءات متوازية عند الفتح — runCatching لكل نداء على حدة: فشل واحد
    // لا يحجب الشاشة، والتحديث الفاشل لا يمحو بيانات معروضة.
    LaunchedEffect(revision) {
        val force = revision > 0
        if (saudiConfirmed.isEmpty() && rumours.isEmpty()) loading = true
        coroutineScope {
            val overviewR = async { runCatching { tcParseOverview(vm.api.publicGet("/transfer-center/overview", ignoreCache = force).jsonObject) } }
            val rumoursR = async { runCatching { findArray(vm.api.publicGet("/transfer-center/rumours", ignoreCache = force), "rumours").mapNotNull(::tcParseRumour) } }
            val saudiR = async { runCatching { findArray(vm.api.publicGet("/sports/transfers", mapOf("since" to "4"), ignoreCache = force), "transfers", "topDeals").mapNotNull(::tcParseSaudiDeal) } }
            // كشف تدريجي: السعودي أولًا (التبويب الافتراضي) ثم الإشاعات/النظرة.
            val sa = saudiR.await()
            sa.getOrNull()?.let { saudiConfirmed = it; saudiVisibleCount = 40; loading = false }
            val ru = rumoursR.await()
            ru.getOrNull()?.let { rumours = it; loading = false }
            val ov = overviewR.await()
            ov.getOrNull()?.let { overview = it }
            loading = false
            initialError = if (sa.isFailure && ru.isFailure && ov.isFailure &&
                saudiConfirmed.isEmpty() && rumours.isEmpty() && overview == null
            ) "تعذّر تحميل الانتقالات" else null
            if (force) {
                loadedGlobal = false
                globalLoadFailed = false
                globalReload++
            }
            refreshing = false
        }
    }

    // العالمي المؤكّد يُجلب مرة واحدة عند الحاجة ويُكاش في الحالة — العلم يُرفع
    // عند النجاح والفشل معًا وإلا بقي التحميل يدور إلى الأبد (لا حلقة).
    LaunchedEffect(scope, tab, globalReload) {
        if (!(scope == TcScope.GLOBAL && tab == TcTab.CONFIRMED) || loadedGlobal) return@LaunchedEffect
        runCatching { findArray(vm.api.publicGet("/transfer-center/global-confirmed", ignoreCache = revision > 0), "transfers").mapNotNull(::tcParseConfirmed) }
            .onSuccess { globalConfirmed = it; globalLoadFailed = false }
            .onFailure { globalLoadFailed = true }
        loadedGlobal = true
    }

    // مؤكّدة بلا إعارات/انتهاء إعارة — الضوضاء تُبطئ التمرير وتُخفي الصفقات الجديدة.
    val filteredSaudi = remember(saudiConfirmed) { saudiConfirmed.filter { it.kind != "loan" && it.kind != "loanend" } }
    val filteredRumours = remember(rumours, scope, tab, probFilter) {
        var list = rumours.filter { if (scope == TcScope.SAUDI) it.saudi else !it.saudi }
        list = when (tab) {
            TcTab.RUMOURS -> list.filter { it.kind == "transfer" }
            TcTab.LOANS -> list.filter { it.kind == "loan" }
            TcTab.EXTENSIONS -> list.filter { it.kind == "extension" }
            TcTab.CONFIRMED -> list
        }
        probFilter?.let { p -> list = list.filter { it.probability == p } }
        list
    }
    val filteredGlobal = remember(globalConfirmed, majorsOnly) {
        globalConfirmed.filter { !it.saudi }.filter { if (majorsOnly) it.major else true }
    }
    val showSaudiConfirmed = scope == TcScope.SAUDI && tab == TcTab.CONFIRMED
    val showGlobalConfirmed = scope == TcScope.GLOBAL && tab == TcTab.CONFIRMED
    val showRumours = !showSaudiConfirmed && !showGlobalConfirmed
    val activeCaption = when {
        showSaudiConfirmed -> "${filteredSaudi.size} صفقة"
        showGlobalConfirmed -> if (loadedGlobal) "${filteredGlobal.size} انتقال" else "تحميل"
        else -> "${filteredRumours.size} إشاعة"
    }
    val openStory: (Int) -> Unit = { id -> if (id > 0) nav.navigate("transfer-story/$id") }

    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(c.screenTop, c.screenBottom)))) {
        Column {
            BackHeader(nav, "مركز الانتقالات")
            if (initialError != null && !loading) {
                LoadStateHost(LoadState.Error(initialError ?: ""), retry = { revision++ }) {}
                return@Column
            }
            VaraPullRefresh(refreshing = refreshing, onRefresh = { refreshing = true; revision++ }) {
                LazyColumn(
                    Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(vertical = 14.dp),
                ) {
                    item { TcMarketHeader(filteredSaudi.size, rumours.size, overview) }
                    val hero = overview?.hero.orEmpty()
                    if (hero.isNotEmpty()) item { TcHeroStrip(hero, openStory) }
                    item {
                        TcControlsPanel(
                            scope = scope, tab = tab, probFilter = probFilter, majorsOnly = majorsOnly,
                            caption = activeCaption, showRumours = showRumours, showGlobalConfirmed = showGlobalConfirmed,
                            onScope = { scope = it }, onTab = { tab = it },
                            onProb = { probFilter = it }, onMajors = { majorsOnly = it },
                        )
                    }
                    // المحتوى — صفوف مباشرة داخل LazyColumn الأب (لا عمود يبني الكل دفعة).
                    when {
                        loading && rumours.isEmpty() && saudiConfirmed.isEmpty() -> item { TcLoading() }
                        showSaudiConfirmed -> {
                            if (filteredSaudi.isEmpty()) {
                                item { EmptyState("لا صفقات مؤكّدة", "لا حركة انتقالات مؤكّدة في النافذة الحالية.") }
                            } else {
                                item { TcListCount(filteredSaudi.size, "صفقة مؤكّدة") }
                                items(filteredSaudi.take(saudiVisibleCount), key = { "sa-${it.id}" }) { deal ->
                                    TcSaudiRow(deal)
                                }
                                if (filteredSaudi.size > saudiVisibleCount) {
                                    item {
                                        Text(
                                            "عرض المزيد (${filteredSaudi.size - saudiVisibleCount})",
                                            color = c.accent, fontSize = 13.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center,
                                            modifier = Modifier.fillMaxWidth()
                                                .clickable { saudiVisibleCount = minOf(saudiVisibleCount + 40, filteredSaudi.size) }
                                                .padding(vertical = 12.dp),
                                        )
                                    }
                                }
                            }
                        }
                        showGlobalConfirmed -> {
                            // ثلاث حالات: تحميل / «تعذّر التحميل» / «لا نتائج — جرّب كل الانتقالات».
                            when {
                                !loadedGlobal -> item { TcLoading() }
                                globalLoadFailed && globalConfirmed.isEmpty() ->
                                    item { EmptyState("تعذّر التحميل", "اسحب للتحديث أو أعد المحاولة لاحقًا.") }
                                filteredGlobal.isEmpty() ->
                                    item { EmptyState("لا نتائج", "جرّب «كل الانتقالات».") }
                                else -> {
                                    item { TcListCount(filteredGlobal.size, "انتقالًا") }
                                    items(filteredGlobal.take(60), key = { "gl-${it.id}-${it.date}" }) { item -> TcGlobalRow(item) }
                                }
                            }
                        }
                        else -> {
                            if (filteredRumours.isEmpty()) {
                                item {
                                    EmptyState(
                                        "لا إشاعات مطابقة",
                                        if (scope == TcScope.SAUDI) "تغطية المصادر العالمية للدوري السعودي تتحرّك مع اشتعال السوق."
                                        else "جرّب تغيير الفلاتر.",
                                    )
                                }
                            } else {
                                item { TcListCount(filteredRumours.size, "إشاعة — كل إشاعة بمصدرها ودرجة احتمالها") }
                                items(filteredRumours.take(60), key = { "ru-${it.id}-${it.date}" }) { r ->
                                    TcRumourCard(r) { openStory(r.player.id) }
                                }
                            }
                        }
                    }
                    overview?.let { ov ->
                        ov.comparison?.let { item { TcComparisonCard(it) } }
                        if (ov.clubBalance.isNotEmpty()) item { TcClubBalanceCard(ov.clubBalance) }
                    }
                    item { TcDisclaimer() }
                }
            }
        }
    }
}

@Composable
private fun TcLoading() {
    Box(Modifier.fillMaxWidth().padding(top = 30.dp), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = LocalVaraColors.current.accent)
    }
}

@Composable
private fun TcListCount(n: Int, suffix: String) {
    Text(
        "$n $suffix", color = LocalVaraColors.current.textFaint, fontSize = 11.sp, fontWeight = FontWeight.SemiBold,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
    )
}

// MARK: - ترويسة السوق (عنوان + ثلاثة مقاييس + نافذتا الانتقالات)

@Composable
private fun TcMarketHeader(confirmedCount: Int, rumoursCount: Int, overview: TcOverviewInfo?) {
    val c = LocalVaraColors.current
    VaraCard(Modifier.padding(horizontal = 16.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                Text("نبض سوق الانتقالات", color = c.text, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                Text("الصفقات المؤكدة والإشاعات مرتبة حسب الحالة والمصدر.", color = c.textDim, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            }
            Icon(Icons.Default.SwapHorizontalCircle, null, tint = c.accent, modifier = Modifier.size(31.dp))
        }
        Spacer(Modifier.height(14.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TcMarketMetric(Icons.Default.Verified, "$confirmedCount", "مؤكدة", c.accent, Modifier.weight(1f))
            TcMarketMetric(Icons.Default.AutoAwesome, "$rumoursCount", "إشاعات", tcTeal(), Modifier.weight(1f))
            TcMarketMetric(Icons.Default.LocalFireDepartment, "${overview?.hero?.size ?: 0}", "بارزة", c.live, Modifier.weight(1f))
        }
        val windows = overview?.windows.orEmpty()
        if (windows.isNotEmpty()) {
            Spacer(Modifier.height(14.dp))
            Column(verticalArrangement = Arrangement.spacedBy(9.dp)) { windows.forEach { TcWindowCountdown(it) } }
        }
    }
}

@Composable
private fun TcMarketMetric(icon: androidx.compose.ui.graphics.vector.ImageVector, value: String, label: String, tint: Color, modifier: Modifier = Modifier) {
    val c = LocalVaraColors.current
    Column(
        modifier.clip(VaraChipShape).background(c.chip.copy(alpha = .65f)).padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            Icon(icon, null, tint = tint, modifier = Modifier.size(12.dp))
            Text(label, color = c.textDim, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
        }
        Text(value, color = c.text, fontSize = 19.sp, fontWeight = FontWeight.Bold, maxLines = 1)
    }
}

/// عدّاد نافذة انتقالات (تفتح/تُغلق بعد…) بشريط تقدّم ومؤقّت دقيقة.
@Composable
private fun TcWindowCountdown(window: TcWindowInfo) {
    val c = LocalVaraColors.current
    val now = produceState(System.currentTimeMillis(), window) {
        while (true) { delay(60_000); value = System.currentTimeMillis() }
    }.value
    val opens = tcInstantMs(window.opensAt)
    val closes = tcInstantMs(window.closesAt)
    val (status, pct) = when {
        opens == null || closes == null -> "" to 0f
        now < opens -> "تفتح بعد ${tcRemaining(opens - now)}" to 0f
        now < closes -> {
            val p = if (closes > opens) (now - opens).toFloat() / (closes - opens).toFloat() else 0f
            "تُغلق بعد ${tcRemaining(closes - now)}" to p.coerceIn(0f, 1f)
        }
        else -> "أُغلقت النافذة" to 1f
    }
    Column(
        Modifier.fillMaxWidth().clip(VaraTileShape).background(c.chip.copy(alpha = .55f)).padding(13.dp),
        verticalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Icon(Icons.Default.HourglassEmpty, null, tint = c.accent, modifier = Modifier.size(12.dp))
            Text(window.label, color = c.text, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        }
        if (status.isNotBlank()) Text(status, color = c.textDim, fontSize = 11.sp, maxLines = 1)
        TcBar(pct, c.accent, 5)
    }
}

// MARK: - شريط الهيرو (القصص الأبرز)

@Composable
private fun TcHeroStrip(hero: List<TcRumour>, openStory: (Int) -> Unit) {
    val c = LocalVaraColors.current
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(
            Modifier.padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(7.dp),
        ) {
            Icon(Icons.Default.LocalFireDepartment, null, tint = c.text, modifier = Modifier.size(15.dp))
            Text("القصص الأبرز", color = c.text, fontSize = 16.sp, fontWeight = FontWeight.Bold)
        }
        hero.firstOrNull()?.let { first ->
            TcFeaturedStoryCard(first, 1) { openStory(first.player.id) }
        }
        hero.drop(1).take(2).forEachIndexed { i, r ->
            TcMiniStoryRow(r, i + 2) { openStory(r.player.id) }
        }
    }
}

/// بطاقة القصة الأبرز الكبيرة — نقرها يفتح قصة الانتقال.
@Composable
private fun TcFeaturedStoryCard(rumour: TcRumour, rank: Int, onOpen: () -> Unit) {
    val c = LocalVaraColors.current
    val border = if (rumour.hereWeGo) c.live.copy(alpha = .45f) else c.outline
    Column(
        Modifier.padding(horizontal = 16.dp).fillMaxWidth().clip(VaraCardShape).background(c.surface)
            .border(1.dp, border, VaraCardShape).clickable(onClick = onOpen).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            RemoteLogo(rumour.player.image, rumour.player.name, 62)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    Text("القصة الأبرز", color = c.accent, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    TcRank(rank, 11, c.textFaint)
                    if (rumour.hereWeGo) TcHereWeGoBadge()
                }
                Text(rumour.player.name, color = c.text, fontSize = 21.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (rumour.player.position.isNotBlank()) {
                    Text(rumour.player.position, color = c.textFaint, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            TcPartyChip(rumour.from.name, rumour.from.image)
            TcArrow(c.accent)
            TcPartyChip(rumour.to.name, rumour.to.image, emphasize = true)
        }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                Text("القيمة المتداولة", color = c.textFaint, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
                Text(tcMoney(rumour.amount, rumour.currency) ?: "غير معلنة", color = c.text, fontSize = 23.sp, fontWeight = FontWeight.Bold)
            }
            Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(7.dp)) {
                TcProbabilityMeter(rumour.probability)
                Text(tcDateMedium(rumour.date), color = c.textFaint, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

/// صفّ قصة مصغّر (المرتبتان 2 و3) — نقره يفتح القصة.
@Composable
private fun TcMiniStoryRow(rumour: TcRumour, rank: Int, onOpen: () -> Unit) {
    val c = LocalVaraColors.current
    Row(
        Modifier.padding(horizontal = 16.dp).fillMaxWidth().clip(VaraTileShape).background(c.surface)
            .border(1.dp, c.outline, VaraTileShape).clickable(onClick = onOpen).padding(11.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(Modifier.width(28.dp), contentAlignment = Alignment.Center) { TcRank(rank, 12, c.textFaint) }
        RemoteLogo(rumour.player.image, rumour.player.name, 34)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(rumour.player.name, color = c.text, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                Text(rumour.from.name, color = c.textFaint, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                TcArrow(c.textFaint, 9)
                Text(rumour.to.name, color = c.textFaint, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
            }
        }
        TcProbabilityMeter(rumour.probability, showLabel = false)
    }
}

// MARK: - لوحة التصفية (نطاق × نوع + فلاتر)

@Composable
private fun TcControlsPanel(
    scope: TcScope,
    tab: TcTab,
    probFilter: String?,
    majorsOnly: Boolean,
    caption: String,
    showRumours: Boolean,
    showGlobalConfirmed: Boolean,
    onScope: (TcScope) -> Unit,
    onTab: (TcTab) -> Unit,
    onProb: (String?) -> Unit,
    onMajors: (Boolean) -> Unit,
) {
    val c = LocalVaraColors.current
    VaraCard(Modifier.padding(horizontal = 16.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            Icon(Icons.Default.Tune, null, tint = c.accent, modifier = Modifier.size(13.dp))
            Text("تصفية السوق", color = c.text, fontSize = 15.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            Text(caption, color = c.textFaint, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.height(13.dp))
        // محور النطاق: السعودية/عالمية.
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(15.dp)).background(c.chip).padding(5.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            TcScope.entries.forEach { s ->
                val selected = scope == s
                Row(
                    Modifier.weight(1f).clip(VaraChipShape)
                        .background(if (selected) c.accent else c.surface)
                        .border(1.dp, if (selected) Color.Transparent else c.outline, VaraChipShape)
                        .clickable { onScope(s) }.padding(vertical = 11.dp),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(s.emoji, fontSize = 15.sp)
                    Spacer(Modifier.width(7.dp))
                    Text(s.label, color = if (selected) Color.White else c.text, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
        Spacer(Modifier.height(13.dp))
        // محور النوع: مؤكّدة/إشاعات/إعارات/تجديد.
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TcTab.entries.forEach { t ->
                TcFilterChip(t.label, tab == t, fontSize = 13) { onTab(t) }
            }
        }
        if (showRumours) {
            Spacer(Modifier.height(13.dp))
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TcFilterChip("كل الدرجات", probFilter == null) { onProb(null) }
                TcFilterChip("وشيكة", probFilter == "IMMINENT") { onProb("IMMINENT") }
                TcFilterChip("قوية", probFilter == "HIGH") { onProb("HIGH") }
                TcFilterChip("متوسطة", probFilter == "MEDIUM") { onProb("MEDIUM") }
                TcFilterChip("ضعيفة", probFilter == "LOW") { onProb("LOW") }
            }
        } else if (showGlobalConfirmed) {
            Spacer(Modifier.height(13.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TcFilterChip("أبرز الأندية", majorsOnly) { onMajors(true) }
                TcFilterChip("كل الانتقالات", !majorsOnly) { onMajors(false) }
            }
        }
    }
}

@Composable
private fun TcFilterChip(label: String, selected: Boolean, fontSize: Int = 12, onClick: () -> Unit) {
    val c = LocalVaraColors.current
    Text(
        label,
        color = if (selected) Color.White else c.textDim,
        fontSize = fontSize.sp,
        fontWeight = FontWeight.Bold,
        modifier = Modifier.clip(CircleShape)
            .background(if (selected) c.accent else c.surface)
            .border(1.dp, if (selected) Color.Transparent else c.outline, CircleShape)
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 8.dp),
    )
}

// MARK: - صفوف القوائم

/// صفقة سعودية مؤكّدة — غير قابلة للنقر (لا قصة للصفقات المؤكّدة).
@Composable
private fun TcSaudiRow(deal: TcSaudiDeal) {
    val c = LocalVaraColors.current
    Column(
        Modifier.padding(horizontal = 16.dp).fillMaxWidth().clip(VaraTileShape).background(c.surface)
            .border(1.dp, c.outline, VaraTileShape).padding(13.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            TcTransferAvatar(
                playerImage = tcPlayerPhoto(deal.playerId),
                teamLogo = if (deal.inClubId != null) deal.toLogo else deal.fromLogo,
                name = deal.playerName,
            )
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(deal.playerName, color = c.text, fontSize = 15.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(tcDateMedium(deal.date), color = c.textFaint, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
            }
            Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                TcCertaintyTag(confirmed = true)
                if (deal.typeAr.isNotBlank()) Text(deal.typeAr, color = c.accent, fontSize = 11.sp, fontWeight = FontWeight.Bold, maxLines = 1)
            }
        }
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(c.chip.copy(alpha = .65f))
                .padding(vertical = 8.dp, horizontal = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            TcClubMini(deal.fromName, deal.fromLogo, roshn = deal.outClubId != null)
            TcArrow(c.accent, 11)
            TcClubMini(deal.toName, deal.toLogo, roshn = deal.inClubId != null)
        }
    }
}

/// اسم نادٍ مصغّر — تمييز نادي روشن بحبر أثقل.
@Composable
private fun TcClubMini(name: String, logo: String, roshn: Boolean) {
    val c = LocalVaraColors.current
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        if (logo.isNotBlank()) RemoteLogo(logo, name, 16)
        Text(
            name, color = if (roshn) c.text else c.textDim, fontSize = 12.sp,
            fontWeight = if (roshn) FontWeight.Bold else FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis,
        )
    }
}

/// انتقال عالمي مؤكّد — غير قابل للنقر؛ «إعارة» فيروزي / «انتقال حر» أخضر / المبلغ.
@Composable
private fun TcGlobalRow(item: TcConfirmedItem) {
    val c = LocalVaraColors.current
    Column(
        Modifier.padding(horizontal = 16.dp).fillMaxWidth().clip(VaraTileShape).background(c.surface)
            .border(1.dp, c.outline, VaraTileShape).padding(13.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            TcTransferAvatar(
                playerImage = item.player.image,
                teamLogo = item.to.image.ifBlank { item.from.image },
                name = item.player.name,
            )
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(item.player.name, color = c.text, fontSize = 15.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(tcDateMedium(item.date), color = c.textFaint, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
            }
            Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                TcCertaintyTag(confirmed = true)
                when (item.kind) {
                    "loan" -> Text("إعارة", color = tcTeal(), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    "free" -> Text("انتقال حر", color = tcGreen(), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    else -> TcMoneyText(item.amount, item.currency, 11)
                }
            }
        }
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(c.chip.copy(alpha = .65f))
                .padding(vertical = 8.dp, horizontal = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            TcPartyChip(item.from.name, item.from.image)
            TcArrow(c.accent, 11)
            TcPartyChip(item.to.name, item.to.image, emphasize = true)
            Spacer(Modifier.weight(1f))
            if (item.kind != "transfer") TcMoneyText(item.amount, item.currency, 12)
        }
    }
}

/// بطاقة إشاعة غنيّة — نقرها يفتح قصة الانتقال.
@Composable
private fun TcRumourCard(rumour: TcRumour, onOpen: () -> Unit) {
    val c = LocalVaraColors.current
    val border = if (rumour.hereWeGo) c.live.copy(alpha = .45f) else c.outline
    Column(
        Modifier.padding(horizontal = 16.dp).fillMaxWidth().clip(VaraTileShape).background(c.surface)
            .border(1.dp, border, VaraTileShape).clickable(onClick = onOpen).padding(13.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        if (rumour.hereWeGo) TcHereWeGoBadge()
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(11.dp)) {
            RemoteLogo(rumour.player.image, rumour.player.name, 44)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(rumour.player.name, color = c.text, fontSize = 15.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                    if (rumour.player.position.isNotBlank()) Text(rumour.player.position, color = c.textFaint, fontSize = 10.sp)
                    Spacer(Modifier.weight(1f))
                    TcCertaintyTag(confirmed = false)
                }
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    TcPartyChip(rumour.from.name, rumour.from.image)
                    TcArrow(c.textFaint, 11)
                    TcPartyChip(rumour.to.name, rumour.to.image, emphasize = true)
                    Spacer(Modifier.weight(1f))
                    TcMoneyText(rumour.amount, rumour.currency)
                }
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    TcProbabilityMeter(rumour.probability)
                    TcSourceBadge(rumour.source)
                    Spacer(Modifier.weight(1f))
                    Text(tcDateMedium(rumour.date), color = c.textFaint, fontSize = 10.sp)
                }
            }
        }
    }
}

// MARK: - إحصائيات السوق

/// مقارنة روشن × البريميرليغ (basis=rumoured/confirmed).
@Composable
private fun TcComparisonCard(comparison: TcComparisonInfo) {
    val c = LocalVaraColors.current
    val rumoured = comparison.basis == "rumoured"
    val purple = if (c.dark) Color(0xFFAD94DE) else Color(0xFF6B549E)
    val maxTotal = maxOf(comparison.roshn.total, comparison.premierLeague.total, 1.0)
    VaraCard(Modifier.padding(horizontal = 16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            Icon(Icons.Default.BarChart, null, tint = c.text, modifier = Modifier.size(14.dp))
            Text(
                if (rumoured) "قيم الميركاتو المتداولة: روشن مقابل البريميرليغ" else "إنفاق الميركاتو: روشن مقابل البريميرليغ",
                color = c.text, fontSize = 14.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f, fill = false),
            )
            if (rumoured) TcCertaintyTag(confirmed = false)
        }
        Spacer(Modifier.height(14.dp))
        TcComparisonBar("🇸🇦 دوري روشن السعودي", comparison.roshn, c.accent, maxTotal, rumoured)
        Spacer(Modifier.height(14.dp))
        TcComparisonBar("🏴󠁧󠁢󠁥󠁮󠁧󠁿 البريميرليغ", comparison.premierLeague, purple, maxTotal, rumoured)
        Spacer(Modifier.height(14.dp))
        Text(
            if (rumoured) "قيم متداولة في إشاعات المصادر منذ مطلع يونيو — تتحوّل إلى الصفقات الرسمية فور توفّر سجل النافذة."
            else "الصفقات المُعلَنة المبالغ فقط منذ مطلع يونيو.",
            color = c.textFaint, fontSize = 10.sp,
        )
    }
}

@Composable
private fun TcComparisonBar(label: String, side: TcComparisonSide, color: Color, maxTotal: Double, rumoured: Boolean) {
    val c = LocalVaraColors.current
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(label, color = c.text, fontSize = 13.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                Text(tcMoney(side.total, "EUR") ?: "0 €", color = c.text, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                Text("· ${side.deals} ${if (rumoured) "إشاعة" else "صفقة"}", color = c.textFaint, fontSize = 10.sp)
            }
        }
        TcBar(if (maxTotal > 0) maxOf(0.02f, (side.total / maxTotal).toFloat()) else 0.02f, color, 10)
    }
}

/// ميزان السوق — صرف/دخل أندية روشن هذا الميركاتو.
@Composable
private fun TcClubBalanceCard(rows: List<TcClubBalanceRow>) {
    val c = LocalVaraColors.current
    val green = tcGreen()
    val maxVal = maxOf(rows.maxOfOrNull { maxOf(it.spent, it.earned) } ?: 1.0, 1.0)
    VaraCard(Modifier.padding(horizontal = 16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            Icon(Icons.Default.CompareArrows, null, tint = c.text, modifier = Modifier.size(14.dp))
            Text("ميزان السوق — أندية روشن هذا الميركاتو", color = c.text, fontSize = 14.sp, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.height(12.dp))
        rows.forEach { r ->
            Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(Modifier.width(96.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                    if (r.logo.isNotBlank()) RemoteLogo(r.logo, r.club, 18)
                    Text(r.club, color = c.text, fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    TcBalanceBar(r.spent, c.live, maxVal)
                    TcBalanceBar(r.earned, green, maxVal)
                }
            }
        }
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            TcLegend(c.live, "صرف")
            TcLegend(green, "دخل")
        }
    }
}

@Composable
private fun TcBalanceBar(value: Double, color: Color, maxVal: Double) {
    val c = LocalVaraColors.current
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Box(Modifier.weight(1f)) { TcBar(maxOf(0.01f, (value / maxVal).toFloat()), color, 7) }
        Text(
            tcMoney(value, "EUR") ?: "—", color = c.textFaint, fontSize = 9.sp, fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.End, maxLines = 1, modifier = Modifier.width(68.dp),
        )
    }
}

@Composable
private fun TcLegend(color: Color, text: String) {
    val c = LocalVaraColors.current
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
        Box(Modifier.size(16.dp, 7.dp).clip(CircleShape).background(color))
        Text(text, color = c.textDim, fontSize = 10.sp)
    }
}

/// سطر الإفصاح أسفل القائمة.
@Composable
private fun TcDisclaimer() {
    Text(
        "الصفقات المؤكّدة من سجل API-Football، والإشاعات من رصد SportMonks لمصادر عالمية (فابريزيو رومانو، الغارديان، ESPN…) وتبقى إشاعةً حتى إعلانها رسميًّا. مؤشر الموثوقية تصنيف تحريري من سبق، ولا نعرض مبلغًا لم يُعلَن.",
        color = LocalVaraColors.current.textFaint, fontSize = 10.sp, lineHeight = 16.sp,
        modifier = Modifier.padding(horizontal = 18.dp).padding(top = 6.dp),
    )
}

// MARK: - شاشة قصة الانتقال

@Composable
fun TransferStoryScreen(nav: NavHostController, vm: VaraViewModel, playerId: Int) {
    val c = LocalVaraColors.current
    val context = LocalContext.current
    var loading by remember { mutableStateOf(true) }
    var story by remember { mutableStateOf<TcStoryInfo?>(null) }
    var related by remember { mutableStateOf<List<TcRelatedArticle>>(emptyList()) }
    LaunchedEffect(playerId) {
        loading = true
        // الخادم يرجع 200 بfound:false — الفشل الشبكي يعامل كغياب قصة (نظير try? في iOS).
        val res = runCatching { tcParseStory(vm.api.publicGet("/transfer-center/story/$playerId").jsonObject) }.getOrNull()
        story = res
        loading = false
        val name = res?.player?.name
        if (res?.found == true && name != null && name.length >= 2) {
            // أخبار ذات صلة من بحث سبق العام (على الجذر العام — ليست في رد القصة).
            related = runCatching {
                findArray(vm.api.publicGet("/search", mapOf("q" to name, "limit" to "6")), "results").mapNotNull(::tcParseRelated)
            }.getOrDefault(emptyList())
        }
    }
    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(c.screenTop, c.screenBottom)))) {
        Column {
            BackHeader(nav, "قصة الانتقال") {
                IconButton({ nav.navigate("player/$playerId") }) { Icon(Icons.Default.Person, "صفحة اللاعب", tint = c.text) }
            }
            val s = story
            when {
                loading && s == null -> Box(Modifier.fillMaxWidth().padding(top = 40.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = c.accent)
                }
                // حارس: الخادم يرجع 200 بfound:false — أو لاعب/تسلسل غائب.
                s == null || !s.found || s.player == null || s.timeline.isEmpty() ->
                    Box(Modifier.padding(top = 30.dp)) { EmptyState("لا قصة موثّقة", "لا توجد قصة انتقال موثّقة لهذا اللاعب حاليًا.") }
                else -> {
                    val player = s.player
                    val latest = s.timeline.last()
                    LazyColumn(
                        Modifier.fillMaxSize(),
                        verticalArrangement = Arrangement.spacedBy(18.dp),
                        contentPadding = androidx.compose.foundation.layout.PaddingValues(vertical = 14.dp),
                    ) {
                        item { TcStoryProfileHeader(player) }
                        item { TcCurrentStateCard(latest) }
                        item { TcTimelineCard(s.timeline) }
                        if (related.isNotEmpty()) item { TcRelatedCard(related) { a -> tcOpenArticle(context, a.slug) } }
                        item { TcStoryDisclaimer() }
                    }
                }
            }
        }
    }
}

/// ترويسة اللاعب: صورة + الاسم + المركز + العمر + وسم أرجواني «قصة إشاعات».
@Composable
private fun TcStoryProfileHeader(player: TcPlayerInfo) {
    val c = LocalVaraColors.current
    val purple = if (c.dark) Color(0xFFE685CC) else Color(0xFFA8338C)
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        RemoteLogo(player.image, player.name, 72)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            Text(player.name, color = c.text, fontSize = 22.sp, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                if (player.position.isNotBlank()) Text(player.position, color = c.textDim, fontSize = 12.sp)
                tcAge(player.birthdate)?.let { Text("$it عامًا", color = c.textDim, fontSize = 12.sp) }
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Icon(Icons.Default.RadioButtonUnchecked, null, tint = purple, modifier = Modifier.size(10.dp))
                Text("قصة إشاعات — لم تتأكّد بعد", color = purple, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

/// بطاقة الحالة الراهنة — آخر عنصر في تسلسل القصة.
@Composable
private fun TcCurrentStateCard(r: TcRumour) {
    val c = LocalVaraColors.current
    val border = if (r.hereWeGo) c.live.copy(alpha = .45f) else c.outline
    Column(
        Modifier.padding(horizontal = 16.dp).fillMaxWidth().clip(VaraCardShape).background(c.surface)
            .border(1.dp, border, VaraCardShape).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        if (r.hereWeGo) TcHereWeGoBadge()
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TcClubColumn(r.from, Modifier.weight(1f))
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                TcArrow(if (r.hereWeGo) c.live else c.accent, 30)
                TcMoneyText(r.amount, r.currency, 16)
                TcKindBadge(r.kind)
            }
            TcClubColumn(r.to, Modifier.weight(1f))
        }
        VaraDivider()
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            TcProbabilityMeter(r.probability)
            TcSourceBadge(r.source)
            Spacer(Modifier.weight(1f))
            Text("آخر تحديث: ${tcDateMedium(r.date)}", color = c.textFaint, fontSize = 10.sp)
        }
    }
}

/// عمود نادٍ (شعار كبير + الاسم + الدوري) لبطاقة الحالة الراهنة.
@Composable
private fun TcClubColumn(party: TcParty, modifier: Modifier = Modifier) {
    val c = LocalVaraColors.current
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(7.dp)) {
        if (party.image.isNotBlank()) RemoteLogo(party.image, party.name, 58)
        else Box(Modifier.size(58.dp).clip(CircleShape).background(c.chip))
        Text(party.name, color = c.text, fontSize = 13.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, maxLines = 2, overflow = TextOverflow.Ellipsis)
        if (party.leagueName.isNotBlank()) Text(party.leagueName, color = c.textFaint, fontSize = 9.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/// نوع الصفقة (انتقال/إعارة/تجديد عقد) في كبسولة.
@Composable
private fun TcKindBadge(kind: String) {
    val c = LocalVaraColors.current
    val (icon, label) = when (kind) {
        "loan" -> Icons.Default.Autorenew to "إعارة"
        "extension" -> Icons.Default.HistoryEdu to "تجديد عقد"
        else -> Icons.Default.CompareArrows to "انتقال"
    }
    Row(
        Modifier.clip(CircleShape).background(c.chip).padding(horizontal = 8.dp, vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        Icon(icon, null, tint = c.textDim, modifier = Modifier.size(10.dp))
        Text(label, color = c.textDim, fontSize = 10.sp, fontWeight = FontWeight.Bold)
    }
}

/// «تسلسل القصة» — عقد بنقاط ملونة حسب درجة الاحتمال وخط رابط عمودي.
@Composable
private fun TcTimelineCard(timeline: List<TcRumour>) {
    val c = LocalVaraColors.current
    VaraCard(Modifier.padding(horizontal = 16.dp)) {
        Text("تسلسل القصة", color = c.text, fontSize = 16.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(4.dp))
        Text("${timeline.size} تطوّرًا — تصاعديًّا مع درجة احتمال كل مرحلة ومصدرها", color = c.textFaint, fontSize = 11.sp)
        Spacer(Modifier.height(8.dp))
        Column {
            timeline.forEachIndexed { i, r -> TcTimelineNode(r, isLast = i == timeline.lastIndex) }
        }
    }
}

@Composable
private fun TcTimelineNode(r: TcRumour, isLast: Boolean) {
    val c = LocalVaraColors.current
    val dot = tcProbColor(r.probability)
    Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(11.dp)) {
        Column(Modifier.width(13.dp).fillMaxHeight(), horizontalAlignment = Alignment.CenterHorizontally) {
            Box(Modifier.size(13.dp).clip(CircleShape).border(2.dp, dot.copy(alpha = .25f), CircleShape).background(dot, CircleShape))
            if (!isLast) {
                // الخطّ الرأسي يبدأ بفجوة صغيرة أسفل النقطة ويتصل بنقطة القصة التالية.
                Box(Modifier.padding(top = 6.dp).width(2.dp).weight(1f).background(c.outline))
            }
        }
        Column(
            Modifier.weight(1f).padding(bottom = if (isLast) 0.dp else 26.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(tcDateMedium(r.date), color = c.textDim, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                Text(tcProbLabel(r.probability), color = dot, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                if (r.hereWeGo) TcHereWeGoBadge()
            }
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                TcPartyChip(r.from.name, r.from.image)
                TcArrow(c.textFaint, 10)
                TcPartyChip(r.to.name, r.to.image, emphasize = true)
                Spacer(Modifier.weight(1f))
                TcMoneyText(r.amount, r.currency)
            }
            TcSourceBadge(r.source)
        }
    }
}

/// أخبار ذات صلة من بحث سبق — بطاقات (صورة 62 + عنوان سطرين + تاريخ).
@Composable
private fun TcRelatedCard(related: List<TcRelatedArticle>, open: (TcRelatedArticle) -> Unit) {
    val c = LocalVaraColors.current
    VaraCard(Modifier.padding(horizontal = 16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            Icon(Icons.Default.Newspaper, null, tint = c.text, modifier = Modifier.size(14.dp))
            Text("أخبار ذات صلة", color = c.text, fontSize = 16.sp, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.height(12.dp))
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            related.forEach { a ->
                Row(
                    Modifier.fillMaxWidth().clip(VaraTileShape).background(c.chip.copy(alpha = .5f))
                        .clickable { open(a) }.padding(9.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(11.dp),
                ) {
                    if (a.imageUrl.isNotBlank()) {
                        AsyncImage(
                            model = a.imageUrl, contentDescription = a.title, contentScale = ContentScale.Crop,
                            modifier = Modifier.size(62.dp).clip(RoundedCornerShape(10.dp)),
                        )
                    }
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(a.title, color = c.text, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        if (a.publishedAt.isNotBlank()) Text(tcDateMedium(a.publishedAt), color = c.textFaint, fontSize = 10.sp)
                    }
                }
            }
        }
    }
}

/// سطر الإفصاح أسفل القصة.
@Composable
private fun TcStoryDisclaimer() {
    Text(
        "درجة الاحتمال والمبلغ المتداول من المصدر المذكور في كل مرحلة (رصد SportMonks)، ومؤشر الموثوقية تصنيف تحريري من سبق. تبقى القصة إشاعةً حتى إعلانها رسميًّا من الناديين.",
        color = LocalVaraColors.current.textFaint, fontSize = 10.sp, lineHeight = 16.sp,
        modifier = Modifier.padding(horizontal = 16.dp).padding(top = 4.dp),
    )
}
