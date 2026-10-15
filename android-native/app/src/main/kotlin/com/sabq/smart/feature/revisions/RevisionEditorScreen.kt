package com.sabq.smart.feature.revisions

import android.content.Context
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts.PickMultipleVisualMedia
import androidx.activity.result.contract.ActivityResultContracts.PickVisualMedia
import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddAPhoto
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.FormatQuote
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material.icons.outlined.Article
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import coil.compose.SubcomposeAsyncImage
import com.sabq.smart.feature.settings.ErrorBanner
import com.sabq.smart.feature.settings.PrimaryGradientButton
import com.sabq.smart.feature.settings.SheetTopBar
import com.sabq.smart.ui.components.SurfaceCard
import com.sabq.smart.ui.theme.SabqTheme
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

// ── ViewModel ───────────────────────────────────────────────────────

sealed interface RevisionEditorStage {
    data object Loading : RevisionEditorStage
    data class LoadFailed(val message: String) : RevisionEditorStage
    data object Form : RevisionEditorStage
    data object Submitting : RevisionEditorStage
    data object Success : RevisionEditorStage

    /** المقال لم يعد بانتظار التعديل — إشعار قديم فُتح مرة ثانية. */
    data object AlreadyResubmitted : RevisionEditorStage
}

/** صورة مختارة: الرابط للمعاينة، والبايتات مُجهَّزة (مصغّرة JPEG) للرفع. */
data class PreparedImage(val uri: Uri, val bytes: ByteArray)

data class RevisionEditorState(
    val stage: RevisionEditorStage = RevisionEditorStage.Loading,
    val draft: ApiArticleDraft? = null,
    val title: String = "",
    val body: String = "",
    /** لم يستبدل الكاتب الصور → نُرسل null فيُبقي الخادم الحالية. */
    val replacedImages: Boolean = false,
    val newImages: List<PreparedImage> = emptyList(),
    val errorMessage: String? = null,
) {
    val isOpinion: Boolean get() = draft?.isOpinion ?: true
    val maxImages: Int get() = if (isOpinion) 1 else 10
    val isValid: Boolean get() = title.trim().length >= 3 && body.trim().length >= 20
}

