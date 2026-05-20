package com.sabq.smart.feature.onboarding

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.spring
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
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Newspaper
import androidx.compose.material.icons.filled.TextFields
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sabq.smart.ui.theme.SabqTheme
import kotlinx.coroutines.launch

/**
 * 4-slide welcome flow shown once per major version. Ports iOS
 * `Screens/OnboardingView.swift` 1:1 — same slide order, copy, icons,
 * tints, and bottom-bar layout (capsule indicators + brand-gradient
 * CTA + "تخطّي" link).
 *
 * Completion is persisted via `SettingsStore` under the same key name
 * iOS uses (`sabqHasCompletedOnboardingV2`). [onComplete] is invoked
 * when the user taps "ابدأ الآن" on the last slide OR "تخطّي" on any
 * earlier slide. The host (SabqApp) hides the cover once the persisted
 * flag flips to true.
 */
@Composable
fun OnboardingScreen(onComplete: () -> Unit) {
    val slides = onboardingSlides()
    val pagerState = rememberPagerState(pageCount = { slides.size })
    val scope = rememberCoroutineScope()

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(SabqTheme.colors.background),
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            HorizontalPager(
                state = pagerState,
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
            ) { page ->
                SlideContent(slide = slides[page])
            }
            BottomBar(
                slides = slides,
                currentPage = pagerState.currentPage,
                onNext = {
                    if (pagerState.currentPage < slides.lastIndex) {
                        scope.launch { pagerState.animateScrollToPage(pagerState.currentPage + 1) }
                    } else {
                        onComplete()
                    }
                },
                onSkip = onComplete,
            )
        }
    }
}

@Composable
private fun SlideContent(slide: OnboardingSlide) {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(30.dp),
    ) {
        Spacer(modifier = Modifier.weight(1f))

        // Concentric circles + icon (1:1 with iOS: 160dp filled + 200dp stroked)
        Box(contentAlignment = Alignment.Center) {
            Box(
                modifier = Modifier
                    .size(200.dp)
                    .clip(CircleShape)
                    .border(width = 1.dp, color = slide.tint.copy(alpha = 0.20f), shape = CircleShape),
            )
            Box(
                modifier = Modifier
                    .size(160.dp)
                    .clip(CircleShape)
                    .background(slide.tint.copy(alpha = 0.12f)),
            )
            Icon(
                imageVector = slide.icon,
                contentDescription = null,
                tint = slide.tint,
                modifier = Modifier.size(64.dp),
            )
        }

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(
                text = slide.title,
                fontSize = 26.sp,
                fontWeight = FontWeight.Black,
                color = SabqTheme.colors.ink,
                textAlign = TextAlign.Center,
                lineHeight = 34.sp,
            )
            Text(
                text = slide.body,
                fontSize = 15.sp,
                color = SabqTheme.colors.secondaryInk,
                textAlign = TextAlign.Center,
                lineHeight = 23.sp,
            )
        }

        Spacer(modifier = Modifier.weight(1f))
    }
}

@Composable
private fun BottomBar(
    slides: List<OnboardingSlide>,
    currentPage: Int,
    onNext: () -> Unit,
    onSkip: () -> Unit,
) {
    val activeTint = slides[currentPage].tint
    val isLast = currentPage == slides.lastIndex
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .navigationBarsPadding()
            .padding(horizontal = 26.dp)
            .padding(top = 16.dp, bottom = 30.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        Indicators(
            slideCount = slides.size,
            currentPage = currentPage,
            activeTint = activeTint,
        )
        PrimaryButton(label = if (isLast) "ابدأ الآن" else "التالي", onClick = onNext)
        Box(modifier = Modifier.height(18.dp)) {
            if (!isLast) {
                Text(
                    text = "تخطّي",
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = SabqTheme.colors.tertiaryInk,
                    modifier = Modifier
                        .clickable { onSkip() }
                        .padding(horizontal = 8.dp, vertical = 2.dp),
                )
            }
        }
    }
}

@Composable
private fun Indicators(slideCount: Int, currentPage: Int, activeTint: Color) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        repeat(slideCount) { index ->
            val isActive = currentPage == index
            val width by animateDpAsState(
                targetValue = if (isActive) 24.dp else 8.dp,
                animationSpec = spring(dampingRatio = 0.85f, stiffness = 400f),
                label = "indicator-width",
            )
            Box(
                modifier = Modifier
                    .width(width)
                    .height(8.dp)
                    .clip(CircleShape)
                    .background(
                        if (isActive) activeTint else SabqTheme.colors.outline.copy(alpha = 0.6f),
                    ),
            )
        }
    }
}

@Composable
private fun PrimaryButton(label: String, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(CircleShape)
            .background(
                Brush.linearGradient(
                    listOf(SabqTheme.colors.primaryStart, SabqTheme.colors.primaryEnd),
                ),
            )
            .clickable { onClick() }
            .padding(vertical = 14.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            fontSize = 16.sp,
            fontWeight = FontWeight.Black,
            color = Color.White,
        )
    }
}

// ────────────────────── Slide data ──────────────────────

private data class OnboardingSlide(
    val icon: ImageVector,
    val tint: Color,
    val title: String,
    val body: String,
)

@Composable
private fun onboardingSlides(): List<OnboardingSlide> = listOf(
    OnboardingSlide(
        icon = Icons.Filled.Newspaper,
        tint = SabqTheme.colors.primaryEnd,
        title = "أهلاً بك في سبق",
        body = "صحيفتك العربية الذكية — قراءة هادئة، محتوى موثوق، ذكاء اصطناعي شفّاف.",
    ),
    OnboardingSlide(
        icon = Icons.Filled.VerifiedUser,
        tint = Color(red = 0.16f, green = 0.68f, blue = 0.40f),
        title = "جواز المحتوى",
        body = "كل خبر تشاهده مرفق بـ جواز يكشف: من كتبه، من راجعه، نسبة الذكاء الاصطناعي، ومصدر الخبر — بشفّافية كاملة.",
    ),
    OnboardingSlide(
        icon = Icons.Filled.TextFields,
        tint = SabqTheme.colors.sky,
        title = "اقرأ كما تحب",
        body = "تحكّم في حجم الخط وتباعد الأسطر، استخدم خطّ القراءة الهادئ، وفعّل وضع التركيز لتجربة قراءة خالية من المشتّتات.",
    ),
    OnboardingSlide(
        icon = Icons.Filled.AutoAwesome,
        tint = SabqTheme.colors.coral,
        title = "اكتشاف ذكي",
        body = "تقويم الأحداث، تحليلات عميقة بالذكاء الاصطناعي، نشرات صوتية يومية، وموجز شخصي بناءً على اهتماماتك.",
    ),
)
