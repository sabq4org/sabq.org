package com.sabq.smart.feature.sabqai

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.basicMarquee
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import coil.compose.AsyncImage
import com.sabq.smart.data.api.ApiAiTeam
import com.sabq.smart.data.api.ApiAiTeamMember
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * «عقل سبق» — نقل iOS `SabqAIView` (صفحة الويب /sabq-ai بتصميمها المعتمد):
 * دماغ حي، ثم رحلة الخبر في خمسة فصول تتوقف عند «عين المحرر»، فخريطة المجالات،
 * والبطولات، وفريق سبق الذكي، والأرقام الحية، و«ما لن يفعله عقل سبق»، والميثاق،
 * وعام الذكاء الاصطناعي. النصوص منقولة حرفيًا. الصفحة داكنة دائمًا كما في iOS والويب.
 */

data class SabqAiUiState(val stats: SaiPublicStats? = null, val team: ApiAiTeam? = null)

@HiltViewModel
class SabqAiViewModel @Inject constructor(private val api: SabqAiApi) : ViewModel() {
    private val _state = MutableStateFlow(SabqAiUiState())
    val state: StateFlow<SabqAiUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            val team = try { api.team() } catch (e: CancellationException) { throw e } catch (_: Throwable) { null }
            if (team != null && team.team.isNotEmpty()) _state.update { it.copy(team = team) }
        }
        // الويب يعيد الجلب كل دقيقة؛ تتوقف المهمة بمغادرة الشاشة.
        viewModelScope.launch {
            while (isActive) {
                val s = try { api.stats() } catch (e: CancellationException) { throw e } catch (_: Throwable) { null }
                if (s != null && s.ai.totalOps > 0) _state.update { it.copy(stats = s) }
                delay(60_000)
            }
        }
    }
}

private val saiMargin = 20.dp
private val revealEasing = CubicBezierEasing(0.2f, 0.7f, 0.2f, 1f)
private val countEasing = CubicBezierEasing(0.25f, 1f, 0.5f, 1f)

@Composable
private fun rememberReduceMotion(): Boolean {
    val context = LocalContext.current
    return remember {
        runCatching { Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f }
            .getOrDefault(false)
    }
}

@Composable
fun SabqAiScreen(
    onBack: () -> Unit,
    onOpenWorldCup: () -> Unit,
    onOpenAsianCup: () -> Unit,
    onOpenRoshn: () -> Unit,
    onOpenKingsCup: () -> Unit,
    onOpenMoments: () -> Unit,
    viewModel: SabqAiViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val reduce = rememberReduceMotion()
    val openWeb: (String) -> Unit = { path -> openWeb(context, path) }
    val team = state.team?.takeIf { it.team.isNotEmpty() }

    Box(Modifier.fillMaxSize().background(Sai.void)) {
        LazyColumn(Modifier.fillMaxSize()) {
            item { Spacer(Modifier.statusBarsPadding().height(56.dp)) }
            item { Hero(state.stats, team, reduce) }
            item { Ticker() }
            item { Manifesto(reduce) }
            item { Journey(state.stats, reduce) }
            item { Domains(reduce) }
            item { Sports(reduce, onOpenWorldCup, onOpenAsianCup, { openWeb("/gulf-cup") }, onOpenRoshn, onOpenKingsCup) }
            if (team != null) item { Team(team, reduce) }
            item { LiveNumbers(state.stats, team, reduce) }
            item { Governance(reduce) }
            item { Charter(reduce) }
            item { Finale(reduce, openWeb, onOpenMoments) }
            item { Spacer(Modifier.height(40.dp)) }
        }
        Row(
            Modifier.fillMaxWidth().background(Sai.void.copy(alpha = 0.94f)).statusBarsPadding().padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier.size(40.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.06f)).clickable(onClick = onBack),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = "رجوع", tint = Sai.text, modifier = Modifier.size(20.dp))
            }
            Text("عقل سبق", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = Sai.text, textAlign = TextAlign.Center, modifier = Modifier.weight(1f))
            Spacer(Modifier.width(40.dp))
        }
    }
}

private fun openWeb(context: Context, path: String) {
    runCatching {
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://sabq.org$path")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}

// ── أدوات مشتركة ─────────────────────────────────────────────────────

/** `.sai-rv`: يصعد من الأسفل ويظهر عند أول تركيب، بتأخير 0.12 ثانية لكل درجة. */
@Composable
private fun Modifier.saiReveal(reduce: Boolean, step: Int = 0): Modifier {
    if (reduce) return this
    val p = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        delay(step * 120L)
        p.animateTo(1f, tween(1000, easing = revealEasing))
    }
    return graphicsLayer {
        alpha = p.value
        translationY = (1 - p.value) * 34.dp.toPx()
    }
}

/** `CountUp`: يبدأ من الصفر عند ظهوره، ويكمل من قيمته الحالية عند كل تحديث. */
@Composable
private fun CountUp(
    value: Double,
    reduce: Boolean,
    decimals: Int = 0,
    suffix: String = "",
    fontSize: TextUnit,
    color: Color = Sai.text,
    weight: FontWeight = FontWeight.SemiBold,
    brush: Brush? = null,
) {
    val anim = remember { Animatable(if (reduce) value.toFloat() else 0f) }
    LaunchedEffect(value) {
        if (reduce) anim.snapTo(value.toFloat()) else anim.animateTo(value.toFloat(), tween(1800, easing = countEasing))
    }
    val text = SaiFormat.number(anim.value.toDouble(), decimals) + suffix
    Ltr {
        Text(
            text,
            style = if (brush != null) TextStyle(brush = brush, fontSize = fontSize, fontWeight = weight) else TextStyle(color = color, fontSize = fontSize, fontWeight = weight),
            maxLines = 1,
            modifier = Modifier.semantics { contentDescription = SaiFormat.number(value, decimals) + suffix },
        )
    }
}

@Composable
private fun Ltr(content: @Composable () -> Unit) {
    androidx.compose.runtime.CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr, content = content)
}

@Composable
private fun Numeral(text: String, fontSize: TextUnit, color: Color = Sai.text, weight: FontWeight = FontWeight.SemiBold) {
    Ltr { Text(text, fontSize = fontSize, fontWeight = weight, color = color, maxLines = 1) }
}

@Composable
private fun Eyebrow(text: String, color: Color = Sai.ai, modifier: Modifier = Modifier) {
    Text(text, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = color, modifier = modifier)
}

