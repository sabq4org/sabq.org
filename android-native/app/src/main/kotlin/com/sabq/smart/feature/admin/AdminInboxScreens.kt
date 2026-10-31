package com.sabq.smart.feature.admin

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.sabq.smart.feature.editorial.EditorialError
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
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * صندوق الإدارة — مرآة iOS `AdminInboxViews`: رسائل نموذج التواصل والرد عليها
 * بالبريد، واستفسارات كتّاب الرأي ومحادثاتها. تبقى الحالة على الخادم، ولا
 * يُخزَّن شيء على الجهاز.
 */

// ── قائمة مشتركة بصفحات ───────────────────────────────────────────────

data class AdminInboxListState<T>(
    val items: List<T> = emptyList(),
    val total: Int = 0,
    val page: Int = 1,
    val totalPages: Int = 1,
    val status: String? = null,
    val search: String = "",
    val loading: Boolean = true,
    val loadingMore: Boolean = false,
    val error: EditorialError? = null,
    val notice: String? = null,
) {
    val canLoadMore: Boolean get() = page < totalPages
}

/** صفحة واحدة من الخادم: العناصر، والإجمالي، وعدد الصفحات. */
data class AdminInboxPage<T>(val items: List<T>, val total: Int, val totalPages: Int)

abstract class AdminInboxListViewModel<T>(private val idOf: (T) -> String) : ViewModel() {
    private val _state = MutableStateFlow(AdminInboxListState<T>())
    val state: StateFlow<AdminInboxListState<T>> = _state.asStateFlow()
    private var job: Job? = null
    private var moreJob: Job? = null

    protected abstract suspend fun fetch(page: Int, status: String?, search: String?): AdminInboxPage<T>

    fun load(debounce: Boolean = false) {
        job?.cancel()
        moreJob?.cancel()
        _state.update { it.copy(loading = true, loadingMore = false, error = null) }
        val s = _state.value
        job = viewModelScope.launch {
            if (debounce) delay(350)
            editorialCall { fetch(1, s.status, s.search.trim().ifBlank { null }) }
                .onSuccess { p ->
                    _state.update { it.copy(items = p.items, total = p.total, page = 1, totalPages = p.totalPages, loading = false) }
                }
                .onFailure { e -> _state.update { it.copy(loading = false, error = e.editorialError()) } }
        }
    }

    fun selectStatus(status: String?) {
        if (status == _state.value.status) return
        _state.update { it.copy(status = status, items = emptyList()) }
        load()
    }

    fun search(text: String) {
        _state.update { it.copy(search = text) }
        load(debounce = true)
    }

    fun loadMore() {
        val s = _state.value
        if (s.loading || s.loadingMore || !s.canLoadMore) return
        _state.update { it.copy(loadingMore = true) }
        moreJob = viewModelScope.launch {
            val next = s.page + 1
            editorialCall { fetch(next, s.status, s.search.trim().ifBlank { null }) }
                .onSuccess { p ->
                    _state.update { cur ->
                        val known = cur.items.map(idOf).toSet()
                        cur.copy(
                            items = cur.items + p.items.filter { idOf(it) !in known },
                            total = p.total,
                            page = next,
                            totalPages = p.totalPages,
                            loadingMore = false,
                        )
                    }
                }
                .onFailure { _state.update { it.copy(loadingMore = false, notice = "تعذّر جلب المزيد") } }
        }
    }

    fun clearNotice() = _state.update { it.copy(notice = null) }
}

@HiltViewModel
class AdminContactMessagesViewModel @Inject constructor(private val api: AdminApi) :
    AdminInboxListViewModel<AdminContactMessage>({ it.id }) {
    override suspend fun fetch(page: Int, status: String?, search: String?): AdminInboxPage<AdminContactMessage> {
        val r = api.contactMessages(page = page, status = status, search = search)
        return AdminInboxPage(r.messages, r.total, r.totalPages)
    }
}

@HiltViewModel
class AdminTicketsViewModel @Inject constructor(private val api: AdminApi) :
    AdminInboxListViewModel<AdminTicket>({ it.id }) {
    override suspend fun fetch(page: Int, status: String?, search: String?): AdminInboxPage<AdminTicket> {
        val r = api.tickets(page = page, status = status, search = search)
        return AdminInboxPage(r.tickets, r.total, r.totalPages)
    }
}

