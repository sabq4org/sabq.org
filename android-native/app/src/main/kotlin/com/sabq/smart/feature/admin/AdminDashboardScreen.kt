package com.sabq.smart.feature.admin

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.Forum
import androidx.compose.material.icons.outlined.Inbox
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.sabq.smart.feature.editorial.EditorialApi
import com.sabq.smart.feature.editorial.EditorialError
import com.sabq.smart.feature.editorial.EditorialNewsBoard
import com.sabq.smart.feature.editorial.EditorialStatusView
import com.sabq.smart.feature.editorial.EditorialSurface
import com.sabq.smart.feature.editorial.EditorialText
import com.sabq.smart.feature.editorial.editorialCall
import com.sabq.smart.feature.editorial.editorialError
import com.sabq.smart.ui.components.SabqDetailScaffold
import com.sabq.smart.ui.theme.SabqTheme
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * «لوحة التحكم» لمسؤول المنصة — مرآة iOS `AdminDashboardView`: ملخّص ما ينتظر
 * القرار، وأخبار كل حالة مع النشر الفوري وطلب التعديل والأرشفة والحذف
 * النهائي، والعدّادان، وصندوق الإدارة (رسائل التواصل واستفسارات الكتّاب).
 * المحرر الكامل لم يُنقل: التعديل من لوحة الويب.
 */

data class AdminDashboardUiState(
    val status: AdminArticleStatus = AdminArticleStatus.Draft,
    val items: List<AdminNewsItem> = emptyList(),
    val total: Int = 0,
    val page: Int = 1,
    val loading: Boolean = true,
    val loadingMore: Boolean = false,
    val error: EditorialError? = null,
    val counts: AdminCounts? = null,
    val queue: EditorialNewsBoard? = null,
    val publishing: Set<String> = emptySet(),
    val notice: String? = null,
)

@HiltViewModel
class AdminDashboardViewModel @Inject constructor(
    private val api: AdminApi,
    private val editorial: EditorialApi,
) : ViewModel() {
    private val _state = MutableStateFlow(AdminDashboardUiState())
    val state: StateFlow<AdminDashboardUiState> = _state.asStateFlow()
    private var listJob: Job? = null

    fun load() {
        loadList()
        viewModelScope.launch {
            runCatching { api.counts() }.onSuccess { c -> _state.update { it.copy(counts = c) } }
        }
        viewModelScope.launch {
            // بلا مصادقة ثنائية أو صلاحية: تبقى اللوحة دون الملخّص.
            editorialCall { editorial.newsBoard("all") }.onSuccess { b -> _state.update { it.copy(queue = b) } }
        }
    }

    fun select(status: AdminArticleStatus) {
        if (status == _state.value.status && !_state.value.loading) return
        _state.update { it.copy(status = status, items = emptyList(), total = 0, page = 1, error = null) }
        loadList()
    }

    private fun loadList() {
        listJob?.cancel()
        val status = _state.value.status
        _state.update { it.copy(loading = true, error = null) }
        listJob = viewModelScope.launch {
            editorialCall { api.articles(status.wire, 1) }
                .onSuccess { page ->
                    _state.update {
                        it.copy(items = page.items, total = page.total ?: page.items.size, page = 1, loading = false)
                    }
                }
                .onFailure { e -> _state.update { it.copy(loading = false, error = e.editorialError()) } }
        }
    }

    fun loadMore() {
        val s = _state.value
        if (s.loadingMore || !AdminText.canLoadMore(s.items.size, s.total)) return
        _state.update { it.copy(loadingMore = true) }
        viewModelScope.launch {
            val next = s.page + 1
            editorialCall { api.articles(s.status.wire, next) }
                .onSuccess { page ->
                    _state.update { cur ->
                        if (cur.status != s.status) return@update cur.copy(loadingMore = false)
                        val known = cur.items.map { it.id }.toSet()
                        cur.copy(items = cur.items + page.items.filter { it.id !in known }, page = next, loadingMore = false)
                    }
                }
                .onFailure { _state.update { it.copy(loadingMore = false, notice = "تعذّر جلب المزيد") } }
        }
    }

    fun publish(item: AdminNewsItem) {
        _state.update { it.copy(publishing = it.publishing + item.id) }
        viewModelScope.launch {
            editorialCall { api.publish(item.id) }
                .onSuccess {
                    _state.update { it.copy(publishing = it.publishing - item.id, notice = "نُشر «${item.title}»") }
                    load()
                }
                .onFailure { e -> _state.update { it.copy(publishing = it.publishing - item.id, notice = e.editorialError().message) } }
        }
    }

    /** يعيد null عند النجاح، أو رسالة الخطأ لتبقى نافذة السبب مفتوحة. */
    suspend fun perform(action: AdminWorkflowAction, item: AdminNewsItem, reason: String): String? {
        val text = reason.trim()
        val result = editorialCall {
            when (action) {
                AdminWorkflowAction.RequestRevision -> api.requestRevision(item.id, AdminReviewNotesBody(text))
                AdminWorkflowAction.Archive -> api.archive(item.id, AdminReviewNotesBody(text))
                AdminWorkflowAction.PermanentDelete -> {
                    val r = api.permanentDelete(item.id, AdminDeletionBody(text))
                    if (!r.isSuccessful) throw retrofit2.HttpException(r)
                }
            }
        }
        return result.fold(
            onSuccess = {
                _state.update { it.copy(notice = "تم: ${action.title}") }
                load()
                null
            },
            onFailure = { it.editorialError().message },
        )
    }

    fun clearNotice() = _state.update { it.copy(notice = null) }
}

