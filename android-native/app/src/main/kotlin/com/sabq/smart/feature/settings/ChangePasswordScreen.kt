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
import androidx.compose.material.icons.filled.LockReset
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.sabq.smart.ui.theme.SabqTheme
import kotlinx.coroutines.delay

/**
 * Change password sheet — ports
 * `SettingsView.swift:2408-2550`. Three secure fields + validation +
 * success banner that auto-dismisses after 1.5s.
 */
@Composable
fun ChangePasswordScreen(
    onBack: () -> Unit,
    viewModel: AccountActionViewModel = hiltViewModel(),
) {
    LaunchedEffect(Unit) { viewModel.reset() }
    val state by viewModel.state.collectAsStateWithLifecycle()
    var current by remember { mutableStateOf("") }
    var fresh by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }

    val mismatched = fresh.isNotEmpty() && confirm.isNotEmpty() && fresh != confirm
    val valid = current.isNotEmpty() && fresh.length >= 6 && fresh == confirm

    LaunchedEffect(state.success) {
        if (state.success) {
            delay(1500)
            onBack()
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
                    imageVector = Icons.Filled.LockReset,
                    contentDescription = null,
                    tint = SabqTheme.colors.primaryEnd,
                    modifier = Modifier.size(48.dp),
                )
                Text(
                    text = "تغيير كلمة المرور",
                    style = SabqTheme.typography.cardTitle.copy(
                        fontSize = 22.sp,
                        fontWeight = FontWeight.Bold,
                        color = SabqTheme.colors.ink,
                    ),
                )
            }

            if (state.success) {
                SuccessBanner(message = "تم تغيير كلمة المرور بنجاح")
            } else {
                SheetField(
                    label = "كلمة المرور الحالية",
                    value = current,
                    onValueChange = { current = it },
                    placeholder = "أدخل كلمة المرور الحالية",
                    isSecure = true,
                )
                SheetField(
                    label = "كلمة المرور الجديدة",
                    value = fresh,
                    onValueChange = { fresh = it },
                    placeholder = "6 أحرف على الأقل",
                    isSecure = true,
                )
                SheetField(
                    label = "تأكيد كلمة المرور",
                    value = confirm,
                    onValueChange = { confirm = it },
                    placeholder = "أعد إدخال كلمة المرور الجديدة",
                    isSecure = true,
                )
                if (mismatched) {
                    Text(
                        text = "كلمتا المرور غير متطابقتين",
                        style = SabqTheme.typography.metaSmall.copy(
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Medium,
                            color = SabqTheme.colors.coral,
                        ),
                    )
                }
                state.errorMessage?.let { ErrorBanner(message = it) }
                PrimaryGradientButton(
                    title = "تغيير كلمة المرور",
                    isLoading = state.isLoading,
                    enabled = valid,
                    onClick = { viewModel.changePassword(current, fresh) },
                )
            }
        }
    }
}