@HiltViewModel
class RevisionEditorViewModel @Inject constructor(
    savedState: SavedStateHandle,
    @ApplicationContext private val appContext: Context,
    private val api: RevisionsApi,
    private val store: RevisionsStore,
) : ViewModel() {

    private val articleId: String = savedState["id"] ?: ""

    private val _state = MutableStateFlow(RevisionEditorState())
    val state = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        if (articleId.isBlank()) {
            _state.update { it.copy(stage = RevisionEditorStage.LoadFailed("لم يتم تحديد المقال")) }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(stage = RevisionEditorStage.Loading) }
            runCatching { api.getDraft(articleId).article }
                .onSuccess { draft ->
                    if (!draft.awaitingEdits) {
                        // بوابة التعديل المزدوج: الإشعار القديم لا يفتح
                        // الفورم ثانية — ويُسقط الصف محلياً فوراً.
                        store.removeOptimistically(articleId)
                        _state.update {
                            it.copy(stage = RevisionEditorStage.AlreadyResubmitted, draft = draft)
                        }
                        return@onSuccess
                    }
                    _state.update {
                        it.copy(
                            stage = RevisionEditorStage.Form,
                            draft = draft,
                            title = draft.title,
                            body = draft.body,
                        )
                    }
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(
                            stage = RevisionEditorStage.LoadFailed(
                                e.localizedMessage ?: "تعذر تحميل المقال",
                            ),
                        )
                    }
                }
        }
    }

    fun setTitle(value: String) = _state.update { it.copy(title = value) }

    fun setBody(value: String) = _state.update { it.copy(body = value) }

    fun onImagesPicked(uris: List<Uri>) {
        if (uris.isEmpty()) return
        viewModelScope.launch {
            val prepared = withContext(Dispatchers.IO) {
                uris.mapNotNull { uri ->
                    RevisionImageUpload.prepare(appContext, uri)?.let { PreparedImage(uri, it) }
                }
            }
            if (prepared.isEmpty()) return@launch
            _state.update { s ->
                s.copy(
                    replacedImages = true,
                    newImages = (s.newImages + prepared)
                        .distinctBy { it.uri }
                        .take(s.maxImages),
                )
            }
        }
    }

    fun removeNewImage(index: Int) {
        _state.update { s ->
            val remaining = s.newImages.toMutableList().apply { if (index in indices) removeAt(index) }
            // إزالة كل الجديد = عودة لوضع «أبقِ الصور الحالية» (null على السلك)
            s.copy(newImages = remaining, replacedImages = remaining.isNotEmpty())
        }
    }

    fun resubmit() {
        val s = _state.value
        if (!s.isValid || s.stage == RevisionEditorStage.Submitting) return
        viewModelScope.launch {
            _state.update { it.copy(stage = RevisionEditorStage.Submitting, errorMessage = null) }
            val encoded = withContext(Dispatchers.Default) {
                s.newImages.map { img ->
                    val base64 = android.util.Base64.encodeToString(img.bytes, android.util.Base64.NO_WRAP)
                    "data:${RevisionImageUpload.MIME};base64,$base64"
                }
            }
            val heroImage = if (s.replacedImages) encoded.firstOrNull() else null
            val albumImages = if (s.replacedImages && !s.isOpinion && encoded.size > 1) {
                encoded.drop(1)
            } else {
                null
            }
            runCatching {
                api.resubmit(
                    articleId,
                    ResubmitRequest(
                        title = s.title.trim(),
                        content = s.body.trim(),
                        heroImage = heroImage,
                        albumImages = albumImages,
                    ),
                )
            }
                .onSuccess { resp ->
                    if (resp.success) {
                        store.removeOptimistically(articleId)
                        store.refresh()
                        _state.update { it.copy(stage = RevisionEditorStage.Success) }
                    } else {
                        _state.update {
                            it.copy(
                                stage = RevisionEditorStage.Form,
                                errorMessage = resp.message.ifBlank { "تعذر إرسال التعديل. حاول لاحقاً." },
                            )
                        }
                    }
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(
                            stage = RevisionEditorStage.Form,
                            errorMessage = e.localizedMessage ?: "تعذر إرسال التعديل. حاول لاحقاً.",
                        )
                    }
                }
        }
    }
}

// ── Screen ──────────────────────────────────────────────────────────

/**
 * فورم إعادة إرسال مقال أعاده المحرر — نقل iOS `ArticleRevisionView`:
 * بانر كهرماني بملاحظات المراجع، حقول معبّأة من المسودة، والصور
 * القائمة تبقى حتى يستبدلها الكاتب (null = إبقاء عند الإرسال).
 */
