package com.sabq.smart.feature.mawaeed

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.outlined.AccountBalance
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.EventAvailable
import androidx.compose.material.icons.outlined.ExpandLess
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.Favorite
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Link
import androidx.compose.material.icons.outlined.Place
import androidx.compose.material.icons.outlined.School
import androidx.compose.material.icons.outlined.VerifiedUser
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.sabq.smart.ui.components.EmptyStateView
import com.sabq.smart.ui.components.SabqDetailScaffold
import com.sabq.smart.ui.theme.SabqTheme
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import java.time.Instant
import javax.inject.Inject
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

// ── ViewModels ────────────────────────────────────────────────────────────

data class MawaeedUiState(
    val payload: MawaeedViewPayload? = null,
    val error: String? = null,
    val loading: Boolean = false,
    val region: String = MawaeedPrefs.DEFAULT_REGION,
    val selectedSlug: String? = null,
)

private const val LOAD_ERROR = "الخدمة لم تستجب الآن. أعد المحاولة بعد لحظات."

@HiltViewModel
class MawaeedViewModel @Inject constructor(
    private val api: MawaeedApi,
    @ApplicationContext private val context: Context,
) : ViewModel() {
    private val _state = MutableStateFlow(MawaeedUiState(region = MawaeedPrefs.region(context)))
    val state: StateFlow<MawaeedUiState> = _state.asStateFlow()
    private var loadedDay = MawaeedLogic.riyadhDateISO(Instant.now())

    init {
        load()
        // يوم جديد بتوقيت الرياض يعيد الجلب كما يفعل الويب.
        viewModelScope.launch {
            while (true) {
                delay(60_000)
                val today = MawaeedLogic.riyadhDateISO(Instant.now())
                if (today != loadedDay) {
                    loadedDay = today
                    load()
                }
            }
        }
    }

    fun load() {
        _state.update { it.copy(loading = true) }
        viewModelScope.launch {
            runCatching { api.overview(MawaeedPrefs.query(_state.value.region)) }
                .onSuccess { p -> _state.update { it.copy(payload = p, error = null, loading = false) } }
                .onFailure { _state.update { it.copy(loading = false, error = if (it.payload == null) LOAD_ERROR else null) } }
        }
    }

    fun select(slug: String) = _state.update { it.copy(selectedSlug = slug) }

    fun pickRegion(id: String, schoolSlug: String?) {
        MawaeedPrefs.setRegion(context, id)
        _state.update { it.copy(region = id, selectedSlug = schoolSlug ?: it.selectedSlug) }
        load()
    }
}

@HiltViewModel
class MawaeedServiceViewModel @Inject constructor(
    private val api: MawaeedApi,
    @ApplicationContext context: Context,
    savedState: SavedStateHandle,
) : ViewModel() {
    private val slug: String = savedState.get<String>("slug").orEmpty()
    private val region = MawaeedPrefs.region(context)
    private val _state = MutableStateFlow(MawaeedUiState(region = region))
    val state: StateFlow<MawaeedUiState> = _state.asStateFlow()

    init { load() }

    fun load() {
        viewModelScope.launch {
            runCatching { api.service(slug, MawaeedPrefs.query(region)) }
                .onSuccess { p -> _state.update { it.copy(payload = p, error = null) } }
                .onFailure { _state.update { it.copy(error = if (it.payload == null) LOAD_ERROR else null) } }
        }
    }
}

// ── Screens ───────────────────────────────────────────────────────────────

/** «مواعيدك» — نظير iOS `MawaeedView` (نقل MawaeedPage.tsx). */
@Composable
fun MawaeedScreen(
    onBack: () -> Unit,
    onOpenService: (slug: String, title: String) -> Unit,
    viewModel: MawaeedViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    SabqDetailScaffold(title = "مواعيدك", onBack = onBack) {
        Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(24.dp)) {
            val payload = state.payload
            when {
                payload != null -> MawaeedOverview(payload, state, viewModel, onOpenService)
                state.error != null -> LoadError(state.error.orEmpty(), viewModel::load)
                else -> Loading()
            }
        }
    }
}

