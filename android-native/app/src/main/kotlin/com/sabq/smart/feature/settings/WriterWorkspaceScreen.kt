package com.sabq.smart.feature.settings

/**
 * «لوحة الكاتب» — مساحة كاتب الرأي بأربعة تبويبات، مرآة حرفية
 * لـ WriterWorkspaceView.swift في iOS:
 *   اليوم:   الموعد الأسبوعي، التنبيهات، موجز الشهر، المكتب، نبض القراء،
 *            فرصة متابعة، تقويم الإلهام
 *   أفكاري:  استوديو الفكرة (مدرب AI)، بوصلة الأفكار، البصمة الأسلوبية
 *   مقالاتي: عدادات المتابعة، التنبيهات، مقالات تحتاج لمستك، قائمة التتبع،
 *            ورقة «قارئ سبق الأول»
 *   أدائي:   لوحة الأداء الحالية مضمّنة (embedded)
 * غير كاتب الرأي (مراسل/مدير) يرى لوحة الأداء وحدها — كسلوك iOS تماماً.
 */

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.EditNote
import androidx.compose.material.icons.filled.Lightbulb
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Psychology
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.api.ApiEditorialNotificationsPage
import com.sabq.smart.data.api.ApiWriterCoachResult
import com.sabq.smart.data.api.ApiWriterIdea
import com.sabq.smart.data.api.ApiWriterReviewResult
import com.sabq.smart.data.api.ApiWriterScheduleResponse
import com.sabq.smart.data.api.ApiWriterStyleProfile
import com.sabq.smart.data.api.ApiWriterTrackingArticle
import com.sabq.smart.data.api.ApiWriterWorkspace
import com.sabq.smart.data.api.ArticleReviewRequest
import com.sabq.smart.data.api.IdeaCoachRequest
import com.sabq.smart.data.api.SabqApi
import com.sabq.smart.data.api.WriterSchedulePickRequest
import com.sabq.smart.feature.auth.AuthViewModel
import com.sabq.smart.ui.theme.SabqTheme
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import javax.inject.Inject

// ── ViewModel ───────────────────────────────────────────────────────

data class WriterWorkspaceState(
    val isLoading: Boolean = true,
    val loadError: String? = null,
    val workspace: ApiWriterWorkspace? = null,
    val notifications: ApiEditorialNotificationsPage? = null,
    val schedule: ApiWriterScheduleResponse? = null,
    val savingDay: Boolean = false,
    val scheduleError: String? = null,
    val ideasRequested: Boolean = false,
    val ideasLoading: Boolean = false,
    val ideas: List<ApiWriterIdea> = emptyList(),
    val coachInput: String = "",
    val coachLoading: Boolean = false,
    val coachResult: ApiWriterCoachResult? = null,
    val coachError: String? = null,
    val styleProfile: ApiWriterStyleProfile? = null,
    val styleLoading: Boolean = false,
    val reviewLoading: Boolean = false,
    val reviewResult: ApiWriterReviewResult? = null,
    val reviewTitle: String = "",
)

