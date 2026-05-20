package com.sabq.smart.ui.components

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.rememberTransformableState
import androidx.compose.foundation.gestures.transformable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.SubcomposeAsyncImage
import coil.request.ImageRequest
import androidx.compose.ui.platform.LocalContext

/**
 * Full-screen image viewer surfaced when a reader taps the hero or an
 * inline image inside the article body. Mirrors iOS
 * `Components/SabqComponents.swift` → `ImageLightbox`.
 *
 * Gestures (matched 1:1 with iOS):
 *   • pinch-to-zoom — scale clamped to [1.0, 5.0]
 *   • drag-to-pan — only when zoomed in (scale > 1.01)
 *   • double-tap — toggles between 1.0 and 2.4 zoom
 *   • single tap — dismisses with light haptic
 *   • close X (top trailing) — dismisses with light haptic
 *   • release-below-1.01 — spring-snaps back to scale 1, offset zero
 */
@Composable
fun ImageLightbox(
    url: String?,
    onDismiss: () -> Unit,
) {
    if (url.isNullOrBlank()) {
        // Nothing to show — caller wired a nil URL, just dismiss.
        LaunchedEffect(Unit) { onDismiss() }
        return
    }

    val haptics = rememberSabqHaptics()

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            dismissOnBackPress = true,
            dismissOnClickOutside = false,
            decorFitsSystemWindows = false,
        ),
    ) {
        var scale by remember { mutableStateOf(1f) }
        var offsetX by remember { mutableStateOf(0f) }
        var offsetY by remember { mutableStateOf(0f) }

        // Animated mirrors — drive the rendered transform so we can
        // spring back to identity when the user releases below 1.01.
        val animatedScale by animateFloatAsState(
            targetValue = scale,
            animationSpec = spring(stiffness = Spring.StiffnessMediumLow, dampingRatio = 0.85f),
            label = "lightboxScale",
        )
        val animatedOffsetX by animateFloatAsState(
            targetValue = offsetX,
            animationSpec = spring(stiffness = Spring.StiffnessMediumLow, dampingRatio = 0.85f),
            label = "lightboxOffsetX",
        )
        val animatedOffsetY by animateFloatAsState(
            targetValue = offsetY,
            animationSpec = spring(stiffness = Spring.StiffnessMediumLow, dampingRatio = 0.85f),
            label = "lightboxOffsetY",
        )

        val transformState = rememberTransformableState { zoomChange, panChange, _ ->
            scale = (scale * zoomChange).coerceIn(1f, 5f)
            if (scale > 1.01f) {
                offsetX += panChange.x
                offsetY += panChange.y
            }
        }

        // iOS snaps offset+scale back to identity when the user
        // releases at scale ≤ 1.01. Compose equivalent: watch the
        // gesture-in-progress flag and reset when it flips off.
        LaunchedEffect(transformState.isTransformInProgress) {
            if (!transformState.isTransformInProgress && scale <= 1.01f) {
                scale = 1f
                offsetX = 0f
                offsetY = 0f
            }
        }

        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black)
                .pointerInput(Unit) {
                    detectTapGestures(
                        onDoubleTap = {
                            // Toggle 1.0 ⇄ 2.4 — same magnification iOS uses.
                            if (scale > 1.01f) {
                                scale = 1f
                                offsetX = 0f
                                offsetY = 0f
                            } else {
                                scale = 2.4f
                            }
                        },
                        onTap = {
                            haptics.light()
                            onDismiss()
                        },
                    )
                },
            contentAlignment = Alignment.Center,
        ) {
            val context = LocalContext.current
            // Image — pinch / pan attached only to the image so a tap
            // on the backdrop (outside the image) still dismisses
            // unambiguously, matching iOS's gesture scoping.
            SubcomposeAsyncImage(
                model = ImageRequest.Builder(context)
                    .data(url)
                    // Bigger ceiling than the feed cards' 2400 px — pinch
                    // stays sharp up to 5×. iOS uses 4096.
                    .size(4096)
                    .crossfade(180)
                    .build(),
                contentDescription = null,
                contentScale = ContentScale.Fit,
                modifier = Modifier
                    .fillMaxSize()
                    .graphicsLayer(
                        scaleX = animatedScale,
                        scaleY = animatedScale,
                        translationX = animatedOffsetX,
                        translationY = animatedOffsetY,
                    )
                    .transformable(state = transformState),
                loading = {
                    CircularProgressIndicator(
                        color = Color.White,
                        modifier = Modifier.size(34.dp),
                    )
                },
            )

            // Close X — top-trailing on screen. In RTL the Row pushes
            // the button to the right via Arrangement.Start (visual
            // left in LTR, right in RTL). Mirror iOS coords: 36×36
            // white circle at 18 % alpha, 14 sp bold xmark.
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .statusBarsPadding()
                    .padding(top = 8.dp, end = 18.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.Start,
                ) {
                    Spacer(modifier = Modifier.weight(1f))
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .clip(CircleShape)
                            .background(Color.White.copy(alpha = 0.18f), CircleShape)
                            .pointerInput(Unit) {
                                detectTapGestures(onTap = {
                                    haptics.light()
                                    onDismiss()
                                })
                            },
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Close,
                            contentDescription = "إغلاق",
                            tint = Color.White,
                            modifier = Modifier.size(14.dp),
                        )
                    }
                }
            }
        }
    }
}