// ── رسائل التواصل ─────────────────────────────────────────────────────

@Composable
fun AdminContactMessagesScreen(
    onBack: () -> Unit,
    onOpen: (String) -> Unit,
    viewModel: AdminContactMessagesViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LifecycleResumeEffect(viewModel) {
        viewModel.load()
        onPauseOrDispose { }
    }
    val colors = SabqTheme.colors
    AdminInboxList(
        title = "رسائل التواصل",
        searchPrompt = "ابحث بالاسم أو البريد أو الموضوع",
        allLabel = "كل الرسائل",
        statuses = AdminContactStatus.entries.map { it.wire to it.label },
        countLabel = "${state.total} رسالة",
        emptyTitle = "لا توجد رسائل",
        emptyDetail = "ستظهر هنا رسائل نموذج التواصل الواردة.",
        state = state,
        onBack = onBack,
        onStatus = viewModel::selectStatus,
        onSearch = viewModel::search,
        onRetry = { viewModel.load() },
        onMore = viewModel::loadMore,
        onNotice = viewModel::clearNotice,
    ) { message ->
        Column(
            Modifier.fillMaxWidth().clickable { onOpen(message.id) }.padding(vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    message.name.ifBlank { message.email },
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = colors.ink,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                StatusChip(message.state.label, contactTint(message.state))
            }
            Text(message.subject, fontSize = 14.sp, color = colors.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(message.message, fontSize = 13.sp, color = colors.secondaryInk, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(EditorialText.relative(message.createdAt), fontSize = 11.sp, color = colors.tertiaryInk)
        }
    }
}

data class AdminContactDetailState(
    val detail: AdminContactDetail? = null,
    val loading: Boolean = true,
    val error: EditorialError? = null,
    val sending: Boolean = false,
    val notice: String? = null,
)

@HiltViewModel
class AdminContactMessageViewModel @Inject constructor(
    private val api: AdminApi,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {
    private val id: String = savedStateHandle.get<String>("id").orEmpty()
    private val _state = MutableStateFlow(AdminContactDetailState())
    val state: StateFlow<AdminContactDetailState> = _state.asStateFlow()

    fun load() {
        _state.update { it.copy(loading = it.detail == null, error = null) }
        viewModelScope.launch {
            editorialCall { api.contactMessage(id) }
                .onSuccess { d -> _state.update { it.copy(detail = d, loading = false) } }
                .onFailure { e -> _state.update { it.copy(loading = false, error = e.editorialError()) } }
        }
    }

    fun setStatus(status: AdminContactStatus) {
        viewModelScope.launch {
            editorialCall { api.updateContactMessage(id, AdminStatusBody(status.wire)) }
                .onSuccess {
                    _state.update { s -> s.copy(detail = s.detail?.let { d -> d.copy(message = d.message.copy(status = status.wire)) }) }
                }
                .onFailure { e -> _state.update { it.copy(notice = e.editorialError().message) } }
        }
    }

    /** يعيد true عند النجاح ليُفرَّغ الحقل. */
    suspend fun reply(text: String): Boolean {
        _state.update { it.copy(sending = true, notice = null) }
        val result = editorialCall { api.replyContactMessage(id, AdminContactReplyBody(text.trim())) }
        _state.update { it.copy(sending = false, notice = if (result.isSuccess) "تم إرسال الرد" else "تعذّر إرسال الرد. تحقق من اتصال البريد وحاول مجدداً.") }
        if (result.isSuccess) load()
        return result.isSuccess
    }
}

@Composable
fun AdminContactMessageScreen(onBack: () -> Unit, viewModel: AdminContactMessageViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(viewModel) { viewModel.load() }
    val colors = SabqTheme.colors
    var reply by remember { mutableStateOf("") }
    val scope = androidx.compose.runtime.rememberCoroutineScope()

    SabqDetailScaffold(
        title = "تفاصيل الرسالة",
        onBack = onBack,
        trailing = {
            state.detail?.let { d ->
                StatusMenu(
                    options = AdminContactStatus.entries.map { it.label to (it == d.message.state) },
                    onPick = { index -> viewModel.setStatus(AdminContactStatus.entries[index]) },
                )
            }
        },
    ) {
        Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            val detail = state.detail
            when {
                detail == null && state.loading -> Loading()
                detail == null -> EditorialStatusView(state.error, loading = false, onRetry = viewModel::load)
                else -> {
                    val m = detail.message
                    EditorialSurface {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(m.subject, fontSize = 17.sp, fontWeight = FontWeight.Bold, color = colors.ink, modifier = Modifier.weight(1f))
                                StatusChip(m.state.label, contactTint(m.state))
                            }
                            Text(m.name, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = colors.ink)
                            if (m.email.isNotBlank()) Text(m.email, fontSize = 13.sp, color = colors.secondaryInk)
                            if (m.phone.isNotBlank()) Text(m.phone, fontSize = 13.sp, color = colors.secondaryInk)
                            Text(EditorialText.dayTime(m.createdAt), fontSize = 12.sp, color = colors.tertiaryInk)
                            HorizontalDivider(color = colors.outline)
                            Text(m.message, fontSize = 15.sp, color = colors.ink, lineHeight = 24.sp)
                        }
                    }

                    if (detail.replies.isNotEmpty()) {
                        Text("سجل الردود", fontSize = 17.sp, fontWeight = FontWeight.Bold, color = colors.ink)
                        detail.replies.forEach { r ->
                            EditorialSurface {
                                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Row {
                                        Text(r.responderName?.takeIf { it.isNotBlank() } ?: "الإدارة", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = colors.brandBlue, modifier = Modifier.weight(1f))
                                        Text(EditorialText.dayTime(r.createdAt), fontSize = 11.sp, color = colors.tertiaryInk)
                                    }
                                    Text(r.replyText, fontSize = 14.sp, color = colors.ink, lineHeight = 22.sp)
                                }
                            }
                        }
                    }

                    Text("إرسال رد بالبريد", fontSize = 17.sp, fontWeight = FontWeight.Bold, color = colors.ink)
                    Text("سيصل الرد إلى البريد المسجّل أعلاه ويُحفظ في سجل المحادثة.", fontSize = 12.sp, color = colors.secondaryInk)
                    ReplyEditor(
                        value = reply,
                        onValue = { reply = it },
                        placeholder = "اكتب ردك هنا…",
                        button = "إرسال الرد",
                        sending = state.sending,
                        onSend = { scope.launch { if (viewModel.reply(reply)) reply = "" } },
                    )
                    state.notice?.let { Text(it, fontSize = 13.sp, color = colors.secondaryInk) }
                }
            }
        }
    }
}