@HiltViewModel
class WriterWorkspaceViewModel @Inject constructor(
    private val api: SabqApi,
) : ViewModel() {
    private val _state = MutableStateFlow(WriterWorkspaceState())
    val state = _state.asStateFlow()

    fun load() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, loadError = null) }
            coroutineScope {
                val workspace = async { runCatching { api.getContributorWorkspace() } }
                val notifications = async { runCatching { api.getEditorialNotifications() }.getOrNull() }
                val schedule = async { runCatching { api.getContributorSchedule() }.getOrNull() }
                val ws = workspace.await()
                _state.update {
                    it.copy(
                        isLoading = false,
                        loadError = if (ws.isFailure) "تعذر تجهيز مساحة الكاتب" else null,
                        workspace = ws.getOrNull() ?: it.workspace,
                        notifications = notifications.await(),
                        schedule = schedule.await(),
                    )
                }
            }
        }
    }

    fun pickDay(weekday: Int) {
        viewModelScope.launch {
            _state.update { it.copy(savingDay = true, scheduleError = null) }
            try {
                api.setContributorSchedule(WriterSchedulePickRequest(weekday))
                val schedule = runCatching { api.getContributorSchedule() }.getOrNull()
                _state.update { it.copy(savingDay = false, schedule = schedule) }
            } catch (e: Exception) {
                _state.update { it.copy(savingDay = false, scheduleError = "تعذر حفظ اليوم — حاول مرة أخرى") }
            }
        }
    }

    fun requestIdeas() {
        viewModelScope.launch {
            _state.update { it.copy(ideasRequested = true, ideasLoading = true) }
            val ideas = runCatching { api.getContributorIdeas().ideas }.getOrDefault(emptyList())
            _state.update { it.copy(ideasLoading = false, ideas = ideas) }
        }
    }

    fun setCoachInput(text: String) = _state.update { it.copy(coachInput = text) }

    fun runCoach() {
        val idea = _state.value.coachInput.trim()
        if (idea.length < 12) return
        viewModelScope.launch {
            _state.update { it.copy(coachLoading = true, coachError = null) }
            try {
                val result = api.postIdeaCoach(IdeaCoachRequest(idea))
                _state.update { it.copy(coachLoading = false, coachResult = result) }
            } catch (e: Exception) {
                _state.update { it.copy(coachLoading = false, coachError = "تعذر تطوير الفكرة — حاول بعد قليل") }
            }
        }
    }

    fun loadStyleProfileIfNeeded() {
        if (_state.value.styleProfile != null || _state.value.styleLoading) return
        viewModelScope.launch {
            _state.update { it.copy(styleLoading = true) }
            val profile = runCatching { api.getContributorStyleProfile() }.getOrNull()
            _state.update { it.copy(styleLoading = false, styleProfile = profile) }
        }
    }

    fun review(article: ApiWriterTrackingArticle) {
        viewModelScope.launch {
            _state.update { it.copy(reviewLoading = true, reviewTitle = article.title) }
            val result = runCatching { api.postArticleReview(ArticleReviewRequest(article.id)) }.getOrNull()
            _state.update { it.copy(reviewLoading = false, reviewResult = result) }
        }
    }

    fun clearReview() = _state.update { it.copy(reviewResult = null) }

    fun markAllNotificationsRead() {
        viewModelScope.launch {
            runCatching { api.markAllEditorialNotificationsRead() }
            val notifications = runCatching { api.getEditorialNotifications() }.getOrNull()
            _state.update { it.copy(notifications = notifications) }
        }
    }
}

// ── Tabs ────────────────────────────────────────────────────────────

private enum class WorkspaceTab(val label: String) {
    Today("اليوم"), Ideas("أفكاري"), Articles("مقالاتي"), Performance("أدائي")
}

// ── Screen ──────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WriterWorkspaceScreen(
    onBack: () -> Unit,
    onOpenSurvey: (token: String) -> Unit = {},
    onOpenNotifications: () -> Unit = {},
    onSubmitArticle: () -> Unit = {},
    viewModel: WriterWorkspaceViewModel = hiltViewModel(),
    authViewModel: AuthViewModel = hiltViewModel(),
) {
    val currentUser by authViewModel.currentUser.collectAsStateWithLifecycle()
    val isOpinionWriter = currentUser?.isWriter == true

    if (!isOpinionWriter) {
        // مراسل/مدير: لوحة الأداء وحدها — كسلوك iOS
        ContributorDashboardScreen(onBack = onBack, onOpenSurvey = onOpenSurvey)
        return
    }

    val state by viewModel.state.collectAsStateWithLifecycle()
    var tab by remember { mutableStateOf(WorkspaceTab.Today) }
    LaunchedEffect(Unit) { viewModel.load() }

    val unreadCount = state.notifications?.unread ?: 0

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(SabqTheme.colors.background)
            .statusBarsPadding(),
    ) {
        // Top bar
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Spacer(Modifier.weight(1f))
            Text(
                "لوحة الكاتب",
                style = SabqTheme.typography.compactCardTitle.copy(
                    fontSize = 18.sp, fontWeight = FontWeight.Black, color = SabqTheme.colors.ink
                ),
            )
            Spacer(Modifier.weight(1f))
            IconButton(onClick = onBack, modifier = Modifier.size(32.dp)) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, null, tint = SabqTheme.colors.ink, modifier = Modifier.size(20.dp))
            }
        }

        // شريط التبويبات الكبسولي — مطابق لـsegmentBar في iOS
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            WorkspaceTab.entries.forEach { item ->
                val selected = tab == item
                Row(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(50))
                        .background(if (selected) SabqTheme.colors.sky else SabqTheme.colors.paleFill)
                        .clickable { tab = item }
                        .padding(horizontal = 14.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        item.label,
                        fontSize = 13.sp,
                        fontWeight = if (selected) FontWeight.Bold else FontWeight.SemiBold,
                        color = if (selected) Color.White else SabqTheme.colors.secondaryInk,
                        maxLines = 1,
                    )
                    if (item == WorkspaceTab.Articles && unreadCount > 0) {
                        Spacer(Modifier.size(4.dp))
                        Text(
                            "${minOf(unreadCount, 99)}",
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color.White,
                            modifier = Modifier
                                .clip(RoundedCornerShape(50))
                                .background(SabqTheme.colors.coral)
                                .padding(horizontal = 5.dp, vertical = 1.5.dp),
                        )
                    }
                }
            }
        }

        when (tab) {
            WorkspaceTab.Today -> TodaySegment(state, viewModel, onOpenNotifications) { tab = WorkspaceTab.Ideas }
            WorkspaceTab.Ideas -> IdeasSegment(state, viewModel)
            WorkspaceTab.Articles -> ArticlesSegment(state, viewModel, onOpenNotifications)
            WorkspaceTab.Performance -> ContributorDashboardScreen(
                onBack = onBack,
                onOpenSurvey = onOpenSurvey,
                embedded = true,
            )
        }
    }

    // ورقة «قارئ سبق الأول»
    if (state.reviewResult != null) {
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = false)
        ModalBottomSheet(
            onDismissRequest = { viewModel.clearReview() },
            sheetState = sheetState,
            containerColor = SabqTheme.colors.background,
            contentColor = SabqTheme.colors.ink,
            dragHandle = null,
        ) {
            ReviewSheetContent(state.reviewResult!!, state.reviewTitle)
        }
    }
}