@Composable
private fun H2(text: String, align: TextAlign = TextAlign.Center, modifier: Modifier = Modifier) {
    Text(
        text,
        fontSize = 30.sp,
        lineHeight = 40.sp,
        fontWeight = FontWeight.Bold,
        color = Sai.text,
        textAlign = align,
        modifier = modifier.fillMaxWidth().padding(top = 12.dp, bottom = 16.dp).semantics { heading() },
    )
}

@Composable
private fun Sub(text: String, align: TextAlign = TextAlign.Center, modifier: Modifier = Modifier) {
    Text(text, fontSize = 18.sp, lineHeight = 30.sp, color = Sai.soft, textAlign = align, modifier = modifier.fillMaxWidth())
}

@Composable
private fun HLine() {
    Box(Modifier.fillMaxWidth().height(1.dp).background(Sai.faint))
}

/** شبكة عمودين بخطوط فاصلة رفيعة. */
@Composable
private fun <T> TwoColumnGrid(items: List<T>, cell: @Composable (T) -> Unit) {
    Column(Modifier.fillMaxWidth()) {
        HLine()
        items.chunked(2).forEach { pair ->
            Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min)) {
                Box(Modifier.weight(1f)) { cell(pair[0]) }
                Box(Modifier.width(1.dp).fillMaxHeight().background(Sai.faint))
                Box(Modifier.weight(1f)) { if (pair.size > 1) cell(pair[1]) }
            }
            HLine()
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Chips(items: List<Pair<String, Boolean>>) {
    FlowRow(
        Modifier.fillMaxWidth().padding(top = 20.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items.forEach { (label, saudi) ->
            Text(
                label,
                fontSize = 13.sp,
                color = if (saudi) Color(0xFF9FF0CD) else Color(0xFFC7D3E1),
                modifier = Modifier
                    .clip(CircleShape)
                    .background(Color.White.copy(alpha = 0.03f))
                    .border(1.dp, if (saudi) Sai.human.copy(alpha = 0.45f) else Sai.faint, CircleShape)
                    .padding(horizontal = 12.dp, vertical = 6.dp),
            )
        }
    }
}

/** مقطع نصي بلون أو وزن مختلف داخل فقرة (مقابل em وb وcode في الويب). */
private sealed interface Span {
    data class Plain(val text: String) : Span
    data class Strong(val text: String, val color: Color = Sai.text, val weight: FontWeight = FontWeight.Medium) : Span
    data class Code(val text: String) : Span
}

private fun rich(spans: List<Span>, base: Color, baseWeight: FontWeight = FontWeight.Normal): AnnotatedString = buildAnnotatedString {
    spans.forEach { s ->
        when (s) {
            is Span.Plain -> withStyle(SpanStyle(color = base, fontWeight = baseWeight)) { append(s.text) }
            is Span.Strong -> withStyle(SpanStyle(color = s.color, fontWeight = s.weight)) { append(s.text) }
            is Span.Code -> withStyle(SpanStyle(color = Color(0xFFBFE3FF), background = Sai.ai.copy(alpha = 0.1f))) { append(" ${s.text} ") }
        }
    }
}

@Composable
private fun BlinkDot(size: Dp = 8.dp, reduce: Boolean) {
    val alpha = if (reduce) 1f else {
        val t = rememberInfiniteTransition(label = "blink")
        t.animateFloat(1f, 0.35f, infiniteRepeatable(tween(1000), RepeatMode.Reverse), label = "blink").value
    }
    Box(Modifier.size(size).graphicsLayer { this.alpha = alpha }.shadow(6.dp, CircleShape, ambientColor = Sai.human, spotColor = Sai.human).background(Sai.human, CircleShape))
}

/** أرقام مفرّغة بحدّ رفيع (`-webkit-text-stroke`). */
@Composable
private fun OutlinedNumeral(text: String, fontSize: TextUnit, color: Color) {
    Ltr {
        Text(
            text,
            style = TextStyle(fontSize = fontSize, fontWeight = FontWeight.Bold, color = color, drawStyle = Stroke(width = 2f)),
            maxLines = 1,
        )
    }
}

// ── الواجهة ───────────────────────────────────────────────────────────

@Composable
private fun Hero(stats: SaiPublicStats?, team: ApiAiTeam?, reduce: Boolean) {
    val teamCount = team?.let { it.counters?.teamCount?.takeIf { c -> c > 0 } ?: it.team.size } ?: 0
    Column(
        Modifier
            .fillMaxWidth()
            .background(Brush.radialGradient(listOf(Sai.ai.copy(alpha = 0.13f), Color.Transparent)))
            .padding(top = 24.dp, bottom = 64.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Ltr {
            SabqAiBrain(
                Modifier.padding(horizontal = saiMargin).widthIn(max = 520.dp).fillMaxWidth().aspectRatio(1.18f).saiReveal(reduce, 1),
                animate = !reduce,
            )
        }
        Column(Modifier.padding(horizontal = saiMargin), horizontalAlignment = Alignment.CenterHorizontally) {
            Row(
                Modifier
                    .saiReveal(reduce)
                    .clip(CircleShape)
                    .background(Sai.ai.copy(alpha = 0.07f))
                    .border(1.dp, Sai.ai.copy(alpha = 0.28f), CircleShape)
                    .padding(horizontal = 15.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                BlinkDot(reduce = reduce)
                Text("عقل سبق يعمل الآن", fontSize = 14.sp, color = Color(0xFFA9D6FF))
            }
            Column(
                Modifier.padding(top = 24.dp, bottom = 20.dp).saiReveal(reduce, 1).semantics(mergeDescendants = true) { heading() },
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    "عقلٌ لا ينام.",
                    style = TextStyle(
                        fontSize = 40.sp,
                        lineHeight = 52.sp,
                        fontWeight = FontWeight.Bold,
                        brush = Brush.horizontalGradient(listOf(Sai.ai2, Sai.ai, Color(0xFFBFE3FF))),
                        textAlign = TextAlign.Center,
                    ),
                )
                Text("وقرارٌ لا يُفوَّض.", fontSize = 40.sp, lineHeight = 52.sp, fontWeight = FontWeight.Bold, color = Sai.human, textAlign = TextAlign.Center)
            }
            Text(
                "أول منظومة ذكاء تحريري متكاملة في صحيفة سعودية وعربية. ترصد وتحلل وتكتب بالعربية على مدار الساعة، ثم تتوقف عند محرر يقرّر.",
                fontSize = 17.sp,
                lineHeight = 28.sp,
                color = Color(0xFFB4C2D3),
                textAlign = TextAlign.Center,
                modifier = Modifier.widthIn(max = 540.dp).saiReveal(reduce, 2),
            )
            Column(
                Modifier
                    .padding(top = 36.dp)
                    .saiReveal(reduce, 3)
                    .widthIn(max = 360.dp)
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    .background(Sai.deep.copy(alpha = 0.6f))
                    .border(1.dp, Sai.faint, RoundedCornerShape(16.dp)),
            ) {
                Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min)) {
                    StripCell(Modifier.weight(1f), "عملية ذكاء اليوم".takeIf { stats != null } ?: "خدمة ذكية", now = true) {
                        if (stats != null) CountUp(stats.ai.todayOps, reduce, fontSize = 26.sp, color = Sai.ai)
                        else Numeral("+60", 26.sp, Sai.ai)
                    }
                    Box(Modifier.width(1.dp).fillMaxHeight().background(Sai.faint))
                    StripCell(Modifier.weight(1f), if (teamCount > 0) "زميلًا رقميًا" else "لغات نشر") {
                        Numeral(if (teamCount > 0) "$teamCount" else "3", 26.sp)
                    }
                }
                HLine()
                Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min)) {
                    StripCell(Modifier.weight(1f), if (stats != null) "نجاح العمليات" else "بطولات") {
                        Numeral(if (stats != null) SaiFormat.number(stats.ai.successRate, 1) + "%" else "5", 26.sp)
                    }
                    Box(Modifier.width(1.dp).fillMaxHeight().background(Sai.faint))
                    StripCell(Modifier.weight(1f), "بلا انقطاع") { Numeral("24/7", 26.sp) }
                }
            }
        }
    }
}