// ── استفسارات كتّاب الرأي ────────────────────────────────────────────

@Composable
fun AdminTicketsScreen(
    onBack: () -> Unit,
    onOpen: (String) -> Unit,
    viewModel: AdminTicketsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LifecycleResumeEffect(viewModel) {
        viewModel.load()
        onPauseOrDispose { }
    }
    val colors = SabqTheme.colors
    AdminInboxList(
        title = "استفسارات كتّاب الرأي",
        searchPrompt = "ابحث بالعنوان أو الكاتب",
        allLabel = "كل الاستفسارات",
        statuses = AdminTicketStatus.entries.map { it.wire to it.label },
        countLabel = "${state.total} استفسار",
        emptyTitle = "لا توجد استفسارات",
        emptyDetail = "ستظهر هنا مراسلات كتّاب الرأي مع هيئة التحرير.",
        state = state,
        onBack = onBack,
        onStatus = viewModel::selectStatus,
        onSearch = viewModel::search,
        onRetry = { viewModel.load() },
        onMore = viewModel::loadMore,
        onNotice = viewModel::clearNotice,
    ) { ticket ->
        Column(
            Modifier.fillMaxWidth().clickable { onOpen(ticket.id) }.padding(vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    ticket.title,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = colors.ink,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                if (ticket.hasUnread) StatusChip("جديد", colors.coral)
                StatusChip(ticket.state.label, ticketTint(ticket.state))
            }
            Text(ticket.writerLabel, fontSize = 13.sp, color = colors.secondaryInk, maxLines = 1)
            Text(EditorialText.relative(ticket.lastMessageAt ?: ticket.createdAt), fontSize = 11.sp, color = colors.tertiaryInk)
        }
    }
}

