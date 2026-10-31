package com.sabq.smart.feature.editorial

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.outlined.EditNote
import androidx.compose.material.icons.outlined.Newspaper
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.AuthRepository
import com.sabq.smart.ui.components.SabqDetailScaffold
import com.sabq.smart.ui.theme.SabqTheme
import dagger.hilt.android.lifecycle.HiltViewModel
import java.text.NumberFormat
import java.util.Locale
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * «أخباري» — لوحة المراسل. نسخة من iOS `ReporterNewsView`: ملخّص «يحتاج تعديلك»،
 * الشرائح، قائمة فيها ملاحظة المحرر وملصق طلب التعديل، ثم «أداء أخباري».
 * المصدر: GET /api/v1/editorial/my-news.
 */
@HiltViewModel
class ReporterNewsViewModel @Inject constructor(
    private val api: EditorialApi,
    auth: AuthRepository,
) : ViewModel() {

    data class UiState(
        val filter: MyNewsFilter = MyNewsFilter.All,
        /** الفلتر الذي تخصه [board] (null قبل أول تحميل ناجح). */
        val boardFilter: MyNewsFilter? = null,
        val board: MyNewsBoard = MyNewsBoard(),
        val error: EditorialError? = null,
        val actionError: String? = null,
        val cancelTarget: MyNewsItem? = null,
    )

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()
    private var loadJob: Job? = null

    init {
        // حساب آخر: لا يبقى شيء من قائمة السابق.
        viewModelScope.launch {
            auth.user.map { it?.id }.distinctUntilChanged().drop(1).collect {
                _state.value = UiState(filter = _state.value.filter)
                load()
            }
        }
    }

    fun select(filter: MyNewsFilter) {
        if (filter == _state.value.filter) return
        _state.update { it.copy(filter = filter) }
        load()
    }

    /** «الأحدث يفوز»: طلب فلتر سابق يُلغى فلا يبدّل القائمة الحالية. */
    fun load() {
        loadJob?.cancel()
        val filter = _state.value.filter
        _state.update { it.copy(error = null) }
        loadJob = viewModelScope.launch {
            editorialCall { api.myNews(filter.wire) }
                .onSuccess { board -> _state.update { it.copy(board = board, boardFilter = filter, error = null) } }
                .onFailure { e -> _state.update { it.copy(error = e.editorialError()) } }
        }
    }

    fun askCancel(item: MyNewsItem?) = _state.update { it.copy(cancelTarget = item) }

    fun confirmCancel() {
        val item = _state.value.cancelTarget ?: return
        val id = item.pendingEditRequest?.id ?: return
        _state.update { it.copy(cancelTarget = null) }
        viewModelScope.launch {
            editorialCall { api.cancelEditRequest(id) }
                .onSuccess { _state.update { it.copy(actionError = null) }; load() }
                .onFailure { e -> _state.update { it.copy(actionError = e.editorialError().message) } }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ReporterNewsScreen(
    onBack: () -> Unit,
    onOpenNotifications: () -> Unit,
    onNewNews: () -> Unit,
    onRequestEdit: (MyNewsItem) -> Unit,
    onResubmit: (String) -> Unit,
    onOpenArticle: (String) -> Unit,
    onOpenPerformance: () -> Unit,
    viewModel: ReporterNewsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    // يعود من «طلب تعديل» أو «خبر جديد» أو إعادة الإرسال: حدّث القائمة.
    LifecycleResumeEffect(viewModel) {
        viewModel.load()
        onPauseOrDispose { }
    }

    Box(Modifier.fillMaxSize()) {
        SabqDetailScaffold(
            title = "أخباري",
            onBack = onBack,
            trailing = {
                Box(
                    Modifier.size(40.dp).clip(CircleShape).background(SabqTheme.colors.surface).clickable(onClick = onOpenNotifications),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Outlined.Notifications, contentDescription = "إشعاراتي التحريرية", tint = SabqTheme.colors.ink)
                }
            },
        ) {
            Column(
                Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                val error = state.error
                if (state.boardFilter == null) {
                    EditorialStatusView(error, loading = error == null, onRetry = viewModel::load)
                    return@Column
                }
                Summary(state.board.counts) { viewModel.select(MyNewsFilter.NeedsChanges) }
                EditorialChipRow(
                    options = MyNewsFilter.entries,
                    selected = state.filter,
                    title = { it.title },
                    count = { state.board.counts.count(it) },
                    onSelect = viewModel::select,
                )
                state.actionError?.let {
                    Text(it, style = SabqTheme.typography.meta.copy(color = SabqTheme.colors.coral))
                }
                if (state.boardFilter != state.filter) {
                    EditorialStatusView(error, loading = error == null, onRetry = viewModel::load)
                } else {
                    error?.let {
                        Text(it.message, style = SabqTheme.typography.meta.copy(color = EditorialWarning))
                    }
                    val items = state.board.visibleItems
                    if (items.isEmpty()) {
                        EmptyNews(state.filter)
                    } else {
                        EditorialSurface(padding = 0.dp) {
                            Column {
                                items.forEachIndexed { index, item ->
                                    if (index > 0) HorizontalDivider(color = SabqTheme.colors.outline, thickness = 0.5.dp)
                                    NewsRow(
                                        item = item,
                                        onResubmit = { onResubmit(item.id) },
                                        onRequestEdit = { onRequestEdit(item) },
                                        onOpenArticle = { item.publishedSlug?.let(onOpenArticle) },
                                        onCancel = { viewModel.askCancel(item) },
                                    )
                                }
                            }
                        }
                    }
                }
                PerformanceLink(onOpenPerformance)
            }
        }

        if (state.error == null) {
            Row(
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .navigationBarsPadding()
                    .padding(start = 16.dp, bottom = 24.dp)
                    .heightIn(min = 52.dp)
                    .clip(CircleShape)
                    .background(SabqTheme.colors.brandBlue)
                    .clickable(onClick = onNewNews)
                    .padding(horizontal = 24.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(Icons.Filled.Add, null, tint = Color.White, modifier = Modifier.size(18.dp))
                Text("خبر جديد", style = SabqTheme.typography.ctaButton.copy(color = Color.White))
            }
        }
    }

    if (state.cancelTarget != null) {
        AlertDialog(
            onDismissRequest = { viewModel.askCancel(null) },
            title = { Text("إلغاء طلب التعديل؟") },
            text = { Text("يمكنك إرسال طلب جديد بعد الإلغاء.") },
            confirmButton = {
                TextButton(onClick = viewModel::confirmCancel) {
                    Text(EditorialStates.CANCEL_REQUEST, color = SabqTheme.colors.coral)
                }
            },
            dismissButton = { TextButton(onClick = { viewModel.askCancel(null) }) { Text("تراجع") } },
        )
    }
}

@Composable
private fun Summary(counts: MyNewsCounts, onClick: () -> Unit) {
    val shape = RoundedCornerShape(22.dp)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(
                Brush.horizontalGradient(
                    listOf(SabqTheme.colors.brandBlue.copy(alpha = 0.12f), Color(0xFF8E5BD8).copy(alpha = 0.07f)),
                ),
            )
            .clickable(onClick = onClick)
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            Modifier.size(44.dp).clip(RoundedCornerShape(14.dp)).background(SabqTheme.colors.surface),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Outlined.EditNote, null, tint = SabqTheme.colors.brandBlue)
        }
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    "${counts.needs_changes}",
                    style = SabqTheme.typography.statValue.copy(fontSize = 30.sp, fontWeight = FontWeight.Bold, color = SabqTheme.colors.ink),
                )
                Text("خبر يحتاج تعديلك", style = SabqTheme.typography.cardTitle.copy(color = SabqTheme.colors.secondaryInk))
            }
            Text(
                "و${counts.pending} قيد المراجعة عند المحرر، و${counts.scheduled} مجدول للنشر",
                style = SabqTheme.typography.meta.copy(color = SabqTheme.colors.secondaryInk),
            )
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun NewsRow(
    item: MyNewsItem,
    onResubmit: () -> Unit,
    onRequestEdit: () -> Unit,
    onOpenArticle: () -> Unit,
    onCancel: () -> Unit,
) {
    val returned = item.state == "needs_changes"
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(if (returned) EditorialWarning.copy(alpha = 0.05f) else Color.Transparent)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(item.title, style = SabqTheme.typography.cardTitle.copy(color = SabqTheme.colors.ink))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    EditorialStatePill(item.stateLabel)
                    Text(
                        metaLine(item),
                        maxLines = 1,
                        style = SabqTheme.typography.meta.copy(color = SabqTheme.colors.secondaryInk),
                    )
                }
            }
            item.thumbnail?.let { EditorialThumbnail(it, 60.dp) }
        }

        val notes = item.reviewNotes
        if (returned && !notes.isNullOrBlank()) {
            Text(
                buildAnnotatedString {
                    withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append("ملاحظة المحرر: ") }
                    append(notes)
                },
                style = SabqTheme.typography.meta.copy(color = SabqTheme.colors.ink),
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(EditorialWarning.copy(alpha = 0.12f))
                    .padding(horizontal = 12.dp, vertical = 8.dp),
            )
        }

        RequestBadge(item)

        val hasPending = item.pendingEditRequest != null
        if (returned || item.canRequestEdit || item.publishedSlug != null || hasPending) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (returned) EditorialPillButton(EditorialStates.RESUBMIT, filled = true, onClick = onResubmit)
                if (item.canRequestEdit && !hasPending) {
                    EditorialPillButton(EditorialStates.REQUEST_EDIT, emphasized = true, onClick = onRequestEdit)
                }
                if (item.publishedSlug != null) EditorialPillButton(EditorialStates.OPEN_ARTICLE, onClick = onOpenArticle)
                if (hasPending) {
                    Text(
                        EditorialStates.CANCEL_REQUEST,
                        style = SabqTheme.typography.meta.copy(fontWeight = FontWeight.SemiBold, color = SabqTheme.colors.coral),
                        modifier = Modifier.heightIn(min = 36.dp).clickable(onClick = onCancel).padding(horizontal = 8.dp, vertical = 9.dp),
                    )
                }
            }
        }
    }
}

