package com.sabq.smart.feature.editorial

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import coil.compose.AsyncImage
import com.sabq.smart.data.AuthRepository
import com.sabq.smart.ui.components.SabqDetailScaffold
import com.sabq.smart.ui.theme.SabqTheme
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZoneOffset
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

// ── «بانتظار قرارك» ────────────────────────────────────────────────

/**
 * لوحة المشرف — مرآة iOS `SupervisorNewsView`: أخبار المراسلين والبريد وطلبات
 * التعديل التي تنتظر قرارًا. المصدر: GET /api/v1/editorial/news (articles.publish).
 */
@HiltViewModel
class SupervisorNewsViewModel @Inject constructor(
    private val api: EditorialApi,
    auth: AuthRepository,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    data class UiState(
        val filter: EditorialNewsFilter = EditorialNewsFilter.All,
        val boardFilter: EditorialNewsFilter? = null,
        val board: EditorialNewsBoard = EditorialNewsBoard(),
        val error: EditorialError? = null,
    )

    private val _state = MutableStateFlow(UiState(filter = EditorialNewsFilter.fromWire(savedStateHandle.get<String>("filter"))))
    val state: StateFlow<UiState> = _state.asStateFlow()
    private var loadJob: Job? = null

    init {
        viewModelScope.launch {
            auth.user.map { it?.id }.distinctUntilChanged().drop(1).collect {
                _state.value = UiState(filter = _state.value.filter)
                load()
            }
        }
    }

    fun select(filter: EditorialNewsFilter) {
        if (filter == _state.value.filter) return
        _state.update { it.copy(filter = filter) }
        load()
    }

    fun load() {
        loadJob?.cancel()
        val filter = _state.value.filter
        _state.update { it.copy(error = null) }
        loadJob = viewModelScope.launch {
            editorialCall { api.newsBoard(filter.wire) }
                .onSuccess { board -> _state.update { it.copy(board = board, boardFilter = filter, error = null) } }
                .onFailure { e -> _state.update { it.copy(error = e.editorialError()) } }
        }
    }
}

@Composable
fun SupervisorNewsScreen(
    isPlatformAdmin: Boolean,
    onBack: () -> Unit,
    onOpenDraft: (String) -> Unit,
    onOpenEditRequest: (String) -> Unit,
    onNewNews: () -> Unit,
    onNewOpinion: () -> Unit,
    viewModel: SupervisorNewsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LifecycleResumeEffect(viewModel) {
        viewModel.load()
        onPauseOrDispose { }
    }
    var showNewChoice by remember { mutableStateOf(false) }

    SabqDetailScaffold(
        // للإدارة الكاملة هذه صفحة فرعية من «لوحة التحكم»؛ للمحرر هي لوحته.
        title = if (isPlatformAdmin) "بانتظار قرارك" else "لوحة التحكم",
        onBack = onBack,
        trailing = {
            // المحرر بلا دور مراسل أو كاتب: هذه لوحته الوحيدة، فالإنشاء هنا.
            if (!isPlatformAdmin) {
                Box(
                    Modifier
                        .size(40.dp)
                        .clip(CircleShape)
                        .background(SabqTheme.colors.surface)
                        .clickable { showNewChoice = true },
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Filled.Add, contentDescription = "محتوى جديد", tint = SabqTheme.colors.ink)
                }
            }
        },
    ) {
        Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Text(EditorialText.todayLine(), style = SabqTheme.typography.meta.copy(color = SabqTheme.colors.secondaryInk))
            val error = state.error
            if (state.boardFilter == null) {
                EditorialStatusView(error, loading = error == null, onRetry = viewModel::load)
                return@Column
            }
            BoardSummary(state.board)
            EditorialChipRow(
                options = EditorialNewsFilter.entries,
                selected = state.filter,
                title = { it.title },
                count = { state.board.counts.count(it) },
                onSelect = viewModel::select,
            )
            if (error != null && state.boardFilter == state.filter) {
                Text(error.message, style = SabqTheme.typography.meta.copy(color = EditorialWarning))
            }
            val items = state.board.visibleItems
            when {
                state.boardFilter != state.filter -> EditorialStatusView(error, loading = error == null, onRetry = viewModel::load)
                items.isEmpty() -> Text(
                    "لا شيء ينتظر قرارك الآن.",
                    modifier = Modifier.fillMaxWidth().padding(vertical = 32.dp),
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    style = SabqTheme.typography.excerpt.copy(color = SabqTheme.colors.secondaryInk),
                )
                else -> EditorialSurface(padding = 0.dp) {
                    Column(Modifier.padding(horizontal = 16.dp)) {
                        items.forEachIndexed { index, item ->
                            if (index > 0) HorizontalDivider(color = SabqTheme.colors.outline, thickness = 0.5.dp)
                            if (item.isDraft) DraftRow(item) { onOpenDraft(item.id) } else RequestRow(item) { onOpenEditRequest(item.id) }
                        }
                    }
                }
            }
        }
    }

    if (showNewChoice) {
        AlertDialog(
            onDismissRequest = { showNewChoice = false },
            title = { Text("نوع المحتوى") },
            confirmButton = {
                TextButton(onClick = { showNewChoice = false; onNewNews() }) { Text("خبر") }
            },
            dismissButton = {
                TextButton(onClick = { showNewChoice = false; onNewOpinion() }) { Text("مقال رأي") }
            },
        )
    }
}