@Composable
private fun MawaeedOverview(
    view: MawaeedViewPayload,
    state: MawaeedUiState,
    viewModel: MawaeedViewModel,
    onOpenService: (String, String) -> Unit,
) {
    val colors = SabqTheme.colors
    val nearest = MawaeedLogic.nearestCard(view.series)
    val pulse = MawaeedLogic.pulseBlocks(view.series)
    val school = MawaeedLogic.schoolBlock(view.series)
    val activeBlock = state.selectedSlug?.let { s -> view.series.firstOrNull { it.slug == s && it.next != null } }
        ?: nearest?.let { n -> view.series.firstOrNull { it.slug == n.seriesSlug } }
        ?: pulse.firstOrNull()
    val activeCard = activeBlock?.next ?: nearest
    val financial = MawaeedLogic.boardBlocks(view.series, activeCard)
    val rows = MawaeedLogic.schoolRows(school).filter { it.key != activeCard?.key }.take(5)
    val regionLabel = view.regions.firstOrNull { it.id == view.region }?.label.orEmpty()
    val now = rememberMawaeedClock()

    PageHeader(view.page?.h1 ?: "مواعيدك", view.page?.description?.replace(" ورابط المصدر الرسمي", ""), view.dateModifiedLabel)

    if (pulse.isNotEmpty()) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("اختر الخدمة", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = colors.secondaryInk)
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                pulse.forEach { block ->
                    val selected = activeBlock?.slug == block.slug
                    val earliest = block.next != null && block.next.key == nearest?.key
                    val tone = toneOf(block.mwKind)
                    Column(
                        Modifier
                            .width(128.dp)
                            .clip(RoundedCornerShape(14.dp))
                            .background(if (selected) fillOf(block.mwKind).copy(alpha = 0.12f) else colors.surface)
                            .border(
                                BorderStroke(if (selected) 1.5.dp else 0.75.dp, if (selected) tone else colors.outline),
                                RoundedCornerShape(14.dp),
                            )
                            .clickable(enabled = block.next != null) { viewModel.select(block.slug) }
                            .alpha(if (block.next == null) 0.6f else 1f)
                            .padding(12.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        KindChip(block.mwKind)
                        Text(MawaeedLogic.shortTitle(block), fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = colors.ink, maxLines = 1)
                        Text(
                            if (block.next == null) "لا موعد معلن" else if (earliest) "الأقرب" else " ",
                            fontSize = 12.sp,
                            color = if (earliest) tone else colors.tertiaryInk,
                        )
                    }
                }
            }
        }
    }

    if (activeCard != null) {
        MawaeedHero(
            card = activeCard,
            kicker = if (activeCard.key == nearest?.key) "الموعد الأقرب" else "الموعد المختار",
            regionLabel = if (activeCard.mwKind == MawaeedKind.SchoolHoliday) regionLabel else null,
            now = now,
            onCta = activeBlock?.let { b -> { onOpenService(b.slug, b.title) } },
        )
    }

    if (financial.isNotEmpty()) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            SectionHeading("مواعيد الصرف الأخرى", "الرواتب والدعم الشهري، مرتبة حسب الأقرب")
            financial.forEach { block -> BoardCard(block, now) { onOpenService(block.slug, block.title) } }
        }
    }

    if (school != null) {
        SchoolSection(school, view, state, rows, activeCard, now, onRegion = { viewModel.pickRegion(it, school.slug) }) {
            onOpenService(school.slug, school.title)
        }
    }

    MethodBox()
}

