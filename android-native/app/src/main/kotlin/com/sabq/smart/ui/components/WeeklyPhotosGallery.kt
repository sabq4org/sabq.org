package com.sabq.smart.ui.components

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Image
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.SubcomposeAsyncImage
import coil.request.ImageRequest
import com.sabq.smart.data.WeeklyPhoto
import com.sabq.smart.ui.theme.SabqTheme
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.runtime.rememberCoroutineScope
import kotlinx.coroutines.launch

/**
 * "صور الأسبوع" timeline gallery. iOS counterpart:
 * `ArticleDetailView.weeklyPhotosGallery` (Screens/ArticleDetailView.swift:973).
 *
 * Layout:
 *   • Header: square camera tile + "صور الأسبوع" + gradient divider.
 *   • Continuous vertical rail (leading edge — right in RTL).
 *   • Each photo: dot marker on the rail + 16:10 image + caption card.
 *   • Photo carries a rank pill (1, 2, 3…) in the top-leading corner.
 *   • Tap on image → fullscreen [WeeklyPhotosLightbox].
 *   • Footer dot below the last entry, matching the web component.
 */
@Composable
fun WeeklyPhotosGallery(
    photos: List<WeeklyPhoto>,
    fontSize: Float,
    lineSpacing: Float,
) {
    val valid = remember(photos) { photos.filter { it.imageUrl.isNotBlank() } }
    if (valid.isEmpty()) return

    val haptics = rememberSabqHaptics()
    var lightboxStart by remember { mutableIntStateOf(-1) }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp),
        horizontalAlignment = Alignment.Start,
    ) {
        WeeklyPhotosHeader()
        Spacer(modifier = Modifier.height(28.dp))

        Box(modifier = Modifier.fillMaxWidth()) {
            // Vertical timeline rail — leading edge in RTL = visual
            // right. Compose's Box places content at top-start; with
            // sabqRTL active the start IS the right side, matching
            // iOS `.topLeading` placement.
            Box(
                modifier = Modifier
                    .padding(start = 10.dp, top = 20.dp, bottom = 20.dp)
                    .width(2.dp)
                    .fillMaxSize()
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(
                                SabqTheme.colors.primaryEnd.copy(alpha = 0.20f),
                                SabqTheme.colors.primaryEnd.copy(alpha = 0.40f),
                                SabqTheme.colors.primaryEnd.copy(alpha = 0.20f),
                            ),
                        ),
                    ),
            )

            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(28.dp),
            ) {
                valid.forEachIndexed { index, photo ->
                    WeeklyPhotoEntry(
                        index = index,
                        photo = photo,
                        fontSize = fontSize,
                        lineSpacing = lineSpacing,
                        onImageTap = {
                            haptics.light()
                            lightboxStart = index
                        },
                    )
                }
            }
        }

        // Closing dot below the last entry — mirrors the web's
        // terminator. iOS line 1004-1012.
        Spacer(modifier = Modifier.height(22.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.Center,
        ) {
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .clip(CircleShape)
                    .background(SabqTheme.colors.primaryEnd),
            )
        }
    }

    if (lightboxStart >= 0) {
        WeeklyPhotosLightbox(
            photos = valid,
            startIndex = lightboxStart,
            onDismiss = { lightboxStart = -1 },
        )
    }
}

@Composable
private fun WeeklyPhotosHeader() {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(SabqTheme.colors.primaryEnd.copy(alpha = 0.10f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Filled.CameraAlt,
                contentDescription = null,
                tint = SabqTheme.colors.primaryEnd,
                modifier = Modifier.size(20.dp),
            )
        }
        Text(
            text = "صور الأسبوع",
            fontSize = 22.sp,
            fontWeight = FontWeight.Black,
            color = SabqTheme.colors.ink,
        )
        Box(
            modifier = Modifier
                .weight(1f)
                .height(1.dp)
                .background(
                    Brush.horizontalGradient(
                        colors = listOf(
                            Color.Transparent,
                            SabqTheme.colors.outline,
                            Color.Transparent,
                        ),
                    ),
                ),
        )
    }
}

