package com.sabq.smart.feature.sports

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.outlined.NotificationsActive
import androidx.compose.material.icons.outlined.SportsSoccer
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import coil.compose.AsyncImage
import com.sabq.smart.feature.roshn.RsTeamLogo
import com.sabq.smart.ui.components.EmptyStateView
import com.sabq.smart.ui.components.SabqDetailScaffold
import com.sabq.smart.ui.theme.SabqTheme
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * «مباريات اليوم» لكل البطولات — مرآة iOS `SportsTodayView`: أمس / اليوم / غدًا،
 * مجمّعة بالبطولة، الجارية أولًا. اللمس يفتح مركز المباراة العام
 * (`/api/sports/match/:id`، شاشة روشن). وفي الذيل باب تطبيق VARA.
 */

enum class SportsDay(val offset: Int, val label: String) {
    Yesterday(-1, "أمس"),
    Today(0, "اليوم"),
    Tomorrow(1, "غدًا"),
}

data class SportsTodayUiState(
    val day: SportsDay = SportsDay.Today,
    val fixtures: List<SpTodayFixture> = emptyList(),
    val competitions: List<SpCompetitionInfo> = emptyList(),
    val loaded: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class SportsTodayViewModel @Inject constructor(
    private val api: SportsTodayApi,
) : ViewModel() {
    private val _state = MutableStateFlow(SportsTodayUiState())
    val state: StateFlow<SportsTodayUiState> = _state.asStateFlow()
    private var pulse: Job? = null

    fun select(day: SportsDay) {
        if (day == _state.value.day && _state.value.loaded) return
        _state.update { it.copy(day = day, loaded = false, fixtures = emptyList(), error = null) }
        start()
    }

    /** يُستدعى عند الظهور: تحميل ثم نبض أثناء «اليوم» فقط (30ث مع مباراة جارية، وإلا دقيقتان). */
    fun start() {
        pulse?.cancel()
        pulse = viewModelScope.launch {
            load()
            while (isActive && _state.value.day == SportsDay.Today) {
                val anyLive = _state.value.fixtures.any { it.status.live }
                delay(if (anyLive) 30_000 else 120_000)
                load()
            }
        }
    }

    fun stop() {
        pulse?.cancel()
        pulse = null
    }

    fun reload() {
        viewModelScope.launch { load() }
    }

    private suspend fun load() {
        val day = _state.value.day
        val date = if (day == SportsDay.Today) null else SportsHeadline.isoDate(day.offset)
        val comps = viewModelScope.async { runCatching { api.competitions().competitions }.getOrNull() }
        val result = runCatching { SportsTodayDecoder.decode(api.today(date)) }
        val competitions = comps.await()
        if (_state.value.day != day) return
        _state.update { s ->
            val next = result.fold(
                onSuccess = { s.copy(fixtures = it.today, error = null) },
                onFailure = { s.copy(error = "تعذّر الوصول إلى مصدر المباريات الآن") },
            )
            next.copy(
                competitions = if (!competitions.isNullOrEmpty()) competitions else s.competitions,
                loaded = true,
            )
        }
    }
}

@Composable
fun SportsTodayScreen(
    onBack: () -> Unit,
    onOpenMatch: (Int) -> Unit,
    viewModel: SportsTodayViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val colors = SabqTheme.colors
    val context = LocalContext.current

    LifecycleResumeEffect(Unit) {
        viewModel.start()
        onPauseOrDispose { viewModel.stop() }
    }

    SabqDetailScaffold(title = "مباريات ${state.day.label}", onBack = onBack) {
        Column(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            DaySegments(selected = state.day, onSelect = viewModel::select)

            when {
                !state.loaded -> Box(Modifier.fillMaxWidth().height(280.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = colors.primaryEnd)
                }
                state.error != null && state.fixtures.isEmpty() -> EmptyStateView(
                    icon = Icons.Outlined.SportsSoccer,
                    tint = colors.secondaryInk,
                    title = "تعذّر تحميل المباريات",
                    subtitle = state.error.orEmpty(),
                    actionTitle = "أعد المحاولة",
                    onAction = viewModel::reload,
                )
                state.fixtures.isEmpty() -> EmptyStateView(
                    icon = Icons.Outlined.SportsSoccer,
                    tint = colors.secondaryInk,
                    title = "لا مباريات ${state.day.label}",
                    subtitle = "جرّب يومًا آخر، أو تابع البطولات من بطاقاتها في الرئيسية.",
                )
                else -> SportsHeadline.groups(state.fixtures, state.competitions).forEach { group ->
                    CompetitionSection(group, onOpenMatch)
                }
            }

            VaraCard {
                runCatching {
                    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(VaraApp.PLAY_STORE_URL)))
                }
            }
        }
    }
}