@Composable
fun RevisionEditorScreen(
    onBack: () -> Unit,
    viewModel: RevisionEditorViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val pageTint = if (state.isOpinion) SabqTheme.colors.primaryEnd else SabqTheme.colors.coral

    val singlePicker = rememberLauncherForActivityResult(PickVisualMedia()) { uri ->
        if (uri != null) viewModel.onImagesPicked(listOf(uri))
    }
    val multiPicker = rememberLauncherForActivityResult(
        PickMultipleVisualMedia(maxItems = state.maxImages.coerceAtLeast(2)),
    ) { uris -> viewModel.onImagesPicked(uris) }
    val launchPicker: () -> Unit = {
        if (state.maxImages == 1) {
            singlePicker.launch(PickVisualMediaRequest(PickVisualMedia.ImageOnly))
        } else {
            multiPicker.launch(PickVisualMediaRequest(PickVisualMedia.ImageOnly))
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(SabqTheme.colors.background),
    ) {
        SheetTopBar(title = "تعديل المقال", onClose = onBack)
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp)
                .padding(top = 18.dp, bottom = 60.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            when (val stage = state.stage) {
                RevisionEditorStage.Loading -> LoadingBlock(errorText = null)
                is RevisionEditorStage.LoadFailed -> LoadingBlock(errorText = stage.message)
                RevisionEditorStage.Success -> {
                    ResultHero(
                        icon = Icons.Filled.CheckCircle,
                        tint = SabqTheme.colors.leaf,
                        title = "أُرسلت للمراجعة ✓",
                        subtitle = "سيراجع فريق التحرير التعديل قريباً ويصلك إشعار بالقرار.",
                    )
                    PrimaryGradientButton(title = "رجوع", onClick = onBack)
                }
                RevisionEditorStage.AlreadyResubmitted -> {
                    ResultHero(
                        icon = Icons.Filled.Verified,
                        tint = RevisionAccent,
                        title = "سبق أن أرسلت هذه النسخة للمراجعة",
                        subtitle = "هذا المقال قيد المراجعة لدى هيئة التحرير. سيصلك إشعار جديد إذا طُلب تعديل إضافي أو عند النشر.",
                    )
                    PrimaryGradientButton(title = "رجوع", onClick = onBack)
                }
                RevisionEditorStage.Form, RevisionEditorStage.Submitting -> {
                    EditorHeader(isOpinion = state.isOpinion, tint = pageTint)
                    state.draft?.reviewNotes?.takeIf { it.isNotBlank() }?.let { notes ->
                        ReviewNotesCallout(notes = notes)
                    }
                    SurfaceCard(accent = pageTint) {
                        Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                            state.errorMessage?.let { ErrorBanner(message = it) }

                            EditorFieldLabel(text = "العنوان", required = true)
                            EditorTextField(
                                value = state.title,
                                onValueChange = viewModel::setTitle,
                                placeholder = "عنوان المقال",
                                tint = pageTint,
                                minLines = 1,
                                heavyText = true,
                            )

                            EditorFieldLabel(text = "النص", required = true)
                            EditorTextField(
                                value = state.body,
                                onValueChange = viewModel::setBody,
                                placeholder = "نص المقال",
                                tint = pageTint,
                                minLines = 8,
                            )

                            RevisionImagesSection(
                                state = state,
                                tint = pageTint,
                                onPick = launchPicker,
                                onRemove = viewModel::removeNewImage,
                            )

                            PrimaryGradientButton(
                                title = "إرسال التعديل",
                                isLoading = state.stage == RevisionEditorStage.Submitting,
                                enabled = state.isValid,
                                onClick = viewModel::resubmit,
                            )
                        }
                    }
                }
            }
        }
    }
}

// ── Atoms ───────────────────────────────────────────────────────────

@Composable
private fun LoadingBlock(errorText: String?) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 70.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (errorText == null) {
            CircularProgressIndicator(color = SabqTheme.colors.primaryEnd, strokeWidth = 2.5.dp)
            Text(
                text = "نجلب المقال…",
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                color = SabqTheme.colors.secondaryInk,
            )
        } else {
            Text(
                text = errorText,
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                color = SabqTheme.colors.coral,
            )
        }
    }
}

@Composable
private fun EditorHeader(isOpinion: Boolean, tint: Color) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(
            modifier = Modifier
                .size(80.dp)
                .clip(CircleShape)
                .background(tint.copy(alpha = 0.10f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = if (isOpinion) Icons.Filled.Edit else Icons.Outlined.Article,
                contentDescription = null,
                tint = tint,
                modifier = Modifier.size(32.dp),
            )
        }
        Text(
            text = if (isOpinion) "إعادة إرسال المقال" else "إعادة إرسال الخبر",
            fontSize = 20.sp,
            fontWeight = FontWeight.Black,
            color = SabqTheme.colors.ink,
        )
        Text(
            text = "راجع ملاحظة فريق التحرير ثم أعد الإرسال",
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
            color = SabqTheme.colors.secondaryInk,
        )
    }
}

/** بانر كهرماني بملاحظات المراجع — «فهمت» يطويه لشريط صغير يبقى ظاهراً. */
@Composable
private fun ReviewNotesCallout(notes: String) {
    var collapsed by rememberSaveable { mutableStateOf(false) }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(RevisionAccent.copy(alpha = 0.10f))
            .border(1.dp, RevisionAccent.copy(alpha = 0.30f), RoundedCornerShape(14.dp))
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(
                imageVector = Icons.Filled.FormatQuote,
                contentDescription = null,
                tint = RevisionAccent,
                modifier = Modifier.size(14.dp),
            )
            Text(
                text = "ملاحظات المراجع",
                fontSize = 13.sp,
                fontWeight = FontWeight.Black,
                color = RevisionAccent,
            )
            Spacer(modifier = Modifier.weight(1f))
            if (collapsed) {
                Icon(
                    imageVector = Icons.Filled.KeyboardArrowDown,
                    contentDescription = "عرض الملاحظة",
                    tint = RevisionAccent.copy(alpha = 0.6f),
                    modifier = Modifier
                        .size(20.dp)
                        .clip(CircleShape)
                        .clickable { collapsed = false },
                )
            }
        }
        if (!collapsed) {
            Text(
                text = notes,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                color = SabqTheme.colors.ink,
                lineHeight = 22.sp,
            )
            Row(
                modifier = Modifier
                    .clip(CircleShape)
                    .border(1.dp, RevisionAccent.copy(alpha = 0.35f), CircleShape)
                    .clickable { collapsed = true }
                    .padding(horizontal = 12.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Icon(
                    imageVector = Icons.Filled.Check,
                    contentDescription = null,
                    tint = RevisionAccent,
                    modifier = Modifier.size(11.dp),
                )
                Text(
                    text = "فهمت",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = RevisionAccent,
                )
            }
        }
    }
}