@Composable
fun AdminDashboardScreen(
    onBack: () -> Unit,
    onOpenQueue: (filter: String) -> Unit,
    onOpenContactMessages: () -> Unit,
    onOpenTickets: () -> Unit,
    onNewNews: () -> Unit,
    onNewOpinion: () -> Unit,
    viewModel: AdminDashboardViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LifecycleResumeEffect(viewModel) {
        viewModel.load()
        onPauseOrDispose { }
    }
    var showNewChoice by remember { mutableStateOf(false) }
    var pendingPublish by remember { mutableStateOf<AdminNewsItem?>(null) }
    var pendingAction by remember { mutableStateOf<Pair<AdminWorkflowAction, AdminNewsItem>?>(null) }
    val colors = SabqTheme.colors

    SabqDetailScaffold(
        title = "لوحة التحكم",
        onBack = onBack,
        trailing = {
            Box(
                Modifier.size(40.dp).clip(CircleShape).background(colors.surface).clickable { showNewChoice = true },
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.Add, contentDescription = "محتوى جديد", tint = colors.ink)
                DropdownMenu(expanded = showNewChoice, onDismissRequest = { showNewChoice = false }) {
                    DropdownMenuItem(text = { Text("خبر") }, onClick = { showNewChoice = false; onNewNews() })
                    DropdownMenuItem(text = { Text("مقال رأي") }, onClick = { showNewChoice = false; onNewOpinion() })
                }
            }
        },
    ) {
        Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            QueueSummary(state.queue, onOpenQueue)

            state.notice?.let { notice ->
                Text(
                    notice,
                    fontSize = 13.sp,
                    color = colors.ink,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(colors.paleFill)
                        .clickable { viewModel.clearNotice() }
                        .padding(12.dp),
                )
            }

            StatusSegments(state.status, viewModel::select)

            when {
                state.loading && state.items.isEmpty() -> Box(Modifier.fillMaxWidth().heightIn(min = 200.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = colors.primaryEnd)
                }
                state.error != null && state.items.isEmpty() -> EditorialStatusView(state.error, loading = false, onRetry = viewModel::load)
                state.items.isEmpty() -> Text(
                    "لا شيء في ${state.status.label} حاليًا",
                    fontSize = 14.sp,
                    color = colors.secondaryInk,
                    modifier = Modifier.fillMaxWidth().padding(vertical = 40.dp),
                )
                else -> {
                    EditorialSurface(padding = 0.dp) {
                        Column(Modifier.padding(horizontal = 16.dp)) {
                            state.items.forEachIndexed { index, item ->
                                if (index > 0) HorizontalDivider(color = colors.outline)
                                AdminNewsRow(
                                    item = item,
                                    publishing = item.id in state.publishing,
                                    onPublish = { pendingPublish = item },
                                    onAction = { action -> pendingAction = action to item },
                                )
                            }
                        }
                    }
                    if (AdminText.canLoadMore(state.items.size, state.total)) {
                        Box(
                            Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .border(1.dp, colors.outline, RoundedCornerShape(12.dp))
                                .clickable(enabled = !state.loadingMore) { viewModel.loadMore() }
                                .padding(vertical = 12.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(if (state.loadingMore) "جارٍ الجلب…" else "جلب المزيد", color = colors.primaryEnd, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            }

            SectionTitle("نظرة عامة")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                CountTile("المسودات", state.counts?.draft, state.status == AdminArticleStatus.Draft, Modifier.weight(1f)) {
                    viewModel.select(AdminArticleStatus.Draft)
                }
                CountTile("المجدولة", state.counts?.scheduled, state.status == AdminArticleStatus.Scheduled, Modifier.weight(1f)) {
                    viewModel.select(AdminArticleStatus.Scheduled)
                }
            }

            SectionTitle("صندوق الإدارة")
            EditorialSurface(padding = 0.dp) {
                Column(Modifier.padding(horizontal = 16.dp)) {
                    ShortcutRow("رسائل التواصل", "عرض الرسائل الواردة والرد عليها", Icons.Outlined.Email, colors.leaf, onOpenContactMessages)
                    HorizontalDivider(color = colors.outline)
                    ShortcutRow("استفسارات كتّاب الرأي", "متابعة المحادثات مع الكتّاب", Icons.Outlined.Forum, colors.gold, onOpenTickets)
                }
            }
        }
    }

    pendingPublish?.let { item ->
        val schedule = AdminScheduleText.of(item)
        AlertDialog(
            onDismissRequest = { pendingPublish = null },
            title = { Text("تأكيد النشر الآن") },
            text = {
                Text(
                    if (schedule != null && schedule.detail.isNotBlank()) {
                        "سيُنشر المقال فورًا. موعده المعروض: ${schedule.detail}. للجدولة في موعد آخر، افتح تعديل المقال."
                    } else {
                        "سيُنشر المقال فورًا. للجدولة في موعد لاحق، افتح تعديل المقال."
                    },
                )
            },
            confirmButton = { TextButton(onClick = { pendingPublish = null; viewModel.publish(item) }) { Text("نشر الآن") } },
            dismissButton = { TextButton(onClick = { pendingPublish = null }) { Text("إلغاء") } },
        )
    }

    pendingAction?.let { (action, item) ->
        AdminReasonDialog(
            action = action,
            onDismiss = { pendingAction = null },
            onSubmit = { reason -> viewModel.perform(action, item, reason).also { if (it == null) pendingAction = null } },
        )
    }
}

@Composable
private fun QueueSummary(board: EditorialNewsBoard?, onOpen: (String) -> Unit) {
    val colors = SabqTheme.colors
    if (board == null) {
        EditorialSurface(padding = 0.dp) {
            Column(Modifier.padding(horizontal = 16.dp)) {
                ShortcutRow("بانتظار قرارك", "أخبار المراسلين وطلبات التعديل", Icons.Outlined.Inbox, colors.primaryEnd) { onOpen("all") }
            }
        }
        return
    }
    val all = board.counts.all
    val requests = board.counts.editRequests
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(22.dp))
                .background(colors.brandSky.copy(alpha = 0.12f))
                .clickable { onOpen("all") }
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("$all", fontSize = 30.sp, fontWeight = FontWeight.Bold, color = colors.ink)
                    Text("بانتظار قرارك", fontSize = 15.sp, color = colors.secondaryInk, modifier = Modifier.padding(bottom = 4.dp))
                }
                Text(
                    if (all == 0) "لا شيء ينتظر قرارك الآن" else "${all - requests} من المراسلين والبريد، و$requests طلب تعديل",
                    fontSize = 12.sp,
                    color = colors.secondaryInk,
                )
            }
            if (all > 0 && board.oldestAt != null) {
                Column(
                    Modifier.clip(RoundedCornerShape(14.dp)).background(colors.surface.copy(alpha = 0.7f)).padding(horizontal = 12.dp, vertical = 8.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text("أقدمها", fontSize = 11.sp, color = colors.secondaryInk)
                    Text(EditorialText.relative(board.oldestAt), fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = colors.ink)
                }
            }
        }
        if (requests > 0) {
            Text(
                "$requests عليها طلب تعديل",
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                color = colors.gold,
                modifier = Modifier
                    .clip(RoundedCornerShape(10.dp))
                    .background(colors.gold.copy(alpha = 0.12f))
                    .clickable { onOpen("edit_requests") }
                    .padding(horizontal = 12.dp, vertical = 8.dp),
            )
        }
    }
}

