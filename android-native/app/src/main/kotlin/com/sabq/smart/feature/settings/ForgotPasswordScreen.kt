package com.sabq.smart.feature.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.MailOutline
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.sabq.smart.ui.theme.SabqTheme

/**
 * Forgot password sheet — full flow, mirroring iOS `ForgotPasswordSheet`:
 *   1. Email → POST /api/v1/auth/forgot-password (emails a 6-digit code)
 *   2. Code + new password → POST /api/v1/auth/reset-password
 *   3. Done.
 * كانت الشاشة «الخطوة الأولى فقط» فيصل المستخدمَ رمزٌ لا مكان لإدخاله —
 * جذر شكاوى «البريد يعطيني رمزًا بلا مكان» (أغسطس 2026).
 */
@Composable
fun ForgotPasswordScreen(
    onBack: () -> Unit,
    viewModel: AccountActionViewModel = hiltViewModel(),
) {
    LaunchedEffect(Unit) { viewModel.reset() }
    val state by viewModel.state.collectAsStateWithLifecycle()

    var step by remember { mutableStateOf(ForgotStep.Email) }
    var email by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var newPassword by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    // آخر إجراء أُرسل للخادم: إرسال/إعادة إرسال الرمز أم تعيين كلمة المرور —
    // بدونها نجاحُ «إعادة الإرسال» داخل خطوة الرمز يقفز خطأً إلى «تم».
    var awaitingReset by remember { mutableStateOf(false) }

    val emailValid = email.contains('@') && email.length >= 5
    val canSubmitReset = code.length == 6 &&
        newPassword.length >= 8 &&
        newPassword == confirmPassword &&
        !state.isLoading

    // نجاح الإجراء الجاري يحرّك الخطوة: إرسال الرمز → خطوة الرمز، تعيين → تم.
    LaunchedEffect(state.success) {
        if (state.success) {
            if (awaitingReset) {
                step = ForgotStep.Done
            } else {
                step = ForgotStep.Code
                viewModel.reset()
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(SabqTheme.colors.background),
    ) {
        SheetTopBar(onClose = onBack)
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp),
        ) {
            Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Icon(
                    imageVector = if (step == ForgotStep.Done) Icons.Filled.CheckCircle else Icons.Filled.MailOutline,
                    contentDescription = null,
                    tint = if (step == ForgotStep.Done) SabqTheme.colors.leaf else SabqTheme.colors.primaryEnd,
                    modifier = Modifier.size(48.dp),
                )
                Text(
                    text = if (step == ForgotStep.Done) "تم تغيير كلمة المرور" else "نسيت كلمة المرور؟",
                    style = SabqTheme.typography.cardTitle.copy(
                        fontSize = 22.sp,
                        fontWeight = FontWeight.Bold,
                        color = SabqTheme.colors.ink,
                    ),
                )
                Text(
                    text = when (step) {
                        ForgotStep.Email -> "أدخل بريدك الإلكتروني وسنرسل لك رمز التحقق لإعادة تعيين كلمة المرور."
                        ForgotStep.Code -> "أدخل الرمز المرسَل إلى:\n$email"
                        ForgotStep.Done -> "يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة."
                    },
                    style = SabqTheme.typography.metaSmall.copy(
                        fontSize = 13.sp,
                        color = SabqTheme.colors.secondaryInk,
                    ),
                    textAlign = TextAlign.Center,
                )
            }

            when (step) {
                ForgotStep.Email -> {
                    SheetField(
                        label = "البريد الإلكتروني",
                        value = email,
                        onValueChange = { email = it },
                        placeholder = "name@example.com",
                        keyboardType = KeyboardType.Email,
                    )
                    state.errorMessage?.let { ErrorBanner(message = it) }
                    PrimaryGradientButton(
                        title = "إرسال رمز التحقق",
                        isLoading = state.isLoading,
                        enabled = emailValid,
                        onClick = {
                            awaitingReset = false
                            viewModel.forgotPassword(email.trim())
                        },
                    )
                }

                ForgotStep.Code -> {
                    SheetField(
                        label = "رمز التحقق (6 أرقام)",
                        value = code,
                        onValueChange = { raw -> code = raw.filter { it.isDigit() }.take(6) },
                        placeholder = "••••••",
                        keyboardType = KeyboardType.NumberPassword,
                    )
                    SheetField(
                        label = "كلمة المرور الجديدة",
                        value = newPassword,
                        onValueChange = { newPassword = it },
                        placeholder = "8 أحرف على الأقل",
                        isSecure = true,
                    )
                    SheetField(
                        label = "تأكيد كلمة المرور",
                        value = confirmPassword,
                        onValueChange = { confirmPassword = it },
                        placeholder = "أعد كتابة كلمة المرور",
                        isSecure = true,
                    )
                    if (confirmPassword.isNotEmpty() && newPassword != confirmPassword) {
                        ErrorBanner(message = "كلمتا المرور غير متطابقتين")
                    }
                    state.errorMessage?.let { ErrorBanner(message = it) }
                    PrimaryGradientButton(
                        title = "تعيين كلمة المرور",
                        isLoading = state.isLoading,
                        enabled = canSubmitReset,
                        onClick = {
                            awaitingReset = true
                            viewModel.resetPassword(email.trim(), code, newPassword)
                        },
                    )
                    TextButton(
                        onClick = {
                            code = ""
                            awaitingReset = false
                            viewModel.forgotPassword(email.trim())
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(
                            text = "إعادة إرسال الرمز",
                            style = SabqTheme.typography.metaSmall.copy(
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Medium,
                                color = SabqTheme.colors.primaryEnd,
                            ),
                        )
                    }
                }

                ForgotStep.Done -> {
                    SuccessBanner(message = "تم تغيير كلمة المرور بنجاح")
                    PrimaryGradientButton(
                        title = "حسناً",
                        isLoading = false,
                        enabled = true,
                        onClick = onBack,
                    )
                }
            }
        }
    }
}

private enum class ForgotStep { Email, Code, Done }
