package com.sabq.smart.feature.inbox

import androidx.compose.foundation.background
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
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.FindInPage
import androidx.compose.material.icons.outlined.Newspaper
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.SportsSoccer
import androidx.compose.material.icons.outlined.Tag
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
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
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.AuthRepository
import com.sabq.smart.data.EditorialNotificationsRepository
import com.sabq.smart.feature.editorial.EditorialText
import com.sabq.smart.ui.components.EmptyStateView
import com.sabq.smart.ui.components.ErrorStateView
import com.sabq.smart.ui.components.SabqDetailScaffold
import com.sabq.smart.ui.components.SurfaceCard
import com.sabq.smart.ui.theme.SabqTheme
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

@HiltViewModel
class ReaderInboxViewModel @Inject constructor(
    private val api: ReaderInboxApi,
    private val store: ReaderInboxStore,
    private val auth: AuthRepository,
    editorial: EditorialNotificationsRepository,
) : ViewModel() {

    data class UiState(
        val items: List<InboxItem> = emptyList(),
        val hasMore: Boolean = false,
        val loading: Boolean = true,
        val loadingMore: Boolean = false,
        val error: String? = null,
    )

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()
    val unread: StateFlow<Int> = store.unread
    val editorialUnread: StateFlow<Int> = editorial.unreadCount

    /** للكتّاب والمراسلين والمشرفين صفّ أعلى القائمة إلى «إشعاراتي التحريرية». */
    val hasEditorial: StateFlow<Boolean> = auth.user
        .map { u -> u != null && (u.isWriter || u.isReporter || u.isAdminLike) }
        .stateIn(viewModelScope, SharingStarted.Eagerly, false)

    fun load() {
        viewModelScope.launch {
            if (auth.user.value == null) {
                _state.value = UiState(loading = false)
                return@launch
            }
            _state.update { it.copy(loading = it.items.isEmpty()) }
            runCatching { api.page() }
                .onSuccess { page ->
                    store.setUnread(page.unread)
                    _state.value = UiState(items = page.items, hasMore = page.hasMore, loading = false)
                }
                .onFailure {
                    _state.update {
                        it.copy(loading = false, error = if (it.items.isEmpty()) "تعذر تحميل الإشعارات" else null)
                    }
                }
        }
    }

    fun loadMore() {
        val s = _state.value
        if (!s.hasMore || s.loadingMore) return
        _state.update { it.copy(loadingMore = true) }
        viewModelScope.launch {
            val page = runCatching { api.page(offset = s.items.size) }.getOrNull()
            _state.update { cur ->
                if (page == null) return@update cur.copy(loadingMore = false)
                val known = cur.items.map { it.id }.toSet()
                cur.copy(
                    items = cur.items + page.items.filter { it.id !in known },
                    hasMore = page.hasMore,
                    loadingMore = false,
                )
            }
        }
    }

    /** يعلّم الإشعار مقروءًا ويعيد وجهته داخل التطبيق إن عُرفت. */
    fun open(item: InboxItem): ReaderInboxText.Target? {
        if (!item.read) {
            _state.update { s -> s.copy(items = s.items.map { if (it.id == item.id) it.copy(read = true) else it }) }
            store.decrement()
            viewModelScope.launch { runCatching { api.markRead(item.id) } }
        }
        return ReaderInboxText.target(item.deeplink)
    }

    fun delete(item: InboxItem) {
        _state.update { s -> s.copy(items = s.items.filterNot { it.id == item.id }) }
        if (!item.read) store.decrement()
        viewModelScope.launch {
            runCatching { api.delete(item.id) }.onFailure { load() }
        }
    }

    fun markAllRead() {
        val snapshot = _state.value.items
        val previousUnread = store.unread.value
        _state.update { s -> s.copy(items = s.items.map { it.copy(read = true) }) }
        store.setUnread(0)
        viewModelScope.launch {
            runCatching { api.markAllRead() }.onFailure {
                _state.update { it.copy(items = snapshot) }
                store.setUnread(previousUnread)
                load()
            }
        }
    }
}

/**
 * صندوق إشعارات القارئ — نظير iOS `ReaderInboxView`. النقر يعلّم الإشعار
 * مقروءًا ويفتح رابطه، وزر الحذف يزيله. للطاقم صفّ في الأعلى إلى
 * «إشعاراتي التحريرية».
 */
