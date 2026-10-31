package com.sabq.smart.feature.editorial

import android.content.Context
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.outlined.Circle
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import coil.compose.AsyncImage
import com.sabq.smart.feature.revisions.RevisionImageUpload
import com.sabq.smart.ui.components.SabqDetailScaffold
import com.sabq.smart.ui.theme.SabqTheme
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import java.util.UUID
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext

/** خانة صورة ألبوم بترتيب اختيار المراسل؛ الفشل يبقى ظاهرًا حتى يُعاد أو يُحذف. */
data class AlbumSlot(
    val id: String = UUID.randomUUID().toString(),
    val uri: Uri,
    val phase: Phase = Phase.Waiting,
    val url: String? = null,
) {
    enum class Phase { Waiting, Uploading, Uploaded, Failed }

    val isPending: Boolean get() = phase == Phase.Waiting || phase == Phase.Uploading
}

/**
 * «طلب تعديل» من المراسل على خبره — مرآة iOS `EditRequestComposeView`:
 * ملاحظة، عنوان مقترح، تعديل فقرات، فقرة جديدة، صور للألبوم، استبدال الصورة
 * البارزة، وعاجل. لا يتغير شيء في الخبر حتى يعتمده المحرر.
 */
@HiltViewModel
class EditRequestComposeViewModel @Inject constructor(
    private val api: EditorialApi,
    @ApplicationContext private val context: Context,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    val articleId: String = savedStateHandle.get<String>("id").orEmpty()
    val articleTitle: String = savedStateHandle.get<String>("title").orEmpty()
    val stateLabel: String = savedStateHandle.get<String>("state").orEmpty()

    data class UiState(
        val context: EditRequestContext? = null,
        val loadError: EditorialError? = null,
        val note: String = "",
        val proposedTitle: String = "",
        val paragraphEdits: Map<Int, String> = emptyMap(),
        val openParagraph: Int? = null,
        val appendParagraph: String = "",
        val album: List<AlbumSlot> = emptyList(),
        val heroUri: Uri? = null,
        val heroUrl: String? = null,
        val heroUploading: Boolean = false,
        val heroFailed: Boolean = false,
        val urgent: Boolean = false,
        val sending: Boolean = false,
        val sendError: String? = null,
        val sent: Boolean = false,
    ) {
        val albumUploading: Int get() = album.count { it.isPending }
        val hasFailedImages: Boolean get() = album.any { it.phase == AlbumSlot.Phase.Failed } || heroFailed
        val uploadingLabel: String?
            get() = when {
                albumUploading > 0 -> "رفع الصور · بقي $albumUploading"
                heroUploading -> "رفع الصورة البارزة"
                else -> null
            }

        fun titleChanged(fallback: String): Boolean {
            val t = proposedTitle.trim()
            return t.isNotEmpty() && t != (context?.article?.title ?: fallback)
        }

        fun hasProposal(fallback: String): Boolean =
            note.isNotBlank() || titleChanged(fallback) || paragraphEdits.isNotEmpty() ||
                appendParagraph.isNotBlank() || album.any { it.url != null } || heroUrl != null
    }

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    /** حد واحد للرفع المتزامن بين الدفعة وإعادة المحاولة. */
    private val uploads = Semaphore(ALBUM_UPLOAD_WIDTH)

    init {
        load()
    }

    fun load() {
        _state.update { it.copy(loadError = null) }
        viewModelScope.launch {
            editorialCall { api.editRequestContext(articleId) }
                .onSuccess { ctx ->
                    _state.update {
                        it.copy(
                            context = ctx,
                            loadError = null,
                            proposedTitle = it.proposedTitle.ifEmpty { ctx.article.title },
                        )
                    }
                }
                .onFailure { e -> _state.update { it.copy(loadError = e.editorialError()) } }
        }
    }

    fun setNote(v: String) = _state.update { it.copy(note = v) }
    fun setTitle(v: String) = _state.update { it.copy(proposedTitle = v) }
    fun setAppend(v: String) = _state.update { it.copy(appendParagraph = v) }
    fun setUrgent(v: Boolean) = _state.update { it.copy(urgent = v) }

    fun toggleParagraph(index: Int, original: String) = _state.update {
        if (it.openParagraph == index) {
            it.copy(openParagraph = null)
        } else {
            val edits = if (it.paragraphEdits.containsKey(index)) it.paragraphEdits else it.paragraphEdits + (index to original)
            it.copy(openParagraph = index, paragraphEdits = edits)
        }
    }

    fun editParagraph(index: Int, text: String) = _state.update { it.copy(paragraphEdits = it.paragraphEdits + (index to text)) }

    fun addAlbum(uris: List<Uri>) {
        if (uris.isEmpty()) return
        val room = ALBUM_LIMIT - _state.value.album.size
        val slots = uris.take(maxOf(0, room)).map { AlbumSlot(uri = it) }
        _state.update { it.copy(album = it.album + slots, sendError = null) }
        slots.forEach { upload(it.id) }
    }

    fun retryAlbum(id: String) {
        val slot = _state.value.album.firstOrNull { it.id == id } ?: return
        if (slot.phase != AlbumSlot.Phase.Failed) return
        setPhase(id, AlbumSlot.Phase.Waiting)
        upload(id)
    }

    fun removeAlbum(id: String) = _state.update { s -> s.copy(album = s.album.filterNot { it.id == id }) }

    private fun setPhase(id: String, phase: AlbumSlot.Phase, url: String? = null) = _state.update { s ->
        s.copy(album = s.album.map { if (it.id == id) it.copy(phase = phase, url = url) else it })
    }

    private fun upload(id: String) {
        viewModelScope.launch {
            uploads.withPermit {
                val slot = _state.value.album.firstOrNull { it.id == id } ?: return@withPermit
                setPhase(id, AlbumSlot.Phase.Uploading)
                val url = uploadImage(slot.uri, "edit-album")
                if (_state.value.album.none { it.id == id }) return@withPermit
                setPhase(id, if (url != null) AlbumSlot.Phase.Uploaded else AlbumSlot.Phase.Failed, url)
            }
        }
    }

    fun pickHero(uri: Uri?) {
        uri ?: return
        // اختيار جديد لا يُبقي صورة سابقة تُرسل دون علم المراسل.
        _state.update { it.copy(heroUri = uri, heroUrl = null, heroFailed = false, heroUploading = true, sendError = null) }
        viewModelScope.launch {
            val url = uploadImage(uri, "edit-hero")
            _state.update {
                if (it.heroUri != uri) it
                else it.copy(heroUploading = false, heroUrl = url, heroFailed = url == null, heroUri = if (url == null) null else uri)
            }
        }
    }

    fun dismissHeroFailure() = _state.update { it.copy(heroFailed = false) }

    private suspend fun uploadImage(uri: Uri, slot: String): String? {
        val bytes = withContext(Dispatchers.IO) { RevisionImageUpload.prepare(context, uri) } ?: return null
        val dataUri = withContext(Dispatchers.Default) {
            "data:${RevisionImageUpload.MIME};base64," + android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)
        }
        return editorialCall { api.uploadImage(SubmissionImageBody(image = dataUri, slot = slot)) }
            .getOrNull()?.url?.takeIf { it.startsWith("https://", ignoreCase = true) }
    }

    fun send() {
        val s = _state.value
        val ctx = s.context ?: return
        if (s.uploadingLabel != null || s.hasFailedImages || s.sending) return
        val edits = s.paragraphEdits.toSortedMap().mapNotNull { (index, after) ->
            val before = ctx.paragraphs.getOrNull(index) ?: return@mapNotNull null
            val next = after.trim()
            if (next == before) null else EditRequestContentEditBody(before = before, after = next)
        }
        val albumUrls = s.album.mapNotNull { it.url }
        val append = s.appendParagraph.trim()
        val body = EditRequestDraftBody(
            articleId = ctx.article.id,
            urgent = s.urgent,
            note = s.note.trim(),
            proposed = EditRequestProposedBody(
                title = if (s.titleChanged(articleTitle)) s.proposedTitle.trim() else null,
                contentEdits = edits.ifEmpty { null },
                appendParagraph = append.ifEmpty { null },
                imageUrl = s.heroUrl,
                albumAdd = albumUrls.ifEmpty { null },
            ),
        )
        _state.update { it.copy(sending = true, sendError = null) }
        viewModelScope.launch {
            editorialCall { api.createEditRequest(body) }
                .onSuccess { _state.update { it.copy(sending = false, sent = true) } }
                .onFailure { e -> _state.update { it.copy(sending = false, sendError = e.editorialError().message) } }
        }
    }

    companion object {
        const val ALBUM_LIMIT = 10
        const val ALBUM_UPLOAD_WIDTH = 3
    }
}