/** الملصق كما في الويب. سيرفر أقدم بلا lastEditRequest: المفتوح فقط. */
@Composable
private fun RequestBadge(item: MyNewsItem) {
    val last = item.lastEditRequest
    if (last != null) {
        when (last.outcome) {
            "pending" -> EditRequestBadge(RequestOutcome.Pending, last.label, last.urgent)
            "approved" -> EditRequestBadge(RequestOutcome.Approved, EditorialText.relative(last.decidedAt))
            "rejected" -> {
                EditRequestBadge(RequestOutcome.Rejected, EditorialText.relative(last.decidedAt))
                last.decisionNote?.takeIf { it.isNotBlank() }?.let {
                    Text("السبب: $it", style = SabqTheme.typography.meta.copy(color = SabqTheme.colors.secondaryInk))
                }
            }
        }
        return
    }
    item.pendingEditRequest?.let { EditRequestBadge(RequestOutcome.Pending, it.label) }
}

@Composable
private fun PerformanceLink(onClick: () -> Unit) {
    EditorialSurface(modifier = Modifier.clickable(onClick = onClick)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("أداء أخباري", style = SabqTheme.typography.cardTitle.copy(color = SabqTheme.colors.ink))
            Text(
                "المشاهدات والتفاعل والجمهور",
                modifier = Modifier.weight(1f),
                maxLines = 1,
                style = SabqTheme.typography.meta.copy(color = SabqTheme.colors.secondaryInk),
            )
            Text("عرض", style = SabqTheme.typography.meta.copy(fontWeight = FontWeight.SemiBold, color = SabqTheme.colors.brandBlue))
        }
    }
}