/** صفحة خدمة واحدة — نظير iOS `MawaeedServiceView` (نقل /services/…). */
@Composable
fun MawaeedServiceScreen(
    title: String,
    onBack: () -> Unit,
    viewModel: MawaeedServiceViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val colors = SabqTheme.colors
    SabqDetailScaffold(title = title, onBack = onBack) {
        Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(24.dp)) {
            val view = state.payload
            val block = view?.series?.firstOrNull()
            when {
                view != null && block != null -> {
                    val now = rememberMawaeedClock()
                    PageHeader(view.page?.h1 ?: block.title, block.summary, view.dateModifiedLabel)
                    val next = block.next
                    if (next != null) {
                        MawaeedHero(
                            card = next,
                            kicker = "الموعد القادم",
                            regionLabel = if (next.mwKind == MawaeedKind.SchoolHoliday) view.regions.firstOrNull { it.id == view.region }?.label else null,
                            now = now,
                            onCta = null,
                        )
                        next.source?.let { url ->
                            Row(
                                Modifier.clickable { openUrl(context, url) },
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                Icon(Icons.Outlined.Link, contentDescription = null, tint = colors.primaryEnd, modifier = Modifier.size(16.dp))
                                Text("المصدر: ${next.sourceTitle ?: Uri.parse(url).host ?: url}", fontSize = 13.sp, color = colors.primaryEnd)
                            }
                        }
                    } else {
                        Text(block.answerLine, fontSize = 15.sp, color = colors.secondaryInk)
                    }

                    block.servicePageId?.let { pageId ->
                        // اشتراك webcal في ملف الويب نفسه فتصل المواعيد الجديدة تلقائيًا.
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .heightIn(min = 48.dp)
                                .clip(RoundedCornerShape(14.dp))
                                .background(colors.primaryEnd)
                                .clickable { openCalendar(context, pageId) }
                                .padding(horizontal = 16.dp),
                            horizontalArrangement = Arrangement.Center,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(Icons.Outlined.EventAvailable, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(8.dp))
                            Text("أضف المواعيد إلى التقويم", color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                        }
                    }

                    view.sections.filter { it.cards.isNotEmpty() }.forEach { section ->
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(section.title, fontSize = 17.sp, fontWeight = FontWeight.Bold, color = colors.ink)
                            Surface12 {
                                section.cards.forEachIndexed { i, card ->
                                    if (i > 0) HorizontalDivider(color = colors.outline.copy(alpha = 0.6f))
                                    MawaeedRow(card, now)
                                }
                            }
                        }
                    }

                    if (view.faq.isNotEmpty()) {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("أسئلة شائعة", fontSize = 17.sp, fontWeight = FontWeight.Bold, color = colors.ink)
                            Surface12 {
                                view.faq.forEachIndexed { i, item ->
                                    if (i > 0) HorizontalDivider(color = colors.outline.copy(alpha = 0.6f))
                                    FaqItem(item, toneOf(block.mwKind))
                                }
                            }
                        }
                    }
                }
                state.error != null -> LoadError(state.error.orEmpty(), viewModel::load)
                else -> Loading()
            }
        }
    }
}

// ── Components ────────────────────────────────────────────────────────────

/** ساعة واحدة للصفحة: تدق كل نصف دقيقة كما في الويب. */
@Composable
private fun rememberMawaeedClock(): Instant {
    val now by produceState(Instant.now()) {
        while (true) {
            delay(30_000)
            value = Instant.now()
        }
    }
    return now
}

@Composable
private fun isDark(): Boolean = SabqTheme.colors.background.luminance() < 0.5f

/** لون الخدمة للنص والحدود (`--mw-t-*`)، بدرجتيه. */
@Composable
internal fun toneOf(kind: MawaeedKind): Color {
    val dark = isDark()
    fun c(light: Long, night: Long) = Color(if (dark) night else light)
    return when (kind) {
        MawaeedKind.SchoolHoliday -> c(0xFF086B9E, 0xFF78C9F0)
        MawaeedKind.Salary -> c(0xFF4338CA, 0xFFA5B4FC)
        MawaeedKind.CitizenAccount -> c(0xFFBE123C, 0xFFFDA4AF)
        MawaeedKind.SocialSecurity -> c(0xFFA21CAF, 0xFFF0ABFC)
        MawaeedKind.Pension -> c(0xFF0E7490, 0xFF67E8F9)
        MawaeedKind.Other -> SabqTheme.colors.primaryEnd
    }
}