@Composable
private fun DaySegments(selected: SportsDay, onSelect: (SportsDay) -> Unit) {
    val colors = SabqTheme.colors
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(colors.paleFill)
            .padding(3.dp),
        horizontalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        SportsDay.entries.forEach { day ->
            val active = day == selected
            Box(
                Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(10.dp))
                    .background(if (active) colors.surface else colors.paleFill)
                    .clickable { onSelect(day) }
                    .padding(vertical = 8.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    day.label,
                    fontSize = 14.sp,
                    fontWeight = if (active) FontWeight.Bold else FontWeight.Medium,
                    color = if (active) colors.ink else colors.secondaryInk,
                )
            }
        }
    }
}

@Composable
private fun CompetitionSection(group: SportsHeadline.Group, onOpenMatch: (Int) -> Unit) {
    val colors = SabqTheme.colors
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (!group.logo.isNullOrBlank()) {
                AsyncImage(model = group.logo, contentDescription = null, modifier = Modifier.size(22.dp))
            }
            Text(
                group.name,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                color = colors.ink,
                modifier = Modifier.weight(1f).semantics { heading() },
            )
            Text("${group.fixtures.size}", fontSize = 12.sp, color = colors.tertiaryInk)
        }
        Column(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(colors.surface)
                .padding(horizontal = 12.dp),
        ) {
            group.fixtures.forEachIndexed { index, fixture ->
                if (index > 0) HorizontalDivider(color = colors.outline)
                SportsFixtureRow(fixture = fixture, onClick = { onOpenMatch(fixture.id) })
            }
        }
    }
}

/** صف مباراة: المضيف يمينًا، والنتيجة داخل LTR بالضيف أولًا فيقع رقم المضيف يمينًا. */
@Composable
fun SportsFixtureRow(fixture: SpTodayFixture, onClick: () -> Unit) {
    val colors = SabqTheme.colors
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .semantics(mergeDescendants = true) { contentDescription = SportsTodayText.fixtureA11y(fixture) }
            .padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        TeamCell(fixture.home, logoFirst = true, modifier = Modifier.weight(1f))
        Column(Modifier.widthIn(min = 76.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            if (fixture.started) {
                LtrScore(fixture, fontSize = 17)
                if (fixture.status.live) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Box(Modifier.size(6.dp).clip(CircleShape).background(colors.coral))
                        Text(fixture.status.minuteText ?: "مباشر", fontSize = 11.sp, color = colors.coral, fontWeight = FontWeight.SemiBold)
                    }
                } else {
                    Text(fixture.status.label ?: "انتهت", fontSize = 11.sp, color = colors.tertiaryInk)
                }
            } else {
                Text(SportsHeadline.kickoffText(fixture.kickoff), fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = colors.primaryEnd)
                val label = fixture.status.label
                if (label != null && fixture.status.code != "NS") {
                    Text(label, fontSize = 11.sp, color = colors.tertiaryInk)
                }
            }
        }
        TeamCell(fixture.away, logoFirst = false, modifier = Modifier.weight(1f))
    }
}

@Composable
private fun TeamCell(team: SpTodayTeam, logoFirst: Boolean, modifier: Modifier) {
    Row(
        modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = if (logoFirst) Arrangement.spacedBy(6.dp, Alignment.Start) else Arrangement.spacedBy(6.dp, Alignment.End),
    ) {
        if (logoFirst) RsTeamLogo(url = team.logo.orEmpty(), size = 24, padding = 2)
        Text(
            team.name,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            color = SabqTheme.colors.ink,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f, fill = false),
        )
        if (!logoFirst) RsTeamLogo(url = team.logo.orEmpty(), size = 24, padding = 2)
    }
}

@Composable
internal fun LtrScore(fixture: SpTodayFixture, fontSize: Int) {
    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
        Text(
            SportsTodayText.score(fixture),
            fontSize = fontSize.sp,
            fontWeight = FontWeight.Bold,
            color = SabqTheme.colors.ink,
            maxLines = 1,
        )
    }
}