// ── تبويب «اليوم» ───────────────────────────────────────────────────

@Composable
private fun TodaySegment(
    state: WriterWorkspaceState,
    viewModel: WriterWorkspaceViewModel,
    onOpenNotifications: () -> Unit,
    onGoToIdeas: () -> Unit,
) {
    if (state.isLoading) {
        Box(Modifier.fillMaxWidth().heightIn(min = 200.dp), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(color = SabqTheme.colors.sky)
        }
        return
    }
    val workspace = state.workspace
    Column(
        modifier = Modifier
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp)
            .padding(top = 8.dp, bottom = 100.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        state.loadError?.let { ErrorBanner(message = it) }

        // بطاقة الموعد الأسبوعي (بانر أو اختيار اليوم)
        state.schedule?.let { sched ->
            sched.banner?.let { WriterScheduleBannerCard(it) }
                ?: if (sched.canChoose) {
                    WriterDayPickerCard(
                        dayLoads = sched.dayLoads,
                        saving = state.savingDay,
                        errorText = state.scheduleError,
                        onPick = viewModel::pickDay,
                    )
                } else Unit
        }

        val unread = state.notifications?.unread ?: 0
        if (unread > 0) {
            AlertsCard(state, unread, onOpenNotifications, viewModel::markAllNotificationsRead)
        }

        // موجزك هذا الشهر
        WorkspaceCard(Icons.Filled.MenuBook, SabqTheme.colors.teal, "موجزك هذا الشهر") {
            val brief = workspace?.monthlyBrief
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                MetricTile("${brief?.publishedCount ?: 0}", "مقال منشور", Modifier.weight(1f))
                MetricTile("%,d".format(brief?.views ?: 0), "قراءة", Modifier.weight(1f))
            }
            if (!brief?.message.isNullOrBlank()) QuoteText(brief!!.message)
        }

        // على مكتبك الآن
        WorkspaceCard(Icons.Filled.EditNote, SabqTheme.colors.sky, "على مكتبك الآن") {
            val desk = workspace?.desk.orEmpty()
            if (desk.isEmpty()) {
                EmptyHint(Icons.Filled.CheckCircle, "مكتبك مرتب — لا مسودات أو ملاحظات تنتظر إجراءك.")
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    desk.forEach { item ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .background(SabqTheme.colors.paleFill)
                                .padding(10.dp),
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Box(
                                Modifier
                                    .padding(top = 5.dp)
                                    .size(7.dp)
                                    .clip(CircleShape)
                                    .background(if (item.reviewStatus == "needs_changes") SabqTheme.colors.gold else SabqTheme.colors.sky),
                            )
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(item.title, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = SabqTheme.colors.ink, maxLines = 1)
                                Text(item.nextAction, fontSize = 11.sp, fontWeight = FontWeight.Medium, color = SabqTheme.colors.secondaryInk)
                            }
                        }
                    }
                }
            }
        }

        // نبض قرائك
        WorkspaceCard(Icons.Filled.People, SabqTheme.colors.leaf, "نبض قرائك") {
            val pulse = workspace?.readerPulse
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                MetricTile("${pulse?.commentsCount ?: 0}", "تعليق حديث", Modifier.weight(1f))
                MetricTile("${pulse?.positiveShare ?: 0}%", "نبض إيجابي", Modifier.weight(1f))
            }
            val highlight = pulse?.highlightedComment
            if (highlight != null) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(SabqTheme.colors.paleFill)
                        .padding(10.dp),
                    verticalArrangement = Arrangement.spacedBy(3.dp),
                ) {
                    Text("«${highlight.content}»", fontSize = 12.sp, fontWeight = FontWeight.Medium, color = SabqTheme.colors.ink, maxLines = 3)
                    Text("حول: ${highlight.articleTitle}", fontSize = 11.sp, fontWeight = FontWeight.Medium, color = SabqTheme.colors.tertiaryInk)
                }
            } else if (!pulse?.message.isNullOrBlank()) {
                QuoteText(pulse!!.message)
            }
        }

        // فرصة متابعة
        workspace?.followUp?.let { followUp ->
            WorkspaceCard(Icons.Filled.AutoAwesome, SabqTheme.colors.gold, "فرصة متابعة") {
                Text(followUp.title, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = SabqTheme.colors.ink)
                Text(followUp.prompt, fontSize = 12.sp, fontWeight = FontWeight.Medium, color = SabqTheme.colors.secondaryInk)
                Text(
                    "طوّر المتابعة",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = SabqTheme.colors.sky,
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .clickable {
                            viewModel.setCoachInput(followUp.prompt)
                            onGoToIdeas()
                        }
                        .padding(vertical = 2.dp),
                )
            }
        }

        // تقويم الإلهام
        val calendar = workspace?.calendar.orEmpty()
        if (calendar.isNotEmpty()) {
            WorkspaceCard(Icons.Filled.CalendarMonth, SabqTheme.colors.secondaryInk, "تقويم الإلهام") {
                Column {
                    calendar.forEachIndexed { index, item ->
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(item.name, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = SabqTheme.colors.ink, maxLines = 1, modifier = Modifier.weight(1f))
                            Text(writerShortDate(item.date, withTime = false), fontSize = 11.sp, fontWeight = FontWeight.Medium, color = SabqTheme.colors.tertiaryInk)
                        }
                        if (index < calendar.lastIndex) {
                            Box(Modifier.fillMaxWidth().heightIn(min = 0.5.dp).background(SabqTheme.colors.outline.copy(alpha = 0.3f)))
                        }
                    }
                }
            }
        }
    }
}

