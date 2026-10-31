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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckBox
import androidx.compose.material.icons.filled.CheckBoxOutlineBlank
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.sabq.smart.ui.components.SabqDetailScaffold
import com.sabq.smart.ui.theme.SabqTheme
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * مراجعة طلب تعديل من المراسل — مرآة iOS `EditRequestReviewView`: كل حقل بقبله
 * وبعده، واختيار ما يُطبَّق، وإعادة توليد الموجز والسيو، أو الرفض مع سبب.
 * سطر «تحديث:» لا يُعرض: أُخفي عن القارئ منذ #2054.
 */
@HiltViewModel
class EditRequestReviewViewModel @Inject constructor(
    private val api: EditorialApi,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {
    private val id: String = savedStateHandle.get<String>("id").orEmpty()

    data class UiState(
        val review: EditRequestReview? = null,
        val error: EditorialError? = null,
        val selected: Set<EditRequestField> = emptySet(),
        val regenerate: Boolean = true,
        val busy: Boolean = false,
        val actionError: String? = null,
        val doneMessage: String? = null,
    )

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        _state.update { it.copy(error = null) }
        viewModelScope.launch {
            editorialCall { api.editRequestReview(id) }
                .onSuccess { r -> _state.update { it.copy(review = r, selected = r.knownFields.toSet(), error = null) } }
                .onFailure { e -> _state.update { it.copy(error = e.editorialError()) } }
        }
    }

    fun toggle(field: EditRequestField) = _state.update { s ->
        if (s.review?.request?.isPending != true) s
        else s.copy(selected = if (field in s.selected) s.selected - field else s.selected + field)
    }

    fun setRegenerate(v: Boolean) = _state.update { it.copy(regenerate = v) }

    fun approve() {
        val s = _state.value
        val review = s.review ?: return
        if (s.busy) return
        val fields = review.knownFields
        val all = s.selected.size == fields.size
        val ordered = fields.filter { it in s.selected }.map { it.wire }
        _state.update { it.copy(busy = true, actionError = null) }
        viewModelScope.launch {
            editorialCall { api.approveEditRequest(id, ApproveBody(fields = if (all) null else ordered, regenerate = s.regenerate)) }
                .onSuccess { r ->
                    val msg = if (r.regenerating == true) "طُبّق التعديل، والموجز والسيو قيد التوليد" else "طُبّق التعديل"
                    _state.update { it.copy(busy = false, doneMessage = msg) }
                }
                .onFailure { e -> _state.update { it.copy(busy = false, actionError = e.editorialError().message) } }
        }
    }

    fun reject(reason: String) {
        if (_state.value.busy) return
        _state.update { it.copy(busy = true, actionError = null) }
        viewModelScope.launch {
            editorialCall { api.rejectEditRequest(id, ReasonBody(reason.trim())) }
                .onSuccess { _state.update { it.copy(busy = false, doneMessage = "رُفض الطلب وأُبلغ المراسل") } }
                .onFailure { e -> _state.update { it.copy(busy = false, actionError = e.editorialError().message) } }
        }
    }
}

@Composable
fun EditRequestReviewScreen(
    onBack: () -> Unit,
    viewModel: EditRequestReviewViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var showReject by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxSize().background(SabqTheme.colors.background)) {
        Box(Modifier.weight(1f)) {
            SabqDetailScaffold(title = "طلب تعديل", onBack = onBack) {
                Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    val review = state.review
                    if (review == null) {
                        EditorialStatusView(state.error, loading = state.error == null, onRetry = viewModel::load)
                    } else {
                        ReviewContent(review, state, viewModel)
                    }
                }
            }
        }
        val review = state.review
        if (review != null) {
            EditorialBottomBar {
                when {
                    state.doneMessage != null -> EditorialDoneLine(state.doneMessage!!)
                    review.request.isPending -> {
                        state.actionError?.let {
                            Text(it, modifier = Modifier.fillMaxWidth(), style = SabqTheme.typography.meta.copy(color = SabqTheme.colors.coral))
                        }
                        val total = review.knownFields.size
                        EditorialActionButton(
                            EditRequestReview.approveTitle(state.selected.size, total),
                            busy = state.busy,
                            enabled = state.selected.isNotEmpty() || total == 0,
                            onClick = viewModel::approve,
                        )
                        EditorialActionButton(
                            "ارفض مع سبب",
                            modifier = Modifier.navigationBarsPadding(),
                            style = EditorialButtonStyle.Secondary,
                            enabled = !state.busy,
                        ) { showReject = true }
                    }
                    else -> Text(
                        if (review.request.status == "approved") "اعتُمد هذا الطلب" else "أُغلق هذا الطلب",
                        modifier = Modifier.navigationBarsPadding().heightIn(min = 50.dp).padding(top = 14.dp),
                        style = SabqTheme.typography.meta.copy(color = SabqTheme.colors.secondaryInk),
                    )
                }
            }
        }
    }

    if (showReject) {
        var reason by rememberSaveable { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showReject = false },
            title = { Text("رفض الطلب") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("السبب يصل للمراسل مع الإشعار.", style = SabqTheme.typography.meta.copy(color = SabqTheme.colors.secondaryInk))
                    OutlinedTextField(
                        value = reason,
                        onValueChange = { reason = it },
                        placeholder = { Text("سبب الرفض") },
                        minLines = 3,
                        maxLines = 8,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            },
            confirmButton = {
                TextButton(enabled = reason.trim().length >= 3, onClick = { showReject = false; viewModel.reject(reason) }) {
                    Text("ارفض الطلب", color = SabqTheme.colors.coral)
                }
            },
            dismissButton = { TextButton(onClick = { showReject = false }) { Text("إلغاء") } },
        )
    }
}