data class AdminTicketDetailState(
    val detail: AdminTicketDetail? = null,
    val loading: Boolean = true,
    val error: EditorialError? = null,
    val sending: Boolean = false,
    val replyTo: AdminTicketMessage? = null,
    val notice: String? = null,
)

@HiltViewModel
class AdminTicketViewModel @Inject constructor(
    private val api: AdminApi,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {
    private val id: String = savedStateHandle.get<String>("id").orEmpty()
    private val _state = MutableStateFlow(AdminTicketDetailState())
    val state: StateFlow<AdminTicketDetailState> = _state.asStateFlow()

    fun load() {
        _state.update { it.copy(loading = it.detail == null, error = null) }
        viewModelScope.launch {
            editorialCall { api.ticket(id) }
                .onSuccess { d -> _state.update { it.copy(detail = d, loading = false) } }
                .onFailure { e -> _state.update { it.copy(loading = false, error = e.editorialError()) } }
        }
    }

    fun setStatus(status: AdminTicketStatus) {
        viewModelScope.launch {
            editorialCall { api.updateTicket(id, AdminStatusBody(status.wire)) }
                .onSuccess {
                    _state.update { s -> s.copy(detail = s.detail?.let { d -> d.copy(ticket = d.ticket.copy(status = status.wire)) }) }
                }
                .onFailure { e -> _state.update { it.copy(notice = e.editorialError().message) } }
        }
    }

    fun replyTo(message: AdminTicketMessage?) = _state.update { it.copy(replyTo = message) }

    suspend fun reply(text: String): Boolean {
        val parent = _state.value.replyTo?.id
        _state.update { it.copy(sending = true, notice = null) }
        val result = editorialCall { api.replyTicket(id, AdminTicketReplyBody(text.trim(), parent)) }
        _state.update {
            it.copy(
                sending = false,
                replyTo = if (result.isSuccess) null else it.replyTo,
                notice = result.exceptionOrNull()?.editorialError()?.message,
            )
        }
        if (result.isSuccess) load()
        return result.isSuccess
    }
}

@Composable
fun AdminTicketScreen(onBack: () -> Unit, viewModel: AdminTicketViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(viewModel) { viewModel.load() }
    val colors = SabqTheme.colors
    var reply by remember { mutableStateOf("") }
    val scope = androidx.compose.runtime.rememberCoroutineScope()

    SabqDetailScaffold(
        title = "محادثة الرأي",
        onBack = onBack,
        trailing = {
            state.detail?.let { d ->
                StatusMenu(
                    options = AdminTicketStatus.entries.map { it.label to (it == d.ticket.state) },
                    onPick = { index -> viewModel.setStatus(AdminTicketStatus.entries[index]) },
                )
            }
        },
    ) {
        Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            val detail = state.detail
            when {
                detail == null && state.loading -> Loading()
                detail == null -> EditorialStatusView(state.error, loading = false, onRetry = viewModel::load)
                else -> {
                    val t = detail.ticket
                    EditorialSurface {
                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(t.title, fontSize = 17.sp, fontWeight = FontWeight.Bold, color = colors.ink, modifier = Modifier.weight(1f))
                                StatusChip(t.state.label, ticketTint(t.state))
                            }
                            Text(t.writerLabel, fontSize = 13.sp, color = colors.secondaryInk)
                            Text("فُتح في ${EditorialText.dayTime(t.createdAt)}", fontSize = 12.sp, color = colors.tertiaryInk)
                        }
                    }

                    val byId = detail.messages.associateBy { it.id }
                    detail.messages.forEach { m ->
                        TicketBubble(
                            message = m,
                            parent = m.parentMessageId?.let { byId[it] },
                            writer = t.writerLabel,
                            canReply = t.state != AdminTicketStatus.Closed,
                            onReply = { viewModel.replyTo(m) },
                        )
                    }

                    if (t.state == AdminTicketStatus.Closed) {
                        EditorialSurface {
                            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text("الاستفسار مغلق", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = colors.ink)
                                Text("أعد فتحه من قائمة الحالة لإضافة رد جديد.", fontSize = 13.sp, color = colors.secondaryInk)
                            }
                        }
                    } else {
                        Text("إضافة رد", fontSize = 17.sp, fontWeight = FontWeight.Bold, color = colors.ink)
                        state.replyTo?.let { target ->
                            Row(
                                Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(colors.paleFill).padding(10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(
                                    "رد على: ${target.message}",
                                    fontSize = 12.sp,
                                    color = colors.secondaryInk,
                                    maxLines = 2,
                                    overflow = TextOverflow.Ellipsis,
                                    modifier = Modifier.weight(1f),
                                )
                                Text(
                                    "إلغاء",
                                    fontSize = 12.sp,
                                    color = colors.brandBlue,
                                    modifier = Modifier.clickable { viewModel.replyTo(null) }.padding(start = 8.dp),
                                )
                            }
                        }
                        ReplyEditor(
                            value = reply,
                            onValue = { reply = it },
                            placeholder = "اكتب ردك للكاتب هنا…",
                            button = "إرسال الرد",
                            sending = state.sending,
                            onSend = { scope.launch { if (viewModel.reply(reply)) reply = "" } },
                        )
                    }
                    state.notice?.let { Text(it, fontSize = 13.sp, color = colors.coral) }
                }
            }
        }
    }
}