// ── تبويب «أفكاري» ──────────────────────────────────────────────────

@Composable
private fun IdeasSegment(state: WriterWorkspaceState, viewModel: WriterWorkspaceViewModel) {
    LaunchedEffect(Unit) { viewModel.loadStyleProfileIfNeeded() }
    Column(
        modifier = Modifier
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp)
            .padding(top = 8.dp, bottom = 100.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        // استوديو الفكرة
        WorkspaceCard(Icons.Filled.Psychology, SabqTheme.colors.sky, "استوديو الفكرة") {
            Text(
                "اكتب بذرة الفكرة، وسنساعدك بالأسئلة والخريطة دون كتابة المقال بدلًا عنك.",
                fontSize = 12.sp, fontWeight = FontWeight.Medium, color = SabqTheme.colors.secondaryInk,
            )
            BasicTextField(
                value = state.coachInput,
                onValueChange = viewModel::setCoachInput,
                textStyle = SabqTheme.typography.metaSmall.copy(fontSize = 13.sp, fontWeight = FontWeight.Medium, color = SabqTheme.colors.ink),
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 90.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(SabqTheme.colors.paleFill)
                    .padding(8.dp),
            )
            state.coachError?.let { Text(it, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = SabqTheme.colors.coral) }
            val enabled = !state.coachLoading && state.coachInput.trim().length >= 12
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(50))
                    .background(SabqTheme.colors.sky.copy(alpha = if (enabled) 1f else 0.4f))
                    .clickable(enabled = enabled) { viewModel.runCoach() }
                    .padding(horizontal = 16.dp, vertical = 9.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (state.coachLoading) {
                    CircularProgressIndicator(color = Color.White, modifier = Modifier.size(14.dp), strokeWidth = 2.dp)
                } else {
                    Icon(Icons.Filled.AutoAwesome, null, tint = Color.White, modifier = Modifier.size(14.dp))
                }
                Text("تحدث مع فكرتك", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color.White)
            }
            state.coachResult?.let { result ->
                result.reflection?.takeIf { it.isNotBlank() }?.let { QuoteText(it) }
                BulletBlock("أسئلة تشحذ الفكرة", result.questions)
                BulletBlock("أطروحات محتملة", result.thesisOptions)
                BulletBlock("خريطة المقال", result.outline)
                BulletBlock("الرأي المضاد", listOfNotNull(result.counterpoint?.takeIf { it.isNotBlank() }))
                BulletBlock("مصادر تبحث عنها", result.sourcesToSeek)
                BulletBlock("احذر", result.cautions)
            }
        }

        // بوصلة الأفكار
        WorkspaceCard(Icons.Filled.Lightbulb, SabqTheme.colors.gold, "بوصلة الأفكار") {
            when {
                !state.ideasRequested -> {
                    Text(
                        "ثلاث فرص منتقاة لك بالذكاء الاصطناعي — تُولَّد عند طلبك فقط.",
                        fontSize = 12.sp, fontWeight = FontWeight.Medium, color = SabqTheme.colors.secondaryInk,
                    )
                    Row(
                        modifier = Modifier
                            .clip(RoundedCornerShape(50))
                            .background(SabqTheme.colors.gold)
                            .clickable { viewModel.requestIdeas() }
                            .padding(horizontal = 16.dp, vertical = 9.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(Icons.Filled.AutoAwesome, null, tint = Color.White, modifier = Modifier.size(14.dp))
                        Text("اقترح 3 أفكار", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color.White)
                    }
                }
                state.ideasLoading -> Box(Modifier.fillMaxWidth().heightIn(min = 80.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = SabqTheme.colors.gold)
                }
                state.ideas.isEmpty() -> EmptyHint(Icons.Filled.Lightbulb, "تعذر جلب الأفكار — جرّب مرة أخرى بعد قليل.")
                else -> {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        state.ideas.forEach { idea -> IdeaCard(idea) { viewModel.setCoachInput("${idea.title}\n\nالزاوية: ${idea.angle}") } }
                    }
                    Row(
                        modifier = Modifier.clickable { viewModel.requestIdeas() }.padding(vertical = 4.dp),
                        horizontalArrangement = Arrangement.spacedBy(5.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(Icons.Filled.Refresh, null, tint = SabqTheme.colors.sky, modifier = Modifier.size(12.dp))
                        Text("أفكار جديدة", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = SabqTheme.colors.sky)
                    }
                }
            }
        }

        // بصمتك الأسلوبية
        WorkspaceCard(Icons.Filled.Edit, SabqTheme.colors.teal, "بصمتك الأسلوبية") {
            val profile = state.styleProfile
            when {
                state.styleLoading -> Box(Modifier.fillMaxWidth().heightIn(min = 60.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = SabqTheme.colors.teal)
                }
                profile?.ready == true -> {
                    profile.signature?.takeIf { it.isNotBlank() }?.let { QuoteText(it) }
                    BulletBlock("ملامح صوتك", profile.traits)
                    BulletBlock("لتقوية أثرك", profile.guidance)
                }
                profile != null -> EmptyHint(Icons.Filled.Edit, profile.message ?: "يُبنى ملف أسلوبك بعد نشر أول مقال.")
                else -> EmptyHint(Icons.Filled.Edit, "يُبنى ملف الأسلوب من مقالاتك المنشورة.")
            }
        }
    }
}