@Composable
private fun StatusSegments(selected: AdminArticleStatus, onSelect: (AdminArticleStatus) -> Unit) {
    val colors = SabqTheme.colors
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(colors.paleFill).padding(3.dp),
        horizontalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        AdminArticleStatus.entries.forEach { status ->
            val active = status == selected
            Box(
                Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(10.dp))
                    .background(if (active) colors.brandBlue else colors.paleFill)
                    .clickable { onSelect(status) }
                    .padding(vertical = 9.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    status.label,
                    fontSize = 13.sp,
                    fontWeight = if (active) FontWeight.Bold else FontWeight.Medium,
                    color = if (active) Color.White else colors.secondaryInk,
                    maxLines = 1,
                )
            }
        }
    }
}

@Composable
private fun AdminNewsRow(
    item: AdminNewsItem,
    publishing: Boolean,
    onPublish: () -> Unit,
    onAction: (AdminWorkflowAction) -> Unit,
) {
    val colors = SabqTheme.colors
    var menu by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth().padding(vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                item.state.badge,
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold,
                color = statusTint(item.state),
                modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(statusTint(item.state).copy(alpha = 0.12f)).padding(horizontal = 8.dp, vertical = 2.dp),
            )
            Spacer(Modifier.weight(1f))
            val (label, at) = AdminText.timestamp(item)
            Text("$label ${EditorialText.dayTime(at)}", fontSize = 12.sp, color = colors.tertiaryInk, maxLines = 1)
        }
        Text(item.title, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = colors.ink, maxLines = 2, overflow = TextOverflow.Ellipsis)

        if (item.awaitingRevision) {
            Cue(title = "بانتظار تعديل الكاتب", detail = item.reviewNotes, tint = colors.gold)
        }
        AdminScheduleText.of(item)?.let { s ->
            Cue(title = s.title, detail = s.detail, tint = if (s.overdue) colors.coral else colors.primaryEnd)
        }
        if (item.excerpt.isNotBlank()) {
            Text(item.excerpt, fontSize = 13.sp, color = colors.secondaryInk, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        Text("${item.author.ifBlank { "—" }} · ${item.views} مشاهدة", fontSize = 12.sp, color = colors.secondaryInk)

        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (AdminText.canPublish(item)) {
                Row(
                    Modifier
                        .clip(RoundedCornerShape(10.dp))
                        .background(colors.leaf.copy(alpha = 0.12f))
                        .clickable(enabled = !publishing, onClick = onPublish)
                        .heightIn(min = 40.dp)
                        .padding(horizontal = 16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    if (publishing) CircularProgressIndicator(color = colors.leaf, strokeWidth = 2.dp, modifier = Modifier.size(14.dp))
                    Text(if (publishing) "جارٍ النشر" else "نشر الآن", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = colors.leaf)
                }
            }
            Spacer(Modifier.weight(1f))
            Box {
                Box(
                    Modifier.size(40.dp).clip(CircleShape).clickable { menu = true },
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Filled.MoreVert, contentDescription = "إجراءات", tint = colors.secondaryInk)
                }
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    AdminWorkflowAction.available(item.state).forEach { action ->
                        DropdownMenuItem(
                            text = { Text(action.title, color = if (action.destructive) colors.coral else colors.ink) },
                            onClick = { menu = false; onAction(action) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun Cue(title: String, detail: String?, tint: Color) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(tint.copy(alpha = 0.10f)).padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(title, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = tint)
        if (!detail.isNullOrBlank()) Text(detail, fontSize = 12.sp, color = SabqTheme.colors.ink)
    }
}

@Composable
private fun statusTint(status: AdminArticleStatus): Color = when (status) {
    AdminArticleStatus.Draft -> SabqTheme.colors.gold
    AdminArticleStatus.Scheduled -> SabqTheme.colors.sky
    AdminArticleStatus.Published -> SabqTheme.colors.teal
    AdminArticleStatus.Archived -> SabqTheme.colors.coral
}

@Composable
private fun SectionTitle(title: String) {
    Text(title, fontSize = 17.sp, fontWeight = FontWeight.Bold, color = SabqTheme.colors.ink)
}

@Composable
private fun CountTile(title: String, value: Int?, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val colors = SabqTheme.colors
    Column(
        modifier
            .clip(RoundedCornerShape(14.dp))
            .background(colors.surface)
            .border(if (selected) 1.5.dp else 0.5.dp, if (selected) colors.brandBlue else colors.outline, RoundedCornerShape(14.dp))
            .clickable(onClick = onClick)
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(title, fontSize = 12.sp, color = colors.secondaryInk)
        Text(value?.toString() ?: "—", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = colors.ink)
    }
}

@Composable
internal fun ShortcutRow(title: String, subtitle: String, icon: ImageVector, tint: Color, onClick: () -> Unit) {
    val colors = SabqTheme.colors
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).heightIn(min = 56.dp).padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.size(34.dp).clip(RoundedCornerShape(9.dp)).background(tint.copy(alpha = 0.14f)), contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(18.dp))
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = colors.ink, maxLines = 1)
            Text(subtitle, fontSize = 12.sp, color = colors.secondaryInk, maxLines = 2)
        }
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, contentDescription = null, tint = colors.tertiaryInk)
    }
}