@Composable
private fun WeeklyPhotoEntry(
    index: Int,
    photo: WeeklyPhoto,
    fontSize: Float,
    lineSpacing: Float,
    onImageTap: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalAlignment = Alignment.Top,
    ) {
        // Dot column rendered first so it sits on the leading edge —
        // visual right in RTL. Width 22 dp / dot 14 dp centres the
        // dot at 11 dp from the start, matching the rail's centre
        // (10 dp padding + 2 dp rail / 2 = 11 dp).
        Box(
            modifier = Modifier
                .width(22.dp)
                .padding(top = 16.dp),
            contentAlignment = Alignment.TopCenter,
        ) {
            Box(
                modifier = Modifier
                    .shadow(
                        elevation = 4.dp,
                        shape = CircleShape,
                        ambientColor = SabqTheme.colors.primaryEnd.copy(alpha = 0.4f),
                        spotColor = SabqTheme.colors.primaryEnd.copy(alpha = 0.4f),
                    )
                    .size(14.dp)
                    .clip(CircleShape)
                    .background(SabqTheme.colors.primaryEnd)
                    .border(width = 4.dp, color = SabqTheme.colors.background, shape = CircleShape),
            )
        }

        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            WeeklyPhotoImage(index = index, photo = photo, onTap = onImageTap)
            WeeklyPhotoCaption(photo = photo, fontSize = fontSize, lineSpacing = lineSpacing)
        }
    }
}

@Composable
private fun WeeklyPhotoImage(
    index: Int,
    photo: WeeklyPhoto,
    onTap: () -> Unit,
) {
    val context = LocalContext.current
    val shape = RoundedCornerShape(16.dp)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .aspectRatio(16f / 10f)
            .shadow(elevation = 10.dp, shape = shape)
            .clip(shape)
            .background(SabqTheme.colors.paleFill, shape)
            .border(
                width = 0.5.dp,
                color = SabqTheme.colors.outline.copy(alpha = 0.30f),
                shape = shape,
            )
            .pointerInput(photo.imageUrl) {
                detectTapGestures(onTap = { onTap() })
            },
    ) {
        SubcomposeAsyncImage(
            model = ImageRequest.Builder(context)
                .data(photo.imageUrl)
                .crossfade(180)
                .build(),
            contentDescription = photo.caption.ifBlank { null },
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize(),
            loading = { WeeklyPhotoPlaceholder() },
            error = { WeeklyPhotoPlaceholder() },
        )

        // Rank pill — top-leading (visual top-right in RTL), mirroring
        // iOS `.padding(12)` inset.
        Box(
            modifier = Modifier
                .padding(12.dp)
                .shadow(
                    elevation = 5.dp,
                    shape = CircleShape,
                    ambientColor = SabqTheme.colors.primaryEnd.copy(alpha = 0.4f),
                    spotColor = SabqTheme.colors.primaryEnd.copy(alpha = 0.4f),
                )
                .clip(CircleShape)
                .background(SabqTheme.colors.primaryEnd, CircleShape)
                .padding(horizontal = 11.dp, vertical = 5.dp),
        ) {
            Text(
                text = "${index + 1}",
                fontSize = 13.sp,
                fontWeight = FontWeight.Black,
                color = Color.White,
                fontFamily = FontFamily.Default,
            )
        }
    }
}

@Composable
private fun WeeklyPhotoPlaceholder() {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.linearGradient(
                    colors = listOf(
                        SabqTheme.colors.primaryEnd.copy(alpha = 0.10f),
                        SabqTheme.colors.coral.copy(alpha = 0.06f),
                    ),
                ),
            ),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = Icons.Filled.Image,
            contentDescription = null,
            tint = SabqTheme.colors.primaryEnd.copy(alpha = 0.35f),
            modifier = Modifier.size(36.dp),
        )
    }
}