@Composable
private fun VaraCard(onClick: () -> Unit) {
    val colors = SabqTheme.colors
    Row(
        Modifier
            .fillMaxWidth()
            .padding(top = 8.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(colors.brandSky.copy(alpha = 0.10f))
            .border(BorderStroke(1.dp, colors.brandSky.copy(alpha = 0.35f)), RoundedCornerShape(16.dp))
            .clickable(onClick = onClick)
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            Modifier.size(44.dp).clip(RoundedCornerShape(10.dp)).background(colors.surface),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Outlined.NotificationsActive, contentDescription = null, tint = colors.primaryEnd, modifier = Modifier.size(22.dp))
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text("تطبيق VARA الرياضي", fontSize = 15.sp, fontWeight = FontWeight.Bold, color = colors.ink)
            Text(
                "تنبيهات الأهداف لفرقك، ومراكز المباريات الكاملة، والانتقالات والتوقعات.",
                fontSize = 12.sp,
                color = colors.secondaryInk,
            )
        }
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, contentDescription = null, tint = colors.tertiaryInk)
    }
}

// MARK: شريط البوابة الرياضية تحت الهيرو — مرآة iOS `SportsPortalStrip`.

@HiltViewModel
class SportsPortalStripViewModel @Inject constructor(
    private val api: SportsTodayApi,
) : ViewModel() {
    private val _headline = MutableStateFlow<SportsHeadline.Headline?>(null)
    val headline: StateFlow<SportsHeadline.Headline?> = _headline.asStateFlow()
    private var pulse: Job? = null

    /** دقيقة مع وجود مباريات، وإلا خمس دقائق — لا نبض سريع على الرئيسية. */
    fun start() {
        if (pulse?.isActive == true) return
        pulse = viewModelScope.launch {
            while (isActive) {
                val comps = async { runCatching { api.competitions().competitions }.getOrNull().orEmpty() }
                val fixtures = runCatching { SportsTodayDecoder.decode(api.today(null)).today }.getOrNull().orEmpty()
                _headline.value = SportsHeadline.pick(fixtures, comps.await())
                delay(if (fixtures.isEmpty()) 300_000 else 60_000)
            }
        }
    }

    fun stop() {
        pulse?.cancel()
        pulse = null
    }
}

@Composable
fun SportsPortalStrip(
    onClick: () -> Unit,
    viewModel: SportsPortalStripViewModel = hiltViewModel(),
) {
    val headline by viewModel.headline.collectAsStateWithLifecycle()
    val colors = SabqTheme.colors

    LifecycleResumeEffect(Unit) {
        viewModel.start()
        onPauseOrDispose { viewModel.stop() }
    }

    val live = headline?.live == true
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(colors.surface)
            .clickable(onClick = onClick)
            .semantics(mergeDescendants = true) { contentDescription = SportsTodayText.stripA11y(headline) }
            .padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        val tagColor = if (live) colors.coral else colors.primaryEnd
        Row(
            Modifier
                .clip(RoundedCornerShape(6.dp))
                .background(tagColor.copy(alpha = 0.1f))
                .padding(horizontal = 8.dp, vertical = 2.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            if (live) Box(Modifier.size(6.dp).clip(CircleShape).background(colors.coral))
            Text(if (live) "مباشر" else "الرياضة", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = tagColor)
        }

        val match = headline?.match
        if (match != null) {
            Row(
                Modifier.weight(1f),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text(match.home.name, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = colors.ink, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                if (live) LtrScore(match, fontSize = 13) else Text("×", fontSize = 13.sp, color = colors.tertiaryInk)
                Text(match.away.name, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = colors.ink, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
            }
        } else {
            Text(
                headline?.text ?: "مباريات اليوم لكل البطولات",
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                color = colors.ink,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
        }
        Spacer(Modifier.size(4.dp))
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, contentDescription = null, tint = colors.tertiaryInk, modifier = Modifier.size(18.dp))
    }
}

object SportsTodayText {
    /** «الضيف - المضيف» داخل LTR فيقع رقم المضيف يمينًا كما في iOS. */
    fun score(f: SpTodayFixture): String = "${f.goals?.away ?: 0} - ${f.goals?.home ?: 0}"

    fun fixtureA11y(f: SpTodayFixture): String = if (f.started) {
        val state = if (f.status.live) "مباشر ${f.status.minuteText.orEmpty()}" else (f.status.label ?: "انتهت")
        "${f.home.name} ${f.goals?.home ?: 0}، ${f.away.name} ${f.goals?.away ?: 0}، $state"
    } else {
        "${f.home.name} ضد ${f.away.name}، ${SportsHeadline.kickoffText(f.kickoff)}"
    }

    fun stripA11y(h: SportsHeadline.Headline?): String {
        if (h == null) return "الرياضة: مباريات اليوم"
        val m = h.match ?: return h.text ?: "الرياضة"
        return if (h.live) {
            "مباشر: ${m.home.name} ${m.goals?.home ?: 0}، ${m.away.name} ${m.goals?.away ?: 0}"
        } else {
            "${m.home.name} ضد ${m.away.name}، ${h.tail}"
        }
    }
}
