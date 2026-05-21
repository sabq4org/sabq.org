package com.sabq.smart.feature.settings

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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.AddAPhoto
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.outlined.Article
import androidx.compose.material3.Icon
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.SubcomposeAsyncImage
import coil.request.ImageRequest
import com.sabq.smart.ui.components.SurfaceCard
import com.sabq.smart.ui.theme.SabqTheme

enum class ArticleSubmissionKind { Opinion, News }

/**
 * Writer / reporter submission flow — ports
 * `ArticleSubmissionView.swift`.
 *   - Opinion: 1 optional image
 *   - News: up to 10 images, first becomes the hero ("الرئيسية" pill)
 *   - Submits as base64 data URIs → `POST /api/v1/articles/submit`
 *
 * Validation matches iOS: title ≥ 3 chars, body ≥ 20 chars.
 */
@Composable
fun ArticleSubmissionScreen(
    kind: ArticleSubmissionKind,
    onBack: () -> Unit,
    viewModel: AccountActionViewModel = hiltViewModel(),
) {
    LaunchedEffect(Unit) { viewModel.reset() }
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current

    var title by remember { mutableStateOf("") }
    var content by remember { mutableStateOf("") }
    var images by remember { mutableStateOf<List<PickedImage>>(emptyList()) }

    val maxImages = if (kind == ArticleSubmissionKind.Opinion) 1 else 10
    val pageTint = if (kind == ArticleSubmissionKind.Opinion) SabqTheme.colors.primaryEnd else SabqTheme.colors.coral
    val pageIcon = if (kind == ArticleSubmissionKind.Opinion) Icons.Filled.Edit else Icons.Outlined.Article
    val pageTitle = if (kind == ArticleSubmissionKind.Opinion) "إرسال مقالة للنشر" else "إرسال خبر"
    val pageSubtitle = if (kind == ArticleSubmissionKind.Opinion)
        "اكتب مقالتك وسنراجعها للنشر بإذن الله"
    else
        "أرسل خبرك مع الصور وسنراجعه قبل النشر"

    val singlePicker = rememberLauncherForActivityResult(PickVisualMedia()) { uri ->
        if (uri != null) {
            loadImage(context, uri)?.let { picked ->
                images = listOf(picked).take(maxImages)
            }
        }
    }
    // PickMultipleVisualMedia hard-requires maxItems >= 2; coerce so the
    // launcher constructs cleanly even on Opinion (which uses the single
    // picker instead at launch time).
    val multiPicker = rememberLauncherForActivityResult(
        PickMultipleVisualMedia(maxItems = maxImages.coerceAtLeast(2)),
    ) { uris: List<Uri> ->
        val loaded = uris.mapNotNull { loadImage(context, it) }
        // Append (cap at maxImages so the user can pick → add more iteratively)
        images = (images + loaded).distinctBy { it.uri }.take(maxImages)
    }

    val launchPicker: () -> Unit = {
        if (maxImages == 1) {
            singlePicker.launch(PickVisualMediaRequest(PickVisualMedia.ImageOnly))
        } else {
            multiPicker.launch(PickVisualMediaRequest(PickVisualMedia.ImageOnly))
        }
    }

    val isValid = title.trim().length >= 3 && content.trim().length >= 20

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(SabqTheme.colors.background),
    ) {
        SheetTopBar(title = pageTitle, onClose = onBack)
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp)
                .padding(top = 18.dp, bottom = 60.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            if (state.success) {
                SuccessHero(tint = pageTint)
                EncouragementCard(kind = kind)
                Spacer(modifier = Modifier.size(8.dp))
                PrimaryGradientButton(
                    title = "تمام",
                    onClick = onBack,
                )
            } else {
                HeroHeader(
                    icon = pageIcon,
                    title = pageTitle,
                    subtitle = pageSubtitle,
                    tint = pageTint,
                )
                SurfaceCard(accent = pageTint) {
                    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                        state.errorMessage?.let { ErrorBanner(message = it) }

                        FieldLabel(text = "العنوان", required = true)
                        SubmissionTextField(
                            value = title,
                            onValueChange = { title = it },
                            placeholder = if (kind == ArticleSubmissionKind.Opinion) "عنوان المقالة" else "عنوان الخبر",
                            tint = pageTint,
                            singleLine = false,
                            minLines = 1,
                            heavyText = true,
                        )

                        FieldLabel(text = "النص", required = true)
                        SubmissionTextField(
                            value = content,
                            onValueChange = { content = it },
                            placeholder = if (kind == ArticleSubmissionKind.Opinion)
                                "اكتب نص المقالة هنا..."
                            else
                                "اكتب تفاصيل الخبر هنا...",
                            tint = pageTint,
                            singleLine = false,
                            minLines = 6,
                        )

                        ImagesSection(
                            kind = kind,
                            images = images,
                            maxImages = maxImages,
                            tint = pageTint,
                            onPick = launchPicker,
                            onRemove = { index ->
                                images = images.toMutableList().apply { removeAt(index) }
                            },
                        )

                        SubmitButton(
                            kind = kind,
                            enabled = isValid,
                            isLoading = state.isLoading,
                            onClick = {
                                viewModel.submitArticle(
                                    title = title.trim(),
                                    content = content.trim(),
                                    kind = if (kind == ArticleSubmissionKind.Opinion) "opinion" else "news",
                                    images = images.map { it.bytes to it.mimeType },
                                )
                            },
                        )
                    }
                }
            }
        }
    }
}