@Composable
private fun EditorFieldLabel(text: String, required: Boolean = false) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(
            text = text,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            color = SabqTheme.colors.ink,
        )
        if (required) {
            Text(
                text = "*",
                fontSize = 14.sp,
                fontWeight = FontWeight.Black,
                color = SabqTheme.colors.coral,
            )
        }
    }
}

@Composable
private fun EditorTextField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    tint: Color,
    minLines: Int,
    heavyText: Boolean = false,
) {
    val shape = RoundedCornerShape(SabqTheme.dimens.chipRadius)
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = Modifier.fillMaxWidth(),
        placeholder = {
            Text(
                text = placeholder,
                style = SabqTheme.typography.body.copy(
                    fontSize = if (heavyText) 16.sp else 15.sp,
                    color = SabqTheme.colors.tertiaryInk,
                ),
            )
        },
        singleLine = false,
        minLines = minLines,
        textStyle = SabqTheme.typography.body.copy(
            fontSize = if (heavyText) 16.sp else 15.sp,
            fontWeight = if (heavyText) FontWeight.Bold else FontWeight.Normal,
            color = SabqTheme.colors.ink,
        ),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = tint.copy(alpha = 0.4f),
            unfocusedBorderColor = SabqTheme.colors.outline,
            focusedContainerColor = SabqTheme.colors.paleFill,
            unfocusedContainerColor = SabqTheme.colors.paleFill,
            cursorColor = tint,
            focusedTextColor = SabqTheme.colors.ink,
            unfocusedTextColor = SabqTheme.colors.ink,
        ),
        shape = shape,
    )
}

// ── Images ──────────────────────────────────────────────────────────

@Composable
private fun RevisionImagesSection(
    state: RevisionEditorState,
    tint: Color,
    onPick: () -> Unit,
    onRemove: (Int) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            EditorFieldLabel(
                text = if (state.isOpinion) "صورة المقال (اختياري)" else "الصور",
            )
            Spacer(modifier = Modifier.weight(1f))
            if (state.replacedImages) {
                Text(
                    text = "${state.newImages.size} / ${state.maxImages}",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = SabqTheme.colors.tertiaryInk,
                )
            }
        }

        if (!state.replacedImages) {
            // الصور القائمة من المسودة — تبقى كما هي حتى الاستبدال
            val existingHero = state.draft?.imageUrl?.takeIf { it.isNotBlank() }
            if (existingHero != null) {
                ExistingHero(url = existingHero, onReplace = onPick)
            } else {
                EmptyImagePlaceholder(tint = tint, onClick = onPick)
            }
            val album = state.draft?.albumImages.orEmpty().filter { it.isNotBlank() }
            if (album.isNotEmpty()) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    album.take(4).forEach { url ->
                        SubcomposeAsyncImage(
                            model = url,
                            contentDescription = null,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier
                                .size(64.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .background(SabqTheme.colors.paleFill),
                        )
                    }
                    if (album.size > 4) {
                        Box(
                            modifier = Modifier
                                .size(64.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .background(SabqTheme.colors.paleFill),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                text = "+${album.size - 4}",
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold,
                                color = SabqTheme.colors.secondaryInk,
                            )
                        }
                    }
                }
            }
        } else {
            // صور جديدة مختارة — شبكة يدوية (LazyGrid داخل verticalScroll يرمي)
            NewImagesGrid(
                images = state.newImages,
                maxImages = state.maxImages,
                tint = tint,
                onPick = onPick,
                onRemove = onRemove,
            )
        }
    }
}

