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
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.sabq.smart.ui.theme.SabqTheme

/**
 * Forgot password sheet — full reset flow, mirrors iOS
 * `ForgotPasswordSheet.swift`:
 *   1. email → POST /api/v1/auth/forgot-password (sends a 6-digit code)
 *   2. code + new password → POST /api/v1/auth/reset-password
 *   3. done
 *
 * الخادم يرسل «رمز تحقق» بالبريد وليس رابطًا — لا تصف الرسالة بأنها رابط.
 */
private enum class ResetStep { Email, Code, Done }

@Composable
fun ForgotPasswordScreen(
    onBack: () -> Unit,
    viewModel: AccountActionViewModel = hiltViewModel(),
) {
    LaunchedEffect(Unit) { viewModel.reset() }
    val state by viewModel.state.collectAsStateWithLifecycle()
    var step by remember { mutableStateOf(ResetStep.Email) }
    var email by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var newPassword by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }

    val emailValid = email.contains('@') && email.length >= 5
    val canSubmitReset = code.length == 6 &&
        newPassword.length >= 6 &&
        newPassword == confirmPassword &&
        !state.isLoading

    // نجاح طلب الرمز ينقل من خطوة البريد إلى خطوة الرمز. «إعادة الإرسال»
    // تنجح ونحن داخل خطوة الرمز فلا تُبدّل الخطوة؛ اكتمال التعيين ينتقل
    // عبر onSuccess في resetPassword لا من هنا.
    LaunchedEffect(state.success) {
        if (state.success && step == ResetStep.Email) step = ResetStep.Code
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
                    imageVector = if (step == ResetStep.Done) Icons.Filled.CheckCircle else Icons.Filled.MailOutline,
                    contentDescription = null,
                    tint = if (step == ResetStep.Done) SabqTheme.colors.leaf else SabqTheme.colors.primaryEnd,
                    modifier = Modifier.size(48.dp),
                )
                Text(
                    text = if (step == ResetStep.Done) "تم تغيير كلمة المرور" else "نسيت كلمة المرور؟",
                    style = SabqTheme.typography.cardTitle.copy(
                        fontSize = 22.sp,
                        fontWeight = FontWeight.Bold,
                        color = SabqTheme.colors.ink,
                    ),
                )
                when (step) {
                    ResetStep.Email -> Text(
                        text = "أدخل بريدك الإلكتروني وسنرسل لك رمز التحقق لإعادة تعيين كلمة المرور.",
                        textAlign = TextAlign.Center,
                        style = SabqTheme.typography.metaSmall.copy(
                            fontSize = 13.sp,
                            color = SabqTheme.colors.secondaryInk,
                        ),
                    )
                    ResetStep.Code -> Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
                        Text(
                            text = "أدخل الرمز المرسَل إلى:",
                            style = SabqTheme.typography.metaSmall.copy(
                                fontSize = 13.sp,
                                color = SabqTheme.colors.secondaryInk,
                            ),
                        )
                        Text(
                            text = email.trim(),
                            style = SabqTheme.typography.cardTitle.copy(
                                fontSize = 14.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = SabqTheme.colors.ink,
                            ),
                        )
                    }
                    ResetStep.Done -> Text(
                        text = "تم تغيير كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول.",
                        textAlign = TextAlign.Center,
                        style = SabqTheme.typography.metaSmall.copy(
                            fontSize = 13.sp,
                            color = SabqTheme.colors.secondaryInk,
                        ),
                    )
                }
            }

            when (step) {
                ResetStep.Email -> {
                    SheetField(
                        label = "البريد الإلكتروني",
                        value = email,
                        onValueChange = { email = it },
                        placeholder = "name@example.com",
                        keyboardType = KeyboardType.Email,
                        imeAction = ImeAction.Done,
                    )
                    state.errorMessage?.let { ErrorBanner(message = it) }
                    PrimaryGradientButton(
                        title = "إرسال رمز التحقق",
                        isLoading = state.isLoading,
                        enabled = emailValid,
                        onClick = { viewModel.forgotPassword(email.trim()) },
                    )
                }

                ResetStep.Code -> {
                    SheetField(
                        label = "رمز التحقق (6 أرقام)",
                        value = code,
                        onValueChange = { new -> code = new.filter(Char::isDigit).take(6) },
                        placeholder = "123456",
                        keyboardType = KeyboardType.Number,
                    )
                    SheetField(
                        label = "كلمة المرور الجديدة (٦ أحرف فأكثر)",
                        value = newPassword,
                        onValueChange = { newPassword = it },
                        placeholder = "••••••",
                        isSecure = true,
                    )
                    SheetField(
                        label = "تأكيد كلمة المرور",
                        value = confirmPassword,
                        onValueChange = { confirmPassword = it },
                        placeholder = "••••••",
                        isSecure = true,
                        imeAction = ImeAction.Done,
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
                            viewModel.resetPassword(
                                email = email.trim(),
                                code = code,
                                newPassword = newPassword,
                                onSuccess = { step = ResetStep.Done },
                            )
                        },
                    )
                    TextButton(
                        onClick = {
                            code = ""
                            viewModel.forgotPassword(email.trim())
                        },
                        modifier = Modifier.align(Alignment.CenterHorizontally),
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

                ResetStep.Done -> {
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