@Composable
private fun BoardSummary(board: EditorialNewsBoard) {
    EditorialSurface {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("${board.counts.all} بانتظار قرارك", style = SabqTheme.typography.sectionHeader.copy(color = SabqTheme.colors.ink))
                if (board.breakdown.isNotEmpty()) {
                    Text(board.breakdown, style = SabqTheme.typography.meta.copy(color = SabqTheme.colors.secondaryInk))
                }
            }
            if (board.oldestAt != null) {
                Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text("أقدمها", style = SabqTheme.typography.metaSmall.copy(color = SabqTheme.colors.secondaryInk))
                    Text(
                        EditorialText.relative(board.oldestAt),
                        style = SabqTheme.typography.meta.copy(fontWeight = FontWeight.SemiBold, color = SabqTheme.colors.brandBlue),
                    )
                }
            }
        }
    }
}

@Composable
private fun DraftRow(item: EditorialNewsItem, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            if (item.isBreaking) {
                Text("عاجل من المراسل", style = SabqTheme.typography.metaSmall.copy(fontWeight = FontWeight.Bold, color = SabqTheme.colors.coral))
            }
            Text(
                listOf(EditorialText.relative(item.submittedAt), item.categoryName.orEmpty()).filter { it.isNotBlank() }.joinToString(" · "),
                style = SabqTheme.typography.meta.copy(color = SabqTheme.colors.secondaryInk),
            )
            Text(item.title, style = SabqTheme.typography.cardTitle.copy(color = SabqTheme.colors.ink))
            Text(
                listOf(item.reporterName.orEmpty(), channelTitle(item.channel)).filter { it.isNotBlank() }.joinToString(" · "),
                style = SabqTheme.typography.meta.copy(color = SabqTheme.colors.secondaryInk),
            )
            item.lockedBy?.let { LockedLine("مفتوح الآن عند $it") }
        }
        item.thumbnail?.let { url ->
            Box {
                EditorialThumbnail(url, 64.dp)
                if (item.albumCount > 0) {
                    Text(
                        "+${item.albumCount}",
                        style = SabqTheme.typography.metaSmall.copy(color = Color.White),
                        modifier = Modifier
                            .align(Alignment.BottomEnd)
                            .padding(4.dp)
                            .clip(CircleShape)
                            .background(Color.Black.copy(alpha = 0.55f))
                            .padding(horizontal = 5.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun RequestRow(item: EditorialNewsItem, onClick: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(item.title, style = SabqTheme.typography.cardTitle.copy(color = SabqTheme.colors.ink))
        Text(
            listOf(item.requesterName.orEmpty(), item.onWhat, EditorialText.relative(item.submittedAt))
                .filter { it.isNotBlank() }.joinToString(" · "),
            style = SabqTheme.typography.meta.copy(color = SabqTheme.colors.secondaryInk),
        )
        EditRequestBadge(RequestOutcome.Pending, item.label.orEmpty(), item.urgent)
        EditorialPillButton(EditorialStates.REVIEW_REQUEST, filled = true, onClick = onClick)
    }
}

@Composable
private fun LockedLine(text: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        Icon(Icons.Outlined.Lock, null, tint = EditorialWarning, modifier = Modifier.size(14.dp))
        Text(text, style = SabqTheme.typography.meta.copy(color = EditorialWarning))
    }
}

// ── استعراض الخبر ──────────────────────────────────────────────────

/** استعراض خبر ينتظر القرار: انشر الآن، جدول، أو أعده للمراسل، مع اختيار القسم. */
@HiltViewModel
class SupervisorNewsPreviewViewModel @Inject constructor(
    private val api: EditorialApi,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {
    private val id: String = savedStateHandle.get<String>("id").orEmpty()

    data class UiState(
        val article: EditorialNewsPreview? = null,
        val categories: List<EditorialCategory> = emptyList(),
        val categoryId: String? = null,
        val error: EditorialError? = null,
        val busy: Boolean = false,
        val actionError: String? = null,
        val doneMessage: String? = null,
    ) {
        val categoryName: String
            get() = categories.firstOrNull { it.id == categoryId }?.name ?: article?.category?.name ?: "اختر القسم"

        /** القسم يُرسل فقط إن غيّره المحرر. */
        val chosenCategory: String? get() = categoryId?.takeIf { it != article?.category?.id }
    }

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        _state.update { it.copy(error = null) }
        viewModelScope.launch {
            val categories = async { editorialCall { api.categories() }.getOrNull()?.categories.orEmpty() }
            editorialCall { api.preview(id) }
                .onSuccess { env -> _state.update { it.copy(article = env.article, categories = categories.await(), error = null) } }
                .onFailure { e -> _state.update { it.copy(error = e.editorialError()) } }
        }
    }

    fun chooseCategory(id: String) = _state.update { it.copy(categoryId = id) }

    private fun act(done: String, call: suspend () -> Unit) {
        if (_state.value.busy) return
        _state.update { it.copy(busy = true, actionError = null) }
        viewModelScope.launch {
            editorialCall { call() }
                .onSuccess { _state.update { it.copy(busy = false, doneMessage = done) } }
                .onFailure { e -> _state.update { it.copy(busy = false, actionError = e.editorialError().message) } }
        }
    }

    fun publish() {
        val s = _state.value
        val article = s.article ?: return
        act("نُشر الخبر") { api.publish(id, PublishBody(article.updatedAt, s.chosenCategory)) }
    }

    fun schedule(at: Instant) {
        val s = _state.value
        val article = s.article ?: return
        act("جُدول للنشر ${EditorialText.dayTime(at)}") {
            api.schedule(id, ScheduleBody(EditorialText.isoUtc(at), article.updatedAt, s.chosenCategory))
        }
    }

    fun returnToReporter(note: String) = act("أُعيد للمراسل") { api.returnToReporter(id, NoteBody(note.trim())) }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SupervisorNewsPreviewScreen(
    onBack: () -> Unit,
    viewModel: SupervisorNewsPreviewViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var confirmPublish by remember { mutableStateOf(false) }
    var pickDate by remember { mutableStateOf(false) }
    var pickedDate by remember { mutableStateOf<LocalDate?>(null) }
    var showReturn by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxSize().background(SabqTheme.colors.background)) {
        Box(Modifier.weight(1f)) {
            SabqDetailScaffold(title = "استعراض الخبر", onBack = onBack) {
                Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    val article = state.article
                    if (article == null) {
                        EditorialStatusView(state.error, loading = state.error == null, onRetry = viewModel::load)
                    } else {
                        PreviewContent(article, state, viewModel)
                    }
                }
            }
        }
        val article = state.article
        if (article != null) {
            EditorialBottomBar {
                when {
                    state.doneMessage != null -> EditorialDoneLine(state.doneMessage!!)
                    article.isDecidable -> {
                        state.actionError?.let {
                            Text(it, modifier = Modifier.fillMaxWidth(), style = SabqTheme.typography.meta.copy(color = SabqTheme.colors.coral))
                        }
                        EditorialActionButton("انشر الآن", busy = state.busy) { confirmPublish = true }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            EditorialActionButton(
                                "جدول",
                                modifier = Modifier.weight(1f),
                                style = EditorialButtonStyle.Secondary,
                                enabled = !state.busy,
                            ) { pickDate = true }
                            EditorialActionButton(
                                "أعده للمراسل",
                                modifier = Modifier.weight(1f),
                                style = EditorialButtonStyle.Secondary,
                                enabled = !state.busy,
                            ) { showReturn = true }
                        }
                        Text(
                            "نفس القرار يظهر فورًا على الويب و«مكتب سبق»",
                            modifier = Modifier.navigationBarsPadding(),
                            style = SabqTheme.typography.metaSmall.copy(color = SabqTheme.colors.secondaryInk),
                        )
                    }
                    else -> Text(
                        "هذا الخبر لم يعد ينتظر قرارًا (${article.status}).",
                        modifier = Modifier.navigationBarsPadding().heightIn(min = 50.dp).padding(top = 14.dp),
                        style = SabqTheme.typography.meta.copy(color = SabqTheme.colors.secondaryInk),
                    )
                }
            }
        }
    }

    if (confirmPublish) {
        AlertDialog(
            onDismissRequest = { confirmPublish = false },
            title = { Text("نشر الخبر الآن؟") },
            text = { Text("يظهر للقراء فورًا على الموقع والتطبيقات.") },
            confirmButton = { TextButton(onClick = { confirmPublish = false; viewModel.publish() }) { Text("انشر الآن") } },
            dismissButton = { TextButton(onClick = { confirmPublish = false }) { Text("تراجع") } },
        )
    }

    if (pickDate) {
        val riyadh = ZoneId.of("Asia/Riyadh")
        val today = LocalDate.now(riyadh)
        val dateState = rememberDatePickerState(
            initialSelectedDateMillis = today.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
            selectableDates = object : SelectableDates {
                override fun isSelectableDate(utcTimeMillis: Long): Boolean =
                    !Instant.ofEpochMilli(utcTimeMillis).atZone(ZoneOffset.UTC).toLocalDate().isBefore(today)
            },
        )
        DatePickerDialog(
            onDismissRequest = { pickDate = false },
            confirmButton = {
                TextButton(onClick = {
                    pickedDate = dateState.selectedDateMillis?.let { Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate() }
                    pickDate = false
                }) { Text("التالي") }
            },
            dismissButton = { TextButton(onClick = { pickDate = false }) { Text("إلغاء") } },
        ) { DatePicker(state = dateState) }
    }

    pickedDate?.let { date ->
        val riyadh = ZoneId.of("Asia/Riyadh")
        val next = LocalTime.now(riyadh).plusHours(1)
        val timeState = rememberTimePickerState(initialHour = next.hour, initialMinute = next.minute, is24Hour = true)
        AlertDialog(
            onDismissRequest = { pickedDate = null },
            title = { Text("وقت النشر (بتوقيت الرياض)") },
            text = { TimePicker(state = timeState) },
            confirmButton = {
                TextButton(onClick = {
                    val at = date.atTime(timeState.hour, timeState.minute).atZone(riyadh).toInstant()
                    pickedDate = null
                    viewModel.schedule(at)
                }) { Text("جدول النشر") }
            },
            dismissButton = { TextButton(onClick = { pickedDate = null }) { Text("إلغاء") } },
        )
    }

    if (showReturn) {
        var note by rememberSaveable { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showReturn = false },
            title = { Text("إعادة للمراسل") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("ملاحظتك تصل للمراسل مع الإشعار.", style = SabqTheme.typography.meta.copy(color = SabqTheme.colors.secondaryInk))
                    OutlinedTextField(
                        value = note,
                        onValueChange = { note = it },
                        placeholder = { Text("مثال: أضف موعد الافتتاح ومكانه") },
                        minLines = 3,
                        maxLines = 8,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            },
            confirmButton = {
                TextButton(
                    enabled = note.trim().length >= 3,
                    onClick = { showReturn = false; viewModel.returnToReporter(note) },
                ) { Text("أعده للمراسل") }
            },
            dismissButton = { TextButton(onClick = { showReturn = false }) { Text("إلغاء") } },
        )
    }
}

@Composable
private fun PreviewContent(
    article: EditorialNewsPreview,
    state: SupervisorNewsPreviewViewModel.UiState,
    viewModel: SupervisorNewsPreviewViewModel,
) {
    article.hero?.let {
        AsyncImage(
            model = it,
            contentDescription = "الصورة البارزة",
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxWidth().height(220.dp).clip(RoundedCornerShape(16.dp)).background(SabqTheme.colors.softFill),
        )
    }
    if (article.album.isNotEmpty()) {
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            article.album.forEach { EditorialThumbnail(it, 64.dp) }
        }
    }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        if (state.categories.isNotEmpty() && article.isDecidable) {
            var open by remember { mutableStateOf(false) }
            Box {
                Row(
                    Modifier
                        .heightIn(min = 34.dp)
                        .clip(CircleShape)
                        .background(SabqTheme.colors.softFill)
                        .clickable { open = true }
                        .padding(horizontal = 12.dp, vertical = 7.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text(state.categoryName, style = SabqTheme.typography.meta.copy(fontWeight = FontWeight.SemiBold, color = SabqTheme.colors.brandBlue))
                    Icon(Icons.Filled.KeyboardArrowDown, null, tint = SabqTheme.colors.brandBlue, modifier = Modifier.size(16.dp))
                }
                DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                    state.categories.forEach { category ->
                        DropdownMenuItem(text = { Text(category.name) }, onClick = { open = false; viewModel.chooseCategory(category.id) })
                    }
                }
            }
        } else {
            article.category?.name?.let {
                Text(it, style = SabqTheme.typography.meta.copy(fontWeight = FontWeight.SemiBold, color = SabqTheme.colors.brandBlue))
            }
        }
        if (article.isBreaking) {
            Text("المراسل يراه عاجلًا", style = SabqTheme.typography.metaSmall.copy(fontWeight = FontWeight.Bold, color = SabqTheme.colors.coral))
        }
    }
    Text(article.title, style = SabqTheme.typography.articleDetailTitle.copy(color = SabqTheme.colors.ink))
    Text(
        listOfNotNull(
            article.reporterName,
            article.submittedAt?.let { "وصل ${EditorialText.dayTime(it)}" },
            article.readinessLine,
        ).filter { it.isNotBlank() }.joinToString(" · "),
        style = SabqTheme.typography.meta.copy(color = SabqTheme.colors.secondaryInk),
    )
    article.lockedBy?.let { LockedLine("مفتوح الآن عند $it على الويب") }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        article.paragraphs.forEach { Text(it, style = SabqTheme.typography.body.copy(color = SabqTheme.colors.ink)) }
    }
}
