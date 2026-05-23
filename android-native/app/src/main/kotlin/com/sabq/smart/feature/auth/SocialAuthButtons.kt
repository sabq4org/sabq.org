package com.sabq.smart.feature.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.ui.res.painterResource
import com.sabq.smart.R
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sabq.smart.feature.auth.GoogleSignInHelper.GoogleSignInOutcome
import com.sabq.smart.ui.theme.SabqTheme
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin
import kotlinx.coroutines.launch

/**
 * Apple + Google sign-in buttons that drive [AuthViewModel.loginWithGoogle]
 * / [loginWithApple]. Surfaces errors back through the same form-state
 * flow as the email path so the existing error banner just works.
 *
 * Layout matches iOS PR #57: localised text first, brand glyph at the
 * end of the label so the icon sits in the natural RTL "trailing"
 * position. The Apple button uses the system Apple logo; the Google
 * button renders a Canvas-drawn G with the official four brand colors
 * so we don't have to ship an asset.
 *
 * Apple Sign-In on Android requires a Custom-Tab + backend redirect
 * deep-link flow (Apple has no native Android SDK). The Apple button
 * here is wired to surface a "قريباً" notice until that backend piece
 * ships — Google still works fully and unblocks the majority of users.
 */
@Composable
fun SocialAuthButtons(
    viewModel: AuthViewModel,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val helper = remember { GoogleSignInHelper() }
    var googleInFlight by remember { mutableStateOf(false) }

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        AppleSignInButton(
            onClick = {
                viewModel.setExternalAuthError(
                    "تسجيل الدخول بـ Apple على Android قريباً — يرجى استخدام Google أو البريد الإلكتروني",
                )
            },
        )
        GoogleSignInButton(
            isLoading = googleInFlight,
            onClick = {
                if (googleInFlight) return@GoogleSignInButton
                scope.launch {
                    googleInFlight = true
                    try {
                        when (val outcome = helper.signIn(context)) {
                            is GoogleSignInOutcome.Success ->
                                viewModel.loginWithGoogle(outcome.idToken)
                            GoogleSignInOutcome.Cancelled -> {
                                // Silent — user backed out of the picker.
                            }
                            is GoogleSignInOutcome.Unavailable ->
                                viewModel.setExternalAuthError(outcome.reason)
                            is GoogleSignInOutcome.Failed ->
                                viewModel.setExternalAuthError(outcome.reason)
                        }
                    } finally {
                        googleInFlight = false
                    }
                }
            },
        )
        DividerOr()
    }
}

@Composable
private fun AppleSignInButton(onClick: () -> Unit) {
    val shape = RoundedCornerShape(SabqTheme.dimens.buttonRadius)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(50.dp)
            .clip(shape)
            .background(Color.Black, shape)
            .clickable { onClick() }
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        Text(
            text = "تسجيل الدخول بـ Apple",
            color = Color.White,
            fontSize = 16.sp,
            fontWeight = FontWeight.SemiBold,
        )
        Box(modifier = Modifier.size(width = 10.dp, height = 1.dp))
        Icon(
            painter = painterResource(id = R.drawable.ic_apple_logo),
            contentDescription = null,
            tint = Color.White,
            modifier = Modifier.size(18.dp),
        )
    }
}

@Composable
private fun GoogleSignInButton(isLoading: Boolean, onClick: () -> Unit) {
    val shape = RoundedCornerShape(SabqTheme.dimens.buttonRadius)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(50.dp)
            .clip(shape)
            .background(Color.White, shape)
            .border(width = 1.dp, color = SabqTheme.colors.outline.copy(alpha = 0.5f), shape = shape)
            .clickable(enabled = !isLoading) { onClick() }
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        Text(
            text = if (isLoading) "جارٍ تسجيل الدخول…" else "المتابعة باستخدام Google",
            color = SabqTheme.colors.ink,
            fontSize = 16.sp,
            fontWeight = FontWeight.SemiBold,
        )
        Box(modifier = Modifier.size(width = 10.dp, height = 1.dp))
        GoogleGLogo(modifier = Modifier.size(20.dp))
    }
}

@Composable
private fun DividerOr() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        HorizontalDivider(
            modifier = Modifier.weight(1f),
            color = SabqTheme.colors.outline.copy(alpha = 0.5f),
        )
        Text(
            text = "أو",
            color = SabqTheme.colors.tertiaryInk,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
        )
        HorizontalDivider(
            modifier = Modifier.weight(1f),
            color = SabqTheme.colors.outline.copy(alpha = 0.5f),
        )
    }
}

/** Google "G" mark drawn with Canvas paths — four colored arcs forming
 *  an almost-closed ring with a horizontal blue bar extending into the
 *  gap. Approximates the official Google logo without shipping a vector
 *  drawable. Mirrors the iOS `GoogleGLogo` Canvas implementation in
 *  PR #57 (`Components/SocialAuthButtons.swift`). */
@Composable
fun GoogleGLogo(modifier: Modifier = Modifier) {
    val blue   = Color(0xFF4285F4)
    val red    = Color(0xFFEA4335)
    val yellow = Color(0xFFFBBC04)
    val green  = Color(0xFF34A853)

    androidx.compose.foundation.Canvas(modifier = modifier) {
        val s = kotlin.math.min(size.width, size.height)
        val lineW = s * 0.22f
        val radius = (s - lineW) / 2f
        val center = Offset(size.width / 2f, size.height / 2f)

        fun arcPath(startDeg: Float, endDeg: Float): Path {
            // androidx.compose.ui.graphics.Path doesn't expose addArc with
            // angle/radius the way SwiftUI does, so we approximate the arc
            // as a quadratic-Bezier-rich polyline with enough segments to
            // look smooth at the 20–24 dp glyph size we render at.
            val path = Path()
            val sweep = endDeg - startDeg
            val steps = 24
            val startRad = startDeg * (PI / 180.0)
            val firstX = center.x + radius * cos(startRad).toFloat()
            val firstY = center.y + radius * sin(startRad).toFloat()
            path.moveTo(firstX, firstY)
            for (i in 1..steps) {
                val t = i.toFloat() / steps
                val angleDeg = startDeg + sweep * t
                val angleRad = angleDeg * (PI / 180.0)
                val x = center.x + radius * cos(angleRad).toFloat()
                val y = center.y + radius * sin(angleRad).toFloat()
                path.lineTo(x, y)
            }
            return path
        }

        val stroke = Stroke(width = lineW, cap = StrokeCap.Butt)

        drawPath(path = arcPath(-155f, -90f), color = red, style = stroke)
        drawPath(path = arcPath(-90f, -25f), color = blue, style = stroke)
        drawPath(path = arcPath(25f, 90f), color = green, style = stroke)
        drawPath(path = arcPath(90f, 205f), color = yellow, style = stroke)

        // Horizontal blue bar from the center to the right edge.
        val barPath = Path().apply {
            moveTo(center.x, center.y)
            lineTo(center.x + radius + lineW / 2f, center.y)
        }
        drawPath(path = barPath, color = blue, style = stroke)
    }
}
