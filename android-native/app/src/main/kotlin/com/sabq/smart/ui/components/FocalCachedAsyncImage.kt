package com.sabq.smart.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.BiasAlignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import coil.compose.AsyncImage
import coil.request.ImageRequest
import androidx.compose.ui.platform.LocalContext
import com.sabq.smart.ui.theme.SabqTheme

/**
 * Normalised focal point: `(0,0)` = top-left, `(1,1)` = bottom-right.
 * Mirrors iOS `ImageFocalPoint`, which is what the server returns via
 * `formatArticleForMobile.image_focal_point`.
 *
 * The backend persists focal points as percentages (0–100) in JSONB —
 * legacy rows may also ship 0–1 floats. Use [normalised] to coerce
 * whichever encoding the API returned into the 0–1 range Compose's
 * BiasAlignment expects.
 */
data class ImageFocalPoint(val x: Float, val y: Float) {
    companion object {
        fun normalised(rawX: Float?, rawY: Float?): ImageFocalPoint? {
            if (rawX == null || rawY == null) return null
            fun norm(v: Float): Float {
                val unit = if (v > 1f) v / 100f else v
                return unit.coerceIn(0f, 1f)
            }
            return ImageFocalPoint(norm(rawX), norm(rawY))
        }
    }
}

/**
 * Cached image that fills its container while keeping the
 * editor-picked focal point inside the visible viewport — the
 * `object-fit: cover` + `object-position: x% y%` behaviour the iOS
 * [FocalCachedAsyncImage] implements (SabqComponents.swift, lines
 * 401-513).
 *
 * Compose vs. iOS: SwiftUI's `aspectRatio(.fill)` always centres.
 * Compose has [BiasAlignment] which maps focal `(0..1)` directly to a
 * continuous bias `(-1..1)`; combined with [ContentScale.Crop] this
 * delivers the same visual without the manual offset math iOS uses.
 *
 * RTL: we force `LayoutDirection.Ltr` while computing alignment so
 * `horizontalBias = focal.x*2-1` always means "left of image" for
 * focal.x = 0 — same fix iOS applies at line 451.
 *
 * `null` focal → centre fill (identical to standard `Crop`).
 */
@Composable
fun FocalCachedAsyncImage(
    url: String?,
    focalPoint: ImageFocalPoint?,
    modifier: Modifier = Modifier,
    placeholder: @Composable () -> Unit = { FocalImagePlaceholder() },
) {
    val focal = focalPoint ?: ImageFocalPoint(0.5f, 0.5f)
    val alignment = BiasAlignment(
        horizontalBias = focal.x * 2f - 1f,
        verticalBias = focal.y * 2f - 1f,
    )

    Box(modifier = modifier.clipToBounds()) {
        if (url.isNullOrBlank()) {
            placeholder()
            return@Box
        }

        val context = LocalContext.current
        val request = ImageRequest.Builder(context)
            .data(url)
            .crossfade(250)
            .build()

        // العنصر النائب يُرسم كطبقة خلفية دائمة: يظهر أثناء التحميل وعند
        // الفشل وتغطيه الصورة عند النجاح — هذا ما سمح باستبدال
        // SubcomposeAsyncImage (كلفة subcomposition لكل صورة في القوائم،
        // تدقيق الأداء 2026-08-02) بـ AsyncImage العادي دون تغيير بصري.
        placeholder()

        // Force LTR locally so BiasAlignment math is consistent
        // regardless of the outer layout direction. The image bitmap
        // itself is not mirrored — it's just pixels.
        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
            AsyncImage(
                model = request,
                contentDescription = null,
                modifier = Modifier.fillMaxSize(),
                alignment = alignment,
                contentScale = ContentScale.Crop,
                onError = { errorState ->
                    android.util.Log.e("FocalImage", "Failed to load image: $url", errorState.result.throwable)
                },
            )
        }
    }
}

@Composable
private fun FocalImagePlaceholder() {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(SabqTheme.colors.paleFill),
    )
}