/** لون التعبئة الزاهي (`--mw-f-*`) للخلفيات الخفيفة والأيقونات. */
@Composable
internal fun fillOf(kind: MawaeedKind): Color = when (kind) {
    MawaeedKind.SchoolHoliday -> Color(0xFF0A8FD6)
    MawaeedKind.Salary -> Color(0xFF6366F1)
    MawaeedKind.CitizenAccount -> Color(0xFFF43F5E)
    MawaeedKind.SocialSecurity -> Color(0xFFD946EF)
    MawaeedKind.Pension -> Color(0xFF06B6D4)
    MawaeedKind.Other -> SabqTheme.colors.primaryEnd
}

private fun iconOf(kind: MawaeedKind): ImageVector = when (kind) {
    MawaeedKind.SchoolHoliday -> Icons.Outlined.School
    MawaeedKind.Salary -> Icons.Outlined.AccountBalance
    MawaeedKind.Pension -> Icons.Outlined.VerifiedUser
    MawaeedKind.SocialSecurity -> Icons.Outlined.Favorite
    MawaeedKind.CitizenAccount -> Icons.Outlined.Home
    MawaeedKind.Other -> Icons.Outlined.CalendarMonth
}

@Composable
private fun KindChip(kind: MawaeedKind, size: Int = 28) {
    Box(
        Modifier.size(size.dp).clip(RoundedCornerShape(8.dp)).background(fillOf(kind).copy(alpha = 0.14f)),
        contentAlignment = Alignment.Center,
    ) {
        Icon(iconOf(kind), contentDescription = null, tint = toneOf(kind), modifier = Modifier.size((size * 0.55f).dp))
    }
}

@Composable
private fun statusColors(confirmed: Boolean): Pair<Color, Color> {
    val dark = isDark()
    return if (confirmed) {
        Color(if (dark) 0xFF72D4AE else 0xFF0D6B4D) to Color(if (dark) 0xFF12372D else 0xFFE4F5EC)
    } else {
        Color(if (dark) 0xFFE8BD6A else 0xFF8A5A00) to Color(if (dark) 0xFF3A2F14 else 0xFFFFF2CF)
    }
}

/** شارة الحالة: مؤكد (أخضر) / متوقع (كهرماني) / انتهى (رمادي). */
@Composable
private fun MawaeedBadge(card: MawaeedCard) {
    val colors = SabqTheme.colors
    val (ink, fill) = if (card.isPast) colors.secondaryInk to colors.paleFill else statusColors(!card.isExpected)
    if (card.badgeText.isBlank()) return
    Text(
        card.badgeText,
        fontSize = 12.sp,
        fontWeight = FontWeight.SemiBold,
        color = ink,
        modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(fill).padding(horizontal = 8.dp, vertical = 2.dp),
    )
}