@Composable
private fun TicketBubble(
    message: AdminTicketMessage,
    parent: AdminTicketMessage?,
    writer: String,
    canReply: Boolean,
    onReply: () -> Unit,
) {
    val colors = SabqTheme.colors
    val admin = message.isFromAdmin
    val tint = if (admin) colors.brandBlue else colors.gold
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(tint.copy(alpha = 0.08f))
            .border(0.5.dp, tint.copy(alpha = 0.25f), RoundedCornerShape(14.dp))
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                message.senderName?.takeIf { it.isNotBlank() } ?: if (admin) "الإدارة" else writer,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                color = tint,
                modifier = Modifier.weight(1f),
            )
            Text(EditorialText.dayTime(message.createdAt), fontSize = 11.sp, color = colors.tertiaryInk)
        }
        parent?.let {
            Text(
                "رد على: ${it.message}",
                fontSize = 12.sp,
                color = colors.secondaryInk,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(colors.surface).padding(8.dp),
            )
        }
        Text(message.message, fontSize = 14.sp, color = colors.ink, lineHeight = 22.sp)
        if (canReply) {
            Text(
                "رد على هذه الرسالة",
                fontSize = 12.sp,
                color = colors.brandBlue,
                modifier = Modifier.clickable(onClick = onReply).padding(vertical = 2.dp),
            )
        }
    }
}

// ── مكوّنات مشتركة ───────────────────────────────────────────────────