@Composable
private fun StripCell(modifier: Modifier, label: String, now: Boolean = false, value: @Composable () -> Unit) {
    Column(modifier.padding(horizontal = 22.dp, vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        value()
        Text(label, fontSize = 12.sp, color = Sai.mute)
    }
}

private val tickerItems = listOf(
    "رياضة" to "تقرير المباراة يصدر بعد دقائق من صافرة النهاية — بعد إجازة المحرر",
    "الرادار" to "رصد المصادر العالمية وتقييم أهمية الخبر وتحويل المهم إلى مسودة عربية",
    "صوت" to "نشرات صوتية تُنتج بأصوات عربية وتُدقّق قبل بثّها",
    "لغات" to "النسخ الإنجليزية والأردية تصدر من المنظومة نفسها بعد التدقيق",
    "عُمق" to "تحليلات معمّقة تُبنى بعدة نماذج وتُراجع تحريريًا قبل النشر",
    "مباشر" to "تعليق المباريات يُعرّب لحظة بلحظة من بيانات المباراة الرسمية",
)

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun Ticker() {
    Column {
        HLine()
        Row(Modifier.fillMaxWidth().background(Sai.deep.copy(alpha = 0.7f)), verticalAlignment = Alignment.CenterVertically) {
            Text(
                "من داخل المنظومة",
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFF04121F),
                maxLines = 1,
                modifier = Modifier.background(Sai.ai).padding(horizontal = 18.dp, vertical = 11.dp),
            )
            Text(
                buildAnnotatedString {
                    tickerItems.forEach { (tag, text) ->
                        withStyle(SpanStyle(color = Sai.ai, fontWeight = FontWeight.Bold)) { append(tag) }
                        withStyle(SpanStyle(color = Color(0xFFC3D0DE))) { append("  $text") }
                        append("          ")
                    }
                },
                fontSize = 14.sp,
                maxLines = 1,
                modifier = Modifier.weight(1f).basicMarquee(iterations = Int.MAX_VALUE, velocity = 40.dp).padding(vertical = 11.dp),
            )
        }
        HLine()
    }
}

@Composable
private fun Manifesto(reduce: Boolean) {
    Text(
        rich(
            listOf(
                Span.Plain("الآلة "), Span.Strong("تسرّع"), Span.Plain(". الآلة "), Span.Strong("ترتّب"),
                Span.Plain(". الآلة "), Span.Strong("تكتب المسودة"), Span.Plain(".\nلكن في سبق، "),
                Span.Strong("المسؤولية تحريرية كاملة", Sai.human), Span.Plain(" عن كل ما يصل إليك."),
            ),
            base = Color(0xFF5F7189),
        ),
        fontSize = 24.sp,
        lineHeight = 40.sp,
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth().padding(start = saiMargin, end = saiMargin, top = 80.dp, bottom = 40.dp).saiReveal(reduce),
    )
}

private val signalSources = listOf("وكالات الأنباء", "رادار المصادر العالمية", "بيانات المباريات الرسمية", "مراسلون عبر واتساب والبريد", "منصة X", "أرشيف سبق")
private val providers = listOf(
    Triple("OpenAI", "التحرير والتضمين", false),
    Triple("Anthropic", "التحليل والصياغة", false),
    Triple("Google Gemini", "البصريات والصوت", false),
    Triple("ElevenLabs", "الأصوات العربية", false),
    Triple("HUMAIN", "صوت سعودي", true),
)
private val controls = listOf(
    "توجيه مستقل لكل خدمة" to "لكل مهمة نموذج أساسي وسلسلة بدائل",
    "تحويل تلقائي عند التعثر" to "يتدخل البديل دون توقف الخدمة",
    "قاطع دائرة" to "النموذج المتعثر يُعزل مؤقتًا ويُعاد فحصه آليًا",
    "ميزانيات وسجل كامل" to "قيد لكل عملية: نجاحها وزمنها وتكلفتها",
)