// ── تبويب «مقالاتي» ─────────────────────────────────────────────────

@Composable
private fun ArticlesSegment(
    state: WriterWorkspaceState,
    viewModel: WriterWorkspaceViewModel,
    onOpenNotifications: () -> Unit,
) {
    if (state.isLoading) {
        Box(Modifier.fillMaxWidth().heightIn(min = 200.dp), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(color = SabqTheme.colors.sky)
        }
        return
    }
    val tracking = state.workspace?.tracking.orEmpty()
    val pending = tracking.count { it.reviewStatus == "pending_review" }
    val action = tracking.count { it.reviewStatus == "needs_changes" }
    val scheduled = tracking.count { it.status == "scheduled" }
    val declined = tracking.count { it.reviewStatus == "rejected" || it.status == "archived" || it.status == "rejected" }
    val published = tracking.count { it.status == "published" }
    val unread = state.notifications?.unread ?: 0

    Column(
        modifier = Modifier
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp)
            .padding(top = 8.dp, bottom = 100.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TrackingCounter("تحت المراجعة", pending, SabqTheme.colors.sky, Modifier.weight(1f))
            TrackingCounter("تحتاج إجراءك", action, SabqTheme.colors.gold, Modifier.weight(1f))
            TrackingCounter("مجدولة", scheduled, SabqTheme.colors.teal, Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TrackingCounter("غير صالحة للنشر", declined, SabqTheme.colors.coral, Modifier.weight(1f))
            TrackingCounter("منشورة", published, SabqTheme.colors.leaf, Modifier.weight(1f))
        }

        if (unread > 0) {
            AlertsCard(state, unread, onOpenNotifications, viewModel::markAllNotificationsRead)
        }

        if (action > 0) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(SabqTheme.colors.gold.copy(alpha = 0.10f))
                    .border(1.dp, SabqTheme.colors.gold.copy(alpha = 0.35f), RoundedCornerShape(14.dp))
                    .clickable { onOpenNotifications() }
                    .padding(12.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.EditNote, null, tint = SabqTheme.colors.gold, modifier = Modifier.size(16.dp))
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text("مقالات تحتاج لمستك ($action)", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = SabqTheme.colors.ink)
                    Text("ملاحظات التحرير جاهزة — اضغط للتعديل مباشرة.", fontSize = 11.sp, fontWeight = FontWeight.Medium, color = SabqTheme.colors.secondaryInk)
                }
            }
        }

        if (tracking.isEmpty()) {
            EmptyHint(Icons.Filled.Edit, "هنا تبدأ الحكاية — أرسل مقالك الأول من «إرسال مقال رأي».")
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                tracking.forEach { article ->
                    TrackingCard(article, state.reviewLoading) { viewModel.review(article) }
                }
            }
        }
    }
}