@Composable
private fun <T> AdminInboxList(
    title: String,
    searchPrompt: String,
    allLabel: String,
    statuses: List<Pair<String, String>>,
    countLabel: String,
    emptyTitle: String,
    emptyDetail: String,
    state: AdminInboxListState<T>,
    onBack: () -> Unit,
    onStatus: (String?) -> Unit,
    onSearch: (String) -> Unit,
    onRetry: () -> Unit,
    onMore: () -> Unit,
    onNotice: () -> Unit,
    row: @Composable (T) -> Unit,
) {
    val colors = SabqTheme.colors
    SabqDetailScaffold(title = title, onBack = onBack) {
        Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            OutlinedTextField(
                value = state.search,
                onValueChange = onSearch,
                placeholder = { Text(searchPrompt, fontSize = 14.sp) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(allLabel, state.status == null) { onStatus(null) }
                statuses.forEach { (wire, label) -> FilterChip(label, state.status == wire) { onStatus(wire) } }
            }
            state.notice?.let {
                Text(
                    it,
                    fontSize = 13.sp,
                    color = colors.ink,
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(colors.paleFill).clickable(onClick = onNotice).padding(12.dp),
                )
            }
            when {
                state.loading && state.items.isEmpty() -> Loading()
                state.error != null && state.items.isEmpty() -> EditorialStatusView(state.error, loading = false, onRetry = onRetry)
                state.items.isEmpty() -> Column(
                    Modifier.fillMaxWidth().padding(vertical = 40.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text(emptyTitle, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = colors.ink)
                    Text(emptyDetail, fontSize = 13.sp, color = colors.secondaryInk)
                }
                else -> {
                    Text(countLabel, fontSize = 12.sp, color = colors.secondaryInk)
                    EditorialSurface(padding = 0.dp) {
                        Column(Modifier.padding(horizontal = 16.dp)) {
                            state.items.forEachIndexed { index, item ->
                                if (index > 0) HorizontalDivider(color = colors.outline)
                                row(item)
                            }
                        }
                    }
                    if (state.canLoadMore) {
                        Box(
                            Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .border(1.dp, colors.outline, RoundedCornerShape(12.dp))
                                .clickable(enabled = !state.loadingMore, onClick = onMore)
                                .padding(vertical = 12.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(if (state.loadingMore) "جارٍ الجلب…" else "عرض المزيد", color = colors.primaryEnd, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun FilterChip(label: String, selected: Boolean, onClick: () -> Unit) {
    val colors = SabqTheme.colors
    Text(
        label,
        fontSize = 13.sp,
        fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
        color = if (selected) colors.brandBlue else colors.secondaryInk,
        modifier = Modifier
            .clip(RoundedCornerShape(50))
            .background(if (selected) colors.brandBlue.copy(alpha = 0.12f) else colors.surface)
            .border(0.5.dp, if (selected) colors.brandBlue else colors.outline, RoundedCornerShape(50))
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 7.dp),
    )
}

@Composable
private fun StatusChip(label: String, tint: Color) {
    Text(
        label,
        fontSize = 11.sp,
        fontWeight = FontWeight.SemiBold,
        color = tint,
        maxLines = 1,
        modifier = Modifier.clip(RoundedCornerShape(50)).background(tint.copy(alpha = 0.12f)).padding(horizontal = 8.dp, vertical = 3.dp),
    )
}

@Composable
private fun StatusMenu(options: List<Pair<String, Boolean>>, onPick: (Int) -> Unit) {
    val colors = SabqTheme.colors
    var open by remember { mutableStateOf(false) }
    Box(
        Modifier.size(40.dp).clip(CircleShape).background(colors.surface).clickable { open = true },
        contentAlignment = Alignment.Center,
    ) {
        Icon(Icons.Filled.MoreVert, contentDescription = "تغيير الحالة", tint = colors.ink)
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            Text("تغيير الحالة", fontSize = 12.sp, color = colors.tertiaryInk, modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp))
            options.forEachIndexed { index, (label, current) ->
                DropdownMenuItem(
                    text = { Text(if (current) "✓ $label" else label, color = colors.ink) },
                    enabled = !current,
                    onClick = { open = false; onPick(index) },
                )
            }
        }
    }
}

@Composable
private fun ReplyEditor(
    value: String,
    onValue: (String) -> Unit,
    placeholder: String,
    button: String,
    sending: Boolean,
    onSend: () -> Unit,
) {
    val colors = SabqTheme.colors
    val enabled = value.isNotBlank() && !sending
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        OutlinedTextField(
            value = value,
            onValueChange = onValue,
            placeholder = { Text(placeholder, fontSize = 14.sp) },
            minLines = 4,
            modifier = Modifier.fillMaxWidth(),
        )
        Box(
            Modifier
                .fillMaxWidth()
                .heightIn(min = 46.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(if (enabled) colors.brandBlue else colors.paleFill)
                .clickable(enabled = enabled, onClick = onSend),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                if (sending) "جارٍ الإرسال…" else button,
                color = if (enabled) Color.White else colors.tertiaryInk,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

@Composable
private fun Loading() {
    Box(Modifier.fillMaxWidth().heightIn(min = 200.dp), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = SabqTheme.colors.primaryEnd)
    }
}

@Composable
private fun contactTint(status: AdminContactStatus): Color = when (status) {
    AdminContactStatus.Pending -> SabqTheme.colors.gold
    AdminContactStatus.Read -> SabqTheme.colors.sky
    AdminContactStatus.Replied -> SabqTheme.colors.teal
}

@Composable
private fun ticketTint(status: AdminTicketStatus): Color = when (status) {
    AdminTicketStatus.Open -> SabqTheme.colors.gold
    AdminTicketStatus.Answered -> SabqTheme.colors.teal
    AdminTicketStatus.Closed -> SabqTheme.colors.tertiaryInk
}