@Composable
fun EditRequestComposeScreen(
    onClose: () -> Unit,
    viewModel: EditRequestComposeViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(state.sent) { if (state.sent) onClose() }

    val albumPicker = rememberLauncherForActivityResult(
        ActivityResultContracts.PickMultipleVisualMedia(EditRequestComposeViewModel.ALBUM_LIMIT),
    ) { uris -> viewModel.addAlbum(uris) }
    val heroPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> viewModel.pickHero(uri) }

    val ready = state.context != null && state.context?.pendingRequestId == null && state.loadError == null

    Column(Modifier.fillMaxSize().background(SabqTheme.colors.background)) {
        Box(Modifier.weight(1f)) {
            SabqDetailScaffold(title = "طلب تعديل", onBack = onClose) {
                Column(
                    Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(
                            state.context?.article?.title ?: viewModel.articleTitle,
                            style = SabqTheme.typography.sectionHeader.copy(color = SabqTheme.colors.ink),
                        )
                        Text(
                            listOf(viewModel.stateLabel, "لن يتغير شيء حتى يعتمده المحرر").filter { it.isNotBlank() }.joinToString(" · "),
                            style = SabqTheme.typography.meta.copy(color = SabqTheme.colors.secondaryInk),
                        )
                    }
                    when {
                        state.loadError != null -> EditorialStatusView(state.loadError, loading = false, onRetry = viewModel::load)
                        state.context == null -> EditorialStatusView(null, loading = true) {}
                        state.context?.pendingRequestId != null -> EditorialSurface {
                            Text(
                                "لديك طلب قيد المراجعة على هذه المادة. انتظر قرار المحرر، أو ألغِه أولًا لإرسال طلب جديد.",
                                style = SabqTheme.typography.excerpt.copy(color = SabqTheme.colors.secondaryInk),
                            )
                        }
                        else -> Form(
                            state = state,
                            viewModel = viewModel,
                            onPickAlbum = {
                                albumPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                            },
                            onPickHero = {
                                heroPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                            },
                        )
                    }
                }
            }
        }
        if (ready) {
            EditorialBottomBar {
                if (state.hasFailedImages) {
                    Text(
                        "صورة لم تُرفع. أعد المحاولة بلمسها أو احذفها قبل الإرسال.",
                        modifier = Modifier.fillMaxWidth(),
                        style = SabqTheme.typography.meta.copy(color = SabqTheme.colors.coral),
                    )
                }
                state.sendError?.let {
                    Text(it, modifier = Modifier.fillMaxWidth(), style = SabqTheme.typography.meta.copy(color = SabqTheme.colors.coral))
                }
                EditorialActionButton(
                    title = state.uploadingLabel ?: "أرسل الطلب",
                    busy = state.sending || state.uploadingLabel != null,
                    enabled = state.hasProposal(viewModel.articleTitle) && !state.hasFailedImages,
                    onClick = viewModel::send,
                )
                Text(
                    "نفس الطلب الذي يظهر على الويب، وتصلك نتيجته بإشعار",
                    modifier = Modifier.navigationBarsPadding(),
                    style = SabqTheme.typography.metaSmall.copy(color = SabqTheme.colors.secondaryInk),
                )
            }
        }
    }
}