/** نافذة السبب الإلزامي (5 أحرف على الأقل) — مرآة iOS `AdminReasonSheet`. */
@Composable
internal fun AdminReasonDialog(
    action: AdminWorkflowAction,
    onDismiss: () -> Unit,
    onSubmit: suspend (String) -> String?,
) {
    val colors = SabqTheme.colors
    var text by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    val valid = AdminWorkflowAction.isValidReason(text)
    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        title = { Text(action.title) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(action.explanation, fontSize = 13.sp, color = colors.secondaryInk)
                OutlinedTextField(
                    value = text,
                    onValueChange = { text = it },
                    label = { Text(action.fieldLabel) },
                    minLines = 4,
                    modifier = Modifier.fillMaxWidth(),
                )
                Text(
                    "5 أحرف على الأقل",
                    fontSize = 11.sp,
                    color = if (text.isNotBlank() && !valid) colors.coral else colors.tertiaryInk,
                )
                error?.let { Text(it, fontSize = 12.sp, color = colors.coral) }
            }
        },
        confirmButton = {
            TextButton(
                enabled = valid && !busy,
                onClick = {
                    busy = true
                    error = null
                    scope.launch {
                        val failure = onSubmit(text)
                        busy = false
                        error = failure
                    }
                },
            ) {
                Text(if (busy) "جارٍ التنفيذ…" else action.confirmTitle, color = if (action.destructive) colors.coral else colors.brandBlue)
            }
        },
        dismissButton = { TextButton(enabled = !busy, onClick = onDismiss) { Text("إلغاء") } },
    )
}