@Composable
private fun EmptyNews(filter: MyNewsFilter) {
    EditorialSurface {
        Column(
            Modifier.fillMaxWidth().padding(vertical = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(Icons.Outlined.Newspaper, null, tint = SabqTheme.colors.brandBlue, modifier = Modifier.size(28.dp))
            Text(
                if (filter == MyNewsFilter.All) "لا توجد أخبار بعد" else "لا توجد أخبار هنا",
                style = SabqTheme.typography.cardTitle.copy(color = SabqTheme.colors.ink),
            )
            Text(
                "أرسل خبرك من زر «خبر جديد» ويصل للمحررين فورًا.",
                style = SabqTheme.typography.meta.copy(color = SabqTheme.colors.secondaryInk),
            )
        }
    }
}

/** التاريخ وما يخص الحالة؛ اسم الحالة في الشارة وحدها. */
internal fun metaLine(item: MyNewsItem): String = when (item.state) {
    "published" -> {
        val views = if (item.views > 0) " · ${NumberFormat.getIntegerInstance(Locale.US).format(item.views)} مشاهدة" else ""
        EditorialText.dayTime(item.publishedAt) + views
    }
    "scheduled" -> EditorialText.dayTime(item.scheduledAt)
    "needs_changes" -> EditorialText.relative(item.reviewedAt ?: item.updatedAt)
    "pending" -> EditorialText.dayTime(item.submittedAt ?: item.createdAt)
    else -> EditorialText.dayTime(item.updatedAt)
}