@Composable
private fun FieldLabel(text: String) {
    Text(text, style = SabqTheme.typography.meta.copy(fontWeight = FontWeight.SemiBold, color = SabqTheme.colors.secondaryInk))
}

@Composable
private fun EditorialTextField(value: String, onChange: (String) -> Unit, placeholder: String, minLines: Int = 1, maxLines: Int = 6) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        placeholder = { Text(placeholder, color = SabqTheme.colors.tertiaryInk) },
        minLines = minLines,
        maxLines = maxLines,
        textStyle = SabqTheme.typography.excerpt.copy(color = SabqTheme.colors.ink),
        shape = RoundedCornerShape(14.dp),
        colors = OutlinedTextFieldDefaults.colors(
            focusedContainerColor = SabqTheme.colors.surface,
            unfocusedContainerColor = SabqTheme.colors.surface,
            focusedBorderColor = SabqTheme.colors.brandBlue,
            unfocusedBorderColor = SabqTheme.colors.outline,
        ),
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun Form(
    state: EditRequestComposeViewModel.UiState,
    viewModel: EditRequestComposeViewModel,
    onPickAlbum: () -> Unit,
    onPickHero: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            FieldLabel("ما الذي تريد تعديله؟")
            EditorialTextField(state.note, viewModel::setNote, "مثال: عدد دور النشر تغيّر بعد إعلان الهيئة", minLines = 3)
        }
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            FieldLabel("العنوان المقترح")
            EditorialTextField(state.proposedTitle, viewModel::setTitle, "العنوان", maxLines = 3)
        }

        val paragraphs = state.context?.paragraphs.orEmpty()
        if (paragraphs.isNotEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                FieldLabel("تعديل فقرة · اختر الفقرة ثم اكتب البديل")
                EditorialSurface(padding = 0.dp) {
                    Column(Modifier.padding(horizontal = 16.dp)) {
                        paragraphs.forEachIndexed { index, text ->
                            if (index > 0) HorizontalDivider(color = SabqTheme.colors.outline, thickness = 0.5.dp)
                            ParagraphRow(index, text, state, viewModel)
                        }
                    }
                }
            }
        }

        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            FieldLabel("فقرة جديدة في آخر النص (اختياري)")
            EditorialTextField(state.appendParagraph, viewModel::setAppend, "أضف معلومة جديدة", minLines = 2)
        }

        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            FieldLabel("صور للألبوم · ${state.album.size} من ${EditRequestComposeViewModel.ALBUM_LIMIT}")
            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                // الصور الموجودة في الخبر الآن (للعلم فقط)، ثم الجديدة.
                state.context?.article?.albumImages.orEmpty().forEach { EditorialThumbnail(it, 64.dp, dimmed = true) }
                state.album.forEach { slot -> AlbumThumb(slot, viewModel) }
                if (state.album.size < EditRequestComposeViewModel.ALBUM_LIMIT) {
                    Box(
                        Modifier
                            .size(64.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .background(SabqTheme.colors.softFill)
                            .clickable(enabled = state.albumUploading == 0, onClick = onPickAlbum),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Icons.Filled.Add, contentDescription = "أضف صورًا للألبوم", tint = SabqTheme.colors.brandBlue)
                    }
                }
            }
        }

        EditorialSurface(padding = 0.dp) {
            Column(Modifier.padding(horizontal = 16.dp)) {
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable(onClick = onPickHero),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        "استبدال الصورة البارزة",
                        modifier = Modifier.weight(1f),
                        style = SabqTheme.typography.cardTitle.copy(color = SabqTheme.colors.ink),
                    )
                    when {
                        state.heroFailed -> Text(
                            "تعذر الرفع — اختر مجددًا",
                            style = SabqTheme.typography.meta.copy(color = SabqTheme.colors.coral),
                        )
                        state.heroUploading -> CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
                        state.heroUri != null -> AsyncImage(
                            model = state.heroUri,
                            contentDescription = null,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.size(44.dp).clip(RoundedCornerShape(10.dp)),
                        )
                        else -> Text("اختر", style = SabqTheme.typography.meta.copy(color = SabqTheme.colors.secondaryInk))
                    }
                }
                if (state.heroFailed) {
                    Text(
                        "تجاهل الصورة البارزة",
                        style = SabqTheme.typography.meta.copy(fontWeight = FontWeight.SemiBold, color = SabqTheme.colors.brandBlue),
                        modifier = Modifier.fillMaxWidth().heightIn(min = 44.dp).clickable(onClick = viewModel::dismissHeroFailure).padding(vertical = 12.dp),
                    )
                }
                HorizontalDivider(color = SabqTheme.colors.outline, thickness = 0.5.dp)
                Row(Modifier.fillMaxWidth().heightIn(min = 48.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("عاجل", modifier = Modifier.weight(1f), style = SabqTheme.typography.cardTitle.copy(color = SabqTheme.colors.ink))
                    Switch(
                        checked = state.urgent,
                        onCheckedChange = viewModel::setUrgent,
                        colors = SwitchDefaults.colors(checkedTrackColor = SabqTheme.colors.brandBlue),
                    )
                }
            }
        }
    }
}