@Composable
private fun Journey(stats: SaiPublicStats?, reduce: Boolean) {
    val radar = stats?.radar?.totalItems ?: 0.0
    val tokensM = stats?.let { Math.round(it.ai.totalTokens / 1_000_000).toDouble() } ?: 0.0
    Column(Modifier.padding(top = 30.dp, bottom = 70.dp)) {
        Chapter("01 · الرصد", "يسمع العالم", reduce = reduce, copy = {
            Body("«راصد» و«سبّاق» يلتقطان الإشارة قبل أن تصير خبرًا، من ست بوابات:")
            Chips(signalSources.map { it to false })
        }) {
            if (radar > 0) Figure("مادة التقطها رادار المصادر العالمية", reduce = reduce) { CountUp(radar, reduce, fontSize = 52.sp, brush = figureBrush) }
            else Figure("بوابات رصد تعمل على مدار الساعة", reduce = reduce) { FigureText("6") }
        }
        Chapter("02 · الفهم", "يفرز ويُقيّم", reduce = reduce, copy = {
            Body("تصنيف آلي، ودرجة أهمية، وتحقق من البيانات. ليس كل ما يحدث خبرًا، والعقل يقرر ما يستحق وقت المحرر.")
        }) {
            if (stats != null && stats.stories.total > 0) {
                Figure("قصة متابعة ذكية تربط الخبر بما سبقه", reduce = reduce) { CountUp(stats.stories.total, reduce, fontSize = 52.sp, brush = figureBrush) }
            } else {
                Figure("أهمية لكل إشارة قبل أن تصل المحرر", reduce = reduce) { FigureText("درجة") }
            }
        }
        Chapter("03 · الكتابة", "يكتب بلسان سبق", reduce = reduce, copy = {
            Body("عربية أولًا بأسلوب الدار، وبلا معلومة مخترعة — عبر بوابة واحدة لكل عملية ذكاء، لا نداء يخرج عنها.")
            Chips(providers.map { "${it.first} · ${it.second}" to it.third })
            Gate()
        }) {
            if (tokensM > 0) {
                val since = stats?.ai?.sinceDate?.let { "توكن عالجها العقل منذ ${SaiFormat.arabicDate(it, withYear = true)}" } ?: "توكن عالجها العقل"
                Figure(since, reduce = reduce) { CountUp(tokensM, reduce, suffix = "M", fontSize = 52.sp, brush = figureBrush) }
            } else {
                Figure("مزوّدي ذكاء خلف بوابة واحدة", reduce = reduce) { FigureText("5") }
            }
        }
        Chapter("04 · التوقف", "ثم يتوقف.", human = true, reduce = reduce, copy = {
            Text("هنا تنتهي صلاحيات الآلة.", fontSize = 22.sp, fontWeight = FontWeight.Medium, color = Color(0xFFE9FFF5), modifier = Modifier.padding(bottom = 14.dp))
            Body("«عين المحرر»: مراجعة وإجازة أو ردّ — والمحتوى الآلي يمرّ ببوابة جودة ووسم واضح. الآلة تقترح، والمحرر يوقّع.")
        }) {
            Figure("صاحب القرار الأخير", human = true, reduce = reduce) {
                Text("المحرر", fontSize = 52.sp, fontWeight = FontWeight.Bold, color = Sai.human, maxLines = 1)
            }
        }
        Chapter("05 · النشر والقياس", "يصل إليك", reduce = reduce, copy = {
            Body("على الويب والتطبيقات، وبالصوت والبودكاست، وبثلاث لغات من منظومة واحدة.")
            Text(
                rich(
                    listOf(
                        Span.Strong("حلقة القياس:", Sai.text, FontWeight.SemiBold),
                        Span.Plain(" كل عملية تُسجَّل لحظة وقوعها — نجحت أم أخفقت، كم استغرقت، كم كلّفت — ثم تعود لتضبط اختيار النماذج وإعداداتها. المنظومة تقيس نفسها وتتحسن بها."),
                    ),
                    base = Sai.soft,
                ),
                fontSize = 14.5.sp,
                lineHeight = 24.sp,
                modifier = Modifier
                    .padding(top = 20.dp)
                    .fillMaxWidth()
                    .border(1.dp, Sai.ai.copy(alpha = 0.45f), RoundedCornerShape(14.dp))
                    .padding(horizontal = 16.dp, vertical = 14.dp),
            )
        }) {
            if (stats != null && stats.articles.totalPublished > 0) {
                Figure("خبر في أرشيف سبق", reduce = reduce) { CountUp(stats.articles.totalPublished, reduce, fontSize = 52.sp, brush = figureBrush) }
            } else {
                Figure("لغات نشر من منظومة واحدة", reduce = reduce) { FigureText("3") }
            }
        }
    }
}

private val figureBrush = Brush.verticalGradient(listOf(Color.White, Color(0xFF7FA3C9)))

@Composable
private fun FigureText(text: String) {
    Ltr { Text(text, style = TextStyle(fontSize = 52.sp, fontWeight = FontWeight.SemiBold, brush = figureBrush), maxLines = 1) }
}

@Composable
private fun Body(text: String) {
    Text(text, fontSize = 18.sp, lineHeight = 30.sp, color = Sai.soft)
}

@Composable
private fun Gate() {
    Column(
        Modifier
            .padding(top = 22.dp)
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Sai.ai.copy(alpha = 0.04f))
            .border(1.dp, Sai.ai.copy(alpha = 0.3f), RoundedCornerShape(16.dp))
            .padding(horizontal = 18.dp, vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text("كيف تُدار البوابة", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFFBFE3FF))
        controls.forEach { (name, desc) ->
            Text(rich(listOf(Span.Strong(name, Sai.text, FontWeight.SemiBold), Span.Plain(" — $desc")), base = Sai.soft), fontSize = 14.sp, lineHeight = 21.sp)
        }
    }
}

@Composable
private fun Chapter(
    idx: String,
    title: String,
    human: Boolean = false,
    reduce: Boolean,
    copy: @Composable () -> Unit,
    figure: @Composable () -> Unit,
) {
    Column {
        HLine()
        Column(Modifier.padding(horizontal = saiMargin, vertical = 60.dp), verticalArrangement = Arrangement.spacedBy(26.dp)) {
            Column(Modifier.fillMaxWidth().saiReveal(reduce)) {
                Text(idx, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = if (human) Sai.human else Sai.ai)
                Text(
                    title,
                    fontSize = 38.sp,
                    lineHeight = 48.sp,
                    fontWeight = FontWeight.Bold,
                    color = if (human) Sai.human else Sai.text,
                    modifier = Modifier.padding(top = 10.dp, bottom = 14.dp).semantics { heading() },
                )
                copy()
            }
            figure()
        }
    }
}

@Composable
private fun Figure(caption: String, human: Boolean = false, reduce: Boolean, value: @Composable () -> Unit) {
    Column(Modifier.fillMaxWidth().saiReveal(reduce, 2).semantics(mergeDescendants = true) {}, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        value()
        Text(caption, fontSize = 15.sp, color = if (human) Color(0xFF9FF0CD) else Sai.mute)
    }
}