private fun trackingStatusInfo(article: ApiWriterTrackingArticle): Pair<String, Color> = when {
    article.reviewStatus == "needs_changes" -> "تحتاج إجراءك" to Color(0xFFF59E0B)
    article.reviewStatus == "rejected" || article.status == "archived" || article.status == "rejected" -> "غير صالحة للنشر" to Color(0xFFEF4444)
    article.status == "published" -> "منشورة" to Color(0xFF2ED573)
    article.status == "scheduled" -> "مجدولة" to Color(0xFF33C7D9)
    article.reviewStatus == "pending_review" -> "تحت المراجعة" to Color(0xFF4090F8)
    else -> "مسودة" to Color(0xFF8A94A6)
}

@Composable
private fun TrackingCard(article: ApiWriterTrackingArticle, reviewLoading: Boolean, onReview: () -> Unit) {
    val (label, tint) = trackingStatusInfo(article)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(SabqTheme.colors.surface)
            .border(0.5.dp, SabqTheme.colors.outline.copy(alpha = 0.5f), RoundedCornerShape(14.dp))
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(article.title, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = SabqTheme.colors.ink, maxLines = 2, modifier = Modifier.weight(1f))
            Text(
                label,
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold,
                color = tint,
                modifier = Modifier
                    .clip(RoundedCornerShape(50))
                    .background(tint.copy(alpha = 0.12f))
                    .padding(horizontal = 8.dp, vertical = 3.dp),
            )
        }
        val dateLine = when {
            article.status == "published" && article.publishedAt != null -> "نُشرت ${writerShortDate(article.publishedAt)}"
            article.status == "scheduled" && article.scheduledAt != null -> "موعد النشر ${writerShortDate(article.scheduledAt)}"
            else -> article.updatedAt?.let { "آخر تحديث ${writerShortDate(it)}" }
        }
        dateLine?.let { Text(it, fontSize = 11.sp, fontWeight = FontWeight.Medium, color = SabqTheme.colors.tertiaryInk) }
        if (!article.reviewNotes.isNullOrBlank() && (article.reviewStatus == "needs_changes" || article.reviewStatus == "rejected")) {
            Text(
                "ملاحظة التحرير: ${article.reviewNotes}",
                fontSize = 11.sp,
                fontWeight = FontWeight.Medium,
                color = SabqTheme.colors.secondaryInk,
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(10.dp))
                    .background(SabqTheme.colors.gold.copy(alpha = 0.08f))
                    .padding(8.dp),
            )
        }
        Row(
            modifier = Modifier.clickable(enabled = !reviewLoading) { onReview() }.padding(vertical = 2.dp),
            horizontalArrangement = Arrangement.spacedBy(5.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (reviewLoading) {
                CircularProgressIndicator(color = SabqTheme.colors.sky, modifier = Modifier.size(11.dp), strokeWidth = 2.dp)
            } else {
                Icon(Icons.Filled.Psychology, null, tint = SabqTheme.colors.sky, modifier = Modifier.size(11.dp))
            }
            Text("قارئ سبق الأول", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = SabqTheme.colors.sky)
        }
    }
}

