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
import androidx.compose.material.icons.filled.MailOutline
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.sabq.smart.ui.theme.SabqTheme

/**
 * Forgot password sheet — first step only (request email link).
 * Mirrors iOS `ForgotPasswordSheet` (`SettingsView.swift:2726+`).
 * The full reset-with-code flow lands once the backend supports
 * deep-link redirects on Android.
 */
@Composable
fun ForgotPasswordScreen(
    onBack: () -> Unit,
    viewModel: AccountActionViewModel = hiltViewModel(),
) {
    LaunchedEffect(Unit) { viewModel.reset() }
    val state by viewModel.state.collectAsStateWithLifecycle()
    var email by remember { mutableStateOf("") }
    val valid = email.contains('@') && email.length >= 5

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
                    imageVector = Icons.Filled.MailOutline,
                    contentDescription = null,
                    tint = SabqTheme.colors.primaryEnd,
                    modifier = Modifier.size(48.dp),
                )
                Text(
                    text = "نسيت كلمة المرور؟",
                    style = SabqTheme.typography.cardTitle.copy(
                        fontSize = 22.sp,
                        fontWeight = FontWeight.Bold,
                        color = SabqTheme.colors.ink,
                    ),
                )
                Text(
                    text = "أدخل بريدك الإلكتروني وسنرسل لك رابط إعادة تعيين كلمة المرور.",
                    style = SabqTheme.typography.metaSmall.copy(
                        fontSize = 13.sp,
                        color = SabqTheme.colors.secondaryInk,
                    ),
                )
            }

            if (state.success) {
                SuccessBanner(message = "تم إرسال رابط إعادة التعيين إلى بريدك")
            } else {
                SheetField(
                    label = "البريد الإلكتروني",
                    value = email,
                    onValueChange = { email = it },
                    placeholder = "name@example.com",
                    keyboardType = KeyboardType.Email,
                )
                state.errorMessage?.let { ErrorBanner(message = it) }
                PrimaryGradientButton(
                    title = "إرسال الرابط",
                    isLoading = state.isLoading,
                    enabled = valid,
                    onClick = { viewModel.forgotPassword(email.trim()) },
                )
            }
        }
    }
}