private val domains = listOf(
    Triple("تحرير", "التحرير الذكي", "تحليلات «عُمق»، رادار المصادر العالمية، توليد المقالات، التصنيف والروابط الذكية"),
    Triple("رياضة", "الرياضة اللحظية", "تقارير فور الصافرة، معاينات المباريات، التعليق المعرّب لحظة بلحظة"),
    Triple("صوت", "الأخبار المسموعة", "نشرات وموجز صوتي بأصوات عربية طبيعية"),
    Triple("بصري", "الاستوديو البصري", "صور وإنفوجرافيك ومصغّرات وأوصاف بديلة بهوية سبق"),
    Triple("تخصيص", "لكل قارئ صحيفته", "الموجز اليومي والتوصيات الذكية حسب اهتماماتك الحقيقية"),
    Triple("جودة", "الجودة والإشراف", "فلترة التعليقات وفحص معايير النشر وتحليل الأسلوب"),
    Triple("لغات", "ثلاث لغات", "عربي وإنجليزي وأردو من منظومة تحريرية واحدة"),
    Triple("بنية", "البوابة الموحدة", "توجيه النماذج بين المزوّدين وقياس الجودة والتكلفة باستمرار"),
)

@Composable
private fun Domains(reduce: Boolean) {
    Column(Modifier.padding(horizontal = saiMargin, vertical = 110.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Eyebrow("خريطة العقل", modifier = Modifier.saiReveal(reduce))
        H2("ثمانية مجالات، أكثر من ستين خدمة", modifier = Modifier.saiReveal(reduce, 1))
        Sub("كل مجال قسم من أقسام الدماغ، وكلها تمر عبر البوابة نفسها.", modifier = Modifier.saiReveal(reduce, 2))
        Spacer(Modifier.height(56.dp))
        TwoColumnGrid(domains) { (kicker, title, desc) ->
            Column(Modifier.padding(start = 18.dp, end = 18.dp, top = 28.dp, bottom = 30.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(kicker, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Sai.ai)
                Text(title, fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Sai.text)
                Text(desc, fontSize = 14.sp, lineHeight = 21.sp, color = Sai.mute)
            }
        }
        Row(Modifier.padding(top = 44.dp).saiReveal(reduce), horizontalArrangement = Arrangement.spacedBy(26.dp)) {
            SaiStaticFacts.all.take(3).forEach { (value, label) ->
                Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Numeral(value, 44.sp, Sai.ai)
                    Text(label, fontSize = 14.sp, color = Sai.mute, textAlign = TextAlign.Center)
                }
            }
        }
    }
}

private val sportFacts = listOf(
    "دقائق" to "تقرير المباراة يصدر بعد صافرة النهاية بدقائق معدودة",
    "معاينات" to "معاينة ذكية قبل كل مباراة: أرقام المواجهات والتشكيلة المتوقعة",
    "لحظي" to "تعليق المباريات يُعرّب فور وقوع الحدث",
    "0" to "معلومة مخترعة — المصدر بيانات المباراة الرسمية فقط",
)

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Sports(
    reduce: Boolean,
    onWorldCup: () -> Unit,
    onAsianCup: () -> Unit,
    onGulfCup: () -> Unit,
    onRoshn: () -> Unit,
    onKingsCup: () -> Unit,
) {
    val tournaments = listOf(
        "كأس العالم 2026" to onWorldCup,
        "كأس آسيا 2027" to onAsianCup,
        "خليجي 27" to onGulfCup,
        "دوري روشن" to onRoshn,
        "كأس الملك" to onKingsCup,
    )
    Column(
        Modifier
            .fillMaxWidth()
            .background(Brush.verticalGradient(0f to Sai.void, 0.3f to Color(0xFF061322), 0.7f to Color(0xFF061322), 1f to Sai.void))
            .padding(horizontal = saiMargin, vertical = 110.dp),
        verticalArrangement = Arrangement.spacedBy(36.dp),
    ) {
        Column {
            Eyebrow("البطولات نموذجًا", modifier = Modifier.saiReveal(reduce))
            H2("من المونديال\nإلى دوري روشن", align = TextAlign.Start, modifier = Modifier.saiReveal(reduce, 1))
            Sub(
                "واكبنا كأس العالم بتقارير تصدر مع صافرة النهاية — واليوم تعمل المحرّكات نفسها في البطولات القارية والمحلية.",
                align = TextAlign.Start,
                modifier = Modifier.saiReveal(reduce, 2),
            )
            FlowRow(
                Modifier.padding(top = 26.dp).saiReveal(reduce, 3),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                tournaments.forEach { (label, open) ->
                    Text(
                        label,
                        fontSize = 14.5.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Sai.text,
                        modifier = Modifier
                            .clip(CircleShape)
                            .border(1.dp, Color.White.copy(alpha = 0.2f), CircleShape)
                            .clickable(onClick = open)
                            .padding(horizontal = 16.dp, vertical = 8.dp),
                    )
                }
            }
        }
        Box(Modifier.saiReveal(reduce, 2)) {
            TwoColumnGrid(sportFacts) { (value, label) ->
                Column(Modifier.padding(horizontal = 18.dp, vertical = 26.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(value, fontSize = 32.sp, fontWeight = FontWeight.Bold, color = Sai.ai)
                    Text(label, fontSize = 14.5.sp, lineHeight = 22.sp, color = Sai.soft)
                }
            }
        }
    }
}

@Composable
private fun Team(team: ApiAiTeam, reduce: Boolean) {
    val teamCount = team.counters?.teamCount?.takeIf { it > 0 } ?: team.team.size
    Column(Modifier.padding(horizontal = saiMargin, vertical = 120.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Eyebrow("داخل عقل سبق", modifier = Modifier.saiReveal(reduce))
        H2("فريق سبق الذكي", modifier = Modifier.saiReveal(reduce, 1))
        Sub(
            "أول غرفة أخبار سعودية تعرّفك بزملائها الرقميين بأسمائهم وأدوارهم وأقسامهم — يعملون على مدار الساعة، وفي المركز دائمًا هيئة التحرير.",
            modifier = Modifier.saiReveal(reduce, 2),
        )
        Column(
            Modifier.padding(top = 50.dp).saiReveal(reduce, 3),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            Column(
                Modifier
                    .size(170.dp)
                    .shadow(40.dp, CircleShape, ambientColor = Sai.human, spotColor = Sai.human)
                    .background(Sai.void, CircleShape)
                    .background(Brush.radialGradient(listOf(Sai.human.copy(alpha = 0.22f), Sai.human.copy(alpha = 0.05f))), CircleShape)
                    .border(1.5.dp, Sai.human.copy(alpha = 0.6f), CircleShape)
                    .semantics(mergeDescendants = true) {},
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Text("هيئة التحرير", fontSize = 19.sp, fontWeight = FontWeight.Bold, color = Sai.human)
                Text("القرار الأخير", fontSize = 12.5.sp, color = Color(0xFFB8F5DA))
            }
            team.team.chunked(4).forEach { row ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    row.forEach { Mate(it, Modifier.weight(1f)) }
                    repeat(4 - row.size) { Spacer(Modifier.weight(1f)) }
                }
            }
        }
        Row(Modifier.padding(top = 36.dp).saiReveal(reduce), horizontalArrangement = Arrangement.spacedBy(26.dp)) {
            team.counters?.monthOps?.takeIf { it > 0 }?.let { ops ->
                FootStat("عملًا هذا الشهر") { CountUp(ops.toDouble(), reduce, fontSize = 34.sp) }
            }
            FootStat("زميلًا رقميًا") { Numeral("$teamCount", 34.sp) }
            FootStat("تحت إشراف بشري") { Numeral("100%", 34.sp) }
        }
        Text(
            "🛡 الإنسان يعتمد كل شيء — سياسة سبق للذكاء الاصطناعي",
            fontSize = 13.5.sp,
            color = Color(0xFFDCF1FE),
            textAlign = TextAlign.Center,
            modifier = Modifier
                .padding(top = 28.dp)
                .saiReveal(reduce)
                .clip(CircleShape)
                .background(Sai.ai.copy(alpha = 0.07f))
                .border(1.dp, Sai.ai.copy(alpha = 0.35f), CircleShape)
                .padding(horizontal = 18.dp, vertical = 8.dp),
        )
    }
}

@Composable
private fun Mate(m: ApiAiTeamMember, modifier: Modifier) {
    Column(
        modifier.semantics(mergeDescendants = true) { contentDescription = "${m.nameAr}، ${m.titleAr}، ${m.departmentAr}" },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        Box(
            Modifier
                .size(50.dp)
                .clip(CircleShape)
                .background(Color(0xFF0B1A2C))
                .border(1.5.dp, Sai.ai.copy(alpha = 0.5f), CircleShape),
        ) {
            m.absoluteAvatarUrl?.let {
                AsyncImage(model = it, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize().clip(CircleShape))
            }
        }
        Text(m.nameAr, fontSize = 13.5.sp, fontWeight = FontWeight.Bold, color = Sai.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun FootStat(label: String, value: @Composable () -> Unit) {
    Column(Modifier.semantics(mergeDescendants = true) {}, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
        value()
        Text(label, fontSize = 14.sp, color = Sai.mute)
    }
}

@Composable
private fun LiveNumbers(stats: SaiPublicStats?, team: ApiAiTeam?, reduce: Boolean) {
    Column(
        Modifier
            .fillMaxWidth()
            .background(Brush.radialGradient(listOf(Sai.ai.copy(alpha = 0.15f), Color.Transparent)))
            .padding(start = saiMargin, end = saiMargin, top = 130.dp, bottom = 110.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        if (stats == null) {
            Eyebrow("الأرقام تتحدث", modifier = Modifier.saiReveal(reduce))
            Spacer(Modifier.height(50.dp))
            Box(Modifier.saiReveal(reduce, 1)) {
                TwoColumnGrid(SaiStaticFacts.all) { (value, label) ->
                    Column(Modifier.padding(horizontal = 14.dp, vertical = 26.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Numeral(value, 36.sp, Sai.ai, FontWeight.Bold)
                        Text(label, fontSize = 14.sp, lineHeight = 20.sp, color = Sai.soft)
                    }
                }
            }
            return@Column
        }
        Row(
            Modifier.saiReveal(reduce).border(1.dp, Sai.human.copy(alpha = 0.35f), CircleShape).padding(horizontal = 12.dp, vertical = 5.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            BlinkDot(7.dp, reduce)
            Text("مباشر من قاعدة البيانات", fontSize = 13.sp, color = Color(0xFF9EE6BF))
        }
        Box(Modifier.padding(top = 18.dp).saiReveal(reduce, 1)) {
            CountUp(
                stats.ai.totalOps,
                reduce,
                fontSize = 60.sp,
                weight = FontWeight.Bold,
                brush = Brush.verticalGradient(listOf(Color.White, Sai.ai)),
            )
        }
        Text(
            "عملية ذكاء اصطناعي نفّذتها المنظومة" + (stats.ai.sinceDate?.let { " منذ ${SaiFormat.arabicDate(it, withYear = true)}" } ?: ""),
            fontSize = 22.sp,
            lineHeight = 32.sp,
            color = Sai.text,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 16.dp).saiReveal(reduce, 2),
        )
        Text(
            "لا أرقام تقديرية ولا وهمية — كل رقم يُقرأ لحظة فتح الصفحة من أنظمة سبق، ويتحدّث تلقائيًا",
            fontSize = 14.sp,
            lineHeight = 21.sp,
            color = Sai.mute,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 8.dp).saiReveal(reduce, 2),
        )
        Box(Modifier.padding(top = 70.dp).saiReveal(reduce, 3)) {
            TwoColumnGrid(SaiLive.tiles(stats, team?.counters?.monthOps)) { tile ->
                Column(
                    Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    CountUp(tile.value, reduce, tile.decimals, tile.suffix, fontSize = 28.sp)
                    Text(tile.label, fontSize = 13.5.sp, color = Sai.mute, textAlign = TextAlign.Center)
                }
            }
        }

        val rows = SaiLive.domainRows(stats)
        val daily = stats.ai.daily
        val showDomains = rows.isNotEmpty() && stats.ai.todayOps > 0
        if (showDomains || daily.size >= 3) {
            Column(Modifier.fillMaxWidth().padding(top = 56.dp).saiReveal(reduce), verticalArrangement = Arrangement.spacedBy(36.dp)) {
                if (showDomains) {
                    val total = rows.sumOf { it.second }.coerceAtLeast(1.0)
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text("عمليات اليوم حسب المجال", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFFC3D0DE), modifier = Modifier.padding(bottom = 6.dp))
                        rows.forEach { (label, value) ->
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                Text(label, fontSize = 14.sp, color = Color(0xFFC3D0DE), modifier = Modifier.width(56.dp))
                                Box(Modifier.weight(1f).height(7.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.07f))) {
                                    Box(
                                        Modifier
                                            .fillMaxWidth((value / total).toFloat().coerceIn(0f, 1f))
                                            .fillMaxHeight()
                                            .clip(CircleShape)
                                            .background(Brush.horizontalGradient(listOf(Sai.ai2, Sai.ai))),
                                    )
                                }
                                Box(Modifier.width(60.dp), contentAlignment = Alignment.CenterEnd) {
                                    Numeral(SaiFormat.number(value), 14.sp, Color.White)
                                }
                            }
                        }
                    }
                }
                if (daily.size >= 3) {
                    val dailyMax = daily.maxOf { it.count }.coerceAtLeast(1.0)
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("النشاط اليومي — آخر ${daily.size} يومًا", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFFC3D0DE), modifier = Modifier.padding(bottom = 10.dp))
                        // الأعمدة بالاتجاه الزمني من اليسار إلى اليمين كما في الويب.
                        Ltr {
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Row(
                                    Modifier.fillMaxWidth().height(130.dp).semantics {
                                        contentDescription = "رسم أعمدة لعمليات الذكاء الاصطناعي اليومية، الذروة ${SaiFormat.number(dailyMax)}"
                                    },
                                    horizontalArrangement = Arrangement.spacedBy(7.dp),
                                    verticalAlignment = Alignment.Bottom,
                                ) {
                                    daily.forEachIndexed { i, d ->
                                        val tint = if (i == daily.size - 1) Sai.human else Sai.ai
                                        Box(
                                            Modifier
                                                .weight(1f)
                                                .height(maxOf(3.0, 130 * d.count / dailyMax).dp)
                                                .clip(RoundedCornerShape(topStart = 4.dp, topEnd = 4.dp))
                                                .background(Brush.verticalGradient(listOf(tint, tint.copy(alpha = 0.15f)))),
                                        )
                                    }
                                }
                                Row(Modifier.fillMaxWidth()) {
                                    Text(SaiFormat.arabicDate(daily.first().date), fontSize = 11.5.sp, color = Color(0xFF6D8199))
                                    Spacer(Modifier.weight(1f))
                                    Text("اليوم", fontSize = 11.5.sp, color = Color(0xFF6D8199))
                                }
                            }
                        }
                    }
                }
            }
        }
        Text("آخر تحديث: ${SaiFormat.updatedAgo(stats.generatedAt)}", fontSize = 13.sp, color = Color(0xFF6D8199), modifier = Modifier.padding(top = 30.dp))
    }
}