@Composable
private fun ExistingHero(url: String, onReplace: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(180.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(SabqTheme.colors.paleFill),
    ) {
        SubcomposeAsyncImage(
            model = url,
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize(),
        )
        Row(
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(10.dp)
                .clip(CircleShape)
                .background(Color.Black.copy(alpha = 0.55f))
                .clickable { onReplace() }
                .padding(horizontal = 10.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Icon(
                imageVector = Icons.Filled.AddAPhoto,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(11.dp),
            )
            Text(
                text = "تغيير",
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                color = Color.White,
            )
        }
    }
}

@Composable
private fun EmptyImagePlaceholder(tint: Color, onClick: () -> Unit) {
    val shape = RoundedCornerShape(SabqTheme.dimens.chipRadius)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(tint.copy(alpha = 0.05f), shape)
            .border(BorderStroke(1.dp, tint.copy(alpha = 0.30f)), shape)
            .clickable { onClick() }
            .padding(vertical = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(
            imageVector = Icons.Filled.AddAPhoto,
            contentDescription = null,
            tint = tint,
            modifier = Modifier.size(26.dp),
        )
        Text(
            text = "اضغط لاختيار صورة",
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
            color = SabqTheme.colors.tertiaryInk,
        )
    }
}

@Composable
private fun NewImagesGrid(
    images: List<PreparedImage>,
    maxImages: Int,
    tint: Color,
    onPick: () -> Unit,
    onRemove: (Int) -> Unit,
) {
    val columns = 3
    val showAddTile = images.size < maxImages
    val totalTiles = images.size + (if (showAddTile) 1 else 0)
    val rowCount = totalTiles / columns + if (totalTiles % columns == 0) 0 else 1
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        for (r in 0 until rowCount) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                for (c in 0 until columns) {
                    val idx = r * columns + c
                    when {
                        idx < images.size -> Box(
                            modifier = Modifier
                                .weight(1f)
                                .size(100.dp)
                                .clip(RoundedCornerShape(12.dp)),
                        ) {
                            SubcomposeAsyncImage(
                                model = images[idx].uri,
                                contentDescription = null,
                                contentScale = ContentScale.Crop,
                                modifier = Modifier.fillMaxSize(),
                            )
                            Box(
                                modifier = Modifier
                                    .align(Alignment.TopEnd)
                                    .padding(6.dp)
                                    .size(22.dp)
                                    .clip(CircleShape)
                                    .background(Color.Black.copy(alpha = 0.45f))
                                    .clickable { onRemove(idx) },
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(
                                    imageVector = Icons.Filled.Cancel,
                                    contentDescription = "إزالة",
                                    tint = Color.White,
                                    modifier = Modifier.size(18.dp),
                                )
                            }
                        }
                        idx == images.size && showAddTile -> Box(
                            modifier = Modifier
                                .weight(1f)
                                .size(100.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .background(tint.copy(alpha = 0.06f))
                                .border(BorderStroke(1.dp, tint.copy(alpha = 0.3f)), RoundedCornerShape(12.dp))
                                .clickable { onPick() },
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                imageVector = Icons.Filled.AddAPhoto,
                                contentDescription = "إضافة صورة",
                                tint = tint,
                                modifier = Modifier.size(22.dp),
                            )
                        }
                        else -> Spacer(modifier = Modifier.weight(1f))
                    }
                }
            }
        }
    }
}

@Composable
private fun ResultHero(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    tint: Color,
    title: String,
    subtitle: String,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 30.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(
            modifier = Modifier
                .size(110.dp)
                .clip(CircleShape)
                .background(
                    Brush.linearGradient(
                        listOf(tint.copy(alpha = 0.18f), tint.copy(alpha = 0.05f)),
                    ),
                ),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = tint,
                modifier = Modifier.size(60.dp),
            )
        }
        Text(
            text = title,
            fontSize = 20.sp,
            fontWeight = FontWeight.Black,
            color = SabqTheme.colors.ink,
        )
        Text(
            text = subtitle,
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
            color = SabqTheme.colors.secondaryInk,
            lineHeight = 22.sp,
            modifier = Modifier.padding(horizontal = 16.dp),
        )
    }
}