@Composable
private fun ParagraphRow(index: Int, text: String, state: EditRequestComposeViewModel.UiState, viewModel: EditRequestComposeViewModel) {
    val edit = state.paragraphEdits[index]
    val changed = edit != null && edit.trim() != text
    val open = state.openParagraph == index
    Column(Modifier.padding(vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(
            Modifier.fillMaxWidth().clickable { viewModel.toggleParagraph(index, text) },
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(
                if (changed) Icons.Filled.CheckCircle else Icons.Outlined.Circle,
                contentDescription = null,
                tint = SabqTheme.colors.brandBlue,
                modifier = Modifier.size(20.dp),
            )
            Text(
                text,
                modifier = Modifier.weight(1f),
                maxLines = if (open) Int.MAX_VALUE else 3,
                style = SabqTheme.typography.excerpt.copy(
                    color = if (changed) SabqTheme.colors.tertiaryInk else SabqTheme.colors.ink,
                    textDecoration = if (changed) TextDecoration.LineThrough else null,
                ),
            )
        }
        if (open) {
            OutlinedTextField(
                value = edit ?: text,
                onValueChange = { viewModel.editParagraph(index, it) },
                placeholder = { Text("البديل") },
                minLines = 2,
                maxLines = 10,
                textStyle = SabqTheme.typography.excerpt.copy(color = EditorialSuccess),
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun AlbumThumb(slot: AlbumSlot, viewModel: EditRequestComposeViewModel) {
    val shape = RoundedCornerShape(10.dp)
    val failed = slot.phase == AlbumSlot.Phase.Failed
    Box(
        Modifier
            .size(64.dp)
            .clip(shape)
            .border(BorderStroke(2.dp, if (failed) SabqTheme.colors.coral else Color.Transparent), shape)
            .clickable(enabled = failed) { viewModel.retryAlbum(slot.id) },
    ) {
        AsyncImage(model = slot.uri, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.size(64.dp))
        when (slot.phase) {
            AlbumSlot.Phase.Waiting, AlbumSlot.Phase.Uploading -> Box(
                Modifier.size(64.dp).background(Color.Black.copy(alpha = 0.35f)),
                contentAlignment = Alignment.Center,
            ) { CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(20.dp)) }
            AlbumSlot.Phase.Failed -> Box(
                Modifier.size(64.dp).background(Color.Black.copy(alpha = 0.45f)),
                contentAlignment = Alignment.Center,
            ) { Icon(Icons.Filled.Refresh, contentDescription = "أعد رفع الصورة", tint = Color.White) }
            AlbumSlot.Phase.Uploaded -> Unit
        }
        if (!slot.isPending) {
            Box(
                Modifier
                    .align(Alignment.TopStart)
                    .padding(2.dp)
                    .size(22.dp)
                    .clip(CircleShape)
                    .background(Color.Black.copy(alpha = 0.6f))
                    .clickable { viewModel.removeAlbum(slot.id) },
                contentAlignment = Alignment.Center,
            ) { Icon(Icons.Filled.Close, contentDescription = "احذف الصورة", tint = Color.White, modifier = Modifier.size(14.dp)) }
        }
    }
}