// ── ورقة «قارئ سبق الأول» ───────────────────────────────────────────

@Composable
private fun ReviewSheetContent(result: ApiWriterReviewResult, title: String) {
    Column(
        modifier = Modifier
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.Psychology, null, tint = SabqTheme.colors.sky, modifier = Modifier.size(20.dp))
            Text("قارئ سبق الأول", fontSize = 17.sp, fontWeight = FontWeight.Black, color = SabqTheme.colors.ink)
        }
        Text(title, fontSize = 12.sp, fontWeight = FontWeight.Medium, color = SabqTheme.colors.secondaryInk, maxLines = 2)
        result.overallScore?.let { score ->
            val tint = when {
                score >= 70 -> SabqTheme.colors.leaf
                score >= 50 -> SabqTheme.colors.gold
                else -> SabqTheme.colors.coral
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Bottom) {
                Text("$score", fontSize = 28.sp, fontWeight = FontWeight.Black, color = tint)
                Text(
                    "من 100 — الملاحظات اقتراحات اختيارية، وأنت صاحب النص النهائي.",
                    fontSize = 11.sp, fontWeight = FontWeight.Medium, color = SabqTheme.colors.secondaryInk,
                )
            }
        }
        result.summary?.takeIf { it.isNotBlank() }?.let { QuoteText(it) }
        result.checks.forEach { check ->
            val tint = when {
                check.score >= 70 -> SabqTheme.colors.leaf
                check.score >= 50 -> SabqTheme.colors.gold
                else -> SabqTheme.colors.coral
            }
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(SabqTheme.colors.paleFill)
                    .padding(10.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text("${check.score}", fontSize = 13.sp, fontWeight = FontWeight.Black, color = tint)
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(check.label, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = SabqTheme.colors.ink)
                    Text(check.note, fontSize = 11.sp, fontWeight = FontWeight.Medium, color = SabqTheme.colors.secondaryInk)
                }
            }
        }
        BulletBlock("عناوين مقترحة", result.headlineSuggestions)
        BulletBlock("نقاط قوة", result.strengths)
        BulletBlock("ادّعاءات تحتاج توثيقًا", result.sourceFlags + result.sensitiveClaims)
        Spacer(Modifier.size(20.dp))
    }
}

// ── لبنات مشتركة (مرآة helpers في iOS) ──────────────────────────────

@Composable
private fun WorkspaceCard(
    icon: ImageVector,
    tint: Color,
    title: String,
    content: @Composable () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(SabqTheme.colors.surface)
            .border(0.5.dp, SabqTheme.colors.outline.copy(alpha = 0.5f), RoundedCornerShape(18.dp))
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, null, tint = tint, modifier = Modifier.size(14.dp))
            Text(title, fontSize = 14.sp, fontWeight = FontWeight.Black, color = SabqTheme.colors.ink)
        }
        content()
    }
}

@Composable
private fun AlertsCard(
    state: WriterWorkspaceState,
    unread: Int,
    onOpenNotifications: () -> Unit,
    onMarkAll: () -> Unit,
) {
    WorkspaceCard(Icons.Filled.NotificationsActive, SabqTheme.colors.coral, "تنبيهات تحريرية بانتظارك") {
        val items = state.notifications?.items.orEmpty().filter { it.readAt == null }.take(2)
        items.forEach { item ->
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(item.title, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = SabqTheme.colors.ink)
                Text(item.body, fontSize = 12.sp, fontWeight = FontWeight.Medium, color = SabqTheme.colors.secondaryInk, maxLines = 2)
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                "عرض كل التنبيهات ($unread)",
                fontSize = 12.sp, fontWeight = FontWeight.Bold, color = SabqTheme.colors.sky,
                modifier = Modifier.clickable { onOpenNotifications() }.padding(vertical = 2.dp),
            )
            Spacer(Modifier.weight(1f))
            Text(
                "تمت قراءتها",
                fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = SabqTheme.colors.secondaryInk,
                modifier = Modifier.clickable { onMarkAll() }.padding(vertical = 2.dp),
            )
        }
    }
}