/** البطل: الموعد المختار أو الأقرب، بعدّاد أيام/ساعات/دقائق. */
@Composable
private fun MawaeedHero(card: MawaeedCard, kicker: String, regionLabel: String?, now: Instant, onCta: (() -> Unit)?) {
    val colors = SabqTheme.colors
    val tone = toneOf(card.mwKind)
    val fill = fillOf(card.mwKind)
    val shape = RoundedCornerShape(16.dp)
    Column(
        Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(colors.surface)
            .border(1.dp, tone.copy(alpha = 0.25f), shape),
    ) {
        Box(Modifier.fillMaxWidth().height(3.dp).background(fill))
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Icon(iconOf(card.mwKind), contentDescription = null, tint = tone, modifier = Modifier.size(16.dp))
                Text(kicker, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = tone, modifier = Modifier.weight(1f))
                MawaeedBadge(card)
            }
            Text(
                if (card.mwKind == MawaeedKind.SchoolHoliday) MawaeedLogic.compactTitle(card.title, card.startsOn) else MawaeedLogic.overviewTitle(card),
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
                color = colors.ink,
                lineHeight = 30.sp,
            )
            Text("${card.gregorianLabel}  ·  ${card.hijriLabel}", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = colors.ink)
            listOfNotNull(card.end?.let { "حتى $it" }, card.hint, card.note).forEach { note ->
                Text(note, fontSize = 13.sp, color = colors.secondaryInk)
            }
            regionLabel?.takeIf { it.isNotBlank() }?.let { label ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    Icon(Icons.Outlined.Place, contentDescription = null, tint = colors.secondaryInk, modifier = Modifier.size(14.dp))
                    Text("في $label · تتبع المنطقة المختارة في التقويم الدراسي", fontSize = 12.sp, color = colors.secondaryInk)
                }
            }
            ClockBox(card, now, tone, fill)
            onCta?.let { cta ->
                Row(
                    Modifier.heightIn(min = 44.dp).clickable(onClick = cta),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("كل مواعيد الخدمة", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = tone)
                    Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, contentDescription = null, tint = tone, modifier = Modifier.size(18.dp))
                }
            }
        }
    }
}

@Composable
private fun ClockBox(card: MawaeedCard, now: Instant, tone: Color, fill: Color) {
    val colors = SabqTheme.colors
    val clock = MawaeedLogic.clockParts(card, now)
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(fill.copy(alpha = 0.08f)).padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            if (clock.word == null) Box(Modifier.size(7.dp).clip(CircleShape).background(colors.leaf))
            Text("الوقت المتبقي", fontSize = 12.sp, color = colors.secondaryInk)
        }
        if (clock.word != null) {
            Text(clock.word, fontSize = 18.sp, fontWeight = FontWeight.Bold, color = tone)
        } else {
            // الأيام يسارًا كالعدّاد الرقمي (طلب المالك 2026-10-19).
            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ClockCell(clock.days, MawaeedLogic.dayUnitWord(clock.days), tone, Modifier.weight(1f))
                    ClockCell(clock.hours, MawaeedLogic.hoursWord(clock.hours), tone, Modifier.weight(1f))
                    ClockCell(clock.minutes, "دقيقة", tone, Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
private fun ClockCell(value: Int, unit: String, tone: Color, modifier: Modifier) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Text("$value", fontSize = 28.sp, fontWeight = FontWeight.Bold, color = tone)
        Text(unit, fontSize = 12.sp, color = SabqTheme.colors.secondaryInk)
    }
}

/** صف موعد في قائمة (التقويم الدراسي، المواعيد في صفحة الخدمة). */
@Composable
private fun MawaeedRow(card: MawaeedCard, now: Instant) {
    val colors = SabqTheme.colors
    val dateLine = buildList {
        add(card.gregorianLabel)
        add(card.hijriLabel)
        card.end?.let { add("حتى $it") }
        if (card.isExpected && !card.isPast) add("متوقع")
    }.filter { it.isNotBlank() }.joinToString(" · ")
    Row(Modifier.fillMaxWidth().padding(vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                MawaeedLogic.compactTitle(card.title, card.startsOn),
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold,
                color = if (card.isPast) colors.secondaryInk else colors.ink,
            )
            Text(dateLine, fontSize = 12.sp, color = colors.secondaryInk)
        }
        Text(
            MawaeedLogic.countdown(card, now),
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            color = if (card.isPast) colors.tertiaryInk else toneOf(card.mwKind),
        )
    }
}