/** «ما لن يفعله عقل سبق» — آليات مبرمجة فعلًا في المنظومة، لا وعود. */
private val governance: List<Pair<String, List<Span>>> = listOf(
    "يحلّ محل المحرر" to listOf(Span.Strong("الذكاء يقترح، والإنسان يقرّر."), Span.Plain(" المحرر يملك الإجازة والرد والتعديل، وسبق تتحمّل مسؤولية كل ما تنشره.")),
    "يتعثر بصمت" to listOf(Span.Plain("ثلاثة إخفاقات متتالية تعزل النموذج وتحوّل المسار لبديله، ويُعاد فحصه آليًا كل خمس دقائق. وأي تدهور في مزوّد ذكاء "), Span.Strong("يصل رئيس التحرير برسالة فورية"), Span.Plain(".")),
    "يضيف رقمًا من عنده" to listOf(Span.Plain("في التغطيات الرياضية: "), Span.Strong("كل رقم في النص المولّد يجب أن يرد حرفيًا"), Span.Plain(" في بيانات المباراة الرسمية.")),
    "يُخفي أن الصورة مولّدة" to listOf(Span.Plain("كل صورة يولّدها الذكاء الاصطناعي تحمل داخل ملفها "), Span.Strong("وسمًا معياريًا (IPTC)"), Span.Plain(" يعلن أنها مولّدة خوارزميًا، ويُعاد كتابته بعد كل معالجة.")),
    "يعمل في الظل" to listOf(Span.Plain("سجل تدقيق يفصل ما فعله "), Span.Strong("إنسان"), Span.Plain(" عمّا فعله "), Span.Strong("النظام"), Span.Plain(" عمّا فعله "), Span.Strong("الذكاء الاصطناعي"), Span.Plain(". وكل تغيير في إعدادات النماذج مقيّد: من غيّر، وماذا، ومتى.")),
    "ينفق بلا رقابة" to listOf(Span.Plain("حدود إنفاق شهرية لكل مزوّد وكل خدمة، وتكلفة كل عملية تُقيَّد وتُراقب من لوحة موحّدة.")),
    "يحكم على التعليقات وحده" to listOf(Span.Plain("قرارات المشرفين على التعليقات تعود أمثلةً "), Span.Strong("تضبط بها الرقابة الذكية أحكامها التالية"), Span.Plain(".")),
    "يسمح بتدريب الآلات على صحافتنا" to listOf(Span.Plain("ملف"), Span.Code("robots.txt"), Span.Plain("يغلق الباب أمام زواحف تدريب النماذج — GPTBot وClaudeBot وCCBot وغيرها — ويبقيه مفتوحًا لمحركات البحث.")),
    "يترجم بدل أن يكتب" to listOf(Span.Plain("أسلوب الدار وقواعد اللغة مكتوبة داخل كل نموذج توليد، وأسماء اللاعبين والملاعب والمدربين تُعرّب عبر طبقات تحقق بمراجعة تحريرية — فلا يصل القارئ حرف أجنبي.")),
)