@Composable
fun ReaderInboxScreen(
    onBack: () -> Unit,
    onOpenEditorial: () -> Unit,
    onOpenSettings: () -> Unit,
    onOpenTarget: (ReaderInboxText.Target) -> Unit,
    viewModel: ReaderInboxViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val unread by viewModel.unread.collectAsStateWithLifecycle()
    val editorialUnread by viewModel.editorialUnread.collectAsStateWithLifecycle()
    val hasEditorial by viewModel.hasEditorial.collectAsStateWithLifecycle()
    val colors = SabqTheme.colors

    LaunchedEffect(Unit) { viewModel.load() }

    SabqDetailScaffold(title = "الإشعارات", onBack = onBack) {
        Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            if (hasEditorial) {
                SurfaceCard {
                    Row(
                        Modifier.fillMaxWidth().clickable(onClick = onOpenEditorial).padding(vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        InboxIcon(Icons.Outlined.FindInPage, colors.primaryEnd)
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text("إشعاراتي التحريرية", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = colors.ink)
                            Text("جدولة ونشر ومراجعة محتواك", fontSize = 13.sp, color = colors.secondaryInk)
                        }
                        if (editorialUnread > 0) {
                            Text(
                                "${editorialUnread.coerceAtMost(99)}",
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color.White,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(50))
                                    .background(colors.coral)
                                    .padding(horizontal = 8.dp, vertical = 2.dp),
                            )
                        }
                    }
                }
            }

            // رأس القائمة: العدد، «قراءة الكل»، والإعدادات (كما iOS، لا أزرار في الشريط العلوي).
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                if (unread > 0) {
                    Text(ReaderInboxText.unreadLabel(unread), fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = colors.secondaryInk)
                }
                Spacer(Modifier.weight(1f))
                if (unread > 0) {
                    TextButton(onClick = viewModel::markAllRead, modifier = Modifier.heightIn(min = 44.dp)) {
                        Text("قراءة الكل", color = colors.primaryEnd, fontWeight = FontWeight.SemiBold)
                    }
                }
                TextButton(onClick = onOpenSettings, modifier = Modifier.heightIn(min = 44.dp)) {
                    Icon(Icons.Outlined.Settings, contentDescription = null, tint = colors.primaryEnd, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.size(4.dp))
                    Text("الإعدادات", color = colors.primaryEnd, fontWeight = FontWeight.SemiBold)
                }
            }

            when {
                state.loading && state.items.isEmpty() -> Box(Modifier.fillMaxWidth().padding(top = 48.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = colors.primaryEnd)
                }
                state.items.isEmpty() && state.error != null -> ErrorStateView(
                    message = state.error.orEmpty(),
                    onRetry = viewModel::load,
                    modifier = Modifier.fillMaxWidth().padding(top = 24.dp),
                )
                state.items.isEmpty() -> EmptyStateView(
                    icon = Icons.Outlined.Notifications,
                    tint = colors.secondaryInk,
                    title = "لا إشعارات بعد",
                    subtitle = "تصلك هنا أخبار الكلمات التي تتابعها، والتوصيات المختارة لك، والملخص اليومي إن فعّلته.",
                    modifier = Modifier.fillMaxWidth().padding(top = 24.dp),
                )
                else -> SurfaceCard {
                    Column {
                        state.items.forEachIndexed { index, item ->
                            if (index > 0) HorizontalDivider(color = colors.outline.copy(alpha = 0.5f))
                            InboxRow(
                                item = item,
                                onClick = { viewModel.open(item)?.let(onOpenTarget) },
                                onDelete = { viewModel.delete(item) },
                            )
                            if (index == state.items.lastIndex) {
                                LaunchedEffect(item.id) { viewModel.loadMore() }
                            }
                        }
                    }
                }
            }
            if (state.loadingMore) {
                Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = colors.primaryEnd, modifier = Modifier.size(24.dp))
                }
            }
        }
    }
}

@Composable
private fun InboxRow(item: InboxItem, onClick: () -> Unit, onDelete: () -> Unit) {
    val colors = SabqTheme.colors
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 12.dp),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        InboxIcon(iconFor(item.type), if (item.read) colors.tertiaryInk else colors.primaryEnd)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    item.title,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = colors.ink,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                if (!item.read) {
                    Box(Modifier.size(8.dp).clip(CircleShape).background(colors.primaryEnd))
                }
            }
            Text(
                item.body,
                fontSize = 14.sp,
                color = if (item.read) colors.secondaryInk else colors.ink,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
            )
            Text(relative(item.createdAt), fontSize = 12.sp, color = colors.tertiaryInk)
        }
        IconButton(onClick = onDelete, modifier = Modifier.size(36.dp)) {
            Icon(Icons.Outlined.Delete, contentDescription = "حذف", tint = colors.tertiaryInk, modifier = Modifier.size(18.dp))
        }
    }
}

@Composable
internal fun InboxIcon(icon: ImageVector, tint: Color) {
    Box(
        Modifier.size(36.dp).clip(RoundedCornerShape(10.dp)).background(SabqTheme.colors.paleFill),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(18.dp))
    }
}

private fun iconFor(type: String): ImageVector = when (ReaderInboxText.kind(type)) {
    ReaderInboxText.Kind.Keyword -> Icons.Outlined.Tag
    ReaderInboxText.Kind.Recommendation -> Icons.Outlined.AutoAwesome
    ReaderInboxText.Kind.Digest -> Icons.Outlined.Newspaper
    ReaderInboxText.Kind.Sports -> Icons.Outlined.SportsSoccer
    ReaderInboxText.Kind.Comment -> Icons.Outlined.ChatBubbleOutline
    ReaderInboxText.Kind.Other -> Icons.Outlined.Notifications
}

/** فرق ساعة الجهاز عن الخادم قد يجعل الإشعار «في المستقبل» → «الآن». */
private fun relative(raw: String): String {
    val date = EditorialText.parse(raw) ?: return ""
    val now = java.time.Instant.now()
    return if (date.isAfter(now)) "الآن" else EditorialText.relative(date, now)
}