@Composable
private fun ReviewContent(review: EditRequestReview, state: EditRequestReviewViewModel.UiState, viewModel: EditRequestReviewViewModel) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            listOf(
                review.request.requesterName,
                EditorialText.relative(review.request.createdAt),
                if (review.article.status == "published") "على خبر منشور" else "على مسودة",
            ).filter { it.isNotBlank() }.joinToString(" · "),
            style = SabqTheme.typography.meta.copy(color = SabqTheme.colors.secondaryInk),
        )
        Text(review.article.title, style = SabqTheme.typography.sectionHeader.copy(color = SabqTheme.colors.ink))
        review.request.note?.takeIf { it.isNotBlank() }?.let {
            Text(
                "«$it»",
                style = SabqTheme.typography.excerpt.copy(color = SabqTheme.colors.ink),
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(SabqTheme.colors.softFill).padding(12.dp),
            )
        }
        if (review.request.urgent) {
            Text("عاجل", style = SabqTheme.typography.metaSmall.copy(fontWeight = FontWeight.Bold, color = SabqTheme.colors.coral))
        }
    }

    val fields = review.knownFields
    if (fields.isNotEmpty()) {
        EditorialSurface(padding = 0.dp) {
            Column(Modifier.padding(horizontal = 16.dp)) {
                fields.forEachIndexed { index, field ->
                    if (index > 0) HorizontalDivider(color = SabqTheme.colors.outline, thickness = 0.5.dp)
                    FieldRow(field, review, field in state.selected) { viewModel.toggle(field) }
                }
            }
        }
    }

    if (review.request.isPending && fields.isNotEmpty()) {
        EditorialSurface(padding = 0.dp) {
            Row(
                Modifier.fillMaxWidth().heightIn(min = 48.dp).padding(horizontal = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "أعد توليد الموجز والسيو",
                    modifier = Modifier.weight(1f),
                    style = SabqTheme.typography.cardTitle.copy(color = SabqTheme.colors.ink),
                )
                Switch(
                    checked = state.regenerate,
                    onCheckedChange = viewModel::setRegenerate,
                    colors = SwitchDefaults.colors(checkedTrackColor = SabqTheme.colors.brandBlue),
                )
            }
        }
    }

    if (review.hasMissingParagraphs) {
        Text(
            "بعض الفقرات تغيّرت في الخبر منذ الطلب، ولن تُطبَّق إلا من محرر الويب.",
            style = SabqTheme.typography.meta.copy(color = EditorialWarning),
        )
    }
}

@Composable
private fun FieldRow(field: EditRequestField, review: EditRequestReview, selected: Boolean, onToggle: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(enabled = review.request.isPending, onClick = onToggle).padding(vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(
            if (selected) Icons.Filled.CheckBox else Icons.Filled.CheckBoxOutlineBlank,
            contentDescription = null,
            tint = if (selected) SabqTheme.colors.brandBlue else SabqTheme.colors.outline,
            modifier = Modifier.size(22.dp),
        )
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(field.title, style = SabqTheme.typography.meta.copy(fontWeight = FontWeight.SemiBold, color = SabqTheme.colors.secondaryInk))
            FieldBody(field, review)
        }
    }
}

@Composable
private fun FieldBody(field: EditRequestField, review: EditRequestReview) {
    val proposed = review.request.proposed
    when (field) {
        EditRequestField.Title -> BeforeAfter(review.article.title, proposed.title)
        EditRequestField.Subtitle -> BeforeAfter(review.article.subtitle, proposed.subtitle)
        EditRequestField.Content -> {
            review.contentEdits.forEach { edit ->
                BeforeAfter(edit.before, edit.after.ifEmpty { "(حذف الفقرة)" })
                if (!edit.found) {
                    Text("الفقرة لم تعد موجودة في الخبر", style = SabqTheme.typography.metaSmall.copy(color = EditorialWarning))
                }
            }
            proposed.appendParagraph?.takeIf { it.isNotBlank() }?.let {
                Text("فقرة جديدة: $it", style = SabqTheme.typography.excerpt.copy(color = EditorialSuccess))
            }
        }
        EditRequestField.ImageUrl -> Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            EditorialThumbnail(EditorialText.https(review.article.imageUrl), 56.dp, dimmed = true)
            Icon(Icons.AutoMirrored.Filled.ArrowBack, null, tint = SabqTheme.colors.tertiaryInk)
            EditorialThumbnail(EditorialText.https(proposed.imageUrl), 56.dp)
        }
        EditRequestField.AlbumImages -> Row(
            Modifier.horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            proposed.albumAdd.orEmpty().forEach { EditorialThumbnail(EditorialText.https(it), 56.dp) }
        }
    }
}

@Composable
private fun BeforeAfter(before: String?, after: String?) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        before?.takeIf { it.isNotBlank() }?.let {
            Text(it, style = SabqTheme.typography.excerpt.copy(color = SabqTheme.colors.tertiaryInk, textDecoration = TextDecoration.LineThrough))
        }
        after?.takeIf { it.isNotBlank() }?.let {
            Text(it, style = SabqTheme.typography.excerpt.copy(color = EditorialSuccess))
        }
    }
}