@Composable
private fun Governance(reduce: Boolean) {
    Column(
        Modifier
            .fillMaxWidth()
            .background(Brush.verticalGradient(0f to Sai.void, 0.25f to Sai.deep, 0.75f to Sai.deep, 1f to Sai.void))
            .padding(horizontal = saiMargin, vertical = 120.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Eyebrow("الحوكمة", Sai.warn, Modifier.saiReveal(reduce))
        H2("ما لن يفعله عقل سبق", modifier = Modifier.saiReveal(reduce, 1))
        Spacer(Modifier.height(64.dp))
        governance.forEach { (title, body) ->
            HLine()
            Column(Modifier.fillMaxWidth().padding(vertical = 28.dp).saiReveal(reduce), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    rich(listOf(Span.Strong("لن", Sai.warn, FontWeight.SemiBold), Span.Plain(" $title")), base = Sai.text, baseWeight = FontWeight.SemiBold),
                    fontSize = 22.sp,
                    lineHeight = 30.sp,
                    modifier = Modifier.semantics { heading() },
                )
                Text(rich(body, base = Sai.soft), fontSize = 16.sp, lineHeight = 28.sp)
            }
        }
    }
}

private val charter = listOf(
    Triple("1", "الإنسان يقرّر", "كل مادة تمرّ بمراجعة بشرية قبل النشر، أو تصدر موسومةً كمحتوى آلي تحت بوابات جودة مبرمجة وإشراف تحريري."),
    Triple("2", "لا اختلاق", "النموذج يصوغ من بيانات ومصادر موثّقة فقط، ولا يضيف معلومة من عنده."),
    Triple("3", "الشفافية", "نُبيّن للقارئ دور الذكاء حيث يكون جوهريًا في إنتاج المادة."),
    Triple("4", "الرأي للإنسان", "الذكاء لا يكتب رأيًا ولا يتبنّى موقفًا؛ الموقف لكتّابنا."),
    Triple("5", "مسؤوليتنا كاملة", "سبق تتحمّل مسؤولية كل ما تنشره، أيًّا كانت الأداة."),
    Triple("6", "خصوصية القارئ", "بيانات القرّاء تُستخدم لخدمتهم، ولا شيء غير ذلك."),
    Triple("7", "قياس دائم", "جودة كل نموذج وتكلفته تُراقبان عبر بوابة موحّدة، والأفضل يبقى."),
    Triple("8", "عربيةٌ أولًا", "نُطوّع النماذج للغة العربية وسياقها السعودي — لا العكس."),
)