@Composable
private fun BoardCard(block: MawaeedSeriesBlock, now: Instant, onClick: () -> Unit) {
    val colors = SabqTheme.colors
    val next = block.next
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(colors.surface)
            .border(0.75.dp, colors.outline, RoundedCornerShape(14.dp))
            .clickable(onClick = onClick)
            .padding(12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        KindChip(block.mwKind, size = 36)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    next?.let { MawaeedLogic.overviewTitle(it) } ?: block.title,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = colors.ink,
                    modifier = Modifier.weight(1f),
                )
                next?.let { MawaeedBadge(it) }
            }
            Text(next?.let { "${it.gregorianLabel} · ${it.hijriLabel}" } ?: block.answerLine, fontSize = 12.sp, color = colors.secondaryInk)
            next?.let {
                Text(MawaeedLogic.countdown(it, now), fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = toneOf(block.mwKind))
            }
        }
    }
}

@Composable
private fun SchoolSection(
    school: MawaeedSeriesBlock,
    view: MawaeedViewPayload,
    state: MawaeedUiState,
    rows: List<MawaeedCard>,
    activeCard: MawaeedCard?,
    now: Instant,
    onRegion: (String) -> Unit,
    onAll: () -> Unit,
) {
    val colors = SabqTheme.colors
    val tone = toneOf(MawaeedKind.SchoolHoliday)
    val shape = RoundedCornerShape(16.dp)
    var menuOpen by remember { mutableStateOf(false) }
    Column(
        Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(fillOf(MawaeedKind.SchoolHoliday).copy(alpha = 0.06f))
            .border(1.dp, tone.copy(alpha = 0.18f), shape)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            KindChip(MawaeedKind.SchoolHoliday, size = 36)
            SectionHeading(school.title, "الإجازات الرسمية موحّدة، والإضافية حسب المنطقة التعليمية")
        }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("إدارة التعليم", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = colors.secondaryInk, modifier = Modifier.weight(1f))
            if (state.loading) CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp, color = tone)
            Box {
                Row(
                    Modifier
                        .heightIn(min = 44.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(colors.surface)
                        .clickable { menuOpen = true }
                        .padding(horizontal = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text(view.regions.firstOrNull { it.id == state.region }?.label ?: "الرياض", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = tone)
                    Icon(Icons.Outlined.ExpandMore, contentDescription = null, tint = tone, modifier = Modifier.size(16.dp))
                }
                DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                    view.regions.forEach { r ->
                        DropdownMenuItem(text = { Text(r.label) }, onClick = {
                            menuOpen = false
                            onRegion(r.id)
                        })
                    }
                }
            }
        }
        if (school.upcoming.none { !it.isPast && it.regionGroup != "all" }) {
            Text(
                "المعروض هو التقويم الدراسي العام. لم تُعتمد في الخدمة إجازات إضافية خاصة بهذه المنطقة بعد.",
                fontSize = 12.sp,
                color = colors.secondaryInk,
            )
        }
        if (rows.isEmpty()) {
            Text(
                if (activeCard?.mwKind == MawaeedKind.SchoolHoliday) "لا توجد إجازات لاحقة منشورة حاليًا." else school.answerLine,
                fontSize = 12.sp,
                color = colors.secondaryInk,
            )
        } else {
            Column(Modifier.alpha(if (state.loading) 0.5f else 1f)) {
                rows.forEachIndexed { i, card ->
                    if (i > 0) HorizontalDivider(color = colors.outline.copy(alpha = 0.6f))
                    MawaeedRow(card, now)
                }
            }
        }
        Row(Modifier.heightIn(min = 44.dp).clickable(onClick = onAll), verticalAlignment = Alignment.CenterVertically) {
            Text("كل إجازات العام", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = tone)
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, contentDescription = null, tint = tone, modifier = Modifier.size(18.dp))
        }
    }
}