@Composable
private fun MetricTile(value: String, label: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .background(SabqTheme.colors.paleFill)
            .padding(10.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(value, fontSize = 18.sp, fontWeight = FontWeight.Black, color = SabqTheme.colors.ink)
        Text(label, fontSize = 11.sp, fontWeight = FontWeight.Medium, color = SabqTheme.colors.secondaryInk)
    }
}

@Composable
private fun QuoteText(text: String) {
    Text(
        text,
        fontSize = 12.sp,
        fontWeight = FontWeight.Medium,
        color = SabqTheme.colors.secondaryInk,
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(SabqTheme.colors.paleFill)
            .padding(10.dp),
    )
}

@Composable
private fun BulletBlock(title: String, items: List<String>) {
    if (items.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
        Text(title, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = SabqTheme.colors.ink)
        items.forEach { item ->
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Box(
                    Modifier
                        .padding(top = 6.dp)
                        .size(4.dp)
                        .clip(CircleShape)
                        .background(SabqTheme.colors.tertiaryInk),
                )
                Text(item, fontSize = 12.sp, fontWeight = FontWeight.Medium, color = SabqTheme.colors.secondaryInk)
            }
        }
    }
}

@Composable
private fun EmptyHint(icon: ImageVector, text: String) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(icon, null, tint = SabqTheme.colors.tertiaryInk, modifier = Modifier.size(22.dp))
        Text(text, fontSize = 12.sp, fontWeight = FontWeight.Medium, color = SabqTheme.colors.secondaryInk)
    }
}

@Composable
private fun IdeaCard(idea: ApiWriterIdea, onStart: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(SabqTheme.colors.paleFill)
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        val kindLabel = when (idea.kind) {
            "follow_up" -> "متابعة"
            "timely" -> "مناسبة قريبة"
            else -> "تخصصك"
        }
        Text(
            kindLabel,
            fontSize = 10.sp, fontWeight = FontWeight.Bold, color = SabqTheme.colors.sky,
            modifier = Modifier
                .clip(RoundedCornerShape(50))
                .background(SabqTheme.colors.sky.copy(alpha = 0.10f))
                .padding(horizontal = 8.dp, vertical = 3.dp),
        )
        Text(idea.title, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = SabqTheme.colors.ink)
        Text(idea.angle, fontSize = 12.sp, fontWeight = FontWeight.Medium, color = SabqTheme.colors.secondaryInk)
        Text(idea.whyNow, fontSize = 11.sp, fontWeight = FontWeight.Medium, color = SabqTheme.colors.tertiaryInk)
        Text(
            "ابدأ من هذه الفكرة",
            fontSize = 12.sp, fontWeight = FontWeight.Bold, color = SabqTheme.colors.sky,
            modifier = Modifier.clickable { onStart() }.padding(vertical = 2.dp),
        )
    }
}

@Composable
private fun TrackingCounter(label: String, value: Int, tint: Color, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(14.dp))
            .background(SabqTheme.colors.surface)
            .border(0.5.dp, SabqTheme.colors.outline.copy(alpha = 0.5f), RoundedCornerShape(14.dp))
            .padding(vertical = 10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text("$value", fontSize = 18.sp, fontWeight = FontWeight.Black, color = tint)
        Text(label, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, color = SabqTheme.colors.secondaryInk, maxLines = 1)
    }
}

/** تاريخ عربي بتوقيت الرياض — "الأحد 19 يوليو — 6:00 ص" أو "19 يوليو" */
private fun writerShortDate(iso: String, withTime: Boolean = true): String {
    return try {
        val instant = Instant.parse(iso)
        val pattern = if (withTime) "EEEE d MMMM — h:mm a" else "d MMMM"
        DateTimeFormatter.ofPattern(pattern, Locale("ar"))
            .withZone(ZoneId.of("Asia/Riyadh"))
            .format(instant)
    } catch (_: Exception) {
        ""
    }
}
