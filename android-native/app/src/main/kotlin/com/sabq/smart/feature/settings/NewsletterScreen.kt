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
import androidx.compose.material.icons.filled.MarkEmailRead
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
import com.sabq.smart.feature.auth.AuthViewModel
import com.sabq.smart.ui.theme.SabqTheme

/**
 * Newsletter subscription sheet. Mirrors iOS `NewsletterSheet`
 * (`SettingsView.swift:1605+`). One-screen flow: pre-fill the email
 * from the signed-in user, accept first-name override, send through
 * the `/api/v1/newsletter/subscribe` pipeline.
 */
@Composable
fun NewsletterScreen(
    onBack: () -> Unit,
    viewModel: AccountActionViewModel = hiltViewModel(),
    authViewModel: AuthViewModel = hiltViewModel(),
) {
    LaunchedEffect(Unit) { viewModel.reset() }
    val state by viewModel.state.collectAsStateWithLifecycle()
    val user by authViewModel.currentUser.collectAsStateWithLifecycle()

    var email by remember(user?.id) { mutableStateOf(user?.email.orEmpty()) }
    var firstName by remember(user?.id) { mutableStateOf(user?.firstName.orEmpty()) }
    val valid = email.contains('@') && email.length >= 5

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(SabqTheme.colors.background),
    ) {
        SheetTopBar(title = "النشرة البريدية", onClose = onBack)
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
                    imageVector = Icons.Filled.MarkEmailRead,
                    contentDescription = null,
                    tint = SabqTheme.colors.teal,
                    modifier = Modifier.size(48.dp),
                )
                Text(
                    text = "اشترك في نشرة سبق",
                    style = SabqTheme.typography.cardTitle.copy(
                        fontSize = 22.sp,
                        fontWeight = FontWeight.Bold,
                        color = SabqTheme.colors.ink,
                    ),
                )
                Text(
                    text = "ملخص الأخبار اليومي يصلك مباشرة إلى بريدك بدقة وذكاء.",
                    style = SabqTheme.typography.metaSmall.copy(
                        fontSize = 13.sp,
                        color = SabqTheme.colors.secondaryInk,
                    ),
                )
            }

            when {
                state.success -> SuccessBanner(message = "تم تأكيد اشتراكك")
                state.alreadySubscribed -> SuccessBanner(message = "هذا البريد مشترك مسبقاً")
                else -> {
                    SheetField(
                        label = "الاسم الأول (اختياري)",
                        value = firstName,
                        onValueChange = { firstName = it },
                        placeholder = "اسمك",
                    )
                    SheetField(
                        label = "البريد الإلكتروني",
                        value = email,
                        onValueChange = { email = it },
                        placeholder = "name@example.com",
                        keyboardType = KeyboardType.Email,
                    )
                    state.errorMessage?.let { ErrorBanner(message = it) }
                    PrimaryGradientButton(
                        title = "اشترك الآن",
                        isLoading = state.isLoading,
                        enabled = valid,
                        onClick = {
                            viewModel.subscribeNewsletter(
                                email = email.trim(),
                                firstName = firstName.trim().takeIf { it.isNotEmpty() },
                            )
                        },
                    )
                }
            }
        }
    }
}