@Composable
private fun MethodBox() {
    val colors = SabqTheme.colors
    Surface12(padding = 16) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Icon(Icons.Outlined.VerifiedUser, contentDescription = null, tint = colors.ink, modifier = Modifier.size(18.dp))
                Text("عن المواعيد", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = colors.ink)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Legend("مؤكد", "إعلان رسمي من الجهة", statusColors(true))
                Legend("متوقع", "محسوب من الجدول المعتاد", statusColors(false))
            }
            Text(
                "جميع الأوقات بتوقيت السعودية. تُعرض التواريخ بالميلادي والهجري وفق تقويم أم القرى، ويتحدّث العدّاد تلقائيًا.",
                fontSize = 12.sp,
                color = colors.secondaryInk,
            )
        }
    }
}

@Composable
private fun Legend(label: String, text: String, inkFill: Pair<Color, Color>) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            label,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            color = inkFill.first,
            modifier = Modifier.clip(RoundedCornerShape(4.dp)).background(inkFill.second).padding(horizontal = 6.dp),
        )
        Text(text, fontSize = 12.sp, color = SabqTheme.colors.secondaryInk)
    }
}

@Composable
private fun FaqItem(item: MawaeedFaq, tone: Color) {
    val colors = SabqTheme.colors
    var open by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth().clickable { open = !open }.padding(vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(item.question, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = colors.ink, modifier = Modifier.weight(1f))
            Icon(if (open) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore, contentDescription = null, tint = tone)
        }
        if (open) Text(item.answer, fontSize = 14.sp, color = colors.secondaryInk, lineHeight = 22.sp)
    }
}

@Composable
private fun PageHeader(title: String, description: String?, updated: String?) {
    val colors = SabqTheme.colors
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(title, fontSize = 24.sp, fontWeight = FontWeight.Bold, color = colors.ink)
        description?.takeIf { it.isNotBlank() }?.let { Text(it, fontSize = 15.sp, color = colors.secondaryInk, lineHeight = 22.sp) }
        updated?.takeIf { it.isNotBlank() }?.let {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Box(Modifier.size(6.dp).clip(CircleShape).background(colors.leaf))
                Text("آخر تحديث: $it بتوقيت السعودية", fontSize = 12.sp, color = colors.tertiaryInk)
            }
        }
    }
}

@Composable
private fun SectionHeading(title: String, sub: String) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(title, fontSize = 17.sp, fontWeight = FontWeight.Bold, color = SabqTheme.colors.ink)
        Text(sub, fontSize = 12.sp, color = SabqTheme.colors.secondaryInk)
    }
}

@Composable
private fun Surface12(padding: Int = 12, content: @Composable () -> Unit) {
    val colors = SabqTheme.colors
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(colors.surface)
            .border(0.75.dp, colors.outline, RoundedCornerShape(14.dp))
            .padding(horizontal = padding.dp, vertical = if (padding > 12) padding.dp else 0.dp),
    ) { content() }
}

@Composable
private fun LoadError(message: String, onRetry: () -> Unit) {
    EmptyStateView(
        icon = Icons.Outlined.CalendarMonth,
        tint = SabqTheme.colors.secondaryInk,
        title = "تعذر تحميل المواعيد",
        subtitle = message,
        modifier = Modifier.fillMaxWidth().padding(top = 24.dp),
        actionTitle = "أعد المحاولة",
        onAction = onRetry,
    )
}

@Composable
private fun Loading() {
    Box(Modifier.fillMaxWidth().padding(top = 48.dp), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = SabqTheme.colors.primaryEnd)
    }
}

private fun openUrl(context: Context, url: String) {
    runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
}

/** webcal أولًا (اشتراك يتحدّث)، وإن لم يوجد تطبيق يفهمه نفتح ملف ics عبر https. */
private fun openCalendar(context: Context, pageId: String) {
    val path = "sabq.org/api/service-pages/${Uri.encode(pageId)}/calendar.ics"
    val webcal = Intent(Intent.ACTION_VIEW, Uri.parse("webcal://$path")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    val ok = runCatching { context.startActivity(webcal) }.isSuccess
    if (!ok) openUrl(context, "https://$path")
}