@Composable
private fun WeeklyPhotoCaption(
    photo: WeeklyPhoto,
    fontSize: Float,
    lineSpacing: Float,
) {
    val shape = RoundedCornerShape(16.dp)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(SabqTheme.colors.paleFill.copy(alpha = 0.40f), shape)
            .border(
                width = 0.5.dp,
                color = SabqTheme.colors.outline.copy(alpha = 0.35f),
                shape = shape,
            )
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (photo.caption.isNotEmpty()) {
            Text(
                text = photo.caption,
                fontSize = fontSize.sp,
                lineHeight = (fontSize + lineSpacing).sp,
                color = SabqTheme.colors.ink.copy(alpha = 0.92f),
            )
        }
        if (photo.credit.isNotEmpty()) {
            // Visible only when there's text above to separate from.
            if (photo.caption.isNotEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(0.5.dp)
                        .background(SabqTheme.colors.outline.copy(alpha = 0.5f)),
                )
            }
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(
                    imageVector = Icons.Filled.CameraAlt,
                    contentDescription = null,
                    tint = SabqTheme.colors.tertiaryInk,
                    modifier = Modifier.size(12.dp),
                )
                Text(
                    text = photo.credit,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = SabqTheme.colors.tertiaryInk,
                )
            }
        }
    }
}

/**
 * Fullscreen weekly-photos lightbox. iOS counterpart:
 * `WeeklyPhotosLightbox` at Screens/ArticleDetailView.swift:1825.
 *
 *   • Blurred-black backdrop, tap anywhere outside the controls to close.
 *   • Rank pill (N / Total) top-leading.
 *   • Close X top-trailing.
 *   • RTL-correct chevron-right (previous) + chevron-left (next).
 *   • Caption + credit panel under the photo when present.
 *   • Dot indicator row at the bottom (active dot is a 22 dp pill).
 */