private data class PickedImage(
    val uri: Uri,
    val bytes: ByteArray,
    val mimeType: String,
)

private fun loadImage(context: android.content.Context, uri: Uri): PickedImage? {
    val bytes = runCatching {
        context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
    }.getOrNull() ?: return null
    if (bytes.isEmpty()) return null
    val mime = context.contentResolver.getType(uri) ?: "image/jpeg"
    return PickedImage(uri, bytes, mime)
}

@Composable
private fun HeroHeader(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    subtitle: String,
    tint: Color,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            modifier = Modifier
                .size(88.dp)
                .clip(CircleShape)
                .background(tint.copy(alpha = 0.10f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = tint,
                modifier = Modifier.size(36.dp),
            )
        }
        Text(
            text = title,
            style = SabqTheme.typography.cardTitle.copy(
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
                color = SabqTheme.colors.ink,
            ),
        )
        Text(
            text = subtitle,
            style = SabqTheme.typography.metaSmall.copy(
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                color = SabqTheme.colors.secondaryInk,
            ),
        )
    }
}

@Composable
private fun FieldLabel(text: String, required: Boolean = false) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(
            text = text,
            style = SabqTheme.typography.cardTitle.copy(
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                color = SabqTheme.colors.ink,
            ),
        )
        if (required) {
            Text(
                text = "*",
                style = SabqTheme.typography.cardTitle.copy(
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Black,
                    color = SabqTheme.colors.coral,
                ),
            )
        }
    }
}