@Composable
private fun Charter(reduce: Boolean) {
    Column(Modifier.padding(horizontal = saiMargin, vertical = 110.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Eyebrow("الميثاق", modifier = Modifier.saiReveal(reduce))
        H2("ميثاق سبق للذكاء الاصطناعي", modifier = Modifier.saiReveal(reduce, 1))
        Sub("ثماني مواد تحكم كل نموذج يعمل في غرفة أخبارنا.", modifier = Modifier.saiReveal(reduce, 2))
        Spacer(Modifier.height(56.dp))
        TwoColumnGrid(charter) { (no, title, desc) ->
            Column(
                Modifier
                    .padding(start = 18.dp, end = 18.dp, top = 28.dp, bottom = 30.dp)
                    .semantics(mergeDescendants = true) { contentDescription = "المادة $no: $title. $desc" },
            ) {
                OutlinedNumeral(no, 46.sp, Sai.ai.copy(alpha = 0.6f))
                Text(title, fontSize = 18.sp, fontWeight = FontWeight.Bold, color = Sai.text, modifier = Modifier.padding(top = 12.dp, bottom = 8.dp))
                Text(desc, fontSize = 14.sp, lineHeight = 21.sp, color = Sai.mute)
            }
        }
    }
}

@Composable
private fun Finale(reduce: Boolean, openWeb: (String) -> Unit, onMoments: () -> Unit) {
    val doors = listOf(
        Triple("استوديو البرومبت", "أداة مجانية لكل زائر لتحسين صياغة أوامره للذكاء الاصطناعي — مساهمة في رفع الوعي التقني.", "جرّب الأداة ←") to { openWeb("/prompt-studio") },
        Triple("المباريات الآن", "تغطية حية وتعريب فوري لكل مباراة.", "ادخل ←") to { openWeb("/sports/live") },
        Triple("لحظة بلحظة", "الأحداث كما يرصدها العقل ويجيزها المحرر.", "ادخل ←") to onMoments,
        // علامة RLM تبقي ترتيب السطر من اليمين رغم أنه يبدأ بكلمة إنجليزية.
        Triple("سبق بثلاث لغات", "العقل نفسه بالإنجليزية والأردية.", "‏English · اردو ←") to { openWeb("/en") },
    )
    Column(
        Modifier.padding(start = saiMargin, end = saiMargin, top = 130.dp, bottom = 120.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(Modifier.saiReveal(reduce)) { OutlinedNumeral("2026", 90.sp, Sai.ai.copy(alpha = 0.45f)) }
        Column(
            Modifier.padding(bottom = 16.dp).saiReveal(reduce, 1).semantics(mergeDescendants = true) { heading() },
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text("عام الذكاء الاصطناعي.", fontSize = 30.sp, lineHeight = 40.sp, fontWeight = FontWeight.Bold, color = Sai.text, textAlign = TextAlign.Center)
            Text("في سبق، بدأ قبل ذلك.", fontSize = 30.sp, lineHeight = 40.sp, fontWeight = FontWeight.Bold, color = Sai.ai, textAlign = TextAlign.Center)
        }
        Sub(
            "اعتمدت المملكة 2026 عامًا للذكاء الاصطناعي. منظومة إعلامية سعودية تخدم أهداف الاستراتيجية الوطنية للبيانات والذكاء الاصطناعي — بقرار بشري في كل مادة.",
            modifier = Modifier.saiReveal(reduce, 2),
        )
        Column(Modifier.padding(top = 60.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            doors.forEachIndexed { i, (copy, open) ->
                val (title, desc, cta) = copy
                Column(
                    Modifier
                        .fillMaxWidth()
                        .saiReveal(reduce, i)
                        .clip(RoundedCornerShape(18.dp))
                        .background(Brush.verticalGradient(listOf(Color.White.copy(alpha = 0.04f), Color.White.copy(alpha = 0.01f))))
                        .border(1.dp, Sai.faint, RoundedCornerShape(18.dp))
                        .clickable(onClick = open)
                        .padding(24.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(title, fontSize = 18.sp, fontWeight = FontWeight.Bold, color = Sai.text)
                    Text(desc, fontSize = 14.sp, lineHeight = 21.sp, color = Sai.mute)
                    Text(cta, fontSize = 14.sp, color = Sai.ai, modifier = Modifier.padding(top = 6.dp))
                }
            }
        }
    }
}