@Composable
fun WeeklyPhotosLightbox(
    photos: List<WeeklyPhoto>,
    startIndex: Int,
    onDismiss: () -> Unit,
) {
    val haptics = rememberSabqHaptics()
    val pagerState = rememberPagerState(initialPage = startIndex, pageCount = { photos.size })
    val coroutineScope = rememberCoroutineScope()
    val index = pagerState.currentPage
    val current = photos[index]

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            dismissOnBackPress = true,
            dismissOnClickOutside = false,
            decorFitsSystemWindows = false,
        ),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.92f))
                // Tap anywhere outside the photo / controls dismisses
                // — same affordance iOS uses on the backdrop.
                .pointerInput(Unit) {
                    detectTapGestures(onTap = {
                        haptics.light()
                        onDismiss()
                    })
                },
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .systemBarsPadding(),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(
                    modifier = Modifier
                        .padding(horizontal = 12.dp)
                        .fillMaxWidth()
                        .aspectRatio(16f / 10f),
                ) {
                    val photoShape = RoundedCornerShape(18.dp)
                    HorizontalPager(
                        state = pagerState,
                        modifier = Modifier
                            .fillMaxSize()
                            .clip(photoShape)
                            .background(Color.Black.copy(alpha = 0.6f), photoShape)
                    ) { page ->
                        val photo = photos[page]
                        SubcomposeAsyncImage(
                            model = ImageRequest.Builder(LocalContext.current)
                                .data(photo.imageUrl)
                                .crossfade(180)
                                .size(4096)
                                .build(),
                            contentDescription = photo.caption.ifBlank { null },
                            contentScale = ContentScale.Fit,
                            modifier = Modifier.fillMaxSize(),
                        )
                    }

                    // Rank pill + close X — top row.
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(14.dp),
                        verticalAlignment = Alignment.Top,
                    ) {
                        Box(
                            modifier = Modifier
                                .shadow(
                                    elevation = 6.dp,
                                    shape = CircleShape,
                                    spotColor = Color.Black.copy(alpha = 0.4f),
                                )
                                .clip(CircleShape)
                                .background(SabqTheme.colors.primaryEnd, CircleShape)
                                .padding(horizontal = 14.dp, vertical = 6.dp),
                        ) {
                            Text(
                                text = "${index + 1} / ${photos.size}",
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Black,
                                color = Color.White,
                            )
                        }
                        Spacer(modifier = Modifier.weight(1f))
                        Box(
                            modifier = Modifier
                                .size(36.dp)
                                .clip(CircleShape)
                                .background(Color.White.copy(alpha = 0.15f), CircleShape)
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

                    // Prev / Next chevrons. ArrowForward / ArrowBack
                    // would be wrong in RTL; we use AutoMirrored to
                    // keep the semantics — the right arrow always
                    // points to "previous" in RTL because
                    // KeyboardArrowRight auto-mirrors visually.
                    Row(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(horizontal = 14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        // Visual right side in RTL = previous.
                        LightboxArrow(
                            icon = Icons.AutoMirrored.Filled.KeyboardArrowRight,
                            onTap = {
                                haptics.light()
                                coroutineScope.launch {
                                    val prev = if (pagerState.currentPage == 0) photos.lastIndex else pagerState.currentPage - 1
                                    pagerState.animateScrollToPage(prev)
                                }
                            },
                        )
                        Spacer(modifier = Modifier.weight(1f))
                        LightboxArrow(
                            icon = Icons.AutoMirrored.Filled.KeyboardArrowLeft,
                            onTap = {
                                haptics.light()
                                coroutineScope.launch {
                                    val next = if (pagerState.currentPage == photos.lastIndex) 0 else pagerState.currentPage + 1
                                    pagerState.animateScrollToPage(next)
                                }
                            },
                        )
                    }
                }

                // Caption + credit panel.
                if (current.caption.isNotEmpty() || current.credit.isNotEmpty()) {
                    val panelShape = RoundedCornerShape(16.dp)
                    Column(
                        modifier = Modifier
                            .padding(horizontal = 18.dp, vertical = 18.dp)
                            .fillMaxWidth()
                            .clip(panelShape)
                            .background(Color.White.copy(alpha = 0.06f), panelShape)
                            .border(
                                width = 0.5.dp,
                                color = Color.White.copy(alpha = 0.12f),
                                shape = panelShape,
                            )
                            .padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        if (current.caption.isNotEmpty()) {
                            Text(
                                text = current.caption,
                                fontSize = 15.sp,
                                lineHeight = 21.sp,
                                color = Color.White,
                            )
                        }
                        if (current.credit.isNotEmpty()) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                Icon(
                                    imageVector = Icons.Filled.CameraAlt,
                                    contentDescription = null,
                                    tint = Color.White.copy(alpha = 0.55f),
                                    modifier = Modifier.size(11.dp),
                                )
                                Text(
                                    text = current.credit,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = Color.White.copy(alpha = 0.55f),
                                )
                            }
                        }
                    }
                }

                // Dot indicator row — active dot is a 22 dp capsule
                // matching iOS.
                Row(
                    modifier = Modifier
                        .padding(top = 4.dp, bottom = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    photos.forEachIndexed { i, _ ->
                        val active = i == index
                        val width by animateDpAsState(
                            targetValue = if (active) 22.dp else 6.dp,
                            animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
                            label = "lightboxDotWidth",
                        )
                        Box(
                            modifier = Modifier
                                .width(width)
                                .height(6.dp)
                                .clip(CircleShape)
                                .background(
                                    if (active) SabqTheme.colors.primaryEnd
                                    else Color.White.copy(alpha = 0.30f),
                                ),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun LightboxArrow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    onTap: () -> Unit,
) {
    Box(
        modifier = Modifier
            .shadow(
                elevation = 6.dp,
                shape = CircleShape,
                spotColor = Color.Black.copy(alpha = 0.3f),
            )
            .size(48.dp)
            .clip(CircleShape)
            .background(Color.White.copy(alpha = 0.18f), CircleShape)
            .pointerInput(Unit) {
                detectTapGestures(onTap = { onTap() })
            },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = Color.White,
            modifier = Modifier.size(22.dp),
        )
    }
}