@Composable
private fun SubmissionTextField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    tint: Color,
    singleLine: Boolean,
    minLines: Int,
    heavyText: Boolean = false,
) {
    val shape = RoundedCornerShape(SabqTheme.dimens.chipRadius)
    androidx.compose.material3.OutlinedTextField(
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
        singleLine = singleLine,
        minLines = minLines,
        textStyle = SabqTheme.typography.body.copy(
            fontSize = if (heavyText) 16.sp else 15.sp,
            fontWeight = if (heavyText) FontWeight.Bold else FontWeight.Normal,
            color = SabqTheme.colors.ink,
        ),
        colors = androidx.compose.material3.OutlinedTextFieldDefaults.colors(
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

@Composable
private fun ImagesSection(
    kind: ArticleSubmissionKind,
    images: List<PickedImage>,
    maxImages: Int,
    tint: Color,
    onPick: () -> Unit,
    onRemove: (Int) -> Unit,
) {
    val context = LocalContext.current
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            FieldLabel(
                text = if (kind == ArticleSubmissionKind.Opinion)
                    "صورة المقالة (اختياري)"
                else
                    "الصور (يمكن إضافة عدة صور)",
            )
            Spacer(modifier = Modifier.weight(1f))
            if (images.isNotEmpty()) {
                Text(
                    text = "${images.size} / $maxImages",
                    style = SabqTheme.typography.metaSmall.copy(
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = SabqTheme.colors.tertiaryInk,
                    ),
                )
            }
        }
        if (images.isEmpty()) {
            ImagePickerPlaceholder(kind = kind, tint = tint, onClick = onPick)
        } else {
            ImageGrid(
                images = images,
                maxImages = maxImages,
                tint = tint,
                showHeroBadge = kind == ArticleSubmissionKind.News,
                context = context,
                onPick = onPick,
                onRemove = onRemove,
            )
        }
    }
}

@Composable
private fun ImagePickerPlaceholder(kind: ArticleSubmissionKind, tint: Color, onClick: () -> Unit) {
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
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(
            imageVector = Icons.Filled.AddAPhoto,
            contentDescription = null,
            tint = tint,
            modifier = Modifier.size(32.dp),
        )
        Text(
            text = if (kind == ArticleSubmissionKind.Opinion) "اختر صورة" else "اختر الصور",
            style = SabqTheme.typography.cardTitle.copy(
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                color = SabqTheme.colors.ink,
            ),
        )
        Text(
            text = "جودة عالية تُحفظ كما هي بدون ضغط",
            style = SabqTheme.typography.metaSmall.copy(
                fontSize = 11.sp,
                color = SabqTheme.colors.tertiaryInk,
            ),
        )
    }
}

@Composable
private fun ImageGrid(
    images: List<PickedImage>,
    maxImages: Int,
    tint: Color,
    showHeroBadge: Boolean,
    context: android.content.Context,
    onPick: () -> Unit,
    onRemove: (Int) -> Unit,
) {
    // Compose's LazyVerticalGrid inside a verticalScroll throws — so we
    // build a manual flow of rows of 3 thumbnails wide.
    val columns = 3
    val rows = images.size / columns + if (images.size % columns == 0) 0 else 1
    val showAddTile = images.size < maxImages
    val totalTiles = images.size + (if (showAddTile) 1 else 0)
    val rowCount = totalTiles / columns + if (totalTiles % columns == 0) 0 else 1

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        for (r in 0 until rowCount) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                for (c in 0 until columns) {
                    val idx = r * columns + c
                    if (idx < images.size) {
                        ImageTile(
                            image = images[idx],
                            isHero = idx == 0 && showHeroBadge,
                            tint = tint,
                            context = context,
                            onRemove = { onRemove(idx) },
                            modifier = Modifier.weight(1f),
                        )
                    } else if (idx == images.size && showAddTile) {
                        AddTile(tint = tint, onClick = onPick, modifier = Modifier.weight(1f))
                    } else {
                        Spacer(modifier = Modifier.weight(1f))
                    }
                }
            }
        }
    }
}

@Composable
private fun ImageTile(
    image: PickedImage,
    isHero: Boolean,
    tint: Color,
    context: android.content.Context,
    onRemove: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .size(100.dp)
            .clip(RoundedCornerShape(12.dp)),
    ) {
        SubcomposeAsyncImage(
            model = ImageRequest.Builder(context).data(image.uri).crossfade(true).build(),
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .fillMaxSize()
                .clip(RoundedCornerShape(12.dp)),
            loading = {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(SabqTheme.colors.paleFill),
                )
            },
        )
        if (isHero) {
            Row(
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(6.dp)
                    .clip(CircleShape)
                    .background(tint)
                    .padding(horizontal = 6.dp, vertical = 3.dp),
            ) {
                Text(
                    text = "الرئيسية",
                    style = SabqTheme.typography.metaSmall.copy(
                        fontSize = 9.sp,
                        fontWeight = FontWeight.Black,
                        color = Color.White,
                    ),
                )
            }
        }
        Box(
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(6.dp)
                .size(22.dp)
                .clip(CircleShape)
                .background(SabqTheme.colors.mediaScrim)
                .clickable { onRemove() },
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
}

@Composable
private fun AddTile(tint: Color, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(12.dp)
    Box(
        modifier = modifier
            .size(100.dp)
            .clip(shape)
            .background(tint.copy(alpha = 0.06f), shape)
            .border(BorderStroke(1.dp, tint.copy(alpha = 0.3f)), shape)
            .clickable { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = Icons.Filled.AddAPhoto,
            contentDescription = "إضافة صورة",
            tint = tint,
            modifier = Modifier.size(22.dp),
        )
    }
}

@Composable
private fun SubmitButton(
    kind: ArticleSubmissionKind,
    enabled: Boolean,
    isLoading: Boolean,
    onClick: () -> Unit,
) {
    val shape = RoundedCornerShape(SabqTheme.dimens.buttonRadius)
    val bgBrush = if (enabled && !isLoading)
        Brush.linearGradient(listOf(SabqTheme.colors.primaryStart, SabqTheme.colors.primaryEnd))
    else
        Brush.linearGradient(
            listOf(
                SabqTheme.colors.primaryEnd.copy(alpha = 0.55f),
                SabqTheme.colors.primaryEnd.copy(alpha = 0.55f),
            ),
        )
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(bgBrush, shape)
            .clickable(enabled = enabled && !isLoading) { onClick() }
            .padding(vertical = 15.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
        ) {
        if (isLoading) {
            androidx.compose.material3.CircularProgressIndicator(
                color = Color.White,
                strokeWidth = 2.dp,
                modifier = Modifier.size(16.dp),
            )
            Spacer(modifier = Modifier.size(8.dp))
            Text(
                text = "جاري الإرسال...",
                style = SabqTheme.typography.cardTitle.copy(
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                ),
            )
        } else {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.Send,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(14.dp),
            )
            Spacer(modifier = Modifier.size(8.dp))
            Text(
                text = if (kind == ArticleSubmissionKind.Opinion) "إرسال المقالة" else "إرسال الخبر",
                style = SabqTheme.typography.cardTitle.copy(
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                ),
            )
        }
    }
}

@Composable
private fun SuccessHero(tint: Color) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 12.dp)
            .size(180.dp),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .size(130.dp)
                .clip(CircleShape)
                .background(
                    Brush.linearGradient(
                        listOf(tint.copy(alpha = 0.20f), tint.copy(alpha = 0.05f)),
                    ),
                ),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Filled.CheckCircle,
                contentDescription = null,
                tint = tint,
                modifier = Modifier.size(80.dp),
            )
        }
    }
}

@Composable
private fun EncouragementCard(kind: ArticleSubmissionKind) {
    SurfaceCard {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(
                text = if (kind == ArticleSubmissionKind.Opinion)
                    "شكراً لك على إثرائنا ✨"
                else
                    "شكراً لك على إثراء غرفة الأخبار 📰",
                style = SabqTheme.typography.cardTitle.copy(
                    fontSize = 19.sp,
                    fontWeight = FontWeight.Bold,
                    color = SabqTheme.colors.ink,
                ),
            )
            Text(
                text = if (kind == ArticleSubmissionKind.Opinion)
                    "وصلت مقالتك إلى غرفة التحرير. سنراجعها قبل النشر، وستصلك إشعارات بحالتها."
                else
                    "وصل خبرك إلى غرفة الأخبار. سنراجعه قبل النشر، وستصلك إشعارات بحالته.",
                style = SabqTheme.typography.body.copy(
                    fontSize = 14.sp,
                    color = SabqTheme.colors.secondaryInk,
                ),
            )
        }
    }
}
